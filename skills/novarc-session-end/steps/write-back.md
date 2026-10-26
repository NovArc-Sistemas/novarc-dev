# Write-back: record what the merge delivered

**Recap** (full text in `../SKILL.md`): runs after the original step-07, before step-08. This session is the set
session at close-out: it writes its own set's `specs/{id}` fields (never `validacao`) and `execucao/{C}` fields
(`sessao`, `iniciadoEm`, `bloqueios` only), every write pinned, by the procedure in
`<skills>/novarc-session-build/references/milestones.md`. Messages to the user in pt-BR.

## 1. Prove the merge

```bash
git fetch origin
git merge-base --is-ancestor <merged branch head> origin/<default>
```

Exit 0 is the proof. Anything else: write nothing, say so in the report, and let the original continue as it would.
(The original's `git branch -r --contains` check stays in its own step; it is not the proof used here.)

## 2. Which specs this merge delivered

1. `depois` = specs of the set whose head (found as in `../SKILL.md` "Before the merge", step 2) passes
   `git merge-base --is-ancestor <head> origin/<default>` now, plus specs whose document has `etapa == "merge"`.
2. `novos` = `depois - antes` (`antes` was recorded at step-00 in the session-end ledger). Only `novos` are written.
   Specs in `antes` are never touched: their `pr`, `desvios` and `pendings` stay as their own close-out wrote them.
3. This covers session-build's collapse case (branches at one sha, or ancestors of each other): every spec whose head
   the merged branch carries is in `novos`, whatever branch name it was built on.
4. Specs of the set in neither set: reported as "não entregue neste merge", their etapa kept.

## 3. Deviations per delivered spec

For each spec in `novos`:

1. Read the session-build ledger lines for it: `CUT` (in the fork's final report and `fork-<slug>.md`, or
   `ledger.md` when N = 1) and `PARKED`.
2. Read each EARS requirement `R1..Rn` of its `spec.md` and check it against the merged diff
   (`git diff <merge base>...<spec head> -- <paths>`): implemented as written, implemented differently, or not
   implemented.
3. `desvios` = one entry per requirement not implemented as written: `{requisito: "R<n>", oQueMudou: "<what
   landed instead, or 'não implementado'>", porque: "<the CUT/PARKED reason, or the reason read from the plan or
   ledger>"}`. pt-BR text. An empty list when everything landed as written.

## 4. Pendings

`pendings` = the headings of the entries the original step-04 wrote or rewrote for this branch, verbatim, as they
now read in the pendings file. Empty list when it wrote none.

## 5. Write

For each spec in `novos`, pinned `update` of `specs/{id}`: `{etapa: "merge", at, origem: "agente", sessao, pr, desvios,
pendings}`. `pr` = the PR url, or `"merge local <sha7>"` on the `local-merge` path. If `headSha` is missing, add it.
Conflict loop and `MARCO-FALHOU` handling as in the procedure (on failure, append
`ledger.py append --dir <abs session-build ledger dir> --type NOTE --text "MARCO-FALHOU specs/<id> merge <error>"`
and report it).

No write to `execucao/{C}` for the merge: the set is concluded, by derivation, when every spec is at `merge`.

## 6. Reconcile the rest of the set (R3)

For the set's specs not in `novos` and not in `antes`, recompute the etapa from evidence (table "Reconciliation
sources" in the milestones reference: `CODEX APPROVED` lines, `git ls-remote origin <branch>`,
`gh pr list --head <branch>`, ancestry). Write any milestone the database lacks, by the same procedure.

`bloqueios` keys found on the set or its specs are cleared only after re-checking their specific cause (procedure,
"Blocks"); otherwise they are listed in the report.

## 7. Hours

Record this session's hours by `<skills>/novarc-session-build/references/horas.md`: `fase` = the set's `fase` in
plano.json, `branch: null`, resumo "Fechamento <C> (novarc-session-end)" when this session was opened only for the
close-out, or the set session's "Build <C> (novarc-session-build)" when the set session runs it (same session, same
documents: the rerun replaces the day's number). Then list the set's spec sessions (`ledger.md` builder addresses) and
check each has its `horas/<sessao8>-*` documents; a spec session without them is reported, and is not archived in
step-09 until it records them.

## 8. Tell the orchestrator

`SendMessage` to `execucao.orquestrador`: `CONJUNTO <C> merge <spec ids in novos> <merge sha7>`. If it is not
reachable, say so in the report; the orchestrator recomputes from the database on its next read.

## 9. Summary for the step-10 report (pt-BR)

```
## Artefato NOVARC
Conjunto <C>: <n de m> specs em merge (conjunto concluído | faltam <ids>).
Entregues neste merge: <ids> (PR <url>)
O que mudou em relação ao spec:
- <spec> <R<n>>: <oQueMudou>, porque <porque>
Não entregues neste merge: <ids e etapa atual>
Validação no simulador: <aprovado | reprovado com falhas | desatualizada> por spec
Bloqueios em aberto: <causa: motivo>
Marcos que falharam: <MARCO-FALHOU lines>
Horas registradas hoje: execução <h> h, ativas <h> h (esta sessão); sessões de spec sem registro: <ids>
```

Delete any line with nothing in it, as the original report rule says.

## NEXT

Back to the original: `<skills>/novarc-session-end/core/steps/step-08-sync-and-cleanup.md`.
