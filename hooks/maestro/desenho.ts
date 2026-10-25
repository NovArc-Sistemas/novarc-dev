// C11-S01: the Maestro's Svg strings. Every Svg carries both palettes (light default, dark in @media) and is laid out
// at the pixel width it is given: one pane column = 10 px. The brand pieces (banner, faixaSecao) use the fixed NovArc
// navy that reads the same in both themes. Later specs add their builders here, each with the same unit checks.

export const PX = 10
/** The eight session-build steps as the lanes table labels them (TRILHA order). */
export const ETAPAS = ['READY', 'PLAN', 'CODEX', 'SURF', 'TASK', 'LOCK', 'PUSH', 'DONE'] as const
/** Each set's mid-tone: only as a 0.3-cell stripe or a set card border, never as text or fill of a Box (R3). */
export const COR: Record<string, string> = { C01: '#5b8def', C02: '#6cba7e', C03: '#a48be0', C04: '#d9a157', C05: '#5fb3b3', C06: '#e08b8b', C07: '#b8a46b', C08: '#8fa0c8', C09: '#c58bd0' }

export const esc = (t: string) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')

export const STYLE = `<style>
.ink{fill:#1f1e1d}.mut{fill:#8a877f}.vz{fill:#e9e6df}.ok{fill:#d7eedb}.okt{fill:#1f6b35}.now{fill:#d97757}.nowt{fill:#ffffff}
.bad{fill:#f6d5d1}.badt{fill:#a3352b}.line{stroke:#d9d6ce}.sk{stroke:#5f5d57}.skok{stroke:#2f8a4a}.skbad{stroke:#c0453a}.skacc{stroke:#c4613f}
.dv{fill:#e3e0d9}.nv{fill:#04122E}.na{fill:#0A6CFF}.grn{fill:#2f8a4a}.red{fill:#c0453a}
@media (prefers-color-scheme: dark){
.ink{fill:#ecebe7}.mut{fill:#85827a}.vz{fill:#2f2e2b}.ok{fill:#2a3f30}.okt{fill:#9fd8ac}.nowt{fill:#1f1e1d}
.bad{fill:#4a2724}.badt{fill:#f3b0a8}.line{stroke:#3a3936}.sk{stroke:#b8b5ad}.skok{stroke:#6cba7e}.skbad{stroke:#e2675e}.skacc{stroke:#d97757}
.dv{fill:#34332f}.nv{fill:#ffffff}.na{fill:#9cc4ff}.grn{fill:#6cba7e}.red{fill:#e2675e}}
</style>`

export const doc = (w: number, h: number, body: string, vb?: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb ?? `0 0 ${w} ${h}`}" font-family="system-ui, sans-serif">${STYLE}${body}</svg>`

const esticado = (s: string) => s.replace('<svg ', '<svg preserveAspectRatio="none" ')

/** NovArc logo, from the planning template; `h` px tall. */
export function logo(h: number): { src: string; w: number } {
  const w = Math.round((h * 181) / 56)
  return {
    w,
    src: doc(w, h, `<path class="nv" d="M19 6 H6 V50 H19 V44 H12 V12 H19 Z"/><path class="nv" d="M162 6 H175 V50 H162 V44 H169 V12 H162 Z"/><text class="nv" x="85" y="38" text-anchor="end" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98">Nov</text><path class="na" d="M95 12 H103 L95 44 H87 Z"/><text class="na" x="105" y="38" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98">Arc</text>`, '0 0 181 56'),
  }
}

/** Short NovArc mark: the brackets and the slash, `h` px tall. */
export function logoCurto(h: number): { src: string; w: number } {
  const w = Math.round((h * 50) / 56)
  return { w, src: doc(w, h, `<path class="nv" d="M14 6 H1 V50 H14 V44 H7 V12 H14 Z"/><path class="nv" d="M36 6 H49 V50 H36 V44 H43 V12 H36 Z"/><path class="na" d="M29 12 H37 L21 44 H13 Z"/>`, '0 0 50 56') }
}

