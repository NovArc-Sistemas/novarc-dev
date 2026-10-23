---
name: novarc-session-build
description: Use when a NOVARC planning artifact drives the build - "/novarc-session-build conjunto <link> C01", "/novarc-session-build orquestrar <link>", "roda o conjunto", "orquestra os conjuntos". Mode conjunto builds one set (conjunto) of specs by running the original session-build by reference with a short override list, writing milestones to the artifact database. Mode orquestrar coordinates the set sessions (builder budget, one verify slot at a time, visual validation against the simulator). NOT for a build without a NOVARC planning artifact (use a plain session-build flow), NOT for planning or writing specs (NOVARC's planning skills do that), NOT for closing a branch (use novarc-session-end).
---

# NOVARC Session Build

A thin variant of session-build. It takes its context from a NOVARC planning artifact and writes execution state
back to the artifact database. The base skill ships inside this one, in `core/` (a copy of session-build that this
plugin owns and may change on its own); this file and `steps/` list only the overrides. "The original" below always
means `core/`.

`<skills>` is the parent of this skill's base directory (the path Claude Code states when the skill loads): the
novarc plugin's `skills/` folder. `CORE` = `<skills>/novarc-session-build/core`. Inside `core/`, `<skill-dir>` and
relative paths such as `scripts/ledger.py` resolve against `CORE`.

**Announce at start (pt-BR):** "Usando novarc-session-build no modo `<modo>` para o planejamento `<codigo>`."

## Install check (first action)

```bash
for f in SKILL.md steps/step-01-preflight-and-brainstorm.md steps/step-02-scope-and-collisions.md scripts/ledger.py; do
  test -e "<skills>/novarc-session-build/core/$f" && echo ok $f || echo MISSING $f
done
test -e "<skills>/novarc-codex-review/SKILL.md" && echo ok novarc-codex-review || echo MISSING novarc-codex-review
```

Any `MISSING`: stop and tell the user (pt-BR): "O plugin novarc está incompleto. Reinstale o plugin novarc
(marketplace novarc-skills) e rode de novo."

## Modes

| Invocation | Mode | Read next |
|---|---|---|
| `/novarc-session-build conjunto <artifact url> <C0x>` (the set prompt) | `conjunto` | `steps/conjunto-load.md` |
| `/novarc-session-build orquestrar <artifact url> [C01 C02 ...]` | `orquestrar` | `steps/orquestrar.md` |

No mode, or a mode without an artifact url: ask once for the set prompt or the url.

## Invariants

Everything in the original session-build invariants applies unchanged. Read it once at start:
`<skills>/novarc-session-build/core/SKILL.md`. If that file and this one disagree on anything this file does not
explicitly override, the original wins. Where the original says `codex-review`, run the `novarc-codex-review` skill.

NOVARC additions, binding in both modes:

1. **One writer per field.** The set session (the session-build main thread: inline builder when N = 1,
   session-build orchestrator when N >= 2) is the only writer of `execucao/{C}`. Each `specs/{id}` document, every
   field except `validacao`, has exactly one writer: the session that builds that spec. N = 1: the set session.
   N >= 2: that spec's linked session during its build phase, and the set session before and after it, by the
   ownership-by-phase table in `references/milestones.md` (the `novarc` mod loaded in the spec session writes the
   milestones of its own pushes); on the fork fallback the set session writes for the fork, because forks never
   call `ArtifactData`. The `novarc` mod loaded in the set session also writes `execucao/{C}.espelho`, the mirror of
   the set's ledger; a spec session never writes it. A spec session
   never writes another spec's document or `execucao/*`. The NOVARC orchestrator writes ONLY `specs/{id}.validacao`
   and, through its mod, the singleton `config/orquestracao` (slots, thresholds); never `execucao/*`.
2. **Derived, never stored.** `execucao/{C}` stores only `{sessao, iniciadoEm, bloqueios, espelho}`; `espelho`
   mirrors the ledger on disk (outstanding locks, each spec's last checkpoint, the rhythm), so it is not derived from
   other documents. A set's etapa, branches,
   PRs, validation state and displayed status are computed on read from its `specs/{id}` documents
   (`references/milestones.md`, "Derivation").
3. **Every write is pinned.** `get`, then `update` with `if_version` of the writer's own fields only. `set` only to
   create a missing document (no `if_version`). Never `set` over an existing document.
4. **The orchestrator has a name.** It is `execucao.orquestrador` from plano.json, addressed by that name with
   `SendMessage`. Never `"main"` for set session to orchestrator traffic. Inside a set, builders report to their
   own set session: linked spec sessions to its `local_...` id, forks with `SendMessage to: "main"`. Only the set
   session talks to the NOVARC orchestrator.

## Message vocabulary (one line each, at the start of the message)

| Direction | Line | Meaning |
|---|---|---|
| set -> orq | `CONJUNTO <C> <etapa> [detail]` | a spec of the set reached a milestone; detail names the spec, branch, headSha or PR |
| set -> orq | `PEDE verify <C> <branch>` | asks for the cross-run verify slot before a branch-level suite |
| set -> orq | `LIBERA verify <C> <branch>` | releases the slot |
| orq -> set | `GO <C> verify <branch>` | slot granted |
| orq -> set | `HOLD <C> <reason>` | set session writes `bloqueios.hold` and holds at the next phase boundary |
| orq -> set | `LIBERA <C>` | hold lifted; set session verifies and clears `bloqueios.hold` |
| orq -> set | `VALIDACAO <C-Sxx> <aprovado\|reprovado> <falhas>` | courtesy copy of the durable `specs/{id}.validacao` |
| orq -> set | `MARCO <C-Sxx> <etapa> <proof>` | reconciliation: a milestone the orchestrator observed in git or the ledger that the database lacks; the set session forwards it to the spec session while that session owns the document (until its `DONE` is accepted), otherwise re-verifies the proof and writes it |

Reply to an incoming message by copying its `from` attribute as `to`.

## Authorization

Identical to session-build's (invariant 1 of the original), for the specs of this set only, plus: writes to the
artifact database collections `execucao` and `specs`, own documents only, with the field ownership above. A spec
session is authorized for its own `specs/{id}` document only. Never a PR,
never a delivery merge, never a hook bypass. The orchestrator mode builds nothing and writes no code.

## Red flags - stop

- About to write `execucao/*` or another set's `specs/*` document from this session, or any field but `validacao`
  from the orchestrator.
- About to `set` over an existing document, or to write a stored aggregate (etapa, status, branches) on `execucao/{C}`.
- About to skip session-build step-01 §1.1 or §1.2 (only §1.3 to §1.5 are skipped).
- About to build a spec whose `spec.md` hash differs from plano.json, from the reserved `revisao`, or from
  `origin/<default>`.
- About to address the NOVARC orchestrator as `main`.
- About to clear a `bloqueios` key without re-checking its specific cause.
- About to let a fork call `ArtifactData`.
- About to write, from a spec session, another spec's document or any `execucao/*` document.
- About to message the NOVARC orchestrator from a spec session (only the set session talks to it).
