// Active hours — the user's attention time per branch or per session, read from Claude Code session logs.
//
// NOVARC estimates and reports active hours: time the person who conducts spends on a task (prompt, diff review,
// browser test, call), never an agent running on its own. Claude Code already writes every
// session to ~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl with a timestamp and gitBranch
// on each turn, so the evidence exists without a timesheet. The measured number is EVIDENCE,
// shown beside the declared hours, never a replacement for them.
//
// Ported unchanged from the first client project that used it; only `--session` (one session,
// per São Paulo day, for the planning artifact's `horas` collection) is new.
//
// Rule (contract numbers, not knobs — change them only before a proposal, never after):
//   - a signal is a human act: a typed prompt, or a message sent mid-turn (--mode human);
//     what the harness injects (cross-session and subagent messages, task notifications,
//     system reminders, side-session events) never counts, even on a `type: user` line;
//     --mode literal counts every main-thread `type: user` line, tool results included
//   - consecutive signals of one session <= 15 min apart are continuous work
//   - a signal with no follower inside 15 min closes with a fixed 5 min (reading the answer)
//   - concurrent sessions are unioned, never summed: per-branch totals are what each PR
//     declares, the global union is what the monthly report bills
//
// Sessions opened in a worktree live under a different encoded dir, and a session opened
// outside the repo (a planning session in another vault) carries the wrong cwd and branch.
// So: every dir is scanned and filtered by the cwd recorded on each line, and a session
// outside the repo is brought in explicitly with --include <file.jsonl>[=<label>].

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const MIN = 60_000;
export const GAP_MS = 15 * MIN;
export const CLOSE_MS = 5 * MIN;
// Brazil has had no DST since 2019, so São Paulo is a fixed UTC-3.
const TZ_OFFSET = "-03:00";

const norm = (p) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

/** True when `cwd` is the repo root or anything below it (worktrees included). */
export function underRoot(cwd, root) {
  if (!cwd) return false;
  const c = norm(cwd), r = norm(root);
  return c === r || c.startsWith(r + "/");
}

// Wrappers the harness prepends to a typed message (stripped), and deliveries that are never typed.
const WRAPPER = /<(system-reminder|artifact-view-context)\b[^>]*>[\s\S]*?<\/\1>/g;
const INJECTED = /^<(cross-session-message|task-notification|side-sessions-event|agent-message|ci-monitor-event)\b/;

/** Message content → what the person typed, or "" when nothing was (injected, or wrappers only). */
export function typedText(content) {
  const raw = typeof content === "string" ? content
    : Array.isArray(content) ? content.map((b) => (b?.type === "text" ? b.text : b?.type === "image" ? "[image]" : "")).join("\n")
    : "";
  const t = raw.replace(WRAPPER, "").trim();
  return INJECTED.test(t) ? "" : t;
}

function isHumanPrompt(e) {
  if (e.type !== "user" || e.toolUseResult || e.origin?.kind !== "human") return false;
  const c = e.message?.content;
  if (Array.isArray(c) && c.some((b) => b?.type === "tool_result")) return false;
  return typedText(c) !== "";
}

/**
 * A message sent mid-turn. Older logs carry its text on the enqueue; current ones enqueue with no
 * content and log it on delivery: a `queued_command` attachment (merged into the running turn) or a
 * `type: user` line (next turn). A content-less enqueue is skipped, so a message delivered at the
 * turn's end is stamped then, not when typed (ponytail: pair enqueue/dequeue if that gap matters).
 */
function isMidTurnMessage(e) {
  if (e.type === "queue-operation") return e.operation === "enqueue" && typedText(e.content) !== "";
  const a = e.type === "attachment" && e.attachment;
  return a?.type === "queued_command" && a.origin?.kind === "human" && typedText(a.prompt) !== "";
}

