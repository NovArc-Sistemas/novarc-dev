import { expect, test } from 'claude-code/testing'
import { raiasPorConjunto } from './execucao'

const PLANO = {
  conjuntos: [{ id: 'C01', titulo: 'Base', specs: ['C01-S01'] }],
  specs: [{ id: 'C01-S01', conjunto: 'C01', slug: 'olhos' }],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: 'NOVARC-PLUGIN-MAESTRO' },
}
const URL = 'https://claude.ai/artifact/TESTE'
const SESSOES = 'C:/Users/t/.claude/maestro/sessoes'

// The world beneath the mod, in memory: files (registry, ledgers) with size and mtimeMs as $.fs.list reports them,
// git answered from `branch` / `head`, the store, held clock periods, and every $ call the mod makes (the `*` hook).
type Timer = { ms: number; fire: () => void; disparado: boolean; abortado: boolean }
type Mundo = {
  branch: string
  head: string | null
  gitDir: string
  id: string
  home: string | null
  arquivos: Record<string, { text: string; mtimeMs: number }>
  store: Record<string, unknown>
  runs: string[]
  lidos: string[]
  listados: string[]
  logs: string[]
  tools: unknown[]
  timers: Timer[]
  eventos: { at: number; e: any }[]
  segurar: ((dir: string) => Promise<void> | null) | null
  falhar: ((path: string) => boolean) | null
  abertos: string[]
  semBanco: boolean
  /** Holds or fails one tool call (Artifact / ArtifactData) the way `segurar` / `falhar` do for files. */
  segurarTool: ((e: any) => Promise<void> | null) | null
  falharTool: ((e: any) => boolean) | null
}
const norm = (p: unknown) => String(p).replace(/\\/g, '/')
let seq = 0
function gravar(m: Mundo, path: string, text: string, mtimeMs = Date.now() + ++seq) {
  m.arquivos[norm(path)] = { text, mtimeMs }
}

// A run with no planning artifact: no ai/specs, a session-build orchestrator that spawns a fork, the fork reports
// checkpoints by message and through ledger.py. Nothing touches the host.
function montar(on: any, escritos: Record<string, string>, branch = 'main', comPlano = false): Mundo {
  const m: Mundo = {
    branch, head: null, gitDir: '.git', id: 'sess-1', home: 'C:/Users/t', arquivos: {}, store: {},
    runs: [], lidos: [], listados: [], logs: [], tools: [], timers: [], eventos: [], segurar: null, falhar: null, abertos: [], semBanco: false,
    segurarTool: null, falharTool: null,
  }
  gravar(m, 'C:/repo/ai/ledger/fork-c02-s01.md', 'READY c02-s01  # 2026-10-15T12:00:00Z\nPLAN p.md TASKS 3  # 2026-10-15T12:05:00Z\n', 1)
  on('*', async ($: any, e: any, next: any) => {
    m.eventos.push({ at: performance.now(), e })
    return next(e)
  })
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', async ($: any, e: any) => ({ sessionId: e.sessionId }))
  on('command.register', async () => ({ value: undefined }))
  on('session.id', async () => ({ value: m.id }))
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async ($: any, e: any) => ({ value: e.name === 'USERPROFILE' && m.home ? m.home : undefined }))
  on('fs.list', async ($: any, e: any) => {
    const dir = norm(e.path)
    m.listados.push(dir)
    const espera = m.segurar?.(dir)
    if (espera) await espera
    const filhos = Object.entries(m.arquivos).filter(([k]) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
    // immediate subfolders (ai/specs/<codigo>/artefato.txt), so the artifact half of session start can find its url
    const pastas = [...new Set(Object.keys(m.arquivos).filter(k => k.startsWith(`${dir}/`) && k.slice(dir.length + 1).includes('/')).map(k => k.slice(dir.length + 1).split('/')[0]!))]
    if (!filhos.length && !pastas.length) throw new Error('no dir')
    return {
      value: [
        ...filhos.map(([k, f]) => ({ name: k.slice(dir.length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })),
        ...pastas.map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
      ],
    }
  })
  on('fs.read', async ($: any, e: any) => {
    const p = norm(e.path)
    m.lidos.push(p)
    if (m.falhar?.(p)) throw new Error('EBUSY')
    if (p.endsWith('plano.json')) return { value: JSON.stringify(PLANO) }
    if (p.endsWith('/HEAD')) return { value: m.head ?? `ref: refs/heads/${m.branch}\n` }
    return { value: m.arquivos[p]?.text ?? '' }
  })
  on('fs.write', async ($: any, e: any) => {
    const espera = m.segurar?.(norm(e.path))
    if (espera) await espera
    escritos[e.path] = e.text
    gravar(m, e.path, e.text)
    return { value: undefined }
  })
  on('store.get', async ($: any, e: any) => ({ value: m.store[e.key] }))
  on('store.set', async ($: any, e: any) => {
    m.store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', async ($: any, e: any) => {
    delete m.store[e.key]
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: Object.keys(m.store) }))
  on('process.run', async ($: any, e: any) => {
    m.runs.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: e.argv.includes('--git-dir') ? `${m.gitDir}\n` : `${m.branch}\n`, stderr: '' } }
  })
  // Each period is one dispatch, held until the test fires it; an aborted dispatch is a cancelled timer.
  on('clock.every', ($: any, e: any, next: any) =>
    new Promise(res => {
      const t: Timer = { ms: e.ms, fire: () => res({ value: undefined }), disparado: false, abortado: false }
      next.signal?.addEventListener('abort', () => (t.abortado = true))
      m.timers.push(t)
    }))
  on('ui.log', async ($: any, e: any) => {
    m.logs.push(String(e.text))
    return { value: undefined }
  })
  on('ui.open', async ($: any, e: any) => {
    if (m.falhar?.(`ui.open:${e.id}`)) throw new Error('no pane')
    m.abertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.render', async () => ({ type: 'Box', children: ['engine'] })) // the engine's own drawing, under a hook's next(e)
  on('tool.list', async () => ({ value: comPlano ? [{ name: 'ArtifactData' }] : [] }))
  on('tool.call', async ($: any, e: any) => {
    m.tools.push(e)
    const espera = m.segurarTool?.(e)
    if (espera) await espera
    if (m.falharTool?.(e)) return { result: '', text: 'boom', isError: true }
    if (e.tool === 'ArtifactData' && m.semBanco) return { result: '', text: 'offline', isError: true }
    return e.tool === 'Artifact' ? { result: '', text: 'File saved: "C:/tmp/plano.json" (1 bytes)', isError: false } : { result: '', text: 'ok', isError: false }
  })
  on('agent.spawn', async () => ({ model: 'm', agentId: 'ag-1' }))
  on('session.send', async () => ({ isDelivered: true }))
  on('prompt.submit', async ($: any, e: any) => ({ text: e.text }))
  on('session.receive', async ($: any, e: any) => ({ text: e.text }))
  return m
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Every $ call but the clock's own period requests. */
const chamadas = (m: Mundo) => m.eventos.filter(x => !(Object.keys(x.e ?? {}).length === 1 && 'ms' in x.e))
/** Waits until the mod made no $ call for 40 ms. */
async function quieto(m: Mundo) {
  let n = -1
  while (n !== m.eventos.length) {
    n = m.eventos.length
    await dormir(40)
  }
}
/** Fires the oldest held period of the one-minute look without waiting for the tick. */
function disparar(m: Mundo, ms = 60_000) {
  const t = m.timers.find(x => x.ms === ms && !x.disparado && !x.abortado)
  if (!t) throw new Error(`no armed ${ms} ms timer`)
  t.disparado = true
  t.fire()
}
/** One look: fires it, waits for it to settle, returns the time from the fire to its last $ call. */
async function tick(m: Mundo): Promise<number> {
  const n = m.eventos.length
  const t0 = performance.now()
  disparar(m)
  await quieto(m)
  const meus = chamadas({ ...m, eventos: m.eventos.slice(n) })
  return meus.length ? meus[meus.length - 1]!.at - t0 : 0
}
/** Timers armed (not period follow-ups): dispatches of that period minus the ones fired. */
const armados = (m: Mundo, ms = 60_000) => m.timers.filter(t => t.ms === ms).length - m.timers.filter(t => t.ms === ms && t.disparado).length
/** The last value the mod wrote to its `$.state` key (state.set events carry `value`; a get has none). */
const escrito = (m: Mundo, key: string) => [...m.eventos].reverse().find(x => x.e?.plugin === 'novarc' && x.e?.key === key && 'value' in x.e)?.e.value
const cancelados = (m: Mundo, ms: number) => m.timers.filter(t => t.ms === ms && t.abortado).length

const registro = (escritos: Record<string, string>, id = 'sess-1') =>
  JSON.parse(Object.entries(escritos).find(([k]) => norm(k).endsWith(`/.claude/maestro/sessoes/${id}.json`))![1])
const iniciar = ($: any) => $.session.start?.({ cwd: 'C:/repo', surface: 'desktop', isInteractive: false })
const CONJ = `conjunto ${URL} C01`
const BUILD = 'novarc:novarc-session-build'

test('a run without an artifact is followed from the spawn, the fork message and the ledger', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await $.session.start?.({ cwd: 'C:/repo', surface: 'desktop', isInteractive: false })
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: '' })
  await $.agent.spawn?.({ tool_use_id: 't1', prompt: 'p', description: 'spec c02-s01', agent: 'fork' })
  await $.session.send?.({ to: 'main', text: 'TASK 2/3', origin: { kind: 'model' }, agentId: 'ag-1' })
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir C:/repo/ai/ledger --fork c02-s01 --type LOCK --text "migration a.sql"', agentId: 'ag-1' })
  const reg = registro(escritos)
  expect(reg.papel).toBe('orquestrador')
  expect(reg.forks).toBe(1)
  expect(reg.alerta).toBe('c02-s01 segura lock')
})

