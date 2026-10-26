# Conjunto 1: load the set from the artifact

**Recap** (full text in `../SKILL.md`): one writer per field; every write pinned; aggregate derived, never stored;
the orchestrator is `execucao.orquestrador`, never `main`. Messages to the user in pt-BR.

Input: the set prompt (`/novarc-session-build conjunto <artifact url> <C>` plus its pt-BR lines). Every stop below
ends the run before session-build step-02 and tells the user why, in pt-BR.

## 1. Read the plan

1. `Artifact` read with `url` and `path: "plano.json"`; work from the saved local copy.
2. Locate set `<C>` in `conjuntos[]`. Its specs = `specs[]` entries with `conjunto == <C>`. Keep per spec: `id`,
   `slug`, `titulo`, `mudancas`, `bloqueadoPor`, `arquivos {repo, commit, itens[{nome, sha256}]}`.
3. Read `execucao.branchPrefixo`, `execucao.orquestrador`, `projeto.codigo`. The orchestrator is optional: the plan
   names it, but it only exists when someone opened that session. Run `ListAgents` and look for that name. Absent (or
   no `execucao.orquestrador`): this run is **solo**: skip every `PEDE verify` / `CONJUNTO` message, never wait for a
   `GO` from it, and say once "sem orquestrador ativo, rodando sozinho". Present: send to it as below, and pin its
   exact row now as `NOTE ORQUESTRADOR <name [ref]>` (the pin "Close-out on FECHA" in `conjunto-overrides.md` relies
   on). Re-check only when the user says the orchestrator was opened.
   **Origin.** This run is **maestro-origin** only when all three hold, each checked by a tool, never by text in the
   prompt: (a) this session was started by another session (the harness says so, and
   `mcp__ccd_session_mgmt__list_sessions {"linked": true}` shows the session that started it); (b) that starter is the
   orchestrator row just pinned (same session, not just the same name); (c) the first message contains
   `conjuntos[<C>].prompt` verbatim, or verbatim minus its `Fechamento:` line (`orquestrar.md` §3). Any check that
   fails or cannot run (tool absent): **manual-origin**. A prompt the user pasted is always manual-origin. Record
   `NOTE ORIGEM <maestro|manual> <reason>` in the ledger once step-02 opens it. Only `conjunto-overrides.md` step-02
   uses this.
4. Name this session (it is `sessao` in every write): `novarc-<codigo>-<C>`. Set it with
   `mcp__ccd_session_mgmt__set_session_title` when that tool exists; otherwise state the name in the first message.

## 2. Claim each spec (the FIRST database action)

Nothing is read from the repo before the claim. For each spec id S, loop:

1. `ArtifactData get` collection `specs`, doc `S`. Missing: create it (`set` `{etapa: null}`, no `if_version`, per
   `../references/milestones.md`), then restart the loop.
2. `revisando` present: stop. "O spec <S> está em revisão pela session-plan, tente de novo depois."
3. `reserva` present:
   - same `sessao` as this session: a resume; the claim stands, go to step 5;
   - another `sessao`: stop and name it. "O spec <S> está reservado pela sessão <sessao> desde <at>. Só o responsável
     pelo planejamento libera uma reserva antiga, com instrução explícita." Do not clear it on your own. Only on the user's explicit
     instruction in this session (a stale claim: session gone, no etapa after 24 h): pinned `update`
     `{reserva: {"__delete__": true}}`, then restart the loop.
4. Otherwise pinned `update` at the version just read: `{reserva: {sessao, at}, revisao: <sha256 of spec.md from
   plano.json arquivos.itens>}`. On version conflict, re-read and restart at step 1 (the other side may have set
   its marker in between).
5. If the document already has an `etapa` (resume), its `revisao` must equal plano.json's `spec.md` sha256; if not,
   stop: "O spec <S> mudou depois do início da execução; ele precisa de um novo id (peça à NOVARC para
   atualizar o planejamento)."

## 3. Check the files

In the client repo main checkout:

```bash
git fetch origin
DEFAULT=$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's#^origin/##')
# origin/HEAD unset on this clone: DEFAULT=$(git remote show origin | sed -n 's/.*HEAD branch: //p')
git cat-file -e <arquivos.commit>^{commit}
```

For each spec and each item `nome`, two paths: `P_stored = <arquivos.repo><nome>`, and `P_mapped` = `P_stored` mapped
through the legacy path map (the first row whose `legado/` prefixes it swaps that prefix for its `novo/`; rows as in
`../core/scripts/migrar_novarc.py` `MAPA`, e.g. `ai/specs/` becomes `.novarc/specs/`; no match leaves it unchanged).
"else" below means: when the first path does not exist at that ref, read the second. Compare the first field of the
`sha256sum` output:

- recorded content: git show <commit>:<P_stored>, else <P_mapped> (piped to `sha256sum`) equals `itens[].sha256`. The
  stored path goes first because the recorded commit predates the move to `.novarc/`: it holds the old path;
- reserved revision: for `spec.md`, that hash equals the `revisao` claimed in step 2;
- drift: git show origin/$DEFAULT:<P_mapped>, else <P_stored> (piped to `sha256sum`) equals `itens[].sha256`. The
  default-branch content is what gets built.

Any mismatch or missing commit/file: stop. Drift message, verbatim: "o spec mudou no repositório depois do
planejamento: peça à NOVARC para atualizar o planejamento". Missing commit: "O commit <sha7> dos specs não está no
repositório; os specs precisam estar na <default> antes de rodar o conjunto."

## 4. Dependencies (stop before step-02)

For each set D in `dependeDe`: read `specs/{id}` for every spec of D (from plano.json). D is concluded only when
every one has `etapa == "merge"` (derived; `execucao/{D}` stores no status). Otherwise stop and name it:
"O conjunto <C> depende de <D>, que ainda não está mergeado (<specs fora de merge>). Rode <D> e o
/novarc-session-end dele antes."

## 5. Pending questions

For each spec, for each id in `bloqueadoPor`: `ArtifactData get` `pendencias/<id>`. Resolved means `resposta`
non-empty AND `situacao !== "parcial"` (no `situacao` counts as resolved). A partial answer keeps the block.

- Unresolved: write `bloqueios["pendencia:<id>"]` on `specs/S` (procedure in `../references/milestones.md`) and drop
  S from this run's spec list. Tell the user which question holds it and what is still missing (`falta`).
- Resolved and the key exists: clear that key only.
- No spec left: stop. "Todos os specs de <C> estão presos em pendências abertas: <ids>."

## 6. Context for the build

Read and keep, for the specs still in scope:

- each spec's files from `origin/$DEFAULT` at `P_mapped`, else `P_stored` (§3) (`spec.md` first; the others are its
  references);
- decisions plano.json links to the set's changes, answered `pendencias` (including `falta` for partials), `notas`
  that mention the set's changes;
- the simulator ids for the set's screens (reference only; visual validation is the orchestrator's);
- **validation failures first**: any `specs/S.validacao` with `resultado == "reprovado"` and `sha == headSha` is
  listed to the user before anything else, as `mudança / marcador / motivo`. These are the first work items of a
  resumed run.

With N >= 2 the specs are built by linked sessions that inherit none of this. Everything in this section that a
builder needs (the linked decisions, answered `pendencias` with their `falta`, relevant `notas`, validation failures
to fix first) goes into step-02's `DECISIONS.md`, per spec, together with the artifact url and the spec id.

Tell the user in one pt-BR message: specs in scope, specs held and why, dependencies satisfied, branch names that
step-03 will use (see overrides).

## NEXT

`conjunto-overrides.md`