/**
 * One jsonl file → human (or literal) signals. Lines without cwd/gitBranch (the queue
 * operations of a mid-turn message) inherit the last ones seen in the same file.
 * Malformed lines exist in real logs and are skipped.
 */
export function parseSession(text, { mode = "human", accept = () => true } = {}) {
  const signals = [];
  let cwd, branch;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.cwd) cwd = e.cwd;
    if (e.gitBranch) branch = e.gitBranch;
    if (e.isSidechain) continue;
    const hit = mode === "literal"
      ? e.type === "user"
      : isHumanPrompt(e) || isMidTurnMessage(e);
    if (!hit || !e.timestamp || !accept(cwd)) continue;
    signals.push({ t: Date.parse(e.timestamp), branch: branch ?? "(sem branch)" });
  }
  return signals.sort((a, b) => a.t - b.t);
}

/** Signals of ONE session → [start, end] intervals under the 15/5 rule. */
export function toIntervals(signals) {
  return signals.map((s, i) => {
    const next = signals[i + 1];
    const end = next && next.t - s.t <= GAP_MS ? next.t : s.t + CLOSE_MS;
    return { start: s.t, end, branch: s.branch };
  });
}

/** Overlapping or touching intervals merged; returns total ms. */
export function unionMs(intervals) {
  const xs = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0, cur = null;
  for (const x of xs) {
    if (cur && x.start <= cur.end) cur.end = Math.max(cur.end, x.end);
    else { if (cur) total += cur.end - cur.start; cur = { ...x }; }
  }
  return cur ? total + cur.end - cur.start : total;
}

function clip(intervals, since, until) {
  return intervals
    .map((x) => ({ ...x, start: Math.max(x.start, since ?? -Infinity), end: Math.min(x.end, until ?? Infinity) }))
    .filter((x) => x.end > x.start);
}

/** All sessions → report. `sessions` = [{ file, text, label? }]. */
export function measure(sessions, { root, mode = "human", since, until, branch } = {}) {
  let all = [];
  for (const s of sessions) {
    const accept = s.label ? () => true : (cwd) => underRoot(cwd, root);
    let iv = toIntervals(parseSession(s.text, { mode, accept }));
    if (s.label) iv = iv.map((x) => ({ ...x, branch: s.label }));
    all.push(...clip(iv, since, until));
  }
  if (branch) all = all.filter((x) => x.branch === branch);
  const byBranch = new Map();
  for (const x of all) byBranch.set(x.branch, [...(byBranch.get(x.branch) ?? []), x]);
  const rows = [...byBranch].map(([branch, iv]) => ({
    branch,
    ms: unionMs(iv),
    days: [...new Set(iv.map((x) => localDate(x.start)))].sort(),
  })).sort((a, b) => b.ms - a.ms);
  const sum = rows.reduce((n, r) => n + r.ms, 0);
  const union = unionMs(all);
  return { rows, sum, union, overlap: sum - union };
}

export function localDate(ms) {
  return new Date(ms - 3 * 60 * MIN).toISOString().slice(0, 10);
}

export function describeBranch(b) {
  const parts = [`direto ${hm(b.direct)}`];
  for (const x of b.shares) parts.push(`orquestração ${hm(x.orchestration)} × ${Math.round(x.weight * 100)}% (${x.worktrees} worktrees)`);
  return parts.join(" + ");
}

/**
 * ONE whole session (any cwd, any branch) → [{ data, minutos }] per São Paulo day, for one
 * `horas` document per session-day in the planning artifact. An interval counts on the day it
 * starts (ponytail: a block crossing midnight is not split; split at midnight if that matters).
 */
export function perDay(text, { mode = "human", since, until } = {}) {
  const iv = clip(toIntervals(parseSession(text, { mode })), since, until);
  const byDay = new Map();
  for (const x of iv) byDay.set(localDate(x.start), [...(byDay.get(localDate(x.start)) ?? []), x]);
  return [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([data, xs]) => ({ data, minutos: Math.round(unionMs(xs) / MIN) }));
}

