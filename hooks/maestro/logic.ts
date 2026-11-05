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
export type OrquestracaoDoc = { runId: string; sessao: string; iniciadaEm: string; slots: Slots; limiares: Limiares; proposta: Proposta | null; at: string }
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
