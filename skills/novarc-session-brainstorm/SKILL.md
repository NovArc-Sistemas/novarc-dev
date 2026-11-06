---
name: novarc-session-brainstorm
description: Use when NOVARC plans a feature or module for a client and the plan must become a planning artifact — "/novarc-session-brainstorm", "planeja isso", "monta o planejamento", "cria o artefato de planejamento", "simula essa tela", "leva esse brainstorm para o template", "atualiza o planejamento", "migra o planejamento para o template". Runs the brainstorm, resolves everything the repository and database can answer, builds simulators faithful to the real UI, fills plano.json (changes with evidence, decisions, pending questions, phases) and publishes a duplicate of the NOVARC planning template, then keeps iterating with the user until nothing is left behind. NOT for implementing the plan (that is /session-build) and NOT for a one-off mockup with no plan around it.
---

# Planejamento NOVARC

Idea in → a published planning artifact (NOVARC template duplicate) that a client can approve and a team can build
from, with nothing from the conversation left behind.

**Announce at start:** "Usando a novarc-session-brainstorm para levar isso até o artefato de planejamento."

Talk to the user in Brazilian Portuguese. Everything inside the artifact is pt-BR, sentence case, no em dash, no emoji.

## The template

- **This skill's `template/` folder is the only source.** Shell: `index.html`, `plano.schema.json`, `TEMPLATE.md`,
  `entrevista-pendencias.md`, `ferramentas/`. Worked example: `template/exemplo/` (`plano.json`, `sims/compras.html`,
  `specs/`), a fictitious project (`EXM-ERP-COMPRAS`) that lights every section of the page.
- **Read `template/TEMPLATE.md` before anything else.** It is the contract: plano.json rules, the simulator contract,
  database collections, capabilities to declare, product rules decided by NOVARC, and the verification steps.
- The published template (https://claude.ai/artifact/Q3UMRWUdB25AXzDRBFGRLf) is a **vitrine** generated from this
  folder by `ferramentas/montar-exemplo.js`. Never edit it by hand and never read the shell from it.
- Never edit `index.html` inside a planning duplicate. Shell improvements come with new versions of this plugin.

## Modes

| The user says | Mode |
|---|---|
| a new idea, module, or feature to plan | **Novo**: steps 1 to 7 |
| "atualiza o planejamento", feedback on an existing artifact | **Atualizar**: read the artifact (`Artifact` read with its `url`), then steps 3 to 7 on its files, republish with `url` |
| "migra o que fizemos na outra sessão para o template" | **Migrar**: step 2 (inventory) on the source material, then 3 to 7 into a new duplicate |

## Steps

### 1. Context and brainstorm

- Read the project's CLAUDE.md and the docs it points to (architecture, decisions, backlog). Decisions already
  recorded are not asked again.
- Brainstorm one question at a time, in prose, each with a recommendation and its trade-off. No A/B/C pickers.
- Ask only what changes the work. Everything else: state the assumption and keep going.

### 2. Inventory (nothing left behind)

Keep a running inventory, in a scratch file, of every point the user raised, each mapped to exactly one of:
`mudanca`, `decisao`, `pendencia`, `aberto` (tech debt), or "out of scope, because ...". Re-read the whole
conversation (and, in Migrar mode, the source session's transcript or artifact) before step 6. An unmapped point is
a bug.

### 3. Resolve before asking

Before an item becomes a `pendencia`, try to answer it from the repository, its docs, and read-only database
queries. Map the complete flow (sync, reconciliation, crons, retries) and cite `arquivo:linha` for every component;
never conclude from one service. Only what the code and data cannot answer becomes a pending question, written as
"what we already know (with the source)" plus "the exact question" plus "who answers".

Database access is read-only. Never print credentials. Follow the project's own rules for how to reach its database.

### 4. Simulators

Follow `referencias/simulador-fiel.md`; its "Hard rules (MUST)" are not optional. Short version: one self-contained
HTML file per simulator, built from the real repository (tokens, components, icons, copy, layout), with data shaped
like the real data, and the contract in TEMPLATE.md (`state.screen`, `go()`, `data-chg` on every change, `data-go`
on every navigation, marker toggle, NOVARC prototype bar, no planning panel of its own). Before drawing, write the
inventory of each real screen with `file:line`; rebuild it 1:1 (never a simplified stand-in) with the always-on
chrome on every screen: the client's real logo file, menu, header icons, view-as bars, floating launchers, tagged
`data-chrome="logo|nav|header-actions"`. Field rules that exist as code are compiled in, not retyped. Mobile goes in
a phone frame. `checar-simulador.js` with `falhou: true` or a mismatch against the inventory blocks publishing.

When the client has feedback tickets for the area being planned, triage them into `plano.json` `tickets[]` (original
text, what the investigation found, the solution, `decisao`, the changes that deliver it): the bench gets a ticket
selector that shows each ticket and only its changes.

When the flow crosses several parts of the system (customer site and staff admin, plus the WhatsApp and e-mail that
the system sends), build one simulator with shared state and surfaces side by side (`superficies`, `state.telas`), list
every message in `mensagens[]` with a preview, and set `hoje: true` when the plan changes something that exists today
(an e-mail, a copy), so the client compares before and after in the bench. Mark screens that already exist with
`existe: true`. Section 5 of `referencias/simulador-fiel.md` has the pattern.

### 5. plano.json

Follow `template/plano.schema.json`. Every change: id equal to its `data-chg`, the screen, the phase, the "what and
why" in business language, and at least one proof in `refs`. Links in both directions (change ↔ decision, change ↔
pending). Phases with goal, dates, executor and verifiable "pronto" criteria.
Tech debt the code can fix goes into the plan as a change with `tecnica: true` (`telaId: "*"`, no marker), placed in
the phase that touches that code, and its `abertos[]` entry points to it with `mudanca`. New changes go at the end of
the list so published marker numbers never shift.
Hours and dates are Claude session time, not people time (Claude implements, an operator approves plans, reviews
PRs and validates): follow the rule in TEMPLATE.md "Regras de produto". Before specs exist, estimate a phase from
its expected specs (about 3 to 5.5 session hours each); once session-plan has run, its numbers replace yours. `fluxo` (who approves, who builds)
decided with the user once.

### 6. Verify

All of TEMPLATE.md "Verificação", in order, with fresh output:

```bash
node template/ferramentas/validar-plano.js <pasta>
node template/ferramentas/verificar-pagina.js <pasta>
```

then the browser checks (`checar-simulador.js` inside the simulator, and the bench opened from a local server). The
published artifact cannot be loaded in Claude's browser (login), so verify locally before publishing.

### 7. Publish and hand off

- New planning: publish a NEW artifact as TEMPLATE.md step 6 says (exact capabilities, `icon: "plan"`, and `title`
  `Planejamento <cliente> · <nomeCurto>`, 2 to 5 words, from `projeto.nomeCurto`; the shell carries no `<title>`, so
  without `title` the artifact gets a generic name). Pass the same `title` on every republish.
  Updating: republish with `url`; database state is kept.
- Tell the user, in pt-BR, what was published and what to share: `projetos@novarcsistemas.com` as Editor, the client
  as Collaborator by e-mail invite (never an open link). The agent cannot change sharing.
- List the open pending questions grouped by who answers, and the next decision the user owes.
- **Record this session's active hours** (every publish and republish, so the number grows with the session):
  ```bash
  node <this skill>/scripts/horas-ativas.mjs --session "$CLAUDE_CODE_SESSION_ID"
  ```
  For each `dias[]` entry, `ArtifactData set` `horas/<first 8 chars of sessao>-<data>` with `{data, minutos,
  fase: null, pessoa: <name of the person who conducts>, branch: null, sessao, transcript, resumo: "Planejamento (novarc-session-brainstorm)"}`
  (`sessao` and `transcript` exactly as the script prints them: the full id is how the user finds the jsonl). `get`
  each id first: missing, `set` with no `if_version`; existing (a rerun the same day), pinned `update` with
  `if_version` = the version read and all the fields, because a `set` over an existing document is refused. One id per
  day replaces the day's number on a rerun, never duplicates it (same procedure as
  `novarc-session-build/references/horas.md`). A planning session started before the
  artifact existed counts whole: it is the work that produced it. Active hours count only what the user typed (mid-turn
  messages included); injected messages, notifications and reminders never do. Tell the user the total in the hand-off.
