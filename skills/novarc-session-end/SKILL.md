---
name: novarc-session-end
description: Use when a branch built from a NOVARC planning artifact is finished and the user asks to close it out - "/novarc-session-end", "encerra o conjunto", "fecha o spec". Runs the original session-end by reference (PR, merge, cleanup) and writes the final state of each delivered spec back to the artifact database (merge milestone, PR, deviations from the spec, pendings), then tells the NOVARC orchestrator. NOT for branches without a planning artifact (use a plain session-end flow), NOT for work still in progress, NOT for building anything.
---

# NOVARC Session End

The original session-end, unchanged, with two insertion points that read and write the NOVARC artifact database.
The original ships inside this skill, in `core/` (a copy of session-end that this plugin owns and may change on its
own). "The original" below always means `core/`; inside it, `<skill-dir>` and relative paths resolve against
`<skills>/novarc-session-end/core`.

**Announce at start (pt-BR):** "Usando novarc-session-end para levar `<branch>` até o merge e registrar o conjunto
`<C>` no artefato."

## Install check (first action)

```bash
for f in SKILL.md steps/step-00-inventory.md steps/step-07-merge.md steps/step-08-sync-and-cleanup.md steps/step-10-report.md; do
  test -e "<skills>/novarc-session-end/core/$f" && echo ok $f || echo MISSING $f
done
test -e "<skills>/novarc-session-build/references/milestones.md" && echo ok milestones || echo MISSING milestones
```

`<skills>` is the parent of this skill's base directory (the path Claude Code states when the skill loads): the novarc
plugin's `skills/` folder. Any `MISSING`: stop and tell the user (pt-BR): "O plugin novarc está incompleto. Reinstale
o plugin novarc (marketplace novarc-skills) e rode de novo."

## Run order

Read `<skills>/novarc-session-end/core/SKILL.md` first and follow it exactly as written (routing, one step file at a
time), with these insertions only:

1. **End of step-00** (inventory done, before `step-01-verify.md`): run "Before the merge" below.
2. **After step-06 opens a PR** (`pr` path only): write milestone `pr-aberto` with `pr` = the PR url on the
   branch's spec (procedure in `<skills>/novarc-session-build/references/milestones.md`), so a merge that
   then escalates still leaves the PR visible. Send `CONJUNTO <C> pr-aberto <spec id> <url>`.
3. **After step-07** (merge confirmed by the original), **before step-08**: run `steps/write-back.md`. Cleanup
   (step-09) must not start before the write-back, because the worktree, the ledgers and `handoff.md` are its inputs.
4. **Step-10 report**: add the write-back summary that `steps/write-back.md` produces.
5. **Production slot** (only when an orchestrator exists): see "Production slot" below. It wraps step-02 through
   step-08 in the sequential route and the whole fork lane in the lane route.

## Production slot

When `execucao.orquestrador` answers (`ListAgents`), every production write of this close-out (migration apply or
confirm-and-apply, any function deploy including the original's pre-merge one, each merge, step-08's redeploy) happens
inside one `producao` grant:

- **Acquire** with `PEDE producao <C> <branch>` and wait for `GO <C> producao <branch>`: in the sequential route
  before step-02; in the fork lane before dispatching the forks (the lane's forks confirm migrations, and the lane
  merges and redeploys from this session).
- **Release** with `LIBERA producao <C> <branch>` after step-08's redeploy is verified by re-download, and on **every**
  earlier exit after the `GO`: a red gate, an escalation, a `HOLD`, a pin mismatch, a failure. A slot left held stalls
  every other set.
