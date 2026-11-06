import { describe, it } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSession, toIntervals, unionMs, measure, measureBranch, forkSpans, encodeDir, underRoot, localDate, loadSessions, registryLabel, perDay, findSession, execIntervals, execPerDay } from "../horas-ativas.mjs";

// The original suite ran on vitest; this repo runs node:test, so a five-matcher shim keeps it verbatim.
const expect = (x) => ({
  toBe: (y) => assert.strictEqual(x, y),
  toEqual: (y) => assert.deepStrictEqual(x, y),
  toHaveLength: (n) => assert.strictEqual(x.length, n),
  toBeNull: () => assert.strictEqual(x, null),
  toBeCloseTo: (y) => assert.ok(Math.abs(x - y) < 0.005, `${x} ≉ ${y}`),
});

// Synthetic lines only: real session logs carry prompts and must never land in the repo.
const ROOT = "C:/dev/Projects/Projeto Exemplo";
const T0 = Date.parse("2026-09-23T12:00:00Z");
const at = (min) => new Date(T0 + min * 60_000).toISOString();
const human = (min, extra = {}) => ({ type: "user", origin: { kind: "human" }, timestamp: at(min), message: { content: "oi" }, ...extra });
const tool = (min) => ({ type: "user", timestamp: at(min), toolUseResult: {}, message: { content: [{ type: "tool_result" }] } });
const enqueue = (min, content = "oi") => ({ type: "queue-operation", operation: "enqueue", timestamp: at(min), ...(content === null ? {} : { content }) });
const jsonl = (...lines) => lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
const loc = { cwd: ROOT, gitBranch: "feat/1-x-20260923" };
const minutes = (ms) => ms / 60_000;

