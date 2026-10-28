import { expect, test } from 'claude-code/testing'
import { raiasPorConjunto } from './execucao'

import {
  PLANO, URL, SESSOES, norm, gravar, banco, montar, dormir, chamadas, quieto, disparar, tick, armados, escrito, cancelados, registro, iniciar, CONJ, BUILD,
  partesDaFaixa, type Timer, type Mundo,
} from './mundo-teste'


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
  expect(await ui.find({ text: /^📄 registro: store do plugin/ })).toBeDefined() // C11-S01: the registry line's emoji
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
  // C03-S01: the guard's worktree root and default branch are read beside the gitdir, at start and after a switch
  const GIT = ['git rev-parse --git-dir', 'git rev-parse --show-toplevel', 'git symbolic-ref --short refs/remotes/origin/HEAD']
  expect([...m.runs].sort()).toEqual([...GIT].sort())
  for (let i = 0; i < 3; i++) await tick(m)
  expect(m.runs.length).toBe(3)
  await $.tool.call({ tool: 'Bash', command: `git switch ${NOVA}` })
  expect([...m.runs].sort()).toEqual([...GIT, ...GIT].sort())
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
const MAESTRO = /maestro|orquestrando|NOVARC|Agora|C\d{2}/ // C11-S01: a set band's title is its set id
/** C11-S01: the spec ids the desktop lanes tables draw (one name per row, in the Svg source). */
const idsNasTabelas = async (ui: any): Promise<string[]> =>
  (await ui.findAll({ type: 'Svg' })).filter((x: any) => String(x.props.alt).startsWith('etapas das specs de ')).flatMap((x: any) => [...String(x.props.source).matchAll(/font-family="ui-monospace, monospace"(?: font-weight="700")?>(C\d{2}-S\d{2})</g)].map(m => m[1]!))
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
      // C11-S01: on the desktop the lanes are Svg tables; their sources are capped on their own (R46)
      expect(JSON.stringify(arvore, (k, v) => (k === 'source' ? undefined : v)).length).toBeLessThan(50_000)
      for (const sv of await ui.findAll({ type: 'Svg' })) expect(String(sv.props.source).length).toBeLessThan(131_072)
    }
    // C05-S01 (R35): 21 progress rows across the 3 set cards; the detail card holds the selected set's 7 lanes
    if (surface === 'terminal') {
      expect((await ui.findAll({ type: 'Text', text: /^C\d{2}-S\d{2}$/ })).length).toBe(7)
      expect((await ui.findAll({ type: 'Text', text: /^S0\d$/ })).length).toBe(21)
    } else {
      expect(new Set((await idsNasTabelas(ui))).size).toBe(7)
      expect((await ui.findAll({ type: 'Svg' })).filter((x: any) => /^C0\d S0\d \d+\/8 etapas$/.test(String(x.props.alt))).length).toBe(21)
    }
    expect((await ui.findAll({ type: 'Text', text: /^C\d{2}( · .*)?$/ })).length).toBe(1) // the detail card's title
    expect((await ui.findAll({ type: 'Button' })).filter((b: any) => /^sel-C\d{2}$/.test(String(b.key))).length).toBe(3) // own run's 3 sets only
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
    if (surface === 'terminal') expect((await ui.findAll({ type: 'Text', text: /^C01-S\d{2}$/ })).length).toBe(21)
    else expect(new Set(await idsNasTabelas(ui)).size).toBe(21)
    // C05-S01: one cut under the card grid, one inside the detail card
    expect((await ui.findAll({ type: 'Text', text: /^mais 1$/ })).length).toBe(2)
    await ui.press({ key: 't-agora' })
    await ui.unmount()
  }
})

// C02-S01 replaces the C01 rule "any open LOCK in a set ledger is a band alert" by the orphan rule read from the set's
// espelho (interface.md: the band text `<spec> segura lock` becomes `lock órfão em <spec>` past the threshold).
async function bandaOrq($: any, on: any, min: number, segunda: Record<'desktop' | 'terminal', string[]>, botao: string) {
  {
    const m = montar(on, {}, 'main', true)
    m.db = { 'execucao/C01': { data: { iniciadoEm: 'x', espelho: espelhoCom({ 'migration db': { spec: 'C01-S02', desde: ha(min), estado: 'UNGRANTED' } }) }, version: 1 } }
    ;['C01', 'C02', 'C03'].forEach((C, i) => gravar(m, `${SESSOES}/set-${i}.json`, entrada(`set-${i}`, { papel: 'conjunto', conjunto: C, ledgerDir: `C:/s${i}/ledger` })))
    await iniciar($)
    await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
    await tick(m)
    for (const surface of SUPERFICIES) {
      const ui = await $.ui.mount({ ...BANDA, surface })
      const arvore = await ui.drawn()
      expect(textoDe(arvore)).toMatch(MAESTRO)
      // C11-S01: the three-column band (R19-R21) instead of one joined line
      const p = partesDaFaixa(arvore)
      expect([p.titulo, p.status, p.segunda]).toEqual(['orquestrando', '3 conjuntos vivos', segunda[surface]])
      expect(p.direita).toEqual([surface === 'desktop' ? 'modo manual' : ' [modo manual] ', botao])
      if (min === 32) {
        if (surface === 'terminal') expect((await ui.find({ type: 'Text', text: /^🔴 lock órfão em C01-S02$/ }))?.props.color).toBe('error')
        else expect((await ui.find({ type: 'Client' }))?.props.props).toEqual({ label: 'lock órfão em C01-S02' })
        expect((await ui.find({ key: 'ver' }))?.props.variant).toBe('primary')
        await ui.press({ key: 'ver' })
        expect(m.abertos.slice(-1)).toEqual(['novarc-maestro'])
        expect(escrito(m, 'maestroAba')).toBe('locks')
      }
      await ui.unmount()
    }
  }
}
test('orchestrator band shows an orphan lock from a set espelho in red with ver', async ($: any, on: any) => {
  await bandaOrq($, on, 32, { desktop: ['lock órfão em C01-S02'], terminal: ['🔴 lock órfão em C01-S02'] }, '[1] ver')
})
test('orchestrator band: a fresh lock in an espelho alerts nothing', async ($: any, on: any) => {
  await bandaOrq($, on, 2, { desktop: [], terminal: [] }, '[1] painel')
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
    const p = partesDaFaixa(arvore)
    expect([p.titulo, p.status, p.direita]).toEqual(['C01', 'C01 · Em implementação · 1/2 specs', ['[1] painel']])
    expect(p.segunda).toEqual(surface === 'desktop' ? ['1 de 2 specs em DONE', '1 de 2 specs em DONE'] : ['■■', '1 de 2 specs em DONE'])
    if (surface === 'terminal') expect((await ui.findAll({ type: 'Text', text: /^■$/ })).map(q => q.props.color)).toEqual(['success', 'error'])
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
    expect(partesDaFaixa(arvore)).toMatchObject({ titulo: 'maestro', status: 'nenhuma execução aqui', direita: ['nunca neste projeto', '[1] ativar'] })
    await ui.press({ key: 'ativar' })
    expect(m.abertos.slice(-1)).toEqual(['novarc-maestro'])
    expect(escrito(m, 'maestroModo')).toBe('on')
    await ui.unmount()
    await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
    ui = await $.ui.mount({ ...BANDA, surface })
    expect(partesDaFaixa(await ui.drawn())).toMatchObject({ titulo: 'maestro', status: 'nenhuma execução aqui' })
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
    expect(await ui.find({ text: '📄 registro: ~/.claude/maestro/sessoes · 2 sessões vivas · branch lida do git' })).toBeDefined()
    await ui.press({ key: 'abrir' }) // the card of this session's run opens the Execução tab
    expect((await ui.find({ type: 'Text', text: /^C01 · Base$/ }))?.props.bold).toBe(true)
    if (surface === 'terminal') {
      expect(await ui.find({ text: 'C01-S01' })).toBeDefined()
      // F4: the step header is one fixed-width column per step (it was one space-padded string)
      expect(linhasDeColunas(await ui.drawn())[0]?.children.map(textoDe)).toEqual(['ready', 'plan', 'codex', 'surfaces', 'task', 'lock', 'pushed', 'done'])
      expect((await ui.find({ type: 'Text', text: /^há 16 min · CODEX$/ }))?.props.color).toBe('error')
    } else {
      // C11-S01: one interactive lanes table per block (R14); the age column carries the quiet class
      const t = (await ui.findAll({ type: 'Svg' })).find(x => x.props.alt === 'etapas das specs de C01')
      expect(t?.props.isInteractive).toBe(true)
      expect(String(t?.props.source)).toContain('C01-S01')
      expect(String(t?.props.source)).toMatch(/class="ruimt"[^>]*>16 min</)
    }
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

test('a planning read whose execucao list fails keeps the previous lines and band; the next complete read writes them', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await quieto(m)
  expect(escrito(m, 'linhas')).toEqual(['C01 · não iniciado · 0/1 specs'])
  m.falharTool = e => e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'execucao'
  let n = m.eventos.length
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  expect(m.tools.slice(-2).map((t: any) => t.collection)).toEqual(['specs', 'execucao'])
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

// ---- C11-S02: artefato.txt read from .novarc/specs first, ai/specs second (A6)

const planoLido = (m: Mundo) => m.tools.some((t: any) => t.tool === 'Artifact' && t.action === 'read' && t.url === URL && t.path === 'plano.json')

test('A6: session start finds the artifact in .novarc/specs and loads its plan', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC, true)
  gravar(m, 'C:/repo/.novarc/specs/EXM/artefato.txt', `${URL}\n`)
  await iniciar($)
  expect((escrito(m, 'ctx') as any)?.artefato).toBe(URL)
  expect(planoLido(m)).toBe(true)
})

test('A6: legacy ai/specs artefato loads the same plan', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC, true)
  comArtefato(m)
  await iniciar($)
  expect((escrito(m, 'ctx') as any)?.artefato).toBe(URL)
  expect(planoLido(m)).toBe(true)
})

