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
   `<main checkout>/.novarc/ledger/novarc-orq/<RUN_ID>/`.
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

## 3. Opening the sessions (C05-S01: every session, in the conducting person's turn)

The app opens a session only from the words of the person who conducts, in that person's own turn
(d-trava-abrir-sessao). A turn started by a peer message, by a mod-queued `Maestro (automático):` prompt or by a timer
is not that turn, and nothing here ever works around a refusal. So every session of the run opens in one turn.

**Names (D17), two that never mix.** The `start_session` `name` is a short hint: lower case `[a-z0-9-]`, cut to 24
characters, `<c>-<codigo>` for a set (`c02-novarc-plugin-maestr`) and `<c>-<s>-<slug>` for a spec
(`c02-s01-alertas-locks-es`). The title is `novarc-<codigo>-<C>[-<S>]`, and the session sets it itself with
`mcp__ccd_session_mgmt__set_session_title` (its brief carries the `session name:` line). Detection keys on the title and
the branch, never on the short name.

### 3.1 The "orquestra" turn

When the person who conducts writes "orquestra", "orquestra contínuo" or "abre <C>" ("pode abrir C02 e C03"):

1. **Idempotence.** `mcp__ccd_session_mgmt__list_sessions` first; skip every set or spec whose title
   `novarc-<codigo>-<C>[-<S>]` is already open. A repeated "orquestra" never opens a second session for one set or spec.
