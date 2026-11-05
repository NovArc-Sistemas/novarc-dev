// Pure helpers of the novarc mod: no engine calls here, so tests can exercise them directly.
import type { ACaminho, Slots } from '../../types'
import type { Raia } from './execucao'

export const ETAPAS = ['iniciado', 'plano-aprovado', 'implementando', 'branch-publicada', 'pr-aberto', 'merge'] as const
export type Etapa = (typeof ETAPAS)[number]

export const ETAPA_LABEL: Record<Etapa, string> = {
  iniciado: 'iniciado',
  'plano-aprovado': 'plano aprovado',
  implementando: 'implementando',
  'branch-publicada': 'branch publicada',
  'pr-aberto': 'PR aberto',
  merge: 'mergeado',
}

/** Band wording for a set session ("Em implementação"), distinct from ETAPA_LABEL used by faixaConjunto. */
export const ETAPA_FAIXA: Record<Etapa, string> = {
  iniciado: 'Iniciado',
  'plano-aprovado': 'Plano aprovado',
  implementando: 'Em implementação',
  'branch-publicada': 'Branch publicada',
  'pr-aberto': 'PR aberto',
  merge: 'Mergeado',
}

export type PlanoSpec = { id: string; conjunto: string; slug: string; mudancas?: string[] }
export type PlanoConjunto = { id: string; titulo: string; specs: string[]; dependeDe?: string[]; prompt?: string; fase?: string }
export type Plano = {
  conjuntos?: PlanoConjunto[]
  specs?: PlanoSpec[]
  execucao?: { orquestrador?: string; perfil?: Perfil }
  projeto?: { cliente?: string; nomeCurto?: string; codigo?: string }
}

/** Project code and display name ("<cliente> · <nomeCurto>") of a plan. */
export function projetoDoPlano(p: Plano): { codigo: string | null; projeto: string | null } {
  const { cliente, nomeCurto, codigo } = p.projeto ?? {}
  return { codigo: codigo ?? null, projeto: cliente && nomeCurto ? `${cliente} · ${nomeCurto}` : cliente ?? nomeCurto ?? null }
}
export type SpecDoc = {
  etapa?: Etapa | null
  bloqueios?: Record<string, { motivo?: string; at?: string }>
  validacao?: { resultado?: string; sha?: string }
  headSha?: string
  branch?: string
  pr?: string
  removido?: boolean
}
/** Rhythm of a set's ledgers: median minutes between checkpoints and from LOCK to its release, with the sample count. */
export type Ritmo = { checkpointMin: number | null; lockMin: number | null; amostras: number }
/** `execucao/{C}.espelho`: the set session mod's mirror of its ledger, replaced whole on each write. */
export type EspelhoConjunto = {
  locks: Record<string, { spec: string; desde: string; estado: 'GRANTED-NOT-RELEASED' | 'UNGRANTED'; espera?: string[] }>
  specs: Record<string, { ultimo: string; texto: string; at: string }>
  ritmo: Ritmo
  /** C02-S02: items on the way to the pending doc (absent in mirrors written before it). */
  aCaminho?: ACaminho[]
  at: string
}
export type ConjuntoDoc = { sessao?: string; iniciadoEm?: string; bloqueios?: Record<string, { motivo?: string; at?: string }>; espelho?: EspelhoConjunto }
export type Limiares = { calado: number; lockOrfao: number; fonte: 'padrao' | 'medido'; at: string }
export type Proposta = { calado: number; lockOrfao: number; amostras: number; at: string }
/** `config/orquestracao`: the orchestrator mod's singleton (run, slots, thresholds). */
export type OrquestracaoDoc = { runId: string; sessao: string; iniciadaEm: string; slots: Slots; limiares: Limiares; proposta: Proposta | null; at: string; ordemProducao?: string[] }
/** One `auditoria/{id}` document (C03-S01 dados.md); declared in types/index.d.ts, which must stay self-contained. */
export type { AuditoriaDoc } from '../../types'

/** Rank of an etapa; -1 for none. */
export function rank(etapa: string | null | undefined): number {
  return etapa ? ETAPAS.indexOf(etapa as Etapa) : -1
}

// ---- C05-S02: who owns specs/{S} in each phase (skills/novarc-session-build/references/milestones.md ownership table)

export type Dona = 'conjunto' | 'spec'
const CARGA_FECHAMENTO = new Set(['iniciado', 'pr-aberto', 'merge'])
const BUILD = new Set(['plano-aprovado', 'implementando', 'branch-publicada'])

/** The owner of `etapa` of a spec: build etapas belong to the spec session from its READY to `NOTE DONE-ACEITO`. */
export function donoDaFase(etapa: string, o: { ready: boolean; aceito: boolean }): Dona | null {
  if (CARGA_FECHAMENTO.has(etapa)) return 'conjunto'
  if (BUILD.has(etapa)) return o.ready && !o.aceito ? 'spec' : 'conjunto'
  return null
}

export type AcaoMarco = { acao: 'gravar' } | { acao: 'marco' } | { acao: 'nota' } | { acao: 'toast'; dona: Dona } | { acao: 'nada' }

/**
 * What this session does with a milestone it observed (R8-R12, R17, R24): identity and phase first, then the fallbacks.
 * `ready`: a READY folded for that spec (the spec session's own fork file, or a set session's); `rota`: a set session
 * address is known; `d20a`: the orchestrator's mod may send MARCO (probe D20a passed).
 */
export function decidirMarco(i: {
  papel: 'orquestrador' | 'conjunto' | 'spec' | null
  specDaSessao: string | null
  spec: string
  etapa: string
  ready: boolean
  aceito: boolean
  wip: boolean
  rota: boolean
  d20a: boolean
}): AcaoMarco {
  if (i.wip && i.etapa === 'branch-publicada') return { acao: 'nada' }
  const dona = donoDaFase(i.etapa, i)
  if (!dona) return { acao: 'nada' }
  if (i.papel === null) return { acao: 'gravar' }
  if (i.papel === 'orquestrador') return !i.rota ? { acao: 'nada' } : i.d20a ? { acao: 'marco' } : { acao: 'toast', dona }
  if (i.papel === 'spec') {
    if (i.spec !== i.specDaSessao) return { acao: 'toast', dona }
    if (dona === 'spec') return { acao: 'gravar' }
    if (i.aceito) return i.rota ? { acao: 'nota' } : { acao: 'nada' }
    return { acao: 'toast', dona }
  }
  if (!i.ready || dona === 'conjunto') return { acao: 'gravar' }
  return { acao: 'toast', dona }
}

/** The phase row the ownership box highlights (R16): before load, load, READY to DONE-ACEITO, or close-out. */
export function posseDaSpec(i: { iniciado: boolean; ready: boolean; aceito: boolean }): 'antes' | 'carga' | 'build' | 'fechamento' {
  if (i.aceito) return 'fechamento'
  if (i.ready) return 'build'
  return i.iniciado ? 'carga' : 'antes'
}

