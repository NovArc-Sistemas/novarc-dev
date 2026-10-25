// novarc mod: shows NOVARC execution state above the prompt and in a pane, and writes the mechanical milestones
// (branch publicada, PR aberto) that this session itself performs.
// v2 "olhos": a run is recognised without a planning artifact, from the session-build skill call, the fork spawns
// ("spec <slug>"), the fork -> main checkpoint messages and the ledger.py calls; every session writes a registry
// entry so the Agora tab of any session sees all runs on the machine.
import type { Register } from 'claude-code'

import type { Alerta, Alertas, Contexto, Evento, Execucao, LinhaSweep, Registro, Slots } from '../../types'
import {
  LIMIARES_PADRAO, VAZIA, TRILHA, alerta, anotar, calados, marcos, cartoesAgora, chamadaLedger, checkpoint, cortar, daMinhaExecucao, ehBuild, espelhoParaGravar,
  faixaConjuntoRaias, laneDaMensagem, lerSweep, linhaConjunto, locksDoEspelho, marcadorDir, montarAlertas, novasLinhas, novosToasts, orfaos,
  papelDaBranch, papelDoPrompt, papelDoSkill, progresso, proposta, raia, raiasPorConjunto, resumoEspelho, ritmo, ritmoTotal, slotsAbertos,
  slotsPresos, slugDoSpawn, textoCheckpoint, textoLimiares, vivo, type LockAberto, type Raia,
} from './execucao'
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
  lerDocs,
  porId,
  prCreate,
  liberados,
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
import { COR as COR_CONJ, LOGO_FAIXA, alturaTabela, type Tom, barraSegmentosM, barraTempoDicaM, marca, tabelaTrilhasM, type LinhaTrilha } from './desenho'
import { kit, type Kit } from './kit'

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

/** The bell count (R25): this session's alerts plus, in the orchestrator, divergences and the pending counter. */
export function contaSino(papel: string | null, al: Pick<Alertas, 'lista'> | null, pend: EstadoPendencias | null): number {
  const n = al?.lista.length ?? 0
  return papel === 'orquestrador' && pend ? n + pend.divergencias.length + (pend.contador?.n ?? 0) : n
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

async function chamar($: any, input: Record<string, unknown>): Promise<string> {
  const r = await $.tool.call(input)
  if (!r || r.deny || r.isError) throw new Error(String((r && (r.deny || r.text)) || 'tool call failed'))
  return String(r.text ?? '')
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

/** The last complete read of the planning database, versions kept; replaced only when all three lists of a look succeed. */
let banco: { specs: Record<string, DbDoc>; execucao: Record<string, DbDoc>; config: Record<string, DbDoc>; at: number } | null = null

type Gravacao = { r: 'criado' | 'gravado' | 'ja-estava' | 'falhou'; versao: number | null }
type Campos = Record<string, unknown> | ((doc: DbDoc | null) => Record<string, unknown>)

/**
 * One pinned write of the writer's own fields (D4): `get` (skipped on the first attempt when `o.versao` is known, with
 * `o.doc` the document held for it), `update` with `if_version`, `set` without it only when the document is missing; a
 * refused pin re-reads and retries, 3 attempts. A function `campos` is recomposed from each attempt's document, so a
 * retry never re-sends stale fields. `o.aceita` false: the stored document already holds it (`ja-estava`).
 */
async function gravarFixado(
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
        } catch {
          continue
        }
      }
      versao = doc.version
    }
    if (doc && o.aceita && !o.aceita(doc)) return { r: 'ja-estava', versao }
    try {
      const t = await chamar($, { tool: 'ArtifactData', action: 'update', url, collection: colecao, doc_id: id, if_version: versao, data: dados(doc) })
      return { r: 'gravado', versao: versaoDe(t) }
    } catch {
      // version moved (or the call failed): re-read and retry
    }
  }
  return { r: 'falhou', versao: null }
}

/** Writes a milestone on specs/<id> when the stored etapa is earlier (R3), through gravarFixado. */
async function marco($: any, url: string, specId: string, etapa: string, campos: Record<string, unknown>): Promise<string> {
  const dados = () => ({ etapa, ...campos, at: new Date().toISOString(), origem: 'mod' })
  return (await gravarFixado($, url, 'specs', specId, dados, { aceita: d => rank(d.data.etapa as string) < rank(etapa) })).r
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
    const dConfig = await lerColecao($, c.artefato, 'config')
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
  await $.state.set(EXEC, { ...ex, ...dados, papel: final, ledgerDir: ledgerDir ?? ex.ledgerDir, ...(final === 'conjunto' ? { spec: null } : {}) })
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
  await $.state.set(EXEC, { ...ex, artefato, ...(codigo ? { codigo } : {}), ...(projeto ? { projeto } : {}) })
  await registrar($)
}