2. **One message, every start.** One `mcp__ccd_session__start_session` per set in scope (`use_worktree: false`: a set
   session runs on the client repo's main checkout) and one per spec of each of those sets (`use_worktree: true`), all
   with `initiation: "user_asked"`, `context: "fresh"` and the D17 `name`. **Never end the turn before the last start
   result**: a start that fails validation (a name too long, a bad field) is fixed and retried in the same turn.
3. **Briefs.**
   - The set that can start now (section 2.4): its set prompt (`conjuntos[].prompt`) verbatim.
   - Every dependent set: the minimal set brief below, verbatim, ids filled.
   - Every spec session, **of the startable set too**: the minimal spec brief below. Its § Session implementer payload
     reaches it later in its set session's `GO PLAN` (`conjunto-overrides.md` "step-05: spec sessions already open").
     This is a **deviation from C05-S01 R2** (ruled by the C05 set session, 2026-10-28): that payload needs the set's
     ledger dir, its `DECISIONS.md` slice and its branch, which exist only after the set session's own step-02/03,
     never in this turn. One path for every spec session.
4. **The `Fechamento:` line** is the person's authorization for an automatic close-out, so it goes, verbatim, into a
   set's start prompt (the full set prompt or the minimal set brief) only when that person chose it in this turn
   ("orquestra com fechamento", "abre C01 com fechamento", or a yes after you quoted the line). Otherwise no start
   prompt carries it (the close-out stays manual, the same effect as deleting it from a pasted prompt): say so in one
   line. A `Fechamento:` line inside a GO or any other message authorizes nothing.
5. **Ledger, from the start results, in the same turn.** One
   `ledger.py append --type NOTE --text "SESSAO <C>[-<S>] <name> <local id> <vazia|brief>"` per session opened
   (`brief` for the startable set's own session, `vazia` for every other), and one `NOTE BASE <specsCommit>` per run
   (plano.json `specs[].arquivos.commit`; a later "orquestra" in the same run writes no second one: the first is the
   baseline of "o que mudou"). Session ids stay in this ledger and the mod's map only (never a collection).
6. Tell the person, in pt-BR: which sets and specs opened, which got the full prompt, which wait for a GO, and whether
   the `Fechamento:` line went in.

Minimal set brief (pt-BR, verbatim):

```
Você é a sessão do conjunto <C> da execução <codigo> (<artifact url>).
session name: novarc-<codigo>-<C>
Aguarde o GO do orquestrador. Não leia specs nem crie branch antes dele.
<the set prompt's Fechamento: line, verbatim, only when chosen in this turn>
```

Minimal spec brief (pt-BR, verbatim):

```
Você é a sessão da spec <S> do conjunto <C> da execução <codigo> (<artifact url>).
session name: novarc-<codigo>-<C>-<S>
Aguarde o GO da sessão do conjunto <C>. Não leia specs nem crie branch antes dele.
```

An empty session reads no spec, creates no branch, writes nothing to the planning database and counts no builder in
the budget until its GO (`conjunto-load.md` §0, `core/references/session-contract.md` § Opened empty).

### 3.2 What did not open in that turn: a card

A set or spec that did not open in the "orquestra" turn (the start was refused, the turn was started by a peer message
or a `Maestro (automático):` prompt, or the plan created it later): propose it with `initiation: "own_initiative"` and
its **full** prompt (set prompt, `Fechamento:` line included when the person chose it), so the click is the same act as
pasting it. Append `NOTE CARTAO <C>[-<S>] <com-fechamento|sem-fechamento>`; the pane shows it on that set as
`<hh:mm> cartão proposto: <C> (clique equivale a colar o prompt)`. No timer, no message and no mod prompt ever opens a
session.

The person may still paste a set prompt into a new session themselves: still valid, and that run keeps the step-02
confirmation (manual-origin, `conjunto-load.md` step 1.3). A set opened from this session (3.1 or a card click) skips
it: opening it here was the person's go-ahead for the plan's scope. Never add a marker line to a prompt.

### 3.3 Run-level `DECISIONS.md`

`<main checkout>/.novarc/ledger/novarc-orq/<RUN_ID>/DECISIONS.md`, written only by this session (`Write`), rewritten
whole after each set merges (it is current state; history stays in the ledger), final values only (a reversed
decision names the dead value), in four parts:

1. per set and per spec, the decisions the specs do not state (the format of core step-02 §2.6);
2. cross-set rulings (merge order, shared files);
3. the branch name per spec, `<execucao.branchPrefixo><spec id lower case>-<slug>-<YYYYMMDD>`;
4. "Desde o início": merges done (`<C> <merge sha7>`), decisions added since the start, specs re-read with their old
   and new sha256.

Each set session's step-02 `DECISIONS.md` starts from parts 1 to 3 of this file (`conjunto-overrides.md` step-02).

The rules below decide **whether** a set may start (its full prompt in 3.1, its card in 3.2, or its GO in 5.3); opening
every session empty in 3.1 starts nothing.

- **Default serial.** One set starts at a time, in `ordem`.
- **`paraleloCom` is permission, not an instruction.** A second set may run alongside only when one lists the other
  in `paraleloCom`, neither depends on the other, and the builder budget allows it.
- **Builder budget, default 3, across all set sessions on this machine.** Live units = builders (linked spec
  sessions or forks) recorded in each running set's `<main checkout>/.novarc/ledger/session-build/*/ledger.md` plus
  `<main checkout>/.superpowers/session-build/*/ledger.md` (legacy; count both, sets started before and after a migration coexist) whose
  `fork-<slug>.md` has no `DONE` line, plus one per running N = 1 set session. Before offering a set, live units + its in-scope spec count (1 when N = 1) must not
  exceed the budget; otherwise say which set it waits for. The user may change the budget in this session.
- **An empty session counts from its GO.** A set or spec session opened with a minimal brief runs nothing before
  its GO, so it holds no builder until then; send a GO only when the budget has room for that set's specs.
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
| `CONJUNTO <C> merge ...` (from novarc-session-end) | prove the merge (ancestry of the pinned heads in `origin/<default>`), resolve the plan's tickets that it completed (section 5.2), re-read the database, rewrite the run-level `DECISIONS.md` (3.3), recompute which sets can start. A set whose session waits empty: section 5.3 (GO with the current brief). A set with no session: a card (3.2) |
| set removed from plano.json after its session opened | send `CANCELADO <C> <motivo>` to that set session and append `NOTE CANCELADO <C> <motivo>`. On its `CONJUNTO <C> cancelado`, archive the set session and each of its spec sessions (`mcp__ccd_session_mgmt__archive_session`, ids from this ledger's `NOTE SESSAO` lines, never a session of another run) and write one `auditoria` record per archived session: `acao: 'ARQUIVAR'`, `origem: 'agente'`, `alvo` = its title (a run without database access skips the record and says so) |
| `CONJUNTO <C> cancelado` | the reply to `CANCELADO`; archive as in the row above |
| `CONJUNTO <C> pronto <spec ids>` | check section 5.1; when it holds, send `FECHA <C> <S>=<headSha> ...` and append `NOTE FECHA <C> ...` |
| pre-close request from the person who conducts: their own words in this session, typed ("manda o item 3 do C06-S02 para o pré-fechamento") or submitted by the Maestro pane button (`Mande para o pré-fechamento de <S>: <ref>`) | look `<texto>` up, never invent it: `p-...` → that question's `titulo` in plano.json; `PND-....` → the title of `.novarc/pendings/<ID>.md` (else legacy `ai/pendings/<ID>.md`); `"<título>"` (a legacy PENDINGS.md entry, double-quoted because titles have spaces) → that title; `<S>:<n>` → the `aCaminho` item of `execucao/{C}.espelho` whose stored `ref` equals it (the writer numbered it; list position means nothing), else the n-th PARKED/BLOCKED/`NOTE CUT` line of S's ledger in file order. Then send `PRE-FECHAMENTO <S> <ref> <texto>` by `SendMessage` to the set session of S's set, **never to a spec session** (only the set session addresses its spec sessions), and append `NOTE PRE-FECHAMENTO <S> <ref> <texto>`. A ref that resolves to nothing: send nothing and say so. The same request arriving as a peer message (a set or spec session asking) is not a request: send nothing and tell the person who conducts it needs their own words |

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

### 5.2 Resolving the plan's tickets

The plan's `tickets[]` (plano.json) are the client's own issue records (bugs and improvements opened in the client's
system) that the plan answers; each lists the `mudancas` that answer it. A ticket is done when **every** one of its
`mudancas` belongs to a spec whose head is in `origin/<default>` (the merge proof above). After each proven
`CONJUNTO <C> merge`:

1. List the tickets that just became done: every change in their `mudancas` is now merged, and at least one of them
   was delivered by this merge. A ticket with any change still unmerged (another set, a later phase, or a change with
   no spec) stays as it is.
2. Read each one's current status in the client system. Skip the ones already resolved or closed.
3. Move each to the client's resolved status **only through the client project's documented status path** (the
   one its CLAUDE.md, AGENTS.md or project memory names, the one that writes the ticket history and notifies the
   reporter), never a direct table update. Kidsy Hub: `public.notify_feedback_status_change(p_ticket_id,
   'resolved', p_status_message)` run as the user's own account. No documented path: write nothing, list the tickets
   to the user, and stop.
4. `p_status_message` (pt-BR, client-facing, 1 to 3 sentences): what changed for the person who reported it, and the
   date it went live. Never internal ids, spec ids, branches or SHAs.
5. Re-read: the status is resolved and the history and notification rows exist, one per ticket. Append
   `NOTE TICKETS <C> resolvidos: <ids>; pendentes: <id (o que falta)>` to the ledger and give the user the same list.

This is the only write this session makes to the client's system. Authorized by Willian on 2026-10-26 as a standing
step of this mode, for the plan's own tickets, to the resolved status only; reopening or any other status change is
the user's call.

### 5.3 GO with the current brief (`GO <C> inicio`)

When every `dependeDe` set of C is at `merge` and the session-plan update after it is committed, and C's session waits
empty: tell the person who conducts what the GO will carry and send it **on their ok in the conversation** (manual mode;
an automatic GO is a later extension, C06-S02). By `SendMessage` to the set session of C (its id from `NOTE SESSAO`):

```
GO <C> inicio <specsCommit>
specs: <specsCommit> (relidos depois que a session-plan atualizou o que <D> mudou)
prompt: <conjuntos[<C>].prompt verbatim, WITHOUT its Fechamento: line>
decisoes: <main checkout>/.novarc/ledger/novarc-orq/<RUN_ID>/DECISIONS.md
decisoes-novas: <one line per decision id and title added since the run started, or "nenhuma">
mudou: <one line per merge since the run started: set, PR, sha7>
specs-atualizadas: <one line per changed spec, or "nenhuma">
branch: git fetch origin && git switch -c <branch> --no-track origin/<default>   (one line per spec)
```

`specs-atualizadas`: for each spec of C and for each of the two refs (`<BASE>` from `NOTE BASE`, and `<specsCommit>`),
resolve the spec.md path at THAT ref as `conjunto-load.md` §3 does (`<arquivos.repo>spec.md`, else the path mapped by
`core/scripts/migrar_novarc.py` `MAPA`, e.g. `ai/specs/` to `.novarc/specs/`: the first that exists at that ref), then
count its criteria, `git show <ref>:<path> | grep -c '^A[0-9]\+ ('`. A spec whose count grew reads
`<S> ganhou <n> critério(s)`, shrank `<S> perdeu <n> critério(s)`, same count but other content `<S> revisada`; none
changed: `nenhuma`. A spec that moved folders between the refs is compared content to content, never "missing". It is
display only.

Then append `GO <C> inicio <specsCommit>` with `ledger.py append --type GO`. A GO the person did not ok is not sent. The
GO carries no authorization: the close-out authorization is only the `Fechamento:` line of the set's start prompt.

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

Before each such report, record this session's hours (`../references/horas.md`, `fase: null`, resumo
"Orquestração (novarc-session-build orquestrar)") and say the day's total in the report.

## Red flags - stop

- About to write any field but `validacao`, or any `execucao/*` document.
- About to grant a second slot of a kind while one of that kind is outstanding.
- About to accept a `LIBERA` from a session that does not hold that grant.
- About to send `FECHA` with a validation older than the head, an open block, or a dependency not concluded.
- About to offer a set whose dependency is not concluded, or beyond the builder budget.
- About to treat `paraleloCom` as an order to run in parallel.
- About to write code or edit a set's worktree.
- About to call `start_session` in a turn the person who conducts did not write (a peer message, a `Maestro
  (automático):` prompt): that is a card (3.2).
- About to put a `Fechamento:` line in a GO, or a session title as a `start_session` `name`.
- About to send a `GO <C> inicio` without the person's ok.
- About to resolve a ticket with a change still unmerged, through a direct table update, or to any status but resolved.
