# Building a faithful simulator

The simulator is what the client approves. If it looks like a generic mockup, the client approves something that
will not exist. Build it from the real repository, every time.

## Hard rules (MUST)

These are not style advice. NOVARC has had to ask for each of them more than once; a simulator that breaks one is
a bug, fixed before publishing, never explained away.

1. **Inventory first.** Before drawing a screen, write its inventory in the scratch file: every component the real
   screen renders, top to bottom, with `file:line` (layout, sidebar, header, page header, switchers, status cards,
   toolbar, table and its columns in order, dialogs, empty states). After drawing, diff the simulator against that
   inventory, screen by screen. Every mismatch is a bug.
2. **1:1 from the real components.** Every screen the plan touches is rebuilt from the real component files: same
   page header, switchers, buttons, status cards, toolbar labels, table columns in the same order, dialog header,
   and copy copied verbatim (labels, placeholders, empty states, number and date formats). Cite the files with
   `file:line` in `plano.json` `simuladores[].fonte`. Never a simplified stand-in, never invented copy.
3. **Changes are drawn on the real screen.** A change that adds a column, a filter or a button is drawn ON the
   faithful screen, and the `data-chg` marker sits only on the added element, not on the whole card or table.
4. **Always-on chrome on every screen.** Whatever the real app layout renders around the page is in the simulator,
   on every screen, including detail pages: the real sidebar or menu with its items in order, the client's REAL
   logo asset copied from the repository (an `<img>` of the actual file, inlined as a data URI or copied next to
   the simulator; or the real `<svg>` copied verbatim), never a text logo, an initial in a box or a hand-drawn
   logo; the user block; persistent header icons (notifications bell, agents, integrations status, avatar);
   impersonation or "view as" bars; floating assistants and launchers; feedback widgets. Tag them so the check can
   find them: `data-chrome="logo"` on the logo `<img>`/`<svg>`, `data-chrome="nav"` on the menu,
   `data-chrome="header-actions"` on the persistent header icons. `checar-simulador.js` fails a screen without them.
5. **Rules come from code, not from retyping.** When the client repository has field definitions, options,
   visibility and required rules as code, compile or import that code into the simulator (for example an esbuild
   bundle of the rules files inlined in a `<script>`) instead of retyping it. Data shapes come from read-only
   queries (section 2).