test('a linked spec session without artefato.txt is recognised from its branch and writes registry role spec', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos, 'feat/c01-s01-olhos-sessao-por-spec-20261017')
  await iniciar($)
  const r = registro(escritos)
  expect([r.papel, r.conjunto, r.spec]).toEqual(['spec', 'C01', 'C01-S01'])
})

test('a set session started by the build skill with conjunto args writes role conjunto, orquestrar args give orquestrador', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  const r = registro(escritos)
  expect([r.papel, r.conjunto, r.artefato]).toEqual(['conjunto', 'C01', URL])
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  expect(registro(escritos).papel).toBe('orquestrador')
})

const BRIEF = 'session name:         novarc-NOVARC-PLUGIN-MAESTRO-C01-S01'
const CASOS: [string, any, boolean][] = [
  ['a user-turn prompt with the brief line sets the role', { origin: { kind: 'composer' } }, true],
  ['an isMeta prompt leaves the role unknown', { origin: { kind: 'composer' }, isMeta: true }, false],
  ['a peer-send-message origin leaves the role unknown', { origin: { kind: 'peer-send-message' } }, false],
  ['a coordinator origin leaves the role unknown', { origin: { kind: 'coordinator' } }, false],
  ['a plugin origin leaves the role unknown', { origin: { kind: 'plugin', name: 'x', asUser: true } }, false],
  ['an unclassified origin leaves the role unknown', { origin: { kind: 'unclassified' } }, false],
]
for (const [nome, extra, acha] of CASOS) {
  test(`${nome} (brief line, text unchanged)`, async ($: any, on: any) => {
    const escritos: Record<string, string> = {}
    montar(on, escritos)
    await iniciar($)
    const out = await $.prompt.submit?.({ text: BRIEF, ...extra })
    expect(out.text).toBe(BRIEF)
    await $.tool.call({ tool: 'Skill', skill: 'x:other', args: '' }) // forces a registry write without setting a role
    const r = registro(escritos)
    expect(r.papel).toBe(acha ? 'spec' : null)
    if (acha) expect(r.codigo).toBe('NOVARC-PLUGIN-MAESTRO')
  })
}