/** The NovArc slash as the turn mark, pulsing on request (an interactive Svg runs the animation). */
export function barraNovarc(h: number, pulsa: boolean): { src: string; w: number } {
  const w = Math.round(h * 0.6)
  const a = pulsa ? '<animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/>' : ''
  return { w, src: doc(w, h, `<path class="na" d="M${w * 0.55} 0 H${w} L${w * 0.45} ${h} H0 Z">${a}</path>`) }
}

/** Short NovArc mark animated for the working rows: the slash turns between the brackets, which breathe apart. */
export function logoGirando(h: number): { src: string; w: number } {
  const w = Math.round((h * 50) / 56)
  const resp = (dx: number) => `<animateTransform attributeName="transform" type="translate" values="0 0;${dx} 0;0 0" dur="1.6s" repeatCount="indefinite"/>`
  return {
    w,
    src: doc(w, h, `<path class="nv" d="M14 6 H1 V50 H14 V44 H7 V12 H14 Z">${resp(-2)}</path><path class="nv" d="M36 6 H49 V50 H36 V44 H43 V12 H36 Z">${resp(2)}</path><path class="na" d="M29 12 H37 L21 44 H13 Z"><animateTransform attributeName="transform" type="rotate" from="0 25 28" to="360 25 28" dur="1.6s" repeatCount="indefinite"/></path>`, '0 0 50 56'),
  }
}

/** A full-width divider: drawn at a nominal width and stretched (a 1 px line has nothing to distort). */
export const divisor = esticado(doc(1000, 1, `<rect class="dv" width="1000" height="1"/>`))

/** The skewed accent mark before the band title. */
export const marca = doc(4, 14, `<path class="now" d="M2.5 1 H4 L1.5 13 H0 Z"/>`)

/** A section band: a third of the brand header (20 px), same navy gradient and blue rule, at the pane's exact width. */
export function faixaSecao(w: number, esquerda = '', direita = '', aoVivo = false): string {
  const pulso = aoVivo ? `<circle cx="16" cy="10" r="4" fill="#6cba7e"><animate attributeName="opacity" values="1;.3;1" dur="1.6s" repeatCount="indefinite"/></circle>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" viewBox="0 0 ${w} 20" font-family="system-ui, sans-serif"><defs><linearGradient id="gs" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#04122E"/><stop offset="1" stop-color="#0b2a66"/></linearGradient></defs><rect width="${w}" height="20" fill="url(#gs)"/><rect y="18" width="${w}" height="2" fill="#0A6CFF"/>${pulso}<text x="${aoVivo ? 26 : 16}" y="13.5" font-size="10.5" fill="#dbe4f7">${esc(esquerda)}</text><text x="${w - 16}" y="13.5" text-anchor="end" font-size="10.5" fill="#9fb3dc">${esc(direita)}</text></svg>`
}