/**
 * Execution hours: how long Claude worked (model turns and the tools it ran), not the person.
 * Method: inside a turn (from a user line, prompt or tool result, to the assistant line whose
 * stop_reason is end_turn or stop_sequence) the time between consecutive user/assistant lines is
 * work; between turns the session waits for the person and nothing counts. Each gap is capped at
 * EXEC_GAP_MS, so a permission prompt left open or a long background wait counts at most that.
 * Limits: model and tool time are not told apart; an interrupted turn stays open until the next
 * user line (capped); time spent queued on the API counts as work.
 */
export const EXEC_GAP_MS = 10 * MIN;

export function execIntervals(text, { sidechain = false } = {}) {
  const iv = [];
  let prev = null, open = false;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if ((e.type !== "user" && e.type !== "assistant") || !e.timestamp) continue;
    if (e.isSidechain && !sidechain) continue;
    const t = Date.parse(e.timestamp);
    if (open && prev !== null && t > prev) iv.push({ start: prev, end: Math.min(t, prev + EXEC_GAP_MS) });
    if (e.type === "user") open = true;
    else if (["end_turn", "stop_sequence"].includes(e.message?.stop_reason)) open = false;
    prev = t;
  }
  return iv;
}

/**
 * ONE session plus its subagents (<session>/subagents/*.jsonl: forks, ligadas spawned as agents)
 * → [{ data, minutos, principal, subagentes, uniao }] per São Paulo day. Subagents run alongside
 * the main thread, so minutos = principal + subagentes is the work done; uniao is the wall time.
 */
export function execPerDay(text, subagentTexts = [], { since, until } = {}) {
  const main = clip(execIntervals(text), since, until);
  const subs = subagentTexts.flatMap((t) => clip(execIntervals(t, { sidechain: true }), since, until));
  const days = new Map();
  const add = (x, k) => { const d = localDate(x.start); const o = days.get(d) ?? { principal: [], subagentes: [] }; o[k].push(x); days.set(d, o); };
  main.forEach((x) => add(x, "principal"));
  subs.forEach((x) => add(x, "subagentes"));
  const sumMs = (xs) => xs.reduce((n, x) => n + x.end - x.start, 0);
  const tokens = tokensPerDay([text, ...subagentTexts], { since, until });
  return [...days].sort(([a], [b]) => a.localeCompare(b)).map(([data, o]) => {
    const principal = Math.round(unionMs(o.principal) / MIN), subagentes = Math.round(sumMs(o.subagentes) / MIN);
    return { data, minutos: principal + subagentes, principal, subagentes, uniao: Math.round(unionMs([...o.principal, ...o.subagentes]) / MIN), tokens: tokens.get(data) ?? emptyTokens() };
  });
}

/**
 * Tokens the session spent: the four top-level `message.usage` counters of every assistant line, main thread and
 * subagents. One API response is logged as several lines (one per content block) repeating the same usage, so each
 * `message.id` counts once, on the São Paulo day of its first line. `total` adds all four; cacheLeitura (context
 * re-read from cache, billed at a fraction) dominates it, which is why the parts are kept.
 */
const emptyTokens = () => ({ entrada: 0, saida: 0, cacheCriacao: 0, cacheLeitura: 0, total: 0 });