test('the Skill conjunto args with a url record the artifact, and the plan load fills codigo and projeto', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  const r = registro(escritos)
  expect([r.artefato, r.codigo, r.projeto]).toEqual([URL, 'NOVARC-PLUGIN-MAESTRO', 'NOVARC · Maestro'])
})

test('a received checkpoint naming a spec of another set, or none, is ignored; text unchanged', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  for (const t of ['LOCK db C02-S01 migration', 'TASK 2/3']) {
    const out = await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: t })
    expect(out.text).toBe(t)
  }
  const r = registro(escritos)
  expect([r.alerta, r.forks]).toEqual([null, 0])
})

test('a ledger.py --fork call without agentId folds under its own lane and keeps role spec; with agentId it is a fork lane', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos, 'feat/c01-s01-olhos-20261017')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir C:/repo/ai/ledger --fork c01-s01 --type LOCK --text "migration a.sql"' })
  let r = registro(escritos)
  expect([r.papel, r.alerta]).toEqual(['spec', 'c01-s01 segura lock'])
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir C:/repo/ai/ledger --fork c02-s01 --type LOCK --text "x"', agentId: 'ag-1' })
  r = registro(escritos)
  expect(r.papel).toBe('orquestrador')
})

test('a received peer checkpoint moves the sending spec lane, message unchanged', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  const t = 'LOCK db C01-S01 migration'
  const out = await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: t })
  expect(out.text).toBe(t)
  expect(registro(escritos).alerta).toBe('C01-S01 segura lock')
})

test('a received CONJUNTO line moves the C01 block in the orchestrator, message unchanged', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  const t = 'CONJUNTO C01 implementacao 1/2 specs'
  const out = await $.session.receive?.({ origin: { kind: 'peer' }, text: t })
  expect(out.text).toBe(t)
  expect(registro(escritos).conjuntos?.C01?.etapa).toBe('implementacao')
})

for (const sub of ['init --dir C:/repo/ai/ledger --fork c01-s01 --run-id x --specs c01-s01', 'append --dir C:/repo/ai/ledger --fork c01-s01 --type READY --text "x"']) {
  test(`a set session keeps role conjunto on ledger.py ${sub.split(' ')[0]} --fork without agentId`, async ($: any, on: any) => {
    const escritos: Record<string, string> = {}
    montar(on, escritos)
    await iniciar($)
    await $.tool.call({ tool: 'Skill', skill: BUILD, args: 'conjunto https://claude.ai/artifact/QcHs5NqkFdUzz3mNFcmVEw C01' })
    await $.tool.call({ tool: 'Bash', command: `python ledger.py ${sub}` })
    expect(registro(escritos).papel).toBe('conjunto')
  })
}

// ---- Task 3: registry with the git branch, loop hygiene, incremental ledger read

const entrada = (sessao: string, extra: Record<string, unknown>) =>
  JSON.stringify({ sessao, cwd: `C:/w/${sessao}`, titulo: sessao, forks: 0, feitos: 0, alerta: null, at: Date.now(), codigo: 'NOVARC-PLUGIN-MAESTRO', ...extra })
const SPEC = 'feat/c01-s01-olhos-20261017'
const NOVA = 'feat/c01-s01-olhos-sessao-por-spec-20261017'
const linha = (tipo: string, texto: string, min = 0) => `${tipo} ${texto}  # 2026-10-15T12:${String(min).padStart(2, '0')}:00Z\n`

test('the orchestrator tick reads three registry files and the set ledger dir and lists the set lane with its spec sessions', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos)
  gravar(m, `${SESSOES}/set-1.json`, entrada('set-1', { papel: 'conjunto', conjunto: 'C01', ledgerDir: 'C:/set/ledger' }))
  gravar(m, `${SESSOES}/spec-1.json`, entrada('spec-1', { papel: 'spec', conjunto: 'C01', spec: 'C01-S01', branch: SPEC }))
  gravar(m, `${SESSOES}/spec-2.json`, entrada('spec-2', { papel: 'spec', conjunto: 'C01', spec: 'C01-S02', branch: 'feat/c01-s02-pane-20261017' }))
  gravar(m, 'C:/set/ledger/fork-olhos.md', linha('READY', `branch=${SPEC}`) + linha('PLAN', 'p.md', 1))
  gravar(m, 'C:/set/ledger/fork-pane.md', linha('READY', 'branch=feat/c01-s02-pane-20261017'))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  for (const s of ['set-1', 'spec-1', 'spec-2']) expect(m.lidos.filter(p => p.endsWith(`/sessoes/${s}.json`)).length).toBe(1)
  expect(m.lidos.filter(p => p.startsWith('C:/set/ledger/')).length).toBe(2)
  const regs = ['set-1', 'spec-1', 'spec-2'].map(s => JSON.parse(m.arquivos[`${SESSOES}/${s}.json`]!.text))
  const blocos = raiasPorConjunto(regs, escrito(m, 'maestroPorDir'), Date.now())
  expect(blocos.map(b => [b.conjunto, b.raias.map(r => r.rotulo)])).toEqual([['C01', ['C01-S01', 'C01-S02']]])
  const r = registro(escritos)
  expect([r.papel, r.artefato, r.projeto, r.pai]).toEqual(['orquestrador', URL, 'NOVARC · Maestro', null])
})

test('with no home directory the registry falls back to one store key per session', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  m.home = null
  await iniciar($)
  expect((m.store['maestro-sessao-sess-1'] as any)?.papel).toBe('spec')
  const ui = await $.ui.mount({ plugin: 'novarc', surface: 'terminal', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 80 } })
  expect(await ui.find({ text: /^registro: store do plugin/ })).toBeDefined()
})

test('a half-written registry file is skipped, the others still listed', async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, `${SESSOES}/a.json`, entrada('a', { papel: 'spec' }))
  gravar(m, `${SESSOES}/b.json`, '{"sessao":"b"')
  gravar(m, `${SESSOES}/c.json`, entrada('c', { papel: 'conjunto' }))
  await iniciar($)
  expect((escrito(m, 'maestroOutras') as any[]).map(r => r.sessao).sort()).toEqual(['a', 'c', 'sess-1'])
})

