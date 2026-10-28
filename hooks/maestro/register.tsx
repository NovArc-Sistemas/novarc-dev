// novarc mod: shows NOVARC execution state above the prompt and in a pane, and writes the mechanical milestones
// (branch publicada, PR aberto) that this session itself performs.
// v2 "olhos": a run is recognised without a planning artifact, from the session-build skill call, the fork spawns
// ("spec <slug>"), the fork -> main checkpoint messages and the ledger.py calls; every session writes a registry
// entry so the Agora tab of any session sees all runs on the machine.
import type { Register } from 'claude-code'

import type { AcervoSync, Alerta, Alertas, Contexto, Evento, Execucao, LinhaSweep, MapaSessoes, Registro, Slots } from '../../types'
import {
  LIMIARES_PADRAO, MAPA_VAZIO, VAZIA, TRILHA, alerta, anotar, calados, marcos, cartoesAgora, chamadaLedger, checkpoint, cortar, daMinhaExecucao, dobrarMapa, ehBuild, entradaMapa, espelhoParaGravar,
  faixaConjuntoRaias, laneDaMensagem, lerSweep, linhaConjunto, locksDoEspelho, marcadorDir, montarAlertas, noMapa, novasLinhas, novosToasts, orfaos, regraDaDiretiva,
  papelDaBranch, papelDoPrompt, papelDoSkill, progresso, proposta, raia, raiasPorConjunto, resumoEspelho, ritmo, ritmoTotal, slotsAbertos,
  slotsPresos, slugDoSpawn, textoCheckpoint, textoLimiares, vivo, type LockAberto, type Raia,
} from './execucao'
// C05-S01: sessions opened empty, the GO with the current brief
import { conjuntosDaAba, limpaAguardo, mapaDasNotas, notasOrq, resumoGo, runIdDoDir, type GoLocal, type NotasOrq } from './execucao'
import {
  ETAPA_FAIXA,
  aFechar,
  prontosSemLock,
  branchDoPush,
  estadoConjunto,
  estadoFaixa,
  faixaConjunto,
  faixaOcioso,
  faixaOrq,
  idDaBranch,
  lerDocs,
  porId,
  prCreate,
  liberados,
  pastaDoCliente,
  slugPasta,
  projetoDoPlano,
  quadrados,
  rank,
  specDaBranch,
  urlDoPr,
  urlOrquestrar,
  type ConjuntoDoc,
  type DbDoc,
  type EspelhoConjunto,
  type OrquestracaoDoc,
  type Plano,
  type Proposta,
  type Ritmo,
  type SpecDoc,
  type AuditoriaDoc,
} from './logic'
import {
  contadorDe,
  enviadosDoLedger,
  itensACaminho,
  lerArquivos,
  lerLegado,
  lerListaEstrita,
  montarItens,
  resumoDoc,
  slotPendencias,
  textoDivergencia,
  unirRepo,
  type EntradaRepo,
  type EstadoPendencias,
  type ItemPendencia,
  type PlanoPend,
  type Resposta,
} from './pendencias'
import { VISTA_PADRAO, abaPendencias, rotuloAba, type VistaPendencias } from './pendencias-aba'
import { abaInteligencia } from './inteligencia-aba'
import { COR as COR_CONJ, LOGO_FAIXA, alturaTabela, type Tom, barraSegmentosM, barraTempoDicaM, marca, tabelaTrilhasM, type LinhaTrilha } from './desenho'
import { kit, type Kit } from './kit'
import { REGRA, avaliarArquivo, avaliarBash, entradaAuditoria, idObservado, manifestosDoLedger, type ContextoGuarda, type Decisao } from './guardas'
import {
  checkoutPrincipal, diretivasPrevistas, lerProvaRelato, lerRelay, linhaProvaRelato, linhaRelay, relatoDoConjunto, relatoRelease, rotaDaDiretiva,
  resumoTurno, secaoMapa, type Prevista, type Relato,
} from './execucao'
// C05-S02: milestone ownership by phase and the session family
import { NOTAS_DOBRADAS, aceitos, chaveDe, emWip, familia, type LinhaFamilia, type SessaoApp } from './execucao'
import { decidirMarco, posseDaSpec } from './logic'

const PANE = 'novarc-maestro'
const CTX = { plugin: 'novarc', key: 'ctx' } as const
const LINHAS = { plugin: 'novarc', key: 'linhas' } as const
const FAIXA = { plugin: 'novarc', key: 'faixa' } as const
const EXEC = { plugin: 'novarc', key: 'exec' } as const
const MODO = { plugin: 'novarc', key: 'maestroModo' } as const
const ABA = { plugin: 'novarc', key: 'maestroAba' } as const
const OUTRAS = { plugin: 'novarc', key: 'maestroOutras' } as const
const ONDE = { plugin: 'novarc', key: 'maestroRegistro' } as const
const POR_DIR = { plugin: 'novarc', key: 'maestroPorDir' } as const
// Set session only: the stage label of its set from the plan (estadoConjunto), drawn in the band.
const ETAPA = { plugin: 'novarc', key: 'maestroEtapa' } as const
// The band's laid-out fields, computed by prepararFaixa after every look, poll and event: the band reads only this (R34).
const FAIXA_DADOS = { plugin: 'novarc', key: 'maestroFaixaDados' } as const
// C02-S01: this session's alerts, toast dedupe, last sweep and what the Locks e filas tab draws.
const ALERTAS = { plugin: 'novarc', key: 'maestroAlertas' } as const
// C02-S02: the Pendências tab's joined list (orchestrator), and the tab's own view (phase filter, doc, search).
const PEND = { plugin: 'novarc', key: 'maestroPendencias' } as const
const PEND_VISTA = { plugin: 'novarc', key: 'maestroPendVista' } as const
// C11-S01: whether this session opened the pane and the person did not close it (reopen on session.attach), and the
// state of the last reads per source (the trail band and the error card).
const MAESTRO_PAINEL = { plugin: 'novarc', key: 'maestroPainelAberto' } as const
const LEITURA = { plugin: 'novarc', key: 'maestroLeitura' } as const
// C03-S01: the audit queue's mirror (the module array is its single writer, R1-5) and the address map.
const AUDITORIA = { plugin: 'novarc', key: 'auditoriaPendente' } as const
const MAPA = { plugin: 'novarc', key: 'maestroMapa' } as const
// C03-S01 Task 6: the set session's directives waiting for their proof (R2-3), mirrored from the module list.
const ROTAS = { plugin: 'novarc', key: 'maestroRotas' } as const
// C03-S01 Task 7: the orchestrator's directive keys and their send lifecycle, mirrored from the module copies.
const FEITAS = { plugin: 'novarc', key: 'diretivasFeitas' } as const
const ENVIOS = { plugin: 'novarc', key: 'maestroEnvios' } as const
// C05-S02: the run's session family tree (orchestrator), rebuilt by the poll step, never in render; null = first read pending.
const FAMILIA = { plugin: 'novarc', key: 'maestroFamilia' } as const
// C05-S01: the orchestrator's local copy of each `GO <C> inicio` it sent (never a collection, R30), and the selected set.
const GOS = { plugin: 'novarc', key: 'maestroGos' } as const
const SEL = { plugin: 'novarc', key: 'maestroSelConjunto' } as const
const NUNCA = 'maestro-nunca'

type Leitura = { at: number | null; falhou: boolean; fonte: 'planejamento' | 'registro' | null; falhas: { planejamento: boolean; registro: boolean } }
const LEITURA_PADRAO = (): Leitura => ({ at: null, falhou: false, fonte: null, falhas: { planejamento: false, registro: false } })
const VISTA_ALERTAS = (): NonNullable<Alertas['vista']> => ({ locks: [], slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null })

/**
 * The default of every Maestro state key (dados.md), one thunk per key so a read builds only its own default (the band
 * reads on every redraw); thunks, since some defaults are declared further down.
 */
const PADRAO: Record<string, () => unknown> = {
  ctx: () => null,
  linhas: () => [],
  faixa: () => null,
  exec: () => VAZIA,
  maestroModo: () => 'auto',
  maestroAba: () => 'agora',
  maestroOutras: () => null,
  maestroRegistro: () => null,
  maestroPorDir: () => ({}),
  maestroEtapa: () => null,
  maestroFaixaDados: () => SEM_FAIXA,
  maestroAlertas: () => NOVO_ALERTAS(),
  maestroPendencias: () => null,
  maestroPendVista: () => VISTA_PADRAO,
  maestroPainelAberto: () => false,
  maestroLeitura: () => LEITURA_PADRAO(),
  auditoriaPendente: () => [],
  maestroMapa: () => MAPA_VAZIO(),
  maestroRotas: () => [],
  diretivasFeitas: () => [],
  maestroEnvios: () => ({}),
  maestroFamilia: () => null,
  maestroGos: () => ({}),
  maestroSelConjunto: () => null,
}
const objeto = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * Reads a state key merged over its default (R44): a value saved by an older version lacks the new fields and must
 * still draw. Null gives the default; an object merges (nested limiares, falhas, vista too); an array key gives the
 * stored value only when it is an array; a scalar only when its type matches the default's.
 */
export async function ler($: any, chave: string): Promise<any> {
  return mesclar(chave, await cru($, chave))
}

// $.state.get takes a literal reference (or a const of this file, never handed on) at the call site: one read per key
async function cru($: any, k: string): Promise<unknown> {
  switch (k) {
    case 'ctx': return (await $.state.get(CTX)).value
    case 'linhas': return (await $.state.get(LINHAS)).value
    case 'faixa': return (await $.state.get(FAIXA)).value
    case 'exec': return (await $.state.get(EXEC)).value
    case 'maestroModo': return (await $.state.get(MODO)).value
    case 'maestroAba': return (await $.state.get(ABA)).value
    case 'maestroOutras': return (await $.state.get(OUTRAS)).value
    case 'maestroRegistro': return (await $.state.get(ONDE)).value
    case 'maestroPorDir': return (await $.state.get(POR_DIR)).value
    case 'maestroEtapa': return (await $.state.get(ETAPA)).value
    case 'maestroFaixaDados': return (await $.state.get(FAIXA_DADOS)).value
    case 'maestroAlertas': return (await $.state.get(ALERTAS)).value
    case 'maestroPendencias': return (await $.state.get(PEND)).value
    case 'maestroPendVista': return (await $.state.get(PEND_VISTA)).value
    case 'maestroPainelAberto': return (await $.state.get(MAESTRO_PAINEL)).value
    case 'maestroLeitura': return (await $.state.get(LEITURA)).value
    case 'auditoriaPendente': return (await $.state.get(AUDITORIA)).value
    case 'maestroMapa': return (await $.state.get(MAPA)).value
    case 'maestroRotas': return (await $.state.get(ROTAS)).value
    case 'diretivasFeitas': return (await $.state.get(FEITAS)).value
    case 'maestroEnvios': return (await $.state.get(ENVIOS)).value
    case 'maestroFamilia': return (await $.state.get(FAMILIA)).value
    case 'maestroGos': return (await $.state.get(GOS)).value
    case 'maestroSelConjunto': return (await $.state.get(SEL)).value
    default: throw new Error(`ler: chave desconhecida ${k}`)
  }
}

/** The merge of R44 for one key, over its default; exported for the unit test. */
export function mesclar(chave: string, lido: unknown): any {
  const def = PADRAO[chave]!()
  if (lido === null || lido === undefined) return def
  if (chave === 'maestroOutras') return Array.isArray(lido) ? lido : null
  if (chave === 'maestroPendencias') return objeto(lido) ? { ...lido, falhas: { plano: false, repo: false, ledger: false, ...(lido as any).falhas } } : null
  if (def === null) return lido
  if (Array.isArray(def)) return Array.isArray(lido) ? lido : def
  if (objeto(def)) {
    if (!objeto(lido)) return def
    const m: Record<string, any> = { ...def, ...lido }
    if (chave === 'exec') m.forks = objeto(lido.forks) ? lido.forks : {}
    if (chave === 'maestroAlertas') {
      m.limiares = { ...LIMIARES_PADRAO, ...(lido as any).limiares }
      m.vista = objeto(lido.vista) ? { ...VISTA_ALERTAS(), ...lido.vista, ritmo: { ...VISTA_ALERTAS().ritmo, ...lido.vista.ritmo } } : undefined
    }
    if (chave === 'maestroLeitura') m.falhas = { ...(def as Leitura).falhas, ...(lido as any).falhas }
    return m
  }
  return typeof lido === typeof def ? lido : def
}

/** The one way the pane opens (R41): open it and remember that this session has it open. */
export async function abrirPainel($: any): Promise<void> {
  await $.ui.open({ id: PANE, title: 'Maestro' })
  await $.state.set(MAESTRO_PAINEL, true)
}

/** The person closed the pane: it must not come back on the next attach (R42). */
export async function aoFecharPainel($: any, origem: string): Promise<void> {
  if (origem === 'person') await $.state.set(MAESTRO_PAINEL, false)
}

/** The bell count (R25, R53): this session's alerts plus, in the orchestrator, divergences, the pending counter and `nEnvios` unconfirmed directives. */
export function contaSino(papel: string | null, al: Pick<Alertas, 'lista'> | null, pend: EstadoPendencias | null, nEnvios = 0): number {
  const n = al?.lista.length ?? 0
  return papel === 'orquestrador' ? n + nEnvios + (pend ? pend.divergencias.length + (pend.contador?.n ?? 0) : 0) : n
}

/** A send still `enviando` after this long has lost its answer (a poll tick is 60 s; a send itself takes seconds). */
const ENVIO_VELHO_MS = 30_000

/** The directives the person cannot trust (R53): failed, or left `enviando` past ENVIO_VELHO_MS; the newest first. */
export function semConfirmacao(es: Record<string, Envio>, agora: number): Envio[] {
  return Object.values(es ?? {})
    .filter(e => e && (e.estado === 'falhou' || (e.estado === 'enviando' && agora - e.at >= ENVIO_VELHO_MS)))
    .sort((a, b) => b.at - a.at)
}

/** Records one source's read (R12): each source fails on its own, so one recovering never hides the other's failure. */
async function marcarLeitura($: any, fonte: 'planejamento' | 'registro', ok: boolean): Promise<void> {
  const l = (await ler($, 'maestroLeitura')) as Leitura
  const falhas = { ...l.falhas, [fonte]: !ok }
  await $.state.set(LEITURA, {
    at: ok ? Date.now() : l.at,
    falhou: falhas.planejamento || falhas.registro,
    fonte: falhas.planejamento ? 'planejamento' : falhas.registro ? 'registro' : null,
    falhas,
  })
}

const LIMITE_CHAMADA_MS = 20_000

/** One planning tool call; a call with no answer in 20 s throws, so a hung call never wedges `refrescando` or the nudge. */
export async function chamar($: any, input: Record<string, unknown>): Promise<string> {
  let timer: { cancel: () => void } | null = null
  const limite = new Promise<never>((_, falha) => {
    try {
      timer = $.clock.after(LIMITE_CHAMADA_MS, () => falha(new Error('tool call timed out')))
    } catch {
      // no timer: the call is awaited as before
    }
  })
  try {
    const r = await Promise.race([$.tool.call(input), limite])
    if (!r || r.deny || r.isError) throw new Error(String((r && (r.deny || r.text)) || 'tool call failed'))
    return String(r.text ?? '')
  } finally {
    ;(timer as { cancel: () => void } | null)?.cancel()
  }
}

/**
 * Reads the artifact url from <base>/<codigo>/artefato.txt under the session cwd, .novarc/specs first and the legacy
 * ai/specs second; the first claude.ai url wins.
 */
async function acharArtefato($: any, cwd: string): Promise<string | null> {
  for (const base of ['.novarc/specs', 'ai/specs']) {
    try {
      const raiz = `${cwd}/${base}`
      for (const d of await $.fs.list(raiz)) {
        if (d.kind !== 'dir') continue
        try {
          const t = String(await $.fs.read(`${raiz}/${d.name}/artefato.txt`)).trim()
          if (t.startsWith('https://claude.ai/')) return t
        } catch {
          // no artefato.txt in this folder
        }
      }
    } catch {
      // no such folder: try the next base
    }
  }
  return null
}

async function lerPlano($: any, url: string): Promise<Plano | null> {
  const t = await chamar($, { tool: 'Artifact', action: 'read', url, path: 'plano.json' })
  const m = t.match(/File saved: "([^"]+)"/)
  if (!m) return null
  return JSON.parse(String(await $.fs.read(m[1].replace(/\\\\/g, '\\'))))
}

async function lerColecao($: any, url: string, collection: string): Promise<Record<string, DbDoc>> {
  const t = await chamar($, { tool: 'ArtifactData', action: 'list', url, collection, query: { limit: 1000 } })
  return porId(t)
}

/**
 * The last complete read of the planning database, versions kept. The poll replaces it when its lists succeed (specs,
 * execucao and, for the orchestrator only, config; a set or spec session keeps its previous config, which
 * refrescarBanco reads). `parcial`: made by refrescarBanco before any specs read.
 */
let banco: { specs: Record<string, DbDoc>; execucao: Record<string, DbDoc>; config: Record<string, DbDoc>; at: number; parcial?: true } | null = null

/** `erro`: the last caught error message, on `'falhou'`. */
export type Gravacao = { r: 'criado' | 'gravado' | 'ja-estava' | 'falhou'; versao: number | null; erro?: string }
type Campos = Record<string, unknown> | ((doc: DbDoc | null) => Record<string, unknown>)

/**
 * One pinned write of the writer's own fields (D4): `get` (skipped on the first attempt when `o.versao` is known, with
 * `o.doc` the document held for it), `update` with `if_version`, `set` without it only when the document is missing; a
 * refused pin re-reads and retries, 3 attempts. A function `campos` is recomposed from each attempt's document, so a
 * retry never re-sends stale fields. `o.aceita` false: the stored document already holds it (`ja-estava`).
 */
export async function gravarFixado(
  $: any,
  url: string,
  colecao: string,
  id: string,
  campos: Campos,
  o: { versao?: number | null; doc?: DbDoc | null; criar?: Record<string, unknown>; aceita?: (doc: DbDoc) => boolean } = {},
): Promise<Gravacao> {
  const versaoDe = (t: string) => {
    const m = t.match(/\bversion (\d+)/i)
    return m ? Number(m[1]) : null
  }
  const dados = (doc: DbDoc | null) => (typeof campos === 'function' ? campos(doc) : campos)
  let erro: string | undefined
  for (let i = 0; i < 3; i++) {
    let doc: DbDoc | null
    let versao: number
    if (i === 0 && o.versao) {
      doc = o.doc ?? null
      versao = o.versao
    } else {
      doc = lerDocs(await chamar($, { tool: 'ArtifactData', action: 'get', url, collection: colecao, doc_id: id }))[0] ?? null
      if (!doc) {
        try {
          const t = await chamar($, { tool: 'ArtifactData', action: 'set', url, collection: colecao, doc_id: id, data: o.criar ?? dados(null) })
          return { r: 'criado', versao: versaoDe(t) }
        } catch (err) {
          erro = (err as Error)?.message ?? String(err)
          continue
        }
      }
      versao = doc.version
    }
    if (doc && o.aceita && !o.aceita(doc)) return { r: 'ja-estava', versao }
    try {
      const t = await chamar($, { tool: 'ArtifactData', action: 'update', url, collection: colecao, doc_id: id, if_version: versao, data: dados(doc) })
      return { r: 'gravado', versao: versaoDe(t) }
    } catch (err) {
      // version moved (or the call failed): re-read and retry
      erro = (err as Error)?.message ?? String(err)
    }
  }
  return { r: 'falhou', versao: null, erro }
}

/** Writes a milestone on specs/<id> when the stored etapa is earlier (R3), through gravarFixado. */
async function marco($: any, url: string, specId: string, etapa: string, campos: Record<string, unknown>): Promise<string> {
  const dados = () => ({ etapa, ...campos, at: new Date().toISOString(), origem: 'mod' })
  return (await gravarFixado($, url, 'specs', specId, dados, { aceita: d => rank(d.data.etapa as string) < rank(etapa) })).r
}

// ---- C05-S02: the owner of specs/{S} decides who writes a milestone (milestones.md ownership table)

// The set ledger's DONE-ACEITO / REABERTO lines read so far (line order), per ledger.md path; rebuilt on a shrink.
let aceitosLidos: { path: string; size: number; mtimeMs: number; consumido: number; eventos: Evento[] } | null = null

/** Folds the new DONE-ACEITO / REABERTO lines of this session's set `ledger.md`; never throws. */
async function lerAceitos($: any, dir: string | null): Promise<Record<string, { aceito: boolean; sha: string | null; at: number }>> {
  if (!dir) return {}
  const p = `${dir}/ledger.md`
  try {
    const f = ((await $.fs.list(dir)) as { name: string; size: number; mtimeMs: number }[]).find(x => x.name === 'ledger.md')
    if (!f) return {}
    const a = aceitosLidos?.path === p ? aceitosLidos : null
    if (!a || a.size !== f.size || a.mtimeMs !== f.mtimeMs) {
      const texto = String(await $.fs.read(p))
      const de = a && f.size >= a.size ? a.consumido : 0
      const n = novasLinhas(texto, de)
      const novos = n.eventos.filter(e => e.tipo === 'NOTE' && /^(DONE-ACEITO|REABERTO)\s/.test(e.texto))
      aceitosLidos = { path: p, size: f.size, mtimeMs: f.mtimeMs, consumido: n.consumido, eventos: [...(de ? a!.eventos : []), ...novos] }
    }
    return aceitos(aceitosLidos!.eventos)
  } catch {
    return aceitos(aceitosLidos?.path === p ? aceitosLidos.eventos : [])
  }
}

/** The set session's address: the map (orchestrator), else the live registry entry, else `execucao/{C}.sessao` (title). */
async function rotaConjunto($: any, conjunto: string): Promise<string | null> {
  const doMapa = mapaAtual.conjuntos[conjunto]?.sessao
  if (doMapa) return doMapa
  const regs = daMinhaExecucao(((await ler($, 'maestroOutras')) ?? []) as Registro[], sessao)
  const r = regs.find(x => x.papel === 'conjunto' && x.conjunto === conjunto && vivo(x, Date.now()))
  if (r) return r.sessao
  return daBanco<ConjuntoDoc>(banco?.execucao?.[conjunto])?.sessao ?? null
}

/**
 * One observed milestone (`branch-publicada` of a push, `pr-aberto` of a PR) after the owner decision (R8-R13, R17, R24):
 * written by the owner only, else routed as MARCO (orchestrator) or NOTE MARCO (spec session past its accepted DONE).
 */
async function marcoDaFase($: any, url: string, ex: Execucao, plano: Plano, spec: { id: string; conjunto: string }, etapa: 'branch-publicada' | 'pr-aberto', campos: Record<string, unknown>, prova: string): Promise<void> {
  // the orchestrator sees the spec lanes in each set's folded ledger dir, not in its own run
  const forks = ex.papel === 'orquestrador' ? [...Object.values(ex.forks), ...Object.values(porDir).flatMap(x => Object.values(x.forks))] : Object.values(ex.forks)
  const fork = forks.find(f => f.spec?.toUpperCase() === spec.id)
  const ready = !!fork?.eventos.some(e => e.tipo === 'READY')
  const aceito = fork ? !!(await lerAceitos($, ex.ledgerDir))[fork.slug]?.aceito : false
  const rota = ex.papel === 'orquestrador' || ex.papel === 'spec' ? await rotaConjunto($, spec.conjunto) : null
  const d20a = ex.papel === 'orquestrador' && (await $.store.get('maestro-d20a')) === true
  // R24: a work-in-progress push (C10-S01 R20) records nothing while NOTE WIP-PUSH is the fork's last folded line
  const wip = !!fork && emWip(fork.eventos, fork.slug, NOTAS_DOBRADAS)
  // a spec role taken from the branch alone, with no run ledger seen, is no session-build run: today's write (Decision 4)
  const papel = ex.papel === 'spec' && !ex.ledgerDir ? null : ex.papel
  const a = decidirMarco({ papel, specDaSessao: ex.spec ?? null, spec: spec.id, etapa, ready, aceito, wip, rota: !!rota, d20a })
  const cod = ex.codigo ?? projetoDoPlano(plano).codigo ?? ''
  if (a.acao === 'gravar') {
    const r = await marco($, url, spec.id, etapa, papel ? { ...campos, sessao: nomeDaSessao(ex) } : campos)
    const sha = campos.headSha
    // a later push updates headSha alone (milestones.md "Write a milestone" step 2), only in a run session that owns it
    if (r === 'ja-estava' && etapa === 'branch-publicada' && papel && typeof sha === 'string' && sha)
      await gravarFixado($, url, 'specs', spec.id, () => ({ headSha: sha }), { aceita: d => rank(d.data.etapa as string) >= rank('branch-publicada') && d.data.headSha !== sha })
  } else if (a.acao === 'marco') {
    const text = `MARCO ${spec.id} ${etapa} ${prova}`
    await enviar($, { to: rota!, text, chave: chaveDe('marco', spec.id, etapa, prova), acao: 'MARCO', alvo: spec.conjunto, motivo: 'marco observado fora da sessão dona', regra: 'milestones.md:40-49' })
  } else if (a.acao === 'nota') {
    const linha = `MARCO ${spec.id} ${etapa} ${String(campos.branch ?? '')} ${prova}`.replace(/\s+/g, ' ')
    await anexarLedger($, 'NOTE', linha, fork!.slug)
    try {
      await $.session.send({ to: endereco(rota!), text: `NOTE ${linha}` })
    } catch {
      // the line stays in the fork ledger; the set session reconciles from it
    }
  } else if (a.acao === 'toast') {
    $.ui.toast(`Maestro: marco ${etapa} de ${spec.id} ignorado; dona agora: novarc-${cod}-${a.dona === 'spec' ? spec.id : spec.conjunto}`)
  }
}

/** Re-reads the current branch, so a session that switches branch or worktree after start follows it. */
async function seguirBranch($: any, c: Contexto, g = geracao): Promise<Contexto> {
  try {
    const spec = specDaBranch((await lerBranch($)) ?? '', c.plano as Plano)
    if ((spec?.id ?? null) === c.spec || velho(g)) return c
    const novo: Contexto = { ...c, conjunto: spec ? spec.conjunto : null, spec: spec ? spec.id : null, papel: spec ? 'spec' : null }
    await $.state.set(CTX, novo)
    return novo
  } catch {
    return c
  }
}

const LIST_SESSIONS = 'mcp__ccd_session_mgmt__list_sessions'
// Whether the app's session list tool exists here, read once per session (as ArtifactData's availability is).
let temListSessions: boolean | null = null

type Familia = { linhas: LinhaFamilia[]; at: number; fonte: 'app' | 'registro' }

/**
 * familia-refresh (jobs.md): one `list_sessions` call (the linked family, archived included), joined with the registry
 * and the address map into `maestroFamilia`. A direct call (pane open) rebuilds only a tree older than 60 s (R7).
 */