/** Spec id (C01-S01) carried by a branch name, or null. */
export function idDaBranch(branch: string): string | null {
  const m = branch.toLowerCase().match(/(?:^|[\/-])(c\d{2}-s\d{2})(?:-|$)/)
  return m ? m[1].toUpperCase() : null
}

/** Maps a branch name to its spec by the exact spec id it carries (R16): feature/c01-s02-slug-20261012 -> C01-S02. */
export function specDaBranch(branch: string, plano: Plano): PlanoSpec | null {
  const id = idDaBranch(branch)
  if (!id) return null
  return (plano.specs || []).find(s => s.id === id) || null
}

type Tok = string | { op: string }

/**
 * Splits a shell command line into words and operators. Quoted text is one word and never an operator; redirections
 * (`2>&1`, `>&2`, `&>f`, `>f`, `2>f`, `<f`) are dropped, target included. Null when a quote is left open.
 */
function lexar(cmd: string): Tok[] | null {
  const out: Tok[] = []
  let w = ''
  let tem = false
  let q = ''
  const fim = () => {
    if (tem) out.push(w)
    w = ''
    tem = false
  }
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]
    if (q) {
      if (ch === q) q = ''
      else if (ch === '\\' && q === '"' && i + 1 < cmd.length) w += cmd[++i]
      else w += ch
    } else if (ch === '"' || ch === "'") {
      q = ch
      tem = true
    } else if (ch === '\\' && i + 1 < cmd.length) {
      w += cmd[++i]
      tem = true
    } else if (ch === '>' || ch === '<' || (ch === '&' && cmd[i + 1] === '>')) {
      if (/^\d+$/.test(w)) {
        w = ''
        tem = false
      } else fim()
      while (i + 1 < cmd.length && /[>&<]/.test(cmd[i + 1])) i++
      while (i + 1 < cmd.length && /[ \t]/.test(cmd[i + 1])) i++
      while (i + 1 < cmd.length && !/[\s;|&]/.test(cmd[i + 1])) i++
    } else if (ch === '&' && cmd[i + 1] === '&') {
      fim()
      out.push({ op: '&&' })
      i++
    } else if (ch === '|' && cmd[i + 1] === '|') {
      fim()
      out.push({ op: '||' })
      i++
    } else if (/[;|&#\n\r]/.test(ch)) {
      fim()
      out.push({ op: ch })
    } else if (/\s/.test(ch)) fim()
    else {
      w += ch
      tem = true
    }
  }
  if (q) return null
  fim()
  return out
}

/**
 * Words of each command of an `&&` chain, or null when anything else could break the proof that every one ran and
 * succeeded: an unquoted `||`, `;`, `|`, `&`, `#` or newline. Quoted text is never a segment.
 */
export function comandosEncadeados(cmd: string): string[][] | null {
  const t = lexar(cmd)
  if (!t) return null
  const segs: string[][] = [[]]
  for (const x of t) {
    if (typeof x === 'string') segs[segs.length - 1]!.push(x)
    else if (x.op === '&&') segs.push([])
    else return null
  }
  return segs.some(s => !s.length) ? null : segs // an empty segment is a shell syntax error
}

/** Words of the last command of an `&&` chain (see comandosEncadeados), or null. */
export function ultimoComando(cmd: string): string[] | null {
  const segs = comandosEncadeados(cmd)
  return segs ? segs[segs.length - 1]! : null
}

/** A word that may precede the command name: an env assignment (`FOO=1`) or the `time` / `command` prefix. */
const prefixo = (x: Tok) => typeof x === 'string' && (/^[A-Za-z_]\w*=/.test(x) || x === 'time' || x === 'command')

/**
 * Words after `gh pr create` where a command starts (any position, operators tolerated, env assignments and
 * `time`/`command` before it), or null. Success is proven by the PR url in the output, not by the chain.
 */
export function prCreate(cmd: string): string[] | null {
  const t = lexar(cmd)
  if (!t) return null
  for (let i = 0; i + 2 < t.length; i++) {
    let j = i
    while (j > 0 && prefixo(t[j - 1]!)) j--
    if (t[i] === 'gh' && t[i + 1] === 'pr' && t[i + 2] === 'create' && (j === 0 || typeof t[j - 1] !== 'string')) {
      const rest: string[] = []
      for (let j = i + 3; j < t.length && typeof t[j] === 'string'; j++) rest.push(t[j] as string)
      return rest
    }
  }
  return null
}

/**
 * Branch named in a `git push` that the Bash result proves ran: the last `git push [flags] <remote> <ref>` of an `&&`
 * chain. A delete push (`--delete`, `-d` alone or combined like `-fd`, `:<ref>`) publishes nothing: null.
 */
export function branchDoPush(command: string): string | null {
  const w = comandosEncadeados(command)?.filter(x => x[0] === 'git' && x[1] === 'push').pop()
  if (!w || w.some(a => a === '--delete' || /^-[^-]*d/.test(a))) return null
  const args = w.slice(2).filter(a => !a.startsWith('-'))
  if (args.length < 2) return null
  const ref = args[args.length - 1]
  if (ref.startsWith(':')) return null
  return ref.includes(':') ? ref.split(':').pop() || null : ref
}

/** First PR url printed by `gh pr create`. */
export function urlDoPr(text: string): string | null {
  const m = text.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/)
  return m ? m[0] : null
}

export type EstadoConjunto = {
  id: string
  status: 'nao-iniciado' | 'em-andamento' | 'concluido' | 'bloqueado'
  etapa: Etapa | null
  feitos: number
  total: number
  validado: boolean
}

/** Derives a set's state from its spec documents (R18: the aggregate is never stored). */
export function estadoConjunto(c: PlanoConjunto, specs: Record<string, SpecDoc>, doc?: ConjuntoDoc): EstadoConjunto {
  const docs = c.specs.map(id => specs[id] || {})
  const bloqueado = Object.keys(doc?.bloqueios || {}).length > 0 || docs.some(d => Object.keys(d.bloqueios || {}).length > 0)
  const ranks = docs.map(d => rank(d.etapa))
  const feitos = ranks.filter(r => r === ETAPAS.indexOf('merge')).length
  const menor = ranks.length ? Math.min(...ranks) : -1
  const algum = ranks.some(r => r >= 0) || !!doc?.iniciadoEm
  const validado = docs.length > 0 && docs.every(d => d.validacao?.resultado === 'aprovado' && !!d.headSha && d.validacao?.sha === d.headSha)
  const status = bloqueado ? 'bloqueado' : feitos === docs.length && docs.length > 0 ? 'concluido' : algum ? 'em-andamento' : 'nao-iniciado'
  return { id: c.id, status, etapa: menor >= 0 ? ETAPAS[menor] : null, feitos, total: docs.length, validado }
}