test('A6: .novarc wins over ai/specs', async ($: any, on: any) => {
  const m = montar(on, {}, SPEC, true)
  gravar(m, 'C:/repo/.novarc/specs/EXM/artefato.txt', `${URL}\n`)
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', 'https://claude.ai/artifact/OUTRO\n')
  await iniciar($)
  expect((escrito(m, 'ctx') as any)?.artefato).toBe(URL)
})

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


// ---- C02-S01: the automatic sweep, the alerts and the two mirrors (integration over the same world)

const ha = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
const espelhoCom = (locks: Record<string, any>, extra: Record<string, any> = {}) => ({
  locks, specs: {}, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at: new Date().toISOString(), ...extra,
})
const KDIR = 'C:/dev/kidsy/.superpowers/session-build/20261023-0910'
const ODIR = 'C:/orq/20261023-0900'
const FORK = `${KDIR}/fork-c03-s01.md`
/** A sweep output with these OUTSTANDING lines and the summary ledger.py always prints. */
const saida = (...l: string[]) => ({ exitCode: l.length ? 1 : 0, stdout: [...l, `SWEEP SUMMARY forks=1 grants=0 outstanding=${l.length} ungranted=${l.length}`].join('\n') + '\n' })
const OUT = (res: string, min: number, slug = 'c03-s01', kind = 'migration') => `SWEEP OUTSTANDING ${slug} ${kind} ${res} [UNGRANTED] since=${ha(min)} LOCK ${kind} ${res}`
const varreduras = (m: Mundo) => m.runs.filter(r => r.includes(' sweep --dir ')).length
const escritas = (m: Mundo, doc?: string) =>
  m.tools.filter((t: any) => t.tool === 'ArtifactData' && ['set', 'update'].includes(t.action) && (!doc || `${t.collection}/${t.doc_id}` === doc)) as any[]
const chamadasDoc = (m: Mundo, doc: string) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && `${t.collection}/${t.doc_id}` === doc).map((t: any) => t.action)
const alertasDe = (m: Mundo) => escrito(m, 'maestroAlertas') as any
/** Appends one stamped line to the set's fork ledger (a change the marker sees). */
const mexer = (m: Mundo, tipo = 'TASK', texto = '1/2') => gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa(tipo, texto, 0))
/** A timer look that may sweep: the 5 s gate's clock moves 10 s first. */
async function olhar(m: Mundo) {
  m.avanco += 10_000
  await tick(m)
}
/** The held debounce (or its reschedule): any armed timer shorter than the one-minute look. */
function dispararAdiada(m: Mundo) {
  const t = [...m.timers].reverse().find(x => x.ms < 60_000 && !x.disparado && !x.abortado)
  if (!t) throw new Error('no armed debounce')
  t.disparado = true
  t.fire()
}

/** A set session of C03 whose ledger dir is the Kidsy run's, with one fork file; `db` makes it a planned run. */
async function conjuntoC03($: any, on: any, db: Record<string, { data: any; version: number }> | null = null, antes: (m: Mundo) => void = () => {}) {
  const m = montar(on, {}, 'main', !!db)
  m.db = db
  antes(m)
  gravar(m, FORK, linhaHa('READY', 'c03-s01 branch=feat/c03-s01-x-20261023', 30))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `conjunto ${URL} C03` })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py init --dir ${KDIR} --run-id 20261023-0910` })
  await quieto(m)
  return m
}

/** An orchestrator of a planned run; `ledger` becomes its own ledger.md under ODIR. */
async function orquestrador($: any, on: any, db: Record<string, { data: any; version: number }>, ledger = '') {
  const m = montar(on, {}, 'main', true)
  m.db = db
  if (ledger) gravar(m, `${ODIR}/ledger.md`, ledger)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py init --dir ${ODIR} --run-id 20261023-0900` })
  await quieto(m)
  return m
}
const poll = async ($: any, m: Mundo) => {
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
}

test('20 LOCK lines through session.receive in 2 s give one sweep 5 s after the last (A1, R31)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  const n0 = m.timers.filter(t => t.ms === 5000).length
  for (let i = 0; i < 20; i++) await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'LOCK migration 20261023_auditoria C03-S01' })
  const ts = m.timers.filter(t => t.ms === 5000).slice(n0)
  expect([ts.length, ts.filter(t => t.abortado).length, varreduras(m)]).toEqual([20, 19, 0])
  m.avanco += 10_000
  disparar(m, 5000)
  await quieto(m)
  const vs = m.runs.filter(r => r.includes(' sweep --dir '))
  expect(vs.length).toBe(1)
  expect(vs[0]!.endsWith(`sweep --dir ${KDIR}`)).toBe(true)
})

test('two looks over unchanged fork files start no second sweep; a changed file does (A2)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  await olhar(m)
  expect(varreduras(m)).toBe(1)
  await olhar(m)
  expect(varreduras(m)).toBe(1)
  mexer(m)
  await olhar(m)
  expect(varreduras(m)).toBe(2)
})

test('exit 2, 0 fork files or a failed process keep the rows and say varredura sem leitura (A5)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweep = saida(OUT('20261023_auditoria', 1))
  await olhar(m)
  expect([alertasDe(m).sweep.linhas.length, alertasDe(m).sweep.semLeitura]).toEqual([1, false])
  for (const falha of [{ exitCode: 2, stdout: '' }, { exitCode: 0, stdout: 'SWEEP WARNING 0 fork ledger files in C:/x - nothing\nSWEEP SUMMARY forks=0 grants=0 outstanding=0 ungranted=0\n' }, null]) {
    if (falha) m.sweep = falha
    else m.sweepFalha = true
    mexer(m)
    await olhar(m)
    expect([alertasDe(m).sweep.linhas.length, alertasDe(m).sweep.semLeitura]).toEqual([1, true])
  }
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  // C11-S01: the same line inside the warning partial-failure card (R31), above the last listed locks
  expect((await ui.find({ type: 'Text', text: 'varredura sem leitura' }))?.props.color).toBe('warning')
  expect((await ui.find({ key: 'falha' }))?.props.borderColor).toBe('warning')
  expect(await ui.find({ type: 'Text', text: '20261023_auditoria' })).toBeDefined()
  await ui.unmount()
})

test('the sweep adds under 50 ms to the ledger.py hook and is never awaited (A30)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweepAtraso = 1000
  const dur = async (tipo: string) => {
    const t0 = performance.now()
    await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${KDIR} --fork c03-s01 --type ${tipo} --text "migration a"` })
    return performance.now() - t0
  }
  const lock: number[] = []
  const nota: number[] = []
  for (let i = 0; i < 5; i++) {
    lock.push(await dur('LOCK'))
    expect(varreduras(m)).toBe(0)
    nota.push(await dur('NOTE'))
  }
  const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[2]!
  expect(med(lock) - med(nota)).toBeLessThan(50)
  expect(Math.max(...lock)).toBeLessThan(1000)
  expect(m.timers.filter(t => t.ms === 5000 && !t.abortado && !t.disparado).length).toBe(1) // the debounce, held
})

test('a session with no recognised run starts no process, raises no alert and writes nothing (A28)', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (let i = 0; i < 10; i++) await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  expect([varreduras(m), escritas(m).length, m.toasts.length, m.timers.filter(t => t.ms === 5000).length]).toEqual([0, 0, 0, 0])
})

test('session end cancels the pending sweep; a sweep in flight writes nothing after the end', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'LOCK migration x C03-S01' })
  m.sweepAtraso = 300
  m.avanco += 10_000
  disparar(m) // a look whose sweep is now in flight
  await dormir(80)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  expect(cancelados(m, 5000)).toBe(1)
  await dormir(400)
  await quieto(m)
  expect(alertasDe(m)).toBe(null)
})

test('look and debounce interleaved run at most one sweep per 5 s (R31)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'LOCK migration x C03-S01' })
  mexer(m)
  await olhar(m)
  expect(varreduras(m)).toBe(1)
  expect(m.timers.filter(t => t.ms === 5000 && !t.abortado && !t.disparado).length).toBe(0) // the look's sweep aborted the pending one
  mexer(m)
  await tick(m) // same clock: inside the 5 s window
  expect(varreduras(m)).toBe(1)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'RELEASE migration x C03-S01' })
  dispararAdiada(m)
  await quieto(m)
  expect(varreduras(m)).toBe(1) // refused, rescheduled for the rest of the window
  const resto = [...m.timers].reverse().find(x => x.ms < 60_000 && !x.disparado && !x.abortado)!
  expect(resto.ms).toBeLessThan(5001)
  m.avanco += 10_000
  dispararAdiada(m)
  await quieto(m)
  expect(varreduras(m)).toBe(2)
})

const DB_C03 = () => ({ 'execucao/C03': { data: { sessao: 's', iniciadoEm: 'x' }, version: 1 } })

test('three summary changes over 10 looks give three espelho updates of execucao/C03 with only the field espelho (A19, A20)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  for (let i = 1; i <= 10; i++) {
    if (i === 4 || i === 7) mexer(m, 'TASK', `${i}/9`)
    await olhar(m)
  }
  const w = escritas(m)
  expect(w.length).toBe(3)
  expect(w.every(x => x.action === 'update' && x.collection === 'execucao' && x.doc_id === 'C03' && Object.keys(x.data).join() === 'espelho')).toBe(true)
  expect(m.db!['execucao/C03']!.data.sessao).toBe('s')
  expect(m.db!['execucao/C03']!.data.espelho.specs['C03-S01'].texto).toBe('TASK 7/9')
})

test('first espelho write: get then set without if_version when absent; a moved version is re-read and succeeds (A21)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, {})
  await olhar(m)
  expect(chamadasDoc(m, 'execucao/C03')).toEqual(['get', 'set'])
  expect(m.tools.find((t: any) => t.action === 'set')?.if_version).toBe(undefined)
  m.db!['execucao/C03']!.version += 5 // another writer moved it
  mexer(m)
  await olhar(m)
  expect(chamadasDoc(m, 'execucao/C03')).toEqual(['get', 'set', 'update', 'get', 'update'])
  expect(m.db!['execucao/C03']!.version).toBe(7)
})

test('ArtifactData failing on every call leaves the ledger.py result unchanged and retries on the next look (A22)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  m.semBanco = true
  const r = await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${KDIR} --fork c03-s01 --type LOCK --text "migration a"` })
  expect([r.text, !!r.isError]).toEqual(['ok', false])
  await olhar(m)
  const n = chamadasDoc(m, 'execucao/C03').length
  expect(n).toBeGreaterThan(0)
  await olhar(m)
  expect(chamadasDoc(m, 'execucao/C03').length).toBeGreaterThan(n)
})