export function tokensPerDay(texts, { since, until } = {}) {
  const seen = new Set(), days = new Map();
  for (const text of texts) for (const line of text.split("\n")) {
    if (!line.includes('"usage"')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const u = e.type === "assistant" && e.message?.usage;
    const id = e.message?.id ?? e.uuid;
    if (!u || !e.timestamp || seen.has(id)) continue;
    seen.add(id);
    const t = Date.parse(e.timestamp);
    if (t < (since ?? -Infinity) || t > (until ?? Infinity)) continue;
    const d = localDate(t), o = days.get(d) ?? emptyTokens();
    o.entrada += u.input_tokens ?? 0;
    o.saida += u.output_tokens ?? 0;
    o.cacheCriacao += u.cache_creation_input_tokens ?? 0;
    o.cacheLeitura += u.cache_read_input_tokens ?? 0;
    o.total = o.entrada + o.saida + o.cacheCriacao + o.cacheLeitura;
    days.set(d, o);
  }
  return days;
}

/** Session id or path → the jsonl file, searched in every project dir. */
export function findSession(idOrPath, projects = join(homedir(), ".claude", "projects")) {
  if (existsSync(idOrPath)) return resolve(idOrPath);
  for (const d of readdirSync(projects, { withFileTypes: true })) {
    const f = join(projects, d.name, `${idOrPath}.jsonl`);
    if (d.isDirectory() && existsSync(f)) return f;
  }
  throw new Error(`--session: ${idOrPath} não encontrada em ${projects}`);
}

/** The jsonl's place for a person reading the artifact: `~/.claude/projects/<dir>/<id>.jsonl`, `~` kept literal. */
export const transcriptPath = (file) => {
  const home = norm(homedir()), f = file.replace(/\\/g, "/");
  return f.toLowerCase().startsWith(home + "/") ? "~" + f.slice(home.length) : f;
};

export const hm = (ms) => {
  const m = Math.round(ms / MIN);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
};

export function repoRoot(cwd) {
  // The common dir is the primary checkout's .git even from inside a worktree.
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", cwd }).trim();
  return resolve(common, "..");
}

function parseArgs(argv) {
  const o = { mode: "human", include: [], json: false, execucao: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === "--mode") o.mode = v();
    else if (a === "--since") o.since = Date.parse(`${v()}T00:00:00${TZ_OFFSET}`);
    else if (a === "--until") o.until = Date.parse(`${v()}T23:59:59.999${TZ_OFFSET}`);
    else if (a === "--include") o.include.push(v());
    else if (a === "--root") o.root = v();
    else if (a === "--branch") o.branch = v();
    else if (a === "--projects") o.projects = v();
    else if (a === "--json") o.json = true;
    else if (a === "--session") o.session = v();
    else if (a === "--execucao") o.execucao = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!["human", "literal"].includes(o.mode)) throw new Error(`--mode must be human|literal`);
  return o;
}

/**
 * A session-build orchestrator runs on `main` in the primary checkout; each spec is built by a
 * fork, which Claude Code logs as a subagent under <session>/subagents/*.jsonl (isSidechain, and
 * gitBranch still "main" even though its cwd is the worktree). Will talks only to the orchestrator,
 * so that is where his time is, and the fork's worktree is the only link to a branch.
 * Returns [{ cwd, start, end }] — one span per subagent file.
 */
export function forkSpans(text) {
  // Subagent logs run to tens of MB: only the head (cwd, first timestamp) and the tail (last
  // timestamp) matter, so parse from both ends and stop early.
  const lines = text.split("\n");
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  let cwd, start, end;
  for (let i = 0; i < lines.length && !(cwd && start); i++) {
    const e = parse(lines[i]);
    cwd ??= e?.cwd;
    if (e?.timestamp) start ??= Date.parse(e.timestamp);
  }
  for (let i = lines.length - 1; i >= 0 && !end; i--) {
    const e = parse(lines[i]);
    if (e?.timestamp) end = Date.parse(e.timestamp);
  }
  return cwd && end > start ? { cwd, start, end } : null;
}

/** `spec <slug>` in the sibling `<agent>.meta.json` → slug; anything else → undefined. */
function specSlug(metaPath) {
  try { return JSON.parse(readFileSync(metaPath, "utf8")).description?.match(/^spec (\S+)$/)?.[1]; }
  catch { return undefined; }
}