/** Reads the plan of a skill-given url into the context and the run; a failed read keeps what is known. */
async function carregar($: any, url: string, papel: 'orquestrador' | 'conjunto', conjunto: string | null = null): Promise<void> {
  await orquestrar($, url, papel, conjunto)
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  if (c?.plano) await plantar($, c.plano as Plano, url)
}

// Per ledger file (keyed by target + path): what the last fold saw, so an unchanged file is never read again.
let cursor: Record<string, { size: number; mtimeMs: number; consumido: number }> = {}

/** Folds into `ex` the complete lines each fork-<slug>.md of `dir` gained since the last fold; a shrunk file refolds from 0. */
async function dobrar($: any, dir: string, ex: Execucao, alvo: string, g: number): Promise<Execucao> {
  const lista = await $.fs.list(dir)
  if (!velho(g)) marcadores[alvo + dir] = marcadorDir(lista) // the sweep's change marker, from this same list (R2)
  for (const f of lista) {
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
    for (const ev of n.eventos) ex = anotar(ex, m[1]!, ev)
  }
  return ex
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
  if (novo !== antes && !velho(g)) await $.state.set(EXEC, novo)
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
      // the plugin's directory may be reported as the folder holding plugin.json (.claude-plugin/): skills/ sits beside it
      const raiz = String($.plugin.root).replace(/[\\/]\.claude-plugin[\\/]?$/, '')
      const script = scriptLedger ?? `${raiz}/skills/novarc-session-build/core/scripts/ledger.py`
      const r = await $.process.run(['python', script, 'sweep', '--dir', ex.ledgerDir!])
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

/** Set session, every 5th timer look: `config/orquestracao.limiares`, else 15 and 20 (R17). */
async function lerLimiares($: any): Promise<void> {
  const c = ((await ler($, 'ctx')) ?? null) as Contexto | null
  let lim = { ...LIMIARES_PADRAO }
  try {
    if (c?.artefato) {
      const d = lerDocs(await chamar($, { tool: 'ArtifactData', action: 'get', url: c.artefato, collection: 'config', doc_id: 'orquestracao' }))[0]
      const l = (d?.data as Partial<OrquestracaoDoc> | undefined)?.limiares
      if (l && Number.isFinite(l.calado) && Number.isFinite(l.lockOrfao)) lim = { calado: l.calado, lockOrfao: l.lockOrfao }
    }
  } catch {
    // read failed: the defaults
  }
  await $.state.set(ALERTAS, { ...(await alertas($)), limiares: lim })
}

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
  eventosOrq = [...eventosOrq, ...n.eventos]
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
  if (!gitdir) return null
  try {
    return String(await $.fs.read(`${gitdir}/HEAD`)).trim().match(/^ref: refs\/heads\/(.+)$/)?.[1] ?? null
  } catch {
    return null
  }
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
    // C02-S01 steps, each on its own: sweep when the marker moved (R2), then on the timer's looks only the limiares read
    // (every 5th, R17) and the mirror write (R19), then the alert scan
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
        if ((olhares - 1) % 5 === 0) await lerLimiares($)
      }
    } catch (err) {
      await logarUmaVez($, 'lerLimiares', err)
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
  poll = null
  olhar = null
  adiada = null
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
    await resolverGitdir($, cwd)
    branch = await lerBranch($)
    titulo = tituloDe(cwd, branch)
    papelConhecido = false
    if ((await nunca($)).includes(cwd)) await $.state.set(MODO, 'off')
    const pb = papelDaBranch(branch)
    if (pb) await ligar($, 'spec', null, { conjunto: pb.conjunto, spec: pb.spec })
    // after a hot reload the state survives but the timers were cancelled: a recognised run gets its loops back
    const ex = await exec($)
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
  await $.state.set(CTX, null)
  await $.state.set(LINHAS, [])
  await $.state.set(FAIXA, null)
  await $.state.set(EXEC, VAZIA)
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
): FaixaDados {
  const minhas = Object.values(ex.forks).map(f => raia(f, agora))
  let titulo = 'NOVARC'
  let status: string
  let quad: Raia[] = []
  const comAlertas = ex.papel === 'orquestrador' || ex.papel === 'conjunto'
  const als = comAlertas ? alertas.slice(0, 2).map(a => a.texto) : []
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
    nAlertas: contaSino(ex.papel, comAlertas ? { lista: alertas } : null, ex.papel === 'orquestrador' ? pendencias : null),
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
  /** A planning snapshot exists in memory (the error card only shows with nothing saved, R30). */
  temBanco: boolean
  /** `🔄 tentar de novo` is running: the body is the loading card (R32). */
  tentando: boolean
  acoes: { aba: (a: string) => Acao; abrir: Acao; usarMedido: Acao; sino: Acao; tentar: Acao; pend: Parameters<typeof abaPendencias>[5] }
}

