# Orquestrar: coordinate the set sessions

**Recap** (full text in `../SKILL.md`): this session writes ONLY `specs/{id}.validacao`; it never writes
`execucao/*`, never writes code, never builds. Set state is derived from `specs/{id}`. Messages to the user in pt-BR.

Input: `/novarc-session-build orquestrar <artifact url> [C01 C02 ...]` (no ids = every set of the plan).

Why this mode exists: each set session is its own session-build orchestrator, and the original has no arbitration
between runs (see `<skills>/novarc-session-build/core/steps/step-05-orchestrate.md` §5.3 and §5.7). This session is that
arbiter: a builder budget, one slot per kind at a time (`verify`, `producao`), visual validation, the signal that
closes a set, and telling the user what can start.

## 1. Name and ledger

1. `Artifact` read `plano.json`. The session name is `execucao.orquestrador`. Set it with
   `mcp__ccd_session_mgmt__set_session_title` when that tool exists, and state it in the first message. The set
   sessions address this name through `SendMessage`; when the first set session reports, that delivery is the proof
   the name resolves. If a set session gets "no agent named", give the user the `name [ref]` this session shows in
   that session's `ListAgents` and have the set prompt use it.
2. `RUN_ID` = `<YYYYMMDD-HHMM>`. Ledger dir (absolute, in the client repo main checkout):
   `<main checkout>/.superpowers/novarc-orq/<RUN_ID>/`.
   ```bash
   python <skills>/novarc-session-build/core/scripts/ledger.py init --dir <abs dir> --run-id <RUN_ID> --specs "<set ids>"
   ```
   Every entry goes through `ledger.py append --dir <abs dir> --type <TYPE> --text "<text>"`. ledger.py accepts only
   its known types, so: verify slot requests are `LOCK verify <branch>`, grants `GO <C> verify <branch>`, releases
   `RELEASE verify <branch>`, holds `HOLD <C> <reason>`; everything else is `NOTE` with the message line as text
   (`NOTE CONJUNTO ...`, `NOTE VALIDACAO ...`, `NOTE MARCO ...`, `NOTE LIBERA <C>`).

## 2. Read the graph and the database

1. From plano.json: `conjuntos[]` (`dependeDe`, `paraleloCom`, `ordem`, `prompt`) and `specs[]`.
2. `ArtifactData list` on `execucao` and on `specs` (page with `query.cursor` until done). Ignore documents whose id
   is not in plano.json.
3. Derive per set (rules in `../references/milestones.md`, "Derivation"): etapa, status, validated, concluded.
4. A set **can start** when it has no etapa yet, every `dependeDe` set is concluded (all its specs at `merge`), it has
   no `bloqueios`, and at least one of its specs has no open pending question (R1 rule: `resposta` non-empty and
   `situacao !== "parcial"`).
5. Show the user a pt-BR table: conjunto, título, etapa, status, validação, pode começar (sim / por quê não).

## 3. Dispatch rules (opening a set session)