test('a credential checkpoint is mirrored as its keyword (A23)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  mexer(m, 'TASK', '3/7 token ghp_abc123XYZ exposto')
  await olhar(m)
  expect(m.db!['execucao/C03']!.data.espelho.specs['C03-S01'].texto).toBe('TASK')
})

test('no espelho write while the sweep has no reading', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  await olhar(m)
  expect(escritas(m).length).toBe(1)
  m.sweep = { exitCode: 2, stdout: '' }
  mexer(m)
  await olhar(m)
  expect(escritas(m).length).toBe(1)
  m.sweep = null
  await olhar(m) // the old marker was kept, so this look sweeps again and reads
  expect(escritas(m).length).toBe(2)
})

const LENTO_8 = { timeoutMs: 20_000 }
const LIM_18 = () => ({ 'config/orquestracao': { data: { limiares: { calado: 18, lockOrfao: 24, fonte: 'medido', at: 'x' } }, version: 1 } })
const getsConfig = (m: Mundo) => chamadasDoc(m, 'config/orquestracao').filter(a => a === 'get').length

test('the set session takes its thresholds from the config list of the refresh, with no get of config/orquestracao (A17, R3-5)', LENTO_8, async ($: any, on: any) => {
  const m = await conjuntoC03($, on, { ...DB_C03(), ...LIM_18() })
  for (let i = 0; i < 10; i++) await olhar(m)
  expect(getsConfig(m)).toBe(0)
  expect(alertasDe(m).limiares).toEqual({ calado: 18, lockOrfao: 24 })
})

test('a failed config list gives 15 and 20 (A17)', LENTO_8, async ($: any, on: any) => {
  const m = await conjuntoC03($, on, { ...DB_C03(), ...LIM_18() }, w => {
    w.falharTool = e => e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'config'
  })
  await olhar(m)
  expect(alertasDe(m).limiares).toEqual({ calado: 15, lockOrfao: 20 })
})

const datas = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData')
const listasDesde = (m: Mundo, n: number) => datas(m).slice(n).filter((t: any) => t.action === 'list').map((t: any) => t.collection)

test('A43: a set session idle for 10 looks with the poll firing twice makes at most 4 ArtifactData calls, no get of config (R44)', LENTO_8, async ($: any, on: any) => {
  const m = await conjuntoC03($, on, { ...DB_C03(), ...LIM_18() })
  await olhar(m) // the first look writes the espelho once; idle from here
  const n = datas(m).length
  for (let i = 0; i < 10; i++) await olhar(m)
  for (let i = 0; i < 2; i++) {
    disparar(m, 300_000)
    await quieto(m)
  }
  expect(datas(m).length - n).toBeLessThanOrEqual(4)
  expect(listasDesde(m, n)).toEqual(['specs', 'execucao', 'specs', 'execucao'])
  expect(getsConfig(m)).toBe(0)
})

test('a received HOLD in a set session refreshes execucao and config at once; the limiares follow the new config (R37, R3-5)', LENTO_8, async ($: any, on: any) => {
  const m = await conjuntoC03($, on, { ...DB_C03(), ...LIM_18() })
  expect(alertasDe(m).limiares).toEqual({ calado: 18, lockOrfao: 24 })
  m.db!['config/orquestracao'] = { data: { limiares: { calado: 21, lockOrfao: 30, fonte: 'medido', at: 'y' } }, version: 2 }
  const n = datas(m).length
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'HOLD C03 colisão' })
  await quieto(m)
  expect(listasDesde(m, n)).toEqual(['execucao', 'config'])
  expect(alertasDe(m).limiares).toEqual({ calado: 21, lockOrfao: 30 })
})

test('the orchestrator poll still lists specs, execucao and config (R44)', LENTO_8, async ($: any, on: any) => {
  const m = await orquestrador($, on, {})
  const n = datas(m).length
  disparar(m, 300_000)
  await quieto(m)
  expect(listasDesde(m, n).filter(c => c !== 'pendencias')).toEqual(['specs', 'execucao', 'config'])
})

test('direct looks neither read limiares nor write the espelho; the next timer look writes once (R17, R19)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, { ...DB_C03(), ...LIM_18() })
  for (let i = 0; i < 5; i++) {
    mexer(m, 'TASK', `${i}/5`)
    m.avanco += 10_000
    await poll($, m)
  }
  expect([getsConfig(m), escritas(m).length]).toEqual([0, 0])
  await olhar(m)
  expect(escritas(m, 'execucao/C03').length).toBe(1)
})