describe("active-hours", () => {
  it("joins signals <= 15 min apart and closes a lone signal with 5 min", () => {
    const text = jsonl(human(0, loc), human(10, loc), human(40, loc));
    // 0→10 continuous (10) + 10 closes (5, next is 30 min away) + 40 closes (5)
    expect(minutes(unionMs(toIntervals(parseSession(text))))).toBe(20);
  });

  it("human mode ignores tool results, literal mode counts them", () => {
    const text = jsonl(human(0, loc), tool(5), tool(12), tool(19), tool(26), human(30, loc));
    expect(minutes(unionMs(toIntervals(parseSession(text))))).toBe(10);
    expect(minutes(unionMs(toIntervals(parseSession(text, { mode: "literal" }))))).toBe(35);
  });

  it("counts a mid-turn message and inherits cwd/branch from earlier lines", () => {
    const text = jsonl(human(0, loc), enqueue(12), human(24, loc));
    const s = parseSession(text);
    expect(s.map((x) => x.branch)).toEqual(Array(3).fill("feat/1-x-20260923"));
    expect(minutes(unionMs(toIntervals(s)))).toBe(29);
  });

  it("counts only what was typed: injected messages, notifications and reminders never count", () => {
    const sr = "<system-reminder>\nLinked sessions now: x\n</system-reminder>\n";
    const text = jsonl(
      human(0, loc), // real prompt
      { type: "user", origin: { kind: "peer" }, timestamp: at(20), message: { content: '<cross-session-message from="local_x">\nCONJUNTO C02 build\n</cross-session-message>' } },
      { type: "user", timestamp: at(40), message: { content: `${sr}<side-sessions-event>None of the sessions</side-sessions-event>` } },
      { type: "user", origin: { kind: "human" }, timestamp: at(60), message: { content: sr } }, // reminder only, nothing typed
      { type: "user", origin: { kind: "task-notification" }, timestamp: at(80), message: { content: "<task-notification>\n<task-id>b1</task-id>" } },
      enqueue(100, "<task-notification>\n<task-id>b2</task-id>"),
      enqueue(120, '<agent-message from="a1">\n[Subagent hand-back]'),
      enqueue(140, null), // current logs: no content, delivered later with its own origin
      { type: "attachment", timestamp: at(160), attachment: { type: "queued_command", origin: { kind: "peer" }, prompt: '<cross-session-message from="local_y">' } },
      human(180, { message: { content: [{ type: "text", text: sr }, { type: "text", text: "C4 pode ser em paralelo?" }] } }), // reminder + typed text
      human(200, { message: { content: "<command-message>novarc:novarc-session-build</command-message>" } }), // typed slash command
      { type: "attachment", timestamp: at(220), attachment: { type: "queued_command", origin: { kind: "human" }, prompt: "Pode fazer commit" } }, // mid-turn
    );
    expect(parseSession(text).map((s) => (s.t - T0) / 60_000)).toEqual([0, 180, 200, 220]);
    expect(parseSession(text, { mode: "literal" })).toHaveLength(7);
  });

  it("skips sidechains and malformed lines", () => {
    const text = jsonl(human(0, loc), "{not json", human(3, { ...loc, isSidechain: true }));
    expect(parseSession(text)).toHaveLength(1);
  });

  it("unions concurrent sessions instead of summing them", () => {
    const a = { file: "a", text: jsonl(human(0, loc), human(10, loc)) };
    const b = { file: "b", text: jsonl(human(5, { ...loc, gitBranch: "fix/2-y-20260923" }), human(12, { ...loc, gitBranch: "fix/2-y-20260923" })) };
    const r = measure([a, b], { root: ROOT });
    expect(minutes(r.sum)).toBe(15 + 12);
    expect(minutes(r.union)).toBe(17); // 0 → 17
    expect(minutes(r.overlap)).toBe(10);
  });

  it("keeps only sessions under the repo root, worktrees included, unless labelled", () => {
    const wt = { cwd: `${ROOT}/.claude/worktrees/x`, gitBranch: "feat/1-x-20260923" };
    const other = { cwd: "C:/dev/Projects/Chief of Life", gitBranch: "main" };
    const sessions = [
      { file: "wt", text: jsonl(human(0, wt)) },
      { file: "other", text: jsonl(human(0, other)) },
      { file: "planning", text: jsonl(human(100, other)), label: "f0-planejamento" },
    ];
    const r = measure(sessions, { root: ROOT });
    expect(r.rows.map((x) => x.branch).sort()).toEqual(["f0-planejamento", "feat/1-x-20260923"]);
  });

  it("--branch keeps only that branch, its union included", () => {
    const a = { file: "a", text: jsonl(human(0, loc), human(10, loc)) };
    const b = { file: "b", text: jsonl(human(5, { ...loc, gitBranch: "fix/2-y-20260923" })) };
    const r = measure([a, b], { root: ROOT, branch: "feat/1-x-20260923" });
    expect(r.rows.map((x) => x.branch)).toEqual(["feat/1-x-20260923"]);
    expect(minutes(r.union)).toBe(15);
  });

  it("splits an orchestrator's time across its fork worktrees by how long each fork ran", () => {
    const main = { cwd: ROOT, gitBranch: "main" };
    const wt = (k, start, end) => ({ cwd: `${ROOT}/.claude/worktrees/${k}`, start: T0 + start * 60_000, end: T0 + end * 60_000 });
    const orchestrator = {
      file: "orq",
      text: jsonl(human(0, main), human(10, main), human(20, main)), // 25 min
      forks: [wt("a-20260923", 0, 30), wt("b-20260923", 0, 10)], // 75% / 25%
    };
    const direct = { file: "d", text: jsonl(human(100, { cwd: `${ROOT}/.claude/worktrees/a-20260923`, gitBranch: "feat/a-20260923" })) };
    const a = measureBranch([orchestrator, direct], { root: ROOT, branch: "feat/a-20260923" });
    expect(minutes(a.direct)).toBe(5);
    expect(a.shares[0].weight).toBe(0.75);
    expect(minutes(a.total)).toBeCloseTo(5 + 25 * 0.75);
    const b = measureBranch([orchestrator, direct], { root: ROOT, branch: "fix/b-20260923" });
    expect(minutes(b.total)).toBeCloseTo(25 * 0.25);
  });

  it("maps a session-build fork that logged the repo root as cwd to its branch via `spec <slug>`", () => {
    const main = { cwd: ROOT, gitBranch: "main" };
    const dir = mkdtempSync(join(tmpdir(), "ah-forks-"));
    mkdirSync(join(dir, "subagents"));
    const fork = (id, slug, end) => {
      writeFileSync(join(dir, "subagents", `${id}.jsonl`), jsonl({ type: "user", cwd: ROOT, timestamp: at(0) }, { type: "assistant", timestamp: at(end) }));
      writeFileSync(join(dir, "subagents", `${id}.meta.json`), JSON.stringify({ agentType: "fork", description: `spec ${slug}` }));
    };
    fork("agent-a", "f0-a", 30);
    fork("agent-b", "f0-a-b", 10); // a slug that merely starts with "f0-a" must not match
    const orchestrator = { file: "orq", text: jsonl(human(0, main), human(10, main), human(20, main)), dir }; // 25 min
    const a = measureBranch([orchestrator], { root: ROOT, branch: "feat/f0-a-20260923" });
    expect(a.shares[0].weight).toBe(0.75);
    expect(minutes(a.total)).toBeCloseTo(25 * 0.75);
    const b = measureBranch([orchestrator], { root: ROOT, branch: "feat/f0-a-b-20260923-1530" });
    expect(minutes(b.total)).toBeCloseTo(25 * 0.25);
  });

  it("an inline build session with subagents in its own worktree is counted once, not twice", () => {
    const here = { cwd: `${ROOT}/.claude/worktrees/a-20260923`, gitBranch: "feat/a-20260923" };
    const s = { file: "inline", text: jsonl(human(0, here), human(10, here)), forks: [{ ...here, start: T0, end: T0 + 600_000 }] };
    const r = measureBranch([s], { root: ROOT, branch: "feat/a-20260923" });
    expect(minutes(r.total)).toBe(15);
  });

  it("reads a fork's cwd and span from the head and tail of its log", () => {
    const text = jsonl({ type: "user", cwd: `${ROOT}/.claude/worktrees/a`, timestamp: at(0) }, "{bad", { type: "assistant", timestamp: at(42) });
    const f = forkSpans(text);
    expect(minutes(f.end - f.start)).toBe(42);
    expect(forkSpans(jsonl({ type: "x" }))).toBeNull();
  });

  it("encodes a root the way Claude Code names its session dirs, worktrees included", () => {
    expect(encodeDir("C--dev-Projects-Projeto-Exemplo--claude-worktrees-x").startsWith(encodeDir(ROOT))).toBe(true);
  });

  it("brings registered out-of-repo sessions in whole, under their label, from any project dir", () => {
    const base = mkdtempSync(join(tmpdir(), "active-hours-"));
    const root = join(base, "repo"), projects = join(base, "projects");
    mkdirSync(join(root, "docs", "hours"), { recursive: true });
    mkdirSync(join(projects, "vault"), { recursive: true });
    writeFileSync(join(projects, "vault", "s1.jsonl"), jsonl(human(0, { cwd: "C:/vault", gitBranch: "main" }), human(10, { cwd: "C:/vault", gitBranch: "main" })));
    writeFileSync(join(root, "docs", "hours", "sessions.json"), JSON.stringify([
      { session: "s1", label: "planejamento-f0", issue: 7 },
      { session: "gone", label: "outra-maquina", issue: null },
    ]));
    const sessions = loadSessions({ projects, root });
    expect(sessions.map((x) => x.label)).toEqual(["planejamento-f0 #7"]);
    const r = measure(sessions, { root });
    expect(r.rows).toEqual([{ branch: "planejamento-f0 #7", ms: 15 * 60_000, days: ["2026-09-23"] }]);
    expect(registryLabel({ label: "x", issue: null })).toBe("x");
  });

  it("clips to the São Paulo day window", () => {
    const text = jsonl(human(0, loc), human(10, loc));
    const r = measure([{ file: "a", text }], { root: ROOT, since: T0 + 5 * 60_000 });
    expect(minutes(r.union)).toBe(10);
  });

  it("matches paths case- and slash-insensitively and dates in UTC-3", () => {
    expect(underRoot("c:\\dev\\projects\\projeto exemplo\\src", ROOT)).toBe(true);
    expect(underRoot("C:/dev/Projects/Projeto Exemplo2", ROOT)).toBe(false);
    expect(localDate(Date.parse("2026-10-01T02:00:00Z"))).toBe("2026-09-30");
  });

  it("--session: one whole session per São Paulo day, any cwd, found by id in any project dir", () => {
    const other = { cwd: "C:/vault", gitBranch: "main" };
    // 0→10 (15 min) on 2026-09-23 local; +15h (03:00Z next day = 00:00 local) closes alone (5 min) on 2026-09-24
    const text = jsonl(human(0, other), human(10, other), tool(12), human(15 * 60, other));
    expect(perDay(text)).toEqual([{ data: "2026-09-23", minutos: 15 }, { data: "2026-09-24", minutos: 5 }]);
    const projects = mkdtempSync(join(tmpdir(), "horas-sessao-"));
    mkdirSync(join(projects, "vault"));
    writeFileSync(join(projects, "vault", "abc.jsonl"), text);
    expect(findSession("abc", projects)).toBe(join(projects, "vault", "abc.jsonl"));
    assert.throws(() => findSession("nada", projects), /não encontrada/);
  });
});