/** The pane's brand header at the pane's exact width: navy band, NovArc logo, Maestro, the focus and the bell pill. */
export function banner(w: number, foco: string, alertas = 0): string {
  const s = 30 / 56, x = 16 + 181 * s
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="60" viewBox="0 0 ${w} 60" font-family="system-ui, sans-serif">
<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#04122E"/><stop offset="1" stop-color="#0b2a66"/></linearGradient></defs>
<rect width="${w}" height="60" fill="url(#g)"/><rect y="58" width="${w}" height="2" fill="#0A6CFF"/>
<g transform="translate(16 14) scale(${s})"><path fill="#ffffff" d="M19 6 H6 V50 H19 V44 H12 V12 H19 Z"/><path fill="#ffffff" d="M162 6 H175 V50 H162 V44 H169 V12 H162 Z"/><text x="85" y="38" text-anchor="end" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98" fill="#ffffff">Nov</text><path fill="#9cc4ff" d="M95 12 H103 L95 44 H87 Z"/><text x="105" y="38" font-family="Sora, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="-0.98" fill="#9cc4ff">Arc</text></g>
<rect x="${x + 14}" y="18" width="1" height="22" fill="#ffffff" opacity=".25"/>
<path fill="#d97757" d="M${x + 31} 21 H${x + 35} L${x + 32} 38 H${x + 28} Z"/>
<text x="${x + 40}" y="35" font-size="17" font-weight="600" fill="#ffffff">Maestro</text>
<text x="${w - 16 - 74}" y="35" text-anchor="end" font-size="12" fill="#b9c7e6">${esc(foco)}</text><rect x="${w - 80}" y="20" width="64" height="22" rx="11" fill="${alertas ? '#c0453a' : '#ffffff'}" fill-opacity="${alertas ? 1 : 0.12}"/><text x="${w - 48}" y="35.5" text-anchor="middle" font-size="12" font-weight="600" fill="${alertas ? '#ffffff' : '#b9c7e6'}">🔔 ${alertas || '0'}</text></svg>`
}

export type Tom = 'ok' | 'ruim' | 'aviso' | 'info' | 'neutro'

/** A status chip as a fully round pill, 18 px tall, both palettes. */
export function selo(texto: string, tom: Tom): { src: string; w: number } {
  const P = { ok: ['#dff1e4', '#1f6b35', '#203526', '#8fd3a0'], ruim: ['#f8dcd8', '#a3352b', '#4a2724', '#f3b0a8'], aviso: ['#fbefd6', '#8a5a12', '#3b2f1f', '#f0c48a'], info: ['#e3ecfd', '#1d4fbf', '#16233f', '#9cc4ff'], neutro: ['#ebe9e3', '#4a4843', '#34332f', '#d6d3cc'] }[tom]
  const w = Math.round(16 + [...texto].length * 6.3)
  return { w, src: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="18" viewBox="0 0 ${w} 18" font-family="system-ui, sans-serif"><style>.f{fill:${P[0]}}.t{fill:${P[1]}}@media (prefers-color-scheme: dark){.f{fill:${P[2]}}.t{fill:${P[3]}}}</style><rect class="f" width="${w}" height="18" rx="9"/><text class="t" x="${w / 2}" y="12.5" text-anchor="middle" font-size="11" font-weight="500">${esc(texto)}</text></svg>` }
}

