---
name: novarc-session-plan
description: Use when a published NOVARC planning artifact must become implementation specs in the client repository, "/novarc-session-plan <link>", "pensa a execução do planejamento", "gera os specs do planejamento", "atualiza os specs". Reads the whole artifact plus the client repo, cuts the changes into sized specs (EARS requirements, G/W/T criteria, layer files) grouped into ordered sets, links every change to a spec, owns the development phases, writes the ready-to-paste set prompts, commits the specs to the repo and republishes the artifact with a read-only mirror. NOT for planning itself (that is novarc-session-brainstorm) and NOT for building a set (that is novarc-session-build).
---

# NOVARC session think

Planning artifact in, linked specs out: every change of plano.json lands in exactly one spec under
`.novarc/specs/<codigo>/` in the client repo, specs are grouped into sets with an acyclic dependency graph, phases are
derived from sets, and each set has a prompt the user can paste to start a build session.

**Announce at start:** "Usando a novarc-session-plan para transformar o planejamento em specs vinculados ao artefato."

Talk to the user in pt-BR. Spec files follow the client project's documented language (for example pt-BR). Everything
rendered in the artifact and every prompt: pt-BR, sentence case, no em dash, no emoji. This file and its references
are English.

Run from a session whose working directory is the client repo. `<skill>` below is this skill's base directory (the
path Claude Code states when the skill loads); `<skills>` is its parent, the novarc plugin's `skills/` folder. `<think>` is `<scratchpad>/think/`.

## Authorization

The invocation authorizes, for this planning artifact only:

- writing `.novarc/specs/<codigo>/` in the client repo (spec folders and `artefato.txt`), and, on a yes at the step 5
  migration gate, moving the legacy workflow folders into `.novarc/` with `migrar_novarc.py`;
- adding one line about `.novarc/specs/` to the client CLAUDE.md artifact list, first run only;
- ONE commit per run containing only those paths, staged by pathspec. **The invocation is the explicit ask for that
  commit**, the same way invoking session-end is the ask for its merge. It is not an ask for anything else in the repo;
- delivering that commit by the project's docs path (see Delivery). The push follows the client project's own rules:
  where they require the user's explicit authorization for a push (a rule of the client CLAUDE.md), ask once, and without a yes
  leave the branch committed and say so in the report;
- writing the artifact database as described in step 9 (creation of new ids, `removido`, `revisando`) and
  republishing the artifact.

Never authorized: any other file in the client repo, `git add -A` or `git add .`, a PR, a merge, a force push, and
any hook bypass: `--no-verify`, `-n` on commit, `-c core.hooksPath=...`, `HUSKY=0`, a refspec push from another
branch that reaches a protected branch around the hook's intent, or any flag or variable whose effect is that a hook
does not run. A client's `.githooks/pre-push` prints "git push --no-verify" as its own bypass: that is exactly what this
skill never runs. A refusing hook is a stop and a report, never an obstacle.

## Modes

| Situation | Mode |
|---|---|
| plano.json has no `specs[]` | **novo**: steps 1 to 10 |
| plano.json has `specs[]` (re-run after answers, deviations or plan changes) | **atualizar**: steps 1 to 10, with the rules in "Atualizar mode" |

## Size heuristic (summary)

A spec passes when: 4 to 20 changes; one backend domain as owner; at most 2 primary screens; at most 4 new models and
10 routes; estimated plan tasks 8 to 25, where tasks = models + routes + jobs + screens + ceil(UI changes / 3) + one
test task per layer touched (UI changes exclude `telaId: "*"`). Above the ceiling: split by sub-flow. Below the floor
with no backend of its own: merge with the neighbour on the same screen. Navigation changes (`telaId: "*"`) go to the
spec that creates the destination screen. An exception needs a written reason in the ficha `excecao` and in
`spec.md`. The limits live in `<skill>/scripts/medir-specs.js` (`LIM`) and are still being calibrated: record every
run in the Calibration log.

```bash
node <skill>/scripts/medir-specs.js <specs-dir> <plano.json>   # one line per spec; exit 1 when a spec fails without excecao
```

## Pipeline

### 1. Freshness and profile