describe("execution-hours", () => {
  const asst = (min, stop, extra = {}) => ({ type: "assistant", timestamp: at(min), message: { stop_reason: stop, content: [] }, ...extra });
  it("counts the time inside a turn and nothing between turns", () => {
    // prompt 0 → tool 2 → result 6 → end 7; idle until the next prompt at 30 → end 31
    const text = jsonl(human(0), asst(2, "tool_use"), tool(6), asst(7, "end_turn"), human(30), asst(31, "end_turn"));
    expect(minutes(unionMs(execIntervals(text)))).toBe(8);
  });
  it("caps a long gap inside a turn at 10 min", () => {
    const text = jsonl(human(0), asst(1, "tool_use"), tool(61), asst(62, "end_turn"));
    expect(minutes(unionMs(execIntervals(text)))).toBe(1 + 10 + 1);
  });
  it("sums subagents with the main thread and keeps the wall time apart", () => {
    const main = jsonl(human(0), asst(4, "end_turn"));
    const sub = jsonl(human(1, { isSidechain: true }), asst(5, "end_turn", { isSidechain: true }));
    const [d] = execPerDay(main, [sub]);
    expect([d.principal, d.subagentes, d.minutos, d.uniao]).toEqual([4, 4, 8, 5]);
  });

  it("sums tokens of main thread and subagents, one API response counted once", () => {
    const usage = { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 };
    const reply = (min, id, extra = {}) => ({ type: "assistant", timestamp: at(min), message: { id, stop_reason: "end_turn", content: [], usage }, ...extra });
    // m1 is logged twice (two content blocks of one response), as real logs do.
    const main = jsonl(human(0), reply(1, "m1"), reply(1, "m1"), human(2), reply(3, "m2"));
    const sub = jsonl(human(1, { isSidechain: true }), reply(2, "s1", { isSidechain: true }));
    const [d] = execPerDay(main, [sub]);
    expect(d.tokens).toEqual({ entrada: 30, saida: 60, cacheCriacao: 90, cacheLeitura: 120, total: 300 });
  });
});
