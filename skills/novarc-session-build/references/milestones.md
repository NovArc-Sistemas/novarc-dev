# Milestones: database write procedure

Used by the set session (conjunto mode, novarc-session-end) for `execucao/{C}` and, when it builds or writes for a
fork, for `specs/{id}`; by each linked spec session for its own `specs/{id}` only; and by the orchestrator for
`specs/{id}.validacao` only. Tool: `ArtifactData` with the artifact `url`.

## Etapa order (monotonic)

```
iniciado < plano-aprovado < implementando < branch-publicada < pr-aberto < merge
```

There is no `validado` etapa (validation lives in `validacao`) and no `bloqueado` etapa (blocks live in
`bloqueios`). There is no stored `status` field.

## Fields per document

| Document | Fields this procedure writes | Writer |
|---|---|---|
| `specs/{id}` | `etapa`, `at`, `origem: "agente"`, `sessao`, plus when known: `branch`, `headSha`, `pr`, `revisao`, `reserva`, `desvios`, `pendings`, `bloqueios.<causa>` | the spec's builder session: the set session when N = 1 or on the fork fallback, the linked spec session when N >= 2 (`reserva` and `revisao` stay with the set session, which claims at load) |
| `specs/{id}` | `validacao: {resultado, sha, marcadoresOk, falhas: [{mudanca, n, motivo}]}` | orchestrator |
| `execucao/{C}` | `sessao`, `iniciadoEm`, `bloqueios.<causa>` | set session |

`sessao` = the title of the session writing (the set session, or the spec session `novarc-<codigo>-<C>-<S>`). `at` = ISO timestamp in UTC. `headSha` is written with `branch-publicada` and
again with every later push the ledger reports (`PUSHED <branch> <range>`), so a validation is bound to a commit.

## Write a milestone (target etapa T on `specs/{id}`)

1. `get` the document. If it is missing, go to "Create" below.
2. If its `etapa` is at or past T in the order above, skip: another writer (the mod, or an earlier run) already
   reached it. A later push still updates `headSha` with a pinned `update` of that field only.
3. Otherwise `update` with `if_version` = the version just read and `data` = `{etapa: T, at, origem: "agente",
   sessao}` plus the known fields (`branch`, `headSha`, `pr`).
4. On a version conflict: re-read and restart at step 2. At most 3 attempts in total.
5. After the third failure: append to the session-build ledger (a spec session adds `--fork <slug>`)
   `<skills>/novarc-session-build/core/scripts/ledger.py append --dir <abs ledger dir> --type NOTE --text "MARCO-FALHOU specs/<id> <T> <error>"`
   (ledger.py accepts only its known types, so the line is a `NOTE` whose text starts with `MARCO-FALHOU`), and name
   it in the run report to the user.

**Ownership of a `specs/{id}` document moves by phase, never shared at one time** (N >= 2 with linked sessions):

| Phase | Writer of `specs/{id}` (all fields but `validacao`) |
|---|---|
| load: `reserva`, `revisao`, `iniciado` | the set session |
| build: `plano-aprovado`, `implementando`, `branch-publicada`, every later `headSha` | the spec session, from its first READY until the set session **accepts** its `DONE` (diff read, core step-05 duty 4); a `DONE` the diff refutes reopens the spec session and ownership never left it |
| after the `DONE` is accepted: reconciliation, `VALIDACAO` rework that reopens the spec session, close-out (`pr-aberto`, `merge`) | the set session again; if it reopens the spec session for rework, ownership returns to that session until its next `DONE` |

**The boundary is two lines in the set's `ledger.md`**, written by the set session through `ledger.py append --type NOTE`:
`NOTE DONE-ACEITO <spec slug> <headSha>` when it accepts a spec session's `DONE` after reading the branch diff, and
`NOTE REABERTO <spec slug> <motivo>` when rework reopens the spec session. The last of the two for a slug decides who
owns `specs/{id}` now; with neither, a spec session with a READY owns its build etapas. A work-in-progress push at a
plan-phase boundary is preceded by `NOTE WIP-PUSH <spec slug>` in the spec's `fork-<slug>.md`: while it is the last
folded line of that file, the push records no milestone.