function readForks(sessionDir) {
  const dir = join(sessionDir, "subagents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => {
    const span = forkSpans(readFileSync(join(dir, f), "utf8"));
    return span && { ...span, slug: specSlug(join(dir, f.replace(/\.jsonl$/, ".meta.json"))) };
  }).filter(Boolean);
}

/**
 * Which worktree a fork worked in. Its cwd when that is a worktree; otherwise (session-build
 * forks log the repo ROOT as cwd and work by absolute path) the `spec <slug>` of its meta:
 * the slug names the measured branch when its key is `<slug>-YYYYMMDD[-HHMM]`, and is its own
 * key otherwise, so the forks of other branches still weigh in the split.
 */
export function forkKey(fork, root, key) {
  const k = worktreeKey(fork.cwd, root);
  if (k || !fork.slug) return k;
  const date = key.startsWith(`${fork.slug}-`) ? key.slice(fork.slug.length + 1) : "";
  return /^\d{8}(-\d{4})?$/.test(date) ? key : fork.slug;
}

/** `<root>/.claude/worktrees/<key>/...` → key; anything else → null. */
export function worktreeKey(cwd, root) {
  if (!underRoot(cwd, root)) return null;
  const m = norm(cwd).slice(norm(root).length).match(/^\/\.claude\/worktrees\/([^/]+)/);
  return m?.[1] ?? null;
}