- **Record this session's execution hours** too (Claude's work time, subagents included), on the same publishes:
  ```bash
  node <this skill>/scripts/horas-ativas.mjs --session "$CLAUDE_CODE_SESSION_ID" --execucao
  ```
  For each `dias[]` entry, `ArtifactData set` `horas/<first 8 chars of sessao>-<data>-exec` with the same fields plus
  `tipo: "execucao"`, `minutos` from the entry (principal + subagentes) and `tokens` from the entry (`{entrada, saida,
  cacheCriacao, cacheLeitura, total}`, session plus subagents, each API response once). The page shows one row per
  `sessao` with active hours, execution hours and tokens side by side. Method: inside a turn (user line to the
  assistant line with stop_reason end_turn) the time between consecutive lines is work, each gap capped at 10 min;
  between turns nothing counts. Limits: model and tool time are not split, an open permission prompt counts up to
  the cap, and subagents are summed (work done), with `uniao` as the wall time. The `pessoa` is the owner of the
  session that generated the hours.

## Iterating with the user

Each round of feedback: update the inventory, then plano.json and the simulators, then verify, then republish. A
point raised in feedback is never dropped silently: it lands in the plan or is answered with why not.

## Rules learned the hard way

- Light NOVARC look only. More visual is welcome; dark theme is not. The visual concept (technical drawing set) and
  the motion rules are in TEMPLATE.md; keep them when touching the shell.
- Motion runs once per block and is gated by `html.anim`; never gate content visibility on `requestAnimationFrame`
  or on an IntersectionObserver alone (hidden tabs never fire them and the page stays blank).
- Changes, decisions, pending questions and videos live only inside the simulator bench, never as page sections.
- Videos are linked to a simulator.
- No guided onboarding tours (built and rejected).
- The page cannot read viewer e-mails (`user` scope `email` is refused): internal area = owner or Editor.
- Simulators adapted from older versions: hide their own planning panel AND neutralize the inline `padding-right`
  it sets on `#main`, or the screens keep an empty strip on the right.
- Grid/segmented controls get `align-self: center` inside flex bars, or they stick to the top.
- The bench side panel needs `min-width: 0` on its children, or long tab rows stretch it off screen.
- "Faithful" means the look in production, not the brand palette from a brief. With no screenshot, rebuild it from
  the repository's theme (Tailwind config, LESS/Sass variables and overrides, admin templates) and copy the real
  templates (e-mail HTML, message texts); a simulator drawn from brand tokens alone was rejected as "not our system".
- Inside a simulator, prefix the tool's own classes (prototype bar, scenario controls): a generic class shared with
  the simulated UI (`.bar` in a chart rule) collapsed the tool header to a few pixels.
- `state` is a `const`, not a `window` property: tools and tests read it with `frame.contentWindow.eval('state.screen')`.