test('a session started on claude/magical-jones-8c99 without artefato becomes spec after git switch', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, 'claude/magical-jones-8c99')
  await iniciar($)
  expect([registro(escritos).papel, armados(m)]).toEqual([null, 0])
  m.branch = NOVA
  await $.tool.call({ tool: 'Bash', command: `git switch --no-track -c ${NOVA} origin/main` })
  const r = registro(escritos)
  expect([r.papel, r.conjunto, r.spec, r.branch]).toEqual(['spec', 'C01', 'C01-S01', NOVA])
  expect(armados(m)).toBe(1)
})

test('after git switch seen by the Bash hook the next tick writes the new branch from <gitdir>/HEAD', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  await iniciar($)
  expect(m.lidos).toContain('C:/repo/.git/HEAD') // `.git` from rev-parse resolved against the cwd
  m.branch = NOVA
  await $.tool.call({ tool: 'Bash', command: `git switch ${NOVA}` })
  for (const k of Object.keys(escritos)) delete escritos[k] // the entry below is the tick's own write
  await tick(m)
  expect(registro(escritos).branch).toBe(NOVA)
  expect(registro(escritos).titulo).toBe(`repo · ${NOVA}`)
  m.head = 'abc123def4567890abc123def4567890abc12345\n'
  await tick(m)
  expect(registro(escritos).branch).toBe(null)
})

test('three ticks run no process; only session.start and a git switch run git', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  await iniciar($)
  expect(m.runs).toEqual(['git rev-parse --git-dir'])
  for (let i = 0; i < 3; i++) await tick(m)
  expect(m.runs.length).toBe(1)
  await $.tool.call({ tool: 'Bash', command: `git switch ${NOVA}` })
  expect(m.runs).toEqual(['git rev-parse --git-dir', 'git rev-parse --git-dir'])
})

test('desativar cancels both loops; session.end closes the entry, deletes the store key, makes no tool call, under 200 ms', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos)
  m.store['maestro-sessao-sess-1'] = { sessao: 'sess-1' }
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  expect([armados(m, 60_000), armados(m, 300_000)]).toEqual([1, 1])
  const out = await $.command.run?.({ command: 'maestro', args: 'desativar' })
  expect(out.text).toBe('Faixa do Maestro desligada nesta sessão.')
  expect([cancelados(m, 60_000), cancelados(m, 300_000)]).toEqual([1, 1])
  const tools = m.tools.length
  const t0 = performance.now()
  await $.session.end?.({ reason: 'other', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  expect(performance.now() - t0).toBeLessThan(200)
  expect(registro(escritos).papel).toBe(null)
  expect('maestro-sessao-sess-1' in m.store).toBe(false)
  expect(m.tools.length).toBe(tools)
})

test('a second tick while the first is pending makes no $ call; a throwing lerDir does not stop registrar and lerOutras', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/ai/ledger --run-id x' })
  let soltar = () => {}
  m.segurar = dir => (dir === 'C:/repo/ai/ledger' ? new Promise<void>(r => (soltar = r)) : null)
  disparar(m)
  await dormir(40)
  const n = chamadas(m).length
  disparar(m)
  await dormir(40)
  expect(chamadas(m).length).toBe(n)
  soltar()
  await quieto(m)
  m.segurar = dir => (dir === 'C:/repo/ai/ledger' ? Promise.reject(new Error('EACCES')) : null)
  for (const k of Object.keys(escritos)) delete escritos[k]
  const listados = m.listados.length
  await tick(m)
  await tick(m)
  expect(registro(escritos).papel).toBe('spec')
  expect(m.listados.slice(listados).filter(d => d === SESSOES).length).toBe(2)
  expect(m.logs.filter(l => l.startsWith('maestro: lerDir')).length).toBe(1)
})

/** `n` fork files of `linhas` distinct ledger lines each under `dir`. */
function ledger(m: Mundo, dir: string, n: number, linhas: number) {
  for (let i = 0; i < n; i++) {
    let t = linha('READY', `f${i}`)
    for (let j = 1; j < linhas; j++) t += linha('TASK', `${j}/${linhas} f${i}`, j % 60)
    gravar(m, `${dir}/fork-f${i}.md`, t)
  }
}
async function semMudancaEUmaLinha($: any, on: any, n: number, linhas: number) {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  ledger(m, 'C:/run/ledger', n, linhas)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/run/ledger --run-id x' })
  const doLedger = (xs: string[]) => xs.filter(p => p.startsWith('C:/run/ledger')).length
  await tick(m)
  let [l, r] = [doLedger(m.listados), doLedger(m.lidos)]
  const dt = await tick(m)
  expect([doLedger(m.listados) - l, doLedger(m.lidos) - r]).toEqual([1, 0])
  expect(dt).toBeLessThan(50)
  const f = m.arquivos['C:/run/ledger/fork-f3.md']!
  gravar(m, 'C:/run/ledger/fork-f3.md', f.text + linha('LOCK', 'migration a.sql', 59))
  ;[l, r] = [doLedger(m.listados), doLedger(m.lidos)]
  await tick(m)
  expect([doLedger(m.listados) - l, doLedger(m.lidos) - r]).toEqual([1, 1])
  expect(registro(escritos).alerta).toBe('f3 segura lock')
}

test('two ticks over 10 unchanged ledger files: 1 list, 0 ledger reads, under 50 ms; one appended line: 1 read, 1 event', async ($: any, on: any) => {
  await semMudancaEUmaLinha($, on, 10, 30)
})

// Synthetic stand-in for the Kidsy Hub run 20260822-1419 copy (6 files, 2,732 lines): not shipped with the repo.
test('the same over 6 ledger files of about 2,732 lines', async ($: any, on: any) => {
  await semMudancaEUmaLinha($, on, 6, 455)
})

test('a ledger line written in two parts is folded once complete', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  gravar(m, 'C:/run/ledger/fork-a.md', linha('READY', 'a') + 'LOCK migration a.s')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/run/ledger --run-id x' })
  expect(registro(escritos).alerta).not.toBe('a segura lock')
  gravar(m, 'C:/run/ledger/fork-a.md', linha('READY', 'a') + linha('LOCK', 'migration a.sql', 1))
  await tick(m)
  expect(registro(escritos).alerta).toBe('a segura lock')
})