/** Sets whose dependencies are all concluded and that have not started: ready to dispatch. */
export function liberados(plano: Plano, specs: Record<string, SpecDoc>, conjuntos: Record<string, ConjuntoDoc>): string[] {
  const cs = plano.conjuntos || []
  const st = new Map(cs.map(c => [c.id, estadoConjunto(c, specs, conjuntos[c.id])]))
  return cs.filter(c => st.get(c.id)!.status === 'nao-iniciado' && (c.dependeDe || []).every(d => st.get(d)?.status === 'concluido')).map(c => c.id)
}

/** A set ready to close: every spec published or later and validated at its head, not all merged, no block. */
export function prontoParaFechar(e: EstadoConjunto): boolean {
  return e.status === 'em-andamento' && e.validado && rank(e.etapa) >= rank('branch-publicada')
}

/** Sets the orchestrator may send FECHA to (orquestrar.md 5.1): ready to close, every dependency concluded. */
export function aFechar(plano: Plano, specs: Record<string, SpecDoc>, conjuntos: Record<string, ConjuntoDoc>): string[] {
  const cs = plano.conjuntos || []
  const st = new Map(cs.map(c => [c.id, estadoConjunto(c, specs, conjuntos[c.id])]))
  return cs.filter(c => prontoParaFechar(st.get(c.id)!) && (c.dependeDe || []).every(d => st.get(d)?.status === 'concluido')).map(c => c.id)
}

/**
 * Sets ready to close with nothing held (orquestrar.md 5.1 condition 4): `aFechar`, a present espelho written in the
 * last 15 minutes with no lock (an absent or stale mirror is no evidence of no lock), and no verify/producao grant.
 */
export function prontosSemLock(plano: Plano, specs: Record<string, SpecDoc>, conjuntos: Record<string, ConjuntoDoc>, slots: Slots, agora: number): { conjunto: string; n: number }[] {
  const segura = (c: string) => slots.verify.dono?.conjunto === c || slots.producao.dono?.conjunto === c
  return aFechar(plano, specs, conjuntos)
    .filter(c => {
      const e = conjuntos[c]?.espelho
      return !!e && agora - Date.parse(e.at) <= 15 * 60_000 && Object.keys(e.locks ?? {}).length === 0 && !segura(c)
    })
    .map(c => ({ conjunto: c, n: (plano.conjuntos || []).find(x => x.id === c)?.specs.length ?? 0 }))
}

/** Artifact url of a `/novarc-session-build orquestrar <url> ...` invocation, if that is what the args are. */
export function urlOrquestrar(args: string): string | null {
  const m = args.match(/^\s*orquestrar\s+(https:\/\/claude\.ai\/\S+)/)
  return m ? m[1] : null
}

/** One-line text for the band of a set session. */
export function faixaConjunto(c: PlanoConjunto, e: EstadoConjunto): string {
  const etapa = e.status === 'bloqueado' ? 'bloqueado' : e.etapa ? ETAPA_LABEL[e.etapa] : 'não iniciado'
  const fim = prontoParaFechar(e) ? ' · pronto para fechar' : e.validado ? ' · validado' : ''
  return `${c.id} · ${etapa} · ${e.feitos}/${e.total} specs${fim}`
}

/** Idle band text: how many runs other sessions on this machine hold. */
export function faixaOcioso(outras: number): string {
  return outras === 0 ? 'nenhuma execução aqui' : `${outras} execução(ões) na máquina`
}

export function faixaOrq(vivos: number): string {
  return `${vivos} conjuntos vivos`
}

/** One square per spec lane: DONE green, open lock or BLOCKED red, else in progress. */
export function quadrados(raias: Raia[]): ('success' | 'error' | 'claude')[] {
  return raias.map(r => (r.celulas[r.celulas.length - 1] === 'feito' ? 'success' : r.lockAberto || r.ultimo === 'BLOCKED' ? 'error' : 'claude'))
}

/** Whether the band is hidden, idle (nothing to show yet) or active. */
export function estadoFaixa(modo: 'auto' | 'on' | 'off', papel: string | null, txt: string | null, nunca: boolean): 'oculta' | 'ociosa' | 'ativa' {
  if (nunca || modo === 'off') return 'oculta'
  return modo === 'on' || papel || txt ? 'ativa' : 'ociosa'
}

export type DbDoc = { id: string; data: Record<string, unknown>; version: number }

/**
 * Parses an ArtifactData get/list/query result. The tool prints one JSON object per line between
 * BEGIN/END ARTIFACT DB markers: {"id","data","version","updatedAt"}. Lines that are not such objects are ignored.
 */
export function lerDocs(text: string): DbDoc[] {
  const out: DbDoc[] = []
  for (const linha of text.split(/\r?\n/)) {
    const t = linha.trim()
    if (!t.startsWith('{"id"')) continue
    try {
      const o = JSON.parse(t)
      if (typeof o.id === 'string' && typeof o.version === 'number' && o.data && typeof o.data === 'object') out.push({ id: o.id, data: o.data, version: o.version })
    } catch {
      // not a document line
    }
  }
  return out
}

/** Documents of a list/get text by id, versions kept. */
export function porId(texto: string): Record<string, DbDoc> {
  return Object.fromEntries(lerDocs(texto).map(d => [d.id, d]))
}

/** The client's folder in the partners' catalogue: the client name at the root, as the partners file it (trimmed segments), '' without a client. */
export function pastaDoCliente(cliente: string | null | undefined): string {
  const c = String(cliente ?? '').split('/').map(s => s.trim()).filter(Boolean).join('/')
  return c
}

/** A folder path's slug, the catalogue page's own rule (no marks, lowercase, runs of other chars become '-'). */
export const slugPasta = (s: string) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---- C06-S02: the production order, the continuous cycle's decisions, the belt and the merge card (pure)

/**
 * The part of the project profile (C06-S01 `execucao.perfil`) these helpers read, typed structurally so this block
 * needs nothing of C06-S01; the real `Perfil` is passed in by assignment.
 */
export type PerfilProducao = {
  migracao?: { ordem?: string }
  deploys?: { alvo: string; dispara?: string }[]
  merge?: { clique?: boolean }
  teto?: { migracaoProducao?: boolean; deploy?: boolean }
}

/** One set's `producao` request: arrival time and the migrations and deploys it declares (`precisa` = a migration name). */
export type PedidoProducao = { conjunto: string; chegada: number; migracoes: string[]; deploys: { alvo: string; precisa?: string }[] }

/**
 * The orchestrator's serving order between sets (orquestrar.md \u00a74 "Production order"): `dependeDe` first, a set whose
 * deploy needs another set's migration after it, then (rule `timestamp`, the default) the older migration first with
 * a ruling line, then plan `ordem` (else plan position), then arrival. Sets caught in or behind a cycle go to `ciclo`.
 */