test('a spec session over the same ledger dir never sweeps and writes nothing (A20)', async ($: any, on: any) => {
  const m = montar(on, {}, 'feat/c03-s01-x-20261023', true)
  m.db = DB_C03()
  gravar(m, FORK, linhaHa('READY', 'c03-s01', 30))
  await iniciar($)
  for (let i = 0; i < 10; i++) {
    await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${KDIR} --fork c03-s01 --type LOCK --text "migration a${i}"` })
    mexer(m)
    await olhar(m)
  }
  expect([varreduras(m), escritas(m).length]).toEqual([0, 0])
})

test('the orchestrator never writes execucao/* (A20)', async ($: any, on: any) => {
  const m = await orquestrador($, on, DB_C03())
  for (let i = 0; i < 10; i++) {
    gravar(m, `${ODIR}/fork-x.md`, linhaHa('TASK', `${i}/9`, 0))
    await olhar(m)
  }
  expect(escritas(m).filter(w => w.collection === 'execucao').length).toBe(0)
})

test('an orphan lock in the set session toasts once over three looks (A8)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweep = saida(OUT('20261023_auditoria', 21))
  for (let i = 0; i < 3; i++) {
    mexer(m)
    await olhar(m)
  }
  expect(m.toasts).toEqual(['Maestro: C03-S01 segura 20261023_auditoria há 21 min sem RELEASE'])
})

// ---- orchestrator

test('a mirrored lock past the threshold alerts on a later look without a new poll; the espelho without it clears it on the next poll (A29)', async ($: any, on: any) => {
  const desde = new Date(Date.now() - 20 * 60_000 + 3000).toISOString()
  const m = await orquestrador($, on, { 'execucao/C03': { data: { iniciadoEm: 'x', espelho: espelhoCom({ 'migration a': { spec: 'C03-S01', desde, estado: 'UNGRANTED' } }) }, version: 1 } })
  await tick(m)
  expect(alertasDe(m).lista.length).toBe(0)
  const listas = m.tools.filter((t: any) => t.action === 'list').length
  await dormir(3100)
  await tick(m)
  expect(alertasDe(m).lista[0]?.texto).toBe('lock órfão em C03-S01')
  expect(m.tools.filter((t: any) => t.action === 'list').length).toBe(listas)
  m.db!['execucao/C03']!.data.espelho = espelhoCom({})
  await poll($, m)
  expect(alertasDe(m).lista.length).toBe(0)
})

const B3 = 'feat/c03-s01-guardas-diretivas-auditoria-20261023'

test('a verify slot held 25 min is listed with its holder and raises the slot alert (A10)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {}, linhaHa('LOCK', `verify ${B3} C03 from=a sid=b`, 26) + linhaHa('GO', `C03 verify ${B3}`, 25))
  await tick(m)
  expect(alertasDe(m).lista[0]?.chave).toBe(`slot:C03:verify:${B3}`)
  expect(alertasDe(m).vista.slots.verify.dono.conjunto).toBe('C03')
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect(await ui.find({ type: 'Text', text: 'verify  C03  25 min' })).toBeDefined()
  await ui.unmount()
})

test('a quiet set alerts in the orchestrator, a merged one never (A9 wiring)', async ($: any, on: any) => {
  const m = await orquestrador($, on, { 'config/orquestracao': { data: { limiares: { calado: 0, lockOrfao: 20, fonte: 'medido', at: 'x' } }, version: 1 } })
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'CONJUNTO C03 implementacao C03-S01' })
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'CONJUNTO C04 merge C04-S01' })
  await tick(m)
  expect(alertasDe(m).lista.map((a: any) => a.texto)).toEqual(['C03 calada há 0 min'])
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect(await ui.find({ type: 'Text', text: 'C03  sem sinal há 0 min' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: ' [calada] ' }))?.props.backgroundColor).toBe('diffRemovedDimmed') // C11-S01: the pill's terminal fallback
  await ui.unmount()
})

test('two polls with no change write config/orquestracao once; sessao is the plan orchestrator; no session id (A24)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {})
  await poll($, m)
  await poll($, m)
  const w = escritas(m, 'config/orquestracao')
  expect(w.map(x => x.action)).toEqual(['set'])
  const d = m.db!['config/orquestracao']!.data
  expect([d.runId, d.sessao, d.limiares.fonte]).toEqual(['20261023-0900', 'novarc-orq-NOVARC-PLUGIN-MAESTRO', 'padrao'])
  expect(JSON.stringify(d).includes('sess-1')).toBe(false)
})

test('the proposal comes from the espelhos rhythm and two polls with six samples write once (A14, R24)', async ($: any, on: any) => {
  const r = { checkpointMin: 9, lockMin: 12, amostras: 3 }
  const m = await orquestrador($, on, {
    'execucao/C03': { data: { espelho: espelhoCom({}, { ritmo: r }) }, version: 1 },
    'execucao/C04': { data: { espelho: espelhoCom({}, { ritmo: r }) }, version: 1 },
  })
  await poll($, m)
  await poll($, m)
  expect(escritas(m, 'config/orquestracao').length).toBe(1)
  const p = m.db!['config/orquestracao']!.data.proposta
  expect([p.calado, p.lockOrfao, p.amostras]).toEqual([18, 24, 6])
})

test('a poll racing "usar o medido" keeps medido: pinned to the list version first, re-read only after the refusal', async ($: any, on: any) => {
  const m = await orquestrador($, on, { 'config/orquestracao': { data: { runId: '20261023-0900', limiares: { calado: 15, lockOrfao: 20, fonte: 'padrao', at: 'x' } }, version: 3 } })
  let uma = true
  m.segurarTool = e => {
    if (uma && e.action === 'update' && e.collection === 'config') {
      uma = false
      const d = m.db!['config/orquestracao']!
      m.db!['config/orquestracao'] = { data: { ...d.data, limiares: { calado: 18, lockOrfao: 24, fonte: 'medido', at: 'y' } }, version: d.version + 1 }
    }
    return null
  }
  const n = chamadasDoc(m, 'config/orquestracao').length
  await poll($, m)
  expect(chamadasDoc(m, 'config/orquestracao').slice(n)).toEqual(['update', 'get', 'update'])
  expect(m.tools.filter((t: any) => t.collection === 'config' && t.action === 'update')[0].if_version).toBe(3)
  expect(m.db!['config/orquestracao']!.data.limiares.fonte).toBe('medido')
})

test('an orphan lock, a quiet set and a ready set over 10 looks and 2 polls send nothing (A12)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {
    // C03-S01: the orchestrator's own directives (directive-nudge) are paused, so only C02-S01 detection runs here
    'config/continuo': { data: { modo: 'pausado' }, version: 1 },
    'config/orquestracao': { data: { limiares: { calado: 0, lockOrfao: 20, fonte: 'medido', at: 'x' } }, version: 1 },
    'specs/C01-S01': { data: { etapa: 'branch-publicada', headSha: 'h', validacao: { resultado: 'aprovado', sha: 'h' } }, version: 1 },
    'execucao/C01': { data: { iniciadoEm: 'x', espelho: espelhoCom({}) }, version: 1 },
    'execucao/C03': { data: { espelho: espelhoCom({ 'migration a': { spec: 'C03-S01', desde: ha(30), estado: 'UNGRANTED' } }) }, version: 1 },
  })
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'CONJUNTO C04 implementacao C04-S01' })
  for (let i = 0; i < 10; i++) await tick(m)
  await poll($, m)
  await poll($, m)
  expect(alertasDe(m).lista.length).toBeGreaterThan(1)
  expect(m.eventos.filter(x => x.e && typeof x.e === 'object' && 'to' in x.e && 'text' in x.e && x.e.to !== 'transcript').map(x => JSON.stringify(x.e).slice(0, 200))).toEqual([]) // ui.log goes to the transcript; a send names a session
  expect(m.tools.filter((t: any) => t.tool === 'SendMessage').length).toBe(0)
})

// ---- band and tab

test('set session: an orphan lock turns the band red and its row reads 21 min sem RELEASE (A7)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweep = saida(OUT('20261023_auditoria', 21))
  await olhar(m)
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await banda.find({ type: 'Text', text: '🔴 lock órfão em C03-S01' }))?.props.color).toBe('error')
  await banda.unmount()
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect((await ui.find({ type: 'Text', text: '21 min sem RELEASE' }))?.props.color).toBe('error')
  // C11-S01: the KPI cards replace the summary line
  for (const [k, n, t] of [['lk-2', '1', 'lock órfão'], ['lk-1', '1', 'recursos em uso']]) {
    const kpi = await ui.find({ key: k })
    expect([kpi?.text.includes(n), kpi?.text.includes(t)]).toEqual([true, true])
  }
  expect(await ui.find({ type: 'Text', text: 'limiares: calada 15 min · órfão 20 min · medindo o seu ritmo' })).toBeDefined() // A13
  expect(await ui.find({ key: 'usar-medido' })).toBeUndefined() // A16, set pane
  await ui.unmount()
})

test('set session: a lock at 19 min raises no alert and its row reads 19 min (A7)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweep = saida(OUT('20261023_auditoria', 19))
  await olhar(m)
  expect(alertasDe(m).lista.filter((a: any) => a.chave.startsWith('lock:')).length).toBe(0)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect(await ui.find({ type: 'Text', text: '19 min' })).toBeDefined()
  await ui.unmount()
})

test('the spec session pane draws no usar o medido (A16)', async ($: any, on: any) => {
  const m = montar(on, {}, 'feat/c03-s01-x-20261023')
  await iniciar($)
  await quieto(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect(await ui.find({ key: 'usar-medido' })).toBeUndefined()
  await ui.unmount()
})

test('a set ready to close with no lock turns the orchestrator band green with the hint (A18)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {
    'specs/C01-S01': { data: { etapa: 'branch-publicada', headSha: 'h', validacao: { resultado: 'aprovado', sha: 'h' } }, version: 1 },
    'execucao/C01': { data: { iniciadoEm: 'x', espelho: espelhoCom({}) }, version: 1 },
  })
  await poll($, m)
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await banda.find({ type: 'Text', text: 'pronto para fechar' }))?.props.color).toBe('success')
  expect(await banda.find({ type: 'Text', text: 'C01 com as 1 specs em DONE, sem lock aberto' })).toBeDefined()
  expect((await banda.find({ type: 'Text', text: 'peça o FECHA na conversa' }))?.props.color).toBe('subtle') // C11-S01: theme key, no dimColor
  await banda.unmount()
})

test('one lock in the espelho withholds the green band (A18)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {
    'specs/C01-S01': { data: { etapa: 'branch-publicada', headSha: 'h', validacao: { resultado: 'aprovado', sha: 'h' } }, version: 1 },
    'execucao/C01': { data: { iniciadoEm: 'x', espelho: espelhoCom({ 'migration a': { spec: 'C01-S01', desde: ha(2), estado: 'UNGRANTED' } }) }, version: 1 },
  })
  await poll($, m)
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await banda.find({ type: 'Text', text: 'pronto para fechar' })).toBeUndefined()
  await banda.unmount()
})

test('usar o medido writes config/orquestracao.limiares pinned to the kept version (A15)', async ($: any, on: any) => {
  const m = await orquestrador($, on, {
    'config/orquestracao': { data: { limiares: { calado: 15, lockOrfao: 20, fonte: 'padrao', at: 'x' }, proposta: { calado: 18, lockOrfao: 24, amostras: 6, at: 'x' } }, version: 7 },
  })
  m.db!['config/orquestracao']!.data.runId = 'outro' // keep the poll's own write out of this test
  await tick(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  const antes = escritas(m, 'config/orquestracao').length
  await ui.press({ key: 'usar-medido' })
  await quieto(m)
  const w = escritas(m, 'config/orquestracao').slice(antes)
  expect(w.length).toBe(1)
  expect([w[0].action, w[0].if_version, Object.keys(w[0].data).join()]).toEqual(['update', 7, 'limiares'])
  expect([w[0].data.limiares.calado, w[0].data.limiares.lockOrfao, w[0].data.limiares.fonte]).toEqual([18, 24, 'medido'])
  expect(alertasDe(m).limiares).toEqual({ calado: 18, lockOrfao: 24 })
  await ui.unmount()
})

test('Locks e filas caps at 50 rows and says mais 30 (A32)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  m.sweep = saida(...Array.from({ length: 80 }, (_, i) => OUT(`res-${i}.sql`, 1)))
  await olhar(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-locks' })
  expect((await ui.findAll({ type: 'Text', text: /^res-\d+\.sql$/ })).length).toBe(50)
  expect(await ui.find({ type: 'Text', text: 'mais 30' })).toBeDefined()
  await ui.unmount()
})


// ---- C02-S01 rework: the poll in every planned session (F1), shell-variable ledger args (F2), lane columns (F4)

const ARTEFATO = 'C:/repo/ai/specs/NOVARC/artefato.txt'

test('a spec session whose plan came from artefato.txt arms the 5-minute poll and its tick re-reads the db (F1)', async ($: any, on: any) => {
  const m = montar(on, {}, 'feat/c01-s01-x-20261023', true)
  gravar(m, ARTEFATO, URL)
  m.db = { 'specs/C01-S01': { data: { etapa: 'implementando' }, version: 1 } }
  await iniciar($)
  await quieto(m)
  expect(escrito(m, 'linhas')).toEqual(['C01 · implementando · 0/1 specs'])
  expect(vivos(m, 300_000)).toBe(1)
  m.db['specs/C01-S01']!.data.etapa = 'branch-publicada'
  disparar(m, 300_000)
  await quieto(m)
  expect(escrito(m, 'linhas')).toEqual(['C01 · branch publicada · 0/1 specs'])
})

test("a set session's poll survives a hot reload (F1)", async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(1)
  await iniciar($) // hot reload: state kept, timers cancelled
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(1)
})

test('a session with no recognised run arms no poll even with artefato.txt (F1, R28)', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  gravar(m, ARTEFATO, URL)
  await iniciar($)
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(0)
})

test('a ledger call with $D and $F creates no lane and keeps the known ledger dir (F2)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir "$D" --fork "$F" --type TASK --text "1/2"' })
  await quieto(m)
  const ex = escrito(m, 'exec') as any
  expect(ex.ledgerDir).toBe(KDIR)
  expect(Object.keys(ex.forks).some((k: string) => k.includes('$'))).toBe(false)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-exec' })
  expect(await ui.find({ type: 'Text', text: `ledger ${KDIR}` })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\$D/ })).toBeUndefined()
  await ui.unmount()
})

test('a session with no role that writes --fork "$F" becomes a spec session, not a set session (F2)', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${KDIR} --fork "$F" --type READY --text "x"` })
  await quieto(m)
  const ex = escrito(m, 'exec') as any
  expect([ex.papel, ex.ledgerDir, Object.keys(ex.forks).some((k: string) => k.includes('$'))]).toEqual(['spec', KDIR, false])
})