test('desativar then ativar re-arms the look and the next tick runs', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  await iniciar($)
  expect(armados(m)).toBe(1)
  await $.command.run?.({ command: 'maestro', args: 'desativar' })
  expect(cancelados(m, 60_000)).toBe(1)
  await $.command.run?.({ command: 'maestro', args: 'ativar' })
  expect(armados(m)).toBe(2)
  for (const k of Object.keys(escritos)) delete escritos[k]
  await tick(m)
  expect(registro(escritos).papel).toBe('spec')
})

test('after session.end with reason clear the next prompt registers the new session id', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  await iniciar($)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  m.id = 'sess-2'
  await $.prompt.submit?.({ text: 'oi', origin: { kind: 'composer' } })
  const r = registro(escritos, 'sess-2')
  expect([r.sessao, r.papel, r.spec, r.branch]).toEqual(['sess-2', 'spec', 'C01-S01', SPEC])
})

test('orchestrator, then /clear, then a plain session: idle state, no timer, no stale context', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  const timers = m.timers.length
  m.id = 'sess-2'
  await $.prompt.submit?.({ text: 'oi', origin: { kind: 'composer' } })
  const r = registro(escritos, 'sess-2')
  expect([r.papel, r.artefato, r.projeto]).toEqual([null, null, null])
  const ui = await $.ui.mount({ plugin: 'novarc', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  expect(await ui.find({ key: 'ativar' })).toBeDefined() // idle band: no role, no FAIXA, MODO neither on nor off
  expect([escrito(m, 'ctx'), escrito(m, 'faixa'), escrito(m, 'maestroModo')]).toEqual([null, null, 'auto'])
  expect([cancelados(m, 60_000), cancelados(m, 300_000)]).toEqual([1, 1])
  expect(m.timers.length).toBe(timers)
})

test('a ledger.py call on an unreadable dir still writes the registry with the new role', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/nada/ledger --run-id x' })
  expect([registro(escritos).papel, registro(escritos).ledgerDir]).toEqual(['conjunto', 'C:/nada/ledger'])
})

test('ls -la right after a clear makes 0 $ calls', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  await iniciar($)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  const n = m.eventos.length
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(m.eventos.slice(n).filter(x => !x.e?.tool_use_id).length).toBe(0) // only the call itself reaches the test's hooks
})

test('registry list of 210 entries with 200 stale mtimeMs reads 10 files', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  for (let i = 0; i < 200; i++) gravar(m, `${SESSOES}/velha-${i}.json`, entrada(`velha-${i}`, { papel: 'spec' }), Date.now() - 31 * 60_000)
  for (let i = 0; i < 10; i++) gravar(m, `${SESSOES}/viva-${i}.json`, entrada(`viva-${i}`, { papel: 'spec' }))
  await iniciar($)
  await tick(m)
  expect(m.lidos.filter(p => p.includes('/sessoes/viva-')).length).toBe(10)
  expect(m.lidos.filter(p => p.includes('/sessoes/velha-')).length).toBe(0)
})

// ---- Task 3 review fixes

test('a ledger file that fails to read does not drop the other files folds and is folded on the next tick', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  ledger(m, 'C:/run/ledger', 4, 3)
  m.falhar = p => p.endsWith('/fork-f3.md')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/run/ledger --run-id x' })
  const forks = () => Object.keys((escrito(m, 'exec') as any).forks).sort()
  expect(forks()).toEqual(['f0', 'f1', 'f2'])
  m.falhar = null
  await tick(m)
  expect(forks()).toEqual(['f0', 'f1', 'f2', 'f3'])
  expect((escrito(m, 'exec') as any).forks.f3.eventos.length).toBe(3)
})

test('a role-less session refreshes the machine list on /maestro', async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, `${SESSOES}/a.json`, entrada('a', { papel: 'spec' }))
  await iniciar($)
  const n = m.eventos.length
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(m.listados.slice(-1)).toEqual([SESSOES])
  expect(m.eventos.slice(n).some(x => x.e?.key === 'maestroOutras' && 'value' in x.e)).toBe(true)
  expect(armados(m)).toBe(0) // a role-less session arms no timer: ligar is the only arm, so the timer gate is defensive
})

test('after a clear the nunca button stores the real cwd, never an empty one', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  m.id = 'sess-2'
  const ui = await $.ui.mount({ plugin: 'novarc', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  await ui.press({ key: 'nunca' })
  expect(m.store['maestro-nunca']).toEqual(['C:/repo'])
})

test('a look still in flight when the session ends writes nothing after the end', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, SPEC)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/ai/ledger --run-id x' })
  let soltar = () => {}
  m.segurar = dir => (dir === 'C:/repo/ai/ledger' ? new Promise<void>(r => (soltar = r)) : null)
  disparar(m)
  await dormir(40)
  await $.session.end?.({ reason: 'other', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  expect(registro(escritos).papel).toBe(null)
  const n = m.eventos.length
  soltar()
  await quieto(m)
  expect(registro(escritos).papel).toBe(null)
  expect(m.eventos.slice(n).filter(x => 'value' in (x.e ?? {}) && x.e.plugin === 'novarc').length).toBe(0)
})

// ---- Task 5: band and pane, drawn through the real render hooks

const SUPERFICIES = ['terminal', 'desktop'] as const
const BANDA = { plugin: 'novarc', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } } as const
const PAINEL = { plugin: 'novarc', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 120 } } as const
/** What a node shows: strings, a Button as `[hotkey] label`, children concatenated. */
const textoDe = (n: any): string =>
  typeof n === 'string' ? n : n?.type === 'Button' ? `${n.props?.hotkey ? `[${n.props.hotkey}] ` : ''}${n.props?.label ?? ''}` : (n?.children ?? []).map(textoDe).join('')