- `git fetch origin` then `git rev-list --left-right --count HEAD...origin/<default>`. Right number not 0: sync
  before reading any source, or state in one line why not (session-build step-01 §1.1 logic: a spec written against a
  stale tree is coherent and aimed at the wrong code).
- Read CLAUDE.md, AGENTS.md, `docs/foundations/`, the `.novarc/` (else legacy `ai/`) conventions, and the git hooks
  (`git config core.hooksPath`, then the hook files). Resolve the **project profile** and write it to `<think>/perfil.md`:

| Field | How | Example |
|---|---|---|
| docs language | CLAUDE.md | pt-BR |
| `branchPrefixo` | CLAUDE.md branch strategy | `feature/` |
| `ramoDocs` | docs rule plus what the hooks allow (see Delivery) | `docs-pr` |
| `orquestrador` | `novarc-orq-<codigo>` | `novarc-orq-EXM-ERP-COMPRAS` |
| gate order, migration tool, merge path | CLAUDE.md, package scripts | `pnpm verify`; Prisma migrate deploy on boot; PR |
| `execucao.perfil.hostGit` | git remote url | `github` |
| `perfil.mergePath`, `merge.quem`, `merge.clique`, `teto.porAcao` | CLAUDE.md, git hooks | `pr`, `novarc`, `false`, `false` |
| `perfil.teto.ate`, `teto.migracaoProducao`, `teto.deploy` (the continuous-mode ceiling) | client CLAUDE.md, CI deploy workflows, `merge.quem` | `merge`, `false`, `false` |
| `perfil.gate.comandos`, `formato`, `stack` | package scripts, CI | `["pnpm lint", "pnpm test"]`, `app` |
| `perfil.migracao` | migrations folder, migration CLI | `{ferramenta: "prisma", aplicaNoMerge: false}` |
| `perfil.deploys[]` | CI deploy workflows (`dispara`: `merge`, `manual` or `comando`) | `{alvo: "homolog", dispara: "merge"}` |
| `perfil.base` | `origin/HEAD` | `main` |
| layer paths | the profile block of `references/layer-prompts.md` | as listed there |

A `perfil` field the repo does not answer is left out, never guessed (R2); only enums, booleans, numbers, command and file names (R3); record the file each value came from in `perfil.fontes`.

In atualizar mode `branchPrefixo`, `ramoDocs` and `orquestrador` come from `plano.execucao` and only change when the
project's rules changed (report it).

- Where the specs are written: `direct-main` -> the main checkout, on the default branch, clean and in sync.
  `docs-pr` -> a worktree `.claude/worktrees/specs-<codigo lowercased>-<YYYYMMDD>` on a new branch
  `docs/specs-<codigo lowercased>-<YYYYMMDD>` from `origin/<default>`. Verify with `git branch --show-current`.

### 2. Read the artifact

- `Artifact` read with `url` and `path: "plano.json"` into `<think>/plano.json`; `Artifact` list `scope: "files"`;
  each simulator with `path: "sims/<file>"` into `<think>/sims/`.
- `ArtifactData` list with `out_dir: <think>/db` for `notas`, `pendencias`, `documentos`, `videos`, `fases`,
  `execucao`, `specs` (page with `query.cursor` until no `next_cursor`).
- Planning transcripts named in `decisoes[].fonte` (session transcript search; Fathom links when present).
- A pending question is resolved only when `resposta` is non-empty and `situacao !== "parcial"` (R1).

### 3. Inventory

`<think>/inventario.md`, one row per change: `| mudança | tela (telaId) | domínio dono | decisões | pendências | fase atual | evidência |`.
Map the domain by reading the live tree (`apps/api/src/domains/<x>` or the service that owns the flow, with
`arquivo:linha`). An unmapped change is a bug: resolve it before step 4.

### 4. Cut specs and sets

- Cut by where the diff lands (domain plus screen group), not by theme. Group specs into sets in implementation order
  (schema owners first). Ids: sets `C01..`, specs `<C>-S01..`. Slugs: kebab, at most 5 words, unique across the plan.
  Write `<think>/corte.md`: `| spec | slug | conjunto | domínio | telas | mudanças | modelos estimados | rotas estimadas | jobs estimados |`.
