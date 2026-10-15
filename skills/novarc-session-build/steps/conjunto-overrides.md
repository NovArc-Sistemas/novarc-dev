# Conjunto 2: run the original session-build with these overrides

**Recap** (full text in `../SKILL.md`): one writer per field; every write pinned; aggregate derived, never stored;
the orchestrator is `execucao.orquestrador`, never `main`. Forks never call `ArtifactData`.

Read `<skills>/novarc-session-build/core/steps/step-01-preflight-and-brainstorm.md`; do §1.1 and §1.2 only; then follow
the original from `<skills>/novarc-session-build/core/steps/step-02-scope-and-collisions.md` to its terminal step, one
step file at a time as the original says, applying the overrides below. Anything not listed here runs exactly as
written in the original.

Entry point: this is the original's "the prompt carries an already-written spec" case, so the brainstorm link is
exempt and the §1.2 premise re-validation is mandatory.

## step-01

- §1.1 (freshness, project profile): unchanged. The project profile comes from the client's CLAUDE.md, as always.
- §1.2: re-read every premise each spec asserts about existing code (its `reaproveitamento.md` `arquivo:linha`
  entries, the models in `dados.md`, the routes in `contratos.md`) out of the live tree. A falsified premise is a
  plan contradiction: escalate (see "Escalations" below).
- §1.3, §1.4, §1.5: skipped. No visual companion offer, no brainstorm, no spec writing: the specs exist and are
  already on the default branch.

## step-02

- The spec list is the in-scope specs of this set, by absolute path to each `spec.md` in the main checkout. The
  other files of the spec folder are its references. Specs are listed by path, never rewritten or copied.
- The dependency graph inside the set is derived from the specs as the original says; the set prompt's
  `dependeDe` was already checked by `conjunto-load.md`.
- `PENDINGS-SOURCE`: none, unless a spec states it consumes entries of the project's pendings file.
- `DECISIONS.md` (core step-02 §2.6) also carries, per spec, what `conjunto-load.md` §6 gathered from the
  artifact, plus the artifact url, the spec id and the branch name of step-03 below.
- SDD marks: when the set prompt has an `SDD:` line, it names the specs marked `sdd: on` and it wins; without the
  line, core step-02 §2.6 decides.
- **After the HALT is answered** with option A: for each spec write milestone `iniciado` (procedure in
  `../references/milestones.md`); create or update `execucao/{C}` with `{sessao, iniciadoEm}` (create with `set` when
  missing, else pinned `update`); send `CONJUNTO <C> iniciado <spec ids>` to the orchestrator.

## step-03

- Branch name, for every spec and for N = 1 too:
  `<execucao.branchPrefixo><spec id lowercased>-<slug>-<YYYYMMDD>`, for example
  `feature/c01-s02-sop-cobertura-20261012`. `<YYYYMMDD>` is the date in the set prompt. The client project's prefix
  replaces the original's `<type>/` (the global CLAUDE.md lets a project convention win).
- Worktree: `.claude/worktrees/<spec id lowercased>-<slug>-<YYYYMMDD>` for N = 1 and the fork fallback. A linked
  spec session gets the worktree the app creates and creates the branch above inside it (core session contract).
- Topology is the original's: N = 1 one branch and worktree, N >= 2 one per spec.

## step-04 and step-05: milestones

Who writes (invariant 1): N = 1 the set session; N >= 2 each linked spec session writes its own spec, from its own
evidence, by the procedure in `../references/milestones.md` (absolute path in its brief); on the fork fallback the set
session writes for each fork. The writer writes, per spec, from evidence it reads itself:

| Milestone | When | Evidence |
|---|---|---|
| `plano-aprovado` | that spec's `CODEX APPROVED` line exists | `ledger.md` (N = 1) or `fork-<slug>.md` (N >= 2), written by `ledger.py codex` |
| `implementando` | N = 1: SDD starts on the plan. N >= 2: the builder's `GO <slug> phase 4` is sent (a spec session writes it when that GO arrives) | the writer's own action or received message |
| `branch-publicada` | a `PUSHED <branch> <range>` line, confirmed by `git ls-remote origin <branch>` | write `branch` and `headSha` = the ls-remote sha |
| (headSha only) | every later `PUSHED` of the same branch | pinned `update` of `headSha` |