/** A band as one line: its top-level children's texts joined by two spaces. */
const linhaDe = (t: any) => (t?.children ?? []).map(textoDe).filter(Boolean).join('  ')
const nos = (n: any): number => (typeof n === 'string' ? 0 : 1 + (n?.children ?? []).reduce((s: number, c: any) => s + nos(c), 0))
const MAESTRO = /maestro|orquestrando|NOVARC|Agora/
/** A ledger line `min` minutes before now (ledger.py writes whole seconds). */
const linhaHa = (tipo: string, texto: string, min: number) =>
  `${tipo} ${texto}  # ${new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')}\n`
/** The $ calls since `n` that are not a `$.state.get` of this plugin (a get carries no `value`). */
const naoEstado = (m: Mundo, n: number) => m.eventos.slice(n).filter(x => !(x.e?.plugin === 'novarc' && typeof x.e?.key === 'string' && !('value' in x.e)))

test('band with 21 lanes of 300 events draws under 20 ms calling only $.state.get', async ($: any, on: any) => {
  const m = montar(on, {})
  ledger(m, 'C:/run/ledger', 21, 300)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/run/ledger --run-id x' })
  expect(Object.keys(escrito(m, 'exec').forks)).toHaveLength(21)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const arvore = await ui.drawn()
    expect(textoDe(arvore)).toMatch(MAESTRO)
    expect(linhaDe(arvore)).toContain('C01 · Em implementação · 0/21 specs')
    const n = m.eventos.length
    const dts: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      await ui.redraw()
      dts.push(performance.now() - t0)
    }
    expect(naoEstado(m, n).map(x => Object.keys(x.e ?? {}).join(','))).toEqual([])
    expect(m.eventos.slice(n).map(x => x.e.key)).not.toContain('exec')
    expect(Math.max(...dts)).toBeLessThan(20)
    await ui.unmount()
  }
})

test('pane for 3 runs, 9 sets and 21 specs draws under 2,000 nodes and 50,000 characters', async ($: any, on: any) => {
  const m = montar(on, {})
  const porConjunto = [3, 2, 2]
  for (let r = 0; r < 3; r++) {
    const codigo = r === 0 ? 'NOVARC-PLUGIN-MAESTRO' : `P${r}`
    if (r > 0) gravar(m, `${SESSOES}/orq-${r}.json`, entrada(`orq-${r}`, { papel: 'orquestrador', codigo, projeto: `Cliente ${r} · Projeto ${r}` }))
    for (let c = 0; c < 3; c++) {
      const C = `C0${c + 1}`
      const dir = `C:/r${r}/${C}/ledger`
      gravar(m, `${SESSOES}/set-${r}-${c}.json`, entrada(`set-${r}-${c}`, { papel: 'conjunto', conjunto: C, codigo, ledgerDir: dir }))
      for (let s = 1; s <= porConjunto[c]!; s++) {
        const S = `${C}-S0${s}`
        const branch = `feat/${S.toLowerCase()}-uma-spec-com-nome-longo-20261017`
        gravar(m, `${SESSOES}/spec-${r}-${S}.json`, entrada(`spec-${r}-${S}`, { papel: 'spec', conjunto: C, spec: S, codigo, branch, alerta: `${S} segura lock` }))
      }
      // this session's run carries the 21 lanes (7 per set); another run's lanes live in its own orchestrator
      for (let s = 1; r === 0 && s <= 7; s++) {
        const S = `${C}-S0${s}`
        let t = linhaHa('READY', `branch=feat/${S.toLowerCase()}-uma-spec-com-nome-longo-20261017`, 40)
        for (let j = 1; j <= 30; j++) t += linhaHa('TASK', `${j}/30 tarefa`, 40 - j)
        gravar(m, `${dir}/fork-${S.toLowerCase()}.md`, t + linhaHa('LOCK', 'db migration', 5))
      }
    }
  }
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })
    for (const aba of ['t-agora', 't-exec']) {
      await ui.press({ key: aba })
      const arvore = await ui.drawn()
      expect(textoDe(arvore)).toMatch(MAESTRO)
      expect(nos(arvore)).toBeLessThan(2000)
      expect(JSON.stringify(arvore).length).toBeLessThan(50_000)
    }
    expect((await ui.findAll({ type: 'Text', text: /^C\d{2}-S\d{2}$/ })).length).toBe(21)
    expect((await ui.findAll({ type: 'Text', text: /^C\d{2}( · .*)?$/ })).length).toBe(3) // own run's 3 sets only
    expect(await ui.find({ type: 'Text', text: /^mais / })).toBeUndefined()
    await ui.press({ key: 't-agora' })
    await ui.unmount()
  }
})

test('Execução past 21 lanes draws 21 and says mais 1 under the last block', async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, `${SESSOES}/set-1.json`, entrada('set-1', { papel: 'conjunto', conjunto: 'C01', ledgerDir: 'C:/set/ledger' }))
  for (let s = 1; s <= 22; s++) gravar(m, `C:/set/ledger/fork-c01-s${String(s).padStart(2, '0')}.md`, linhaHa('READY', 'x', 3))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })
    await ui.press({ key: 't-exec' })
    expect(textoDe(await ui.drawn())).toMatch(MAESTRO)
    expect((await ui.findAll({ type: 'Text', text: /^C01-S\d{2}$/ })).length).toBe(21)
    expect(await ui.find({ type: 'Text', text: /^mais 1$/ })).toBeDefined()
    await ui.press({ key: 't-agora' })
    await ui.unmount()
  }
})

test('orchestrator band shows the lock held only in a set ledger', async ($: any, on: any) => {
  const m = montar(on, {})
  m.semBanco = true // a failed db read: no poll text between the count and the alert
  ;['C01', 'C02', 'C03'].forEach((C, i) => gravar(m, `${SESSOES}/set-${i}.json`, entrada(`set-${i}`, { papel: 'conjunto', conjunto: C, ledgerDir: `C:/s${i}/ledger` })))
  gravar(m, 'C:/s0/ledger/fork-pane.md', linha('READY', 'branch=feat/c01-s02-pane-20261017') + linha('LOCK', 'db', 1))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const arvore = await ui.drawn()
    expect(textoDe(arvore)).toMatch(MAESTRO)
    expect(linhaDe(arvore)).toBe('orquestrando  3 conjuntos vivos  ● C01-S02 segura lock  [1] painel')
    expect((await ui.find({ type: 'Text', text: /^● C01-S02 segura lock$/ }))?.props.color).toBe('error')
    expect((await ui.find({ key: 'painel' }))?.props.variant).toBe('primary')
    await ui.unmount()
  }
})

