# Hours: recording a build session's time in the artifact

Used by every session that a NOVARC build runs: the orchestrator (`orquestrar`), the set session (`conjunto` and
`novarc-session-end`) and each linked spec session. The artifact's "Horas ativas" page reads the `horas` collection;
nothing else fills it for build work, so a session that skips this leaves its phase at 0 h.

## What each session records

Only its **own** Claude Code session (`$CLAUDE_CODE_SESSION_ID`), never another session's. A fork is a subagent of the
set session, so its time is already inside the set session's execution hours; forks never call `ArtifactData`.

The script ships in the `scripts/` folder of the NOVARC planning skill, next to this one under `<skills>`:

```bash
H="$(find <skills> -path '*/scripts/horas-ativas.mjs' | head -1)"
node "$H" --session "$CLAUDE_CODE_SESSION_ID" --execucao
node "$H" --session "$CLAUDE_CODE_SESSION_ID"
```

The first prints execution hours (Claude's work time, subagents summed), the second active hours (Willian's
attention, from his typed prompts). Record both, every time. Active hours count only what Willian typed in the composer,
mid-turn messages included; what the harness delivers (cross-session messages, task notifications, system reminders,
side-session events, subagent hand-backs) never counts, so a spec session he never typed in prints no day for active
hours. Both print `{sessao, transcript, dias: [{data, minutos, ...}]}`; each `--execucao` day also carries `tokens`
(`{entrada, saida, cacheCriacao, cacheLeitura, total}`: the four `message.usage` counters of the session and its
subagents, each API response counted once; `total` is their sum, mostly cache reads). Skip a day whose `minutos` is
0 or that is absent.

## Documents

One document per session per São Paulo day, so a rerun replaces the day's number and never duplicates it:

| Kind | Doc id | Fields |
|---|---|---|
| execution | `horas/<first 8 chars of sessao>-<data>-exec` | `{data, minutos, tipo: "execucao", tokens, fase, pessoa, branch, sessao, transcript, resumo}` |
| active | `horas/<first 8 chars of sessao>-<data>` | `{data, minutos, fase, pessoa, branch, sessao, transcript, resumo}` |

- `sessao`: the FULL session id the script prints (never a label): the page shows it copiable, and it is the jsonl's
  name. `transcript`: the script's `transcript` (`~/.claude/projects/<dir>/<id>.jsonl`). `tokens`: the day's entry.
  The page groups both kinds by `sessao` into one row per session (active, execution and tokens side by side);
  documents written before 2026-10-26 have no `tokens`/`transcript` and show `-` there.
- `fase`: the set's `fase` in plano.json (`conjuntos[].fase`). The orchestrator spans every phase: `null`.
- `pessoa`: `"Willian"` (the owner of the session that generated the hours).
- `branch`: the spec branch for a spec session, `null` for the set session and the orchestrator.
- `resumo` (pt-BR): `"Build <C>-<S> (novarc-session-build)"` for a spec session, `"Build <C> (novarc-session-build)"`
  for the set session, `"Fechamento <C> (novarc-session-end)"` when written from session-end, `"Orquestração
  (novarc-session-build orquestrar)"` for the orchestrator.

`get` each id first. Missing: `set` with no `if_version` (creation). Existing (a rerun the same day): pinned `update`
with `if_version` = the version read and `data` = all the fields above — never a `set` over an existing document
(invariant 3). Batch the day's writes in one `batch` call. A version conflict means this session raced itself:
re-read once and redo; any other failure is reported in the session's next report, never retried in a loop.

## When

Rerun at each moment below; the same-day ids make every rerun a replacement.

| Session | Record at |
|---|---|
| linked spec session | each `branch-publicada` and right before its `DONE` (it is archived after the close-out, so this is its last chance) |
| set session | each `CONJUNTO <C> <etapa>` it sends, and in the step-06 close-out report |
| set session in `novarc-session-end` | write-back, after the merge milestones (the final number for the set) |
| orchestrator | each user-facing report (`orquestrar.md` §7) and whenever a set concludes |

## Ownership

`horas/<sessao8>-*` documents are written only by the session whose id starts with that `sessao8`. This keeps
invariant 1 (one writer per field) for the `horas` collection: no session ever writes or corrects another session's
hours.
