// Pure helpers of the Pendências tab: the repository pendings (legacy PENDINGS.md or .novarc/pendings/<ID>.md frontmatter),
// the planning questions and their answers, the items on the way from running specs, the cross-check and the doc view.
// No engine calls here, so tests exercise them directly. The open rule and the phase helpers are ported from the
// planning page, never imported: this folder ships in the public build.

import type { EntradaRepo, ACaminho, ItemPendencia, Divergencia, DocResumo, FiltroDoc, EstadoPendencias } from '../../types'

export type { EntradaRepo, ACaminho, ItemPendencia, Divergencia, DocResumo, FiltroDoc, EstadoPendencias }

/** Upper-case status token of a repository entry; 'ILEGIVEL' when none is readable. */
export type StatusRepo = string


const PID = /\bp-[a-z0-9]+(?:-[a-z0-9]+)*\b/g
const PND = /\bPND-\d+\b/
const TOKEN = /^[A-Z]{3,}$/
const CLIENTE = /\b(quem[_ ]responde|responde)\s*:\s*cliente\b/i
const FATO: [RegExp, 'oQue' | 'porQue' | 'destrava'][] = [
  [/^[ \t]*[-*][ \t]*(?:o que|pendente|what|pending)[ \t]*:[ \t]*(.*)$/im, 'oQue'],
  [/^[ \t]*[-*][ \t]*(?:por qu[eê]|why)[ \t]*:[ \t]*(.*)$/im, 'porQue'],
  [/^[ \t]*[-*][ \t]*(?:destrava|desbloqueia|unblocks)[ \t]*:[ \t]*(.*)$/im, 'destrava'],
]
const STATUS_LINHA = /^[ \t]*(?:[-*][ \t]*)?(?:\*\*)?status(?::\*\*|\*\*:|:)[ \t]*`?([^`\s]*)`?/im

/** DONE and RESOLVED are closed entries under another name. */
const normalizar = (s: string) => (s === 'DONE' || s === 'RESOLVED' ? 'CLOSED' : s)

/** Status and title of a `### ` heading: a backticked token anywhere, else a bare token at the start or after the last ` — `. */
function cabecalho(h: string): { status: string | null; titulo: string } {
  const crase = h.match(/`([A-Z]{3,})`/)
  if (crase) return { status: crase[1]!, titulo: limpar(h.replace(crase[0], '')) }
  // a bare leading token counts only when a dash, a date or nothing follows it ("### API retry" is a title)
  const ini = h.match(/^([A-Z]{3,})(?:\s+[—–-]\s+|\s+(?=\d)|\s*$)(.*)$/)
  if (ini) return { status: ini[1]!, titulo: limpar(ini[2]!) }
  const fim = h.match(/^(.*)\s[—–-]\s*([A-Z]{3,})\s*$/)
  if (fim) return { status: fim[2]!, titulo: limpar(fim[1]!) }
  return { status: null, titulo: limpar(h) }
}

const limpar = (t: string) => t.replace(/\s+/g, ' ').replace(/^[\s—–-]+|[\s—–-]+$/g, '').trim()

/** Fills the three facts, who answers and the p-ids from the body text (one regex pass each, never per line: R33). */
function corpo(e: EntradaRepo, txt: string): void {
  for (const [re, k] of FATO) e[k] = txt.match(re)?.[1]?.trim() ?? ''
  if (CLIENTE.test(txt)) e.quem = 'cliente'
  e.planejamento = [...new Set([...e.planejamento, ...(txt.match(PID) ?? [])])]
}

/**
 * Entries of a legacy PENDINGS.md: every `### ` heading under a `## ` section after the preamble (which ends at the first
 * `---` line, else at the first `## `). A heading with no readable status is kept as 'ILEGIVEL'.
 */