/** The row Boxes of the Execução tab: the header (the step names) and the lanes, each child one fixed-width column. */
const linhasDeColunas = (n: any): any[] =>
  typeof n === 'string' || !n ? [] : [...(n.type === 'Box' && (n.children ?? []).length === 8 && (n.children ?? []).every((c: any) => c?.type === 'Box' && c.props?.width === 9) ? [n] : []), ...(n.children ?? []).flatMap(linhasDeColunas)]

test('the task counter is drawn in the task column, one fixed-width box per step (F4)', async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, `${SESSOES}/set-1.json`, entrada('set-1', { papel: 'conjunto', conjunto: 'C01', ledgerDir: 'C:/set/ledger' }))
  gravar(m, 'C:/set/ledger/fork-olhos.md', linhaHa('READY', `branch=${NOVA}`, 40) + linhaHa('PLAN', 'p.md', 30) + linhaHa('CODEX', 'aprovado', 20) + linhaHa('SURFACES', 'x', 10) + linhaHa('TASK', '10/11', 2))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await tick(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-exec' })
  const [cab, raia] = linhasDeColunas(await ui.drawn())
  expect(cab?.children.map(textoDe)).toEqual(['ready', 'plan', 'codex', 'surfaces', 'task', 'lock', 'pushed', 'done'])
  expect(raia?.children.map(textoDe)).toEqual(['ready', 'plan', 'codex', 'surfaces', '10/11', '·', '·', '·'])
  await ui.unmount()
})

/** A spec session with a loaded plan and its poll; then every read of the context waits on `soltar`. */
async function comLeituraPresa($: any, on: any) {
  const m = montar(on, {}, 'feat/c01-s01-x-20261023', true)
  gravar(m, ARTEFATO, URL)
  await iniciar($)
  await quieto(m)
  let soltar = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  m.segurarEstado = e => (e?.key === 'ctx' ? preso : null)
  return { m, soltar }
}

test('two callers of garantirPoll that reach the final check together arm one poll (F1)', async ($: any, on: any) => {
  const { m, soltar } = await comLeituraPresa($, on)
  const recarga = iniciar($) // hot reload: cancels the poll, its garantirPoll waits on the held read
  await dormir(80)
  disparar(m) // the newly armed look: its garantirPoll waits on the same read
  await dormir(80)
  m.segurarEstado = null
  soltar()
  await recarga
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(1)
})

test('a garantirPoll read that ends between the cancellation and the generation bump arms nothing (F1)', async ($: any, on: any) => {
  const { m, soltar } = await comLeituraPresa($, on)
  const recarga = iniciar($) // its garantirPoll waits on the held ctx read
  await dormir(80)
  let soltarFim = () => {}
  const fimPreso = new Promise<void>(r => (soltarFim = r))
  m.segurar = p => (p.endsWith('/sessoes/sess-1.json') ? fimPreso : null) // session.end stops after cancelarLoops, before zerarSessao
  const encerrando = fim($)
  await dormir(80)
  m.segurarEstado = null
  soltar() // the waiting garantirPoll reaches its final check inside that window
  await dormir(150)
  m.segurar = null
  soltarFim()
  await recarga
  await encerrando
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(0)
})

test('a failing state write during the end does not stop the next session poll (F1)', async ($: any, on: any) => {
  const m = montar(on, {}, 'feat/c01-s01-x-20261023', true)
  gravar(m, ARTEFATO, URL)
  await iniciar($)
  await quieto(m)
  m.falharEstado = e => e?.key === 'maestroModo'
  await fim($)
  m.falharEstado = null
  await iniciar($)
  await quieto(m)
  expect(vivos(m, 300_000)).toBe(1)
})

test('a NOTE whose text names --fork creates no lane (finding 6)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${KDIR} --type NOTE --text "($ in --dir/--fork becomes data)"` })
  await quieto(m)
  const ex = escrito(m, 'exec') as any
  expect(['becomes' in ex.forks, ex.papel]).toEqual([false, 'conjunto'])
})

test('finding 6: one lane per spec (a NOTE naming --fork and branch= makes no second C02-S01 lane)', async ($: any, on: any) => {
  const D6 = 'C:/run6/ledger'
  const m = montar(on, {}, 'feat/c02-s01-a-20261021')
  gravar(m, `${D6}/fork-c02-s01-a.md`, linhaHa('READY', 'c02-s01-a branch=feat/c02-s01-a-20261021', 30))
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${D6} --type NOTE --text "x --fork ghost MARCO branch=feat/c02-s01-a-20261021"` })
  await tick(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'terminal' })
  await ui.press({ key: 't-exec' })
  // C11-S01: exact text, since the terminal header now reads `foco: spec C02-S01` too
  expect((await ui.findAll({ type: 'Text', text: /^C02-S01$/ })).length).toBe(1)
  await ui.unmount()
})

// ---- C11-S01 rework (VALIDACAO m-sino-alertas/86): a released lock leaves the espelho. ArtifactData update merges
// deep, so the espelho write deletes every lock key the new sweep no longer holds; the test db merges the same way.

const VERIFY = 'feat/c03-s01-x-20261023'
const GRANT = (since: string) =>
  `SWEEP OUTSTANDING c03-s01 verify ${VERIFY} [GRANTED-NOT-RELEASED] since=${since} LOCK verify ${VERIFY}\nSWEEP SUMMARY forks=1 grants=1 outstanding=1 ungranted=0\n`
const LIVRE = 'SWEEP SUMMARY forks=1 grants=2 outstanding=0 ungranted=0\n'

test('two LOCK/RELEASE cycles on the same branch leave 0 locks in the espelho and 0 orphans (C11-S01 rework)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  const ciclo = async (tipo: 'LOCK' | 'RELEASE', sweep: string) => {
    gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa(tipo, `verify ${VERIFY}`, 0))
    m.sweep = { exitCode: 0, stdout: sweep }
    await olhar(m)
  }
  await ciclo('LOCK', GRANT(ha(25)))
  expect(Object.keys(m.db!['execucao/C03']!.data.espelho.locks)).toEqual([`verify ${VERIFY}`])
  await ciclo('RELEASE', LIVRE)
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
  const segundo = ha(1)
  await ciclo('LOCK', GRANT(segundo))
  expect(m.db!['execucao/C03']!.data.espelho.locks[`verify ${VERIFY}`].desde).toBe(segundo)
  await ciclo('RELEASE', LIVRE)
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
  expect(alertasDe(m).vista.locks).toEqual([])
  expect(alertasDe(m).lista.filter((a: any) => /lock órfão/.test(a.texto))).toEqual([])
})

test('the real run 20261025-1428 ledger lines of C11-S01 (two verify cycles) end with no lock in the espelho (C11-S01 rework)', async ($: any, on: any) => {
  // the fork lines and, after each, what `ledger.py sweep` printed for the run dir cut at that moment (measured on the
  // real files, 2026-10-25): the stub answers those outputs verbatim
  const B = 'feat/c11-s01-acabamento-visual-20261024'
  const passos: [string, string][] = [
    [`LOCK verify ${B}  # 2026-10-25T16:08:43Z`, `SWEEP OUTSTANDING c11-s01-acabamento-visual verify ${B} [GRANTED-NOT-RELEASED] since=2026-10-25T16:08:43Z LOCK verify ${B}\nSWEEP SUMMARY forks=1 grants=1 outstanding=1 ungranted=0\n`],
    [`RELEASE verify ${B}  # 2026-10-25T16:31:25Z`, 'SWEEP SUMMARY forks=1 grants=1 outstanding=0 ungranted=0\n'],
    [`LOCK verify ${B}  # 2026-10-25T16:39:19Z`, `SWEEP OUTSTANDING c11-s01-acabamento-visual verify ${B} [GRANTED-NOT-RELEASED] since=2026-10-25T16:39:19Z LOCK verify ${B}\nSWEEP SUMMARY forks=1 grants=2 outstanding=1 ungranted=0\n`],
    [`RELEASE verify ${B}  # 2026-10-25T16:52:57Z`, 'SWEEP SUMMARY forks=1 grants=2 outstanding=0 ungranted=0\n'],
  ]
  const m = await conjuntoC03($, on, DB_C03())
  const chave = `verify ${B}`
  const vistos: string[] = []
  for (const [linhaLedger, sweep] of passos) {
    gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaLedger + '\n')
    m.sweep = { exitCode: 0, stdout: sweep }
    await olhar(m)
    vistos.push(m.db!['execucao/C03']!.data.espelho.locks[chave]?.desde ?? '-')
  }
  expect(vistos).toEqual(['2026-10-25T16:08:43Z', '-', '2026-10-25T16:39:19Z', '-'])
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
})

test('an espelho stored with a released lock (as execucao/C11 v28) is cleaned by the next write', async ($: any, on: any) => {
  const velho = { locks: { [`verify ${VERIFY}`]: { spec: 'C03-S01', desde: ha(300), estado: 'GRANTED-NOT-RELEASED' } }, specs: { 'C03-S09': { ultimo: 'DONE', texto: 'DONE', at: ha(300) } }, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at: ha(300) }
  const m = await conjuntoC03($, on, { 'execucao/C03': { data: { sessao: 's', iniciadoEm: 'x', espelho: velho }, version: 1 } })
  m.sweep = { exitCode: 0, stdout: LIVRE }
  mexer(m)
  await olhar(m)
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
  expect(Object.keys(m.db!['execucao/C03']!.data.espelho.specs)).toEqual(['C03-S01'])
})

test('a lock still held whose queue emptied loses its espera in the espelho (C11-S01 rework)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  const linha = (slug: string, since: string) => `SWEEP OUTSTANDING ${slug} verify ${VERIFY} [${slug === 'c03-s01' ? 'GRANTED-NOT-RELEASED' : 'UNGRANTED'}] since=${since} LOCK verify ${VERIFY}`
  gravar(m, `${KDIR}/fork-c03-s02.md`, linhaHa('READY', 'c03-s02 branch=feat/c03-s02-y-20261023', 20) + linhaHa('LOCK', `verify ${VERIFY}`, 1))
  m.sweep = { exitCode: 0, stdout: `${linha('c03-s01', ha(5))}\n${linha('c03-s02', ha(1))}\nSWEEP SUMMARY forks=2 grants=1 outstanding=2 ungranted=1\n` }
  mexer(m)
  await olhar(m)
  expect(m.db!['execucao/C03']!.data.espelho.locks[`verify ${VERIFY}`].espera).toEqual(['C03-S02'])
  m.sweep = { exitCode: 0, stdout: `${linha('c03-s01', ha(5))}\nSWEEP SUMMARY forks=2 grants=1 outstanding=1 ungranted=0\n` }
  mexer(m)
  await olhar(m)
  const l = m.db!['execucao/C03']!.data.espelho.locks[`verify ${VERIFY}`]
  expect([l.spec, 'espera' in l]).toEqual(['C03-S01', false])
})

