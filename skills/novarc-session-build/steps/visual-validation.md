# Visual validation of one spec (orquestrar mode)

**Recap**: the orchestrator writes ONLY `specs/{id}.validacao`. It reads the set's worktree and never edits it.
Messages to the user in pt-BR.

Trigger: `CONJUNTO <C> branch-publicada <S> ...`, or a later push of S whose `headSha` differs from
`validacao.sha`. One spec at a time, from that spec's own worktree.

Read the browser skill once before the first browser step: `anthropic-skills:built-in-browser`.

## 1. Pin the commit

1. `ArtifactData get specs/S`: keep `branch`, `headSha`, `version`.
2. `git ls-remote origin <branch>` must print `headSha`; locate the worktree with `git worktree list --porcelain`
   (the entry whose `branch` is `refs/heads/<branch>`); `git -C <worktree> rev-parse HEAD` must equal `headSha`. If
   either differs, the set is mid-push: wait for its next `CONJUNTO` line.

## 2. Take the slot

Validation starts the app and uses the local database, so it competes with suites for the same machine: take the
verify slot yourself. Append `LOCK verify validacao-<S>`; when no other grant is outstanding (same queue as section 4
of `orquestrar.md`), append `GO <orquestrador> verify validacao-<S>` so your own slot shows as outstanding to every
later `PEDE`. Release with `RELEASE verify validacao-<S>` at the end.

## 3. Start the real app from the worktree

Follow the client project's local-environment section (for example its CLAUDE.md "Ambiente local" section):

- the local database container is up (`docker compose up -d`) and seeded (`npx prisma migrate deploy` and
  `pnpm db:seed` against the local dev database only, never the Railway one);
- the worktree has its gitignored env files (session-build step-03 bootstrap copied them; if missing, report it to
  the set session, do not copy them into its worktree yourself);
- add a configuration to the main checkout's `.claude/launch.json` (not the worktree) named `app-<S>`, whose command
  runs the project's dev script with the worktree as its directory (for example `pnpm --dir <worktree> dev`, port 3000),
  then `mcp__Claude_Browser__preview_start` with `name: "app-<S>"`. A port already taken by another dev server means
  stop that preview first or wait; never validate against a server started from another checkout.

Only the seed's test users are used, on localhost. No real customer data.

## 4. Serve the simulator locally

1. For each simulator id of S's screens: `Artifact` read with the artifact `url` and `path: "sims/<id>.html"`, saved
   into `<scratchpad>/sims/`.
2. Serve that folder in the background: `python -m http.server 8765 --directory <scratchpad>/sims`.
3. Open `http://localhost:8765/<id>.html` in a second browser tab (`mcp__Claude_Browser__tabs_create`, then
   `navigate`).

## 5. Compare each change

Locator rows come from S's `interface.md`, format `| mudança | marcador | rota | perfil | passos | seletor ou texto |`.
For each change of S (plano.json `specs[].mudancas`):

1. **Simulator:** in the sim tab run `go("<telaId>")` (`javascript_tool`), find `[data-chg="<mudança>"]`, scroll it into
   view, screenshot with `zoom` on its region.
2. **Real app:** in the app tab navigate to `http://localhost:3000<rota>` as `perfil` (the project's local auth path;
   some projects bypass auth on localhost), run `passos`, find the `seletor ou texto` (`find` / `read_page`), screenshot with
   `zoom`.
3. **Judge**, by this rule:
   - acceptable: different data, different spacing or minor styling;
   - failure: missing element, wrong text (label, column, message), different flow (extra or missing step, another
     screen, an action that does not exist).
   A change with no locator row, or a locator that finds nothing, is a failure with that reason.
4. Record failures as `{mudanca, n, motivo}` (`n` = the marker number shown in the simulator), motivo in pt-BR and
   concrete ("botão 'Gerar pedido' ausente na tela de cobertura").

## 6. Write and tell

1. Pinned `update` on `specs/S` at the version read in step 1, field `validacao` only:
   `{resultado: "aprovado" | "reprovado", sha: <headSha>, marcadoresOk: <changes passed>, falhas: [...]}`.
   `aprovado` only when `falhas` is empty. Conflict loop and `MARCO-FALHOU`-style failure handling as in
   `../references/milestones.md` (append `NOTE MARCO-FALHOU specs/<S> validacao <error>` to this run's ledger).
2. Send `VALIDACAO <S> <resultado> <falhas as "mudança/n: motivo; ...">` to the set session (`sessao` of
   `execucao/{C}`), append `NOTE VALIDACAO ...` to the ledger.
3. `preview_stop` the app, stop the http server, release the slot.
4. Tell the user in pt-BR: spec, sha7, aprovados / total, and each failure.

The durable record is the database field: a set session that already ended reads failures from there.