async function refrescarFamilia($: any, forcar: boolean, g = geracao): Promise<void> {
  const agora = Date.now()
  const antes = ((await ler($, 'maestroFamilia')) ?? null) as Familia | null
  if (!forcar && antes && agora - antes.at < 60_000) return
  temListSessions ??= (await $.tool.list()).some((t: { name: string }) => t.name === LIST_SESSIONS)
  let sessoes: SessaoApp[] | null = null
  if (temListSessions) {
    try {
      const r = await $.tool.call({ tool: LIST_SESSIONS, linked: true, include_archived: true, limit: 300 })
      const lido = !r || r.deny !== undefined || r.isError ? null : JSON.parse(String(r.text ?? ''))
      sessoes = Array.isArray(lido) ? (lido as SessaoApp[]) : null
    } catch {
      sessoes = null // R4: the tree from the registry alone
    }
  }
  const ex = ultimoExec ?? (await exec($))
  await lerOutras($) // the registry as of now (files cached by mtime), so a pane open right after start joins it
  const registros = daMinhaExecucao(((await ler($, 'maestroOutras')) ?? []) as Registro[], sessao)
  const linhas = familia({ sessoes, registros, mapa: mapaAtual, codigo: ex.codigo ?? '', eu: sessao, agora, aguardando: r => !!r.aguardandoGo })
  if (!velho(g)) await $.state.set(FAMILIA, { linhas, at: agora, fonte: sessoes ? 'app' : 'registro' } satisfies Familia)
}

// Bumped when a session ends: a look or poll still in flight from the ended session writes nothing after that.
let geracao = 0
const velho = (g: number) => g !== geracao

let atualizando = false

/**
 * The poll step; returns at once while a previous one runs. `doTimer`: the 5-minute timer's call, which also returns
 * when the band is off or no run is recognised; a direct call (/maestro, a milestone, the plan load) always refreshes.
 */
async function atualizar($: any, doTimer = false): Promise<void> {
  if (atualizando) return
  atualizando = true
  const g = geracao
  let fim = () => {}
  pollEmCurso = new Promise<void>(r => (fim = r))
  try {
    if (doTimer && ((await ler($, 'maestroModo')) === 'off' || !(await exec($)).papel)) return
    await refrescar($, g)
    if (!velho(g)) {
      try {
        await gravarOrquestracao($, g)
        await alertasAgora($)
      } catch (err) {
        await logarUmaVez($, 'orquestracao', err)
      }
    }
    if (!velho(g)) {
      try {
        await refrescarPendencias($, g)
      } catch (err) {
        await logarUmaVez($, 'pendencias', err)
      }
    }
    if (!velho(g) && ultimoExec?.papel === 'orquestrador') {
      try {
        await refrescarFamilia($, doTimer, g) // R7: the timer always reads; a pane open only past 60 s
      } catch (err) {
        await logarUmaVez($, 'familia', err)
      }
    }
    if (!velho(g)) await prepararFaixa($)
  } catch {
    // keep the last band
  } finally {
    if (!velho(g)) atualizando = false
    pollEmCurso = null
    fim()
  }
}

// C11-S01: the poll in flight (`🔄 tentar de novo` waits for it instead of racing it) and the retry itself.
let pollEmCurso: Promise<void> | null = null
let tentando = false

/**
 * `🔄 tentar de novo` (R32): re-reads the planning database alone (refrescar, not the poll, which also writes
 * config/orquestracao and re-reads Pendências), then one look, and Pendências only on that tab.
 */
async function tentarDeNovo($: any, aba: string): Promise<void> {
  if (tentando) return
  tentando = true
  try {
    $.ui.invalidate('ui.render')
    if (pollEmCurso) await pollEmCurso
    await refrescar($, geracao)
    await olharAgora($)
    if (aba === 'pendencias') await pendenciasAgora($)
  } finally {
    tentando = false
    $.ui.invalidate('ui.render')
  }
}