test('a RELEASE seen while the sweep is held back mirrors nothing stale; the next look writes the lock gone (C11-S01 rework)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa('LOCK', `verify ${VERIFY}`, 0))
  m.sweep = { exitCode: 0, stdout: GRANT(ha(3)) }
  await olhar(m)
  expect(Object.keys(m.db!['execucao/C03']!.data.espelho.locks)).toEqual([`verify ${VERIFY}`])
  const versao = m.db!['execucao/C03']!.version
  // the RELEASE lands and the next look comes within the sweep's 5 s gate: the sweep waits, the espelho too
  gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa('RELEASE', `verify ${VERIFY}`, 0) + linhaHa('DONE', 'c03-s01', 0))
  m.sweep = { exitCode: 0, stdout: LIVRE }
  m.avanco += 1_000
  await tick(m)
  expect(m.db!['execucao/C03']!.version).toBe(versao)
  // past the gate: one sweep, then the espelho without the lock (and the DONE checkpoint)
  await olhar(m)
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
  expect(m.db!['execucao/C03']!.data.espelho.specs['C03-S01'].ultimo).toBe('DONE')
})

test('a lock the sweep still reports stays an orphan in the orchestrator even when its holder is DONE (C02-S01 rule)', async ($: any, on: any) => {
  const desde = ha(300)
  const esp = espelhoCom({ [`verify ${VERIFY}`]: { spec: 'C03-S01', desde, estado: 'GRANTED-NOT-RELEASED' } }, { specs: { 'C03-S01': { ultimo: 'DONE', texto: 'DONE', at: ha(290) } } })
  const m = await orquestrador($, on, { 'execucao/C03': { data: { iniciadoEm: 'x', espelho: esp }, version: 1 } })
  await poll($, m)
  await olhar(m)
  expect(alertasDe(m).lista.some((a: any) => /lock órfão em C03-S01/.test(a.texto))).toBe(true)
})

test('a RELEASE heard while the ledger dir cannot be read mirrors nothing until the dir is read again (C11-S01 rework)', async ($: any, on: any) => {
  const m = await conjuntoC03($, on, DB_C03())
  gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa('LOCK', `verify ${VERIFY}`, 0))
  m.sweep = { exitCode: 0, stdout: GRANT(ha(3)) }
  await olhar(m)
  const versao = m.db!['execucao/C03']!.version
  // the dir fails to list; the spec session's RELEASE and DONE still arrive as peer messages
  m.segurar = dir => (dir === KDIR ? Promise.reject(new Error('EACCES')) : null)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: `RELEASE verify ${VERIFY}` })
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'DONE C03-S01 pronto' })
  m.sweep = { exitCode: 0, stdout: LIVRE }
  await olhar(m)
  expect(m.db!['execucao/C03']!.version).toBe(versao)
  // the dir reads again: one sweep, then the espelho without the lock
  m.segurar = null
  gravar(m, FORK, (m.arquivos[FORK]?.text ?? '') + linhaHa('RELEASE', `verify ${VERIFY}`, 0))
  await olhar(m)
  expect(m.db!['execucao/C03']!.data.espelho.locks).toEqual({})
})

// ---- C05-S01: sessions opened empty, the GO with the current brief, the Execução set cards and detail card

import { todos } from './mundo-teste'

const URL_C5 = 'https://claude.ai/artifact/X'
const SET_C5 = `Você é a sessão do conjunto C02 da execução NOVARC-PLUGIN-MAESTRO (${URL_C5}).\nsession name: novarc-NOVARC-PLUGIN-MAESTRO-C02\nAguarde o GO do orquestrador. Não leia specs nem crie branch antes dele.`
const SPEC_C5 = `Você é a sessão da spec S01 do conjunto C02 da execução NOVARC-PLUGIN-MAESTRO (${URL_C5}).\nsession name: novarc-NOVARC-PLUGIN-MAESTRO-C02-S01\nAguarde o GO da sessão do conjunto C02. Não leia specs nem crie branch antes dele.`
const L1 = 'local_11111111-1111-4111-8111-111111111111'
const L2 = 'local_22222222-2222-4222-8222-222222222222'
const ORQ_DIR = 'C:/repo/.novarc/ledger/novarc-orq/20261028-0300'
const PLANO_C5 = {
  ...PLANO,
  conjuntos: [
    { id: 'C01', titulo: 'Base', specs: ['C01-S01'] },
    { id: 'C02', titulo: 'Alertas', specs: ['C02-S01'], dependeDe: ['C01'] },
    { id: 'C03', titulo: 'Guardas', specs: ['C03-S01'], dependeDe: ['C02'] },
  ],
}
const lerPlanoC5 = (t: any) => t.tool === 'Artifact' || t.tool === 'ArtifactData'
const hhmm = (iso: string) => new Date(Date.parse(iso)).toTimeString().slice(0, 5)
const semHex = (n: any) => todos(n).every(x => !['color', 'borderColor', 'backgroundColor'].some(k => String(x?.props?.[k] ?? '').startsWith('#')))

test('C05-S01 A29: the set minimal brief names the role and the wait, reads no plan; a GO inicio clears the wait', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, 'main', true)
  await iniciar($)
  const n = m.tools.length
  await $.prompt.submit?.({ text: SET_C5, origin: { kind: 'composer' } })
  await quieto(m)
  const r = registro(escritos)
  expect([r.papel, r.conjunto, r.codigo, r.artefato, r.aguardandoGo]).toEqual(['conjunto', 'C02', 'NOVARC-PLUGIN-MAESTRO', URL_C5, true])
  expect(m.tools.slice(n).filter(lerPlanoC5)).toEqual([]) // R10: no plan, no database before the GO
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'oi, tudo certo por aí?' })
  expect(registro(escritos).aguardandoGo).toBe(true)
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'GO C02 inicio 9f8e7d6\nspecs: 9f8e7d6' })
  expect(registro(escritos).aguardandoGo).toBe(false)
})

test('C05-S01 A29: the spec minimal brief gives spec C02-S01 waiting; GO PLAN clears it', async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos, 'main', true)
  await iniciar($)
  await $.prompt.submit?.({ text: SPEC_C5, origin: { kind: 'composer' } })
  await quieto(m)
  const r = registro(escritos)
  expect([r.papel, r.conjunto, r.spec, r.aguardandoGo]).toEqual(['spec', 'C02', 'C02-S01', true])
  await $.session.receive?.({ origin: { kind: 'peer' }, text: 'GO PLAN\nspec slug: alertas' })
  expect(registro(escritos).aguardandoGo).toBe(false)
})

/** An orchestrator of PLANO_C5 whose ledger has the given lines, C01 running with one lane, after one tick. */
async function orqC5($: any, on: any, linhas: string): Promise<Mundo> {
  const m = montar(on, {}, 'main', true)
  m.plano = PLANO_C5 // this run's plan, with dependeDe
  gravar(m, `${SESSOES}/set-1.json`, entrada('set-1', { papel: 'conjunto', conjunto: 'C01', ledgerDir: 'C:/set/ledger' }))
  gravar(m, 'C:/set/ledger/fork-c01-s01.md', linhaHa('READY', 'branch=feat/c01-s01-olhos-20261017', 30))
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py init --dir ${ORQ_DIR} --run-id 20261028-0300` })
  gravar(m, `${ORQ_DIR}/ledger.md`, linhas)
  await tick(m)
  await quieto(m)
  return m
}

const LEDGER_C5 = [
  `NOTE SESSAO C02 c02-novarc-plugin-maestr ${L2} vazia  # 2026-10-28T10:00:00Z`,
  `NOTE SESSAO C02-S01 c02-s01-alertas-locks-es ${L1} vazia  # 2026-10-28T10:00:01Z`,
  `NOTE SESSAO C03 c03-novarc-plugin-maestr ${L2} vazia  # 2026-10-28T10:00:02Z`,
  'NOTE BASE aaaa111  # 2026-10-28T10:00:03Z',
  'NOTE CARTAO C11 sem-fechamento  # 2026-10-28T14:05:00Z',
].join('\n') + '\n'