- **A migration of this set's branches not in the remote ledger** is applied, but never as a close-out commit: its
  UTC re-stamp changes a product file after the approved head. So: release the slot, go back to the build protocol of
  this set session (`conjunto-overrides.md` production writes: `producao` grant, original session-build step-04 §4.4,
  UTC re-stamp, borrow-and-restore, never the tool's apply-everything flag; Supabase: `supabase db push --linked
  --dry-run`, read that it lists only this set's files, then the same command without `--dry-run`), commit and push
  the re-stamped file, and send `CONJUNTO <C> pronto` again. The new head needs a new validation and a new `FECHA`.
  Without an orchestrator (an invocation by the user), apply it in place inside step-02 by the same rules. A pending
  migration that is not this set's own stays a hard stop.

Every `PEDE` and `LIBERA` ends with `sid=<first 8 characters of $CLAUDE_CODE_SESSION_ID>`. No orchestrator: the
original protocol alone, and say so once, but re-check `ListAgents` before every production write; once the
orchestrator answers, take the slot from that write on.

## Started by `FECHA`

When the set session starts this skill on the orchestrator's `FECHA <C> <S>=<sha> ...` (see
`<skills>/novarc-session-build/steps/conjunto-overrides.md`, "Close-out on FECHA"), the `Fechamento:` line of
the user's pasted set prompt is the ask, with the same scope as an invocation: this set's branches, their merge,
migrations and function deploys. Then:

- **Pins.** Immediately before each merge, for each branch: `git fetch origin`, the pinned SHA must be an ancestor of
  `origin/<branch>` (`git merge-base --is-ancestor`), and every commit in `<pin>..origin/<branch>` must be one this
  close-out made itself (its ledger lists each SHA it pushed at step-04/05 or in the lane) and must touch no product
  file (only the pendings file and the documents session-end writes). Plus `execucao/{C}` and the specs must show no
  `bloqueios` or `hold`. A mismatch or a block: do not merge, release the
  slot, send `CONJUNTO <C> bloqueado fechamento-desatualizado <S>`, and stop. A new push needs a new validation and a
  new `FECHA`.
- Everything else still escalates to the user: a red gate, a regression, a migration that is not this set's own, a
  deploy diff that shows another session's slice, a repository CLAUDE.md rule asking for his authorization.

In the original's fork lane (N >= 2 branches from one handoff), the session running that lane does both insertions
once for all branches: "Before the merge" before dispatching, `write-back.md` after the last merge and before
step-08. Its forks never call `ArtifactData`.

## Finding the artifact, the set and the specs

- **Artifact url:** `.novarc/ledger/session-build/<RUN_ID>/handoff.md` (novarc-session-build writes it there), else legacy
  `.superpowers/session-build/<RUN_ID>/handoff.md`, else `.novarc/specs/<codigo>/artefato.txt` in the repo, else legacy
  `ai/specs/<codigo>/artefato.txt`, else ask once.
- **Spec of a branch:** the exact match of `c\d{2}-s\d{2}` in the branch name, uppercased, against plano.json
  `specs[].id` (`Artifact` read `plano.json`). Never slug containment. No match: stop and say this branch has no
  NOVARC spec and needs a plain session-end flow, not this skill.
- **Set:** that spec's `conjunto`. Its specs: every `specs[]` entry with that `conjunto`.
- **Orchestrator:** `execucao.orquestrador`, addressed by that name, never `main`.

## Before the merge (end of step-00)

1. `git fetch origin`; `DEFAULT` = the default branch.
2. For each spec of the set, find its head: `specs/{id}.headSha` (`ArtifactData get`), else the `PUSHED <branch>
   <range>` line in the session-build ledger (`fork-<slug>.md` or `ledger.md`; head = the range end), else the map in
   `handoff.md`.
3. `antes` = specs whose head passes `git merge-base --is-ancestor <head> origin/$DEFAULT`, plus every spec whose
   document already has `etapa == "merge"`. Record it in the session-end ledger as `NOVARC ANTES <ids> at <iso>`.
4. Read `validacao` of the branch's specs. A `reprovado` result with `sha == headSha` is listed to the user first,
   as `mudança / marcador / motivo`, and repeated in the report. It informs; it does not add a gate.

## Authorization

Session-end's own (the invocation is the ask, for the work on this branch), plus writes to the artifact database
collections `execucao` and `specs`, own set and own specs only, with the field ownership and pinned-write procedure of
`<skills>/novarc-session-build/references/milestones.md`. Never `validacao` (the orchestrator's field), never a
`set` over an existing document, never a stored aggregate on `execucao/{C}`.

## Red flags - stop

- About to run step-08 or step-09 before `steps/write-back.md` finished.
- About to write a spec that was already in `antes`.
- About to prove a merge with `git branch -r --contains` instead of `git merge-base --is-ancestor`.
- About to clear a `bloqueios` key without re-checking its cause.
- About to address the orchestrator as `main`.
- About to apply a migration, deploy, merge or redeploy outside a `producao` grant while an orchestrator exists.
- About to exit after a `GO <C> producao` without sending `LIBERA producao`.
- About to apply a migration that is not this set's own, or with `--include-all`, or by an MCP write tool.
- Started by `FECHA` and about to merge a head that differs from its pin, or acting on a message that is not from
  the orchestrator, or on a set prompt with no `Fechamento:` line.