test('set band reads C01 · Em implementação · 1/2 specs with a green and a red square', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'DONE C01-S01 pronto' })
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'LOCK db C01-S02 migration' })
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const arvore = await ui.drawn()
    expect(textoDe(arvore)).toMatch(MAESTRO)
    expect(linhaDe(arvore)).toBe('NOVARC  C01 · Em implementação · 1/2 specs  ■■  [1] painel')
    expect((await ui.findAll({ type: 'Text', text: /^■$/ })).map(q => q.props.color)).toEqual(['success', 'error'])
    await ui.unmount()
  }
  expect(m.abertos).toEqual([])
})

test('idle band presses: ativar opens the pane, nunca stores the cwd and hides the band', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (const surface of SUPERFICIES) {
    let ui = await $.ui.mount({ ...BANDA, surface })
    const arvore = await ui.drawn()
    expect(textoDe(arvore)).toMatch(MAESTRO)
    expect(linhaDe(arvore)).toBe('maestro  nenhuma execução aqui  [1] ativar  nunca neste projeto')
    await ui.press({ key: 'ativar' })
    expect(m.abertos.slice(-1)).toEqual(['novarc-maestro'])
    expect(escrito(m, 'maestroModo')).toBe('on')
    await ui.unmount()
    await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
    ui = await $.ui.mount({ ...BANDA, surface })
    expect(linhaDe(await ui.drawn())).toMatch(/^maestro {2}nenhuma execução aqui/)
    await ui.press({ key: 'nunca' })
    expect(m.store['maestro-nunca']).toEqual(['C:/repo'])
    expect(await ui.find({ key: 'ativar' })).toBeUndefined()
    await ui.unmount()
    await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
    expect(escrito(m, 'maestroModo')).toBe('off') // a /clear (no session.start) in the same cwd keeps the band off
    delete m.store['maestro-nunca']
    await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
    await iniciar($)
  }
})

test('Execução tab has no Acervo button and shows the C01 header with lane C01-S01 and há 16 min · CODEX', async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, `${SESSOES}/set-1.json`, entrada('set-1', { papel: 'conjunto', conjunto: 'C01', ledgerDir: 'C:/set/ledger' }))
  gravar(m, 'C:/set/ledger/fork-olhos-sessao-por-spec.md', linhaHa('READY', `branch=${NOVA}`, 40) + linhaHa('PLAN', 'p.md', 30) + linhaHa('CODEX', 'aprovado', 16.5))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })
    expect(textoDe(await ui.drawn())).toMatch(MAESTRO)
    expect(await ui.find({ key: 't-acervo' })).toBeUndefined()
    expect(await ui.find({ text: /Acervo/ })).toBeUndefined()
    expect(await ui.find({ text: 'registro: ~/.claude/maestro/sessoes · 2 sessões vivas · branch lida do git' })).toBeDefined()
    await ui.press({ key: 'abrir' }) // the card of this session's run opens the Execução tab
    expect((await ui.find({ type: 'Text', text: /^C01 · Base$/ }))?.props.bold).toBe(true)
    expect(await ui.find({ text: 'C01-S01' })).toBeDefined()
    expect(await ui.find({ text: 'ready    plan     codex    surfaces task     lock     pushed   done     ' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^há 16 min · CODEX$/ }))?.props.color).toBe('error')
    await ui.press({ key: 't-agora' })
    await ui.unmount()
  }
})

// ---- final review fixes

const vivos = (m: Mundo, ms: number) => m.timers.filter(t => t.ms === ms && !t.disparado && !t.abortado).length
const novos = (m: Mundo, n: number, ms: number) => m.timers.slice(n).filter(t => t.ms === ms).length

test('a hot reload (session.start again, state kept) arms the look of a set session and the look and poll of the orchestrator again', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  let n = m.timers.length
  await iniciar($)
  expect([novos(m, n, 60_000), novos(m, n, 300_000)]).toEqual([1, 0])
  expect([vivos(m, 60_000), vivos(m, 300_000)]).toEqual([1, 0])
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  n = m.timers.length
  await iniciar($)
  expect([novos(m, n, 60_000), novos(m, n, 300_000)]).toEqual([1, 1])
  expect([vivos(m, 60_000), vivos(m, 300_000)]).toEqual([1, 1])
})

test('a ledger fold in flight across session.end leaves the new session to fold the file from the start', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/ai/ledger --run-id x' })
  const f = m.arquivos['C:/repo/ai/ledger/fork-c02-s01.md']!
  gravar(m, 'C:/repo/ai/ledger/fork-c02-s01.md', f.text + linha('TASK', '1/3', 10))
  let soltar = () => {}
  m.segurar = dir => (dir === 'C:/repo/ai/ledger' ? new Promise<void>(r => (soltar = r)) : null)
  disparar(m)
  await dormir(40)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  m.segurar = null
  soltar()
  await quieto(m)
  m.id = 'sess-2'
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/ai/ledger --run-id x' })
  expect((escrito(m, 'exec') as any).forks['c02-s01']?.eventos.length).toBe(3)
})

test('a /maestro step that throws answers Maestro: falhou', async ($: any, on: any) => {
  const m = montar(on, {})
  m.falhar = p => p === 'ui.open:novarc-maestro'
  await iniciar($)
  const out = await $.command.run?.({ command: 'maestro', args: '' })
  expect(out.text).toBe('Maestro: falhou')
})

test('the Skill conjunto <url> <C> call overrides a branch-derived spec role; a ledger-derived conjunto does not', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  montar(on, escritos, SPEC)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/ai/ledger --run-id x' })
  expect(registro(escritos).papel).toBe('spec')
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: '' }) // a bare call names no set: the spec role stays
  expect(registro(escritos).papel).toBe('spec')
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  expect([registro(escritos).papel, registro(escritos).conjunto]).toEqual(['conjunto', 'C01'])
  expect(registro(escritos).spec).toBe(null) // the branch's spec id does not ride along on a set session
  await iniciar($) // a hot reload re-reads the spec branch: the set role keeps no spec id
  expect([registro(escritos).papel, registro(escritos).spec]).toEqual(['conjunto', null])
})