**The `novarc` mod follows the same table: it writes only in the owning session and otherwise routes the proof.** In the
orchestrator it writes nothing and sends `MARCO <S> <etapa> <proof>` to the set session (once probe D20a showed a set
session accepts a mod-sent line; until then it only raises a toast); in a spec session past its accepted `DONE` it
appends `NOTE MARCO <S> <etapa> [branch headSha]` to its fork ledger and sends the same line to its set session; in any
other non-owning session it writes nothing and raises the toast `Maestro: marco <etapa> de <spec> ignorado; dona agora: <sessão>`.

`sessao` is informational (the last writer's title). Routing never reads it: the set session is
`execucao/{C}.sessao`, and the spec sessions are in the set's `ledger.md`.

Never write a milestone to `execucao/{C}`: the set's etapa is derived.

A milestone write never touches `bloqueios`.

## Create a missing document

`set` without `if_version`, `data` = `{etapa: null}` for `specs/{id}` or `{sessao, iniciadoEm}` for
`execucao/{C}`. The API refuses a `set` without `if_version` on an existing document, so two creators cannot both
win: on refusal, re-read and fall back to the pinned `update` above.

## Blocks (keyed by cause)

`bloqueios` is a map; keys are `pendencia:<id>`, `escalacao:<n>` (n = escalation number in this run), `hold`.

- **Set:** pinned field-level `update` `{"bloqueios": {"<causa>": {"motivo": "<text>", "at": "<iso>"}}}`.
- **Clear:** only after re-checking that specific cause:
  - `pendencia:<id>`: `pendencias/<id>` has non-empty `resposta` AND `situacao !== "parcial"` (no `situacao` counts as
    resolved);
  - `escalacao:<n>`: the user answered escalation n in this session;
  - `hold`: a `LIBERA <C>` message arrived from the orchestrator.
  Then pinned `update` `{"bloqueios": {"<causa>": {"__delete__": true}}}`. Same conflict loop (3 attempts).
- A block on a single spec goes on `specs/{id}`; a hold or escalation that stops the whole set goes on
  `execucao/{C}`.

## Validation (orchestrator only)

Pinned `update` of `validacao` alone on `specs/{id}`: `{resultado: "aprovado" | "reprovado", sha: <head validated>,
marcadoresOk: <n>, falhas: [{mudanca, n, motivo}]}`. A validation counts only while `validacao.sha == headSha`.

## Derivation (read side, never stored)

For a set C with specs S1..Sn (from plano.json):

- etapa of C = earliest etapa among its specs (null when any spec has none);
- branches / PRs of C = map spec id -> `branch` / `pr`;
- displayed status: any `bloqueios` key on `execucao/{C}` or on one of its specs -> bloqueado; else every spec at
  `merge` -> concluido; else any etapa -> em-andamento; else nao-iniciado;
- validated in the simulator when every spec has `validacao.resultado == "aprovado"` and `validacao.sha == headSha`;
  a spec whose `validacao.sha` differs from `headSha` shows "Validação desatualizada: nova versão publicada";
- a set is concluded (for `dependeDe`) when every spec of it has `etapa == "merge"`.

## Reconciliation sources (R3)

The etapa a spec should have, recomputed from evidence:

| Etapa | Evidence |
|---|---|
| plano-aprovado | a `CODEX APPROVED` line for that spec in the session-build ledger (`fork-<slug>.md`, or `ledger.md` when N = 1) |
| branch-publicada | `git ls-remote origin <branch>` returns a sha (that sha is `headSha`) |
| pr-aberto | `gh pr list --head <branch> --state all --json number,url` returns a PR |
| merge | after `git fetch origin`, `git merge-base --is-ancestor <headSha> origin/<default>` exits 0 |

Merge proof is ancestry of the default branch; `git branch -r --contains` is not the proof (it lists the feature's
own remote ref).