- Provisional measure: write a ficha-only `spec.md` per spec under `<think>/provisorio/<id>-<slug>/` with counts
  estimated from the inventory and a quick repo scan, then
  `node <skill>/scripts/medir-specs.js <think>/provisorio <think>/plano.json`. Split or merge until every spec passes
  or carries a written exception.
- Atualizar mode: run the claim loop now, before any spec file in the repo is touched.

### 5. Layer subagents (whole module)

**Migration gate (R9), before anything is written in the repo.** When `<repo>/ai/specs/<codigo>/` exists and
`<repo>/.novarc/specs/<codigo>/` does not, run
`python <skills>/novarc-session-build/core/scripts/migrar_novarc.py --repo <repo> --dry-run`, show the user its `MOVE` lines
and the `PLANO <k> itens` line, and ask, verbatim: "Este repositório ainda usa as pastas antigas do fluxo NOVARC. Rode a migração para .novarc antes de eu escrever os specs."
On yes, run the same command without `--dry-run` (it ends with `MIGRADO <k> itens`, never commits and leaves the
renames staged; they go into the step 9 commit with the specs). Any `PARADO` or `COLISAO` line: stop and report it. On
no: stop and write nothing. Never write into `ai/`.

Dispatch six `Agent` subagents in parallel, one per layer (`dados`, `contratos`, `jobs`, `interface`,
`reaproveitamento`, `testes`), each with the profile block, the shared rules and its prompt from
`references/layer-prompts.md`, filled in. Each writes its file for every spec into
`<repo>/.novarc/specs/<codigo>/<id>-<slug>/`, restricted to the profile block's "Specs que podem ser escritos": every spec
in novo mode; in atualizar mode only the specs this run holds a `revisando` claim on plus the new ids (every other spec
folder is read-only). Collect the `FEITO` / `LACUNA` lines; a `LACUNA` is resolved (re-dispatch
or answer it yourself from the tree) or carried to the report.

### 5b. Cross-cutting subagents: performance and access

Before dispatching, measure the volumes yourself in a read-only database session (the project's own access rule; never
print a connection string): row count and monthly growth of every table the layer files read or aggregate. Paste them
into the profile block's "Volumes medidos". Subagents never reach the database.

After the six layers report, dispatch two `Agent` subagents in parallel, `desempenho` and `acesso`, with the profile
block, the shared rules and their prompts from `references/layer-prompts.md`. They read every layer file and write
`desempenho.md` and `acesso.md`; `desempenho` may add indexes to the same spec's `dados.md`, `acesso` may fix a role in
the same spec's `contratos.md`. Collect `FEITO` / `LACUNA` as in step 5.

### 6. Synthesis per set, then the size gate

- After both waves report, dispatch one synthesis subagent per set (parallel across sets) with the synthesis prompt.
  It writes `spec.md` (ficha first) for each writable spec of its set (same list as step 5) and fixes cross-layer
  gaps. Format:
  `references/spec-format.md`.
- While layers and syntheses report, keep `<think>/decisoes-sintese.md` (orchestrator rulings D1..Dn that override
  the cut and the layer files: who owns a model used by two sets, a change that moves to a later spec, a default
  that a client rule overrides) and pass it to every synthesis agent. Moving a change between specs: the
  destination agent copies its rows; the source agent leaves them; the orchestrator (or the coherence pass) deletes
  them afterwards, so two agents never race on the same file.
- **Coherence pass across sets (mandatory).** Per-set synthesis cannot see the other sets being written at the same
  time, so it leaves cross-set contradictions: a model or use-case used by an earlier set but owned by a later one,
  permission mechanisms cited before the spec that creates them, stale model names from the cut, a transition with
  two writers, an extension point no spec owns. Collect every cross-set item the syntheses report into
  `<think>/coerencia.md`, then dispatch coherence agents partitioned by set (each edits only its own sets' files,
  reads the others), and fix the leftovers yourself. Re-check that every ficha matches its tables and the cut.