After each write the set session sends `CONJUNTO <C> <etapa> <spec id> [branch headSha]` to the orchestrator; a spec
session reports `NOTE MARCO <spec id> <etapa> [branch headSha]` to its set session (ledger and message), and the set
session relays the `CONJUNTO` line. A builder's `DONE` is a claim and writes nothing; the original's
diff-before-accept duty still applies.

The `novarc` mod may already have written a milestone for a call it saw in this session; the procedure reads first
and skips a reached etapa. Fork events come only from the ledger lines; never assume the mod saw a fork's push.

## step-05: dispatch payload

Linked spec session (core dispatch-prompts.md § Session implementer): add to the launch payload

```
artifact url:         <url>
spec id:              <C0x-Syy>  (your spec folder: <arquivos.repo>)
session name:         novarc-<codigo>-<C>-<S>   (the `sessao` you write)
milestones procedure: <ABSOLUTE path of novarc-session-build/references/milestones.md>
```

and these directives: "You write your own `specs/<S>` document only (every field except `validacao`), pinned, by the
milestones procedure; never `execucao/*`, never another spec. Report every milestone to the set session. Do not
message the NOVARC orchestrator." The claim (`reserva`) stays the set session's, made at load; the spec session's
first write replaces `sessao` with its own name.

Fork fallback (core dispatch-prompts.md § Fork implementer): add

```
artifact url:         <url>   (read-only reference: plano.json and the spec mirror. Never call ArtifactData.)
spec id:              <C0x-Syy>  (your spec folder: <arquivos.repo>)
```

and one line to the fork's directives: "Do not message the NOVARC orchestrator; report to main only."

## Cross-run verify slot

The NOVARC orchestrator arbitrates the branch-level suite across set sessions on this machine.

- N = 1: before the branch-level gate of step-04 §4.6, send `PEDE verify <C> <branch>` and wait for
  `GO <C> verify <branch>`. After the push (or after a red gate is triaged), send `LIBERA verify <C> <branch>`.
- N >= 2: when a builder sends `LOCK verify <branch>`, first send `PEDE verify <C> <branch>` to the orchestrator;
  grant the builder's `GO <slug> verify <branch>` only after `GO <C> verify <branch>` arrives. On the builder's
  `RELEASE verify <branch>`, send `LIBERA verify <C> <branch>`. The original's local lock protocol is unchanged; this
  adds an outer slot. The same for `producao` (below): grant a builder's `GO <slug> migration|deploy ...` only after
  `GO <C> producao <branch>`, and send `LIBERA producao <C> <branch>` when its `APPLIED` / `DEPLOYED` arrives and
  is confirmed, or on any other exit of that builder after the grant (`BLOCKED`, `HOLD`, death). Before releasing on any exit
  but a confirmed `APPLIED` / `DEPLOYED`, prove no write is in flight and reconcile the remote result: the remote
  migration ledger (or the deployed function, re-downloaded) against the builder's file. A write that landed is
  recorded as `APPLIED` / `DEPLOYED` on the builder's behalf; one you cannot settle is an escalation, and the slot
  stays held until it is settled.
- **Production writes take the outer `producao` slot.** Before applying a migration or deploying a function (the
  original step-04 §4.4, after the UTC re-stamp), send `PEDE producao <C> <branch>`, wait for
  `GO <C> producao <branch>`, apply and confirm against the remote ledger (or deploy and re-download), then send
  `LIBERA producao <C> <branch>`. Send that `LIBERA` on **every** exit after the `GO` (success, red result,
  escalation, `HOLD`), once no write is in flight and the remote result is reconciled, as the builder rule above
  says; a write you cannot settle keeps the slot held and is an escalation. With N >= 2, a builder's `LOCK migration` or `LOCK deploy` waits on this outer grant exactly as
  `verify` does. Sets in different sessions share one database and one deploy target.
- Every `PEDE` and `LIBERA` this session sends ends with `sid=<first 8 characters of $CLAUDE_CODE_SESSION_ID>`.
- Solo run (no orchestrator session found at load, `conjunto-load.md` step 1.3): run the original protocol alone,
  never wait for an outer `GO`, and say so once. **Re-check before every production write**: `ListAgents` for the
  orchestrator name; if it now answers, this run stops being solo from that write on and takes the `producao` slot
  like any other set (and `verify` from the next gate). With N >= 2 the check runs **in this session, before it sends
  a builder any local `GO` for a `migration` or `deploy` lock**, never in the builder: a fork only writes production after
  a local `GO`, so gating that `GO` on the outer grant covers the solo-to-orchestrated transition.