export function ordemProducao(plano: Plano, fila: PedidoProducao[], perfil?: PerfilProducao | null): { ordem: string[]; rulings: string[]; ciclo: string[] } {
  const conj = plano.conjuntos ?? []
  const pos = (C: string) => {
    const i = conj.findIndex(c => c.id === C)
    const o = (conj[i] as { ordem?: unknown } | undefined)?.ordem
    return typeof o === 'number' ? o : i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const ped = new Map<string, PedidoProducao>()
  for (const p of [...fila].sort((a, b) => a.chegada - b.chegada)) {
    const x = ped.get(p.conjunto)
    if (x) {
      x.migracoes.push(...p.migracoes)
      x.deploys.push(...p.deploys)
    } else ped.set(p.conjunto, { ...p, migracoes: [...p.migracoes], deploys: [...p.deploys] })
  }
  const ids = [...ped.keys()]
  const antes = new Map(ids.map(c => [c, new Set<string>()]))
  for (const c of ids) {
    for (const d of conj.find(x => x.id === c)?.dependeDe ?? []) if (d !== c && ped.has(d)) antes.get(c)!.add(d)
    for (const dp of ped.get(c)!.deploys) {
      if (dp.precisa) for (const o of ids) if (o !== c && ped.get(o)!.migracoes.includes(dp.precisa)) antes.get(c)!.add(o)
    }
  }
  const porData = !perfil?.migracao?.ordem || perfil.migracao.ordem === 'timestamp'
  const maisVelha = (c: string) => [...ped.get(c)!.migracoes].sort()[0] ?? null
  const base = (a: string, b: string) => pos(a) - pos(b) || ped.get(a)!.chegada - ped.get(b)!.chegada
  const regra = (a: string, b: string) => {
    const ma = maisVelha(a)
    const mb = maisVelha(b)
    return porData && ma && mb && ma !== mb ? (ma < mb ? -1 : 1) : base(a, b)
  }
  const ordem: string[] = []
  const rulings: string[] = []
  const resta = new Set(ids)
  while (resta.size) {
    const prontos = [...resta].filter(c => [...antes.get(c)!].every(d => !resta.has(d)))
    if (!prontos.length) break
    const vez = [...prontos].sort(regra)[0]!
    const semRegra = [...prontos].sort(base)[0]!
    if (vez !== semRegra) rulings.push(`${vez} antes de ${semRegra}: migra\u00e7\u00e3o ${maisVelha(vez)} \u00e9 mais antiga que ${maisVelha(semRegra)} (regra timestamp)`)
    ordem.push(vez)
    resta.delete(vez)
  }
  return { ordem, rulings, ciclo: [...resta].sort(base) }
}

/** The last `NOTE ORDEM-PRODUCAO` of the orchestrator ledger: set ids in order, each set's declared items. */
export type OrdemLedger = { conjuntos: string[]; itens: Record<string, string[]> }

/** `ORDEM-PRODUCAO C07 C08:migracao=x,merge`: the last such NOTE wins; tokens that are not `C<nn>` are dropped. */
export function ordemDoLedger(evs: { tipo: string; texto: string }[]): OrdemLedger | null {
  let ultima: string | null = null
  for (const e of evs) if (e.tipo === 'NOTE' && /^ORDEM-PRODUCAO(\s|$)/.test(e.texto.trim())) ultima = e.texto.trim()
  if (ultima === null) return null
  const out: OrdemLedger = { conjuntos: [], itens: {} }
  for (const tok of ultima.split(/\s+/).slice(1)) {
    const i = tok.indexOf(':')
    const C = i < 0 ? tok : tok.slice(0, i)
    if (!/^C\d{2}$/.test(C) || out.conjuntos.includes(C)) continue
    out.conjuntos.push(C)
    const itens = i < 0 ? [] : tok.slice(i + 1).split(',').filter(Boolean)
    if (itens.length) out.itens[C] = itens
  }
  return out
}

/** The text of a `NOTE ORDEM-PRODUCAO` line (without `NOTE`), the inverse of `ordemDoLedger`. */
export function linhaOrdem(ordem: string[], itens: Record<string, string[]>): string {
  return ['ORDEM-PRODUCAO', ...ordem.map(C => (itens[C]?.length ? `${C}:${itens[C]!.join(',')}` : C))].join(' ')
}

/** The next `producao` request to grant: listed sets by their place in the order, unlisted after; `fila` is in arrival order. */
export function proximoProducao<T extends { conjunto: string }>(fila: T[], ordem: OrdemLedger | null): T | null {
  if (!fila.length) return null
  if (!ordem) return fila[0]!
  const lugar = (C: string) => {
    const i = ordem.conjuntos.indexOf(C)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  return fila.map((f, i) => ({ f, i })).sort((a, b) => lugar(a.f.conjunto) - lugar(b.f.conjunto) || a.i - b.i)[0]!.f
}

export const MOTIVO_FECHA = 'pendentes resolvidos no pr\u00e9-fechamento das specs'

/**
 * `CONJUNTO <C> pronto` with \u00a75.1 holding (R1, R2, R27, R29): Pausado sends nothing; Cont\u00ednuo with the authorization
 * sends FECHA, except a click profile before C08; everything else asks the person who conducts.
 */
export function decidirFecha(i: { C: string; modo: 'manual' | 'continuo' | 'pausado'; autorizado: boolean; clique: boolean | undefined; c08: boolean }): { acao: 'enviar' } | { acao: 'perguntar'; texto: string } | { acao: 'nada' } {
  if (i.modo === 'pausado') return { acao: 'nada' }
  if (i.modo === 'continuo' && i.autorizado && !(i.clique && !i.c08)) return { acao: 'enviar' }
  return { acao: 'perguntar', texto: `${i.C} pronto para fechar` }
}

const sha7 = (s: string) => s.slice(0, 7).toLowerCase()

/** R4: `FECHA C06 C06-S01=<sha> C06-S02=<sha>` -> `ciclo-pendentes-C06-<sha7>-<sha7>`; a line without valid pins has no key. */
export function chaveCicloPendentes(linhaFecha: string): string | null {
  const m = String(linhaFecha).split(/\r?\n/)[0]!.trim().match(/^FECHA (C\d{2})((?: C\d{2}-S\d{2}=[0-9a-fA-F]{7,})+)$/)
  if (!m) return null
  return `ciclo-pendentes-${m[1]}-${m[2]!.trim().split(' ').map(p => sha7(p.slice(p.indexOf('=') + 1))).join('-')}`
}

/** R22: the GO inicio key, distinct from C03's phase-4 key `go-<slug>-fase4-<runId>`. */
export const chaveGoInicio = (C: string, runId: string) => `go-inicio-${C}-${runId}`

/** R9: the click's key over the pinned heads, the same for the pane button and the agent. */
export const chaveCliqueMerge = (C: string, pins: string[]) => `clique-merge-${C}-${pins.map(sha7).join('-')}`

/**
 * Whether one production step may be granted (R16, R17). `escopo` null = Manual: the ceiling alone, a step it forbids
 * asks the person; an object = Cont\u00ednuo: the ceiling and the scope, a miss waits. A step the profile does not describe
 * always asks.
 */
export function liberaProducao(
  item: { tipo: 'migracao' | 'deploy' | 'merge'; nome: string },
  perfil: PerfilProducao | null | undefined,
  escopo: { migracoes?: boolean; deploys?: boolean; merge?: boolean } | null,
): { ok: true } | { ok: false; espera: string; perguntar: boolean } {
  const rot = item.tipo === 'migracao' ? `migra\u00e7\u00e3o ${item.nome}` : item.tipo === 'deploy' ? `deploy da ${item.nome}` : `merge do ${item.nome}`
  const pede = (motivo: string, perguntar: boolean) => ({ ok: false as const, espera: `${rot} espera voc\u00ea: ${motivo}`, perguntar })
  const descrito = !!perfil && (item.tipo === 'migracao' ? !!perfil.migracao : item.tipo === 'deploy' ? !!perfil.deploys?.some(d => d.alvo === item.nome) : !!perfil.merge)
  if (!descrito) return pede('o perfil do projeto n\u00e3o descreve esse passo', true)
  const teto = item.tipo === 'migracao' ? perfil!.teto?.migracaoProducao === true : item.tipo === 'deploy' ? perfil!.teto?.deploy === true : true
  if (!teto) return pede(item.tipo === 'migracao' ? 'o teto do perfil n\u00e3o libera migra\u00e7\u00e3o em produ\u00e7\u00e3o' : 'o teto do perfil n\u00e3o libera deploy', escopo === null)
  if (escopo === null) return { ok: true }
  const cobre = item.tipo === 'migracao' ? escopo.migracoes : item.tipo === 'deploy' ? escopo.deploys : escopo.merge
  if (!cobre) return pede(`a autoriza\u00e7\u00e3o n\u00e3o cobre ${item.tipo === 'migracao' ? 'migra\u00e7\u00f5es' : item.tipo === 'deploy' ? 'deploys' : 'o merge'}`, false)
  return { ok: true }
}

/** go-safety-net (R24, R25, R27): released sets whose empty session waits, with no delivered GO and no turn queued yet. */
export function goDevidos(i: { liberados: string[]; vazias: string[]; enviados: Set<string>; pedidos: Set<string>; modo: string }): string[] {
  if (i.modo !== 'continuo') return []
  return i.liberados.filter(C => i.vazias.includes(C) && !i.enviados.has(C) && !i.pedidos.has(C))
}

const CARIMBO = /\s+#\s(\d{4}-\d\d-\d\dT\S*)\s*$/

/** The `APPLIED <files\u2026>` and `DEPLOYED <targets\u2026> [VERIFIED <how>]` lines of a ledger: every named resource, with its stamp. */
export function comprovantes(texto: string): { migracoes: { nome: string; at: string }[]; deploys: { alvo: string; at: string }[] } {
  const out = { migracoes: [] as { nome: string; at: string }[], deploys: [] as { alvo: string; at: string }[] }
  for (const l of String(texto).split(/\r?\n/)) {
    const at = l.match(CARIMBO)?.[1] ?? ''
    const t = l.replace(CARIMBO, '').trim().split(/\s+/)
    if (t[0] !== 'APPLIED' && t[0] !== 'DEPLOYED') continue
    const fim = t.indexOf('VERIFIED')
    for (const r of t.slice(1, fim < 0 ? undefined : fim)) {
      if (t[0] === 'APPLIED') out.migracoes.push({ nome: r, at })
      else out.deploys.push({ alvo: r, at })
    }
  }
  return out
}

export type LinhaEsteira = { k: number; emoji: string; titulo: string; sub: string; status: 'feito' | 'rodando' | 'pendente' | 'falhou'; erro?: string }

/**
 * The belt rows (R18, R19) in the orchestrator's order. A row is done only on a proof; the first unproven row of the
 * set holding the grant runs (or failed, when the set reported `parada:falha-deploy`), and every row after a failure
 * waits. A released set (`soltos`) with unproven rows says so.
 */
export function linhasEsteira(
  ordem: OrdemLedger | null,
  i: { dono: string | null; soltos: string[]; feitos: Record<string, { migracoes: string[]; deploys: string[]; merge: boolean; go: boolean }>; falha: Record<string, string>; pr: Record<string, number | null> },
): LinhaEsteira[] {
  const out: LinhaEsteira[] = []
  let parado = false
  for (const C of ordem?.conjuntos ?? []) {
    const f = i.feitos[C] ?? { migracoes: [], deploys: [], merge: false, go: false }
    let primeiro = true
    for (const it of ordem!.itens[C] ?? ['merge']) {
      const r = it.startsWith('migracao=')
        ? { emoji: '\ud83d\uddc4\ufe0f', titulo: `migra\u00e7\u00e3o ${it.slice(9)}`, prova: f.migracoes.includes(it.slice(9)), sub: f.migracoes.includes(it.slice(9)) ? `${C} \u00b7 aplicada` : C }
        : it === 'merge'
          ? { emoji: '\ud83d\udd00', titulo: i.pr[C] ? `merge PR #${i.pr[C]}` : `merge ${C}`, prova: f.merge, sub: `${C} \u00b7 autom\u00e1tico` }
          : it.startsWith('deploy-')
            ? { emoji: '\ud83d\ude80', titulo: `deploy da ${it.slice(7)}`, prova: f.deploys.includes(it.slice(7)), sub: `${C} \u00b7 depois do merge` }
            : it === 'go'
              ? { emoji: '\ud83d\udce8', titulo: `GO ${C}`, prova: f.go, sub: 'brief atual' }
              : null
      if (!r) continue
      const linha: LinhaEsteira = { k: out.length + 1, emoji: r.emoji, titulo: r.titulo, sub: r.sub, status: 'pendente' }
      if (r.prova) linha.status = 'feito'
      else if (!parado && primeiro && i.falha[C] !== undefined) {
        linha.status = 'falhou'
        linha.erro = i.falha[C]
        parado = true
      } else if (!parado && primeiro && C === i.dono) linha.status = 'rodando'
      else if (i.soltos.includes(C)) linha.sub = `${r.sub} \u00b7 sem comprovante`
      if (!r.prova) primeiro = false
      out.push(linha)
    }
  }
  return out
}

/** The belt bar (R31): one segment per row, its alt text and the terminal fallback. */
export function resumoEsteira(ls: LinhaEsteira[]): { segmentos: ('d' | 'w' | 'b' | '')[]; alt: string; terminal: string } {
  const S = { feito: 'd', rodando: 'w', falhou: 'b', pendente: '' } as const
  const d = ls.filter(l => l.status === 'feito').length
  return { segmentos: ls.map(l => S[l.status]), alt: `esteira de produ\u00e7\u00e3o: ${d} de ${ls.length} feitos`, terminal: ls.map(l => (l.status === 'feito' ? '\u25ae' : '\u25af')).join('') }
}

/** What the PR checks proved at the merge: green, none ran, no PR (local merge), or not confirmed. */
export type Ci = 'verde' | 'sem-checks' | 'sem-pr' | 'nao-confirmado'

export type CartaoMerge = { emoji: '\ud83d\ude80' | '\ud83d\udd00'; titulo: string; sub: string; ultima: string | null; botao: boolean; borda: 'warning' | 'neutro'; toast: string | null }

/**
 * The merge card and toast of a set (R6, R7, R8, R28, R30): only what is proven. Published only with a deploy proof
 * after the merge; `gate verde` / `CI verde` only with green checks; the click Button only for the owner.
 */
export function cartaoMerge(i: {
  C: string
  pr: number | null
  ci: Ci | null
  merged: boolean
  deployNoMerge: boolean
  publicado: boolean
  prontoParaMerge: boolean
  clique: boolean | undefined
  orquestrador: boolean
  dono: { pessoa?: string; maquina?: string; podeLiberar?: boolean } | null
  eu: { pessoa: string; maquina: string }
  aplicado: string[]
}): CartaoMerge | null {
  const gate = (esperando: boolean) => (i.ci === 'verde' ? 'gate verde' : i.ci === 'sem-checks' ? 'gate sem checks' : esperando ? 'gate ainda n\u00e3o confirmado' : 'gate n\u00e3o confirmado')
  const pr = (esperando: boolean) => (i.ci === 'sem-pr' ? 'merge local' : `PR #${i.pr ?? '?'} \u00b7 ${gate(esperando)}`)
  const modo = i.clique ? 'merge pelo seu clique' : 'autom\u00e1tico pelo perfil'
  if (i.merged) {
    const ci = i.ci === 'verde' ? 'CI verde' : i.ci === 'sem-checks' ? 'sem CI' : 'CI n\u00e3o confirmado'
    const meio = i.ci === 'sem-pr' ? '' : ` \u00b7 PR #${i.pr ?? '?'} \u00b7 ${ci}`
    return {
      emoji: i.publicado ? '\ud83d\ude80' : '\ud83d\udd00',
      titulo: i.publicado ? 'Mergeado e publicado' : 'Mergeado',
      sub: `${pr(false)} \u00b7 ${modo}`,
      ultima: !i.publicado && i.deployNoMerge ? 'publica\u00e7\u00e3o: aguardando o redeploy' : null,
      botao: false,
      borda: 'neutro',
      toast: i.publicado || !i.deployNoMerge ? `${i.C} mergeado${i.publicado ? ' e publicado' : ''}${meio} \u00b7 ${i.aplicado.join(', ') || 's\u00f3 o merge'}` : null,
    }
  }
  if (!i.clique || !i.prontoParaMerge) return null
  const d = i.dono
  return {
    emoji: '\ud83d\udd00',
    titulo: 'Pronto para merge',
    sub: `${pr(true)} \u00b7 ${modo}`,
    ultima: d?.podeLiberar === false ? 'merge e deploy esperam algu\u00e9m da NovArc' : 'o perfil pede aprova\u00e7\u00e3o humana \u00b7 espera o clique, sem prazo',
    botao: i.orquestrador && (d === null || (d.podeLiberar !== false && !!d.pessoa && d.pessoa === i.eu.pessoa && !!d.maquina && d.maquina === i.eu.maquina)),
    borda: 'warning',
    toast: null,
  }
}

// ---- C06-S01: project profile, continuous-mode authorization and mode

export type CampoPerfil = 'stack' | 'gate' | 'porAcao' | 'hostGit' | 'merge' | 'base' | 'migracao' | 'migracaoProducao' | 'deploy' | 'janelaDeploy'
export type Perfil = {
  hostGit?: 'github' | 'gitlab' | 'bitbucket'; mergePath?: 'pr' | 'local-merge'
  formato?: 'app' | 'docs-only' | 'infra-no-suite' | 'library'
  gate?: { comandos?: string[]; expect?: string | null }
  migracao?: { ferramenta?: string | null; aplicaNoMerge?: boolean; ordem?: string }
  deploys?: { alvo: string; dispara: 'merge' | 'manual' | 'comando'; comando?: string | null }[]
  merge?: { quem?: 'novarc' | 'cliente'; clique?: boolean }
  teto?: { ate?: 'pr-aberto' | 'merge' | 'deploy'; migracaoProducao?: boolean; deploy?: boolean; porAcao?: boolean }
  stack?: string; base?: string; janelaDeploy?: string; fontes?: Partial<Record<CampoPerfil, string>>; geradoEm?: string
}
export type ModoContinuo = 'manual' | 'continuo' | 'pausado'
export type AcaoContinuo = 'go' | 'hold' | 'fecha' | 'merge' | 'migracao' | 'deploy'
export type EscopoContinuo = { conjuntos: string[]; fases: string[]; merge: boolean; migracoes: boolean; deploys: boolean; ate: string | null }
export type AutorizacaoContinuo = { by: string; at: string; escopo: EscopoContinuo; teto: NonNullable<Perfil['teto']> | null; continuoHabilitado: boolean }
export type ContinuoDoc = { runId: string; modo: ModoContinuo; modoBy: string; modoAt: string; autorizacao: AutorizacaoContinuo | null }

const SEM_TETO = 'o perfil não descreve o teto do contínuo: o orquestrador pergunta'
const POR_ACAO = 'o CLAUDE.md do cliente exige autorização por ação'
const dois = (n: number) => String(n).padStart(2, '0')
const hhmm = (t: number) => `${dois(new Date(t).getHours())}:${dois(new Date(t).getMinutes())}`

/** Why the grant in `autorizacao` cannot act now, '' when it can: run, @NOVARC-CONTINUO.md, mode, ceiling presence, owner and clock. */
function liberacaoViva(i: { autorizacao: ContinuoDoc | null; runId: string | null; perfil: Perfil | null | undefined; agora: number; dono?: string | null; modo?: ModoContinuo }): string {
  const d = i.autorizacao
  const a = d?.autorizacao
  if (!d || !a) return 'sem liberação do contínuo nesta execução'
  if (d.runId !== i.runId) return 'liberação de outra execução'
  if (a.continuoHabilitado !== true) return 'liberação sem @NOVARC-CONTINUO.md de quem liberou'
  const modo = i.modo ?? d.modo
  if (modo !== 'continuo') return `modo ${modo}`
  const teto = i.perfil?.teto
  if (!teto) return SEM_TETO
  if (teto.porAcao) return POR_ACAO
  if (i.dono && i.dono !== a.by) return `liberação de ${a.by}; quem conduz agora é ${i.dono}: libere de novo`
  if (a.escopo.ate && i.agora >= Date.parse(a.escopo.ate)) return `liberação vencida às ${hhmm(Date.parse(a.escopo.ate))}`
  return ''
}

/** Whether the orchestrator may take `acao` for `conjunto` now, by the grant of this run and the live profile's ceiling. */
export function autorizado(i: { autorizacao: ContinuoDoc | null; runId: string | null; perfil: Perfil | null | undefined; acao: AcaoContinuo; conjunto: string; fase?: string | null; agora: number; dono?: string | null; modo?: ModoContinuo }): { ok: boolean; motivo: string } {
  const no = (motivo: string) => ({ ok: false, motivo })
  const viva = liberacaoViva(i)
  if (viva) return no(viva)
  const e = i.autorizacao!.autorizacao!.escopo
  if (!e.conjuntos.includes(i.conjunto)) return no(`${i.conjunto} fora do escopo liberado`)
  if (i.fase && e.fases.length && !e.fases.includes(i.fase)) return no(`fase ${i.fase} fora do escopo liberado`)
  const campo: Partial<Record<AcaoContinuo, boolean>> = { merge: e.merge, migracao: e.migracoes, deploy: e.deploys }
  if (i.acao in campo && !campo[i.acao]) return no(`${i.acao} fora do escopo liberado`)
  const t = i.perfil!.teto!
  const acima = i.acao === 'merge' ? t.ate !== 'merge' && t.ate !== 'deploy' : i.acao === 'migracao' ? !t.migracaoProducao : i.acao === 'deploy' ? !(t.deploy && t.ate === 'deploy') : false
  return acima ? no(`${i.acao} acima do teto do perfil`) : { ok: true, motivo: '' }
}

/** The first scope offered to the person: every set and phase, extras only as far as the profile allows. */
export function escopoSugerido(perfil: Perfil | null | undefined, plano: Plano, agora: number = Date.now(), conjuntos?: string[]): EscopoContinuo {
  const t = perfil?.teto
  if (t?.porAcao) return { conjuntos: [], fases: [], merge: false, migracoes: false, deploys: false, ate: null }
  const todos = plano.conjuntos ?? []
  const ids = conjuntos ?? todos.map(c => c.id)
  const fases = [...new Set(todos.filter(c => ids.includes(c.id) && c.fase).map(c => c.fase!))]
  const d = new Date(agora)
  const ate = d.getHours() < 17 ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0, 0, 0) : new Date(agora + 60 * 60_000)
  return {
    conjuntos: ids, fases,
    merge: t?.ate === 'merge' || t?.ate === 'deploy',
    migracoes: !!t?.migracaoProducao && !!perfil?.migracao,
    deploys: !!t?.deploy && t.ate === 'deploy' && !!perfil?.deploys?.length,
    ate: ate.toISOString(),
  }
}

/** The first way `escopo` goes above the ceiling `teto`, null when it fits. */
export function acimaDoTeto(escopo: EscopoContinuo, teto: Perfil['teto'] | null | undefined): string | null {
  if (!teto) return SEM_TETO
  if (teto.porAcao) return POR_ACAO
  if (escopo.merge && teto.ate !== 'merge' && teto.ate !== 'deploy') return 'merge acima do teto do perfil'
  if (escopo.migracoes && !teto.migracaoProducao) return 'migrações acima do teto do perfil'
  if (escopo.deploys && !(teto.deploy && teto.ate === 'deploy')) return 'deploy acima do teto do perfil'
  return null
}

/** The grant document and its audit row for a continuous-mode authorization; no ids or e-mails (R36). `projeto` (default 'projeto') only words the audit summary. */
export function registroLiberacao(i: { by: string; at: string; escopo: EscopoContinuo; perfil: Perfil | null | undefined; runId: string; continuoHabilitado: boolean; modoAntes: ModoContinuo; projeto?: string }): { ok: true; doc: ContinuoDoc; auditoria: { acao: 'LIBERACAO'; antes: string; depois: string; regra: 'p-excecao-claude-md' } } | { ok: false; motivo: string } {
  if (!i.continuoHabilitado) return { ok: false, motivo: 'sem @NOVARC-CONTINUO.md no seu CLAUDE.md; quem pode liberar roda /maestro continuo habilitar' }
  const acima = acimaDoTeto(i.escopo, i.perfil?.teto)
  if (acima) return { ok: false, motivo: acima }
  return {
    ok: true,
    doc: { runId: i.runId, modo: 'continuo', modoBy: i.by, modoAt: i.at, autorizacao: { by: i.by, at: i.at, escopo: i.escopo, teto: i.perfil!.teto!, continuoHabilitado: true } },
    auditoria: { acao: 'LIBERACAO', antes: i.modoAntes, depois: resumoEscopo(i.escopo, i.projeto ?? 'projeto'), regra: 'p-excecao-claude-md' },
  }
}

/** The mode of this run: a document of another run counts as manual (R14). */
export function modoDe(doc: ContinuoDoc | null | undefined, runId: string | null): ModoContinuo {
  // a doc with no runId is no other run's: its mode counts
  return doc && (!doc.runId || (runId && doc.runId === runId)) ? doc.modo : 'manual'
}

const SEM_LIBERACAO = 'Retomar exige a liberação desta execução: libere de novo no turno do orquestrador.'

/** The fields a pause, resume or return to manual writes, with the line the person reads. */
export function mudarModo(doc: ContinuoDoc | null, pedido: 'pausar' | 'retomar' | 'manual', i: { by: string; agora: number; runId: string | null; perfil: Perfil | null | undefined; dono?: string | null }): { ok: true; campos: { modo: ModoContinuo; modoBy: string; modoAt: string }; antes: ModoContinuo; texto: string } | { ok: false; texto: string } {
  const antes = modoDe(doc, i.runId)
  const ok = (modo: ModoContinuo, texto: string) => ({ ok: true as const, campos: { modo, modoBy: i.by, modoAt: new Date(i.agora).toISOString() }, antes, texto })
  if (pedido === 'manual') return ok('manual', 'Modo manual: o orquestrador age quando você fala com ele.')
  if (pedido === 'pausar') return ok('pausado', 'Modo contínuo pausado. Nada sai sozinho até retomar.')
  if (liberacaoViva({ autorizacao: doc, runId: i.runId, perfil: i.perfil, agora: i.agora, dono: i.dono, modo: 'continuo' })) return { ok: false, texto: SEM_LIBERACAO }
  return ok('continuo', 'Modo contínuo retomado com o escopo de antes.')
}

/** R14: a new run starts manual with no grant. */
export function camposReinicio(runId: string, by: string, agora: number): ContinuoDoc {
  return { runId, modo: 'manual', modoBy: by, modoAt: new Date(agora).toISOString(), autorizacao: null }
}

/** One line of what a grant covers, e.g. `GO, HOLD e FECHA no Maestro v2 · até 18:00`. */
export function resumoEscopo(e: EscopoContinuo, projeto: string): string {
  const itens = ['GO', 'HOLD', 'FECHA', ...(e.merge ? ['merge'] : []), ...(e.migracoes ? ['migrações'] : []), ...(e.deploys ? ['deploy'] : [])]
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]} no ${projeto}${e.ate ? ` · até ${hhmm(Date.parse(e.ate))}` : ''}`
}

/** `C06 a C09` for a run of sets, the lone id, or `nenhum conjunto`. */
export function faixaDeConjuntos(ids: string[]): string {
  return ids.length === 0 ? 'nenhum conjunto' : ids.length === 1 ? ids[0] : `${ids[0]} a ${ids[ids.length - 1]}`
}

/** Profile name of a plan: `<cliente>-<nomeCurto>` slug, else the lowercase project code. */
export function nomePerfil(plano: Plano): string {
  const { cliente, nomeCurto, codigo } = plano.projeto ?? {}
  return cliente && nomeCurto ? slugPasta(`${cliente} ${nomeCurto}`) : codigo ? codigo.toLowerCase() : 'projeto'
}

/** The mode pill of the strip: on the orchestrator it states the mode, on a unit it says where it was set. */
export function seloModo(modo: ModoContinuo, unidade: boolean): { texto: string; tom: 'neutro' | 'ok' | 'ruim' } {
  if (modo === 'continuo') return { texto: unidade ? 'contínuo · liberado na orquestradora' : 'modo contínuo', tom: 'ok' }
  if (modo === 'pausado') return { texto: unidade ? 'pausado · liberado na orquestradora' : 'pausado', tom: 'ruim' }
  return { texto: unidade ? 'manual · definido na orquestradora' : 'modo manual', tom: 'neutro' }
}

const AUTO = (e: EscopoContinuo) => (e.merge && e.deploys ? 'merge e deploy automáticos' : e.merge ? 'merge automático' : 'sem merge automático')

/** The scope line of the authorization card. */
export function linhaEscopoCartao(e: EscopoContinuo, nome: string): string {
  return `Esta execução · ${faixaDeConjuntos(e.conjuntos)} · ${AUTO(e)} · teto do perfil ${nome}`
}

/** One checked row per thing the grant lets the orchestrator do alone; `agora` only decides "de hoje". */
export function itensCartao(e: EscopoContinuo, agora: number = Date.now()): string[] {
  const fim = e.ate ? Date.parse(e.ate) : null
  const dia = (t: number) => new Date(t).toDateString()
  const quando = fim === null ? 'sem hora para acabar' : dia(fim) === dia(agora) ? `vale até ${hhmm(fim)} de hoje` : `vale até ${dois(new Date(fim).getDate())}/${dois(new Date(fim).getMonth() + 1)} ${hhmm(fim)}`
  return ['GO, HOLD e FECHA sem perguntar', ...(e.merge ? [e.deploys ? 'merge e deploy na ordem da fila' : 'merge na ordem da fila'] : []), `${quando}; pausar a qualquer momento`]
}

const DIA = 24 * 60 * 60_000
const lista = (xs: string[]) => JSON.stringify([...xs].sort())
/** The written scope is the confirmed one: same sets, phases and extras; `ate` within ±10 min. */
function mesmoEscopo(e: EscopoContinuo, c: EscopoContinuo): boolean {
  const ate = (x: string | null) => (x === null ? NaN : Date.parse(x))
  return lista(e.conjuntos) === lista(c.conjuntos) && lista(e.fases) === lista(c.fases) && e.merge === c.merge && e.migracoes === c.migracoes && e.deploys === c.deploys
    && (c.ate === null ? e.ate === null : Math.abs(ate(e.ate) - ate(c.ate)) <= 10 * 60_000)
}
// sorted-key JSON, undefined keys dropped: the copied ceiling must equal the live one
const chaveTeto = (t: unknown) => JSON.stringify(Object.entries((t && typeof t === 'object' ? t : {}) as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)))

/**
 * R12 (fail closed): the agent's grant write checked whole against the live run, plan and ceiling; the normalized
 * document is the one stored. Refuses with the first motivo. `confirmado`: the scope the person confirmed on the
 * card; the written scope must equal it (`ate` within ±10 min).
 */
export function validarConcessao(data: unknown, i: { runId: string | null; perfil: Perfil | null | undefined; plano: Plano | null; agora: number; confirmado?: EscopoContinuo }): { ok: true; doc: ContinuoDoc } | { ok: false; motivo: string } {
  const no = (motivo: string) => ({ ok: false as const, motivo })
  const d = (data && typeof data === 'object' ? data : null) as Record<string, any> | null
  const a = d?.autorizacao && typeof d.autorizacao === 'object' ? (d.autorizacao as Record<string, any>) : null
  if (!d || !a) return no('pedido sem liberação')
  if (!i.runId || d.runId !== i.runId) return no('liberação de outra execução')
  if (d.modo !== 'continuo') return no('a liberação grava o modo contínuo')
  if (a.continuoHabilitado !== true) return no('liberação sem @NOVARC-CONTINUO.md de quem liberou')
  const by = typeof a.by === 'string' ? a.by.trim() : ''
  if (!by || /@|local_/.test(by)) return no('quem liberou vai pelo nome, nunca id ou e-mail')
  const at = typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)) ? a.at : null
  if (!at) return no('liberação sem hora')
  if (Math.abs(Date.parse(at) - i.agora) > 10 * 60_000) return no('hora da liberação fora do turno')
  const e = (a.escopo && typeof a.escopo === 'object' ? a.escopo : {}) as Record<string, any>
  const conjuntos = Array.isArray(e.conjuntos) ? e.conjuntos.map(String) : []
  const fases = Array.isArray(e.fases) ? e.fases.map(String) : []
  const doPlano = i.plano?.conjuntos ?? []
  if (!conjuntos.length) return no('escopo sem conjunto')
  const fora = conjuntos.find(c => !doPlano.some(p => p.id === c))
  if (fora) return no(`${fora} fora do planejamento`)
  const faseFora = fases.find(f => !doPlano.some(p => p.fase === f))
  if (faseFora) return no(`fase ${faseFora} fora do planejamento`)
  const fim = typeof e.ate === 'string' ? Date.parse(e.ate) : NaN
  if (Number.isNaN(fim)) return no('liberação sem hora para acabar')
  if (fim <= i.agora) return no('liberação já vencida')
  if (fim - i.agora > DIA) return no('liberação acima de 24 h')
  const escopo: EscopoContinuo = { conjuntos, fases, merge: e.merge === true, migracoes: e.migracoes === true, deploys: e.deploys === true, ate: e.ate }
  const acima = acimaDoTeto(escopo, i.perfil?.teto)
  if (acima) return no(acima)
  if (chaveTeto(a.teto) !== chaveTeto(i.perfil!.teto)) return no('teto copiado diferente do perfil')
  if (i.confirmado && !mesmoEscopo(escopo, i.confirmado)) return no('escopo diferente do confirmado no cartão')
  return { ok: true, doc: { runId: i.runId, modo: 'continuo', modoBy: by, modoAt: at, autorizacao: { by, at, escopo, teto: i.perfil!.teto!, continuoHabilitado: true } } }
}
