# Milestones: database write procedure

Used by the set session (conjunto mode, novarc-session-end) for `specs/{id}` and `execucao/{C}`, and by the
orchestrator for `specs/{id}.validacao` only. Tool: `ArtifactData` with the artifact `url`.

## Etapa order (monotonic)

```
iniciado < plano-aprovado < implementando < branch-publicada < pr-aberto < merge
```

There is no `validado` etapa (validation lives in `validacao`) and no `bloqueado` etapa (blocks live in
`bloqueios`). There is no stored `status` field.

## Fields per document

| Document | Fields this procedure writes | Writer |
|---|---|---|
| `specs/{id}` | `etapa`, `at`, `origem: "agente"`, `sessao`, plus when known: `branch`, `headSha`, `pr`, `revisao`, `reserva`, `desvios`, `pendings`, `bloqueios.<causa>` | set session |
| `specs/{id}` | `validacao: {resultado, sha, marcadoresOk, falhas: [{mudanca, n, motivo}]}` | orchestrator |
| `execucao/{C}` | `sessao`, `iniciadoEm`, `bloqueios.<causa>` | set session |

`sessao` = the set session's title. `at` = ISO timestamp in UTC. `headSha` is written with `branch-publicada` and
again with every later push the ledger reports (`PUSHED <branch> <range>`), so a validation is bound to a commit.

## Write a milestone (target etapa T on `specs/{id}`)

1. `get` the document. If it is missing, go to "Create" below.
2. If its `etapa` is at or past T in the order above, skip: another writer (the mod, or an earlier run) already
   reached it. A later push still updates `headSha` with a pinned `update` of that field only.
3. Otherwise `update` with `if_version` = the version just read and `data` = `{etapa: T, at, origem: "agente",
   sessao}` plus the known fields (`branch`, `headSha`, `pr`).
4. On a version conflict: re-read and restart at step 2. At most 3 attempts in total.
5. After the third failure: append to the session-build ledger
   `<skills>/novarc-session-build/core/scripts/ledger.py append --dir <abs ledger dir> --type NOTE --text "MARCO-FALHOU specs/<id> <T> <error>"`
   (ledger.py accepts only its known types, so the line is a `NOTE` whose text starts with `MARCO-FALHOU`), and name
   it in the run report to the user.

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