test('C05-S01 A7, A22, A30, A32, A33: NOTE SESSAO fills the map; waiting cards, KPI, selection, waiting box and card row', LENTO_8, async ($: any, on: any) => {
  const m = await orqC5($, on, LEDGER_C5)
  const mapa = escrito(m, 'maestroMapa')
  expect([mapa.specs['C02-S01']?.sessao, mapa.specs['C02-S01']?.nome]).toEqual([L1, 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01'])
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface, props: { ...PAINEL.props, bodyColumns: 70 } })
    await ui.press({ key: 't-exec' })
    expect(await ui.find({ type: 'Text', text: 'aguardando GO' })).toBeDefined()
    expect((await ui.find({ key: 'exk-2' }))?.text).toMatch(/⏳.*2.*aguardando GO/)
    const c2 = await ui.find({ key: 'cj-C02' })
    expect(c2?.text).toContain('⏸️')
    expect(c2?.text).toContain('aberta vazia · aguardando GO')
    expect((await ui.find({ type: 'Text', text: 'após C01' }))?.props).toMatchObject({ mono: true, color: 'subtle' })
    expect(await ui.find({ type: 'Text', text: 'após C02' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'CONJUNTOS' })).toBeDefined()
    // 4 cards (C01, C02, C03, C11) at 70 columns: one row of 3 (C03 among them), then one
    expect((await ui.find({ key: 'cj-fila-0' }))?.text).toContain('após C02')
    expect(await ui.find({ key: 'cj-fila-1' })).toBeDefined()
    expect(await ui.find({ key: 'cj-fila-2' })).toBeUndefined()
    expect((await ui.find({ key: 'sel-C01' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'sel-C02' }))?.props.variant).toBe('secondary')
    await ui.press({ key: 'sel-C02' })
    expect((await ui.find({ key: 'sel-C02' }))?.props.variant).toBe('primary')
    expect(await ui.find({ type: 'Text', text: 'DETALHE · C02' })).toBeDefined()
    const det = await ui.find({ key: 'det' })
    expect(det?.text).toContain('Sessão aberta vazia · aguardando GO')
    expect(det?.text).toContain('nada de spec, contexto ou branch carregado, então nada fica velho')
    expect(det?.text).toContain('SESSÕES')
    const brf = await ui.find({ key: 'brf' })
    expect(brf?.props.borderColor).toBe('promptBorder')
    expect(semHex(brf)).toBe(true)
    for (const C of ['C01', 'C02', 'C03', 'C11']) expect((await ui.find({ key: `cj-${C}` }))?.text).not.toContain('SESSÕES')
    await ui.press({ key: 'sel-C11' })
    const dim = 'abertas no seu turno · endereços restaurados após compactação'
    const cartao = `${hhmm('2026-10-28T14:05:00Z')} cartão proposto: C11 (clique equivale a colar o prompt)`
    const t11 = String((await ui.find({ key: 'det' }))?.text)
    expect(t11.endsWith(cartao)).toBe(true)
    expect(t11.indexOf(dim)).toBeGreaterThan(-1)
    expect(t11.indexOf(dim)).toBeLessThan(t11.indexOf(cartao))
    expect((await ui.find({ type: 'Text', text: dim }))?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Text', text: cartao }))?.props.color).toBe('subtle')
    await ui.press({ key: 'sel-C01' })
    await ui.unmount()
  }
  // at 56 columns the cards go in rows of 2
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop', props: { ...PAINEL.props, bodyColumns: 56 } })
  await ui.press({ key: 't-exec' })
  expect((await ui.find({ key: 'cj-fila-0' }))?.text).not.toContain('após C02') // C03 moved to the second row
  expect((await ui.find({ key: 'cj-fila-1' }))?.text).toContain('após C02')
  expect(await ui.find({ key: 'cj-fila-2' })).toBeUndefined()
  await ui.unmount()
})

test('C05-S01 A24: 20 renders of Execução write nothing to the database or the ledgers', LENTO_8, async ($: any, on: any) => {
  const m = await orqC5($, on, LEDGER_C5)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 't-exec' })
  await quieto(m)
  const t0 = m.tools.length
  const e0 = m.eventos.length
  for (let i = 0; i < 20; i++) await ui.redraw()
  expect(m.tools.slice(t0).filter(t => t.tool === 'ArtifactData' && !['get', 'list', 'query'].includes(t.action))).toEqual([])
  expect(m.eventos.slice(e0).filter(x => x.e?.path && 'text' in x.e && /ledger/.test(norm(x.e.path)))).toEqual([])
  await ui.unmount()
})

const GO_C3 = 'GO C03 inicio 9f8e7d6\nspecs: 9f8e7d6 (relidos)\ndecisoes-novas: d-x um\nmudou: C01 PR #31 abc1234\nspecs-atualizadas: C03-S01 ganhou 1 critério\nbranch: git fetch origin && git switch -c feat/c03-s01-guardas-20261029 --no-track origin/main'

test('C05-S01 A23, A31, R30: a sent GO inicio is kept locally and draws the GO box; two quick GOs both survive', LENTO_8, async ($: any, on: any) => {
  const m = await orqC5($, on, LEDGER_C5)
  await Promise.all([
    $.session.send?.({ to: 'novarc-NOVARC-PLUGIN-MAESTRO-C03', text: GO_C3, origin: { kind: 'model' } }),
    $.session.send?.({ to: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', text: 'GO C02 inicio 1a2b3c4\nspecs-atualizadas: nenhuma', origin: { kind: 'model' } }),
  ])
  await quieto(m)
  const gos = escrito(m, 'maestroGos')
  expect(Object.keys(gos).sort()).toEqual(['C02', 'C03'])
  expect(gos.C03).toMatchObject({ sha: '9f8e7d6', atualizadas: ['C03-S01 ganhou 1 critério'], decisoesNovas: 1, branches: ['git fetch origin && git switch -c feat/c03-s01-guardas-20261029 --no-track origin/main'] })
  expect(JSON.stringify(m.tools.filter(t => t.tool === 'ArtifactData'))).not.toContain('ganhou 1 critério') // R30
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })
    await ui.press({ key: 't-exec' })
    expect((await ui.find({ key: 'exk-2' }))?.text).not.toContain('aguardando GO') // C02 and C03 got their GO
    expect((await ui.find({ key: 'cj-C03' }))?.text).toContain('GO com brief atual')
    await ui.press({ key: 'sel-C03' })
    expect(await ui.find({ type: 'Text', text: `Brief entregue no GO · ${new Date(gos.C03.at).toTimeString().slice(0, 5)}` })).toBeDefined()
    // validation fixes 1 and 2: the commit line names the set it waited for; the decisions line names the merges
    expect((await ui.find({ type: 'Text', text: 'specs no commit 9f8e7d6, relidas depois que o session-plan aplicou o que o C02 mudou' }))?.props.color).toBe('subtle')
    expect((await ui.find({ type: 'Text', text: 'DECISIONS.md com 1 decisão nova · merges desde o início: PR #31' }))?.props.color).toBe('subtle')
    const brf = await ui.find({ key: 'brf' })
    expect(brf?.props.borderColor).toBe('success')
    expect(semHex(brf)).toBe(true)
    if (surface === 'desktop') {
      const pill = (await ui.findAll({ type: 'Svg' })).find((x: any) => x.props.alt === 'C03-S01 ganhou 1 critério')
      expect(String(pill?.props.source)).toContain('@media')
      expect((await ui.find({ type: 'Code' }))?.props.language).toBe('bash')
    } else {
      expect(await ui.find({ type: 'Text', text: 'git fetch origin && git switch -c feat/c03-s01-guardas-20261029 --no-track origin/main' })).toBeDefined()
    }
    // a GO with no branch line draws the box without a code block
    await ui.press({ key: 'sel-C02' })
    expect((await ui.find({ key: 'brf' }))?.props.borderColor).toBe('success')
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.unmount()
  }
})

test('C05-S01: a GO copy held across /clear never comes back in the next run', async ($: any, on: any) => {
  const m = await orqC5($, on, LEDGER_C5)
  let solta: () => void = () => {}
  m.segurarEstado = (e: any) => (e.key === 'maestroGos' && !('value' in e) ? new Promise<void>(r => (solta = r)) : null)
  const envio = $.session.send?.({ to: 'novarc-NOVARC-PLUGIN-MAESTRO-C03', text: GO_C3, origin: { kind: 'model' } })
  await dormir(20)
  await $.session.end?.({ reason: 'clear', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  solta()
  m.segurarEstado = null
  await envio
  await quieto(m)
  const escritas = m.eventos.filter(x => x.e?.plugin === 'novarc' && x.e?.key === 'maestroGos' && 'value' in x.e)
  expect(escritas.length ? escritas[escritas.length - 1]!.e.value : null).toBe(null)
})

test('C05-S01 R9, A25: a start_session with a D17 short name maps and audits the session under its title', async ($: any, on: any) => {
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async (_$: any, e: any) => ({ result: '', text: `Session started: ${L1} (${e.name})`, isError: false }))
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', name: 'c02-s01-alertas-locks-es', prompt: SPEC_C5, initiation: 'user_asked', context: 'fresh', use_worktree: true })
  await quieto(m)
  expect(escrito(m, 'maestroMapa').specs['C02-S01']).toMatchObject({ nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', sessao: L1 })
  const fila = escrito(m, 'auditoriaPendente') as { doc: any }[]
  expect(fila.map(f => [f.doc.acao, f.doc.alvo])).toContainEqual(['SESSAO', 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01'])
})

test('C05-S01 Task 3b: a set session ledger dir with -<c>-<sid8> gives the audit its runId', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py init --dir C:/repo/.novarc/ledger/session-build/20261028-0300-c01-3b2b0f69 --run-id 20261028-0300-c01-3b2b0f69' })
  await $.session.send?.({ to: 'novarc-NOVARC-PLUGIN-MAESTRO-C01-S01', text: 'HOLD C01 teste', origin: { kind: 'model' } })
  await quieto(m)
  const fila = escrito(m, 'auditoriaPendente') as { doc: any }[]
  expect(fila.map(f => f.doc.runId)).toContain('20261028-0300-c01-3b2b0f69')
})

test('C05-S01 validation fix 3, R23: a set the plan removed shows the cancelado pill and is not waiting', LENTO_8, async ($: any, on: any) => {
  const m = await orqC5($, on, LEDGER_C5 + 'NOTE CANCELADO C03 removido do plano  # 2026-10-28T11:00:00Z\n')
  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })
    await ui.press({ key: 't-exec' })
    const c3 = await ui.find({ key: 'cj-C03' })
    expect(c3?.text).toContain('cancelado · removido do plano')
    expect(c3?.text).not.toContain('aguardando GO')
    if (surface === 'desktop') expect(todos(c3).some((x: any) => x?.type === 'Svg' && x.props?.alt === 'cancelado')).toBe(true)
    else expect(c3?.text).toContain('[cancelado]')
    expect((await ui.find({ key: 'exk-2' }))?.text).toMatch(/⏳.*1.*aguardando GO/) // C02 only
    await ui.unmount()
  }
  expect(m.eventos.length).toBeGreaterThan(0)
})

// ---- C05-S02: the session family in the Agora tab (R1-R7, R20, R25)

const COD_F = 'NOVARC-PLUGIN-MAESTRO'
const B_F1 = 'feat/c02-s01-alertas-locks-espelho-20261029'
const LENTO_F = { timeoutMs: 20_000 }
/** An orchestrator (this session, sess-1) with set C02 and spec sessions C02-S01 / C02-S02 in the registry. */
async function orqFamilia($: any, on: any, o: { lista?: unknown[] | string; semRegistro?: boolean; comPlano?: boolean; aguardando?: boolean } = {}): Promise<Mundo> {
  const m = montar(on, {}, 'main', o.comPlano !== false)
  if (o.comPlano !== false) {
    gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL}\n`)
    m.db = {}
  }
  if (o.lista !== undefined) m.listSessions = o.lista
  if (!o.semRegistro) {
    gravar(m, `${SESSOES}/local_c02.json`, entrada('local_c02', { papel: 'conjunto', conjunto: 'C02', titulo: 'main' }))
    gravar(m, `${SESSOES}/local_s01.json`, entrada('local_s01', { papel: 'spec', conjunto: 'C02', spec: 'C02-S01', branch: B_F1, titulo: B_F1 }))
    gravar(m, `${SESSOES}/local_s02.json`, entrada('local_s02', { papel: 'spec', conjunto: 'C02', spec: 'C02-S02', branch: 'feat/c02-s02-y-20261029', titulo: 'x', aguardandoGo: o.aguardando ?? null }))
  }
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL}` })
  await quieto(m)
  return m
}
const LISTA_F = [
  { sessionId: 'local_c02', title: `novarc-${COD_F}-C02`, isArchived: false, isRunning: true, startedBy: 'sess-1' },
  { sessionId: 'local_s01', title: `novarc-${COD_F}-C02-S01`, isArchived: false, isRunning: true, startedBy: 'sess-1' },
  { sessionId: 'local_s02', title: `novarc-${COD_F}-C02-S02`, isArchived: false, isRunning: false, startedBy: 'local_c02' },
]
const chamadasLista = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'mcp__ccd_session_mgmt__list_sessions')
async function agora(m: Mundo, $: any, surface: 'desktop' | 'terminal' = 'desktop') {
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  const ui = await $.ui.mount({ ...PAINEL, surface })
  await ui.press({ key: 't-agora' })
  return ui
}
/** The Box ancestors of the first node whose text is `t`, nearest last. */
function caixasAte(raiz: any, t: string): any[] {
  const busca = (n: any, pilha: any[]): any[] | null => {
    if (!n || typeof n !== 'object') return null
    if (n.type === 'Text' && textoDe(n) === t) return pilha
    for (const c of n.children ?? []) {
      const r = busca(c, n.type === 'Box' ? [...pilha, n] : pilha)
      if (r) return r
    }
    return null
  }
  return busca(raiz, []) ?? []
}

