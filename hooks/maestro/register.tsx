// novarc mod: shows NOVARC execution state above the prompt and in a pane, and writes the mechanical milestones
// (branch publicada, PR aberto) that this session itself performs.
// v2 "olhos": a run is recognised without a planning artifact, from the session-build skill call, the fork spawns
// ("spec <slug>"), the fork -> main checkpoint messages and the ledger.py calls; every session writes a registry
// entry so the Agora tab of any session sees all runs on the machine.
import type { Register } from 'claude-code'

import type { Alerta, Alertas, Contexto, Evento, Execucao, LinhaSweep, Registro, Slots } from '../../types'
import {
  LIMIARES_PADRAO, VAZIA, TRILHA, alerta, anotar, calados, cartoesAgora, chamadaLedger, checkpoint, cortar, daMinhaExecucao, ehBuild,
  faixaConjuntoRaias, laneDaMensagem, lerSweep, linhaConjunto, locksDoEspelho, marcadorDir, montarAlertas, novasLinhas, novosToasts, orfaos,
  papelDaBranch, papelDoPrompt, papelDoSkill, progresso, proposta, raia, raiasPorConjunto, resumoEspelho, ritmo, ritmoTotal, slotsAbertos,
  slotsPresos, slugDoSpawn, textoLimiares, vivo, type LockAberto, type Raia,
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
const NUNCA = 'maestro-nunca'

async function chamar($: any, input: Record<string, unknown>): Promise<string> {
  const r = await $.tool.call(input)
  if (!r || r.deny || r.isError) throw new Error(String((r && (r.deny || r.text)) || 'tool call failed'))
  return String(r.text ?? '')
}

/** Reads the artifact url from ai/specs/<codigo>/artefato.txt under the session cwd, if the repo has one. */
async function acharArtefato($: any, cwd: string): Promise<string | null> {
  try {
    const raiz = `${cwd}/ai/specs`
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
    // no ai/specs folder: not a NOVARC client repo
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
  try {
    if (doTimer && ((await $.state.get(MODO)).value === 'off' || !(await exec($)).papel)) return
    await refrescar($, g)
    if (!velho(g)) {
      try {
        await gravarOrquestracao($, g)
        await alertasAgora($)
      } catch (err) {
        await logarUmaVez($, 'orquestracao', err)
      }
    }
    if (!velho(g)) await prepararFaixa($)
  } catch {
    // keep the last band
  } finally {
    if (!velho(g)) atualizando = false
  }
}

async function refrescar($: any, g: number): Promise<void> {
  let c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  if (!c || !c.artefato || !c.plano) return
  if (c.papel !== 'orquestrador') c = await seguirBranch($, c, g)
  try {
    const dSpecs = await lerColecao($, c.artefato, 'specs')
    const dExec = await lerColecao($, c.artefato, 'execucao')
    const dConfig = await lerColecao($, c.artefato, 'config')
    if (!velho(g)) banco = { specs: dSpecs, execucao: dExec, config: dConfig, at: Date.now() }
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
      const antes = (await $.state.get(FAIXA)).value ?? null
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
  }
}

let poll: { cancel: () => void } | null = null

/** Turns this session into the orchestrator view; `url` comes from the skill args when the repo has no artefato.txt. */
async function orquestrar($: any, url: string | null, papel: 'orquestrador' | 'conjunto' = 'orquestrador', conjunto: string | null = null): Promise<void> {
  // a skill url right after a /clear: let the background plan load land first, so neither write overwrites the other
  // (only with a url: the hot-reload call inside iniciarSessao passes none and must not wait on its own load)
  if (url) await carregando
  const atual = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  if (atual?.artefato) {
    await $.state.set(CTX, { ...atual, papel: atual.papel === 'orquestrador' || (atual.papel === 'spec' && papel === 'conjunto') ? atual.papel : papel })
  } else if (url) {
    const plano = await lerPlano($, url)
    if (plano) await $.state.set(CTX, { artefato: url, plano, conjunto, spec: null, papel })
  }
  const g = geracao
  const ligado = (await $.state.get(MODO)).value !== 'off'
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
  if ((await $.state.get(MODO)).value === 'off' || !(await exec($)).papel) return
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  if (!c?.artefato || !c.plano) return
  if (!poll && !encerrando && !velho(g)) poll = $.clock.every(5 * 60 * 1000, () => atualizar($, true))
}

// ---- v2 olhos: the run as seen from this session, no artifact needed

let sessao = ''
let cwdSessao = ''
let titulo = ''
let olhar: { cancel: () => void } | null = null

async function exec($: any): Promise<Execucao> {
  return ((await $.state.get(EXEC)).value ?? VAZIA) as Execucao
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
    if (!olhar && (await $.state.get(MODO)).value !== 'off') olhar = $.clock.every(60 * 1000, () => olharAgora($, true))
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
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
  for (const r of daMinhaExecucao(((await $.state.get(OUTRAS)).value ?? []) as Registro[], sessao)) {
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
let hashOrq: string | null = null
// Orchestrator: its own ledger.md read incrementally, the slots paired from it, the sets ready to close.
let cursorOrq: { size: number; mtimeMs: number; consumido: number } | null = null
let eventosOrq: Evento[] = []
let slotsOrq: Slots = { verify: { dono: null, fila: [] }, producao: { dono: null, fila: [] } }
let prontos: { conjunto: string; n: number }[] = []

const NOVO_ALERTAS = (): Alertas => ({ lista: [], alertasVistos: [], sweep: null, limiares: { ...LIMIARES_PADRAO }, olhares: 0 })

async function alertas($: any): Promise<Alertas> {
  return ((await $.state.get(ALERTAS)).value as Alertas | null) ?? NOVO_ALERTAS()
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
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  const al = await alertas($)
  if (!c?.artefato || !al.sweep || al.sweep.semLeitura) return
  const resumo = resumoEspelho(ex, al.sweep.linhas, vistoEm)
  const hash = JSON.stringify(resumo)
  if (hash === hashEspelho) return
  const espelho: EspelhoConjunto = { ...resumo, at: new Date().toISOString() }
  const g = geracao
  const r = await gravarFixado($, c.artefato, 'execucao', ex.conjunto, { espelho }, { versao: versaoEspelho })
  if (velho(g) || r.r === 'falhou') return // nothing stored: the next look retries
  hashEspelho = hash
  versaoEspelho = r.versao
  espelhadoEm = Date.now()
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
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
      const ult = f.eventos[f.eventos.length - 1]
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
  await $.state.set(ALERTAS, { ...(await alertas($)), lista, alertasVistos: t.vistos, limiares: lim, vista })
  for (const tx of t.toasts) {
    try {
      $.ui.toast(tx)
    } catch {
      // no toast surface: the band still shows it
    }
  }
}

/** "usar o medido" (orchestrator pane): one pinned update of `config/orquestracao.limiares` (R15). */
async function usarMedido($: any): Promise<void> {
  const ex = await exec($)
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
  const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
async function lerOutras($: any): Promise<void> {
  const g = geracao
  const agora = Date.now()
  const rs: Registro[] = []
  const home = await homeDir($)
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
    }
  } catch {
    // no registry dir yet
  }
  try {
    for (const k of await $.store.keys()) {
      if (!k.startsWith('maestro-sessao-')) continue
      const r = (await $.store.get(k)) as Registro | undefined
      if (r && !rs.some(x => x.sessao === r.sessao)) rs.push(r)
    }
  } catch {
    // store unavailable
  }
  if (velho(g)) return
  await $.state.set(OUTRAS, rs.filter(r => vivo(r, agora) && (r.papel || r.sessao === sessao)).sort((a, b) => b.at - a.at))
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
    if (doTimer && (await $.state.get(MODO)).value === 'off') return
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
    }
    if (velho(g)) return
    try {
      await registrar($, ex)
    } catch (err) {
      await logarUmaVez($, 'registrar', err)
    }
    try {
      await lerOutras($)
    } catch (err) {
      await logarUmaVez($, 'lerOutras', err)
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
    if (ex.papel && (await $.state.get(MODO)).value !== 'off') {
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
    if (((await $.state.get(CTX)).value as Contexto | null)?.artefato || velho(g)) return
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
  hashOrq = null
  cursorOrq = null
  eventosOrq = []
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
}

async function nunca($: any): Promise<string[]> {
  return ((await $.store.get(NUNCA)) as string[] | undefined) ?? []
}

const COR: Record<string, string> = { feito: 'success', agora: 'claude', travado: 'error', vazio: 'inactive' }
// One fixed-width column per TRILHA step: the engine collapses spaces inside a Text, so columns come from layout.
const COLUNA = 9
const MAX_RAIAS = 21

type Acao = () => Promise<void>
/** What the band draws, already computed: `papel`/`txt` decide idle or active (estadoFaixa), the rest is laid out. */
export type FaixaDados = {
  papel: string | null
  txt: string | null
  rotulo: string
  texto: string
  extra: string | null
  quadrados: string[]
  alerta: string | null
  nOutras: number
  /** Orchestrator only: a set ready to close with nothing held (green band). */
  verde: { titulo: string; texto: string; dica: string } | null
}

/**
 * The band's fields from the run, the poll text, the registry, the stage label, this session's alerts (the most urgent
 * first, R11) and, in the orchestrator, the sets ready to close.
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
): FaixaDados {
  const minhas = Object.values(ex.forks).map(f => raia(f, agora))
  let texto: string
  let quad: Raia[] = []
  const al = ex.papel === 'orquestrador' || ex.papel === 'conjunto' ? alertas[0]?.texto ?? null : null
  const v = ex.papel === 'orquestrador' && !al ? verdes[0] : undefined
  if (ex.papel === 'orquestrador') {
    // before this session's own registry entry is read back, its run is empty: `0 conjuntos vivos` until the look
    // that follows (it writes the entry, then reads the registry)
    const run = daMinhaExecucao(outras, eu)
    texto = faixaOrq(run.filter(r => r.papel === 'conjunto' && vivo(r, agora)).length)
  } else if (ex.papel === 'conjunto') {
    quad = ex.conjunto ? minhas : []
    texto = quad.length ? faixaConjuntoRaias(ex.conjunto!, etapa, quad) : 'sessão de conjunto'
  } else if (ex.papel === 'spec') {
    const f = Object.values(ex.forks).find(x => (x.spec ?? x.slug).toUpperCase() === ex.spec)
    const ultimo = f ? raia(f, agora).ultimo : null
    texto = [ex.spec ?? 'sessão de spec', ultimo].filter(Boolean).join(' · ')
  } else texto = txt ?? 'ativo'
  return {
    papel: ex.papel,
    txt,
    rotulo: ex.papel === 'orquestrador' ? 'orquestrando' : 'NOVARC',
    texto,
    extra: ex.papel === 'orquestrador' ? txt : null,
    quadrados: quadrados(quad),
    alerta: al,
    nOutras: outras.filter(r => r.sessao !== eu).length,
    verde: v ? { titulo: 'pronto para fechar', texto: `${v.conjunto} com as ${v.n} specs em DONE, sem lock aberto`, dica: 'peça o FECHA na conversa' } : null,
  }
}

/** Recomputes the band's fields from state; `ex`: the run the caller already holds, so the (large) `exec` is read once. */
async function prepararFaixa($: any, ex?: Execucao): Promise<void> {
  const run = ex ?? (await exec($))
  await $.state.set(
    FAIXA_DADOS,
    dadosFaixa(
      run,
      ((await $.state.get(FAIXA)).value ?? null) as string | null,
      ((await $.state.get(OUTRAS)).value ?? []) as Registro[],
      (run.papel === 'conjunto' ? (await $.state.get(ETAPA)).value ?? null : null) as string | null,
      Date.now(),
      sessao,
      run.papel === 'orquestrador' || run.papel === 'conjunto' ? (((await $.state.get(ALERTAS)).value as Alertas | null)?.lista ?? []) : [],
      run.papel === 'orquestrador' ? prontos : [],
    ),
  )
}

const SEM_FAIXA: FaixaDados = { papel: null, txt: null, rotulo: 'NOVARC', texto: 'ativo', extra: null, quadrados: [], alerta: null, nOutras: 0, verde: null }

/** The band above the prompt: lays out prepared fields only (idle, orchestrator, set, spec, or switched on with no run). */
function faixaArvore(ui: any, modo: 'auto' | 'on' | 'off', f: FaixaDados, acoes: { ativar: Acao; nunca: Acao; painel: Acao; ver: Acao }): any {
  const { Box, Text, Button } = ui
  if (estadoFaixa(modo, f.papel, f.txt, false) === 'ociosa') {
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text color="claude" bold>maestro</Text>
        <Text dimColor>{faixaOcioso(f.nOutras)}</Text>
        <Button key="ativar" hotkey="1" onPress={acoes.ativar}>ativar</Button>
        <Button key="nunca" plain dimColor onPress={acoes.nunca}>nunca neste projeto</Button>
      </Box>
    )
  }
  return (
    <Box flexDirection="row" gap={1} alignItems="center">
      <Text color="claude" bold>{f.rotulo}</Text>
      <Text>{f.texto}</Text>
      {f.extra && <Text>{f.extra}</Text>}
      {f.quadrados.length > 0 && (
        <Text>
          {f.quadrados.map(c => (
            <Text color={c}>■</Text>
          ))}
        </Text>
      )}
      {f.alerta && <Text color="error">● {f.alerta}</Text>}
      {f.verde && <Text color="success" bold>{f.verde.titulo}</Text>}
      {f.verde && <Text>{f.verde.texto}</Text>}
      {f.verde && <Text dimColor>{f.verde.dica}</Text>}
      {f.alerta ? (
        <Button key="ver" hotkey="1" variant="primary" onPress={acoes.ver}>ver</Button>
      ) : (
        <Button key="painel" hotkey="1" variant="secondary" onPress={acoes.painel}>painel</Button>
      )}
    </Box>
  )
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
  acoes: { aba: (a: string) => Acao; abrir: Acao; usarMedido: Acao }
}

const MAX_LOCKS = 50

/** The Locks e filas tab: held resources, the orchestrator's slots, quiet units, the thresholds line. */
function abaLocks(ui: any, d: DadosPainel): any[] {
  const { Box, Text, Button } = ui
  const al = d.alertas
  const v = al?.vista
  const papel = d.ex.papel
  const conj = papel === 'conjunto'
  const linhas: any[] = []
  const lim = al?.limiares ?? LIMIARES_PADRAO
  if (conj && !al?.sweep) linhas.push(<Text dimColor>varrendo o ledger…</Text>)
  if (al?.sweep?.semLeitura) linhas.push(<Text color="error">varredura sem leitura</Text>)
  const locks = v?.locks ?? []
  linhas.push(<Text bold>{`${locks.filter(l => l.orfao).length} lock órfão · ${locks.length} recursos em uso`}</Text>)
  if (!locks.length) linhas.push(<Text dimColor>Nenhum lock aberto.</Text>)
  const c = cortar(locks, MAX_LOCKS)
  c.linhas.forEach((l, i) =>
    linhas.push(
      <Box key={`l-${i}`} flexDirection="row" gap={1}>
        <Text bold>{l.resource}</Text>
        <Text>{l.spec}</Text>
        <Text color={l.orfao ? 'error' : 'subtle'}>{l.orfao ? `${l.minutos} min sem RELEASE` : `${l.minutos} min`}</Text>
        {l.espera?.length ? <Text dimColor>{`espera ${l.espera.join(' › ')}`}</Text> : null}
      </Box>,
    ),
  )
  if (c.mais > 0) linhas.push(<Text dimColor>{`mais ${c.mais}`}</Text>)
  if (v?.slots) {
    for (const kind of ['verify', 'producao'] as const) {
      const s = v.slots[kind]
      const m = s.dono ? Math.floor((d.agora - Date.parse(s.dono.desde)) / 60_000) : 0
      linhas.push(<Text>{s.dono ? `${kind}  ${s.dono.conjunto}  ${m} min` : `${kind}  livre`}</Text>)
      if (s.fila.length) linhas.push(<Text dimColor>{`fila: ${s.fila.map(f => f.conjunto).join(' › ')}`}</Text>)
    }
  }
  for (const u of v?.unidades ?? []) {
    linhas.push(
      <Box key={`u-${u.unidade}`} flexDirection="row" gap={1}>
        <Text>{`${u.unidade}  sem sinal há ${u.minutos} min`}</Text>
        <Text color={u.calada ? 'error' : 'success'}>{u.calada ? 'calada' : 'ok'}</Text>
      </Box>,
    )
  }
  linhas.push(<Text dimColor>{textoLimiares(lim, v?.ritmo ?? { checkpointMin: null, lockMin: null, amostras: 0 })}</Text>)
  if (papel === 'orquestrador' && v?.proposta) linhas.push(<Button key="usar-medido" onPress={d.acoes.usarMedido}>usar o medido</Button>)
  if (conj && v?.espelhadoEm) linhas.push(<Text dimColor>{`espelhado no planejamento há ${Math.max(0, Math.round((d.agora - v.espelhadoEm) / 1000))} s`}</Text>)
  return linhas
}

/** The pane `novarc-maestro`: tabs Agora, Execução, Locks e filas, from state alone. */
function painelArvore(ui: any, d: DadosPainel): any {
  const { Box, Text, Button } = ui
  const abas = (
    <Box flexDirection="row" gap={1}>
      <Button key="t-agora" variant={d.aba === 'agora' ? 'primary' : 'secondary'} onPress={d.acoes.aba('agora')}>Agora</Button>
      <Button key="t-exec" variant={d.aba === 'execucao' ? 'primary' : 'secondary'} onPress={d.acoes.aba('execucao')}>Execução</Button>
      <Button key="t-locks" variant={d.aba === 'locks' ? 'primary' : 'secondary'} onPress={d.acoes.aba('locks')}>Locks e filas</Button>
    </Box>
  )
  if (d.aba === 'locks') {
    return (
      <Box flexDirection="column" gap={1}>
        {abas}
        {abaLocks(ui, d)}
      </Box>
    )
  }
  if (d.aba === 'execucao') {
    const orq = d.ex.papel === 'orquestrador'
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
    const cabecalho = (
      <Box flexDirection="row">
        {TRILHA.map(t => (
          <Box key={`h-${t}`} width={COLUNA} flexShrink={0}>
            <Text dimColor>{t.toLowerCase()}</Text>
          </Box>
        ))}
      </Box>
    )
    const lane = (r: Raia, k: string) => (
      <Box key={`r-${k}-${r.slug}`} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>{r.rotulo ?? r.slug}</Text>
          <Text color={r.minutos !== null && r.minutos >= (d.alertas?.limiares.calado ?? LIMIARES_PADRAO.calado) && r.ultimo !== 'DONE' ? 'error' : 'subtle'}>{r.minutos === null ? 'sem eventos' : `há ${r.minutos} min · ${r.ultimo}`}</Text>
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
    return (
      <Box flexDirection="column" gap={1}>
        {abas}
        {!orq && <Text dimColor>{d.ex.ledgerDir ? `ledger ${d.ex.ledgerDir}` : 'ledger ainda não visto nesta sessão'}</Text>}
        {vazio && <Text dimColor>Nenhuma sessão de spec vista ainda.</Text>}
        {blocos.map((b, i) => (
          <Box key={`b-${i}`} flexDirection="column">
            <Text bold>{b.titulo ? `${b.conjunto} · ${b.titulo}` : b.conjunto}</Text>
            {b.raias.length > 0 && cabecalho}
            {b.raias.map(r => lane(r, String(i)))}
          </Box>
        ))}
        {proprias.length > 0 && cabecalho}
        {proprias.map(r => lane(r, 'p'))}
        {fora > 0 && <Text dimColor>{`mais ${fora}`}</Text>}
        {ls.length > 0 && <Text bold>Conjuntos do planejamento</Text>}
        {ls.map(l => (
          <Text>{l}</Text>
        ))}
      </Box>
    )
  }
  if (d.outras === null) {
    return (
      <Box flexDirection="column" gap={1}>
        {abas}
        <Text dimColor>lendo o registro…</Text>
      </Box>
    )
  }
  const cartoes = cartoesAgora(d.outras, d.eu)
  return (
    <Box flexDirection="column" gap={1}>
      {abas}
      {cartoes.length === 0 && <Text dimColor>Nenhuma execução ativa na máquina.</Text>}
      {cartoes.map(c => (
        <Box key={`c-${c.chave}`} flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text bold>{c.titulo}</Text>
            <Text color={c.alerta ? 'error' : c.papel !== 'parado' ? 'success' : 'inactive'}>{c.papel}</Text>
          </Box>
          <Text dimColor>{c.linha}</Text>
          {c.alerta && <Text color="error">{c.alerta}</Text>}
          {c.meu && <Button key="abrir" onPress={d.acoes.abrir}>abrir execução</Button>}
        </Box>
      ))}
      <Text dimColor>{`registro: ${d.onde === 'store' ? 'store do plugin' : '~/.claude/maestro/sessoes'} · ${d.outras.length} sessões vivas · branch lida do git`}</Text>
    </Box>
  )
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
    return r
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
    await $.ui.open({ id: PANE, title: 'Maestro' })
    return { text: args.startsWith('orquestrar') ? 'Painel aberto; esta sessão acompanha a execução.' : 'Painel de execução aberto.' }
  }).catch(($, e, next) => (next.called ? next(e) : { text: 'Maestro: falhou' }))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    const cmd = String(e.command)
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
      const ctx = async () => ((await $.state.get(CTX)).value ?? null) as Contexto | null
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
      const skill = String((e as any).skill ?? '')
      const args = String((e as any).args ?? '')
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

  // The band reads two small state keys (A34): the mode and the fields prepararFaixa computed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if ((e.props as any).hasSurvey) return next(e)
    const modo = ((await $.state.get(MODO)).value ?? 'auto') as 'auto' | 'on' | 'off'
    if (modo === 'off') return next(e)
    const f = ((await $.state.get(FAIXA_DADOS)).value ?? SEM_FAIXA) as FaixaDados
    return faixaArvore($.ui.resolve(e), modo, f, {
      ativar: async () => { await garantirSessao($); await ativar($); await olharAgora($); await $.ui.open({ id: PANE, title: 'Maestro' }) },
      nunca: async () => { await garantirSessao($); await $.store.set(NUNCA, [...(await nunca($)), cwdSessao]); await $.state.set(MODO, 'off'); cancelarLoops() },
      painel: async () => { await garantirSessao($); await olharAgora($); await $.ui.open({ id: PANE, title: 'Maestro' }) },
      ver: async () => { await garantirSessao($); await $.state.set(ABA, 'locks'); await olharAgora($); await $.ui.open({ id: PANE, title: 'Maestro' }) },
    })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
    return painelArvore($.ui.resolve(e), {
      aba: ((await $.state.get(ABA)).value ?? 'agora') as string,
      ex: await exec($),
      outras: ((await $.state.get(OUTRAS)).value ?? null) as Registro[] | null,
      porDir: ((await $.state.get(POR_DIR)).value ?? {}) as Record<string, Execucao>,
      titulos: Object.fromEntries(((c?.plano as Plano | undefined)?.conjuntos ?? []).map(cj => [cj.id, cj.titulo])),
      linhas: ((await $.state.get(LINHAS)).value ?? []) as string[],
      onde: ((await $.state.get(ONDE)).value ?? null) as string | null,
      agora: Date.now(),
      eu: sessao,
      alertas: ((await $.state.get(ALERTAS)).value ?? null) as Alertas | null,
      acoes: {
        aba: a => async () => { await garantirSessao($); await $.state.set(ABA, a) },
        abrir: async () => { await garantirSessao($); await $.state.set(ABA, 'execucao') },
        usarMedido: async () => { await garantirSessao($); await usarMedido($) },
      },
    })
  }).catch(($, e, next) => next(e))
}
