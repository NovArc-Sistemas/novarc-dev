// novarc mod: shows NOVARC execution state above the prompt and in a pane, and writes the mechanical milestones
// (branch publicada, PR aberto) that this session itself performs.
// v2 "olhos": a run is recognised without a planning artifact, from the session-build skill call, the fork spawns
// ("spec <slug>"), the fork -> main checkpoint messages and the ledger.py calls; every session writes a registry
// entry so the Agora tab of any session sees all runs on the machine.
import type { Register } from 'claude-code'

import type { Contexto, Execucao, Registro } from '../../types'
import { VAZIA, TRILHA, alerta, alertaRaias, anotar, cartoesAgora, chamadaLedger, checkpoint, daMinhaExecucao, ehBuild, faixaConjuntoRaias, laneDaMensagem, linhaConjunto, novasLinhas, papelDaBranch, papelDoPrompt, papelDoSkill, progresso, raia, raiasPorConjunto, slugDoSpawn, vivo, type Raia } from './execucao'
import {
  ETAPA_FAIXA,
  aFechar,
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
  type Plano,
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

/** Writes a milestone on specs/<id> when the stored etapa is earlier (R3): get, compare, pinned update, 3 attempts. */
async function marco($: any, url: string, specId: string, etapa: string, campos: Record<string, unknown>): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const t = await chamar($, { tool: 'ArtifactData', action: 'get', url, collection: 'specs', doc_id: specId })
    const [doc] = lerDocs(t)
    if (!doc) {
      try {
        await chamar($, { tool: 'ArtifactData', action: 'set', url, collection: 'specs', doc_id: specId, data: { etapa, ...campos, at: new Date().toISOString(), origem: 'mod' } })
        return 'criado'
      } catch {
        continue
      }
    }
    if (rank(doc.data.etapa as string) >= rank(etapa)) return 'ja-estava'
    try {
      await chamar($, { tool: 'ArtifactData', action: 'update', url, collection: 'specs', doc_id: specId, if_version: doc.version, data: { etapa, ...campos, at: new Date().toISOString(), origem: 'mod' } })
      return 'gravado'
    } catch {
      // version moved: re-read and retry
    }
  }
  return 'falhou'
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
      const prontos = liberados(plano, specs, execucao)
      const publicados = (plano.specs || []).filter(s => specs[s.id]?.etapa === 'branch-publicada' && specs[s.id]?.validacao?.sha !== specs[s.id]?.headSha).map(s => s.id)
      const fechar = aFechar(plano, specs, execucao)
      const txt = [
        publicados.length ? `validar: ${publicados.join(', ')}` : '',
        fechar.length ? `fechar: ${fechar.join(', ')}` : '',
        prontos.length ? `liberado: ${prontos.join(', ')}` : '',
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
  if (!poll && (await $.state.get(MODO)).value !== 'off') poll = $.clock.every(5 * 60 * 1000, () => atualizar($, true))
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
  for (const f of await $.fs.list(dir)) {
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
  poll = null
  olhar = null
}

/** `ativar`: band forced on; a recognised run gets its look (and the orchestrator its poll) back. */
async function ativar($: any): Promise<void> {
  await $.state.set(MODO, 'on')
  const ex = await exec($)
  await prepararFaixa($, ex)
  if (!ex.papel) return
  if (ex.papel === 'orquestrador') await orquestrar($, null)
  await ligar($, ex.papel)
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
  banco = null
  carregando = Promise.resolve()
  sessao = ''
  cwdSessao = ''
  titulo = ''
  gitdir = ''
  cursor = {}
  cacheReg = {}
  porDir = {}
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
}

async function nunca($: any): Promise<string[]> {
  return ((await $.store.get(NUNCA)) as string[] | undefined) ?? []
}

const COR: Record<string, string> = { feito: 'success', agora: 'claude', travado: 'error', vazio: 'inactive' }
const TRILHA_TXT = TRILHA.map(t => t.toLowerCase().padEnd(9)).join('')
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
}