/** Branch `<type>/<slug>-<date>` → worktree dir `<slug>-<date>` (global naming convention). */
export const branchKey = (branch) => branch.replace(/^[^/]+\//, "").toLowerCase();

/**
 * Hours for ONE branch = time spent directly on it + a share of every orchestrator session that
 * forked into its worktree. The share is proportional to how long each fork ran, so the PRs of one
 * run add up to the run's total and a quick probe worktree takes a small slice.
 */
export function measureBranch(sessions, { root, branch, mode = "human", since, until } = {}) {
  const key = branchKey(branch);
  const direct = [], shares = [];
  for (const s of sessions) {
    const accept = s.label ? () => true : (cwd) => underRoot(cwd, root);
    const iv = clip(toIntervals(parseSession(s.text, { mode, accept })), since, until);
    if (!iv.length) continue; // not this repo: never touch its subagent logs
    const byKey = new Map();
    for (const f of s.forks ?? (s.dir ? readForks(s.dir) : [])) {
      const k = forkKey(f, root, key);
      if (k) byKey.set(k, [...(byKey.get(k) ?? []), f]);
    }
    if (byKey.has(key)) {
      const run = (k) => unionMs(byKey.get(k));
      const weight = run(key) / [...byKey.keys()].reduce((n, k) => n + run(k), 0);
      const orchestration = unionMs(iv);
      shares.push({ file: s.file, orchestration, weight, ms: orchestration * weight, worktrees: byKey.size });
    } else if (!s.label) {
      direct.push(...iv.filter((x) => x.branch === branch));
    }
  }
  const directMs = unionMs(direct);
  return { branch, direct: directMs, shares, total: directMs + shares.reduce((n, x) => n + x.ms, 0) };
}

/**
 * Claude Code names a session's dir after the cwd it started in, every non-alphanumeric char
 * turned into "-" — so the repo and all its worktrees (`<root>/.claude/worktrees/x`) share the
 * encoded root as a prefix. Reading only those dirs is what keeps the hook inside its timeout;
 * the per-line cwd filter still decides what counts. A session started elsewhere comes in by
 * --include.
 */
export const encodeDir = (p) => p.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

/**
 * Sessions outside the repo that count anyway — planning sessions, typically — are listed in
 * docs/hours/sessions.json of the primary checkout: [{ session, label, issue }]. They never go
 * into a PR (no branch to hang them on); they are their own line in the monthly report, billed
 * against a `tipo:gestao` issue once `issue` is filled. A registered session counts whole.
 */
export const REGISTRY = join("docs", "hours", "sessions.json");

export const registryLabel = (e) => (e.issue ? `${e.label} #${e.issue}` : e.label);

function registryIncludes(root, projects) {
  const path = join(root, REGISTRY);
  if (!existsSync(path)) return [];
  const entries = JSON.parse(readFileSync(path, "utf8"));
  const dirs = readdirSync(projects, { withFileTypes: true }).filter((d) => d.isDirectory());
  return entries.flatMap((e) => {
    const hit = dirs.map((d) => join(projects, d.name, `${e.session}.jsonl`)).find(existsSync);
    // The log may live on another of Will's machines: say so, don't fail the whole report.
    if (!hit) { console.error(`${REGISTRY}: sessão ${e.session} (${e.label}) não encontrada nesta máquina`); return []; }
    return [`${hit}=${registryLabel(e)}`];
  });
}

/** Reads the session logs of `root` (every project when root is absent), the registry, and explicit includes. */
export function loadSessions({ projects = join(homedir(), ".claude", "projects"), include = [], root } = {}) {
  const specs = [...(root ? registryIncludes(root, projects) : []), ...include];
  const included = new Map(specs.map((spec) => {
    const i = spec.lastIndexOf("=");
    const [file, label] = i > 2 ? [spec.slice(0, i), spec.slice(i + 1)] : [spec, undefined];
    if (!existsSync(file)) throw new Error(`--include: not found: ${file}`);
    return [resolve(file), label ?? basename(file, ".jsonl")];
  }));
  const sessions = [];
  for (const dir of readdirSync(projects, { withFileTypes: true })) {
    if (!dir.isDirectory() || (root && !encodeDir(dir.name).startsWith(encodeDir(root)))) continue;
    for (const f of readdirSync(join(projects, dir.name))) {
      const file = resolve(projects, dir.name, f);
      if (f.endsWith(".jsonl") && !included.has(file)) {
        sessions.push({ file, text: readFileSync(file, "utf8"), dir: file.slice(0, -".jsonl".length) });
      }
    }
  }
  for (const [file, label] of included) sessions.push({ file, text: readFileSync(file, "utf8"), label });
  return sessions;
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.session) {
    const file = findSession(o.session, o.projects);
    if (o.execucao) {
      const dir = join(file.slice(0, -".jsonl".length), "subagents");
      const subs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => readFileSync(join(dir, f), "utf8")) : [];
      const dias = execPerDay(readFileSync(file, "utf8"), subs, { since: o.since, until: o.until });
      return console.log(JSON.stringify({ sessao: basename(file, ".jsonl"), transcript: transcriptPath(file), tipo: "execucao", subagentes: subs.length, dias }, null, 2));
    }
    const dias = perDay(readFileSync(file, "utf8"), { mode: o.mode, since: o.since, until: o.until });
    return console.log(JSON.stringify({ sessao: basename(file, ".jsonl"), transcript: transcriptPath(file), dias }, null, 2));
  }
  const root = o.root ?? repoRoot();
  const sessions = loadSessions({ projects: o.projects, include: o.include, root });

  if (o.branch) {
    const b = measureBranch(sessions, { root, mode: o.mode, since: o.since, until: o.until, branch: o.branch });
    if (o.json) return console.log(JSON.stringify(b, null, 2));
    console.log(`${b.branch}: ${hm(b.total)} (${describeBranch(b)})`);
    return;
  }
  const r = measure(sessions, { root, mode: o.mode, since: o.since, until: o.until });
  if (o.json) return console.log(JSON.stringify(r, null, 2));
  console.log(`modo ${o.mode} · raiz ${root}\n`);
  console.log("| branch | horas | dias |\n|---|---:|---|");
  for (const x of r.rows) console.log(`| ${x.branch} | ${hm(x.ms)} | ${x.days.join(", ")} |`);
  console.log(`\nsoma por branch ${hm(r.sum)} · uniao global ${hm(r.union)} · sobreposicao ${hm(r.overlap)}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