// ---- pendências C01-S01: the deferred and parked items

/** A one-shot hold: the first call `quando` accepts waits for `soltar()`, every other call passes. */
function umaVez(quando: (x: any) => boolean) {
  let soltar = () => {}
  let usado = false
  const segurar = (x: any) => {
    if (usado || !quando(x)) return null
    usado = true
    return new Promise<void>(r => (soltar = r))
  }
  return { segurar, soltar: () => soltar() }
}
/** Value-writes of this plugin's `$.state` keys since event `n`, by key. */
const escritasDesde = (m: Mundo, n: number) => m.eventos.slice(n).filter(x => x.e?.plugin === 'novarc' && 'value' in (x.e ?? {})).map(x => x.e.key as string)
/** Waits until `cond` holds, at most `ms`. */
async function esperar(m: Mundo, cond: () => boolean, ms = 1000) {
  const t0 = Date.now()
  while (!cond() && Date.now() - t0 < ms) await dormir(5)
}
const fim = ($: any) => $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })

test('a planning read whose config list fails keeps the previous lines and band; the next complete read writes them', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await quieto(m)
  expect(escrito(m, 'linhas')).toEqual(['C01 · não iniciado · 0/1 specs'])
  m.falharTool = e => e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'config'
  let n = m.eventos.length
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  expect(m.tools.slice(-3).map((t: any) => t.collection)).toEqual(['specs', 'execucao', 'config'])
  expect(escritasDesde(m, n).filter(k => k === 'linhas' || k === 'faixa')).toEqual([])
  m.falharTool = null
  n = m.eventos.length
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  expect(escritasDesde(m, n).filter(k => k === 'linhas' || k === 'faixa')).toEqual(['linhas', 'faixa'])
})

test('a planning read still in flight when the session ends writes no lines or band after the end', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await quieto(m)
  const h = umaVez(e => e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'specs')
  m.segurarTool = h.segurar
  const p = $.command.run?.({ command: 'maestro', args: '' })
  await dormir(40)
  await fim($)
  const n = m.eventos.length
  h.soltar()
  await p
  await quieto(m)
  expect(escritasDesde(m, n).filter(k => k === 'linhas' || k === 'faixa' || k === 'ctx')).toEqual([])
})

test('session start in flight across session.end prepares no band after the end', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  await iniciar($)
  await fim($) // after a /clear the first hook runs the session start (no session.start fires)
  m.id = 'sess-2'
  const h = umaVez(dir => dir === SESSOES)
  m.segurar = h.segurar
  const p = $.prompt.submit?.({ text: 'oi', origin: { kind: 'composer' } })
  await dormir(40)
  await fim($)
  const n = m.eventos.length
  h.soltar()
  await p
  await quieto(m)
  expect(escritasDesde(m, n)).toEqual([])
})

test('a registry write in flight across session.end prepares no band and records no registry place after the end', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC)
  await iniciar($)
  const h = umaVez(p => String(p).endsWith('/sessoes/sess-1.json'))
  m.segurar = h.segurar
  const p = $.tool.call({ tool: 'Skill', skill: 'x:other', args: '' })
  await dormir(40)
  await fim($)
  const n = m.eventos.length
  h.soltar()
  await p
  await quieto(m)
  expect(escritasDesde(m, n)).toEqual([])
})

test('desativar then the orchestrator skill arms no 5-minute poll', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.command.run?.({ command: 'maestro', args: 'desativar' })
  const n = m.timers.length
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  expect(novos(m, n, 300_000)).toBe(0)
})

/** A client repo with ai/specs/EXM/artefato.txt: session start finds the artifact and loads the plan. */
function comArtefato(m: Mundo) {
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL}\n`)
}

test('the first prompt after a clear returns under 50 ms while the Artifact read resolves after 2 s', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC, true)
  comArtefato(m)
  await iniciar($)
  expect((escrito(m, 'ctx') as any)?.artefato).toBe(URL)
  await fim($)
  m.id = 'sess-2'
  m.segurarTool = e => (e.tool === 'Artifact' ? dormir(2000).then(() => undefined) : null)
  const t0 = performance.now()
  await $.prompt.submit?.({ text: 'oi', origin: { kind: 'composer' } })
  expect(performance.now() - t0).toBeLessThan(50)
  await esperar(m, () => (escrito(m, 'ctx') as any)?.artefato === URL, 3000)
  expect((escrito(m, 'ctx') as any)?.artefato).toBe(URL)
})

test('a git push right after a clear still writes branch-publicada once the plan load finishes', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC, true)
  comArtefato(m)
  await iniciar($)
  await fim($)
  m.id = 'sess-2'
  m.segurarTool = e => (e.tool === 'Artifact' ? dormir(300).then(() => undefined) : null)
  const t0 = performance.now()
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${SPEC}` })
  expect(performance.now() - t0).toBeLessThan(50)
  const marco = () => m.tools.find((t: any) => t.tool === 'ArtifactData' && (t.action === 'set' || t.action === 'update') && t.data?.etapa === 'branch-publicada')
  await esperar(m, () => !!marco(), 2000)
  expect(marco()?.doc_id).toBe('C01-S01')
})

test('a conjunto prompt right after a clear keeps its set context when the background plan load finishes later', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  comArtefato(m)
  await iniciar($)
  await fim($)
  m.id = 'sess-2'
  let primeira = true
  m.segurarTool = e => {
    if (e.tool !== 'Artifact' || !primeira) return null
    primeira = false
    return dormir(300).then(() => undefined) // only the background load's read is slow
  }
  await $.prompt.submit?.({ text: `/novarc-session-build conjunto ${URL} C01`, origin: { kind: 'composer' } })
  await dormir(400)
  await quieto(m)
  expect([(escrito(m, 'ctx') as any)?.papel, (escrito(m, 'ctx') as any)?.artefato]).toEqual(['conjunto', URL])
})