/** A colored dot (the set's own mid-tone) before an owner id. */
export const ponto = (cor: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="${cor}"/></svg>`

/** Segments (`d` done, `w` working, `b` lock or BLOCKED, '' waiting), drawn at a nominal width and stretched. */
export function barraSegmentos(st: ('d' | 'w' | 'b' | '')[]): string {
  const n = Math.max(1, st.length), g = 6, sw = (900 - g * (n - 1)) / n
  return esticado(doc(900, 8, st.map((x, i) => `<rect class="${x === 'd' ? 'grn' : x === 'w' ? 'now' : x === 'b' ? 'red' : 'vz'}" x="${i * (sw + g)}" y="0" width="${sw}" height="8" rx="3"/>`).join('')))
}

/** A count per status as one stretched stacked bar (OPEN red, GATED amber, WATCH blue, ACCEPTED grey, CLOSED green). */
export function distribuicao(cnt: [string, number][]): string {
  const C: Record<string, string> = { OPEN: 'red', GATED: 'now', WATCH: 'na', ACCEPTED: 'vz', CLOSED: 'grn' }
  const tot = cnt.reduce((a, [, n]) => a + n, 0) || 1
  let x = 0
  return esticado(doc(900, 8, cnt.map(([s, n]) => { const w = (n / tot) * 900, r = `<rect class="${C[s] ?? 'vz'}" x="${x}" width="${Math.max(0, w - 3)}" height="8" rx="3"/>`; x += w; return r }).join('')))
}

/** How long a lock is held against its orphan limit, with a `<title>` tooltip. Stretched. */
export function barraTempoDica(f: number, dica: string): string {
  const c = f >= 1 ? '#c0453a' : f >= 0.6 ? '#d97757' : '#2f8a4a'
  return `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="900" height="8" viewBox="0 0 900 8"><style>.t{fill:#e9e6df}@media (prefers-color-scheme: dark){.t{fill:#2f2e2b}}svg:hover .f{opacity:.8}</style><title>${esc(dica)}</title><rect class="t" width="900" height="8" rx="4"/><rect class="f" fill="${c}" width="${Math.max(14, Math.min(1, f) * 900)}" height="8" rx="4"/></svg>`
}

/** A drawn tooltip: a rounded card with a title and lines, hidden until its group is hovered; kept inside [0, w]. */
function balao(x: number, y: number, w: number, titulo: string, linhas: string[]): string {
  const bw = Math.max(titulo.length * 7.2, ...linhas.map(l => l.length * 6.6)) + 22, bh = 26 + linhas.length * 17
  const bx = Math.max(4, Math.min(w - bw - 4, x - bw / 2)), by = Math.max(2, y - bh - 10)
  return `<g class="tip"><rect class="tipbg" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="8"/><text class="tipt" x="${bx + 11}" y="${by + 18}" font-size="12.5" font-weight="600">${esc(titulo)}</text>${linhas.map((l, i) => `<text class="tipl" x="${bx + 11}" y="${by + 36 + i * 17}" font-size="12">${esc(l)}</text>`).join('')}</g>`
}
const G2 = `<style>
.ax{stroke:#e6e3dc}.lb{fill:#8a877f}.vl{fill:#1f1e1d}.hl{fill:#0A6CFF;opacity:0}.tip{opacity:0;pointer-events:none;transition:opacity .15s}
.tipbg{fill:#ffffff;stroke:#d9d6ce;filter:drop-shadow(0 4px 10px rgba(0,0,0,.12))}.tipt{fill:#1f1e1d}.tipl{fill:#5f5d57}
.grp:hover .tip{opacity:1}.grp:hover .hl{opacity:.06}
@media (prefers-color-scheme: dark){.ax{stroke:#2f2e2b}.lb{fill:#85827a}.vl{fill:#ecebe7}.hl{fill:#9cc4ff}
.tipbg{fill:#2b2a28;stroke:#3a3936;filter:drop-shadow(0 4px 12px rgba(0,0,0,.5))}.tipt{fill:#ecebe7}.tipl{fill:#b8b5ad}}
</style>`
const g2doc = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui, sans-serif">${G2}${body}</svg>`

export type LinhaTrilha = {
  nome: string
  feitos: number
  atual: 'n' | 'b' | null
  /** One state per step; overrides feitos/atual (a lane's LOCK cell can be red while later cells are done). */
  estados?: ('d' | 'n' | 'b' | '')[]
  idade: string
  meu?: boolean
  ruim?: boolean
  /** Per cell, the tooltip lines from the real events; never invented. */
  dicas?: string[][]
}

/** A block's lanes as one interactive table: header, spec name, 8 step cells and age share one geometry. */
export function tabelaTrilhas(w: number, linhas: LinhaTrilha[]): string {
  const nw = 132, aw = 58, rh = 30, top = 22, gap = 5
  const cw = (w - nw - aw - gap * 7) / 8
  const h = top + linhas.length * rh + 4
  const cab = ETAPAS.map((k, i) => `<text class="lb" x="${nw + i * (cw + gap) + cw / 2}" y="13" text-anchor="middle" font-size="10" font-family="ui-monospace, monospace">${k}</text>`).join('')
  const corpo = linhas.map((l, r) => {
    const y = top + r * rh
    const nome = l.nome.length > 17 ? l.nome.slice(0, 16) + '…' : l.nome
    const celulas = ETAPAS.map((k, i) => {
      const st = l.estados ? l.estados[i] ?? '' : i < l.feitos ? 'd' : i === l.feitos && l.atual ? l.atual : ''
      const x = nw + i * (cw + gap)
      const fill = st === 'd' ? 'url(#cd)' : st === 'n' ? 'url(#cn)' : st === 'b' ? 'url(#cb)' : 'url(#cv)'
      const m = st === 'd' ? '✓' : st === 'n' ? '•' : st === 'b' ? '!' : ''
      const tip = l.dicas?.[i] ?? (st ? [] : ['ainda não começou'])
      return `<g class="grp"><rect class="cel" fill="${fill}" x="${x}" y="${y}" width="${cw}" height="${rh - 8}" rx="5"/><text class="${st === 'd' ? 'okt' : st ? 'tw' : 'lb'}" x="${x + cw / 2}" y="${y + 15.5}" text-anchor="middle" font-size="11.5" font-weight="600">${m}</text>${balao(x + cw / 2, y, w, `${nome} · ${k}`, tip)}</g>`
    }).join('')
    return `<text class="${l.meu ? 'meu' : 'vl'}" x="0" y="${y + 15.5}" font-size="11.5" font-family="ui-monospace, monospace"${l.meu ? ' font-weight="700"' : ''}>${esc(nome)}</text>${celulas}<text class="${l.ruim ? 'ruimt' : 'lb'}" x="${w}" y="${y + 15.5}" text-anchor="end" font-size="11" font-family="ui-monospace, monospace">${esc(l.idade)}</text>`
  }).join('')
  const estilo = `<style>.okt{fill:#1f6b35}.tw{fill:#ffffff}.meu{fill:#c4613f}.ruimt{fill:#c0453a}.cdv1{stop-color:#d7eedb}.cdv2{stop-color:#c4e6cc}.cnv1{stop-color:#e8835f}.cnv2{stop-color:#d0663f}.cbv1{stop-color:#e2675e}.cbv2{stop-color:#c0453a}.cvv{stop-color:#ebe9e3}.cel{transition:filter .15s}.grp:hover .cel{filter:brightness(1.1);stroke:#0A6CFF;stroke-width:1.5}
@media (prefers-color-scheme: dark){.okt{fill:#9fd8ac}.tw{fill:#1f1e1d}.meu{fill:#e8835f}.ruimt{fill:#f3b0a8}.cdv1{stop-color:#2f4a36}.cdv2{stop-color:#26392b}.cvv{stop-color:#2f2e2b}.grp:hover .cel{stroke:#9cc4ff}}</style>
<defs><linearGradient id="cd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cdv1"/><stop offset="1" class="cdv2"/></linearGradient><linearGradient id="cn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cnv1"/><stop offset="1" class="cnv2"/></linearGradient><linearGradient id="cb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cbv1"/><stop offset="1" class="cbv2"/></linearGradient><linearGradient id="cv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cvv"/><stop offset="1" class="cvv"/></linearGradient></defs>`
  // the first row's tooltip draws above it: room on top for one tooltip
  const extra = 60
  return g2doc(w, h + extra, `${estilo}<g transform="translate(0 ${extra})">${cab}${corpo}</g>`)
}

/** Height of the `tabelaTrilhas` Svg for `n` lanes. */
export const alturaTabela = (n: number) => 22 + n * 30 + 4 + 60

// ponytail: one 64-entry Map per builder, oldest dropped, no size accounting; enough for 3 tables, 50 hold bars and the bands
const caches: Map<string, unknown>[] = []
/** Real builds per memoized builder name (A45). */
export const construidos: Record<string, number> = {}

/** Reuses the last strings of a builder while its arguments do not change (R48). */
export function memo<A extends unknown[], T>(nome: string, f: (...a: A) => T): (...a: A) => T {
  const cache = new Map<string, T>()
  caches.push(cache)
  return (...a: A) => {
    const k = JSON.stringify(a)
    const v = cache.get(k)
    if (v !== undefined) return v
    construidos[nome] = (construidos[nome] ?? 0) + 1
    const s = f(...a)
    cache.set(k, s)
    if (cache.size > 64) cache.delete(cache.keys().next().value!)
    return s
  }
}

/** Clears every memo cache and zeroes the build counters (tests). */
export function limparMemo(): void {
  for (const c of caches) c.clear()
  for (const k of Object.keys(construidos)) delete construidos[k]
}

export const tabelaTrilhasM = memo('tabelaTrilhas', tabelaTrilhas)
export const barraTempoDicaM = memo('barraTempoDica', barraTempoDica)
// C11-S01 rework (band tail latency): every Svg a redraw of the band or a chat row draws comes from a memo or a
// module constant, so an unchanged-state redraw builds no Svg string
export const seloM = memo('selo', selo)
export const bannerM = memo('banner', banner)
export const faixaSecaoM = memo('faixaSecao', faixaSecao)
export const distribuicaoM = memo('distribuicao', distribuicao)
export const barraSegmentosM = memo('barraSegmentos', barraSegmentos)
export const LOGO_FAIXA = logoCurto(22)
export const LOGO_MAESTRO = logoCurto(14)
export const LOGO_GIRANDO = logoGirando(16)
export const BARRA_TURNO = barraNovarc(14, false)
export const ESQUELETO = barraSegmentos(['', '', '', '', ''])