const MAX_LOCKS = 50

const EMOJI_LOCK: Record<string, string> = { migration: '🗄️', db: '💾', file: '📄', deploy: '🚀' }

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
  const out: any[] = []
  if (al?.sweep?.semLeitura) out.push(k.quadro('falha', [<Text>⚠️</Text>, <Text color="warning">varredura sem leitura</Text>], { cor: 'warning' }))
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
        l.orfao ? <Text color="error">{`${l.minutos} min sem RELEASE`}</Text> : <Text size="footnote" color="subtle">{`segura há ${l.minutos} min`}</Text>,
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
    for (const u of v?.unidades ?? []) {
      out.push(
        k.quadro(`u-${u.unidade}`, [
          <Box flexDirection="row" gap="sm" alignItems="center">
            <Box flexGrow={1} width={0}>
              <Text wrap="truncate-end">{`${u.unidade}  sem sinal há ${u.minutos} min`}</Text>
            </Box>
            {u.calada ? k.chip('calada', 'ruim') : k.chip('ok', 'ok')}
          </Box>,
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
  if (aba === 'locks') return abaLocks(ui, d, k)
  if (aba === 'execucao') {
    let resta = MAX_RAIAS
    let fora = 0
    const corta = (rs: Raia[]) => {
      const fica = rs.slice(0, Math.max(0, resta))
      resta -= fica.length
      fora += rs.length - fica.length
      return fica
    }
    // only this session's run: another run's lanes live in that run's own orchestrator session
    const blocos = orq ? raiasPorConjunto(daMinhaExecucao(d.outras ?? [], d.eu), d.porDir, d.agora, d.titulos).map(b => ({ ...b, raias: corta(b.raias) })) : []
    const proprias = corta(Object.values(d.ex.forks).map(f => raia(f, d.agora)))
    const ls = orq ? [] : d.linhas
    const vazio = resta === MAX_RAIAS && ls.length === 0
    if (vazio && d.leitura.falhas.planejamento && !d.temBanco) return [k.cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', d.acoes.tentar)]
    const todas = [...blocos.flatMap(b => b.raias), ...proprias]
    const feitas = todas.filter(r => r.celulas[r.celulas.length - 1] === 'feito').length
    const vivas = daMinhaExecucao(d.outras ?? [], d.eu).filter(r => r.papel === 'spec' && vivo(r, d.agora)).length
    const out: any[] = [
      ...k.filas('exk', [
        k.kpi('exk-1', '🏁', `${feitas}/${todas.length}`, 'specs em DONE'),
        k.kpi('exk-2', '🧵', String(vivas), 'sessões de spec vivas'),
        lista.length ? k.kpi('exk-3', '🚨', String(lista.length), 'pede atenção', 'error') : k.kpi('exk-3', '✅', '0', 'nada exige você agora'),
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
    blocos.forEach((b, i) =>
      out.push(
        k.quadro(`b-${i}`, [
          <Text bold>{b.titulo ? `${b.conjunto} · ${b.titulo}` : b.conjunto}</Text>,
          b.raias.length ? k.titulo('specs · etapas do session-build · passe o mouse nas etapas') : null,
          ...raias(b.raias, String(i), `etapas das specs de ${b.conjunto}`),
        ], { faixa: COR_CONJ[b.conjunto] ?? 'promptBorder' }),
      ),
    )
    if (proprias.length) {
      const c = d.ex.conjunto ?? 'esta sessão'
      out.push(
        k.quadro('b-p', [
          <Text bold>{d.titulos[c] ? `${c} · ${d.titulos[c]}` : c}</Text>,
          k.titulo('specs · etapas do session-build · passe o mouse nas etapas'),
          ...raias(proprias, 'p', `etapas das specs de ${c}`),
        ], { faixa: COR_CONJ[c] ?? 'promptBorder' }),
      )
    }
    if (fora > 0) out.push(<Text key="mais" size="footnote" color="subtle">{`mais ${fora}`}</Text>)
    if (ls.length) {
      out.push(k.titulo('conjuntos do planejamento'))
      out.push(k.quadro('pl', ls.map(x => <Text>{x}</Text>)))
    }
    return out
  }
  // Agora
  if (d.outras === null) return [k.cartaoEstado('carregando', 'lendo o registro…')]
  const cartoes = cartoesAgora(d.outras, d.eu)
  if (!cartoes.length) return [k.cartaoEstado('vazio', 'Nenhuma execução ativa na máquina.')]
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
    <Text key="registro" size="footnote" color="subtle">{`📄 registro: ${d.onde === 'store' ? 'store do plugin' : '~/.claude/maestro/sessoes'} · ${d.outras.length} sessões vivas · branch lida do git`}</Text>,
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
        await $.state.set(EXEC, { ...(await exec($)), papel: null })
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
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    // the engine hands on the caller's shape: the typed `command`, or `input.command` (seen from 2.1.308 callers)
    const cmd = String((e as any).command ?? (e as any).input?.command ?? '')
    // Fast path (R29): a command the Maestro does not follow returns before any $ call.
    if (!/ledger\.py|git\s+(push|checkout|switch|worktree)|gh\s+pr\s+create/.test(cmd)) return ran
    try {
      await garantirSessao($)
      const lg = chamadaLedger(cmd)
      if (lg) {
        // A fork's ledger call carries its agentId: that makes this session the orchestrator.
        // a --dir/--fork holding a shell variable arrives null: the known ledger dir stays, no lane is made from it
        await ligar($, e.agentId ? 'orquestrador' : lg.temFork ? 'spec' : 'conjunto', lg.dir)
        if (lg.fork && lg.tipo) await $.state.set(EXEC, anotar(await exec($), lg.fork, { tipo: lg.tipo, texto: lg.texto ?? '', at: Date.now() }, e.agentId))
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
        await resolverGitdir($, cwdSessao)
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
        const texto = String(ran.text ?? '')
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
            // a push and a PR in one && chain write both, in milestone order (marco never moves an etapa back); each
            // half on its own, so a failed push half never skips the PR half
            try {
              const sp = pushed ? specDaBranch(pushed, plano) : null
              if (pushed && sp) {
                const sha = await $.process.run(['git', 'rev-parse', pushed])
                await marco($, artefato, sp.id, 'branch-publicada', { branch: pushed, headSha: sha.stdout.trim() })
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
                if (s) await marco($, artefato, s.id, 'pr-aberto', { pr: url })
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

  // The orchestrator skill turns the view on by itself: no need to also run /maestro orquestrar.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    try {
      await garantirSessao($)
      const skill = String((e as any).skill ?? (e as any).input?.skill ?? '')
      const args = String((e as any).args ?? (e as any).input?.args ?? '')
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
        await $.state.set(EXEC, { ...ex, forks: { ...ex.forks, [slug]: { ...f, agentId: r.agentId ?? f.agentId } } })
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
        await $.state.set(EXEC, anotar(ex, slug, { tipo: cp.tipo, texto: cp.resto, at: Date.now() }, e.agentId))
        await registrar($)
      }
    } catch {
      // bookkeeping only
    }
    return r
  }).catch(($, e, next) => next(e))

  // The spec brief's `session name:` line, or a session-build invocation, typed or sent by a person, names the role.
  // Only user-turn origins count (R4/R5): a peer message, a meta prompt or a plugin never sets it.
  on('prompt.submit', async ($, e, next) => {
    await garantirSessao($)
    if (papelConhecido) return next(e)
    try {
      const doUsuario = !e.isMeta && ['composer', 'bridge', 'sdk'].includes(e.origin.kind)
      const p = doUsuario && !(await exec($)).papel ? papelDoPrompt(e.text) : null
      if (p) {
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
        const ex = await exec($)
        if (ex.papel === 'conjunto') {
          const cp = checkpoint(e.text)
          const lane = cp ? laneDaMensagem(ex, e.text) : null
          if (cp && lane) {
            await $.state.set(EXEC, anotar(ex, lane, { tipo: cp.tipo, texto: cp.resto, at: Date.now() }))
            await registrar($)
            await marcarSujo($) // a spec session's checkpoint sweeps even when this agent never calls ledger.py (R1)
          }
        } else if (ex.papel === 'orquestrador') {
          const lc = linhaConjunto(e.text)
          if (lc) {
            await $.state.set(EXEC, { ...ex, conjuntos: { ...ex.conjuntos, [lc.conjunto]: { etapa: lc.etapa, texto: lc.resto, at: Date.now() } } })
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
        sino: contaSino(ex.papel, al, ex.papel === 'orquestrador' ? pend : null),
        temBanco: !!banco,
        tentando,
        acoes: {
          aba: a => async () => {
            await garantirSessao($)
            await $.state.set(ABA, a)
            if (a === 'pendencias') await pendenciasAgora($)
          },
          abrir: async () => { await garantirSessao($); await $.state.set(ABA, 'execucao') },
          usarMedido: async () => { await garantirSessao($); await usarMedido($) },
          // R27: the alerts' tab, else the pendings; nothing to show raises a toast
          sino: async () => {
            const n = contaSino(ex.papel, al, ex.papel === 'orquestrador' ? pend : null)
            if (n > 0) await $.state.set(ABA, al.lista.length ? 'locks' : 'pendencias')
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