test('A1, A2, A25: the orchestrator Agora draws the family in three levels with pills, state and the branch line', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on, { lista: LISTA_F })
  const ui = await agora(m, $)
  const arvore = await ui.drawn()
  const txt = textoDe(arvore)
  expect(txt).toContain('SESSÕES DESTA EXECUÇÃO')
  expect(txt).toContain(`novarc-orq-${COD_F}`)
  expect(txt).toContain(`${B_F1} · aberta por novarc-orq-${COD_F}`)
  expect(txt).toContain('🟠 rodando')
  expect(txt).toContain('🔴 parada')
  const nivel = (t: string) => caixasAte(arvore, t).filter(b => b.props?.paddingLeft === 'lg').length
  expect(nivel(`novarc-orq-${COD_F}`)).toBe(0)
  expect(nivel(`novarc-${COD_F}-C02`)).toBe(1)
  expect(nivel(`novarc-${COD_F}-C02-S01`)).toBe(2)
  expect(nivel(`novarc-${COD_F}-C02-S02`)).toBe(2)
  const pills = (await ui.findAll({ type: 'Svg' })).filter((x: any) => ['orquestradora', 'conjunto', 'spec'].includes(String(x.props.alt)))
  expect([...new Set(pills.map((x: any) => x.props.alt))].sort()).toEqual(['conjunto', 'orquestradora', 'spec'])
  for (const p of pills) expect(String(p.props.source)).toContain('prefers-color-scheme: dark')
  for (const n of todos(arvore)) {
    if (n.type !== 'Box' && n.type !== 'Text') continue
    expect(String(n.props?.color ?? '').startsWith('#')).toBe(false)
    expect(String(n.props?.backgroundColor ?? '').startsWith('#')).toBe(false)
  }
  // A2: the branch comes from the registry (git), and no get_session call is made
  expect(m.tools.some((t: any) => String(t.tool).includes('get_session'))).toBe(false)
  expect(chamadasLista(m).map((t: any) => [t.linked, t.include_archived, t.limit])).toEqual([[true, true, 300]])
  await ui.unmount()
})

test('a spec session opened empty (S01 aguardandoGo) and idle reads aguardando GO', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on, { lista: LISTA_F, aguardando: true })
  const ui = await agora(m, $)
  expect(textoDe(await ui.drawn())).toContain('⚪ aguardando GO')
  await ui.unmount()
})

test('A4: list_sessions absent draws the tree from the registry with the R4 line', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on)
  const ui = await agora(m, $)
  const txt = textoDe(await ui.drawn())
  expect(txt).toContain('família do app não lida; árvore pelo registro desta máquina')
  expect(txt).toContain(`novarc-${COD_F}-C02-S01`)
  expect(chamadasLista(m)).toEqual([])
  await ui.unmount()
})

test('Review Focus 2: a list_sessions answer that is not JSON is read as absent, never a thrown render', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on, { lista: 'not json' })
  const ui = await agora(m, $)
  const txt = textoDe(await ui.drawn())
  expect(txt).toContain('família do app não lida; árvore pelo registro desta máquina')
  expect(txt).toContain(`novarc-${COD_F}-C02-S01`)
  await ui.unmount()
})

test('A5: the pending first read reads lendo a família…; no entry of the run reads the empty line', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on, { lista: [], semRegistro: true })
  m.servirEstado = { maestroFamilia: null }
  let ui = await agora(m, $)
  expect(textoDe(await ui.drawn())).toContain('lendo a família…')
  await ui.unmount()
  m.servirEstado = { maestroFamilia: { linhas: [], at: Date.now(), fonte: 'app' } }
  ui = await agora(m, $)
  expect(textoDe(await ui.drawn())).toContain('Nenhuma sessão desta execução no registro.')
  await ui.unmount()
})

test('A7, A20: one list_sessions per poll tick, none on a pane open inside 60 s; the tree never reaches the database', LENTO_F, async ($: any, on: any) => {
  const m = await orqFamilia($, on, { lista: LISTA_F, comPlano: true })
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  const n = chamadasLista(m).length
  expect(n).toBe(1)
  disparar(m, 5 * 60 * 1000)
  await quieto(m)
  expect(chamadasLista(m).length).toBe(n + 1)
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  expect(chamadasLista(m).length).toBe(n + 1)
  const escritas = m.tools.filter((t: any) => t.tool === 'ArtifactData' && !['get', 'list', 'query'].includes(t.action))
  for (const w of escritas) expect(/nivel|abertaPor|local_s0|local_c02/.test(JSON.stringify(w))).toBe(false)
})

// ---- C05-S02: the ownership box in the set session's Execução detail card (R16, R26)

const SET_DIR_P = 'C:/set/posse/ledger'
async function conjuntoPosse($: any, on: any, ledger = ''): Promise<{ m: Mundo; ui: any }> {
  const m = montar(on, {}, 'main', true) // the plan gives the run its codigo, so the spec session's title is known
  m.db = {}
  gravar(m, `${SET_DIR_P}/fork-olhos.md`, linha('READY', 'olhos branch=feat/c01-s01-olhos-20261017'))
  gravar(m, `${SET_DIR_P}/ledger.md`, `# set
${ledger}`)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: CONJ })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py init --dir ${SET_DIR_P} --run-id x` })
  await $.command.run?.({ command: 'maestro', args: '' })
  await quieto(m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 't-exec' })
  return { m, ui }
}
const textoCor = (raiz: any, t: string) => todos(raiz).find(n => n.type === 'Text' && textoDe(n) === t)

test('A16, A26: a spec at READY without DONE-ACEITO highlights the build row with its session in claude', LENTO_F, async ($: any, on: any) => {
  const { ui } = await conjuntoPosse($, on)
  const arvore = await ui.drawn()
  expect(textoDe(arvore)).toContain('QUEM GRAVA SPECS/C01-S01 AGORA')
  const dona = textoCor(arvore, `novarc-${COD_F}-C01-S01 · agora`)
  expect([dona?.props?.color, dona?.props?.weight, dona?.props?.size]).toEqual(['claude', 'medium', 'footnote'])
  const outras = todos(arvore).filter(n => n.type === 'Text' && textoDe(n) === 'esta sessão')
  expect(outras.length).toBe(2)
  for (const o of outras) expect([o.props.color, o.props.weight]).toEqual(['subtle', 'medium'])
  const cap = textoCor(arvore, 'QUEM GRAVA SPECS/C01-S01 AGORA')
  expect(cap?.props?.color).toBe('suggestion')
  expect(todos(arvore).some(n => n.type === 'Box' && n.props?.width === 0.3 && n.props?.backgroundColor === 'suggestion')).toBe(true)
  expect(textoDe(arvore)).toContain('MARCO do orquestrador chega aqui e é repassado à sessão da spec enquanto ela é dona')
  await ui.unmount()
})

test('R16: after NOTE DONE-ACEITO the close-out row is the owner', LENTO_F, async ($: any, on: any) => {
  const { ui } = await conjuntoPosse($, on, linha('NOTE', 'DONE-ACEITO olhos 1a2b3c4', 30))
  const arvore = await ui.drawn()
  expect(textoCor(arvore, `novarc-${COD_F}-C01-S01`)?.props?.color).toBe('subtle')
  const sessoesEsta = todos(arvore).filter(n => n.type === 'Text' && textoDe(n) === 'esta sessão')
  expect(sessoesEsta.map(n => n.props.color)).toEqual(['subtle', 'claude'])
  await ui.unmount()
})