Three ways, all with the set prompt (`conjuntos[].prompt`) **verbatim**; the only edit ever made is dropping the
`Fechamento:` line in way 1 when the user did not choose it (that line is the user's authorization):

1. **The user asks in this session** ("abre C01", "pode abrir C02 e C03"). The `Fechamento:` line authorizes an
   automatic close-out only when the user saw it and chose it, so: pass the prompt verbatim when the request asked
   for it ("abre C01 com fechamento") or answered yes after you quoted the line; otherwise pass it **without** the
   `Fechamento:` line (the close-out stays manual, the same effect as Willian deleting it from a pasted prompt), and
   say so in one line. Then open each with
   `mcp__ccd_session__start_session`, `initiation: "user_asked"`, `context: "fresh"`, `use_worktree: false` (a set
   session runs on the client repo's main checkout and opens its own spec sessions), `name: "novarc-<codigo>-<C>"`
   cut to 24 characters, `prompt` = the set prompt.
2. **A set becomes startable in a turn the user did not write** (a `CONJUNTO <C> merge` message): the app refuses a
   start there. Propose it with `initiation: "own_initiative"` and the full prompt; the card shows it, `Fechamento:`
   line included, so the click is the same act as pasting it. Never work around the refusal.
3. **The user pastes the prompt** into a new session themselves. Still valid.

The rules below decide **whether** a set may be offered, whichever way it opens.

- **Default serial.** Give one set prompt (`conjuntos[].prompt`, verbatim) at a time, in `ordem`.
- **`paraleloCom` is permission, not an instruction.** A second set may run alongside only when one lists the other
  in `paraleloCom`, neither depends on the other, and the builder budget allows it.
- **Builder budget, default 3, across all set sessions on this machine.** Live units = builders (linked spec
  sessions or forks) recorded in each running set's `<main checkout>/.superpowers/session-build/*/ledger.md` whose
  `fork-<slug>.md` has no `DONE` line, plus one per running N = 1 set session. Before offering a set, live units + its in-scope spec count (1 when N = 1) must not
  exceed the budget; otherwise say which set it waits for. The user may change the budget in this session.
- Before offering anything, measure the machine once (process count / load), as step-05 §5.4 duty 3 says. A loaded
  machine waits.

## 4. Slots (one per kind at a time)

Two kinds, each with its own queue:

- `verify`: the branch-level suite (it competes for the machine's cores).
- `producao`: **any write to the project's shared production surfaces**: applying a migration, deploying a function,
  merging into the default branch, and the post-merge redeploy. One kind for all of them, held across the whole
  sequence, because a migration, a pre-merge deploy and a post-merge redeploy from two sets interleave into a broken
  target, and splitting them into separate slots invites a set holding one and waiting on the other.
  ponytail: one global production slot serializes close-outs and build migrations; split per surface only if the
  queue measurably stalls work.

`<kind>` below is one of them. Every `PEDE` and `LIBERA` ends with `sid=<first 8 characters of the sender's
`$CLAUDE_CODE_SESSION_ID`>`; a session name can be reused by a resumed session, the id cannot. The **holder** of a
request is (set C, the sender as the message transport reports it in `from`, sid); the `sid=` text alone is a claim,
never proof. A `PEDE` or `LIBERA` without `sid=` is answered with a request to re-send it.

- On `PEDE <kind> <C> <branch>`: read the ledger first (`ledger.py show --dir <abs dir>`). If this holder already
  has a `LOCK <kind> <branch>` with a `GO` and no `RELEASE`, re-send that `GO` and stop; if it has a queued `LOCK`,
  answer with its queue position and stop (a re-sent `PEDE` never adds a second entry). Otherwise append
  `LOCK <kind> <branch> <C> from=<transport sender> sid=<sid>`. A grant is outstanding when a `GO <x> <kind> <b>` line has no later
  `RELEASE <kind> <b>`. None outstanding for that kind: send `GO <C> <kind> <branch>` to the sender and append it.
  Otherwise the request waits in arrival order (the `LOCK <kind>` lines with no `GO` after them are the queue).
  `ledger.py sweep` reads only `fork-*.md` files, so it does not see this queue; do this read by hand.
- On `LIBERA <kind> <C> <branch>`: accept it only from the holder of the outstanding grant (same C, same transport
  `from` and same `sid` as its `LOCK` line). Anyone else: append `NOTE LIBERA-RECUSADO <kind> <C> sid=<sid>`, tell the user, change
  nothing. Accepted: append `RELEASE <kind> <branch>`, then grant the oldest queued request of that kind.
- Re-read the queue on every ledger touch. A re-sent `PEDE` means a request was dropped: grant or answer it now.
- A slot held across a whole phase with no `LIBERA`: ask the set session for status; two unanswered pings, read its
  ledger and worktree `git log`, then tell the user.

## 5. Events from set sessions

| Line | Action |
|---|---|
| `CONJUNTO <C> iniciado ...` | record; recompute budget |
| `CONJUNTO <C> branch-publicada <S> <branch> <headSha>` | run `visual-validation.md` for S |
| `CONJUNTO <C> <etapa> <S> ...` where `headSha` changed and `validacao.sha != headSha` | run `visual-validation.md` again for S (a new push invalidates the old validation) |
| `CONJUNTO <C> bloqueado <causa> <motivo>` | record; tell the user; other sets keep going unless the cause is global |
| `CONJUNTO <C> merge ...` (from novarc-session-end) | re-read the database, recompute which sets can start, give the next prompt(s) |
| `CONJUNTO <C> pronto <spec ids>` | check section 5.1; when it holds, send `FECHA <C> <S>=<headSha> ...` and append `NOTE FECHA <C> ...` |

### 5.1 Closing a set (`FECHA`)

Send `FECHA <C> <S1>=<headSha1> <S2>=<headSha2> ...` (every spec of C with the head that was validated) to the set's
session only when all of these hold, re-read at that moment:

1. every spec of C has `etapa == "branch-publicada"` or later, and `validacao.resultado == "aprovado"` with
   `validacao.sha == headSha`;
2. C has no `bloqueios` and no `HOLD` without a later `LIBERA <C>`;
3. every `dependeDe` set of C is concluded;
4. no `verify` or `producao` grant of C is outstanding.

The SHAs pin what was approved: the set session merges those heads plus only its own close-out commits, or nothing
(see novarc-session-end, "Started by `FECHA`"). A later product push voids the `FECHA`; the set reports `pronto` again after re-validation. `FECHA` authorizes nothing by
itself: the set session acts on it only because the user's pasted set prompt carries a `Fechamento:` line. A set
session that answers `bloqueado fechamento-manual` is waiting for the user; tell the user which set.

To stop a set (machine overloaded, a cross-set collision, the user's call), send `HOLD <C> <reason>`; the set session
writes the block. Lift it with `LIBERA <C>`. Never write `execucao/{C}` yourself.

## 6. Reconciliation (every time this session acts on an event, and on the user's "status")

For each running set's specs, recompute the etapa from evidence (table "Reconciliation sources" in
`../references/milestones.md`: `CODEX APPROVED` lines, `git ls-remote origin <branch>`, `gh pr list --head <branch>`,
`git merge-base --is-ancestor` after `git fetch origin`). When the evidence is ahead of the database, send
`MARCO <S> <etapa> <proof>` to that set's session, `execucao/{C}.sessao` (never `specs/{S}.sessao`, which names the
last writer, possibly a spec session). If that session is gone, tell the user which
milestone is missing; `/novarc-session-end` reconciles it at close-out.

## 7. Report

On request and whenever a set concludes: the pt-BR table of section 2, live builders against the budget, the verify
queue, validation results with failures, and the next prompt(s) to paste.

## Red flags - stop

- About to write any field but `validacao`, or any `execucao/*` document.
- About to grant a second slot of a kind while one of that kind is outstanding.
- About to accept a `LIBERA` from a session that does not hold that grant.
- About to send `FECHA` with a validation older than the head, an open block, or a dependency not concluded.
- About to offer a set whose dependency is not concluded, or beyond the builder budget.
- About to treat `paraleloCom` as an order to run in parallel.
- About to write code or edit a set's worktree.