/** The band's fields from the run, the poll text, the registry, the sets' ledgers and the stage label. */
export function dadosFaixa(ex: Execucao, txt: string | null, outras: Registro[], porDir: Record<string, Execucao>, etapa: string | null, agora: number, eu: string): FaixaDados {
  const minhas = Object.values(ex.forks).map(f => raia(f, agora))
  let texto: string
  let quad: Raia[] = []
  let al: string | null = null
  if (ex.papel === 'orquestrador') {
    // before this session's own registry entry is read back, its run is empty: `0 conjuntos vivos` until the look
    // that follows (it writes the entry, then reads the registry)
    const run = daMinhaExecucao(outras, eu)
    texto = faixaOrq(run.filter(r => r.papel === 'conjunto' && vivo(r, agora)).length)
    // a LOCK seen only in a set's ledger surfaces here (A19), next to the reserve fork mode's own lanes
    al = alertaRaias([...raiasPorConjunto(run, porDir, agora).flatMap(b => b.raias), ...minhas])
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
      (run.papel === 'orquestrador' ? (await $.state.get(POR_DIR)).value ?? {} : {}) as Record<string, Execucao>,
      (run.papel === 'conjunto' ? (await $.state.get(ETAPA)).value ?? null : null) as string | null,
      Date.now(),
      sessao,
    ),
  )
}

const SEM_FAIXA: FaixaDados = { papel: null, txt: null, rotulo: 'NOVARC', texto: 'ativo', extra: null, quadrados: [], alerta: null, nOutras: 0 }

/** The band above the prompt: lays out prepared fields only (idle, orchestrator, set, spec, or switched on with no run). */
function faixaArvore(ui: any, modo: 'auto' | 'on' | 'off', f: FaixaDados, acoes: { ativar: Acao; nunca: Acao; painel: Acao }): any {
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
      <Button key="painel" hotkey="1" variant={f.alerta ? 'primary' : 'secondary'} onPress={acoes.painel}>painel</Button>
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
  acoes: { aba: (a: string) => Acao; abrir: Acao }
}

/** The pane `novarc-maestro`: tabs Agora, Execução, Locks, from state alone. */
function painelArvore(ui: any, d: DadosPainel): any {
  const { Box, Text, Button } = ui
  const abas = (
    <Box flexDirection="row" gap={1}>
      <Button key="t-agora" variant={d.aba === 'agora' ? 'primary' : 'secondary'} onPress={d.acoes.aba('agora')}>Agora</Button>
      <Button key="t-exec" variant={d.aba === 'execucao' ? 'primary' : 'secondary'} onPress={d.acoes.aba('execucao')}>Execução</Button>
      <Button key="t-locks" variant={d.aba === 'locks' ? 'primary' : 'secondary'} onPress={d.acoes.aba('locks')}>Locks</Button>
    </Box>
  )
  if (d.aba === 'locks') {
    return (
      <Box flexDirection="column" gap={1}>
        {abas}
        <Text dimColor>Locks chega na fase 2.</Text>
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
    const lane = (r: Raia, k: string) => (
      <Box key={`r-${k}-${r.slug}`} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>{r.rotulo ?? r.slug}</Text>
          <Text color={r.minutos !== null && r.minutos >= 15 && r.ultimo !== 'DONE' ? 'error' : 'subtle'}>{r.minutos === null ? 'sem eventos' : `há ${r.minutos} min · ${r.ultimo}`}</Text>
        </Box>
        <Text>
          {r.celulas.map((c, i) => (
            <Text color={COR[c]}>{(c === 'vazio' ? '·' : (r.rotulos[i] ?? '')).slice(0, 8).padEnd(9)}</Text>
          ))}
        </Text>
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
            {b.raias.length > 0 && <Text dimColor>{TRILHA_TXT}</Text>}
            {b.raias.map(r => lane(r, String(i)))}
          </Box>
        ))}
        {proprias.length > 0 && <Text dimColor>{TRILHA_TXT}</Text>}
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
        await ligar($, e.agentId ? 'orquestrador' : lg.fork ? 'spec' : 'conjunto', lg.dir)
        if (lg.fork && lg.tipo) await $.state.set(EXEC, anotar(await exec($), lg.fork, { tipo: lg.tipo, texto: lg.texto ?? '', at: Date.now() }, e.agentId))
        try {
          await lerDir($)
        } catch {
          // ledger dir not readable from here: lanes keep their state, the registry is still written
        }
        await registrar($)
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
      acoes: {
        aba: a => async () => { await garantirSessao($); await $.state.set(ABA, a) },
        abrir: async () => { await garantirSessao($); await $.state.set(ABA, 'execucao') },
      },
    })
  }).catch(($, e, next) => next(e))
}