async function refrescar($: any, g: number): Promise<void> {
  let c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (!c || !c.artefato || !c.plano) return
  if (c.papel !== 'orquestrador') c = await seguirBranch($, c, g)
  try {
    const dSpecs = await lerColecao($, c.artefato, 'specs')
    const dExec = await lerColecao($, c.artefato, 'execucao')
    // R44 (R3-5): a set or spec session reads no `config` here; it keeps the last one (refrescarBanco reads it)
    const dConfig = c.papel === 'orquestrador' ? await lerColecao($, c.artefato, 'config') : (banco?.config ?? {})
    if (!velho(g)) banco = { specs: dSpecs, execucao: dExec, config: dConfig, at: Date.now() }
    if (!velho(g)) await marcarLeitura($, 'planejamento', true)
    const dados = (d: Record<string, DbDoc>) => Object.fromEntries(Object.entries(d).map(([id, x]) => [id, x.data]))
    const specs = dados(dSpecs) as Record<string, SpecDoc>
    const execucao = dados(dExec) as Record<string, ConjuntoDoc>
    const plano = c.plano as Plano
    const ls = (plano.conjuntos || []).map(cj => faixaConjunto(cj, estadoConjunto(cj, specs, execucao[cj.id])))
    if (velho(g)) return
    await $.state.set(LINHAS, ls)
    if (c.papel === 'orquestrador') {
      prontos = prontosSemLock(plano, specs, execucao, slotsOrq, Date.now())
      const liberadosAgora = liberados(plano, specs, execucao)
      const publicados = (plano.specs || []).filter(s => specs[s.id]?.etapa === 'branch-publicada' && specs[s.id]?.validacao?.sha !== specs[s.id]?.headSha).map(s => s.id)
      const fechar = aFechar(plano, specs, execucao)
      const txt = [
        publicados.length ? `validar: ${publicados.join(', ')}` : '',
        fechar.length ? `fechar: ${fechar.join(', ')}` : '',
        liberadosAgora.length ? `liberado: ${liberadosAgora.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const antes = (await ler($, 'faixa')) ?? null
      if (txt && txt !== antes) $.ui.toast(`NOVARC ${txt}`)
      await $.state.set(FAIXA, txt || null)
    } else if (c.conjunto) {
      const cj = (plano.conjuntos || []).find(x => x.id === c.conjunto)
      if (cj) {
        const est = estadoConjunto(cj, specs, execucao[cj.id])
        await $.state.set(FAIXA, faixaConjunto(cj, est))
        await $.state.set(ETAPA, est.etapa ? ETAPA_FAIXA[est.etapa] : null)
      }
    }
  } catch {
    // reading failed (login, network): keep the last band
    try {
      if (!velho(g)) await marcarLeitura($, 'planejamento', false)
    } catch {
      // the trail band keeps its last reading
    }
  }
}

let poll: { cancel: () => void } | null = null

/** Turns this session into the orchestrator view; `url` comes from the skill args when the repo has no artefato.txt. */
async function orquestrar($: any, url: string | null, papel: 'orquestrador' | 'conjunto' = 'orquestrador', conjunto: string | null = null): Promise<void> {
  // a skill url right after a /clear: let the background plan load land first, so neither write overwrites the other
  // (only with a url: the hot-reload call inside iniciarSessao passes none and must not wait on its own load)
  if (url) await carregando
  const atual = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (atual?.artefato) {
    await $.state.set(CTX, { ...atual, papel: atual.papel === 'orquestrador' || (atual.papel === 'spec' && papel === 'conjunto') ? atual.papel : papel })
  } else if (url) {
    const plano = await lerPlano($, url)
    if (plano) await $.state.set(CTX, { artefato: url, plano, conjunto, spec: null, papel })
  }
  const g = geracao
  const ligado = (await ler($, 'maestroModo')) !== 'off'
  // check and set with no await between: two callers never arm two polls; an ending session arms none
  if (ligado && !poll && !encerrando && !velho(g)) poll = $.clock.every(5 * 60 * 1000, () => atualizar($, true))
  // C03-S01 (jobs.md): the orchestrator's directive keys are seeded once the context is known, before the first nudge
  if (ultimoExec?.papel === 'orquestrador') void semearDiretivas($).catch(() => {})
}

// True from the first line of session.end until zerarSessao bumped the generation: nothing arms a poll in between.
let encerrando = false

/**
 * Arms the 5-minute poll in any session of a recognised run whose context holds a plan (R28 keeps a role-less session
 * idle): a set or spec session after a hot reload, a spec session whose plan came from artefato.txt.
 */
async function garantirPoll($: any): Promise<void> {
  if (poll || encerrando) return
  const g = geracao
  if ((await ler($, 'maestroModo')) === 'off' || !(await exec($)).papel) return
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (!c?.artefato || !c.plano) return
  if (!poll && !encerrando && !velho(g)) poll = $.clock.every(5 * 60 * 1000, () => atualizar($, true))
}

// ---- v2 olhos: the run as seen from this session, no artifact needed

let sessao = ''
let cwdSessao = ''
let titulo = ''
let olhar: { cancel: () => void } | null = null

async function exec($: any): Promise<Execucao> {
  return ((await ler($, 'exec')) ?? VAZIA) as Execucao
}

// ---- C03-S01 guards: decided synchronously from these module variables and the last `banco` read (R39)

// The run as last written or read; null only before this module ran session.start or session.end (one read, then kept).
let ultimoExec: Execucao | null = null
// ponytail: stays true until the session ends (no step-10 detection); add when a closed session-end must re-arm the block.
let sessionEndAtivo = false
let raizWorktree: string | null = null
let ramoPadrao = 'main'
// The default branch when origin/HEAD is absent: `main` when it exists locally, else `master`; resolved once.
let padraoSemOrigem: string | null = null
// The current branch, kept by lerBranch (start and after checkout/switch): a merge on the default branch is denied.
let ramoAtual: string | null = null
// Read once at session start: the OS temp dirs and <home>/.claude, never "outside the worktree".
let isentosSessao: string[] = []
// `<regra>|<texto>` of each outside-the-worktree warning already toasted and audited this session.
const avisadosFora = new Set<string>()
let locksConcedidos = new Set<string>()
let raizPlugin: string | null = null
// The guard's reason per tool_use_id, for the ToolResult card (Task 3); capped, oldest first out.
const guardados = new Map<string, { nivel: 'bloqueia' | 'avisa'; texto: string }>()
const MAX_GUARDADOS = 200
const KINDS_LOCK = new Set(['migration', 'db', 'file', 'deploy'])

/** Every write of the run state goes through here, so the guard reads it with no state call. */
async function gravarExec($: any, ex: Execucao): Promise<void> {
  ultimoExec = ex
  await $.state.set(EXEC, ex)
}

const absoluto = (p: string) => /^([a-zA-Z]:)?[\\/]/.test(p)

/** Worktree root and default branch, one process each (start and after checkout/switch/worktree); null / 'main' on doubt. */
async function lerRaizERamo($: any, cwd: string, g?: number): Promise<void> {
  let raiz: string | null = null
  let padrao = 'main'
  try {
    const r = await $.process.run(['git', 'rev-parse', '--show-toplevel'], { cwd })
    const d = r.exitCode === 0 ? String(r.stdout).trim().replace(/\\/g, '/') : ''
    raiz = absoluto(d) ? d : null
  } catch {
    raiz = null
  }
  try {
    const r = await $.process.run(['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { cwd })
    const d = r.exitCode === 0 ? String(r.stdout).trim() : ''
    if (r.exitCode !== 0) {
      padraoSemOrigem ??= (await $.process.run(['git', 'rev-parse', '--verify', '--quiet', 'main'], { cwd })).exitCode === 0 ? 'main' : 'master'
      padrao = padraoSemOrigem
    } else padrao = d.startsWith('origin/') && d.length > 7 ? d.slice(7) : 'main'
  } catch {
    padrao = 'main'
  }
  if (g !== undefined && velho(g)) return // a background start that outlived its session writes nothing
  raizWorktree = raiz
  ramoPadrao = padrao
}

function contextoGuarda(ex: Execucao): ContextoGuarda {
  const hold = !!ex.conjunto && banco?.execucao[ex.conjunto]?.data?.bloqueios?.hold != null
  const ledgerDir = ex.ledgerDir ? ex.ledgerDir.replace(/\\/g, '/') : null
  const isentos = [ledgerDir, raizPlugin, ...isentosSessao].filter((x): x is string => !!x)
  return {
    emExecucao: !!ex.papel,
    papel: ex.papel,
    conjunto: ex.conjunto ?? null,
    sessionEnd: sessionEndAtivo,
    hold,
    locks: [...locksConcedidos],
    raiz: raizWorktree,
    padrao: ramoPadrao,
    isentos,
    cwd: cwdSessao,
    ramo: ramoAtual,
    ledgerDir,
  }
}

/** Write and Edit: the caller's `file_path`, top-level or under `input`. */
async function guardaArquivo($: any, e: any, next: any): Promise<any> {
  const path = String(e.file_path ?? e.input?.file_path ?? '')
  return guardaENext($, e, next, ctx => avaliarArquivo(path, ctx))
}

/** This session's own release of a granted lock: the next migration warns again until a new GO. */
function soltarLock(cmd: string): void {
  if (!locksConcedidos.size) return
  const lg = chamadaLedger(cmd)
  if (lg?.tipo === 'APPLIED') locksConcedidos.delete('migration')
  if (lg?.tipo === 'RELEASE') locksConcedidos.delete(String(lg.texto ?? '').trim().split(/\s+/)[0]!)
}

// ---- C03-S01 audit queue (audit-flush, jobs.md): observed records wait here, a guard never waits on the network

type Pendente = { id: string; doc: AuditoriaDoc }
const MAX_FILA = 200
// The queue's source of truth (R1-5): mutated synchronously, mirrored to `auditoriaPendente` through one chain (R2-4).
let fila: Pendente[] = []
let filaRestaurada = false
let espelhoFila: Promise<unknown> = Promise.resolve()
let flushArmado: { cancel: () => void } | null = null
let descarregando = false
let nAuditoria = 0
let quem: string | null = null
// One `$.ui.log` per overflow episode: set at the first drop, cleared when the queue is below the cap again.
let cheiaAvisada = false
// The orchestrator's directive keys (R19, at most once): its single writer, mirrored to `diretivasFeitas` (R1-5, R2-4).
const diretivasFeitas = new Set<string>()

function espelharFila($: any): void {
  espelhoFila = espelhoFila.then(() => $.state.set(AUDITORIA, [...fila])).catch(() => {})
}

function armarFlush($: any): void {
  if (flushArmado) return
  try {
    flushArmado = $.clock.after(5000, () => {
      flushArmado = null
      void auditFlush($).catch(() => {})
    })
  } catch {
    flushArmado = null // no timer: the next look flushes
  }
}

/** The run id of an audit entry: `config/orquestracao.runId`, else the ledger dir's basename when it is a RUN_ID. */
function runIdAtual(ex: Execucao): string | null {
  const r = daBanco<OrquestracaoDoc>(banco?.config?.orquestracao)?.runId
  if (r) return r
  return runIdDoDir(ex.ledgerDir) // C05-S01: a set session's dir may carry `-<c>-<sid8>`
}

/**
 * `sessao` of an audit entry: the session-build name of this role (`novarc-<codigo>-<C|S>`, `novarc-orq-<codigo>`), not
 * `titulo`, which carries the branch name (A35).
 */
function nomeDaSessao(ex: Execucao): string {
  const cod = ex.codigo ? `-${ex.codigo}` : ''
  return ex.papel === 'orquestrador' ? `novarc-orq${cod}` : `novarc${cod}-${ex.spec ?? ex.conjunto ?? ex.papel}`
}

/** Queues one observed audit record (id scheme a) and arms the 5 s flush when the queue was empty. */
export async function auditar(
  $: any,
  e: { acao: string; alvo: string; motivo: string; regra: string; linha: string | null; origem: 'maestro' | 'agente'; antes?: string | null; depois?: string | null },
): Promise<void> {
  const ex = ultimoExec
  if (!ex?.papel) return
  const at = new Date()
  const id = idObservado(at, sessao, ++nAuditoria)
  quem ??= String((await $.env.get('USERNAME')) ?? (await $.env.get('USER')) ?? '')
  const doc = entradaAuditoria(e, { at, runId: runIdAtual(ex), sessao: nomeDaSessao(ex), papel: ex.papel, by: quem })
  const vazia = !fila.length
  fila.push({ id, doc })
  cortarFila($)
  espelharFila($)
  if (vazia) armarFlush($)
}

/** Keeps the newest MAX_FILA entries; the first drop of an overflow episode logs one line. */
function cortarFila($: any): void {
  if (fila.length <= MAX_FILA) return
  fila.splice(0, fila.length - MAX_FILA)
  if (cheiaAvisada) return
  cheiaAvisada = true
  try {
    $.ui.log('maestro: fila de auditoria cheia, a entrada mais antiga foi descartada')
  } catch {
    // the drop stands without its line
  }
}

function tirarDaFila($: any, ids: string[]): void {
  const s = new Set(ids)
  fila = fila.filter(x => !s.has(x.id))
  if (fila.length < MAX_FILA) cheiaAvisada = false
  espelharFila($)
}

// An "already exists" refusal; the platform's exact wording is unverified, so any of these words counts, but never a
// negation ("does not exist", "doesn't exist", "não existe"): that refusal is another failure and keeps the entry.
const EXISTE = /already exists|já existe/i
const NAO_EXISTE = /(not|n't) exist|não existe/i
const existe = (t: string) => EXISTE.test(t) && !NAO_EXISTE.test(t)
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The refusal names this queued id as a whole id (`...-1` is not named by `...-10`). */
const nomeia = (t: string, id: string) => new RegExp(`${escapar(id)}(?![0-9])`).test(t)

/**
 * audit-flush: one ArtifactData `batch` of up to 50 `set` without `if_version`. A refusal naming a queued id means a
 * previous flush wrote it: that id leaves and the rest is retried, at most 3 retries per tick; any other failure keeps
 * the queue for the next tick. Without an artifact the queue just waits (capped).
 */
async function auditFlush($: any): Promise<void> {
  if (descarregando || !fila.length) return
  descarregando = true
  try {
    const url = (((await ler($, 'ctx')) ?? null) as Contexto | null)?.artefato
    if (!url) return
    for (let recusas = 0; fila.length && recusas <= 3; recusas++) {
      const lote = fila.slice(0, 50)
      const writes = lote.map(x => ({ op: 'set', collection: 'auditoria', doc_id: x.id, data: x.doc }))
      const r = await $.tool.call({ tool: 'ArtifactData', action: 'batch', url, writes })
      if (r && r.deny === undefined && !r.isError) return tirarDaFila($, lote.map(x => x.id))
      // ponytail: an exists-type refusal is recognised by its wording and the whole queued ids it names
      const t = String(r?.deny ?? r?.text ?? '')
      if (!existe(t)) return // any other failure: the queue waits for the next tick
      const ja = lote.filter(x => nomeia(t, x.id)).map(x => x.id)
      if (!ja.length) return await umPorUm($, url, lote)
      tirarDaFila($, ja)
    }
  } finally {
    descarregando = false
  }
}

/**
 * An exists refusal that names no queued id: the batch's entries go one `set` at a time in this tick. A refused set
 * means already written (it leaves); any other failure keeps it and the rest for the next tick.
 */
async function umPorUm($: any, url: string, lote: Pendente[]): Promise<void> {
  for (const x of lote) {
    const r = await $.tool.call({ tool: 'ArtifactData', action: 'set', url, collection: 'auditoria', doc_id: x.id, data: x.doc })
    const ok = r && r.deny === undefined && !r.isError
    if (!ok && !existe(String(r?.deny ?? r?.text ?? ''))) return
    tirarDaFila($, [x.id])
  }
}

/** After a reload: the queue comes back from state once, merged under anything queued meanwhile, and its flush re-armed (R1-6). */
async function restaurarFila($: any): Promise<void> {
  if (!filaRestaurada) {
    filaRestaurada = true
    const guardada = ((await ler($, 'auditoriaPendente')) as Pendente[]).filter(x => x && typeof x.id === 'string' && x.doc)
    const tem = new Set(fila.map(x => x.id))
    fila = [...guardada.filter(x => !tem.has(x.id)), ...fila]
    cortarFila($)
    espelharFila($)
  }
  if (fila.length) armarFlush($)
}

// The address map: the module copy is its single writer, seeded once from state at session start, mirrored like the queue.
let mapaAtual: MapaSessoes = MAPA_VAZIO()
let mapaSemeado = false
let mapaTextoChave = ''
let mapaTexto = ''
let espelhoMapa: Promise<unknown> = Promise.resolve()

/** Synchronous read-modify-write of the module copy: no await between the read and the write. */
// C05-S01: the GO copy, serialized like the map; a write queued before a /clear is dropped by its generation
let gosAtual: Record<string, GoLocal> = {}
let gosSemeado = false
let espelhoGos: Promise<unknown> = Promise.resolve()

async function guardarGo($: any, C: string, texto: string): Promise<void> {
  const g = geracao
  if (!gosSemeado) {
    gosSemeado = true
    gosAtual = { ...(((await ler($, 'maestroGos')) ?? {}) as Record<string, GoLocal>), ...gosAtual }
  }
  if (velho(g)) return
  const r = resumoGo(texto)
  gosAtual = { ...gosAtual, [C]: { sha: r.sha ?? '', at: Date.now(), atualizadas: r.atualizadas, decisoesNovas: r.decisoesNovas, branches: r.branches, merges: r.merges } }
  const copia = gosAtual
  espelhoGos = espelhoGos.then(() => (velho(g) ? undefined : $.state.set(GOS, copia))).catch(() => {})
  await espelhoGos
}

function mudarMapa($: any, f: (m: MapaSessoes) => MapaSessoes): void {
  const novo = f(mapaAtual)
  if (novo === mapaAtual) return
  mapaAtual = novo
  espelhoMapa = espelhoMapa.then(() => $.state.set(MAPA, mapaAtual)).catch(() => {})
}

/** After a reload: the stored map once, under whatever this module already wrote meanwhile (the module's entries win). */
async function semearMapa($: any): Promise<void> {
  if (mapaSemeado) return
  mapaSemeado = true // before the await: a second caller never reads again
  const lido = (await ler($, 'maestroMapa')) as MapaSessoes
  mudarMapa($, m => ({
    conjuntos: { ...lido.conjuntos, ...m.conjuntos },
    specs: { ...lido.specs, ...m.specs },
    orquestrador: m.orquestrador ?? lido.orquestrador ?? null,
    at: Math.max(m.at, lido.at ?? 0),
  }))
}

// ---- C03-S01 Task 6: the set session reports upward with an on-disk proof and relays proven directives downward.
// It never originates a directive (A22): it sends only its own reports and lines the orchestrator provably issued.

// This set's fork ledger manifests (R6, R7), refreshed by `dobrar` from the text it already read: a cache rebuilt from disk
// on the first fold after a reload (the fold cursor resets with the module), never a source of its own.
let manifestos: Record<string, { texto: string; rev: string }> = {}
// Proof lines already appended (`RELATO ...`, seeded from ledger.md): the same report with the same revisions never goes twice.
let relatados = new Set<string>()
// Proof ids already relayed (R3-3): reserved synchronously before any await, seeded from the set ledger's RELAY lines.
let reservados = new Set<string>()
// Received lines waiting for their proof (R2-3): retried on the next two timer looks, mirrored to `maestroRotas`.
type Rota = { texto: string; tentativas: number }
let rotas: Rota[] = []
let rotasRestauradas = false
let espelhoRotas: Promise<unknown> = Promise.resolve()
// Orchestrator ledgers read for the artifact-less proof (R3-4): path -> size/mtime and its RELAY lines.
let relaysOrq: Record<string, { size: number; mtimeMs: number; linhas: { alvo: string; chave: string; linha: string }[] }> = {}

/** The ledger.py this session's agent ran, else the plugin's copy (the sweep's resolution). */
function scriptDoLedger($: any): string {
  // the plugin's directory may be reported as the folder holding plugin.json (.claude-plugin/): skills/ sits beside it
  const raiz = String($.plugin.root).replace(/[\\/]\.claude-plugin[\\/]?$/, '')
  return scriptLedger ?? `${raiz}/skills/novarc-session-build/core/scripts/ledger.py`
}

/** `ledger.py append --dir <ledgerDir> --type <tipo> --text <texto>` (R46: the only disk write); true when it ran clean. */
async function anexarLedger($: any, tipo: string, texto: string, fork?: string): Promise<boolean> {
  const dir = ultimoExec?.ledgerDir
  if (!dir) return false
  try {
    const r = await $.process.run(['python', scriptDoLedger($), 'append', '--dir', dir, ...(fork ? ['--fork', fork] : []), '--type', tipo, '--text', texto])
    return Number(r?.exitCode) === 0
  } catch {
    return false
  }
}

// One log line per session when a set session cannot tell its set (no skill args, no ORCHESTRATOR-SESSION, mixed slugs).
let semConjuntoAvisado = false

/**
 * This set session's set: the run's own, else the set the ledger's `ORCHESTRATOR-SESSION ... (novarc-<codigo>-Cnn)` line
 * put in the address map, else the `cNN-` prefix every fork slug shares; failing that, one log line and null.
 */
function conjuntoDe($: any, ex: Execucao): string | null {
  if (ex.conjunto) return ex.conjunto
  const doMapa = Object.keys(mapaAtual.conjuntos)
  if (doMapa.length === 1) return doMapa[0]!
  const prefixos = new Set(Object.keys(ex.forks).map(s => s.match(/^c(\d{2})-/i)?.[1] ?? ''))
  if (prefixos.size === 1 && !prefixos.has('')) return `C${[...prefixos][0]}`
  if (!semConjuntoAvisado) {
    semConjuntoAvisado = true
    try {
      $.ui.log('maestro: conjunto desta sessão desconhecido, relatos e repasses parados')
    } catch {
      // no log surface
    }
  }
  return null
}

/** The orchestrator: the set ledger's `NOTE ORQUESTRADOR` row (its `local_` id, else its name), else the plan's. */
function orquestradorGravado(c: Contexto | null): string | null {
  const o = mapaAtual.orquestrador ?? (c?.plano as Plano | undefined)?.execucao?.orquestrador ?? null
  return o ? (o.match(/local_[0-9a-f-]{36}/)?.[0] ?? o.trim().split(/\s+/)[0]!) : null
}
const endereco = (x: string) => (x.startsWith('local_') ? { sessionId: x } : x)

/** RELAY lines and RELATO proofs of new set ledger.md lines (a reload must not relay or report twice). */
function semearProvas(linhas: string): void {
  for (const l of linhas.split(/\r?\n/)) {
    const t = l.replace(/\s+#\s\d{4}-\d\d-\d\dT\S*\s*$/, '')
    const r = t.match(/^RELAY .+ to \S+ (\S+)$/)
    if (r) reservados.add(r[1]!)
    const p = lerProvaRelato(t)
    if (p) relatados.add(linhaProvaRelato(p.relato, p.revs))
  }
}

/**
 * Set reports (R10, R12, R6): `manifestos` once every expected slug has a manifest in the fork ledgers, and `release`
 * for a lane's RELEASE/APPLIED/DEPLOYED that frees a resource another lane waits on (the sweep's UNGRANTED rows, the
 * pairing's owner). Each goes only after its `NOTE RELATO ...` proof is on disk, and only once per proof line.
 */
async function relatar($: any, ex: Execucao): Promise<void> {
  if (ex.papel !== 'conjunto' || !ex.ledgerDir) return
  const C = conjuntoDe($, ex)
  if (!C) return
  const orq = orquestradorGravado(((await ler($, 'ctx')) ?? null) as Contexto | null)
  if (!orq) return
  const doMapa = Object.values(mapaAtual.specs).filter(s => s.conjunto === C && s.slug).map(s => s.slug)
  const esperados = doMapa.length ? doMapa : Object.keys(ex.forks)
  const provas: string[] = []
  const r = relatoDoConjunto(C, Object.fromEntries(Object.entries(manifestos).map(([s, x]) => [s, x.texto])), esperados)
  if (r) provas.push(linhaProvaRelato(r, Object.fromEntries(esperados.map(s => [s, manifestos[s]!.rev]))))
  const locks = ((await alertas($)).sweep?.linhas ?? []).map(l => ({ slug: l.slug, kind: l.kind, resource: l.resource, desde: l.desde ?? '', concedido: l.estado !== 'UNGRANTED' }))
  for (const f of Object.values(ex.forks)) {
    for (const ev of f.eventos) {
      if (!/^(RELEASE|APPLIED|DEPLOYED)$/.test(ev.tipo)) continue
      const ws = ev.texto.split(/\s+/).filter(Boolean)
      const kind = ev.tipo === 'RELEASE' ? (ws.shift() ?? '') : ev.tipo === 'DEPLOYED' ? 'deploy' : ''
      // only locks taken before this release wait on it
      const antes = locks.filter(l => !l.desde || Date.parse(l.desde) <= ev.at)
      for (const resource of ws) {
        const rr = relatoRelease(C, antes, { slug: f.slug, kind, resource })
        // ponytail: one report per line; a waiter that re-locks the same resource later repeats the line and is not reported
        if (rr) provas.push(linhaProvaRelato(rr, {}))
      }
    }
  }
  for (const prova of provas) {
    if (relatados.has(prova)) continue
    relatados.add(prova)
    if (!(await anexarLedger($, 'NOTE', prova))) {
      relatados.delete(prova) // no proof on disk: nothing sent, the next look tries again
      continue
    }
    await $.session.send({ to: endereco(orq), text: lerProvaRelato(prova)!.relato })
  }
}

/** RELAY lines of the orchestrator ledgers modified in the last 24 h (R3-4), each file read again only when it changed. */
async function relaysDoOrquestrador($: any, principal: string): Promise<{ alvo: string; chave: string; linha: string }[]> {
  const out: { alvo: string; chave: string; linha: string }[] = []
  for (const base of [`${principal}/.novarc/ledger/novarc-orq`, `${principal}/.superpowers/novarc-orq`]) {
    let runs: { name: string; kind: string }[]
    try {
      runs = await $.fs.list(base)
    } catch {
      continue
    }
    for (const d of runs) {
      if (d.kind !== 'dir') continue
      const p = `${base}/${d.name}/ledger.md`
      let f: { name: string; size: number; mtimeMs: number } | undefined
      try {
        f = ((await $.fs.list(`${base}/${d.name}`)) as { name: string; size: number; mtimeMs: number }[]).find(x => x.name === 'ledger.md')
      } catch {
        continue
      }
      // the 24 h window by the ledger file's own mtime (a folder's mtime is not reliable across platforms)
      if (!f || Date.now() - f.mtimeMs > 24 * 60 * 60_000) continue
      let c = relaysOrq[p]
      if (!c || c.size !== f.size || c.mtimeMs !== f.mtimeMs) {
        try {
          const linhas = String(await $.fs.read(p)).split(/\r?\n/).map(lerRelay).filter((x): x is NonNullable<typeof x> => !!x)
          c = relaysOrq[p] = { size: f.size, mtimeMs: f.mtimeMs, linhas: linhas.map(x => ({ alvo: x.alvo, chave: x.chave, linha: x.linha })) }
        } catch {
          continue
        }
      }
      out.push(...c.linhas)
    }
  }
  return out
}

/**
 * The proof of a received directive (R1-1, R2-2, R2-3, R3-4): the orchestrator's `auditoria` row for this exact text in
 * this run (`origem` maestro with estado enviando/enviado, or agente; `at` within 15 min), or without an artifact its
 * ledger's `RELAY` line. Its id, unless already relayed; `recusado` when every proof names another set.
 */
async function provar($: any, ex: Execucao, C: string, texto: string): Promise<{ id: string } | 'pendente' | 'recusado' | 'repetido' | 'nunca'> {
  const url = (((await ler($, 'ctx')) ?? null) as Contexto | null)?.artefato
  let achados: { id: string; alvo: string }[]
  if (url) {
    const where = [['linha', 'eq', texto], ['papel', 'eq', 'orquestrador'], ['runId', 'eq', runIdAtual(ex)]]
    const r = await $.tool.call({ tool: 'ArtifactData', action: 'query', url, collection: 'auditoria', query: { where, limit: 50 } })
    if (!r || r.deny !== undefined || r.isError) return 'pendente'
    const agora = Date.now()
    achados = lerDocs(String(r.text ?? ''))
      .filter(d => {
        const x = d.data as Partial<AuditoriaDoc>
        const at = Date.parse(String(x.at ?? ''))
        const origem = x.origem === 'agente' || (x.origem === 'maestro' && (x.estado === 'enviando' || x.estado === 'enviado'))
        return origem && agora - at <= 15 * 60_000 && at <= agora + 60_000
      })
      .map(d => ({ id: d.id, alvo: String(d.data.alvo ?? '') }))
  } else {
    const principal = ex.ledgerDir ? checkoutPrincipal(ex.ledgerDir) : null
    if (!principal) return 'nunca'
    achados = (await relaysDoOrquestrador($, principal)).filter(x => x.linha === texto).map(x => ({ id: x.chave, alvo: x.alvo }))
  }
  if (!achados.length) return 'pendente'
  const meus = achados.filter(x => x.alvo.toUpperCase() === C || x.alvo.toUpperCase().startsWith(`${C}-`))
  if (!meus.length) return 'recusado'
  const livre = meus.find(x => !reservados.has(x.id))
  return livre ? { id: livre.id } : 'repetido'
}

function espelharRotas($: any): void {
  espelhoRotas = espelhoRotas.then(() => $.state.set(ROTAS, [...rotas])).catch(() => {})
}

/**
 * Routes a received `GO <slug> ...` / `status <slug>?` (R15, R16 as R1-1): `rotaDaDiretiva` decides the target (another
 * set's spec: `NOTE <D>-RECUSADO`), the proof decides the forward. Proven: the id is reserved, `RELAY <line> to <slug>
 * <id>` (and for a lock grant `GO <slug> <kind> <ids>`) appended, then the line is sent verbatim. Not proven: retried on
 * the next two timer looks, then `NOTE <D>-SEM-PROVA <slug>`. `tentativas`: the looks this line already waited.
 */
async function encaminhar($: any, texto: string, tentativas: number): Promise<void> {
  const ex = ultimoExec
  if (!ex || ex.papel !== 'conjunto') return
  const C = conjuntoDe($, ex)
  if (!C) return
  // the engine names no sender (R1-1): the proof row is the sender check, so the recorded orchestrator stands for both
  const o = orquestradorGravado(((await ler($, 'ctx')) ?? null) as Contexto | null) ?? 'orquestrador'
  const rota = rotaDaDiretiva(mapaAtual, C, o, o, texto)
  if (!rota) return
  const D = texto.startsWith('GO') ? 'GO' : 'STATUS'
  const slug = 'slug' in rota ? rota.slug : texto.split(/\s+/)[1]!.replace(/\?$/, '')
  if ('recusa' in rota) return void (await anexarLedger($, 'NOTE', `${rota.recusa}-RECUSADO ${slug}`))
  const p = await provar($, ex, C, texto)
  if (p === 'repetido') return
  if (p === 'recusado') return void (await anexarLedger($, 'NOTE', `${D}-RECUSADO ${slug}`))
  if (p === 'pendente' && tentativas < 2) {
    rotas.push({ texto, tentativas })
    return espelharRotas($)
  }
  if (p === 'pendente' || p === 'nunca') return void (await anexarLedger($, 'NOTE', `${D}-SEM-PROVA ${slug}`))
  // the address before the reservation: a line nobody can receive leaves no RELAY behind
  const para = rota.para || (ex.codigo ? `novarc-${ex.codigo}-${idDaBranch(slug) ?? slug}` : '')
  if (!para) return void (await anexarLedger($, 'NOTE', `${D}-SEM-ENDERECO ${slug}`))
  if (reservados.has(p.id)) return // a copy proven in the meantime
  reservados.add(p.id)
  if (!(await anexarLedger($, 'RELAY', `${texto} to ${slug} ${p.id}`))) {
    reservados.delete(p.id) // no RELAY on disk: nothing was relayed
    return
  }
  // from here the id stays reserved (R3-3): a forward that does not reach the spec session is logged, never retried
  const naoEntregue = () => anexarLedger($, 'NOTE', `RELAY-NAO-ENTREGUE ${slug} ${p.id}`)
  const grant = texto.match(/^GO (\S+) (\S+) (.+)$/)
  if (grant && grant[2] !== 'phase' && !(await anexarLedger($, 'GO', `${grant[1]} ${grant[2]} ${grant[3]}`))) return void (await naoEntregue())
  let r: any = null
  try {
    r = await $.session.send({ to: endereco(para), text: texto })
  } catch {
    // undelivered below
  }
  if (!r?.isDelivered) await naoEntregue()
}

/** A timer look retries the lines still waiting for their proof (each at most twice). */
async function reencaminhar($: any): Promise<void> {
  if (!rotas.length) return
  const vez = rotas
  rotas = []
  espelharRotas($)
  for (const r of vez) await encaminhar($, r.texto, r.tentativas + 1)
}

/** After a reload: the waiting lines come back from state once, under any queued meanwhile. */
async function restaurarRotas($: any): Promise<void> {
  if (rotasRestauradas) return
  rotasRestauradas = true
  const guardadas = ((await ler($, 'maestroRotas')) as Rota[]).filter(x => x && typeof x.texto === 'string' && typeof x.tentativas === 'number')
  rotas = [...guardadas, ...rotas]
  if (guardadas.length) espelharRotas($)
}

let refrescando = false

/**
 * R37, R44: one `execucao` list and one `config` list into `banco` (specs kept) in a set or spec session: once after the
 * context loads and on a received GO/HOLD/LIBERA/LOCK/RELEASE. A call during a running one returns at once. A failed
 * `config` list keeps the previous config; a failed `execucao` list changes nothing. The set session's `limiares` follow.
 */
async function refrescarBanco($: any): Promise<void> {
  if (refrescando) return
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (!c?.artefato || (c.papel !== 'conjunto' && c.papel !== 'spec')) return
  const g = geracao
  refrescando = true
  try {
    const execucao = await lerColecao($, c.artefato, 'execucao')
    let config = banco?.config ?? {}
    try {
      config = await lerColecao($, c.artefato, 'config')
    } catch (err) {
      await logarUmaVez($, 'refrescarBanco.config', err) // keep the previous config (and its limiares)
    }
    if (velho(g)) return
    // no poll has read `specs` yet: an empty map marked parcial, so the pendencias counter does not read it as "no specs"
    banco = banco ? { ...banco, execucao, config, at: Date.now() } : { specs: {}, execucao, config, at: Date.now(), parcial: true }
    if ((await exec($)).papel === 'conjunto' && !velho(g)) await $.state.set(ALERTAS, { ...(await alertas($)), limiares: limiaresDoBanco() })
  } catch {
    // the next directive or restart tries again
  } finally {
    if (!velho(g)) refrescando = false
  }
}

// ---- C03-S01 Task 7: the orchestrator's own directives (directive-nudge, `enviar`). Every key goes at most once (R19):
// reserved in `diretivasFeitas` before any await, written durably (an `auditoria` row, or without an artifact a RELAY
// line in the orchestrator ledger) BEFORE the send, and seeded back from those records after a restart.

export type Envio = { acao: string; alvo: string; at: number; estado: 'enviando' | 'enviado' | 'falhou' }
const MAX_ENVIOS = 200
// Send lifecycle per key (the band's `diretiva sem confirmação`, Task 10); single writer, mirrored with the keys.
let envios: Record<string, Envio> = {}
let diretivasRestauradas = false
let espelhoDiretivas: Promise<unknown> = Promise.resolve()
// The db seed of this module life (null until it succeeded once with an artifact).
let semeadura: Promise<boolean> | null = null
// Report lines received since the last nudge, only for its RELATO-SEM-PROVA / RELATO-VELHO log: the reports themselves
// are derived from the set ledgers on disk on every nudge (`relatosDoDisco`).
let relatosRecebidos: string[] = []
let acordar: { cancel: () => void } | null = null
let nudando = false
let nudgeDeNovo = false
// Second-status keys whose `sem resposta` toast was shown (ponytail: module only, a reload may show it once more).
const semRespostaAvisado = new Set<string>()
// Per set ledger dir (orchestrator): the `NOTE RELATO` proofs its ledger.md holds, with the ledger stamp.
let provasConj: Record<string, { relato: string; revs: Record<string, string>; at: string }[]> = {}

/** Mirrors the keys and the lifecycle in issue order (R2-4); the envios copy keeps the newest MAX_ENVIOS. */
function espelharDiretivas($: any): void {
  const ks = Object.keys(envios)
  if (ks.length > MAX_ENVIOS) for (const k of ks.sort((a, b) => envios[a]!.at - envios[b]!.at).slice(0, ks.length - MAX_ENVIOS)) delete envios[k]
  const feitas = [...diretivasFeitas]
  const copia = { ...envios }
  espelhoDiretivas = espelhoDiretivas.then(() => $.state.set(FEITAS, feitas)).then(() => $.state.set(ENVIOS, copia)).catch(() => {})
}

/** After a reload: keys and lifecycle come back from state once, under whatever this module recorded meanwhile. */
async function restaurarDiretivas($: any): Promise<void> {
  if (diretivasRestauradas) return
  diretivasRestauradas = true
  const ks = ((await ler($, 'diretivasFeitas')) as unknown[]).filter((k): k is string => typeof k === 'string')
  const es = (await ler($, 'maestroEnvios')) as Record<string, Envio>
  for (const k of ks) diretivasFeitas.add(k)
  envios = { ...es, ...envios }
  if (ks.length || Object.keys(es).length) espelharDiretivas($)
}

/**
 * The db seed (jobs.md): one `query auditoria` where runId = this run, limit 1000, paged by cursor; every key whose
 * `estado` is set is done. Once per module life; a failed read is retried by the next nudge, which sends nothing until
 * it succeeded. Without an artifact there is nothing to read (the ledger RELAY lines seed, `lerLedgerOrq`).
 */
async function semearDiretivas($: any): Promise<boolean> {
  const url = (((await ler($, 'ctx')) ?? null) as Contexto | null)?.artefato
  if (!url) return true
  semeadura ??= consultarAuditoria($, url).then(ok => {
    if (!ok) semeadura = null
    return ok
  })
  return semeadura
}

async function consultarAuditoria($: any, url: string): Promise<boolean> {
  const ex = ultimoExec
  const runId = ex ? runIdAtual(ex) : null
  if (ex?.papel !== 'orquestrador' || !runId) return false
  let pagina: string | null = null
  // ponytail: the cursor is read from the answer text by name (the exact wording is unverified); 20 pages is 20,000 rows
  for (let i = 0; i < 20; i++) {
    const query: Record<string, unknown> = { where: [['runId', 'eq', runId], ['papel', 'eq', 'orquestrador']], limit: 1000, ...(pagina ? { cursor: pagina } : {}) }
    const r = await $.tool.call({ tool: 'ArtifactData', action: 'query', url, collection: 'auditoria', query })
    if (!r || r.deny !== undefined || r.isError) return false
    const t = String(r.text ?? '')
    for (const d of lerDocs(t)) {
      const x = d.data as Partial<AuditoriaDoc>
      if (!x.estado) continue
      diretivasFeitas.add(d.id)
      envios[d.id] ??= { acao: String(x.acao ?? ''), alvo: String(x.alvo ?? ''), at: Date.parse(String(x.at ?? '')) || 0, estado: x.estado }
    }
    const prox: string | null = t.match(/\b(?:next_?cursor|nextCursor|cursor)\b"?\s*[:=]\s*"?([A-Za-z0-9_=+/.-]+)/i)?.[1] ?? null
    if (!prox || prox === pagina || /^(null|none|undefined)$/i.test(prox)) break
    pagina = prox
  }
  espelharDiretivas($)
  return true
}

/** New RELAY lines of the orchestrator ledger (R1-3, R2-5): their key (third field) is done. */
function semearRelays($: any, linhas: string): void {
  let novas = false
  for (const l of linhas.split(/\r?\n/)) {
    const r = lerRelay(l)
    if (r && !diretivasFeitas.has(r.chave)) {
      diretivasFeitas.add(r.chave)
      novas = true
    }
  }
  if (novas) espelharDiretivas($)
}

const STAMP = /\s+#\s(\d{4}-\d\d-\d\dT\S*)\s*$/

/** The `NOTE RELATO` proofs of new set ledger.md lines (orchestrator side of R3-1); a refold from 0 starts the list over. */
function guardarProvas(dir: string, linhas: string, doZero: boolean): void {
  const lista = doZero ? [] : (provasConj[dir] ?? [])
  for (const l of linhas.split(/\r?\n/)) {
    const p = lerProvaRelato(l)
    if (p) lista.push({ ...p, at: l.match(STAMP)?.[1] ?? '' })
  }
  provasConj[dir] = lista
}

// Proofs found stale once stay stale (a rev carries its SURFACES count n, which only grows): never re-read for them.
const provasVelhas = new Set<string>()

type BasePrevista = Omit<Parameters<typeof diretivasPrevistas>[0], 'alertas' | 'relatos' | 'feitas'>
// The nudge gate's own `config` read when the poll has not filled `banco` yet (fix round 2: `banco` stays the poll's).
let configGate: Record<string, DbDoc> | null = null

function basePrevista(ex: Execucao, runId: string, agora: number, al: Alertas): BasePrevista {
  return {
    runId, mapa: mapaAtual, codigo: ex.codigo ?? '', agora, limiarCalado: al.limiares.calado, limiarLock: al.limiares.lockOrfao,
    locks: al.vista?.locks ?? [], slots: slotsOrq,
  }
}

/** Each live set of this run -> its ledger dir (the set session's registry entry, newest wins). */
async function dirsDosConjuntos($: any): Promise<Record<string, string>> {
  const regs = daMinhaExecucao(((await ler($, 'maestroOutras')) ?? []) as Registro[], sessao)
  const dirs: Record<string, string> = {}
  for (const r of regs.filter(x => x.papel === 'conjunto' && x.ledgerDir && x.conjunto).sort((a, b) => a.at - b.at)) dirs[String(r.conjunto).toUpperCase()] = r.ledgerDir!
  return dirs
}

/**
 * A directive the orchestrator AGENT delivered (R19): when the line is one the mod would send, it takes the mod's key
 * so the mod never sends it again. `GO <slug> phase 4`: n from that slug's latest SURFACES in the set's fork ledger;
 * `GO <waiter> <kind> <resource>`: the release proof on disk; `status <alvo>?`: an open quiet alert's current episode.
 * The key goes to `diretivasFeitas` and its record is written under the key (`auditoria` set without if_version, a
 * refusal = already recorded; no artifact: the RELAY line). False when no key applies: the caller keeps the observed row.
 */
async function registrarDoAgente($: any, linha: string): Promise<boolean> {
  const ex = ultimoExec
  const runId = ex ? runIdAtual(ex) : null
  if (ex?.papel !== 'orquestrador' || !runId) return false
  const al = await alertas($)
  const agora = Date.now()
  const relatos: Relato[] = []
  const go = linha.match(/^GO (\S+) (\S+) (\S+)$/)
  const C = go ? idDaBranch(go[1]!)?.split('-')[0] : undefined
  const dir = C ? (await dirsDosConjuntos($))[C] : undefined
  if (go && C && dir) {
    const [, slug, kind, resto] = go as unknown as [string, string, string, string]
    if (kind === 'phase' && resto === '4') {
      try {
        const rev = manifestosDoLedger(String(await $.fs.read(`${dir}/fork-${slug}.md`)))[slug]?.rev
        if (rev) relatos.push({ conjunto: C, tipo: 'disjuntos', slugs: [slug], revs: { [slug]: rev }, linha: '' })
      } catch {
        // no manifest on disk: no key
      }
    } else {
      try {
        const lm = ((await $.fs.list(dir)) as { name: string; size: number; mtimeMs: number }[]).find(f => f.name === 'ledger.md')
        if (lm) await lerMapa($, `${dir}/ledger.md`, lm, 'c:', geracao)
      } catch {
        // unreadable: no proof, no key
      }
      const rel = `CONJUNTO ${C} release ${kind} ${resto} ${slug}`
      const at = (provasConj[dir] ?? []).filter(p => p.relato === rel).map(p => p.at).sort().pop()
      if (at !== undefined) relatos.push({ conjunto: C, tipo: 'release', slugs: [slug], revs: {}, linha: rel, release: { kind, resource: resto, waiter: slug, releaseAt: at || 'sem-hora' } })
    }
  }
  const calados = linha.startsWith('status ') ? al.lista.filter(a => a.chave.startsWith('calado:')) : []
  const p = diretivasPrevistas({ ...basePrevista(ex, runId, agora, al), alertas: calados, relatos, feitas: new Set() }).find(x => x.text === linha)
  if (!p) return false
  if (diretivasFeitas.has(p.chave)) return true // the mod (or an earlier copy) already recorded it
  diretivasFeitas.add(p.chave)
  envios[p.chave] = { acao: p.acao, alvo: p.alvo, at: agora, estado: 'enviado' }
  espelharDiretivas($)
  const url = (((await ler($, 'ctx')) ?? null) as Contexto | null)?.artefato
  if (!url) {
    await anexarLedger($, 'RELAY', linhaRelay(p).slice('RELAY '.length))
    return true
  }
  quem ??= String((await $.env.get('USERNAME')) ?? (await $.env.get('USER')) ?? '')
  const doc = entradaAuditoria(
    { acao: p.acao, alvo: p.alvo, motivo: 'Diretiva enviada pelo agente', regra: p.regra, linha, origem: 'agente' },
    { at: new Date(agora), runId, sessao: nomeDaSessao(ex), papel: 'orquestrador', by: quem },
  )
  let r: any = null
  try {
    r = await $.tool.call({ tool: 'ArtifactData', action: 'set', url, collection: 'auditoria', doc_id: p.chave, data: { ...doc, estado: 'enviado' } })
  } catch {
    // a failed call: the observed row below
  }
  // a failed keyed write still leaves a row (R29), queued and retried; an exists refusal means it is already recorded
  if (!r || r.deny !== undefined || r.isError) {
    if (!existe(String(r?.deny ?? r?.text ?? ''))) await auditar($, { acao: p.acao, alvo: p.alvo, motivo: 'Diretiva enviada pelo agente', regra: p.regra, linha, origem: 'agente' })
  }
  return true
}

/**
 * The set reports due now, derived on every nudge from the `NOTE RELATO` proofs on disk in each live set's ledger.md
 * (R3-1, R3-2, R6, R7), so no report lives only in memory: a proof whose directive keys are all in `diretivasFeitas` is
 * done; for `disjuntos` the slugs are the plan's specs of the set minus those held by a `pendencia:*` (no artifact: the
 * set's fork ledgers) and every rev equals the rev of that slug's latest SURFACES read now. `colisao` is nothing (A15).
 * `avisar`: report lines received since the last nudge; one that is not proven and fresh on disk logs `NOTE
 * RELATO-SEM-PROVA <C>` or `NOTE RELATO-VELHO <C>` (diagnostic only: losing it on a reload loses a log line, never a GO).
 */
async function relatosDoDisco($: any, base: BasePrevista, avisar: string[]): Promise<Relato[]> {
  const dirs = await dirsDosConjuntos($)
  const c =((await ler($, 'ctx')) ?? null) as Contexto | null
  const plano = c?.artefato ? (c.plano as Plano | null) : null
  const igual = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])
  const preso = (id: string) => Object.keys((banco?.specs[id]?.data as SpecDoc | undefined)?.bloqueios ?? {}).some(k => k.startsWith('pendencia:'))
  const out: Relato[] = []
  const estado: Record<string, 'ok' | 'velho'> = {} // per `<C> <line>`: proven (fresh or done), or proven but stale
  for (const [C, dir] of Object.entries(dirs)) {
    let arquivos: { name: string; size: number; mtimeMs: number }[]
    try {
      arquivos = await $.fs.list(dir)
    } catch {
      continue // unreadable now: the next nudge reads it
    }
    const lm = arquivos.find(f => f.name === 'ledger.md')
    if (lm) await lerMapa($, `${dir}/ledger.md`, lm, 'c:', geracao)
    const forks = arquivos.map(f => String(f.name).match(/^fork-(.+)\.md$/)?.[1]).filter((x): x is string => !!x)
    let atuais: Record<string, string> | null = null
    for (const p of provasConj[dir] ?? []) {
      const lc = linhaConjunto(p.relato)
      if (!lc || lc.conjunto !== C) continue
      const t = lc.resto.split(/\s+/).filter(Boolean)
      const linha = p.relato
      const id = `${dir} ${linha} ${JSON.stringify(p.revs)} ${p.at}`
      const devidas = (r: Relato) => diretivasPrevistas({ ...base, alertas: [], relatos: [r], feitas: diretivasFeitas }).length > 0
      if (lc.etapa === 'release' && t.length === 3) {
        const [kind, resource, waiter] = t as [string, string, string]
        const r: Relato = { conjunto: C, tipo: 'release', slugs: [waiter], revs: {}, linha, release: { kind, resource, waiter, releaseAt: p.at || 'sem-hora' } }
        estado[`${C} ${linha}`] = 'ok'
        if (devidas(r)) out.push(r)
        continue
      }
      if (!(lc.etapa === 'manifestos' && t[0] === 'disjuntos' && t.length > 1) || provasVelhas.has(id)) {
        if (provasVelhas.has(id)) estado[`${C} ${linha}`] ??= 'velho'
        continue
      }
      const slugs = t.slice(1)
      const esperado = plano?.specs
        ? igual(plano.specs.filter(s => s.conjunto === C && !preso(s.id)).map(s => s.id), slugs.map(s => idDaBranch(s) ?? s))
        : igual(forks, slugs)
      if (!esperado || Object.keys(p.revs).length !== slugs.length) continue // not the set's specs now: unproven
      const r: Relato = { conjunto: C, tipo: 'disjuntos', slugs, revs: p.revs, linha }
      if (!devidas(r)) {
        estado[`${C} ${linha}`] = 'ok'
        continue
      }
      if (!atuais) {
        atuais = {}
        for (const s of forks) {
          try {
            const rev = manifestosDoLedger(String(await $.fs.read(`${dir}/fork-${s}.md`)))[s]?.rev
            if (rev) atuais[s] = rev
          } catch {
            // unreadable now: that slug has no current revision, no proof naming it is fresh
          }
        }
      }
      if (slugs.every(s => atuais![s] && p.revs[s] === atuais![s])) {
        estado[`${C} ${linha}`] = 'ok'
        out.push(r)
      } else {
        provasVelhas.add(id)
        estado[`${C} ${linha}`] ??= 'velho'
      }
    }
  }
  for (const linha of avisar) {
    const lc = linhaConjunto(linha)
    const t = lc?.resto.split(/\s+/).filter(Boolean) ?? []
    if (!lc || !((lc.etapa === 'manifestos' && t[0] === 'disjuntos') || lc.etapa === 'release')) continue
    const e = estado[`${lc.conjunto} ${linha}`]
    if (e !== 'ok') await anexarLedger($, 'NOTE', `${e === 'velho' ? 'RELATO-VELHO' : 'RELATO-SEM-PROVA'} ${lc.conjunto}`)
  }
  return out
}

/** `GO`, `RELEASE` or `status`: the word the toasts use for a directive's action. */
const palavra = (acao: string) => (acao === 'GO' || acao === 'MARCO' ? acao : acao === 'RELEASE-REPASSADO' ? 'RELEASE' : 'status')

/**
 * jobs.md `enviar`: (1) key done -> stop; (2) `auditoria/<key>` set `enviando` without if_version (refused as existing:
 * another tick owns it; any other failure: the key is released, the next tick retries), or without an artifact the
 * RELAY line `<acao> <alvo> <chave> <linha>` (R2-5, R4-3); (3) the send; (4) the update pinned by the set's version to
 * `enviado` or `falhou`, one toast either way. Never resent after step 2.
 */
async function enviar($: any, p: Prevista, agora = Date.now()): Promise<void> {
  const ex = ultimoExec
  const g0 = geracao
  if (diretivasFeitas.has(p.chave) || ex?.papel !== 'orquestrador') return
  if (p.to.startsWith('novarc--')) return logarUmaVez($, 'enviar', new Error(`sem endereço para ${p.alvo}`))
  diretivasFeitas.add(p.chave) // reserved before any await: a concurrent nudge stops at step 1
  espelharDiretivas($)
  const solta = () => {
    diretivasFeitas.delete(p.chave)
    espelharDiretivas($)
  }
  // the session-build name of the target (a map `nome` from a DISPATCH pair may be the bare slug)
  const nome = ex.codigo ? `novarc-${ex.codigo}-${p.alvo}` : mapaAtual.conjuntos[p.alvo]?.nome || mapaAtual.specs[p.alvo]?.nome || p.alvo
  const falhaToast = (motivo: string) => {
    try {
      $.ui.toast(`Maestro não conseguiu enviar ${palavra(p.acao)} a ${nome}: ${motivo}`)
    } catch {
      // the auditoria row and the band still carry it
    }
  }
  const url = (((await ler($, 'ctx')) ?? null) as Contexto | null)?.artefato
  let versao: number | null = null
  if (url) {
    quem ??= String((await $.env.get('USERNAME')) ?? (await $.env.get('USER')) ?? '')
    const base = entradaAuditoria(
      { acao: p.acao, alvo: p.alvo, motivo: p.motivo, regra: p.regra, linha: p.text, origem: 'maestro' },
      { at: new Date(agora), runId: runIdAtual(ex), sessao: nomeDaSessao(ex), papel: 'orquestrador', by: quem },
    )
    let r: any = null
    try {
      r = await $.tool.call({ tool: 'ArtifactData', action: 'set', url, collection: 'auditoria', doc_id: p.chave, data: { ...base, estado: 'enviando' } })
    } catch {
      // a failed call: released below
    }
    if (!r || r.deny !== undefined || r.isError) {
      const t = String(r?.deny ?? r?.text ?? '')
      // another tick owns an existing row; any other refusal is released (the next tick retries) and shown
      if (!existe(t)) {
        solta()
        falhaToast(t || 'registro não gravado')
      }
      return
    }
    versao = Number(String(r.text ?? '').match(/\bversion (\d+)/i)?.[1]) || null
  } else if (!(await anexarLedger($, 'RELAY', linhaRelay(p).slice('RELAY '.length)))) {
    return solta()
  }
  envios[p.chave] = { acao: p.acao, alvo: p.alvo, at: agora, estado: 'enviando' }
  espelharDiretivas($)
  let r: any = null
  try {
    r = await $.session.send({ to: endereco(p.to), text: p.text })
  } catch (err) {
    r = { isDelivered: false, reason: String(err) }
  }
  const estado = r?.isDelivered ? 'enviado' : 'falhou'
  if (url && versao !== null) {
    try {
      await $.tool.call({ tool: 'ArtifactData', action: 'update', url, collection: 'auditoria', doc_id: p.chave, if_version: versao, data: { estado } })
    } catch {
      // the row stays `enviando`: the band shows it unconfirmed (R20), nothing is resent
    }
  }
  envios[p.chave] = { ...envios[p.chave]!, estado }
  espelharDiretivas($)
  if (estado === 'falhou' && !velho(g0)) void prepararFaixa($).catch(() => {}) // R53: the band shows it now, not at the next look
  if (estado === 'falhou') return falhaToast(r?.reason ?? 'não entregue')
  try {
    $.ui.toast(`Maestro enviou ${palavra(p.acao)} a ${nome}: ${p.motivo}`)
  } catch {
    // the auditoria row and the band still carry it
  }
}

/** A set report the orchestrator received wakes the nudge at once (`after(0)`); its proof is read from disk there. */
function receberRelato($: any, linha: string): void {
  relatosRecebidos.push(linha)
  if (acordar) return
  try {
    acordar = $.clock.after(0, () => {
      acordar = null
      void directiveNudge($).catch(() => {})
    })
  } catch {
    acordar = null // no timer: the next look handles the queue
  }
}

/** directive-nudge (jobs.md): one at a time; a wake-up during a run makes it run once more. */
async function directiveNudge($: any): Promise<void> {
  if (nudando) {
    nudgeDeNovo = true
    return
  }
  nudando = true
  try {
    do {
      nudgeDeNovo = false
      await umNudge($)
    } while (nudgeDeNovo)
  } finally {
    nudando = false
  }
}

async function umNudge($: any): Promise<void> {
  const g = geracao
  const ex = ultimoExec ?? (await exec($))
  if (ex.papel !== 'orquestrador') return
  // R18: Pausado (C06-S01) sends nothing. With an artifact and no config read yet (a reload before the first poll),
  // one `config` list decides; a failed read sends nothing (stricter). Reports stay on disk and wait.
  // That read is the gate's alone (`configGate`): `banco` stays the poll's, so no other reader sees a partial db.
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (c?.artefato && !banco?.config && !configGate) {
    try {
      const config = await lerColecao($, c.artefato, 'config')
      if (velho(g)) return
      configGate = config
    } catch {
      return
    }
  }
  if (daBanco<{ modo?: string }>((banco?.config ?? configGate)?.continuo)?.modo === 'pausado') return
  // ponytail: no read-only gate for a hand-over yet; C10-S01 defines `config/dono` and adds it here
  const runId = runIdAtual(ex)
  if (!runId) return
  if (!(await semearDiretivas($))) return
  await lerLedgerOrq($, ex) // the RELAY seed and the slot queue, read only when the ledger changed
  if (velho(g)) return
  let agora: number
  try {
    agora = Number(await $.clock.now())
  } catch {
    agora = Date.now()
  }
  if (!Number.isFinite(agora)) agora = Date.now()
  const al = await alertas($)
  const base = basePrevista(ex, runId, agora, al)
  const avisar = relatosRecebidos
  relatosRecebidos = []
  const relatos = await relatosDoDisco($, base, avisar)
  if (velho(g)) return
  // the map as the set ledgers just read left it (their ORCHESTRATOR-SESSION lines carry the set session ids)
  const todas = diretivasPrevistas({ ...base, mapa: mapaAtual, alertas: al.lista, relatos, feitas: new Set() })
  // the second status of an episode unanswered for a whole threshold: no third, one toast (R13)
  for (const p of todas) {
    const e = envios[p.chave]
    if (p.acao !== 'STATUS-PEDIDO' || !p.chave.endsWith('-2') || !e || semRespostaAvisado.has(p.chave)) continue
    if (agora - e.at < (p.chave.startsWith('slot-') ? al.limiares.lockOrfao : al.limiares.calado) * 60_000) continue
    semRespostaAvisado.add(p.chave)
    try {
      $.ui.toast(`Maestro: ${p.alvo} sem resposta a 2 pedidos de status`)
    } catch {
      // the alert stays on the band
    }
  }
  pedidosDeSlot($, agora, al.limiares.lockOrfao)
  for (const p of todas) if (!velho(g) && !diretivasFeitas.has(p.chave)) await enviar($, p, agora)
}

/**
 * A request waiting in the orchestrator's own slot queue with no grant of its kind, past the orphan threshold (R14,
 * A19): no message to anyone, one `Maestro (automático):` turn per request carrying its LOCK line; the turn grants
 * nothing and opens no session (acesso.md A8).
 */
function pedidosDeSlot($: any, agora: number, limiar: number): void {
  for (const kind of ['verify', 'producao'] as const) {
    const s = slotsOrq[kind]
    if (s.dono) continue
    for (const f of s.fila) {
      const min = Math.floor((agora - Date.parse(f.desde)) / 60_000)
      if (!(min >= limiar)) continue
      const chave = `fila-${kind}-${f.branch}-${f.desde}`.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
      if (diretivasFeitas.has(chave)) continue
      diretivasFeitas.add(chave)
      espelharDiretivas($)
      const texto = `Maestro (automático): pedido de slot sem GO há ${min} min na fila do orquestrador: LOCK ${kind} ${f.branch} ${f.conjunto}. Decida pelo protocolo (orquestrar.md:88-94); este turno não concede nada e não abre sessão.`
      try {
        void Promise.resolve($.prompt.submit({ text: texto })).catch(() => {})
      } catch {
        // no turn queued: the slot alert stays on the band
      }
    }
  }
}

const DIRETIVAS = new Set(['GO', 'HOLD', 'LIBERA', 'FECHA', 'MERGE-OK', 'MARCO', 'CANCELADO', 'PRE-FECHAMENTO', 'status'])

/** The run as the guard knows it; reads state only on the first hook after a reload (no session.start yet). */
async function execAtual($: any): Promise<Execucao> {
  if (ultimoExec === null) {
    await garantirSessao($)
    ultimoExec = await exec($)
  }
  return ultimoExec
}

function guardar(id: unknown, d: Decisao): void {
  if (typeof id !== 'string' || !d.nivel) return
  guardados.delete(id)
  guardados.set(id, { nivel: d.nivel, texto: d.texto })
  while (guardados.size > MAX_GUARDADOS) guardados.delete(guardados.keys().next().value!)
}

const SEM_ESTADO = 'maestro: guarda sem estado, comando liberado'

/**
 * The guard start flow shared by Bash, Write and Edit: outside a run `next(e)` and nothing else; a block denies before
 * the tool runs; a warning runs it and adds the text to `context`, the part of a result the model reads (core sets
 * `text` and relays its own messages by `ref`). A state or context that cannot be read lets the call run (R9).
 */
async function guardaENext($: any, e: any, next: any, avaliar: (ctx: ContextoGuarda) => Decisao): Promise<any> {
  let d: Decisao | null = null
  let ex: Execucao = VAZIA
  try {
    if (ultimoExec === null) {
      await garantirSessao($)
      ultimoExec = await exec($)
    }
    ex = ultimoExec
    if (ex.papel) d = avaliar(contextoGuarda(ex))
  } catch {
    $.ui.log(SEM_ESTADO) // next(e) below, outside the try: the tool never runs twice
  }
  if (!d?.nivel) return next(e)
  const alvo = ex.spec ?? ex.conjunto ?? ''
  guardar(e.tool_use_id, d)
  if (d.nivel === 'bloqueia') {
    void auditar($, { acao: 'BLOQUEIO', alvo, motivo: d.texto, regra: d.regra, linha: d.linha, origem: 'maestro' }).catch(() => {})
    return { deny: d.texto }
  }
  const ran = await next(e)
  if (ran?.deny !== undefined) return ran
  // an outside-the-worktree path toasts and audits once per session; the model still reads it every time
  const fora = d.regra === REGRA.worktree
  if (!fora || !avisadosFora.has(`${d.regra}|${d.texto}`)) {
    if (fora) avisadosFora.add(`${d.regra}|${d.texto}`)
    try {
      $.ui.toast(d.texto)
    } catch {
      // the warning still reaches the result below; the tool already ran, never run it twice
    }
    void auditar($, { acao: 'AVISO', alvo, motivo: d.texto, regra: d.regra, linha: d.linha, origem: 'maestro' }).catch(() => {})
  }
  return { ...ran, context: [...(ran?.context ?? []), d.texto] }
}

// Set once a role is known: prompt.submit then returns on its first line.
let papelConhecido = false

type Ids = { codigo?: string | null; conjunto?: string | null; spec?: string | null; nome?: string | null; artefato?: string | null }

/**
 * Marks this session as part of a run and (re)arms the one-minute look (ledger re-read, quiet minutes, registry).
 * Role precedence: orquestrador sticks; a spec role is not overwritten by conjunto unless `forcar` (an explicit
 * `conjunto <url> <C>` Skill call, R3); otherwise the latest wins.
 */
async function ligar($: any, papel: 'orquestrador' | 'conjunto' | 'spec', ledgerDir?: string | null, ids: Ids = {}, { forcar = false } = {}): Promise<void> {
  const ex = await exec($)
  const fica = ex.papel === 'orquestrador' || (ex.papel === 'spec' && papel === 'conjunto' && !forcar) || (ex.papel === 'conjunto' && papel === 'spec')
  const dados = Object.fromEntries(Object.entries(ids).filter(([, v]) => v))
  const final = fica ? ex.papel : papel
  // a set session carries no spec id: the branch's one (spec role overridden by `forcar`, or a reload on a spec branch) is dropped
  await gravarExec($, { ...ex, ...dados, papel: final, ledgerDir: ledgerDir ?? ex.ledgerDir, ...(final === 'conjunto' ? { spec: null } : {}) })
  papelConhecido = true
  try {
    if (!olhar && (await ler($, 'maestroModo')) !== 'off') olhar = $.clock.every(60 * 1000, () => olharAgora($, true))
  } catch {
    // no timer: the lanes still move on every event
  }
}

/** Copies the plan's project code and name and the artifact url into the run, then rewrites the registry entry. */
async function plantar($: any, plano: Plano, artefato: string): Promise<void> {
  const ex = await exec($)
  const { codigo, projeto } = projetoDoPlano(plano)
  await gravarExec($, { ...ex, artefato, ...(codigo ? { codigo } : {}), ...(projeto ? { projeto } : {}) })
  await registrar($)
}

/** Reads the plan of a skill-given url into the context and the run; a failed read keeps what is known. */
async function carregar($: any, url: string, papel: 'orquestrador' | 'conjunto', conjunto: string | null = null): Promise<void> {
  await orquestrar($, url, papel, conjunto)
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (c?.plano) await plantar($, c.plano as Plano, url)
  void refrescarBanco($).catch(() => {}) // the first prompt never waits on the db
}

// Per ledger file (keyed by target + path): what the last fold saw, so an unchanged file is never read again.
let cursor: Record<string, { size: number; mtimeMs: number; consumido: number }> = {}

/** Folds into `ex` the complete lines each fork-<slug>.md of `dir` gained since the last fold; a shrunk file refolds from 0. */
async function dobrar($: any, dir: string, ex: Execucao, alvo: string, g: number): Promise<Execucao> {
  const lista = await $.fs.list(dir)
  if (!velho(g)) marcadores[alvo + dir] = marcadorDir(lista) // the sweep's change marker, from this same list (R2)
  for (const f of lista) {
    // C03-S01 (R1-2): a set ledger's ledger.md rebuilds the address map (set session, and each set dir the orchestrator folds)
    if (f.name === 'ledger.md' && (alvo === 'c:' || ex.papel === 'conjunto')) {
      await lerMapa($, `${dir}/${f.name}`, f, alvo, g)
      continue
    }
    const m = String(f.name).match(/^fork-(.+)\.md$/)
    if (!m) continue
    const p = `${dir}/${f.name}`
    const c = cursor[alvo + p]
    if (c && c.size === f.size && c.mtimeMs === f.mtimeMs) continue
    let texto: string
    try {
      texto = String(await $.fs.read(p))
    } catch {
      continue // read again on the next look (its cursor did not move); the other files still fold
    }
    const n = novasLinhas(texto, c && f.size >= c.size ? c.consumido : 0)
    if (velho(g)) return ex // the session ended mid-fold: the next session's cursor stays untouched
    cursor[alvo + p] = { size: f.size, mtimeMs: f.mtimeMs, consumido: n.consumido }
    if (alvo === '' && ex.papel === 'conjunto') Object.assign(manifestos, manifestosDoLedger(texto)) // C03-S01 (R6)
    for (const ev of n.eventos) ex = anotar(ex, m[1]!, ev)
  }
  return ex
}

/** The new complete lines of one set `ledger.md` folded into `maestroMapa`, read only when the file changed. */
async function lerMapa($: any, p: string, f: { size: number; mtimeMs: number }, alvo: string, g: number): Promise<void> {
  const c = cursor[alvo + p]
  if (c && c.size === f.size && c.mtimeMs === f.mtimeMs) return
  let texto: string
  try {
    texto = String(await $.fs.read(p))
  } catch {
    return // read again on the next look
  }
  if (velho(g)) return
  let consumido = 0
  const de = c && f.size >= c.size && c.consumido <= texto.length ? c.consumido : 0
  mudarMapa($, m => {
    const r = dobrarMapa(m, texto, de)
    consumido = r.consumido
    return r.mapa
  })
  if (alvo === '') semearProvas(texto.slice(de, consumido)) // C03-S01 (R3-3): the set's own RELAY and RELATO lines
  if (alvo === 'c:') guardarProvas(p.slice(0, -'/ledger.md'.length), texto.slice(de, consumido), de === 0) // R3-1, orchestrator
  if (!velho(g)) cursor[alvo + p] = { size: f.size, mtimeMs: f.mtimeMs, consumido }
}

/**
 * Folds this session's ledger dir into the run state and returns it; an unreadable dir throws (the look logs it, lanes
 * keep their state). `ex`: the run the caller just read, so a look reads the (large) `exec` state once.
 */
async function lerDir($: any, ex?: Execucao): Promise<Execucao> {
  const g = geracao
  const antes = ex ?? (await exec($))
  if (!antes.ledgerDir) return antes
  const novo = await dobrar($, antes.ledgerDir, antes, '', g)
  if (novo !== antes && !velho(g)) await gravarExec($, novo)
  return novo
}

// Orchestrator only: each live set session's ledger dir folded on its own, for the Execução tab.
let porDir: Record<string, Execucao> = {}

async function lerConjuntos($: any): Promise<void> {
  const g = geracao
  const agora = Date.now()
  // only this session's run: the band and the Execução tab draw no other run's lanes
  for (const r of daMinhaExecucao(((await ler($, 'maestroOutras')) ?? []) as Registro[], sessao)) {
    if (r.papel !== 'conjunto' || !r.ledgerDir || !vivo(r, agora)) continue
    try {
      const novo = await dobrar($, r.ledgerDir, porDir[r.ledgerDir] ?? VAZIA, 'c:', g)
      if (velho(g)) return
      porDir[r.ledgerDir] = novo
    } catch {
      // that set's dir is not readable from here: its lanes keep the last state
    }
  }
  if (!velho(g)) await $.state.set(POR_DIR, { ...porDir })
}

// ---- C02-S01: automatic lock sweep, alerts and the planning-database mirrors (detection only: nothing is ever sent)

const SWEEP_ATRASO = 5000
// Per ledger dir (keyed like `cursor`): the marker of the fork files the last fold listed.
let marcadores: Record<string, string> = {}
// The pending debounced sweep, the one in flight, and when the last one started (R31).
let adiada: { cancel: () => void } | null = null
let varrendo = false
let ultimaVarredura = 0
// The ledger.py this session's agent ran (absolute path), preferred over the plugin's copy.
let scriptLedger: string | null = null
// `<slug> <kind> <resource>` -> first time a stampless outstanding lock was seen (its age, Decision 3).
let vistoEm: Record<string, string> = {}
// Mirror writes: the last written content hash and version of execucao/{C}, and of config/orquestracao.
let hashEspelho: string | null = null
let versaoEspelho: number | null = null
let espelhadoEm: number | null = null
// The espelho this session last wrote: its keys are deleted from the document when they leave (espelhoParaGravar).
let ultimoEspelho: EspelhoConjunto | null = null
let hashOrq: string | null = null
// Orchestrator: its own ledger.md read incrementally, the slots paired from it, the sets ready to close.
let cursorOrq: { size: number; mtimeMs: number; consumido: number } | null = null
let eventosOrq: Evento[] = []
let slotsOrq: Slots = { verify: { dono: null, fila: [] }, producao: { dono: null, fila: [] } }
let prontos: { conjunto: string; n: number }[] = []

const NOVO_ALERTAS = (): Alertas => ({ lista: [], alertasVistos: [], sweep: null, limiares: { ...LIMIARES_PADRAO }, olhares: 0 })

async function alertas($: any): Promise<Alertas> {
  return ((await ler($, 'maestroAlertas')) as Alertas | null) ?? NOVO_ALERTAS()
}

/** The session that holds the fork ledgers: the set session, or the reserve fork mode's dispatcher. */
const podeVarrer = (ex: Execucao) =>
  !!ex.ledgerDir && (ex.papel === 'conjunto' || (ex.papel === 'orquestrador' && Object.values(ex.forks).some(f => f.agentId)))

function agendar($: any, ms: number): void {
  adiada?.cancel()
  try {
    adiada = $.clock.after(ms, () => {
      adiada = null
      void varrer($, 'adiada')
    })
  } catch {
    adiada = null // no timer: the next look sweeps when the marker moved
  }
}

/** A ledger checkpoint was seen (Bash hook or received message): one sweep 5 s after the last mark (R1). Never awaits it. */
async function marcarSujo($: any): Promise<void> {
  if (podeVarrer(await exec($))) agendar($, SWEEP_ATRASO)
}

/**
 * Runs `ledger.py sweep` (the only owner of the per-resource pairing, R3) and keeps its result in `maestroAlertas.sweep`.
 * One in flight and one per 5 s across both triggers (R31); a run that is no result keeps the previous rows (R5).
 */
async function varrer($: any, origem: 'olhar' | 'adiada'): Promise<void> {
  const g = geracao
  const ex = await exec($)
  if (!podeVarrer(ex) || varrendo) return
  varrendo = true // claimed before the first await: two triggers never both start a sweep
  let agoraMs: number
  try {
    agoraMs = Number(await $.clock.now())
  } catch {
    agoraMs = Date.now()
  }
  const passou = agoraMs - ultimaVarredura
  if (passou < SWEEP_ATRASO) {
    varrendo = false
    if (origem === 'adiada') agendar($, SWEEP_ATRASO - passou)
    return
  }
  ultimaVarredura = agoraMs
  adiada?.cancel()
  adiada = null
  try {
    const marcador = marcadores[ex.ledgerDir!] ?? ''
    let lido: { linhas: LinhaSweep[]; semLeitura: boolean }
    try {
      const r = await $.process.run(['python', scriptDoLedger($), 'sweep', '--dir', ex.ledgerDir!])
      lido = lerSweep(String(r?.stdout ?? ''), Number(r?.exitCode))
    } catch {
      lido = { linhas: [], semLeitura: true }
    }
    if (velho(g)) return
    const al = await alertas($)
    if (!lido.semLeitura) {
      const agora = new Date().toISOString()
      const vivos: Record<string, string> = {}
      for (const l of lido.linhas) if (l.desde === null) vivos[`${l.slug} ${l.kind} ${l.resource}`] = vistoEm[`${l.slug} ${l.kind} ${l.resource}`] ?? agora
      vistoEm = vivos
    }
    // no reading: the old rows stay and the old marker too, so the next look tries again
    const sweep = lido.semLeitura
      ? { marcador: al.sweep?.marcador ?? '', linhas: al.sweep?.linhas ?? [], at: Date.now(), semLeitura: true }
      : { marcador, linhas: lido.linhas, at: Date.now(), semLeitura: false }
    await $.state.set(ALERTAS, { ...al, sweep })
    if (velho(g)) return
    await alertasAgora($)
    if (!velho(g)) await prepararFaixa($)
  } finally {
    if (!velho(g)) varrendo = false
  }
}

const daBanco = <T,>(d: DbDoc | undefined) => (d?.data ?? null) as T | null

/** Set session: writes `execucao/{C}.espelho` when the summary changed, only after a valid sweep (R19, R20, R21, R22). */
async function espelhar($: any, ex: Execucao): Promise<void> {
  if (ex.papel !== 'conjunto' || !ex.conjunto) return
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  const al = await alertas($)
  if (!c?.artefato || !al.sweep || al.sweep.semLeitura) return
  // the ledger files moved since the last sweep (it was held back by its 5 s gate or is in flight): its locks are
  // behind the checkpoints, so nothing is mirrored until a sweep has read them (C11-S01 rework)
  const m = marcadores[ex.ledgerDir ?? '']
  if (m === undefined || m !== al.sweep.marcador) return
  const resumo = resumoEspelho(ex, al.sweep.linhas, vistoEm)
  const hash = JSON.stringify(resumo)
  if (hash === hashEspelho) return
  const espelho: EspelhoConjunto = { ...resumo, at: new Date().toISOString() }
  const g = geracao
  // update merges deep: a released lock must be deleted by key, or the orchestrator keeps seeing it (C11-S01 rework).
  // A pinned first try has no document in hand: the keys this session wrote last stand for it.
  const campos = (doc: DbDoc | null) => ({ espelho: espelhoParaGravar(espelho, ((doc?.data as any)?.espelho as EspelhoConjunto | undefined) ?? ultimoEspelho) })
  const r = await gravarFixado($, c.artefato, 'execucao', ex.conjunto, campos, { versao: versaoEspelho })
  if (velho(g) || r.r === 'falhou') return // nothing stored: the next look retries
  hashEspelho = hash
  versaoEspelho = r.versao
  espelhadoEm = Date.now()
  ultimoEspelho = espelho
}

/** Orchestrator: the new complete lines of its own ledger.md (slot lines), read only when the file changed. */
async function lerLedgerOrq($: any, ex: Execucao): Promise<void> {
  if (ex.papel !== 'orquestrador' || !ex.ledgerDir) return
  let f: { size: number; mtimeMs: number } | undefined
  try {
    f = (await $.fs.list(ex.ledgerDir)).find((x: { name: string }) => x.name === 'ledger.md')
  } catch {
    return // no ledger dir yet: no slot lines, the slots stay as they were
  }
  if (!f || (cursorOrq && cursorOrq.size === f.size && cursorOrq.mtimeMs === f.mtimeMs)) return
  const texto = String(await $.fs.read(`${ex.ledgerDir}/ledger.md`))
  const de = cursorOrq && f.size >= cursorOrq.size ? cursorOrq.consumido : 0
  if (de === 0) eventosOrq = []
  const n = novasLinhas(texto, de)
  cursorOrq = { size: f.size, mtimeMs: f.mtimeMs, consumido: n.consumido }
  semearRelays($, texto.slice(de, n.consumido)) // C03-S01 (R1-3): raw RELAY lines, never lane events
  eventosOrq = [...eventosOrq, ...n.eventos]
  // C05-S01 (R9): the sessions this orchestrator opened, into the address map under their D17 titles
  const novas = notasOrq(n.eventos).sessoes
  if (novas.length) mudarMapa($, m => mapaDasNotas(m, novas, ex.codigo ?? null))
  slotsOrq = slotsAbertos(eventosOrq)
}

/** Every set's espelho the last poll read (orchestrator). */
const espelhos = () =>
  Object.entries(banco?.execucao ?? {})
    .map(([id, d]) => [id, (d.data as ConjuntoDoc).espelho] as const)
    .filter((x): x is readonly [string, EspelhoConjunto] => !!x[1])

const limiaresDoBanco = () => {
  const l = daBanco<OrquestracaoDoc>(banco?.config?.orquestracao)?.limiares
  return l && Number.isFinite(l.calado) && Number.isFinite(l.lockOrfao) ? { calado: l.calado, lockOrfao: l.lockOrfao } : { ...LIMIARES_PADRAO }
}

/** Orchestrator, on each poll: `config/orquestracao` (run, slots, thresholds, proposal) when its content changed (R24). */
async function gravarOrquestracao($: any, g: number): Promise<void> {
  const ex = await exec($)
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  const runId = (ex.ledgerDir ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  if (ex.papel !== 'orquestrador' || !c?.artefato || !c.plano || !/^\d{8}-\d{4}$/.test(runId)) return
  await lerLedgerOrq($, ex)
  const atual = banco?.config?.orquestracao ?? null
  const guardado = daBanco<OrquestracaoDoc>(atual ?? undefined)
  const agora = new Date().toISOString()
  let prop = proposta(espelhos().map(([, e]) => e.ritmo), agora)
  if (prop && guardado?.proposta && prop.calado === guardado.proposta.calado && prop.lockOrfao === guardado.proposta.lockOrfao && prop.amostras === guardado.proposta.amostras) {
    prop = { ...prop, at: guardado.proposta.at }
  }
  const sessao = (c.plano as Plano).execucao?.orquestrador ?? titulo
  const campos = (doc: DbDoc | null) => {
    const d = (doc?.data ?? null) as Partial<OrquestracaoDoc> | null
    return {
      runId,
      sessao,
      iniciadaEm: d?.runId === runId && d.iniciadaEm ? d.iniciadaEm : agora,
      slots: slotsOrq,
      limiares: d?.limiares ?? { ...LIMIARES_PADRAO, fonte: 'padrao', at: agora },
      proposta: prop,
      at: agora,
    }
  }
  const semHora = (o: ReturnType<typeof campos>) => JSON.stringify({ ...o, at: null, iniciadaEm: null, proposta: o.proposta ? { ...o.proposta, at: null } : null })
  const hash = semHora(campos(atual))
  if (hash === hashOrq || velho(g)) return
  const r = await gravarFixado($, c.artefato, 'config', 'orquestracao', campos, { versao: atual?.version ?? null, doc: atual })
  if (!velho(g) && r.r !== 'falhou') hashOrq = hash
}

/**
 * Alert scan (orchestrator and set session): orphan locks, held slots, quiet sets and specs, ranked (R11); one toast per
 * new key (R8); the Locks e filas rows. Reads state, the last sweep and the last poll only.
 */
async function alertasAgora($: any, run?: Execucao): Promise<void> {
  const ex = run ?? (await exec($))
  if (ex.papel !== 'orquestrador' && ex.papel !== 'conjunto') return
  const g = geracao
  const al = await alertas($)
  const agora = Date.now()
  let locks: LockAberto[] = []
  let unidadesC: { unidade: string; at: number; feito: boolean }[] = []
  let unidadesS: { unidade: string; at: number; feito: boolean }[] = []
  let lim = al.limiares
  let rit: Ritmo = ritmo(Object.values(ex.forks))
  let prop: Proposta | null = null
  let slots: Slots | null = null
  if (ex.papel === 'orquestrador') {
    lim = limiaresDoBanco()
    const es = espelhos()
    locks = es.flatMap(([, e]) => locksDoEspelho(e))
    unidadesS = es.flatMap(([, e]) => Object.entries(e.specs).map(([s, v]) => ({ unidade: s, at: Date.parse(v.at), feito: v.ultimo === 'DONE' })))
    unidadesC = Object.entries(ex.conjuntos ?? {}).map(([cj, v]) => ({ unidade: cj, at: v.at, feito: /^(pronto|merge)$/i.test(v.etapa) }))
    rit = ritmoTotal(es.map(([, e]) => e.ritmo))
    prop = daBanco<OrquestracaoDoc>(banco?.config?.orquestracao)?.proposta ?? proposta(es.map(([, e]) => e.ritmo), new Date(agora).toISOString())
    slots = slotsOrq
  }
  if (al.sweep) locks = [...locks, ...locksDoEspelho({ locks: resumoEspelho(ex, al.sweep.linhas, vistoEm).locks })]
  if (ex.papel === 'conjunto') {
    unidadesS = Object.values(ex.forks).map(f => {
      const r = raia(f, agora)
      const ms = marcos(f.eventos) // a NOTE resets no quiet clock (R26)
      const ult = ms[ms.length - 1]
      return { unidade: r.rotulo ?? r.slug, at: ult?.at ?? agora, feito: r.ultimo === 'DONE' }
    })
  }
  const lista: Alerta[] = montarAlertas(
    {
      orfaos: orfaos(locks, agora, lim.lockOrfao),
      slots: slots ? slotsPresos(slots, agora, lim.lockOrfao) : [],
      conjuntos: calados(unidadesC, agora, lim.calado),
      specs: calados(unidadesS, agora, lim.calado),
    },
    agora,
  )
  const t = novosToasts(lista, al.alertasVistos)
  const minutos = (iso: string) => Math.floor((agora - Date.parse(iso)) / 60_000)
  const vista: NonNullable<Alertas['vista']> = {
    locks: locks
      .map(l => ({ ...l, minutos: minutos(l.desde), orfao: minutos(l.desde) >= lim.lockOrfao }))
      .sort((a, b) => (b.minutos || 0) - (a.minutos || 0)),
    slots,
    unidades: [...unidadesC, ...unidadesS]
      .filter(u => !u.feito)
      .map(u => ({ unidade: u.unidade, minutos: Math.floor((agora - u.at) / 60_000), calada: Math.floor((agora - u.at) / 60_000) >= lim.calado })),
    ritmo: rit,
    proposta: prop,
    espelhadoEm,
  }
  if (velho(g)) return
  const pend = (await alertas($)).alertasVistos.filter(k => k.startsWith('pend:'))
  await $.state.set(ALERTAS, { ...(await alertas($)), lista, alertasVistos: [...t.vistos, ...pend], limiares: lim, vista })
  for (const tx of t.toasts) {
    try {
      $.ui.toast(tx)
    } catch {
      // no toast surface: the band still shows it
    }
  }
}

// ---- C02-S02: pendencias-refresh (orchestrator)

// The last good planning answers (kept when a list fails, R29), and the repository parse keyed by its source marker (R32).
let respostas: Record<string, DbDoc> | null = null
let repoMarcador: string | null = null
let repoCache: EntradaRepo[] | null = null

const lista = async ($: any, dir: string) => {
  try {
    return (await $.fs.list(dir)) as { name: string; kind: string; size: number; mtimeMs: number }[]
  } catch {
    return null
  }
}

/**
 * The repository pendings: the <ID>.md files of the first of .novarc/pendings, ai/pendings that holds any (plus the
 * legacy file, the file wins on the same id), and the first legacy PENDINGS.md of .novarc, the root, docs; null when
 * there is none. Re-read only when the marker moved.
 */
async function lerRepo($: any, cwd: string): Promise<EntradaRepo[] | null> {
  let pasta = ''
  let arquivos: { name: string; kind: string; size: number; mtimeMs: number }[] | null = null
  for (const dir of [`${cwd}/.novarc/pendings`, `${cwd}/ai/pendings`]) {
    const md = (await lista($, dir))?.filter(f => f.kind !== 'dir' && /\.md$/i.test(f.name))
    if (md?.length) {
      pasta = dir
      arquivos = md
      break
    }
  }
  let legado: { path: string; size: number; mtimeMs: number } | null = null
  for (const dir of [`${cwd}/.novarc`, cwd, `${cwd}/docs`]) {
    const f = (await lista($, dir))?.find(x => x.name === 'PENDINGS.md' && x.kind !== 'dir')
    if (f) {
      legado = { path: `${dir}/PENDINGS.md`, size: f.size, mtimeMs: f.mtimeMs }
      break
    }
  }
  if (!arquivos && !legado) {
    repoMarcador = null
    repoCache = null
    return null
  }
  const marcador = JSON.stringify([pasta, (arquivos ?? []).map(f => [f.name, f.size, f.mtimeMs]), legado && [legado.path, legado.size, legado.mtimeMs]])
  if (marcador === repoMarcador && repoCache) return repoCache
  const doArquivo = arquivos
    ? lerArquivos(await Promise.all(arquivos.map(async f => ({ nome: f.name, texto: String(await $.fs.read(`${pasta}/${f.name}`)) }))))
    : []
  const doLegado = legado ? lerLegado(String(await $.fs.read(legado.path))) : []
  repoCache = unirRepo(doArquivo, doLegado)
  repoMarcador = marcador
  return repoCache
}

/**
 * One refresh of the Pendências list: one `pendencias` list (R34), the repository pendings, the items on the way from
 * the sets' espelhos (reserve fork mode: this session's own lanes), the items sent to pre-close from this session's
 * ledger. Each source fails alone (R29); repository text stays in this session's state (R31). Toasts each new divergence.
 */
async function refrescarPendencias($: any, g: number): Promise<void> {
  const ex = await exec($)
  if (ex.papel !== 'orquestrador') return
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  const antes = ((await ler($, 'maestroPendencias')) ?? null) as EstadoPendencias | null
  const falhas = { plano: false, repo: false, ledger: false }
  const plano = (c?.plano ?? null) as (Plano & PlanoPend) | null
  if (c?.artefato) {
    try {
      const l = lerListaEstrita(await chamar($, { tool: 'ArtifactData', action: 'list', url: c.artefato, collection: 'pendencias', query: { limit: 1000 } }))
      if (!l) throw new Error('pendencias: list unreadable')
      respostas = l
    } catch {
      falhas.plano = true
    }
  }
  let repo: EntradaRepo[] | null
  try {
    repo = await lerRepo($, cwdSessao)
  } catch {
    falhas.repo = true
    repo = repoCache
  }
  try {
    await lerLedgerOrq($, ex)
  } catch {
    falhas.ledger = true
  }
  if (velho(g)) return
  const es = espelhos()
  const done = new Set<string>()
  let aCaminho = es.flatMap(([, e]) => e.aCaminho ?? [])
  for (const [, e] of es) for (const [spec, v] of Object.entries(e.specs)) if (v.ultimo === 'DONE') done.add(spec)
  if (!es.length && Object.keys(ex.forks).length) {
    // reserve fork mode: no set session mirrors, this session holds the lanes itself
    aCaminho = itensACaminho(Object.fromEntries(Object.values(ex.forks).map(f => [f.spec ?? f.slug, f.eventos])))
    for (const f of Object.values(ex.forks)) if (f.eventos.some(x => x.tipo === 'DONE')) done.add(f.spec ?? f.slug)
  }
  const resp = Object.fromEntries(Object.entries(respostas ?? {}).map(([id, d]) => [id, d.data as Resposta]))
  const { itens, divergencias } = montarItens({ plano, resp, repo: repo ?? [], aCaminho, done, enviados: enviadosDoLedger(eventosOrq) })
  let contador = antes?.contador ?? null
  if (plano && !falhas.plano && banco) {
    const specs = Object.fromEntries(Object.entries(banco.specs).map(([id, d]) => [id, d.data])) as Record<string, SpecDoc>
    const execucao = Object.fromEntries(Object.entries(banco.execucao).map(([id, d]) => [id, d.data])) as Record<string, ConjuntoDoc>
    const status = Object.fromEntries((plano.conjuntos ?? []).map(cj => [cj.id, estadoConjunto(cj, specs, execucao[cj.id]).status]))
    contador = contadorDe(plano, resp, status)
  } else if (!plano) contador = null
  const estado: EstadoPendencias = {
    itens: falhas.plano && antes ? [...antes.itens.filter(i => i.fonte === 'plano'), ...itens.filter(i => i.fonte !== 'plano')] : itens,
    repo,
    resumo: repo ? resumoDoc(repo) : null,
    contador,
    divergencias: falhas.plano && antes ? antes.divergencias : divergencias,
    falhas,
    fases: (plano?.fases ?? []).map(f => f.id),
  }
  await $.state.set(PEND, estado)
  // one toast per divergence key (R23), only while no more urgent alert is active: a key not toasted yet waits for the
  // alert to clear; keys of divergences gone are dropped, so a recurrence toasts again
  const al = await alertas($)
  const atuais = new Set(estado.divergencias.map(d => d.chave))
  const vistos = al.alertasVistos.filter(k => !k.startsWith('pend:') || atuais.has(k))
  if (!al.lista.length) {
    for (const d of estado.divergencias) {
      if (vistos.includes(d.chave)) continue
      vistos.push(d.chave)
      try {
        $.ui.toast(textoDivergencia(d))
      } catch {
        // no toast surface: the band still shows it
      }
    }
  }
  await $.state.set(ALERTAS, { ...al, alertasVistos: vistos })
}

/** The tab selected: one refresh on demand, under the poll's reentrancy flag. */
async function pendenciasAgora($: any): Promise<void> {
  if (atualizando) return
  atualizando = true
  const g = geracao
  try {
    await refrescarPendencias($, g)
    if (!velho(g)) await prepararFaixa($)
  } catch (err) {
    await logarUmaVez($, 'pendencias', err)
  } finally {
    if (!velho(g)) atualizando = false
  }
}

/** "marcar como enviada ao cliente": only `pendencias/<id>.enviada`, pinned (R16); a refused write toasts (R17). */
async function marcarEnviada($: any, i: ItemPendencia): Promise<void> {
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (!c?.artefato || i.fonte !== 'plano') return
  let by = 'Maestro'
  try {
    const r = await $.process.run(['git', 'config', 'user.name'], { cwd: cwdSessao })
    by = (r.exitCode === 0 && String(r.stdout).trim()) || by
  } catch {
    // no git: the default name
  }
  const enviada = { by, at: new Date().toISOString() }
  const r = await gravarFixado($, c.artefato, 'pendencias', i.id, { enviada })
  if (r.r === 'falhou') {
    try {
      $.ui.toast(`Não foi possível marcar ${i.id} como enviada: a gravação em pendencias/${i.id} falhou`)
    } catch {
      // no toast surface
    }
    return
  }
  const e = ((await ler($, 'maestroPendencias')) ?? null) as EstadoPendencias | null
  if (e) await $.state.set(PEND, { ...e, itens: e.itens.map(x => (x.fonte === 'plano' && x.id === i.id ? { ...x, enviada: true } : x)) })
}

/** "usar o medido" (orchestrator pane): one pinned update of `config/orquestracao.limiares` (R15). */
async function usarMedido($: any): Promise<void> {
  const ex = await exec($)
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  const prop = (await alertas($)).vista?.proposta
  if (ex.papel !== 'orquestrador' || !c?.artefato || !prop) return
  const limiares = { calado: prop.calado, lockOrfao: prop.lockOrfao, fonte: 'medido' as const, at: new Date().toISOString() }
  const atual = banco?.config?.orquestracao ?? null
  const r = await gravarFixado($, c.artefato, 'config', 'orquestracao', { limiares }, { versao: atual?.version ?? null, doc: atual })
  if (r.r === 'falhou' || !banco) return
  banco.config.orquestracao = { id: 'orquestracao', version: r.versao ?? (atual?.version ?? 0) + 1, data: { ...(atual?.data ?? {}), limiares } }
  await alertasAgora($)
  await prepararFaixa($)
}

// <gitdir> of the session's checkout, resolved by one `git rev-parse --git-dir` at start and after a checkout/switch.
let gitdir = ''

async function resolverGitdir($: any, cwd: string): Promise<void> {
  try {
    const r = await $.process.run(['git', 'rev-parse', '--git-dir'], { cwd })
    const d = r.exitCode === 0 ? String(r.stdout).trim() : ''
    gitdir = !d ? '' : /^([a-zA-Z]:)?[\\/]/.test(d) ? d : `${cwd}/${d}`
  } catch {
    gitdir = ''
  }
}

/** The branch from `<gitdir>/HEAD` with no process; a detached HEAD or no repo gives null. */
async function lerBranch($: any): Promise<string | null> {
  let b: string | null = null
  try {
    if (gitdir) b = String(await $.fs.read(`${gitdir}/HEAD`)).trim().match(/^ref: refs\/heads\/(.+)$/)?.[1] ?? null
  } catch {
    // no HEAD: no branch
  }
  ramoAtual = b
  return b
}

async function homeDir($: any): Promise<string | null> {
  return (await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? null
}

/** This session's registry entry: one file per session under ~/.claude/maestro/sessoes, else one $.store key. */
async function registrar($: any, run?: Execucao): Promise<void> {
  if (!sessao) return
  const g = geracao
  const ex = run ?? (await exec($))
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  const agora = Date.now()
  const p = progresso(ex)
  const r: Registro = {
    sessao, cwd: cwdSessao, titulo, papel: ex.papel, forks: p.total, feitos: p.feitos, alerta: alerta(ex, agora), at: agora,
    nome: ex.nome ?? null, codigo: ex.codigo ?? null, conjunto: ex.conjunto ?? null, spec: ex.spec ?? null,
    projeto: (c?.plano ? projetoDoPlano(c.plano as Plano).projeto : null) ?? ex.projeto ?? null,
    branch: await lerBranch($),
    pai: null, // ponytail: nothing in this spec knows the parent session; C05-S02 fills `pai`
    artefato: c?.artefato ?? ex.artefato ?? null, ledgerDir: ex.ledgerDir, conjuntos: ex.conjuntos,
    aguardandoGo: ex.aguardandoGo ?? null,
  }
  const home = await homeDir($)
  if (velho(g)) return
  try {
    if (!home) throw new Error('no home')
    await $.fs.write(`${home}/.claude/maestro/sessoes/${sessao}.json`, JSON.stringify(r))
    if (!velho(g)) await $.state.set(ONDE, 'arquivo')
  } catch {
    await $.store.set(`maestro-sessao-${sessao}`, r) // ponytail: the store is one file per plugin and may race across sessions; per-session files are the primary path
    if (!velho(g)) await $.state.set(ONDE, 'store')
  }
  // every event hook writes the registry right after it moved the run: the band is prepared here once for all of them
  if (!velho(g)) await prepararFaixa($, ex)
}

// Registry files already parsed, by name: re-read only when `mtimeMs` moved.
let cacheReg: Record<string, { mtimeMs: number; entrada: Registro }> = {}

/** Every live session's entry, from the files and from the store fallback. */
/** Reads the machine's registry (files, then the store fallback); false when neither source could be read. */
async function lerOutras($: any): Promise<boolean> {
  const g = geracao
  const agora = Date.now()
  const rs: Registro[] = []
  const home = await homeDir($)
  let lido = false
  try {
    if (home) {
      const dir = `${home}/.claude/maestro/sessoes`
      const vistos: typeof cacheReg = {}
      for (const f of await $.fs.list(dir)) {
        // a file not written in the liveness window is a dead session: never read
        if (!String(f.name).endsWith('.json') || !(agora - f.mtimeMs < 30 * 60_000)) continue
        let c = cacheReg[f.name]
        if (!c || c.mtimeMs !== f.mtimeMs) {
          try {
            c = { mtimeMs: f.mtimeMs, entrada: JSON.parse(String(await $.fs.read(`${dir}/${f.name}`))) as Registro }
          } catch {
            continue // a half-written file: read again on the next look
          }
        }
        vistos[f.name] = c
        rs.push(c.entrada)
      }
      cacheReg = vistos
      lido = true
    }
  } catch {
    // no registry dir yet
  }
  try {
    const chaves = await $.store.keys()
    lido = true
    for (const k of chaves) {
      if (!k.startsWith('maestro-sessao-')) continue
      const r = (await $.store.get(k)) as Registro | undefined
      if (r && !rs.some(x => x.sessao === r.sessao)) rs.push(r)
    }
  } catch {
    // store unavailable
  }
  // neither source read: keep the last list (Agora must not turn into the empty card after a failed read)
  if (velho(g) || !lido) return lido
  await $.state.set(OUTRAS, rs.filter(r => vivo(r, agora) && (r.papel || r.sessao === sessao)).sort((a, b) => b.at - a.at))
  return true
}

let olhando = false
const logados = new Set<string>()

async function logarUmaVez($: any, passo: string, err: unknown): Promise<void> {
  if (logados.has(passo)) return
  logados.add(passo)
  try {
    await $.ui.log(`maestro: ${passo} falhou: ${String(err)}`)
  } catch {
    // no log here
  }
}

/**
 * The one-minute look: each step on its own, a failing one logged once per session; a look never overlaps the last.
 * `doTimer`: the timer's call, which returns when the band is off or no run is recognised; a direct call (/maestro, the
 * band buttons) always looks, so a session with no role still refreshes the machine's list.
 */
async function olharAgora($: any, doTimer = false): Promise<void> {
  if (olhando) return
  olhando = true
  const g = geracao
  try {
    if (doTimer && (await ler($, 'maestroModo')) === 'off') return
    let ex = await exec($)
    if (doTimer && !ex.papel) return
    try {
      await garantirPoll($) // self-healing: a look that finds no poll arms it
    } catch (err) {
      await logarUmaVez($, 'garantirPoll', err)
    }
    try {
      ex = await lerDir($, ex)
    } catch (err) {
      await logarUmaVez($, 'lerDir', err)
      // the dir was not read: its marker says nothing about the files now, so no sweep and no espelho trusts it
      if (ex.ledgerDir) delete marcadores[ex.ledgerDir]
    }
    if (ex.papel === 'conjunto') await lerAceitos($, ex.ledgerDir) // C05-S02: the ownership box reads the module copy
    if (velho(g)) return
    try {
      await registrar($, ex)
    } catch (err) {
      await logarUmaVez($, 'registrar', err)
    }
    try {
      const ok = await lerOutras($)
      if (!velho(g)) await marcarLeitura($, 'registro', ok)
    } catch (err) {
      await logarUmaVez($, 'lerOutras', err)
      if (!velho(g)) await marcarLeitura($, 'registro', false).catch(() => undefined)
    }
    if (velho(g)) return
    try {
      if (ex.papel === 'orquestrador') await lerConjuntos($)
    } catch (err) {
      await logarUmaVez($, 'lerConjuntos', err)
    }
    if (velho(g)) return
    // C02-S01 steps, each on its own: sweep when the marker moved (R2), then on the timer's looks the look count and
    // the mirror write (R19), then the alert scan
    try {
      if (podeVarrer(ex) && marcadores[ex.ledgerDir!] !== undefined && marcadores[ex.ledgerDir!] !== (await alertas($)).sweep?.marcador) await varrer($, 'olhar')
    } catch (err) {
      await logarUmaVez($, 'varrer', err)
    }
    if (velho(g)) return
    try {
      if (doTimer && ex.papel === 'conjunto') {
        const al = await alertas($)
        const olhares = al.olhares + 1
        if (velho(g)) return
        await $.state.set(ALERTAS, { ...al, olhares })
      }
    } catch (err) {
      await logarUmaVez($, 'olhares', err)
    }
    if (velho(g)) return
    try {
      if (doTimer) await espelhar($, ex)
    } catch (err) {
      await logarUmaVez($, 'espelhar', err)
    }
    if (velho(g)) return
    try {
      if (ex.papel === 'orquestrador') await lerLedgerOrq($, ex)
    } catch (err) {
      await logarUmaVez($, 'lerLedgerOrq', err)
    }
    try {
      if (!velho(g) && (ex.papel === 'orquestrador' || ex.papel === 'conjunto')) await alertasAgora($, ex)
    } catch (err) {
      await logarUmaVez($, 'alertas', err)
    }
    try {
      // C03-S01 (Task 7): directive-nudge after the alert scan, orchestrator only
      if (!velho(g) && ex.papel === 'orquestrador') await directiveNudge($)
    } catch (err) {
      await logarUmaVez($, 'directiveNudge', err)
    }
    try {
      // C03-S01 (Task 6): the set's reports, then the directives still waiting for their proof (timer looks only)
      if (!velho(g) && ex.papel === 'conjunto') {
        await relatar($, ex)
        if (doTimer && !velho(g)) await reencaminhar($)
      }
    } catch (err) {
      await logarUmaVez($, 'relatar', err)
    }
    try {
      if (!velho(g)) await auditFlush($) // C03-S01 audit-flush
    } catch (err) {
      await logarUmaVez($, 'auditFlush', err)
    }
    if (!velho(g)) await prepararFaixa($, ex)
  } catch {
    // the gate's state read failed: the next tick tries again
  } finally {
    if (!velho(g)) olhando = false
  }
}

function cancelarLoops(): void {
  poll?.cancel()
  olhar?.cancel()
  adiada?.cancel()
  flushArmado?.cancel()
  acordar?.cancel()
  poll = null
  olhar = null
  adiada = null
  flushArmado = null
  acordar = null
}

/** `ativar`: band forced on; a recognised run gets its look (and the orchestrator its poll) back. */
async function ativar($: any): Promise<void> {
  await $.state.set(MODO, 'on')
  const ex = await exec($)
  await prepararFaixa($, ex)
  if (!ex.papel) return
  if (ex.papel === 'orquestrador') await orquestrar($, null)
  await ligar($, ex.papel)
  await garantirPoll($)
}

// The artifact half of the latest session start (plan read, context, first refresh); a milestone that needs the context
// awaits it in its background task.
let carregando: Promise<void> = Promise.resolve()

/**
 * Session bookkeeping: id, cwd, gitdir, role from the branch (arms the look), never-list, registry, then the artifact
 * context. Run by session.start and, after a /clear (no session.start fires), by the first hook that needs it.
 * `esperar`: await the artifact half (session.start); the first hook after a /clear leaves it in the background.
 */
async function iniciarSessao($: any, cwd: string, esperar = true): Promise<void> {
  // the deferred is live from the first line, so a hook running concurrently with the bookkeeping awaits this load
  let pronto = () => {}
  const minha = (carregando = new Promise<void>(r => (pronto = r)))
  let branch: string | null = null
  cancelarLoops() // a timer still held from before a reload is replaced, never doubled
  encerrando = false // a new session never inherits an end that did not finish
  const g = geracao
  try {
    sessao = await $.session.id()
    cwdSessao = cwd
    try {
      await restaurarFila($)
    } catch {
      // the stored queue is lost; new entries still queue
    }
    try {
      await semearMapa($)
    } catch {
      // the stored map is lost; the ledgers rebuild it
    }
    try {
      await restaurarRotas($)
    } catch {
      // the waiting lines are lost; the set session's agent still saw them
    }
    try {
      await restaurarDiretivas($)
    } catch {
      // the stored keys are lost; the db seed and the ledger RELAY lines bring them back
    }
    try {
      raizPlugin ??= String($.plugin.root || '').replace(/\\/g, '/') || null
    } catch {
      // no plugin root: only the ledger dir is exempt from the path warning
    }
    // C03 start work the guard can do without (isentos missing: extra warnings; root/default branch missing: fail-open for
    // the merge-on-default check only): off the awaited path after a /clear, awaited at session.start
    const c03 = (async () => {
      try {
        // the session scratchpad lives under the OS temp dir; the engine names no scratchpad path of its own
        const home = await homeDir($)
        const ds = await Promise.all([$.env.get('TEMP'), $.env.get('TMP'), $.env.get('TMPDIR')])
        const lista = [...ds, home ? `${home}/.claude` : null].filter((x): x is string => !!x).map(x => String(x).replace(/\\/g, '/'))
        if (!velho(g)) isentosSessao = lista
      } catch {
        // no env: only the ledger dir and the plugin root are exempt
      }
      await lerRaizERamo($, cwd, g)
    })()
    if (esperar) await c03
    else void c03.catch(() => {})
    await resolverGitdir($, cwd)
    branch = await lerBranch($)
    titulo = tituloDe(cwd, branch)
    papelConhecido = false
    if ((await nunca($)).includes(cwd)) await $.state.set(MODO, 'off')
    const pb = papelDaBranch(branch)
    if (pb) await ligar($, 'spec', null, { conjunto: pb.conjunto, spec: pb.spec })
    // after a hot reload the state survives but the timers were cancelled: a recognised run gets its loops back
    const ex = await exec($)
    ultimoExec = ex
    // C03-S01 (R3-3): a set session re-reads its ledger.md now, so a directive received before the first look is not relayed twice
    if (ex.papel === 'conjunto' && ex.ledgerDir) {
      try {
        const f = ((await $.fs.list(ex.ledgerDir)) as { name: string; size: number; mtimeMs: number }[]).find(x => x.name === 'ledger.md')
        if (f) await lerMapa($, `${ex.ledgerDir}/ledger.md`, f, '', g)
      } catch {
        // no ledger yet: the first look folds it
      }
    }
    if (ex.papel && (await ler($, 'maestroModo')) !== 'off') {
      if (ex.papel === 'orquestrador') await orquestrar($, null)
      await ligar($, ex.papel)
    }
    await garantirPoll($) // a set or spec session with a plan gets its poll back too
    await registrar($)
    await lerOutras($)
    if (!velho(g)) await prepararFaixa($)
  } catch {
    // v2 bookkeeping never blocks the session or the milestone path below
  }
  void carregarContexto($, cwd, branch, g).then(pronto)
  if (esperar) await minha
}

/** The artifact half of a session start: artefato.txt, the plan, the context, the first refresh. Never rejects. */
async function carregarContexto($: any, cwd: string, branch: string | null, g: number): Promise<void> {
  try {
    const artefato = await acharArtefato($, cwd)
    if (!artefato) return
    const tools = (await $.tool.list()).map((t: { name: string }) => t.name)
    if (!tools.includes('ArtifactData')) return
    const plano = await lerPlano($, artefato)
    if (!plano || velho(g)) return
    // a skill url loaded first (carregar): its context wins, this load writes nothing
    if (((await ler($, 'ctx')) as Contexto | null)?.artefato || velho(g)) return
    const spec = specDaBranch(branch ?? '', plano)
    await $.state.set(CTX, { artefato, plano, conjunto: spec ? spec.conjunto : null, spec: spec ? spec.id : null, papel: spec ? 'spec' : null })
    if (velho(g)) return
    await plantar($, plano, artefato)
    await atualizar($)
    await garantirPoll($)
    await refrescarBanco($)
  } catch {
    // no plan context: the run is still followed without it
  }
}

const tituloDe = (cwd: string, branch: string | null) => `${cwd.split(/[\\/]/).pop()} · ${branch || 'sem branch'}`

async function garantirSessao($: any): Promise<void> {
  if (sessao) return
  try {
    await iniciarSessao($, await $.session.cwd(), false)
  } catch {
    // the next hook tries again
  }
}

/** Forgets the ended session: every module variable and every Maestro state key back to a fresh session's. */
async function zerarSessao($: any, modo: 'auto' | 'off' = 'auto'): Promise<void> {
  geracao++
  encerrando = false // from here every older caller is velho(g); cleared before any write that may fail
  banco = null
  refrescando = false
  carregando = Promise.resolve()
  sessao = ''
  cwdSessao = ''
  titulo = ''
  gitdir = ''
  cursor = {}
  cacheReg = {}
  porDir = {}
  marcadores = {}
  varrendo = false
  ultimaVarredura = 0
  scriptLedger = null
  vistoEm = {}
  hashEspelho = null
  versaoEspelho = null
  espelhadoEm = null
  ultimoEspelho = null
  hashOrq = null
  cursorOrq = null
  eventosOrq = []
  respostas = null
  repoMarcador = null
  repoCache = null
  slotsOrq = { verify: { dono: null, fila: [] }, producao: { dono: null, fila: [] } }
  prontos = []
  papelConhecido = false
  olhando = false
  atualizando = false
  logados.clear()
  ultimoExec = VAZIA // the /clear path: known state, no run
  sessionEndAtivo = false
  raizWorktree = null
  ramoPadrao = 'main'
  locksConcedidos = new Set()
  guardados.clear()
  fila = []
  nAuditoria = 0
  descarregando = false
  mapaAtual = MAPA_VAZIO()
  aceitosLidos = null
  temListSessions = null
  cheiaAvisada = false
  manifestos = {}
  relatados = new Set()
  reservados = new Set()
  rotas = []
  relaysOrq = {}
  semConjuntoAvisado = false
  diretivasFeitas.clear()
  avisadosFora.clear()
  envios = {}
  semeadura = null
  relatosRecebidos = []
  nudando = false
  semRespostaAvisado.clear()
  provasConj = {}
  provasVelhas.clear()
  configGate = null
  espelharDiretivas($)
  espelharRotas($)
  espelharFila($)
  espelhoMapa = espelhoMapa.then(() => $.state.set(MAPA, null)).catch(() => {})
  gosAtual = {}
  gosSemeado = false
  espelhoGos = espelhoGos.then(() => $.state.set(GOS, null)).catch(() => {})
  await $.state.set(SEL, null)
  await $.state.set(CTX, null)
  await $.state.set(LINHAS, [])
  await $.state.set(FAIXA, null)
  await gravarExec($, VAZIA)
  await $.state.set(MODO, modo)
  await $.state.set(ABA, 'agora')
  await $.state.set(OUTRAS, null) // the next session's Agora shows `lendo o registro…` until its first read
  await $.state.set(POR_DIR, {})
  await $.state.set(ETAPA, null)
  await $.state.set(FAIXA_DADOS, null)
  await $.state.set(ONDE, null)
  await $.state.set(ALERTAS, null)
  await $.state.set(PEND, null)
  await $.state.set(PEND_VISTA, null)
  await $.state.set(LEITURA, null) // maestroPainelAberto stays: a reload must find it
}

async function nunca($: any): Promise<string[]> {
  return ((await $.store.get(NUNCA)) as string[] | undefined) ?? []
}

const COR: Record<string, string> = { feito: 'success', agora: 'claude', travado: 'error', vazio: 'inactive' }
// One fixed-width column per TRILHA step: the engine collapses spaces inside a Text, so columns come from layout.
const COLUNA = 9
const MAX_RAIAS = 21

type Acao = () => Promise<void>
/** What the band draws, already computed (v2, C11-S01): `papel`/`txt` decide idle or active (estadoFaixa), the rest is laid out. */
export type FaixaDados = {
  papel: string | null
  txt: string | null
  titulo: string
  status: string
  /** The first two alert texts, most urgent first (C02-S01 R11). */
  alertas: string[]
  /** Orchestrator only (C02-S02): divergences or the pending counter, shown only when no alert is (R19). */
  pend: { tipo: 'divergente' | 'contador'; texto: string } | null
  segmentos: ('d' | 'w' | 'b')[]
  /** Set session: specs in DONE over its lanes. */
  feitos: { n: number; total: number } | null
  /** Orchestrator only: a set ready to close with nothing held (green band). */
  verde: { titulo: string; texto: string; dica: string } | null
  /** The bell count (contaSino). */
  nAlertas: number
  /** Where `ver` and the bell go. */
  abaAlerta: 'locks' | 'pendencias' | null
  nOutras: number
}

const SEGMENTO: Record<string, 'd' | 'w' | 'b'> = { success: 'd', claude: 'w', error: 'b' }

/**
 * The band's fields from the run, the poll text, the registry, the stage label, this session's alerts (the most urgent
 * first, R11) and, in the orchestrator, the sets ready to close and the pendings state.
 */
export function dadosFaixa(
  ex: Execucao,
  txt: string | null,
  outras: Registro[],
  etapa: string | null,
  agora: number,
  eu: string,
  alertas: Alerta[] = [],
  verdes: { conjunto: string; n: number }[] = [],
  pendencias: EstadoPendencias | null = null,
  semConf: Envio[] = [],
): FaixaDados {
  const minhas = Object.values(ex.forks).map(f => raia(f, agora))
  let titulo = 'NOVARC'
  let status: string
  let quad: Raia[] = []
  const comAlertas = ex.papel === 'orquestrador' || ex.papel === 'conjunto'
  // R53: an unconfirmed directive leads the orchestrator's alerts, in the same `error` line 2
  const dirs = ex.papel === 'orquestrador' ? semConf.map(e => `diretiva sem confirmação: ${e.acao} ${e.alvo}`) : []
  const als = comAlertas ? [...dirs, ...alertas.map(a => a.texto)].slice(0, 2) : []
  const v = ex.papel === 'orquestrador' && !als.length ? verdes[0] : undefined
  if (ex.papel === 'orquestrador') {
    // before this session's own registry entry is read back, its run is empty: `0 conjuntos vivos` until the look
    // that follows (it writes the entry, then reads the registry)
    const run = daMinhaExecucao(outras, eu)
    titulo = 'orquestrando'
    status = [faixaOrq(run.filter(r => r.papel === 'conjunto' && vivo(r, agora)).length), txt].filter(Boolean).join(' · ')
  } else if (ex.papel === 'conjunto') {
    quad = ex.conjunto ? minhas : []
    titulo = ex.conjunto ?? 'NOVARC'
    status = quad.length ? faixaConjuntoRaias(ex.conjunto!, etapa, quad) : 'sessão de conjunto'
  } else if (ex.papel === 'spec') {
    const f = Object.values(ex.forks).find(x => (x.spec ?? x.slug).toUpperCase() === ex.spec)
    // the structured protocol fields only: the event text is free and may carry a credential
    const ultimo = f ? marcos(f.eventos ?? []).at(-1) : undefined
    titulo = ex.spec ?? 'NOVARC'
    status = ultimo ? textoCheckpoint(ultimo) : 'sessão de spec'
  } else status = txt ?? 'ativo'
  const segmentos = quadrados(quad).map(c => SEGMENTO[c]!)
  const pend = ex.papel === 'orquestrador' && !als.length ? slotPendencias(pendencias) : null
  return {
    papel: ex.papel,
    txt,
    titulo,
    status,
    alertas: als,
    pend,
    segmentos,
    feitos: ex.papel === 'conjunto' && segmentos.length ? { n: segmentos.filter(s => s === 'd').length, total: segmentos.length } : null,
    verde: v ? { titulo: 'pronto para fechar', texto: `${v.conjunto} com as ${v.n} specs em DONE, sem lock aberto`, dica: 'peça o FECHA na conversa' } : null,
    nAlertas: contaSino(ex.papel, comAlertas ? { lista: alertas } : null, ex.papel === 'orquestrador' ? pendencias : null, dirs.length),
    abaAlerta: als.length ? 'locks' : ex.papel === 'orquestrador' && (pendencias?.divergencias.length || pendencias?.contador) ? 'pendencias' : null,
    nOutras: outras.filter(r => r.sessao !== eu).length,
  }
}

/** Recomputes the band's fields from state; `ex`: the run the caller already holds, so the (large) `exec` is read once. */
async function prepararFaixa($: any, ex?: Execucao): Promise<void> {
  const run = ex ?? (await exec($))
  await $.state.set(
    FAIXA_DADOS,
    dadosFaixa(
      run,
      ((await ler($, 'faixa')) ?? null) as string | null,
      ((await ler($, 'maestroOutras')) ?? []) as Registro[],
      (run.papel === 'conjunto' ? (await ler($, 'maestroEtapa')) ?? null : null) as string | null,
      Date.now(),
      sessao,
      run.papel === 'orquestrador' || run.papel === 'conjunto' ? ((await ler($, 'maestroAlertas')) as Alertas).lista : [],
      run.papel === 'orquestrador' ? prontos : [],
      run.papel === 'orquestrador' ? ((await ler($, 'maestroPendencias')) as EstadoPendencias | null) : null,
      run.papel === 'orquestrador' ? semConfirmacao(envios, Date.now()) : [],
    ),
  )
}

const SEM_FAIXA: FaixaDados = { papel: null, txt: null, titulo: 'NOVARC', status: 'ativo', alertas: [], pend: null, segmentos: [], feitos: null, verde: null, nAlertas: 0, abaAlerta: null, nOutras: 0 }

/**
 * The band above the prompt in three fixed columns (R19): the short logo; title and status on line 1, alerts, a hint
 * or the set segments on line 2, every Text cut with an ellipsis; the seal and the Buttons on the right, never wrapping.
 */
function faixaArvore(ui: any, superficie: string, modo: 'auto' | 'on' | 'off', f: FaixaDados, larg: number, acoes: { ativar: Acao; nunca: Acao; painel: Acao; ver: Acao; verPend: Acao }): any {
  const { Box, Text } = ui
  const Client = ui.Client
  const k = kit(ui, larg, superficie)
  const lc = LOGO_FAIXA
  const faixa = (o: { titulo: string; status: string; segunda?: any[]; direita?: any[]; ok?: boolean }) => (
    <Box flexDirection="row" gap="md" alignItems="center" paddingX="md" paddingY="xs" borderStyle="round" borderColor={o.ok ? 'success' : 'promptBorder'}>
      {k.sv(lc.src, 'NovArc', lc.w, 22, '[/]')}
      <Box flexDirection="column" flexGrow={1} width={0}>
        <Box flexDirection="row" gap="sm" alignItems="center">
          {o.ok ? <Text>🟢</Text> : k.sv(marca, 'marca Maestro', 4, 14, '▍')}
          <Text bold color={o.ok ? 'success' : undefined} wrap="truncate-end">{o.titulo}</Text>
          <Box flexGrow={1} width={0}>
            <Text color="subtle" wrap="truncate-end">{o.status}</Text>
          </Box>
        </Box>
        {o.segunda?.length ? <Box flexDirection="row" gap="md">{o.segunda}</Box> : null}
      </Box>
      {o.direita?.length ? <Box flexDirection="row" gap="sm" alignItems="center" flexShrink={0}>{o.direita}</Box> : null}
    </Box>
  )
  const linha2 = (key: string, t: string, cor: string) => <Text key={key} size="footnote" color={cor} wrap="truncate-end">{`🔴 ${t}`}</Text>
  if (estadoFaixa(modo, f.papel, f.txt, false) === 'ociosa') {
    return faixa({
      titulo: 'maestro',
      status: faixaOcioso(f.nOutras),
      direita: [k.botao({ key: 'nunca', onPress: acoes.nunca, children: 'nunca neste projeto' }), k.botao({ key: 'ativar', primario: true, hotkey: '1', onPress: acoes.ativar, children: 'ativar' })],
    })
  }
  const orq = f.papel === 'orquestrador'
  // Manual is the only mode before C06-S01: a constant seal in the orchestrator, none in a set or spec band
  const selo = orq ? [k.chip('modo manual', 'neutro')] : []
  if (orq && f.verde) return faixa({ ok: true, titulo: f.verde.titulo, status: f.verde.texto, segunda: [<Text size="footnote" color="subtle" wrap="truncate-end">{f.verde.dica}</Text>], direita: selo })
  const segunda: any[] = []
  f.alertas.forEach((a, i) =>
    segunda.push(i === 0 && k.temClient ? <Client key="pulso" module="./pulse.tsx" props={{ label: a }} /> : linha2(`al-${i}`, a, 'error')),
  )
  if (!f.alertas.length && f.pend) segunda.push(linha2('pend', f.pend.texto, f.pend.tipo === 'divergente' ? 'error' : 'warning'))
  if (f.papel === 'conjunto' && f.feitos) {
    const rotulo = `${f.feitos.n} de ${f.feitos.total} specs em DONE`
    segunda.push(
      k.temSvg ? (
        <Box key="segs" width={Math.min(20, f.segmentos.length * 3)} flexShrink={0}>
          {k.sv(barraSegmentosM(f.segmentos), rotulo, 0, 8, '')}
        </Box>
      ) : (
        <Text key="segs">
          {f.segmentos.map(s => (
            <Text color={s === 'd' ? 'success' : s === 'b' ? 'error' : 'claude'}>■</Text>
          ))}
        </Text>
      ),
      <Text key="feitos" size="footnote" color="subtle" wrap="truncate-end">{rotulo}</Text>,
    )
  }
  const botao = f.alertas.length
    ? k.botao({ key: 'ver', primario: true, hotkey: '1', onPress: acoes.ver, children: 'ver' })
    : f.pend
      ? k.botao({ key: 'ver-pend', primario: true, hotkey: '1', onPress: acoes.verPend, children: 'ver' })
      : k.botao({ key: 'painel', hotkey: '1', onPress: acoes.painel, children: 'painel' })
  return faixa({ titulo: f.titulo, status: f.status, segunda, direita: [...selo, botao] })
}

type DadosPainel = {
  aba: string
  ex: Execucao
  outras: Registro[] | null
  porDir: Record<string, Execucao>
  titulos: Record<string, string>
  linhas: string[]
  onde: string | null
  agora: number
  eu: string
  alertas: Alertas | null
  pendencias: EstadoPendencias | null
  vista: VistaPendencias
  temArtefato: boolean
  /** C11-S01: the pane width in columns, the render surface, the reads, the header name, the bell count. */
  larg: number
  superficie: string
  leitura: Leitura
  projeto: string
  sino: number
  /** C03-S01: the orchestrator's send lifecycle per key and the session map (R52, R53, R26). */
  envios: Record<string, Envio>
  mapa: MapaSessoes
  /** C05-S01: the orchestrator ledger's SESSAO/BASE/CARTAO/GO lines, the local GO copy, each set's dependeDe, the selected set. */
  notas: NotasOrq
  gos: Record<string, GoLocal>
  dependeDe: Record<string, string[]>
  sel: string | null
  /** A planning snapshot exists in memory (the error card only shows with nothing saved, R30). */
  temBanco: boolean
  /** `🔄 tentar de novo` is running: the body is the loading card (R32). */
  tentando: boolean
  /** C04-S01: this machine's partners' catalogue sync (read only while Inteligência is open) and the plan's client. */
  acervoSync: AcervoSync | null
  cliente: string
  /** C05-S02: the run's session family (orchestrator), from `maestroFamilia`; null while the first read is pending. */
  familia?: Familia | null
  /** C05-S02 (R16): set session, per spec of its lanes, the phase row of `quem grava specs/<spec> agora`. */
  posse?: { spec: string; titulo: string; fase: 'antes' | 'carga' | 'build' | 'fechamento' }[]
  acoes: {
    aba: (a: string) => Acao
    abrir: Acao
    usarMedido: Acao
    sino: Acao
    tentar: Acao
    pend: Parameters<typeof abaPendencias>[5]
    abrirAcervo: Acao
    abrirLinha: (url: string) => Acao
    selConjunto: (C: string) => Acao
  }
}

const MAX_LOCKS = 50

const EMOJI_LOCK: Record<string, string> = { migration: '🗄️', db: '💾', file: '📄', deploy: '🚀' }

/**
 * For each open alert of the orchestrator, the delivered send of the directive it called for (R52): the same
 * `diretivasPrevistas` key the nudge used, a second status request falling back to the first one's send.
 */
function cobrancas(d: DadosPainel): Map<string, Envio> {
  const out = new Map<string, Envio>()
  const al = d.alertas
  if (d.ex.papel !== 'orquestrador' || !al) return out
  for (const a of al.lista) {
    const p = diretivasPrevistas({
      alertas: [a], relatos: [], feitas: new Set(), runId: '', mapa: d.mapa, codigo: d.ex.codigo ?? '', agora: d.agora,
      limiarCalado: al.limiares.calado, limiarLock: al.limiares.lockOrfao, locks: al.vista?.locks ?? [], slots: al.vista?.slots ?? null,
    })[0]
    if (!p) continue
    const e = [d.envios[p.chave], d.envios[p.chave.replace(/-2$/, '-1')]].filter((x): x is Envio => x?.estado === 'enviado').sort((x, y) => y.at - x.at)[0]
    if (e) out.set(a.chave, e)
  }
  return out
}

/** The Locks e filas tab (R15, R16): KPIs, held resources, the orchestrator's slots, the session signals, the thresholds. */
function abaLocks(ui: any, d: DadosPainel, k: Kit): any[] {
  const { Box, Text } = ui
  const al = d.alertas
  const v = al?.vista
  const papel = d.ex.papel
  const conj = papel === 'conjunto'
  // a set session before its first sweep has nothing read yet
  if (conj && !al?.sweep) return [k.cartaoEstado('carregando', 'varrendo o ledger…')]
  const lim = al?.limiares ?? LIMIARES_PADRAO
  const ritmoV = v?.ritmo ?? { checkpointMin: null, lockMin: null, amostras: 0 }
  const locks = v?.locks ?? []
  const orfaosN = locks.filter(l => l.orfao).length
  const caladas = (v?.unidades ?? []).filter(u => u.calada).length
  const cob = cobrancas(d)
  const out: any[] = []
  if (al?.sweep?.semLeitura) out.push(k.quadro('falha', [<Text>⚠️</Text>, <Text color="warning">varredura sem leitura</Text>], { cor: 'warning' }))
  // R53: the bell counts these; here each one says why
  if (papel === 'orquestrador') {
    semConfirmacao(d.envios, d.agora).forEach((e, i) =>
      out.push(k.quadro(`sc-${i}`, [<Text color="error" wrap="truncate-end">{`🔴 diretiva sem confirmação: ${e.acao} ${e.alvo}`}</Text>], { cor: 'error' })),
    )
  }
  out.push(
    ...k.filas('lk', [
      k.kpi('lk-1', '🔒', String(locks.length), 'recursos em uso'),
      orfaosN ? k.kpi('lk-2', '🧟', String(orfaosN), 'lock órfão', 'error') : k.kpi('lk-2', '✅', '0', 'nenhum lock órfão'),
      caladas ? k.kpi('lk-3', '🔇', String(caladas), 'sessão calada', 'error') : k.kpi('lk-3', '📡', '0', 'todas dando sinal'),
    ], 18),
  )
  out.push(k.titulo('recursos'))
  if (!locks.length) out.push(k.cartaoEstado('vazio', 'Nenhum lock aberto.'))
  const c = cortar(locks, MAX_LOCKS)
  c.linhas.forEach((l, i) => {
    const desde = Date.parse(l.desde)
    out.push(
      k.quadro(`l-${i}`, [
        <Box flexDirection="row" gap="sm" alignItems="center">
          <Text>{EMOJI_LOCK[l.kind] ?? '🔒'}</Text>
          <Text bold wrap="truncate-end">{l.resource}</Text>
          <Text size="footnote" color="subtle">{l.kind}</Text>
          <Box flexGrow={1} />
          {k.dono(l.spec)}
        </Box>,
        <Box flexDirection="row">
          <Box flexGrow={1} width={0}>
            {k.sv(barraTempoDicaM(l.minutos / Math.max(1, lim.lockOrfao), `${l.spec} segura desde ${Number.isFinite(desde) ? hhmm(desde) : '?'} · vira órfão aos ${lim.lockOrfao} min`), 'tempo segurado', 0, 8, '')}
          </Box>
        </Box>,
        l.orfao ? <Text color="error">{`${l.minutos} min sem RELEASE${cob.get(`lock:${l.spec}:${l.kind}:${l.resource}:${l.desde}`) ? ` · o orquestrador cobrou às ${hhmm(cob.get(`lock:${l.spec}:${l.kind}:${l.resource}:${l.desde}`)!.at)}` : ''}`}</Text> : <Text size="footnote" color="subtle">{`segura há ${l.minutos} min`}</Text>,
        l.espera?.length ? <Text size="footnote" color="subtle">{`espera ${l.espera.join(' › ')}`}</Text> : null,
      ], l.orfao ? { cor: 'error', fundo: 'diffRemovedDimmed' } : {}),
    )
  })
  if (c.mais > 0) out.push(<Text key="mais" size="footnote" color="subtle">{`mais ${c.mais}`}</Text>)
  if (v?.slots) {
    out.push(k.titulo('filas da orquestradora'))
    for (const kind of ['verify', 'producao'] as const) {
      const s = v.slots[kind]
      const m = s.dono ? Math.floor((d.agora - Date.parse(s.dono.desde)) / 60_000) : 0
      out.push(
        k.quadro(`s-${kind}`, [
          <Text bold>{s.dono ? `${kind}  ${s.dono.conjunto}  ${m} min` : `${kind}  livre`}</Text>,
          s.fila.length ? <Text size="footnote" color="subtle">{`fila: ${s.fila.map(f => f.conjunto).join(' › ')}`}</Text> : null,
        ]),
      )
    }
  }
  out.push(k.titulo('sinais das sessões'))
  if (!v?.unidades?.length) out.push(<Text key="sinais-vazio" size="footnote" color="subtle">📡 nenhuma sessão vista ainda</Text>)
  {
    // the newest delivered status request for this unit's quiet alert
    const askedAt = (unidade: string): number | null => {
      let t: number | null = null
      for (const a of al?.lista ?? []) {
        const e = cob.get(a.chave)
        if (e && a.chave.startsWith('calado:') && e.alvo === unidade.toUpperCase() && (t === null || e.at > t)) t = e.at
      }
      return t
    }
    for (const u of v?.unidades ?? []) {
      out.push(
        k.quadro(`u-${u.unidade}`, [
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Box flexGrow={1} width={0}>
              <Text wrap="truncate-end">{`${u.unidade}  sem sinal há ${u.minutos} min`}</Text>
            </Box>
            {u.calada ? k.chip('calada', 'ruim') : k.chip('ok', 'ok')}
          </Box>,
          askedAt(u.unidade) ? <Text size="footnote" color="subtle">{`o orquestrador pediu status às ${hhmm(askedAt(u.unidade)!)}`}</Text> : null,
        ], u.calada ? { cor: 'error' } : {}),
      )
    }
  }
  const normal = (n: number | null) => (n === null ? '—' : String(Math.round(n)))
  out.push(k.titulo('limiares'))
  out.push(
    k.quadro('lim', [
      ...k.filas('lim', [
        k.fato('lim-c', 'calada', `${lim.calado} min · seu normal ${normal(ritmoV.checkpointMin)}`),
        k.fato('lim-o', 'órfão', `${lim.lockOrfao} min · seu normal ${normal(ritmoV.lockMin)}`),
      ], 18),
      <Text size="footnote" color="subtle">{textoLimiares(lim, ritmoV)}</Text>,
      papel === 'orquestrador' && v?.proposta ? k.botao({ key: 'usar-medido', onPress: d.acoes.usarMedido, children: 'usar o medido' }) : null,
    ]),
  )
  if (conj && v?.espelhadoEm) out.push(<Text key="espelho" size="footnote" color="subtle">{`🔁 espelhado no planejamento há ${Math.max(0, Math.round((d.agora - v.espelhadoEm) / 1000))} s`}</Text>)
  return out
}

/** The pane `novarc-maestro` (R8): brand header, mode strip, section bands, tabs and the tab body, from state alone. */
function painelArvore(ui: any, d: DadosPainel): any {
  const { Box, Text } = ui
  const k = kit(ui, d.larg, d.superficie)
  const papel = d.ex.papel
  const orq = papel === 'orquestrador'
  const unidade = papel === 'conjunto' || papel === 'spec'
  const ABAS = [
    { k: 'agora', rotulo: '🕒 Agora', tecla: 1 },
    { k: 'execucao', rotulo: '▶️ Execução', tecla: 2 },
    { k: 'locks', rotulo: '🔒 Locks e filas', tecla: 3, conta: (d.alertas?.vista?.locks ?? []).filter(l => l.orfao).length },
    ...(orq ? [{ k: 'pendencias', rotulo: '📌 Pendências', tecla: 4, conta: rotuloAba(d.pendencias) }] : []),
    ...(orq ? [{ k: 'inteligencia', rotulo: '📊 Inteligência', tecla: 5 }] : []),
  ]
  // a stored tab this role does not draw (Pendências in a set session) draws Agora
  const aba = ABAS.some(a => a.k === d.aba) ? d.aba : 'agora'
  const foco = papel === 'conjunto' ? `foco: conjunto ${d.ex.conjunto ?? '?'}` : papel === 'spec' ? `foco: spec ${d.ex.spec ?? '?'}` : `${d.projeto} · toda a execução`
  const sino = d.sino
  const rotuloSino = unidade ? `🔔 ${sino}` : sino === 0 ? '🔔 sem alertas' : `🔔 ${sino} ${sino === 1 ? 'alerta' : 'alertas'}`
  const faixaModo = (
    <Box key="modo" flexDirection="row" gap="sm" alignItems="center" paddingX="md" paddingY="sm">
      <Text size="caption" color="subtle">MODO</Text>
      <Text color="promptBorder">│</Text>
      {k.chip(unidade ? 'manual · definido na orquestradora' : 'modo manual', 'neutro')}
      <Box flexGrow={1} />
      {k.botao({ key: 'sino', primario: sino > 0, onPress: d.acoes.sino, children: rotuloSino })}
    </Box>
  )
  const rotuloAtual = ABAS.find(a => a.k === aba)!.rotulo
  const trilha = `${d.projeto} › ${rotuloAtual}${aba === 'execucao' && unidade && d.ex.conjunto ? ` › ${d.ex.conjunto}` : ''}`
  const l = d.leitura
  const aoVivo = !l.falhou && l.at !== null
  const direita = l.falhas.planejamento
    ? '⚠️ sem conexão com o planejamento'
    : l.falhas.registro
      ? '⚠️ registro não lido'
      : l.at === null
        ? '⏳ lendo…'
        : `ao vivo · atualizado há ${haQuanto(d.agora - l.at)}`
  const corpo = d.tentando ? [k.cartaoEstado('carregando', 'lendo o planejamento…')] : corpoAba(ui, k, d, aba)
  return (
    <Box flexDirection="column">
      {k.cabecalho(foco, sino)}
      {faixaModo}
      {k.secao('d1', '🧭 seções', `1 a ${ABAS[ABAS.length - 1]!.tecla} trocam de aba com o painel em foco`)}
      <Box key="linha-abas" paddingX="md" paddingY="sm">{k.abas(ABAS, aba, d.acoes.aba)}</Box>
      {k.secao('d2', trilha, direita, aoVivo)}
      <Box key="corpo" flexDirection="column" gap="md" paddingX="md" paddingY="md">{corpo}</Box>
    </Box>
  )
}

/** `<s> s` under a minute, `<m> min` from a minute (R12). */
export function haQuanto(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min`
}

const hhmm = (t: number) => {
  const x = new Date(t)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}
const ESTADO: Record<string, 'd' | 'n' | 'b' | ''> = { feito: 'd', agora: 'n', travado: 'b', vazio: '' }

/** One lane as a row of the lanes table: ids, step names and times only (R50). */
function linhaTabela(r: Raia, calado: number): LinhaTrilha {
  return {
    nome: r.rotulo ?? r.slug,
    feitos: 0,
    atual: null,
    estados: r.celulas.map(c => ESTADO[c] ?? ''),
    idade: r.minutos === null ? '—' : `${r.minutos} min`,
    ruim: r.minutos !== null && r.minutos >= calado && r.ultimo !== 'DONE',
    dicas: (r.inicios ?? []).map(t => (t === null ? ['ainda não começou'] : [`entrou ${hhmm(t)}`])),
  }
}

function corpoAba(ui: any, k: Kit, d: DadosPainel, aba: string): any[] {
  const { Box, Text } = ui
  const orq = d.ex.papel === 'orquestrador'
  const lista = d.alertas?.lista ?? []
  if (aba === 'pendencias') {
    if (!d.pendencias && d.leitura.falhas.planejamento) return [k.cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', d.acoes.tentar)]
    return abaPendencias(ui, d.pendencias, d.vista, d.temArtefato, d.agora, d.acoes.pend, k)
  }
  if (aba === 'inteligencia') {
    try {
      return abaInteligencia(ui, k, d.acervoSync, d.cliente, d.agora, { abrirAcervo: d.acoes.abrirAcervo, abrirLinha: d.acoes.abrirLinha })
    } catch (err) {
      return [k.cartaoEstado('erro', `acervo não conseguiu desenhar: ${err}`, d.acoes.tentar)]
    }
  }
  if (aba === 'locks') return abaLocks(ui, d, k)
  if (aba === 'execucao') {
    // only this session's run: another run's lanes live in that run's own orchestrator session
    const blocos = orq ? raiasPorConjunto(daMinhaExecucao(d.outras ?? [], d.eu), d.porDir, d.agora, d.titulos) : []
    const proprias = Object.values(d.ex.forks).map(f => raia(f, d.agora))
    const ls = orq ? [] : d.linhas
    const c0 = d.ex.conjunto ?? 'esta sessão'
    const fontes = orq ? blocos : proprias.length ? [{ conjunto: c0, titulo: d.titulos[c0] ?? '', raias: proprias }] : []
    // C05-S01 (R35): one card per set, the selected set's lanes in one detail card
    const cs = conjuntosDaAba(fontes, orq ? d.notas : notasOrq([]), orq ? d.gos : {}, orq ? daMinhaExecucao(d.outras ?? [], d.eu) : [], d.dependeDe, d.titulos, d.agora)
    const todas = cs.flatMap(c => c.raias)
    const vazio = todas.length === 0 && ls.length === 0 && cs.every(c => c.estado === 'normal')
    if (vazio && d.leitura.falhas.planejamento && !d.temBanco) return [k.cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', d.acoes.tentar)]
    const feitas = todas.filter(r => r.celulas[r.celulas.length - 1] === 'feito').length
    const vivas = daMinhaExecucao(d.outras ?? [], d.eu).filter(r => r.papel === 'spec' && vivo(r, d.agora)).length
    const nVazias = cs.filter(c => c.estado === 'vazia').length
    // R52: every open alert already chased by the orchestrator
    const cob = cobrancas(d)
    const cobertos = lista.length > 0 && lista.every(a => cob.has(a.chave))
    const nLocks = lista.filter(a => a.chave.startsWith('lock:')).length
    const nOutros = lista.length - nLocks
    const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5)
    // R26, R34: one row per spec session of the set from the map, the opened-in-your-turn line, the cards proposed
    const sessoes = (C: string): any[] => {
      const ss = Object.entries(d.mapa.specs).filter(([, s]) => s.conjunto === C && s.nome).sort(([a], [b]) => a.localeCompare(b))
      const cartoes = d.notas.cartoes.filter(c => c.conjunto === C)
      return ss.length || cartoes.length
        ? [
            k.titulo('sessões'),
            ...ss.map(([id, s]) => <Text key={`ss-${id}`} mono size="footnote">{`🔹 ${s.nome}`}</Text>),
            <Text key={`ss-fim-${C}`} size="footnote" color="subtle">abertas no seu turno · endereços restaurados após compactação</Text>,
            ...cartoes.map((c, i) => (
              <Text key={`ss-cartao-${C}-${i}`} size="footnote" color="subtle">{`${hhmm(c.at)} cartão proposto: ${c.id} (clique equivale a colar o prompt)${c.fechamento ? ' com fechamento' : ''}`}</Text>
            )),
          ]
        : []
    }
    const out: any[] = [
      ...k.filas('exk', [
        k.kpi('exk-1', '🏁', `${feitas}/${todas.length}`, 'specs em DONE'),
        nVazias ? k.kpi('exk-2', '⏳', String(nVazias), 'aguardando GO') : k.kpi('exk-2', '🧵', String(vivas), 'sessões de spec vivas'),
        lista.length ? k.kpi('exk-3', '🚨', String(lista.length), cobertos ? `${nLocks} ${nLocks === 1 ? 'lock órfão' : 'locks órfãos'} e ${nOutros} ${nOutros === 1 ? 'bloqueio' : 'bloqueios'} · já cobrados` : 'pede atenção', 'error') : k.kpi('exk-3', '✅', '0', 'nada exige você agora'),
      ], 18),
    ]
    if (!orq) out.push(<Text key="ledger" size="footnote" color="subtle">{d.ex.ledgerDir ? `ledger ${d.ex.ledgerDir}` : 'ledger ainda não visto nesta sessão'}</Text>)
    if (vazio) out.push(k.cartaoEstado('vazio', 'Nenhuma sessão de spec vista ainda.'))
    const calado = d.alertas?.limiares.calado ?? LIMIARES_PADRAO.calado
    const cabecalho = (
      <Box flexDirection="row">
        {TRILHA.map(t => (
          <Box key={`h-${t}`} width={COLUNA} flexShrink={0}>
            <Text color="subtle">{t.toLowerCase()}</Text>
          </Box>
        ))}
      </Box>
    )
    const lane = (r: Raia, key: string) => (
      <Box key={`r-${key}-${r.slug}`} flexDirection="column">
        <Box flexDirection="row" gap="sm">
          <Text bold>{r.rotulo ?? r.slug}</Text>
          <Text color={r.minutos !== null && r.minutos >= calado && r.ultimo !== 'DONE' ? 'error' : 'subtle'}>{r.minutos === null ? 'sem eventos' : `há ${r.minutos} min · ${r.ultimo}`}</Text>
        </Box>
        <Box flexDirection="row">
          {r.celulas.map((c, i) => (
            <Box key={`c-${i}`} width={COLUNA} flexShrink={0}>
              <Text color={COR[c]}>{(c === 'vazio' ? '·' : (r.rotulos[i] ?? '')).slice(0, 8)}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
    const largTabela = k.W - 40
    // desktop: one interactive table per 10 lanes (R14, R46); terminal: the fixed-width text cells of C01
    const raias = (rs: Raia[], key: string, alt: string) =>
      k.temSvg
        ? Array.from({ length: Math.ceil(rs.length / 10) }, (_, i) => rs.slice(i * 10, i * 10 + 10)).map((pedaco, i) => (
            <Box key={`t-${key}-${i}`}>{k.sv(tabelaTrilhasM(largTabela, pedaco.map(r => linhaTabela(r, calado))), alt, largTabela, alturaTabela(pedaco.length), '', true)}</Box>
          ))
        : [rs.length > 0 ? cabecalho : null, ...rs.map(r => lane(r, key))]
    if (cs.length) {
      const ids = cs.map(c => c.id)
      const sel = d.sel && ids.includes(d.sel) ? d.sel : ids.includes('C01') ? 'C01' : ids[0]!
      const ST: Record<string, 'd' | 'w' | 'b' | ''> = { feito: 'd', agora: 'w', travado: 'b', vazio: '' }
      // card previews: at most MAX_RAIAS progress rows across all cards, in id order
      let resta = MAX_RAIAS
      let foraCards = 0
      const cards = cs.map(c => {
        const fica = c.raias.slice(0, Math.max(0, resta))
        resta -= fica.length
        foraCards += c.raias.length - fica.length
        const prontas = c.raias.filter(r => r.celulas[r.celulas.length - 1] === 'feito').length
        const emoji = c.estado === 'cancelado' ? '🚫' : c.estado === 'vazia' ? '⏸️' : c.raias.some(r => r.celulas.includes('travado')) ? '🔴' : c.raias.length && prontas === c.raias.length ? '✅' : c.raias.length || c.estado === 'go' ? '🟠' : '⚪'
        const etapa = c.estado === 'cancelado' ? `cancelado${c.motivo ? ` · ${c.motivo}` : ''}` : c.estado === 'vazia' ? 'aberta vazia · aguardando GO' : c.estado === 'go' && !c.raias.length ? 'GO com brief atual' : c.raias.length ? `${prontas}/${c.raias.length} specs em DONE` : 'nenhuma sessão de spec vista'
        return k.quadro(`cj-${c.id}`, [
          <Box flexDirection="row" gap="sm" alignItems="center">
            {k.botao({ key: `sel-${c.id}`, primario: c.id === sel, onPress: d.acoes.selConjunto(c.id), children: c.id })}
            <Box flexGrow={1} width={0}><Text size="footnote" color="subtle" wrap="truncate-end">{c.titulo}</Text></Box>
            {c.estado === 'cancelado' ? k.chip('cancelado', 'ruim') : null}
            <Text>{emoji}</Text>
          </Box>,
          ...fica.map(r => {
            const rot = String(r.rotulo ?? r.slug)
            const curto = rot.match(/S\d{2}$/i)?.[0]?.toUpperCase() ?? rot.slice(0, 8)
            const st = r.celulas.map(x => ST[x] ?? '')
            const n = st.filter(x => x === 'd').length
            return (
              <Box key={`cj-${c.id}-${r.slug}`} flexDirection="row" gap="sm" alignItems="center">
                <Box width={4}><Text size="caption" mono color="subtle">{curto}</Text></Box>
                <Box flexGrow={1} width={0}>{k.sv(barraSegmentosM(st), `${c.id} ${curto} ${n}/${st.length} etapas`, 0, 6, `${'▮'.repeat(n)}${'·'.repeat(st.length - n)}`)}</Box>
              </Box>
            )
          }),
          <Box flexDirection="row" gap="sm">
            <Box flexGrow={1} width={0}><Text size="footnote" wrap="truncate-end">{etapa}</Text></Box>
            {c.estado === 'vazia' && c.apos.length ? <Text size="footnote" mono color="subtle">{`após ${c.apos.join(', ')}`}</Text> : null}
          </Box>,
        ], { faixa: COR_CONJ[c.id] ?? 'promptBorder', grow: true })
      })
      out.push(k.titulo('conjuntos'), ...k.filas('cj', cards, 18))
      if (foraCards > 0) out.push(<Text key="mais-cj" size="footnote" color="subtle">{`mais ${foraCards}`}</Text>)
      // the detail card of the selected set: its own lanes cut on their own, the brief box, the sessões block
      const c = cs.find(x => x.id === sel)!
      const det = c.raias.slice(0, MAX_RAIAS)
      const go = d.gos[c.id]
      const Code = ui.Code
      const caixa =
        c.estado === 'vazia'
          ? k.quadro('brf', [
              <Box flexDirection="row" gap="sm" alignItems="center"><Text>⏸️</Text><Text bold>Sessão aberta vazia · aguardando GO</Text></Box>,
              <Text size="footnote" color="subtle">{`"você é a sessão do conjunto ${c.id} da execução ${d.projeto}; aguarde o GO; não leia specs nem crie branch antes dele"`}</Text>,
              <Text size="footnote" color="subtle">nada de spec, contexto ou branch carregado, então nada fica velho</Text>,
            ], { cor: 'promptBorder' })
          : c.estado === 'go'
            ? k.quadro('brf', [
                <Box flexDirection="row" gap="sm" alignItems="center"><Text>📨</Text><Text bold>{`Brief entregue no GO · ${hhmm(go?.at ?? d.notas.gos[c.id]?.at ?? d.agora)}`}</Text></Box>,
                <Text size="footnote" color="subtle">{`specs no commit ${go?.sha || d.notas.gos[c.id]?.sha || '?'}${c.apos.length ? `, relidas depois que o session-plan aplicou o que o ${c.apos.join(', ')} mudou` : ''}`}</Text>,
                ...(go?.atualizadas ?? []).map((t, i) => <Box key={`go-p-${i}`}>{k.chip(t, 'ok')}</Box>),
                go ? <Text size="footnote" color="subtle">{`DECISIONS.md com ${go.decisoesNovas} ${go.decisoesNovas === 1 ? 'decisão nova' : 'decisões novas'}${go.merges?.length ? ` · merges desde o início: ${go.merges.join(', ')}` : ''}`}</Text> : null,
                ...(go?.branches.length
                  ? k.temSvg && Code
                    ? [<Code key="go-branch" source={go.branches.join('\n')} language="bash" />]
                    : go.branches.map((b, i) => <Text key={`go-b-${i}`} mono size="footnote">{b}</Text>)
                  : []),
              ], { cor: 'success' })
            : null
      out.push(
        k.titulo(`detalhe · ${c.id}`),
        k.quadro('det', [
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Text bold>{c.titulo ? `${c.id} · ${c.titulo}` : c.id}</Text>
            {c.estado === 'vazia' ? k.chip('aguardando GO', 'neutro') : c.estado === 'cancelado' ? k.chip('cancelado', 'ruim') : null}
          </Box>,
          det.length ? k.titulo('specs · etapas do session-build · passe o mouse nas etapas') : null,
          ...raias(det, 'det', `etapas das specs de ${c.id}`),
          c.raias.length > det.length ? <Text key="mais-det" size="footnote" color="subtle">{`mais ${c.raias.length - det.length}`}</Text> : null,
          caixa,
          ...(d.posse ?? []).map(p => caixaPosse(ui, k, p)),
          ...sessoes(c.id),
        ], { faixa: COR_CONJ[c.id] ?? 'promptBorder' }),
      )
    }
    if (ls.length) {
      out.push(k.titulo('conjuntos do planejamento'))
      out.push(k.quadro('pl', ls.map(x => <Text>{x}</Text>)))
    }
    return out
  }
  // Agora
  if (d.outras === null) return [k.cartaoEstado('carregando', 'lendo o registro…')]
  const cartoes = cartoesAgora(d.outras, d.eu)
  if (!cartoes.length) return [k.cartaoEstado('vazio', 'Nenhuma execução ativa na máquina.'), ...(d.ex.papel === 'orquestrador' ? secaoFamilia(ui, k, d.familia ?? null) : [])]
  const atencao = cartoes.filter(c => c.alerta).length
  const tom = (c: (typeof cartoes)[number]): Tom => (c.alerta ? 'ruim' : c.papel === 'esta sessão' ? 'info' : c.papel === 'parado' ? 'neutro' : 'ok')
  return [
    ...k.filas('agk', [
      k.kpi('agk-1', '🖥️', String(cartoes.length), 'execuções na máquina'),
      atencao ? k.kpi('agk-2', '🚨', String(atencao), 'pede atenção', 'error') : k.kpi('agk-2', '✅', '0', 'nada pede atenção'),
      k.kpi('agk-3', '🧵', String(d.outras.length), 'sessões vivas'),
    ], 18),
    k.titulo('execuções'),
    ...cartoes.map(c =>
      k.quadro(`c-${c.chave}`, [
        <Box flexDirection="row" gap="sm" alignItems="center">
          <Text>{c.papel === 'parado' ? '💤' : c.linha.startsWith('orquestradora') ? '🎼' : '🧩'}</Text>
          <Box flexDirection="column" flexGrow={1} width={0}>
            <Text bold wrap="truncate-end">{c.titulo}</Text>
            <Text size="footnote" color="subtle" wrap="truncate-end">{c.linha}</Text>
          </Box>
          {k.chip(c.papel, tom(c))}
        </Box>,
        c.alerta ? <Text color="error">{c.alerta}</Text> : null,
        c.meu ? k.botao({ key: 'abrir', primario: true, onPress: d.acoes.abrir, children: 'abrir execução' }) : null,
      ], { cor: c.alerta ? 'error' : 'promptBorder' }),
    ),
    ...(d.ex.papel === 'orquestrador' ? secaoFamilia(ui, k, d.familia ?? null) : []),
    <Text key="registro" size="footnote" color="subtle">{`📄 registro: ${d.onde === 'store' ? 'store do plugin' : '~/.claude/maestro/sessoes'} · ${d.outras.length} sessões vivas · branch lida do git`}</Text>,
  ]
}

/** C05-S02 (R16): each spec lane of this set session and its phase row, from the folded run and the DONE-ACEITO copy. */
function posseDoConjunto(ex: Execucao): NonNullable<DadosPainel['posse']> {
  const ac = aceitos(aceitosLidos?.eventos ?? [])
  return Object.values(ex.forks)
    .filter(f => f.spec)
    .sort((a, b) => a.spec!.localeCompare(b.spec!))
    .map(f => {
      const ready = f.eventos.some(e => e.tipo === 'READY')
      return { spec: f.spec!.toUpperCase(), titulo: `novarc-${ex.codigo ?? ''}-${f.spec!.toUpperCase()}`, fase: posseDaSpec({ iniciado: true, ready, aceito: !!ac[f.slug]?.aceito }) }
    })
}

/** C05-S02 (R16, R26): the `quem grava specs/<spec> agora` caixa card, the current owner's label in `claude`. */
function caixaPosse(ui: any, k: Kit, p: NonNullable<DadosPainel['posse']>[number]): any {
  const { Box, Text } = ui
  const qi = (key: string, rotulo: string, quem: string, atual: boolean) => (
    <Box key={key} flexDirection="row" justifyContent="space-between" gap="sm">
      <Text wrap="truncate-end">{rotulo}</Text>
      <Text size="footnote" weight="medium" color={atual ? 'claude' : 'subtle'}>{quem}</Text>
    </Box>
  )
  const linhas =
    p.fase === 'antes'
      ? [qi('carga', 'carga: reserva, revisão, iniciado', 'ainda não', false)]
      : [
          qi('carga', 'carga: reserva, revisão, iniciado', 'esta sessão', p.fase === 'carga'),
          qi('build', 'READY até DONE: plano aprovado, implementando, branch publicada', p.fase === 'build' ? `${p.titulo} · agora` : p.titulo, p.fase === 'build'),
          qi('fecha', 'fechamento: PR aberto, merge', 'esta sessão', p.fase === 'fechamento'),
        ]
  return k.caixa(`posse-${p.spec}`, `quem grava specs/${p.spec} agora`, [
    ...linhas,
    <Text key="dica" size="footnote" color="subtle">MARCO do orquestrador chega aqui e é repassado à sessão da spec enquanto ela é dona</Text>,
  ], 'suggestion')
}

/** C05-S02 (R5, R25): the Agora section `sessões desta execução`, one row per family member, indented per level. */
function secaoFamilia(ui: any, k: Kit, f: Familia | null): any[] {
  const { Box, Text } = ui
  const dim = (key: string, t: string) => <Text key={key} size="footnote" color="subtle">{t}</Text>
  const corpo = !f
    ? [dim('fam-lendo', 'lendo a família…')]
    : !f.linhas.length
      ? [dim('fam-vazio', 'Nenhuma sessão desta execução no registro.')]
      : f.linhas.map(l => {
          let row = (
            <Box key={`fam-${l.chave}`} flexDirection="row" gap="sm" alignItems="center">
              <Text>{l.icone}</Text>
              <Box flexDirection="column" flexGrow={1} width={0}>
                <Text mono wrap="truncate-end">{l.titulo}</Text>
                {l.branch || l.abertaPor ? <Text size="footnote" color="subtle" wrap="truncate-end">{`${l.branch ?? '—'} · aberta por ${l.abertaPor ?? '—'}`}</Text> : null}
              </Box>
              {k.chip(l.papel, 'neutro')}
              {l.estado ? <Text size="footnote">{l.estado}</Text> : null}
            </Box>
          )
          for (let n = 0; n < l.nivel; n++) row = <Box key={`fam-${l.chave}-${n}`} paddingLeft="lg">{row}</Box>
          return row
        })
  return [
    k.titulo('sessões desta execução'),
    k.quadro('fam', [...corpo, ...(f?.fonte === 'registro' ? [dim('fam-reg', 'família do app não lida; árvore pelo registro desta máquina')] : [])]),
  ]
}


export const registerMaestro: Register = on => {

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    try {
      await $.command.register({ name: 'maestro', description: 'Painel de execução NOVARC ("orquestrar" na sessão orquestradora; "ativar" ou "desativar" a faixa)' })
    } catch {
      // no /maestro command: the band and the hooks still work
    }
    await iniciarSessao($, e.cwd)
    // R43: a pane this session had open comes back; on a reload no surface is attached yet (session.attach opens it)
    try {
      if ((await ler($, 'maestroPainelAberto')) && (await $.session.surfaces()).length) await abrirPainel($)
    } catch {
      // unplaced or refused: the person opens it
    }
    return r
  }).catch(($, e, next) => next(e))

  // R43: a reload runs session.start before the desktop re-attaches; the attach reopens the pane the person had open.
  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    try {
      if ((await ler($, 'maestroPainelAberto')) && !(await $.ui.panes()).some((x: { id: string }) => x.id === PANE)) await abrirPainel($)
    } catch {
      // no-surface or not placed: nothing to log, the next attach tries again
    }
    return r
  }).catch(($, e, next) => next(e))

  // R42: only the person's close forgets the pane; an unload or a plugin close keeps the flag. Never keeps it open.
  on('ui.close', async ($, e, next) => {
    try {
      if (e.id === PANE) await aoFecharPainel($, (e.origin as any)?.kind ?? e.origin)
    } catch {
      // the flag stays: at worst the pane reopens once
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The session ends (/clear included, which starts no new session.start): stop the loops, close the entry, forget it.
  // Local writes only: the end hook has one short wall-clock bound.
  on('session.end', async ($, e, next) => {
    // a /clear fires no session.start: a cwd in the never-list keeps the band off for the next session
    let modo: 'auto' | 'off' = 'auto'
    encerrando = true // before the cancel: a poll check in flight arms nothing until zerarSessao bumped the generation
    try {
      cancelarLoops()
      if (sessao) {
        await gravarExec($, { ...(await exec($)), papel: null })
        await registrar($)
        await $.store.delete(`maestro-sessao-${sessao}`)
      }
    } catch {
      // ending never waits on the registry
    }
    try {
      if (cwdSessao && (await nunca($)).includes(cwdSessao)) modo = 'off'
    } catch {
      // store unavailable: the next session's first hook reads the never-list again
    }
    try {
      await zerarSessao($, modo)
    } catch {
      // module variables are already reset; a state key left over is rewritten by the next session's first write
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'maestro' }, async ($, e) => {
    await garantirSessao($)
    const args = e.args.trim()
    if (args === 'desativar') {
      await $.state.set(MODO, 'off')
      cancelarLoops()
      return { text: 'Faixa do Maestro desligada nesta sessão.' }
    }
    if (args === 'ativar') await ativar($)
    if (args.startsWith('orquestrar')) {
      await orquestrar($, urlOrquestrar(args))
      await ligar($, 'orquestrador')
    }
    await atualizar($)
    await olharAgora($)
    await abrirPainel($)
    return { text: args.startsWith('orquestrar') ? 'Painel aberto; esta sessão acompanha a execução.' : 'Painel de execução aberto.' }
  }).catch(($, e, next) => (next.called ? next(e) : { text: 'Maestro: falhou' }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    // the engine hands on the caller's shape: the typed `command`, or `input.command` (seen from 2.1.308 callers)
    const cmd = String((e as any).command ?? (e as any).input?.command ?? '')
    // the dir a ledger.py call names is never "outside the worktree", known yet or not
    const ran = await guardaENext($, e, next, ctx => {
      const dir = chamadaLedger(cmd)?.dir
      return avaliarBash(cmd, dir ? { ...ctx, isentos: [...ctx.isentos, dir.replace(/\\/g, '/')] } : ctx)
    })
    if (ran?.deny === undefined) soltarLock(cmd) // an own APPLIED/RELEASE frees the lock even when the call errored
    if (ran?.deny !== undefined || ran?.isError) return ran
    // Fast path (R29): a command the Maestro does not follow returns before any $ call.
    if (!/ledger\.py|git\s+(push|checkout|switch|worktree)|gh\s+pr\s+create/.test(cmd)) return ran
    try {
      await garantirSessao($)
      const lg = chamadaLedger(cmd)
      if (lg) {
        // A fork's ledger call carries its agentId: that makes this session the orchestrator.
        // a --dir/--fork holding a shell variable arrives null: the known ledger dir stays, no lane is made from it
        await ligar($, e.agentId ? 'orquestrador' : lg.temFork ? 'spec' : 'conjunto', lg.dir)
        if (lg.fork && lg.tipo) await gravarExec($, anotar(await exec($), lg.fork, { tipo: lg.tipo, texto: lg.texto ?? '', at: Date.now() }, e.agentId))
        try {
          await lerDir($)
        } catch {
          // ledger dir not readable from here: lanes keep their state, the registry is still written
        }
        await registrar($)
        if (lg.script) scriptLedger = lg.script
        // a lock checkpoint schedules the debounced sweep; the hook never waits on it (R1, R30)
        if (/^(LOCK|RELEASE|APPLIED|DEPLOYED)$/.test(lg.tipo ?? '')) await marcarSujo($)
      }
      if (/\bgit\s+(checkout|switch|worktree)\b/.test(cmd)) {
        // the linked spec session's first act is `git switch -c <spec branch>`: that branch names its role
        await Promise.all([resolverGitdir($, cwdSessao), lerRaizERamo($, cwdSessao)])
        const branch = await lerBranch($)
        titulo = tituloDe(cwdSessao, branch)
        const pb = papelDaBranch(branch)
        if (pb) await ligar($, 'spec', null, { conjunto: pb.conjunto, spec: pb.spec })
        await registrar($)
      }
      const ctx = async () => ((await ler($, 'ctx')) ?? null) as Contexto | null
      const pushed = branchDoPush(cmd)
      const w = prCreate(cmd)
      if (pushed || w) {
        // Milestone work runs after the hook returned (A30): the agent never waits on the planning database.
        const g = geracao
        const pendente = carregando
        const texto = String(ran?.text ?? '')
        void (async () => {
          try {
            // right after a /clear the plan may still be loading in the background: wait for it here, never in the hook
            let c = await ctx()
            if (!c?.artefato || !c.plano) {
              await pendente
              if (velho(g)) return
              c = await ctx()
            }
            if (!c?.artefato || !c.plano) return
            const artefato = c.artefato
            const plano = c.plano as Plano
            // C05-S02: the fork and set ledgers are re-folded first, so a READY or DONE-ACEITO appended before this
            // command decides the owner (after the hook returned: R14)
            let ex = await exec($)
            try {
              ex = await lerDir($, ex)
            } catch {
              // ledger dir unreadable: the last folded run decides
            }
            // a push and a PR in one && chain write both, in milestone order (marco never moves an etapa back); each
            // half on its own, so a failed push half never skips the PR half
            try {
              const sp = pushed ? specDaBranch(pushed, plano) : null
              if (pushed && sp) {
                const sha = (await $.process.run(['git', 'rev-parse', pushed])).stdout.trim()
                await marcoDaFase($, artefato, ex, plano, sp, 'branch-publicada', { branch: pushed, headSha: sha }, sha)
              }
            } catch {
              // a failed milestone write never breaks the command; the skills reconcile from git and the ledger
            }
            try {
              const url = w ? urlDoPr(texto) : null
              if (w && url) {
                const i = w.indexOf('--head')
                const head = i >= 0 ? w[i + 1] : w.find(a => a.startsWith('--head='))?.slice(7)
                const branch = head || (await $.process.run(['git', 'branch', '--show-current'])).stdout.trim()
                const s = specDaBranch(branch, plano)
                if (s) await marcoDaFase($, artefato, ex, plano, s, 'pr-aberto', { pr: url }, url)
              }
            } catch {
              // same: the skills reconcile pr-aberto
            }
            if (!velho(g)) await atualizar($)
          } catch {
            // the context read failed: nothing to write
          }
        })()
      } else if (/\bgit\s+(checkout|switch)\b/.test(cmd)) {
        const c = await ctx()
        if (c?.artefato && c.plano) await atualizar($)
      }
    } catch {
      // a failed milestone write never breaks the command; the skills reconcile from git and the ledger
    }
    return ran
  }).catch(($, e, next) => next(e))

  // R4: Write and Edit on a ledger file are denied in a run; one rule for both tools.
  on('tool.call', { tool: 'Write' }, guardaArquivo).catch(($, e, next) => next(e))
  on('tool.call', { tool: 'Edit' }, guardaArquivo).catch(($, e, next) => next(e))

  // The orchestrator skill turns the view on by itself: no need to also run /maestro orquestrar.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    try {
      await garantirSessao($)
      const skill = String((e as any).skill ?? (e as any).input?.skill ?? '')
      const args = String((e as any).args ?? (e as any).input?.args ?? '')
      if (skill.endsWith('novarc-session-end')) sessionEndAtivo = true
      if (ehBuild(skill)) {
        const p = papelDoSkill(args)
        await ligar($, p.papel, null, { conjunto: p.conjunto, artefato: p.url }, { forcar: !!p.conjunto })
        const temDados = p.papel === 'orquestrador' || (await $.tool.list()).some((t: { name: string }) => t.name === 'ArtifactData')
        if (p.url && temDados && skill.endsWith('novarc-session-build')) {
          await carregar($, p.url, p.papel, p.conjunto ?? null)
          await atualizar($)
        }
      }
      await registrar($)
    } catch {
      // the view is a convenience: a failed read never breaks the skill
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A fork dispatched as "spec <slug>" makes this session the orchestrator and gives the lane its agentId.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    try {
      const slug = slugDoSpawn(e.description)
      if (slug) {
        await ligar($, 'orquestrador')
        const ex = await exec($)
        const f = ex.forks[slug] ?? { slug, eventos: [] }
        await gravarExec($, { ...ex, forks: { ...ex.forks, [slug]: { ...f, agentId: r.agentId ?? f.agentId } } })
        await registrar($)
      }
    } catch {
      // bookkeeping only
    }
    return r
  }).catch(($, e, next) => next(e))

  // Fork -> main checkpoint messages: the lane moves the moment the fork reports, before any ledger read.
  on('session.send', async ($, e, next) => {
    const r = await next(e)
    try {
      const cp = e.agentId ? checkpoint(e.text) : null
      if (cp) {
        const ex = await exec($)
        const slug = Object.values(ex.forks).find(f => f.agentId === e.agentId)?.slug ?? String(e.agentId)
        await gravarExec($, anotar(ex, slug, { tipo: cp.tipo, texto: cp.resto, at: Date.now() }, e.agentId))
        await registrar($)
      }
    } catch {
      // bookkeeping only
    }
    try {
      // C03-S01 (R29): a directive the main conversation's model delivered in the orchestrator or a set session is
      // audited; a plugin send is audited by its sender, a subagent's message is a fork checkpoint, not a directive
      const linha = String(e.text ?? '').trim().split(/\r?\n/)[0]!
      const [token, segundo] = linha.split(/\s+/)
      if (r?.isDelivered && e.origin?.kind === 'model' && !e.agentId && DIRETIVAS.has(token!)) {
        const papel = (await execAtual($)).papel
        const goInicio = linha.match(/^GO (C\d{2}) inicio \S+/)
        if (papel === 'orquestrador' && goInicio) await guardarGo($, goInicio[1]!, String(e.text ?? '')) // C05-S01 (R25)
        if (papel === 'orquestrador' || papel === 'conjunto') {
          const alvo = String(segundo ?? '').replace(/\?$/, '')
          const acao = token === 'status' ? 'STATUS-PEDIDO' : token!
          const motivo = 'Diretiva enviada pelo agente'
          const limpa = linha.replace(/local_[0-9A-Za-z-]+/g, 'local_…') // A10: no session id in a text field
          // off the hook path: in the orchestrator a line the mod would send takes its key, else the observed row
          void (async () => {
            if (papel === 'orquestrador' && (await registrarDoAgente($, linha))) return
            await auditar($, { acao, alvo: alvo.includes('local_') ? '' : (idDaBranch(alvo) ?? alvo), motivo, regra: regraDaDiretiva(linha), linha: limpa, origem: 'agente' })
          })().catch(() => {})
        }
      }
    } catch {
      // the send already happened; the audit is bookkeeping
    }
    return r
  }).catch(($, e, next) => next(e))

  // C03-S01 (R24, R30): an opened session goes into the address map and the audit; a card (own_initiative) opens nothing.
  // Observer only: after next, never alters, retries or opens a start.
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran?.deny !== undefined || ran?.isError) return ran
    try {
      const papel = (await execAtual($)).papel
      if (papel !== 'orquestrador' && papel !== 'conjunto') return ran
      const x = e as any
      const ent = entradaMapa({ name: x.name ?? x.input?.name, initiation: x.initiation ?? x.input?.initiation, prompt: x.prompt ?? x.input?.prompt }, String(ran?.text ?? ''))
      if (!ent) return ran
      mudarMapa($, m => noMapa(m, ent))
      void auditar($, { acao: 'SESSAO', alvo: ent.nome, motivo: 'Sessão aberta pelo agente', regra: 'd-trava-abrir-sessao', linha: null, origem: 'agente' }).catch(() => {})
    } catch {
      // the start already happened; the map and the audit are bookkeeping
    }
    return ran
  }).catch(($, e, next) => next(e))

  // The spec brief's `session name:` line, or a session-build invocation, typed or sent by a person, names the role.
  // Only user-turn origins count (R4/R5): a peer message, a meta prompt or a plugin never sets it.
  on('prompt.submit', async ($, e, next) => {
    await garantirSessao($)
    const doUsuario = !e.isMeta && ['composer', 'bridge', 'sdk'].includes(e.origin?.kind)
    // R6: `/novarc-session-end` typed by the person lets the close-out's PR, merge and deletion through
    if (doUsuario && String(e.command?.name ?? '').endsWith('novarc-session-end')) sessionEndAtivo = true
    if (papelConhecido) return next(e)
    try {
      const p = doUsuario && !(await exec($)).papel ? papelDoPrompt(e.text) : null
      if (p?.aguardandoGo) {
        // C05-S01: a minimal brief: role and wait only, no plan read before the GO (R10)
        await ligar($, p.papel, null, { codigo: p.codigo, conjunto: p.conjunto, spec: p.spec, artefato: p.url })
        await gravarExec($, { ...(await exec($)), aguardandoGo: true })
        await registrar($)
      } else if (p) {
        await ligar($, p.papel, null, { codigo: p.codigo, conjunto: p.conjunto, spec: p.spec, artefato: p.url })
        if (p.url && (p.papel === 'orquestrador' || (await $.tool.list()).some((t: { name: string }) => t.name === 'ArtifactData'))) {
          await carregar($, p.url, p.papel === 'orquestrador' ? 'orquestrador' : 'conjunto', p.conjunto ?? null)
        }
        await registrar($)
      }
    } catch {
      // bookkeeping only
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Peer lines: a set session's lanes move by the spec ids in the text; the orchestrator keeps each set's last report.
  on('session.receive', async ($, e, next) => {
    try {
      await garantirSessao($)
      if (e.origin.kind === 'peer' || e.origin.kind === 'peer-send-message') {
        let ex = await exec($)
        const texto = String(e.text ?? '').trim()
        if ((ex.papel === 'conjunto' || ex.papel === 'spec') && ex.aguardandoGo && limpaAguardo(texto)) {
          ex = { ...ex, aguardandoGo: false } // C05-S01 (R31); the writes below start from it
          await gravarExec($, ex)
          await registrar($)
        }
        // R37: a received directive refreshes the db reads at once (Task 8); the routing runs off the hook path
        if ((ex.papel === 'conjunto' || ex.papel === 'spec') && /^(GO|HOLD|LIBERA|LOCK|RELEASE)\b/.test(texto)) void refrescarBanco($).catch(() => {})
        if (ex.papel === 'conjunto' && /^(GO|status) /.test(texto)) void encaminhar($, texto, 0).catch(() => {})
        if (ex.papel === 'conjunto') {
          const cp = checkpoint(e.text)
          const lane = cp ? laneDaMensagem(ex, e.text) : null
          if (cp && lane) {
            await gravarExec($, anotar(ex, lane, { tipo: cp.tipo, texto: cp.resto, at: Date.now() }))
            await registrar($)
            await marcarSujo($) // a spec session's checkpoint sweeps even when this agent never calls ledger.py (R1)
          }
        } else if (ex.papel === 'spec') {
          // `GO <own slug> <kind> <resource>` relayed by the set session grants the lock the migration warning checks
          const go = String(e.text).match(/^GO\s+(\S+)\s+(\S+)/)
          const meu = (ex.spec ?? '').toLowerCase()
          const slug = go?.[1]!.toLowerCase() ?? ''
          if (go && meu && (slug === meu || slug.startsWith(`${meu}-`)) && KINDS_LOCK.has(go[2]!)) locksConcedidos.add(go[2]!)
        } else if (ex.papel === 'orquestrador') {
          const lc = linhaConjunto(e.text)
          if (lc) {
            // C03-S01: a report keeps the set's stage (it is no stage) and only moves its quiet clock; it goes to the nudge
            const relato = lc.etapa === 'manifestos' || lc.etapa === 'release'
            const antes = ex.conjuntos?.[lc.conjunto]
            const novo = relato ? { etapa: antes?.etapa ?? '', texto: antes?.texto ?? '', at: Date.now() } : { etapa: lc.etapa, texto: lc.resto, at: Date.now() }
            if (relato) receberRelato($, String(e.text).split(/\r?\n/)[0]!.trim())
            await gravarExec($, { ...ex, conjuntos: { ...ex.conjuntos, [lc.conjunto]: novo } })
            await registrar($)
          }
        }
      }
    } catch {
      // bookkeeping only
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // ---- C11-S01: the NovArc tool, group and working rows, in every session with the plugin (d-logo-todas-sessoes).
  // They touch no data (R49): only the props the app passed for that row.
  const primeira = (v: unknown) => String(v ?? '').split(/\r?\n/)[0]!
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const ui = $.ui.resolve(e) as any
    const p = e.props as any
    // a call being prepared (its input still streaming) is not running yet but has no result either: ours too
    const andamento = p.isRunning || (p.output === undefined && !p.isErrored && !p.isInterrupted)
    if (e.surface === 'terminal' || !ui.Svg || !andamento) return next(e)
    const inp = (p.input ?? {}) as Record<string, unknown>
    return kit(ui, 60, e.surface).linhaFerramenta(String(p.tool), primeira(inp.description ?? inp.file_path ?? inp.pattern ?? inp.command ?? inp.url ?? inp.prompt))
  }).catch(($, e, next) => next(e))

  // A guarded call's result: the guard's reason as a card (Task 3 of C03-S01). Unrecorded ids and the expanded view stay native.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const p = e.props as any
    const g = guardados.get(String(p.tool_use_id ?? e.requestId))
    if (!g || p.isExpanded) return next(e)
    const ui = $.ui.resolve(e) as any
    const k = kit(ui, 60, e.surface)
    if (g.nivel === 'bloqueia') return k.bloqueio('guarda', g.texto.replace(/^Bloqueado pelo Maestro\. /, ''))
    const o = p.output
    const linha = primeira(typeof o === 'string' ? o : o?.stdout)
    return (
      <ui.Box flexDirection="column" gap="xs">
        {linha ? <ui.Text color="subtle">{`⎿ ${linha}`}</ui.Text> : null}
        {k.aviso('guarda', g.texto.replace(/^Aviso do Maestro: /, ''))}
      </ui.Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const ui = $.ui.resolve(e) as any
    const p = e.props as any
    const calls = (p.calls ?? []) as { tool: string; input?: Record<string, unknown>; isRunning?: boolean }[]
    // the whole time the group is live (not only while a call runs), so fast reads do not flicker
    const vivo = calls.find(c => c.isRunning) ?? calls[calls.length - 1]
    if (e.surface === 'terminal' || !ui.Svg || !p.isActive || !vivo || p.isExpanded) return next(e)
    const inp = vivo.input ?? {}
    return kit(ui, 60, e.surface).linhaGrupo(vivo.tool, primeira(inp.file_path ?? inp.pattern ?? inp.path ?? inp.url), calls.filter(c => !c.isRunning).length)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const ui = $.ui.resolve(e) as any
    if (e.surface === 'terminal' || !ui.Svg) return next(e)
    const p = e.props as any
    const t = String(p.message ?? p.word ?? '')
    return kit(ui, 60, e.surface).linhaTrabalhando(`${t}${t.endsWith('…') ? '' : p.suffix ?? ''}`)
  }).catch(($, e, next) => next(e))

  // A message another session sent, as a card, while the band is not off (R38).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const p = e.props as any
    if (!p.from || p.isExpanded) return next(e)
    if ((await ler($, 'maestroModo')) === 'off') return next(e)
    return kit($.ui.resolve(e), 60, e.surface).msg('m', String(p.from.name ?? ''), String(p.text ?? ''))
  }).catch(($, e, next) => next(e))

  // The /maestro answer as a card with the short logo and the MAESTRO caption (R39); errors keep the native row.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    const p = e.props as any
    if (p.command !== 'maestro' || p.isErrored) return next(e)
    const ui = $.ui.resolve(e) as any
    const k = kit(ui, 60, e.surface)
    return k.cartao('maestro', null, [k.cabecalhoMaestro('maestro'), <ui.Text>{String(p.text ?? '')}</ui.Text>])
  }).catch(($, e, next) => next(e))

  // R25: the address map rides every composed prompt of an orchestrator or set session, so it survives /compact (the
  // section is rebuilt per compose, never stored in the transcript). Text memoized by the map; no I/O after the first seed.
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const papel = (await execAtual($)).papel
    if (papel !== 'orquestrador' && papel !== 'conjunto') return r
    if (!mapaSemeado) await semearMapa($)
    const chave = JSON.stringify(mapaAtual)
    if (chave !== mapaTextoChave) {
      mapaTextoChave = chave
      mapaTexto = secaoMapa(mapaAtual)
    }
    return { sections: [...r.sections, { id: 'novarc:maestro-mapa', scope: 'session' as const, text: mapaTexto }] }
  }).catch(($, e, next) => next(e))

  // R27 on the terminal surface (the only one 2.1.308 raises TurnDuration on): duration, set progress, open locks.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const ex = await execAtual($)
    if (!ex.papel) return next(e)
    const ui = $.ui.resolve(e) as any
    const lista = (await alertas($)).vista?.locks ?? []
    let conjunto: string
    let feitos: number
    let total: number
    let locks: number
    if (ex.papel === 'orquestrador') {
      // the lanes of each set live in the registry and porDir, not in this session's forks: the set in progress that moved last
      const agora = Date.now()
      const outras = daMinhaExecucao(((await ler($, 'maestroOutras')) ?? []) as Registro[], sessao)
      const porDir = ((await ler($, 'maestroPorDir')) ?? {}) as Record<string, Execucao>
      const andamento = raiasPorConjunto(outras, porDir, agora)
        .filter(b => b.raias.length > 0 && !b.raias.every(r => r.celulas[r.celulas.length - 1] === 'feito'))
        .map(b => ({ b, min: Math.min(...b.raias.map(r => r.minutos ?? Infinity)) }))
        .sort((x, y) => x.min - y.min)[0]
      if (!andamento) return next(e)
      conjunto = andamento.b.conjunto
      total = andamento.b.raias.length
      feitos = andamento.b.raias.filter(r => r.celulas[r.celulas.length - 1] === 'feito').length
      locks = lista.filter(l => l.spec.toUpperCase().startsWith(`${conjunto.toUpperCase()}-`)).length
    } else {
      ;({ feitos, total } = progresso(ex))
      conjunto = ex.conjunto ?? Object.keys(ex.conjuntos ?? {})[0] ?? ''
      locks = lista.length
    }
    return <ui.Text color="subtle">{resumoTurno(conjunto, feitos, total, locks, Number((e.props as any).durationMs) || 0)}</ui.Text>
  }).catch(($, e, next) => next(e))

  // The band reads two small state keys (A34): the mode and the fields prepararFaixa computed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e.props as any).hasSurvey) return next(e)
    const modo = ((await ler($, 'maestroModo')) ?? 'auto') as 'auto' | 'on' | 'off'
    if (modo === 'off') return next(e)
    const f = (await ler($, 'maestroFaixaDados')) as FaixaDados
    // a v1 value saved by C01/C02 code merges over the v2 default; its list fields are trusted only as arrays
    const fv = { ...SEM_FAIXA, ...f, alertas: Array.isArray(f.alertas) ? f.alertas : [], segmentos: Array.isArray(f.segmentos) ? f.segmentos : [] }
    return faixaArvore($.ui.resolve(e), e.surface, modo, fv, (e.props as any).bodyColumns ?? 78, {
      ativar: async () => { await garantirSessao($); await ativar($); await olharAgora($); await abrirPainel($) },
      nunca: async () => { await garantirSessao($); await $.store.set(NUNCA, [...(await nunca($)), cwdSessao]); await $.state.set(MODO, 'off'); cancelarLoops() },
      painel: async () => { await garantirSessao($); await olharAgora($); await abrirPainel($) },
      ver: async () => { await garantirSessao($); await $.state.set(ABA, 'locks'); await olharAgora($); await abrirPainel($) },
      verPend: async () => { await garantirSessao($); await $.state.set(ABA, 'pendencias'); await abrirPainel($) },
    })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const larg = ((e.props as any).bodyColumns ?? 60) as number
    try {
      const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
      const vista = { ...VISTA_PADRAO, ...(((await ler($, 'maestroPendVista')) ?? {}) as Partial<VistaPendencias>) }
      const mudarVista = async (m: Partial<VistaPendencias>) => { await $.state.set(PEND_VISTA, { ...vista, ...m }) }
      const ex = await exec($)
      const al = (await ler($, 'maestroAlertas')) as Alertas
      const pend = (await ler($, 'maestroPendencias')) as EstadoPendencias | null
      const aba = ((await ler($, 'maestroAba')) ?? 'agora') as string
      const plano = c?.plano as Plano | undefined
      const envios = ((await ler($, 'maestroEnvios')) ?? {}) as Record<string, Envio>
      const mapa = (await ler($, 'maestroMapa')) as MapaSessoes
      const nSemConf = ex.papel === 'orquestrador' ? semConfirmacao(envios, Date.now()).length : 0
      // desempenho.md: the store is read only while the tab that draws it is open
      const acervoSync = aba === 'inteligencia' ? (((await $.store.get('acervo-sync-v1')) ?? null) as AcervoSync | null) : null
      const cliente = String(plano?.projeto?.cliente ?? '').trim()
      // Review Focus 3: an open refused with the folder fragment retries once on the bare url
      const abre = async (url: string) => {
        try {
          const r = await $.tool.call({ tool: 'Artifact', action: 'open', url })
          return !!r && r.deny === undefined && !r.isError
        } catch {
          return false
        }
      }
      return painelArvore(ui, {
        aba,
        ex,
        outras: ((await ler($, 'maestroOutras')) ?? null) as Registro[] | null,
        porDir: ((await ler($, 'maestroPorDir')) ?? {}) as Record<string, Execucao>,
        titulos: Object.fromEntries((plano?.conjuntos ?? []).map(cj => [cj.id, cj.titulo])),
        linhas: ((await ler($, 'linhas')) ?? []) as string[],
        onde: ((await ler($, 'maestroRegistro')) ?? null) as string | null,
        agora: Date.now(),
        eu: sessao,
        alertas: al,
        pendencias: pend,
        vista: vista,
        temArtefato: !!c?.artefato,
        larg,
        superficie: e.surface,
        leitura: (await ler($, 'maestroLeitura')) as Leitura,
        // R9: the plan's short name, else the run's project, else the cwd folder
        projeto: plano?.projeto?.nomeCurto ?? (ex as any).projeto ?? (cwdSessao.split(/[\\/]/).filter(Boolean).pop() || 'Maestro'),
        sino: contaSino(ex.papel, al, ex.papel === 'orquestrador' ? pend : null, nSemConf),
        envios,
        mapa,
        notas: notasOrq(ex.papel === 'orquestrador' ? eventosOrq : []),
        gos: ((await ler($, 'maestroGos')) ?? {}) as Record<string, GoLocal>,
        dependeDe: Object.fromEntries((plano?.conjuntos ?? []).map(cj => [cj.id, cj.dependeDe ?? []])),
        sel: ((await ler($, 'maestroSelConjunto')) ?? null) as string | null,
        temBanco: !!banco && !banco.parcial,
        tentando,
        acervoSync,
        cliente,
        familia: ex.papel === 'orquestrador' ? (((await ler($, 'maestroFamilia')) ?? null) as Familia | null) : undefined,
        posse: ex.papel === 'conjunto' ? posseDoConjunto(ex) : undefined,
        acoes: {
          abrirAcervo: async () => {
            if (!acervoSync) return
            const u = cliente ? `${acervoSync.url}#${slugPasta(pastaDoCliente(cliente))}` : acervoSync.url
            if (!(await abre(u)) && u !== acervoSync.url) await abre(acervoSync.url)
          },
          abrirLinha: url => async () => { await abre(url) },
          selConjunto: C => async () => { await $.state.set(SEL, C) },
          aba: a => async () => {
            await garantirSessao($)
            await $.state.set(ABA, a)
            if (a === 'pendencias') await pendenciasAgora($)
          },
          abrir: async () => { await garantirSessao($); await $.state.set(ABA, 'execucao') },
          usarMedido: async () => { await garantirSessao($); await usarMedido($) },
          // R27: the alerts' tab, else the pendings; nothing to show raises a toast
          sino: async () => {
            const n = contaSino(ex.papel, al, ex.papel === 'orquestrador' ? pend : null, nSemConf)
            if (n > 0) await $.state.set(ABA, al.lista.length || nSemConf ? 'locks' : 'pendencias')
            else $.ui.toast('nenhum alerta agora')
          },
          tentar: async () => { await garantirSessao($); await tentarDeNovo($, aba) },
          pend: {
            fase: f => () => mudarVista({ fase: f }),
            copiar: i => async () => { await $.ui.copy({ text: i.texto }) },
            abrir: async () => {
              if (c?.artefato) await $.tool.call({ tool: 'Artifact', action: 'open', url: c.artefato })
            },
            // the person's words to the orchestrator agent, which sends the directive (d-diretivas-diretas); the mod sends nothing
            preFechamento: i => async () => {
              if (i.spec) await $.prompt.submit({ text: `Mande para o pré-fechamento de ${i.spec}: ${i.ref}` })
            },
            enviada: i => async () => { await garantirSessao($); await marcarEnviada($, i) },
            doc: () => mudarVista({ docAberto: !vista.docAberto }),
            busca: t => () => mudarVista({ busca: t }),
            filtro: f => () => mudarVista({ filtro: f }),
            itemDoc: id => () => mudarVista({ itemDoc: id }),
          },
        },
      })
    } catch (err) {
      // R45: the app closes a pane whose render fails, so a broken state draws the error card, never nothing
      await logarUmaVez($, 'painel', err)
      return kit(ui, larg, e.surface).cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', undefined, 'O painel não conseguiu desenhar')
    }
  }).catch(($, e, next) => next(e))
}