- Atualizar mode where only `desempenho.md` / `acesso.md` changed: use the complemento prompt (section 10 of
  `references/layer-prompts.md`) instead of synthesis. It appends requirements, criteria and test cases after the
  existing ones and leaves the rest of `spec.md` as the coherence pass left it.
- Size gate: `node <skill>/scripts/medir-specs.js <repo>/.novarc/specs/<codigo> <think>/plano.json`. Exit 0 required.
  A failure goes back to step 4 for that spec, or becomes a written exception in the ficha and `spec.md` when
  splitting or merging would break the floor or the screen limit. Record the result in the Calibration log.

### 7. Order and phases

- `dependeDe`: schema-owning sets first; a set that edits a file another set also edits depends on it. Check the graph
  is acyclic.
- `paraleloCom`: only between sets that share no file and no migration and are not in each other's dependency chain.
  It is a permission, not an instruction.
- `estimativaHoras` per set = Claude session hours, never people hours: the sum of the `h` column printed by
  `medir-specs.js` for the set's specs (1.25 h fixed plus 0.2 h per estimated task, rounded up to half hours). Each
  phase's `horasPrevistas` = the sum of its sets. Phase `inicio`/`fim`: run `medir-specs.js ... --inicio <first
  business day>` and copy the dates it prints (6 session hours per business day, sets in sequence unless
  `paraleloCom`, 1 validation day closing each phase). Phases: groups of consecutive sets with a delivery the client recognizes, ids `f1..fN` in
  order. Renumbering phases is allowed only when `<think>/db/fases/` is empty; otherwise map old ids to new ones and
  report the map. Then every change's `fase` = its set's phase; every simulator screen's `fase` = the earliest phase
  among its changes.
- `sdd` per spec: `true` when the spec touches money, fiscal documents, authentication or authorization, RLS, or a
  destructive migration (the criteria of novarc-session-build core step-02 §2.6), else `false`. It feeds the `SDD:`
  line of the set prompt.
- In novo mode, if the order moves a spec to another set, rename its id and folder now (nothing is committed yet).

### 8. Prompts

One prompt per set per `references/set-prompt.md`, with `<sha7>` left as a placeholder until step 9 has the commit.

### 9. Write and deliver

1. Write `<repo>/.novarc/specs/<codigo>/artefato.txt`: one line, the artifact url, LF.
2. First run only: add to the client CLAUDE.md artifact list (for example "Development artefacts") one line naming
   `.novarc/specs/` as "specs de implementação gerados pela novarc-session-plan, um diretório por spec", using the same
   separator the surrounding list lines use (that file is the client's, so its own style wins there).
3. Encoding check, every file under `.novarc/specs/<codigo>/`: UTF-8, no BOM, LF only, names `^[a-z0-9-]+\.md$` (plus
   `artefato.txt`):
   `node -e "const fs=require('fs'),p=require('path');const w=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?w(p.join(d,e.name)):[p.join(d,e.name)]);let bad=0;for(const f of w(process.argv[1])){const b=fs.readFileSync(f);if(b[0]===0xef&&b[1]===0xbb||b.includes(13)){console.log('BAD',f);bad=1}}process.exit(bad)" .novarc/specs/<codigo>`
4. Commit: `git branch --show-current` (expected branch), `git add -- .novarc/specs/<codigo>/ CLAUDE.md` (CLAUDE.md only on
   the first run; the renames a migration-gate yes staged are already in the index and go in the same commit), `git commit -m "docs(specs): <resumo no idioma do projeto>"`. No bypass flag of any kind.
5. Blob check: for every file, sha256 of `git show HEAD:<path>` equals the sha256 of the working-tree file. A
   difference means line-ending normalization changed the file; fix and amend before anything else (set sessions hash
   the blob on `origin/<default>` and stop on a mismatch).
6. Record `commit` = `git rev-parse HEAD`. Do not push yet: the push waits for the validator (item 10).
7. Publish folder `<think>/pub/`: every currently published file (from the step 2 listing, read with `path`), the
   shell `index.html` copied from `<skills>/novarc-session-brainstorm/template/index.html` (shells come from the template,
   never from the duplicate, so the page renders "Specs e execução"), and the mirrors: `cp` each repo file to `<think>/pub/specs/<id>/<nome>`, never re-saved
   by an editor. `espelho` is exactly `specs/<id>/` (no slug). Mirrors are byte-identical to the repo files.
8. Update `<think>/pub/plano.json`: `conjuntos[]` (`id, titulo, fase, ordem, specs, dependeDe, paraleloCom,
   estimativaHoras, prompt` with `<sha7>` filled), `specs[]` (`id, conjunto, titulo, slug, mudancas, bloqueadoPor, sdd,
   arquivos: {repo, commit, itens: [{nome, sha256}]}, espelho`; `itens` always contains `spec.md`; an entry this run writes or rewrites stores `repo` as `.novarc/specs/...`, an entry it
   does not touch keeps its stored `repo`), `mudancas[].spec`,
   `mudancas[].fase`, `fases[].conjuntos`, `simuladores[].telas[].fase`, and `execucao: {branchPrefixo, ramoDocs,
   orquestrador, perfil}` (`perfil.geradoEm` = today).
9. Database snapshot for the validator: `ArtifactData` list `pendencias`, `specs`, `execucao`, `fases` with
   `out_dir: <think>/pub-db`. Then:
   `node <skills>/novarc-session-brainstorm/template/ferramentas/validar-plano.js <think>/pub --db <think>/pub-db --repo <repo root>`
   and `node <skills>/novarc-session-brainstorm/template/ferramentas/verificar-pagina.js <think>/pub`. Both green before
   publishing.
10. Push per Delivery, only now that the validator is green (a push cannot be taken back; no force push).
11. Database documents (R11, R21). From the snapshot, the ids already present are never rewritten. Create only ids
    absent from the database with `ArtifactData` `batch` of `set` entries without `if_version` (at most 50 entries per
    batch; split larger runs): `execucao/<C>` = `{"bloqueios": {}}`, `specs/<id>` = `{"etapa": null, "bloqueios": {}}`.
    A refused entry means the document appeared meanwhile: re-read it and leave it alone. A spec id removed from the
    plan keeps its document: `get` it, then `update {"removido": true}` with `if_version` = the version just read.
12. Publish: `Artifact` publish with `url` = the artifact, `file_path` = `<think>/pub/index.html`, `files` mapping
    `plano.json` and every `specs/<id>/<nome>`, no `icon`, and always the full capabilities object:

```json
{
  "db": { "rules": [
    { "path": "config", "write": "admin" },
    { "path": "fases", "write": "admin" },
    { "path": "horas", "read": "admin", "write": "admin" },
    { "path": "auditoria", "read": "admin", "write": "admin" },
    { "path": "execucao", "write": "admin" },
    { "path": "specs", "write": "admin" }
  ] },
  "user": { "scopes": ["profile"] },
  "comments": { "composer_only": true },
  "downloads": true,
  "room": {}
}
```

13. Read back `plano.json` from the artifact (`Artifact` read with `path`) into a fresh folder and re-run the validator
    on it (with the mirrors listed by `scope: "files"` read alongside).
14. Atualizar mode: clear every `revisando` this run wrote (see below).
15. Record this session's active AND execution hours as `novarc-session-brainstorm` step 7 says
    (`scripts/horas-ativas.mjs --session "$CLAUDE_CODE_SESSION_ID"` and the same with `--execucao`; one
    `horas/<sessao8>-<data>` and one `horas/<sessao8>-<data>-exec` per day, with `sessao`, `transcript` and, on the
    execution document, `tokens`), with `resumo: "Specs (novarc-session-plan)"`.
16. Cleanup (only when the specs were written in a worktree, i.e. `docs-pr`). `git -C <repo> fetch origin`, then
    `git -C <repo> merge-base --is-ancestor <branch> origin/<default>`:
    - Exit 0 (the commit is already on `origin/<default>`): from the main checkout, never from inside the worktree,
      run each command alone: `git -C <repo> worktree remove <dir>` (denied: retry it alone once; still refused: stop
      and report); on Windows, `rmdir` the empty folder that may be left behind; then `git -C <repo> branch -d <branch>`
      (never `-D`: a refusal means the branch holds work not on the default, report it).
    - Otherwise (the branch waits for the user's merge): remove nothing; the report says cleanup happens after the
      merge.

### 10. Report

To the user, in pt-BR:

```
## Specs gerados: <codigo>