export function lerLegado(texto: string): EntradaRepo[] {
  const t = texto.replace(/\r\n?/g, '\n')
  const hr = t.match(/^---[ \t]*$/m)
  const ini = hr ? hr.index! : t.search(/^## /m)
  if (ini < 0) return []
  const out: EntradaRepo[] = []
  const cab = /^(#{2,3}) (.*)$/gm
  cab.lastIndex = ini
  let secao = ''
  let atual: { e: EntradaRepo; status: string | null; de: number } | null = null
  const fechar = (ate: number) => {
    if (!atual) return
    const txt = t.slice(atual.de, ate)
    const m = atual.status ? null : txt.match(STATUS_LINHA)
    const st = atual.status ?? (m && TOKEN.test(m[1]!) ? m[1]! : null)
    atual.e.status = st ? normalizar(st) : 'ILEGIVEL'
    corpo(atual.e, txt)
    out.push(atual.e)
    atual = null
  }
  for (let m = cab.exec(t); m; m = cab.exec(t)) {
    if (m[1] === '##') {
      fechar(m.index)
      secao = m[2]!.trim()
    } else if (secao) {
      fechar(m.index)
      const h = m[2]!.trim()
      const { status, titulo } = cabecalho(h)
      atual = {
        e: { id: h.match(PND)?.[0] ?? null, titulo, status: '', secao, quem: 'equipe', oQue: '', porQue: '', destrava: '', planejamento: h.match(PID) ?? [] },
        status,
        de: m.index + m[0].length,
      }
    }
  }
  fechar(t.length)
  return out
}

/** Entries of .novarc/pendings/<ID>.md files (legacy ai/pendings), from their frontmatter (format owned by the per-file pendings spec). */
export function lerArquivos(arquivos: { nome: string; texto: string }[]): EntradaRepo[] {
  return arquivos.map(({ nome, texto }) => {
    const ls = texto.split(/\r?\n/)
    const fm: Record<string, string> = {}
    let corpoDe = 0
    if (ls[0]?.trim() === '---') {
      const fim = ls.findIndex((l, j) => j > 0 && l.trim() === '---')
      if (fim > 0) {
        for (const l of ls.slice(1, fim)) {
          const m = l.match(/^([A-Za-z_]+)\s*:\s*(.*)$/)
          if (m) fm[m[1]!.toLowerCase()] = m[2]!.trim().replace(/^["']|["']$/g, '')
        }
        corpoDe = fim + 1
      }
    }
    const pp = (fm.pendencia_planejamento ?? '').replace(/^\[|\]$/g, '')
    const st = (fm.status ?? '').toUpperCase()
    const e: EntradaRepo = {
      id: fm.id || nome.replace(/\.md$/i, ''),
      titulo: fm.titulo || fm.title || nome.replace(/\.md$/i, ''),
      status: TOKEN.test(st) ? normalizar(st) : 'ILEGIVEL',
      secao: '',
      quem: /^cliente$/i.test(fm.quem_responde ?? '') ? 'cliente' : 'equipe',
      oQue: '',
      porQue: '',
      destrava: '',
      planejamento: pp.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean),
    }
    corpo(e, ls.slice(corpoDe).join('\n'))
    if (fm.quem_responde) e.quem = /^cliente$/i.test(fm.quem_responde) ? 'cliente' : 'equipe' // the frontmatter wins over a body line
    return e
  })
}

/** Every file entry, plus the legacy entries whose ID no file carries (the file wins). */
export function unirRepo(arquivos: EntradaRepo[], legado: EntradaRepo[]): EntradaRepo[] {
  const ids = new Set(arquivos.map(e => e.id))
  return [...arquivos, ...legado.filter(e => !e.id || !ids.has(e.id))]
}

// ---- planning side

export type PerguntaPlano = { id: string; titulo: string; texto: string; quem: string; fase: string | null; mudancas?: string[] }
export type PlanoPend = {
  fases?: { id: string }[]
  conjuntos?: { id: string; fase?: string }[]
  specs?: { id: string; mudancas?: string[] }[]
  pendencias?: PerguntaPlano[]
}
export type Resposta = { resposta?: string; situacao?: string; enviada?: { by: string; at: string } }

/** Open unless the answer is non-empty and not partial (the planning page's rule). */
export function aberta(r: Resposta | undefined): boolean {
  return !(typeof r?.resposta === 'string' && r.resposta.trim() !== '' && r.situacao !== 'parcial')
}

/** The first phase, in plan order, with a set not concluded; a phase with no set is skipped. */
export function faseAtual(p: PlanoPend, status: Record<string, string>): string | null {
  for (const f of p.fases ?? []) {
    const cs = (p.conjuntos ?? []).filter(c => c.fase === f.id)
    if (cs.some(c => status[c.id] !== 'concluido')) return f.id
  }
  return null
}

/** Open planning questions holding phase `fase`. */
export function segurando(p: PlanoPend, resp: Record<string, Resposta>, fase: string | null): number {
  return fase ? (p.pendencias ?? []).filter(q => q.fase === fase && aberta(resp[q.id])).length : 0
}

export const rotuloFase = (f: string) => f.replace(/^f/i, '')

/** The first spec whose changes intersect the question's. */
export function specDaPergunta(p: PlanoPend, q: PerguntaPlano): string | null {
  const ms = new Set(q.mudancas ?? [])
  return (p.specs ?? []).find(s => (s.mudancas ?? []).some(m => ms.has(m)))?.id ?? null
}

// ---- items on the way


/** Protocol text for the mirror: the keyword alone when it looks like a credential, else at most 120 characters. */
export function textoSeguro(tipo: string, texto: string): string {
  return /gh[opsu]_|github_pat_|sbp_|eyJ/.test(texto) ? tipo : texto.slice(0, 120)
}

/** PARKED, BLOCKED and `NOTE CUT` events per spec, numbered `<spec>:<n>` in time order, then newest first, at most 50. */
export function itensACaminho(porSpec: Record<string, { tipo: string; texto: string; at: number }[]>): ACaminho[] {
  const out: (ACaminho & { t: number })[] = []
  for (const [spec, evs] of Object.entries(porSpec)) {
    let n = 0
    for (const e of [...evs].sort((a, b) => a.at - b.at)) {
      const cut = e.tipo === 'NOTE' && /^CUT\b/.test(e.texto)
      if (e.tipo !== 'PARKED' && e.tipo !== 'BLOCKED' && !cut) continue
      const tipo = cut ? 'CUT' : (e.tipo as 'PARKED' | 'BLOCKED')
      out.push({ spec, ref: `${spec}:${++n}`, tipo, texto: textoSeguro(tipo, cut ? e.texto.replace(/^CUT\s*/, '') : e.texto), at: new Date(e.at).toISOString(), t: e.at })
    }
  }
  return out.sort((a, b) => b.t - a.t).slice(0, 50).map(({ t, ...i }) => i)
}

export function destino(done: boolean): string {
  return done ? 'vai virar pending no fechamento' : 'tratar no pré-fechamento'
}

// ---- the joined list



const FECHADO = new Set(['CLOSED', 'ACCEPTED'])
const ABERTO = new Set(['OPEN', 'GATED'])

/** Only entries that name an existing planning question are compared (never by title). */
export function cruzar(perguntas: PerguntaPlano[], resp: Record<string, Resposta>, repo: EntradaRepo[]): Divergencia[] {
  const ids = new Set(perguntas.map(q => q.id))
  const out: Divergencia[] = []
  for (const e of repo) {
    for (const pid of e.planejamento) {
      if (!ids.has(pid)) continue
      const ab = aberta(resp[pid])
      const tipo = FECHADO.has(e.status) && ab ? 'resolvida-no-repo' : ABERTO.has(e.status) && !ab ? 'reaberta' : null
      if (tipo) out.push({ pid, ref: e.id ?? e.titulo, tipo, chave: `pend:${pid}:${e.status}:${ab ? 'aberta' : 'resolvida'}` })
    }
  }
  return out
}

export function textoDivergencia(d: Divergencia): string {
  return d.tipo === 'resolvida-no-repo' ? `Resolvida no repositório (${d.ref}), ainda aberta no planejamento` : 'Reaberta no repositório depois de respondida no planejamento'
}

/** One list for the tab, the counter and the cross-check. */
export function montarItens(a: {
  plano: PlanoPend | null
  resp: Record<string, Resposta>
  repo: EntradaRepo[]
  aCaminho: ACaminho[]
  done: Set<string>
  enviados: { spec: string; ref: string }[]
}): { itens: ItemPendencia[]; divergencias: Divergencia[] } {
  const perguntas = a.plano?.pendencias ?? []
  const divergencias = cruzar(perguntas, a.resp, a.repo)
  const porPid = new Map(divergencias.map(d => [d.pid, d]))
  const enviado = new Set(a.enviados.map(e => e.ref))
  const itens: ItemPendencia[] = []
  for (const q of perguntas) {
    const r = a.resp[q.id]
    const ab = aberta(r)
    const d = porPid.get(q.id)
    itens.push({
      id: q.id, ref: q.id, fonte: 'plano', titulo: q.titulo, texto: q.texto, status: ab ? (r?.situacao === 'parcial' ? 'parcial' : 'aberta') : 'respondida',
      quem: enviado.has(q.id) ? 'pre-fechamento' : ab ? (/cliente/i.test(q.quem) ? 'cliente' : 'socio') : 'aceita',
      fase: q.fase, spec: a.plano ? specDaPergunta(a.plano, q) : null, destino: null,
      alerta: d?.tipo ?? null, alertaTexto: d ? textoDivergencia(d) : null, enviada: !!r?.enviada, at: null,
    })
  }
  for (const e of a.repo) {
    const ref = e.id ?? `"${e.titulo}"`
    itens.push({
      id: e.id ?? e.titulo, ref, fonte: 'repo', titulo: e.titulo, texto: e.oQue, status: e.status,
      quem: enviado.has(ref) ? 'pre-fechamento' : ABERTO.has(e.status) ? (e.quem === 'cliente' ? 'cliente' : 'socio') : 'aceita',
      fase: null, spec: null, destino: null, alerta: null, alertaTexto: null, enviada: false, at: null,
    })
  }
  for (const c of a.aCaminho) {
    const done = a.done.has(c.spec)
    itens.push({
      id: c.ref, ref: c.ref, fonte: 'a-caminho', titulo: c.texto.split(/\s+/).slice(0, 8).join(' '), texto: c.texto, status: c.tipo,
      quem: done ? 'aceita' : 'pre-fechamento', fase: null, spec: c.spec, destino: destino(done),
      alerta: null, alertaTexto: null, enviada: false, at: Date.parse(c.at),
    })
  }
  return { itens, divergencias }
}

export type Grupos = { socio: ItemPendencia[]; pre: ItemPendencia[]; aceita: { n: number; accepted: number; watch: number } }

/** Columns by who acts; `fase` filters by the phase an item holds (null: all). Accepted debt is only counted. */
export function agrupar(itens: ItemPendencia[], fase: string | null): Grupos {
  const vis = fase ? itens.filter(i => i.fase === fase) : itens
  const accepted = vis.filter(i => i.fonte === 'repo' && i.status === 'ACCEPTED').length
  const watch = vis.filter(i => i.fonte === 'repo' && i.status === 'WATCH').length
  return {
    socio: vis.filter(i => i.quem === 'socio' || i.quem === 'cliente'),
    pre: vis.filter(i => i.quem === 'pre-fechamento'),
    aceita: { n: accepted + watch, accepted, watch },
  }
}

/** Open items of the tab button `Pendências <n>`. */
export function abertos(itens: ItemPendencia[]): number {
  const g = agrupar(itens, null)
  return g.socio.length + g.pre.length
}

// ---- the planning database list, read strictly

/**
 * Documents of an ArtifactData list, or null unless both markers are present and every `{` line between them is a
 * document: a garbled answer must read as a failure, never as "no answers".
 */
export function lerListaEstrita(texto: string): Record<string, { id: string; data: Record<string, unknown>; version: number }> | null {
  const ls = texto.split(/\r?\n/)
  const ini = ls.findIndex(l => l.startsWith('=== BEGIN ARTIFACT DB'))
  const fim = ls.findIndex((l, j) => j > ini && l.startsWith('=== END ARTIFACT DB'))
  if (ini < 0 || fim < 0) return null
  const out: Record<string, { id: string; data: Record<string, unknown>; version: number }> = {}
  for (const l of ls.slice(ini + 1, fim)) {
    const t = l.trim()
    if (!t.startsWith('{')) continue
    try {
      const o = JSON.parse(t)
      if (typeof o.id !== 'string' || typeof o.version !== 'number' || !o.data || typeof o.data !== 'object') return null
      out[o.id] = { id: o.id, data: o.data, version: o.version }
    } catch {
      return null
    }
  }
  return out
}

// ---- the project doc


export function resumoDoc(repo: EntradaRepo[]): DocResumo {
  const n = (s: string) => repo.filter(e => e.status === s).length
  return {
    tot: repo.length, abertos: n('OPEN') + n('GATED'), OPEN: n('OPEN'), GATED: n('GATED'), WATCH: n('WATCH'), ACCEPTED: n('ACCEPTED'), CLOSED: n('CLOSED'),
    ilegiveis: n('ILEGIVEL'), equipe: repo.filter(e => e.quem === 'equipe').length, cliente: repo.filter(e => e.quem === 'cliente').length,
  }
}

export function linhaDoc(r: DocResumo | null): string {
  if (!r) return 'Doc de pendings do projeto  nenhum ainda'
  const base = `Doc de pendings do projeto  ${r.tot} itens · ${r.abertos} abertos  OPEN ${r.OPEN} GATED ${r.GATED} WATCH ${r.WATCH} ACCEPTED ${r.ACCEPTED} CLOSED ${r.CLOSED}`
  return r.ilegiveis > 0 ? `${base} · ${r.ilegiveis} ilegíveis` : base
}

const FILTRO: Record<FiltroDoc, (s: string) => boolean> = {
  todos: () => true,
  abertos: s => s === 'OPEN' || s === 'GATED',
  presos: s => s === 'GATED',
  aceitos: s => s === 'ACCEPTED' || s === 'WATCH',
  fechados: s => s === 'CLOSED',
}

/** Doc rows by filter and case-insensitive search over title and ID, cut at 50. */
export function filtrarDoc(repo: EntradaRepo[], busca: string, filtro: FiltroDoc): { linhas: EntradaRepo[]; mais: number } {
  const b = busca.trim().toLowerCase()
  const todas = repo.filter(e => FILTRO[filtro](e.status) && (!b || e.titulo.toLowerCase().includes(b) || (e.id ?? '').toLowerCase().includes(b)))
  return { linhas: todas.slice(0, 50), mais: Math.max(0, todas.length - 50) }
}

// ---- the tab's state (orchestrator, rebuilt by pendencias-refresh; the band and the pane only read it)


/** Items the orchestrator sent to pre-close: its `NOTE PRE-FECHAMENTO <S> <ref> <texto>` lines (ref may be quoted). */
export function enviadosDoLedger(evs: { tipo: string; texto: string }[]): { spec: string; ref: string }[] {
  const out: { spec: string; ref: string }[] = []
  for (const e of evs) {
    const m = e.tipo === 'NOTE' ? e.texto.match(/^PRE-FECHAMENTO\s+(\S+)\s+("[^"]*"|\S+)/) : null
    if (m) out.push({ spec: m[1]!, ref: m[2]! })
  }
  return out
}

/** The band counter: open questions holding the current phase, null when none. */
export function contadorDe(p: PlanoPend, resp: Record<string, Resposta>, status: Record<string, string>): { n: number; fase: string } | null {
  const fase = faseAtual(p, status)
  const n = segurando(p, resp, fase)
  return fase && n > 0 ? { n, fase } : null
}

/** Band slot of the tab, below any C02-S01 alert (R19): divergences first, then the counter. */
export function slotPendencias(e: EstadoPendencias | null): { tipo: 'divergente' | 'contador'; texto: string } | null {
  if (!e) return null
  if (e.divergencias.length) return { tipo: 'divergente', texto: `${e.divergencias.length} pendências divergentes` }
  if (e.contador) return { tipo: 'contador', texto: `${e.contador.n} pendências seguram a fase ${rotuloFase(e.contador.fase)}` }
  return null
}