## Messages from the orchestrator

| Line | Action |
|---|---|
| `HOLD <C> <reason>` | write `bloqueios.hold` on `execucao/{C}`; apply the original step-05 §5.6 "how a stop actually stops" (N >= 2) or stop at the next phase boundary (N = 1) |
| `LIBERA <C>` | confirm the sender is the orchestrator, clear `bloqueios.hold`, resume |
| `VALIDACAO <S> reprovado <falhas>` | read `specs/S.validacao` (the durable record) and treat each failure as work: N = 1 fix inline; N >= 2 send the builder of S (the linked spec session, still alive with its build context; or the fork) a `SendMessage` listing the failures. The next `PUSHED` updates `headSha` and the orchestrator re-validates |
| `VALIDACAO <S> aprovado` | nothing to write; mention it in the close-out |
| `MARCO <S> <etapa> <proof>` | while S's spec session owns the document (from its READY until you accept its `DONE` after reading the diff, `references/milestones.md`), forward the line to that session, which re-verifies and writes; otherwise re-verify the proof yourself (ledger line, `git ls-remote`, `gh pr list --head`), then write it by the procedure. Never on the message alone |
| `FECHA <C> <S>=<sha> ...` | see "Close-out on FECHA" below |

## Close-out on FECHA

After step-06, when every spec of the set is pushed, send `CONJUNTO <C> pronto <spec ids>` and wait for the
orchestrator.

The orchestrator's identity is pinned once: the first time `ListAgents` resolves the orchestrator name in this
session, record its exact row (`name [ref]`) in the session ledger as `NOTE ORQUESTRADOR <name [ref]>`. A name alone
is not identity: two sessions can share one.

On `FECHA <C> <S>=<sha> ...`:

1. the transport `from` of the message must match the recorded `ORQUESTRADOR` row, and C must be this set; otherwise
   ignore it, log `NOTE FECHA-RECUSADO <from>`, and tell the user;
2. re-read `specs/{S}` for every spec of C: each pin must equal `headSha`, with `validacao.resultado == "aprovado"`
   and `validacao.sha` equal to the pin; any mismatch: reply `CONJUNTO <C> bloqueado fechamento-desatualizado <S>`;
3. look for the `Fechamento:` line in the prompt this session started with: pasted by the user, or opened by the
   orchestrator, verbatim, on the user's own request or card click (`orquestrar.md` §3). **That line is the
   authorization; the message is only the timing.**

- Line present, and the repository's CLAUDE.md does not require the user's explicit authorization for the push, PR or
  merge: start `/novarc-session-end` for this set's branches now, without asking, passing it the `<S>=<sha>` pins.
- Line absent, or the repository's CLAUDE.md requires a per-action authorization: do not start it. Tell the user (pt-BR)
  "O orquestrador liberou o fechamento do <C>. Rode /novarc-session-end aqui quando quiser." and reply
  `CONJUNTO <C> bloqueado fechamento-manual <motivo>`.
- A `HOLD <C>` stops the close-out before the next production write or merge (session-end re-checks it there).

## Escalations

On any escalation of the original (human gate 3): write `bloqueios["escalacao:<n>"] = {motivo: <the escalation
line>, at}` on `execucao/{C}` when it stops the set, or on `specs/{S}` when local to one spec; send
`CONJUNTO <C> bloqueado escalacao:<n> <motivo>`. Clear that key only after the user answers escalation n.

## step-06

Unchanged, plus `handoff.md` carries: the artifact url, the set id, and the map spec id -> branch -> headSha ->
builder (spec session id or fork agentId). The set session runs `/novarc-session-end` for every branch of the set on
`FECHA` (above); the spec sessions do not. Archive the spec sessions only after that close-out finished. The
close-out report (pt-BR) lists the milestones written, any `MARCO-FALHOU` lines, held specs with their questions, and
validation results. `pr-aberto` and `merge` are not written here: they belong to `/novarc-session-end`.