6. **Right form factor.** A mobile simulator renders inside a phone frame (real device width, status bar, safe
   areas, the app's real bottom navigation); a desktop simulator renders at desktop width with the real layout.

## 1. Read the real UI before drawing anything

Look these up in the client's repository and note the exact values (file:line):

| What | Where it usually lives |
|---|---|
| Stack, CSS framework, icon library and versions | `package.json` of the web app |
| Design tokens (colors, radius, fonts, spacing) | `tailwind.config.*`, CSS variables in `index.css` / `globals.css`, theme files |
| App shell (sidebar, header, page header, content padding, max width) | `Layout`, `Sidebar`, `Header`, `PageHeader` components |
| Building blocks (card, table, button variants, badge, input, modal, tabs, empty state) | `components/ui/*` or the most reused components |
| Copy conventions (labels, number and date formats, currency, empty states) | the screens closest to the feature |
| Navigation items and their order | the router and the sidebar config |

Copy class strings verbatim. Same font, same icon set (same names), same sidebar width, same table density. When
the real app has a width limit and the plan changes it, the change is a marker, not a silent difference.

## 2. Shape the data like the real data

Seed data drives credibility and catches design errors (a column that never fits, a status nobody uses).

- Use read-only queries to learn shapes and magnitudes: counts per status, typical ranges, longest names, how many
  warehouses or channels exist, real enum values. Follow the project's own rules for database access; never print
  credentials; never write.
- Seed with realistic magnitudes and real vocabulary (status names, warehouse names, channel names) but no personal
  data of the client's customers. Product names and SKUs of the client's own catalog are fine.
- The prototype bar says "dados de exemplo, não são números reais".

## 3. Architecture (one self-contained HTML file)

Libraries the artifact allows: `https://cdn.tailwindcss.com/<exact version>` (with the real `tailwind.config`
inline), icons from unpkg or cdnjs with an exact version, fonts from Google Fonts. Everything else inline.

```js
const state = { screen: 'home', papel: 'Comercial', /* ... */ };        // state.screen is read by the bench
const SCREENS = { home: viewHome, detalhe: viewDetalhe /* ... */ };
function go(screen, opts = {}) { Object.assign(state, opts, { screen }); render(); }
function render() { document.getElementById('view').innerHTML = SCREENS[state.screen](); /* icons, modals */ }
document.addEventListener('click', (e) => {                              // one delegated handler, data attributes
  const t = e.target.closest('[data-go],[data-act]'); if (!t) return;
  if (t.dataset.go) return go(t.dataset.go);
  /* ... */
});
```

Markers: number and type come from plano.json, so there is one source of truth. Load it at start and render
`M(id)` on every element that carries a change:

```js
let MARK = {};
fetch('../plano.json').then((r) => r.json()).then((p) => { MARK = Object.fromEntries(p.mudancas.map((m) => [m.id, m])); render(); }).catch(() => {});
const M = (id) => MARK[id] ? `data-chg="${id}" data-n="${MARK[id].n}" data-t="${MARK[id].tipo}"` : `data-chg="${id}"`;
// <div ${M('cart-tr')} class="...">
```

Marker CSS (keep the badge `pointer-events: none`):

```css
:root { --mk-novo: #c026d3; --mk-alt: #d97706; --mk-reuso: #0d9488; --mk-disc: #64748b; --proto: #4a044e; --proto-fg: #fdf4ff; }
.mk [data-chg] { position: relative; outline: 2px dashed var(--c); outline-offset: 3px; border-radius: 8px; }
.mk [data-chg]::after { content: attr(data-n); position: absolute; top: -10px; left: -10px; z-index: 5; min-width: 22px; height: 22px;
  padding: 0 6px; border-radius: 999px; background: var(--c); color: #fff; font: 700 11px/22px Inter, sans-serif; text-align: center;
  box-shadow: 0 1px 3px rgba(0,0,0,.3); pointer-events: none; }
[data-t="NOVO"] { --c: var(--mk-novo); } [data-t="ALTERADO"] { --c: var(--mk-alt); }
[data-t="REAPROVEITA"] { --c: var(--mk-reuso); } [data-t="EM DISCUSSÃO"] { --c: var(--mk-disc); }
.proto-bar { background: var(--proto); color: var(--proto-fg); }
```

Shell:

```html
<div id="app" class="mk h-full flex flex-col">
  <div class="proto-bar flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 text-xs">
    <!-- logo NOVARC em branco -->
    <svg viewBox="0 0 181 56" role="img" aria-label="NovArc" style="height:16px;width:auto;flex:none"><path d="M19 6 H6 V50 H19 V44 H12 V12 H19 Z" fill="#fff"/><path d="M162 6 H175 V50 H162 V44 H169 V12 H162 Z" fill="#fff"/><text x="85" y="38" text-anchor="end" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98" fill="#fff">Nov</text><path d="M95 12 H103 L95 44 H87 Z" fill="#9cc4ff"/><text x="105" y="38" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98" fill="#9cc4ff">Arc</text></svg>
    <span class="font-semibold tracking-wide uppercase">Protótipo de planejamento</span>
    <span class="opacity-80">Módulo X no Sistema Y · dados de exemplo, não são números reais</span>
    <label class="ml-auto flex items-center gap-1.5 cursor-pointer"><input id="tgl-markers" type="checkbox" checked> Marcações</label>
  </div>
  <!-- shell real do sistema, igual ao layout do app: sidebar com o logo real (<img data-chrome="logo">) e o menu
       (#nav data-chrome="nav", itens com data-go), header com as ações fixas (data-chrome="header-actions"),
       <main id="main"><div id="view"></div></main> -->
</div>
<script>document.getElementById('tgl-markers').addEventListener('change', (e) => document.getElementById('app').classList.toggle('mk', e.target.checked));</script>
```

## 4. What to simulate

- Every screen the plan touches, plus the screens around it that a user passes through (so the flow makes sense).
- Real flows end to end: actions change state and the next screen reflects them (a cart becomes orders, an order
  moves through its stages). A dead button is a question the client will ask in the meeting.
- Different people: if roles see different things, simulate profiles (`data-papel`) and show the restriction. The
  profile selector ("Ver como") belongs to the tool, not to the system: put it in the purple prototype bar next to
  Marcações, rendered on every render, never in a screen header, so it exists on every screen including detail pages.
- Every element of a change carries `data-chg`, including copies outside its own screen (a button that also sits in
  the top bar). An unmarked copy reads as something the system already had.
- Phases: give each screen its phase in `simuladores[].telas[].fase`; the bench hides future work. A screen that
  already exists today gets `existe: true` so the phase versions never drop it from the menu.

## 5. Flows that cross several parts of the system

When a change only makes sense seeing two sides at once (the customer accepts on the site and the operator sees it
in the admin; the system sends an e-mail and the recipient opens it), build ONE simulator with shared state and
several surfaces side by side, instead of one simulator per side. Each surface keeps the real UI of its own system:
the customer site with its own theme, the staff admin with its own (Django admin, internal dashboard), the phone with
WhatsApp, the inbox with the e-mail client.

```js
const state = { screen: 'proposta', telas: { cliente: 'proposta', operador: 'op-lista' }, versao: 'all' /* ... */ };
const SUPERFICIE = { proposta: 'cliente', aceite: 'cliente', 'op-lista': 'operador', 'op-form': 'operador', wa: 'whatsapp', email: 'email' };
function go(id, opts = {}) {            // any screen id, from any surface; brings that surface into view
  const sup = SUPERFICIE[id]; /* show the pane of sup, set its current screen, open opts.mensagem if given */
  render();
}
function render() {
  state.telas = { /* only the surfaces visible now: { cliente: '...', operador: '...' } */ };
  state.screen = state.telas.cliente || Object.values(state.telas)[0];
  /* each surface root: <div data-superficie="cliente">...</div> */
}
window.versaoSimulador = (v) => { state.versao = v; render(); };   // 'hoje' draws the old e-mail, the old copy
```

- Declare the surfaces in `simuladores[].superficies` and each screen's `superficie`. Screen ids are unique across
  the whole simulator.
- Scenario controls (show or hide a surface, advance the clock to see time-based rules like follow-ups and SLAs,
  restart, pick a sample case) go in the prototype bar, like "Ver como". A short "next step" hint for the person
  presenting is fine there too; never a guided tour.
- Messages the system sends (WhatsApp, e-mail, SMS, push, in-app notices) go in `mensagens[]` of the plan, and the
  simulator renders each one: in the flow when it fires, and on demand with `go(<tela>, { mensagem: <id> })`, root
  marked `data-msg="<id>"`. When the plan changes an existing message, render the old one too when
  `state.versao === 'hoje'`: the client approves the difference, not only the new version.
- Copy the real message templates (e-mail HTML, WhatsApp template text and variables) from the repository, the same
  way you copy the UI.

## 6. Check

Run `template/ferramentas/checar-simulador.js` inside the simulator page (served locally with the plan folder),
then open the bench from the same server and click through it. Fix every change without a `data-chg`, every
`data-chg` that is not in the plan and every screen in `chrome_faltando`; `falhou: true` blocks publishing. With
surfaces, also every `data-chg` outside a `data-superficie` root; with messages, every message without a preview.
Then diff each screen against its inventory (rule 1) and fix every mismatch. The check finds missing chrome, not a
wrong layout: the inventory diff is what catches a simplified screen.