| Conjunto | Fase | Specs | Mudanças | Depende de | Pode correr junto | Estimativa |
|---|---|---|---|---|---|---|

| Spec | Título | Mudanças | Tarefas estimadas | Situação |
|---|---|---|---|---|
(situação: pronto, bloqueado por p-xx (quem responde), exceção de tamanho: motivo)

Grafo: C01 -> C02 -> C04; C03 junto com C02.
Fases: f1 = C01, C02; f2 = ...
Entrega: commit <sha7> no branch <branch>; push <feito | pendente: motivo e o comando que você roda>.
Artefato republicado: <url>. Validador: ok.
Limpeza: <worktree e branch removidas | pendente até o merge de <branch> em <default> | não se aplica (direct-main)>.
Mudanças renomeadas ou movidas (atualizar): ...
Lacunas: ...
Próximo passo: <o que destrava o primeiro conjunto>.
```

## Delivery (`execucao.ramoDocs`)

The client CLAUDE.md decides, read together with its hooks:

- `direct-main`: commit on the default branch and push. If the hook refuses, stop and report the options (the user
  pushes, or the project switches to `docs-pr`).
- `docs-pr`: commit on `docs/specs-<codigo lowercased>-<YYYYMMDD>` in its worktree, push that branch when the project
  allows it, and leave it for the user to merge (their call: PR, or direct per the project's docs rule).

Example: a project whose CLAUDE.md sends docs straight to `main`, but whose `.githooks/pre-push` refuses any push while
the current branch is `main`, and which requires explicit authorization for every push, is `docs-pr`: one local
commit on `docs/specs-exm-erp-compras-<date>` in `.claude/worktrees/specs-exm-erp-compras-<date>`, no push without
the user's yes, and the report says the branch must reach `origin/main` before any set session can start, because
`novarc-session-build conjunto` checks the spec hashes against `origin/<default>`.

## Branch names for sets (R16)

Set sessions name one branch per spec: `<branchPrefixo><spec id lowercased>-<slug>-<YYYYMMDD>`, for example
`feature/c01-s02-sop-cobertura-20261012`. The branch-to-spec mapping is the exact match of `c\d{2}-s\d{2}` in the
branch name, so slugs must be unique and the spec id must never change after a set started.

## Atualizar mode

- Ids are kept. A changed cut re-cuts only what changed; every renamed or moved change goes to the report.
- **A spec that started is immutable under its id (R25).** Started = its `specs/<id>` document has `reserva` or a
  non-null `etapa`. Its files are never rewritten; changed or new scope becomes a NEW spec id (next free `C0x-Syy`, or
  a new set), the change ids move to it, and the old spec keeps its files and history.
- **Claim loop (R27)**, for every spec whose files this run would rewrite, before touching them:
  1. `ArtifactData get specs/<id>` and note its `version`.
  2. If `reserva` is present or `etapa` is non-null: take the new-id path above. Stop here for this spec.
  3. Otherwise `update {"revisando": {"at": "<ISO now>"}}` with `if_version` = that version.
  4. On a version conflict, go back to 1 (a set session may have claimed it first).
- When the run ends (after step 9.13, or on any stop), clear each claim: `get`, then
  `update {"revisando": {"__delete__": true}}` pinned to the version just read.
- Database documents of existing ids are never rewritten by this skill; only new ids are created and removed ids get
  `removido: true` (step 9.11).

## Red flags

- About to read source files before the freshness check.
- A spec line about existing code with no `arquivo:linha` read from the live tree.
- A change in no spec, or in two. Exception: a run scoped to some phases (the user names the simulators or phases) leaves the changes of phases with no set yet without spec; the validator only warns for those, and the next run cuts them.
- About to `git add -A`, to stage anything outside `.novarc/specs/<codigo>/`, the migration-gate renames and the one CLAUDE.md line, or to commit with
  any hook-suppressing flag.
- A mirror written by anything other than a byte copy of the repo file.
- About to rewrite files of a spec whose document has `reserva` or an `etapa`, or without holding its `revisando` claim.
- A `set` with `if_version` on an existing document, or any `set` over a document that already exists.
- A republish without the full capabilities object, or before the validator ran green.

## Calibration log

| Date | Project | Specs | Passed | Exceptions | Limits changed | Why |
|---|---|---|---|---|---|---|
| 2026-10-11 | First pilot (143 changes, 9 sets) | 21 | 16 | 5 | No | Exceptions: two below the change floor (a registry with its own backend; two external integrations), one below the task floor (extensions of another spec's use-case do not count as routes or models), one above the model ceiling (ownership moved in by an ordering ruling), one above the route ceiling (an OAuth server). All five were cases where splitting or merging would break another limit. Watch next run: count "extends use-case X" lines as tasks before lowering the floor. |
| 2026-10-12 | Same pilot, hours recalibrated | 21 | n/a | n/a | Added `RITMO`, `CAL` | Estimates were people hours (458 h, four and a half months). NOVARC: Claude implements, so estimate Claude sessions. Anchor: 5 pilot implement sessions, median 3.4 active hours. New rule gives 91.5 h and about four weeks. Recalibrate `RITMO` from the `horas` collection after the first sets merge. |
| 2026-10-12 | Same pilot, desempenho and acesso added | 21 | n/a | n/a | `desempenho.md` and `acesso.md` count one task each | First run of the second wave: 11 performance gaps (N+1 over 4,300 SKUs, a 992k-row scan for a product name, a 500-row cut before a CNPJ filter, a synchronous 60 s recompute) and 13 access gaps, almost all new audit actions missing from `dados.md`. Volumes measured once by the orchestrator, pasted into the profile. |
| 2026-10-17 | NOVARC-PLUGIN-MAESTRO (plugin repo, 82 changes, 10 sets) | 15 | 11 | 4 | No | First run on a repo that is neither Prisma nor REST. Counters were mapped in the profile block: model = persisted shape, route = entry point (HOOK, TOOL, CMD, DIRETIVA, STEP, CLI), job = timer. Exceptions: C03-S01 at 27 tasks (guards and directives share one `tool.call:Bash` handler and the audit collection), C05-S01 with 11 entry points, C05-S02 with 2 changes (mod code vs skill Markdown), C09-S01 with 12 entry points (a pendings script with 6 subcommands). Splitting would cut one handler or script in two; merging C05-S02 would mix mod code with skill Markdown. |

## Rules learned the hard way

- The access agent names new audit actions (enum values) but owns only `acesso.md`: give synthesis or complemento the
  rule that each value lands in the `dados.md` of the spec that first writes it, or every spec ships an action the
  enum does not have.
- Layer agents name new models from the cut's estimates; tell them the schema's naming language (often English) up
  front, or synthesis spends most of its fixes renaming.
- Ordering bug class: a model or use-case created by a later set but needed by an earlier one (an earlier set
  writes it, or reads it in its first phase). Check "who creates vs who uses, in set order" before dispatching
  synthesis; move ownership to the earliest set that writes it.
- A change whose data only exists after a later set (an open-order column, a price check against an order) moves
  to that later spec and phase; a phase-1 screen does not read tables of phase 2.
- A client project's own rule beats an orchestrator default (cost visibility followed the project's role rules, not
  the generic "standard reads" default). Read the rule in the code before writing a default into the decisions.
- On Windows client repos with `core.autocrlf=true`, hash the committed blob (`git show HEAD:<path>`), never the
  working-tree file, and write spec files with LF; set sessions hash the blob on `origin/<default>`.
- `ArtifactData` reads print one JSON document per line (`{"id","data","version",...}`); a `set` without
  `if_version` on an existing document is refused (`version_mismatch`), which is what makes creation race-safe.
- The project library lists the specs straight from `plano.json`; never register a spec in the `documentos`
  collection (it would show twice). Plans, code reviews and meetings from the build sessions do go there.
- The interview and other client-facing text: no em dash. Spec files inherit the rule because they are rendered in
  the artifact mirror; a UI placeholder shown as a dash is written as "-".
