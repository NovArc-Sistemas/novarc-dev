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
export type PlanoConjunto = { id: string; titulo: string; specs: string[]; dependeDe?: string[]; prompt?: string }
export type Plano = {
  conjuntos?: PlanoConjunto[]
  specs?: PlanoSpec[]
  execucao?: { orquestrador?: string }
  projeto?: { cliente?: string; nomeCurto?: string; codigo?: string }
}

/** Project code and display name ("<cliente> · <nomeCurto>") of a plan. */
export function projetoDoPlano(p: Plano): { codigo: string | null; projeto: string | null } {
  const { cliente, nomeCurto, codigo } = p.projeto ?? {}
  return { codigo: codigo ?? null, projeto: cliente && nomeCurto ? `${cliente} · ${nomeCurto}` : cliente ?? nomeCurto ?? null }
}
export type SpecDoc = {
  etapa?: Etapa | null
  bloqueios?: Record<string, { motivo?: string }>
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
export type ConjuntoDoc = { iniciadoEm?: string; bloqueios?: Record<string, { motivo?: string }>; espelho?: EspelhoConjunto }
export type Limiares = { calado: number; lockOrfao: number; fonte: 'padrao' | 'medido'; at: string }
export type Proposta = { calado: number; lockOrfao: number; amostras: number; at: string }
/** `config/orquestracao`: the orchestrator mod's singleton (run, slots, thresholds). */
export type OrquestracaoDoc = { runId: string; sessao: string; iniciadaEm: string; slots: Slots; limiares: Limiares; proposta: Proposta | null; at: string }
/** One `auditoria/{id}` document (C03-S01 dados.md); declared in types/index.d.ts, which must stay self-contained. */
export type { AuditoriaDoc } from '../../types'

/** Rank of an etapa; -1 for none. */
export function rank(etapa: string | null | undefined): number {
  return etapa ? ETAPAS.indexOf(etapa as Etapa) : -1
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
