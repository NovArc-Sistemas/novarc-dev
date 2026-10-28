import { expect, test } from 'claude-code/testing'

// The world beneath the mod: a client repo with ai/specs/EXM/artefato.txt, a plano with one set, and an artifact
// database answered from memory. Bash calls are answered here too, so nothing runs on the host.
const URL = 'https://claude.ai/artifact/TESTE'
const PLANO = {
  conjuntos: [{ id: 'C01', titulo: 'Base', specs: ['C01-S01'] }],
  specs: [{ id: 'C01-S01', conjunto: 'C01', slug: 'sop-base' }],
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Waits for background work: until `cond` holds, at most `ms`. */
async function esperar(cond: () => boolean, ms = 1000) {
  const t0 = Date.now()
  while (!cond() && Date.now() - t0 < ms) await dormir(5)
}

type Opcoes = { atraso?: number; erroTudo?: boolean; moverVersao?: boolean; todas?: any[]; bashText?: string; tBash?: number; semSha?: boolean }

function montar(on: any, escritas: any[], pushOk: boolean, etapaAtual: string | null, o: Opcoes = {}) {
  let versao = 4
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }))
  on('fs.list', async () => ({ value: [{ name: 'EXM', kind: 'dir', size: 0 }] }))
  on('fs.read', async ($: any, e: any) => ({ value: String(e.path).endsWith('artefato.txt') ? URL + '\n' : JSON.stringify(PLANO) }))
  on('process.run', async ($: any, e: any) => {
    if (o.semSha && e.argv[1] === 'rev-parse' && !e.argv.includes('--git-dir')) throw new Error('no sha')
    return { value: { exitCode: 0, stdout: e.argv.includes('rev-parse') ? 'abc123\n' : 'feature/c01-s01-sop-base-20261012\n', stderr: '' } }
  })
  on('tool.list', async () => ({ value: [{ name: 'Bash' }, { name: 'Artifact' }, { name: 'ArtifactData' }] }))
  on('tool.call', async ($: any, e: any) => {
    if (e.tool === 'Artifact') return { result: '', text: 'File saved: "C:\\\\tmp\\\\plano.json" (1 bytes)', isError: false }
    if (e.tool === 'ArtifactData') {
      o.todas?.push(e)
      if (o.atraso) await dormir(o.atraso)
      if (o.erroTudo) return { result: '', text: 'boom', isError: true }
      if (e.action === 'get' || e.action === 'list') {
        const linha = etapaAtual === null ? '' : `{"id":"C01-S01","data":{"etapa":"${etapaAtual}"},"version":${versao},"updatedAt":"x"}`
        return { result: '', text: `=== BEGIN ARTIFACT DB x ===\n${linha}\n=== END ARTIFACT DB x ===`, isError: false }
      }
      escritas.push(e)
      if (o.moverVersao && e.action === 'update' && escritas.length === 1) {
        versao = 5
        return { result: '', text: 'version conflict', isError: true }
      }
      return { result: '', text: 'Database update committed', isError: false }
    }
    if (e.tool === 'Bash') o.tBash = performance.now()
    if (e.tool === 'Bash') return { result: '', text: o.bashText ?? (pushOk ? 'pushed' : 'rejected'), isError: !pushOk }
    return { result: '', text: '', isError: false }
  })
}

test('a successful push of a set branch writes branch-publicada pinned to the read version', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/c01-s01-sop-base-20261012' })
  await esperar(() => escritas.length > 0)
  const u = escritas.find(w => w.action === 'update')
  expect(u?.collection).toBe('specs')
  expect(u?.doc_id).toBe('C01-S01')
  expect(u?.if_version).toBe(4)
  expect(u?.data.etapa).toBe('branch-publicada')
  expect(u?.data.headSha).toBe('abc123')
})

test('a failed push writes nothing', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, false, 'implementando')
  await $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/c01-s01-sop-base-20261012' })
  await dormir(60)
  expect(escritas.length).toBe(0)
})

test('a milestone already reached is not rewritten', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'pr-aberto')
  await $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/c01-s01-sop-base-20261012' })
  await dormir(60)
  expect(escritas.length).toBe(0)
})

test('the orchestrator skill turns the orchestrator view on from its args, even outside the client repo', async ($: any, on: any) => {
  const lidos: any[] = []
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }))
  on('fs.list', async () => {
    throw new Error('no ai/specs')
  })
  on('fs.read', async () => ({ value: JSON.stringify(PLANO) }))
  on('clock.every', async () => ({ value: { cancel() {} } }))
  on('process.run', async () => ({ value: { exitCode: 0, stdout: 'main\n', stderr: '' } }))
  on('tool.call', async ($: any, e: any) => {
    if (e.tool === 'Artifact') {
      lidos.push(e.url)
      return { result: '', text: 'File saved: "C:\\tmp\\plano.json" (1 bytes)', isError: false }
    }
    if (e.tool === 'ArtifactData') return { result: '', text: '', isError: false }
    return { result: '', text: 'ok', isError: false }
  })
  await $.session.start?.({ cwd: 'C:/fora', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: `orquestrar ${URL} C01` })
  expect(lidos).toEqual([URL])
})

const B = 'feature/c01-s01-sop-base-20261012'
const iniciar = ($: any) => $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })

test('gh pr create writes pr-aberto with the PR url pinned to the read version', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'branch-publicada', { bashText: 'https://github.com/NovArc-Sistemas/novarc-skills/pull/31' })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `gh pr create --head ${B}` })
  await esperar(() => escritas.length > 0)
  expect(escritas.length).toBe(1)
  expect(escritas[0].if_version).toBe(4)
  expect(escritas[0].data.etapa).toBe('pr-aberto')
  expect(escritas[0].data.pr).toBe('https://github.com/NovArc-Sistemas/novarc-skills/pull/31')
})

test('a version that moved between get and update is re-read and retried, at most 3 attempts', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando', { moverVersao: true })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  await esperar(() => escritas.length >= 2)
  expect(escritas.map(w => w.if_version)).toEqual([4, 5])
})

test('a spec document that does not exist yet is created with set and no if_version', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, null)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  await esperar(() => escritas.length > 0)
  expect(escritas[0].action).toBe('set')
  expect('if_version' in escritas[0]).toBe(false)
})

test('a failing milestone write returns the Bash result unchanged', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando', { erroTudo: true })
  await iniciar($)
  const r = await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  await dormir(60)
  expect(r.text).toBe('pushed')
  expect(r.isError).toBeFalsy()
})

test('git push with no branch argument writes nothing', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  await $.tool.call({ tool: 'Bash', command: 'git push origin' })
  await dormir(60)
  expect(escritas.length).toBe(0)
})

test('a command that only mentions git push writes nothing; a compound with && writes once', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await iniciar($)
  for (const cmd of [`true # git push origin ${B}`, `echo "git push origin ${B}"`, `true || git push origin ${B}`, `git push origin ${B} || true`, `git push origin ${B}; echo x`, `git push origin ${B} | cat`])
    await $.tool.call({ tool: 'Bash', command: cmd })
  await dormir(80)
  expect(escritas.length).toBe(0)
  await $.tool.call({ tool: 'Bash', command: `git add . && git push -u origin ${B}` })
  await esperar(() => escritas.length > 0)
  await dormir(30)
  expect(escritas.length).toBe(1)
})

test('Bash ls -la makes 0 $ calls and adds under 5 ms', async ($: any, on: any) => {
  const ev: any[] = []
  on('*', async ($: any, e: any, next: any) => {
    ev.push(e)
    return next(e)
  })
  const o: Opcoes = {}
  montar(on, [], true, 'implementando', o)
  await iniciar($)
  const n = ev.length
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  const dt = performance.now() - o.tBash! // from the innermost stub's return to the hook's return
  // the Bash call itself: 2.1.308 carries the command in input.command, older engines at the top
  expect(ev.slice(n).filter(e => !(e?.tool === 'Bash' && (e?.command === 'ls -la' || e?.input?.command === 'ls -la'))).length).toBe(0)
  expect(dt).toBeLessThan(5)
})

test('gh pr create with a heredoc body still writes pr-aberto when the output has the url; with no url it writes nothing', async ($: any, on: any) => {
  const URLPR = 'https://github.com/NovArc-Sistemas/novarc-skills/pull/31'
  const cmd = `gh pr create --head ${B} --title x --body "$(cat <<'EOF'
line with \\"quote\\"
EOF
)"`
  const escritas: any[] = []
  montar(on, escritas, true, 'branch-publicada', { bashText: URLPR })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: cmd })
  await esperar(() => escritas.length > 0)
  expect(escritas.length).toBe(1)
  expect(escritas[0].data.etapa).toBe('pr-aberto')
})

test('gh pr create whose output has no url writes nothing', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'branch-publicada', { bashText: 'done' })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `gh pr create --head ${B} --title x --body "$(cat <<'EOF'
body
EOF
)"` })
  await dormir(60)
  expect(escritas.length).toBe(0)
})

test('git push with a stderr redirection still writes the milestone', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `git push origin ${B} 2>&1` })
  await esperar(() => escritas.length > 0)
  expect(escritas.length).toBe(1)
})

test('git push with a tool.call mock resolving after 2 s returns under 50 ms and the mock is still called once', async ($: any, on: any) => {
  const escritas: any[] = []
  const todas: any[] = []
  const o: Opcoes = { atraso: 0, todas }
  montar(on, escritas, true, 'implementando', o)
  await iniciar($)
  o.atraso = 2000
  todas.length = 0
  const t0 = performance.now()
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  expect(performance.now() - t0).toBeLessThan(50)
  await esperar(() => todas.length > 0, 500)
  await dormir(100)
  expect(todas.length).toBe(1) // the first get is still pending
  o.atraso = 0 // the harness waits for the background work before it ends the test: let the rest run fast
})

test('atualizar twice over the same data in a set session makes 2 list calls each (R44) and 0 writes', async ($: any, on: any) => {
  const escritas: any[] = []
  const todas: any[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  montar(on, escritas, true, 'implementando', { todas })
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: `conjunto ${URL} C01` })
  await dormir(60)
  todas.length = 0
  for (let i = 0; i < 2; i++) {
    await $.command.run?.({ command: 'maestro', args: '' })
    await dormir(40)
    const l = todas.filter(c => c.action === 'list').map(c => c.collection)
    expect(l).toEqual(['specs', 'execucao'])
    todas.length = 0
  }
  expect(escritas.length).toBe(0)
})

// C05-S02 R10 changed this contract: the orchestrator never owns specs/{S}, so its push writes nothing (it was one write)
test('an orchestrator look plus a push touches only specs, execucao, config; the push writes nothing (R10); no sessao, cwd or ledgerDir in any input', async ($: any, on: any) => {
  const escritas: any[] = []
  const todas: any[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  montar(on, escritas, true, 'implementando', { todas })
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: `orquestrar ${URL} C01` })
  await $.command.run?.({ command: 'maestro', args: '' })
  const antes = escritas.length
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  await dormir(300)
  expect([...new Set(todas.map(c => c.collection))].sort()).toEqual(['config', 'execucao', 'pendencias', 'specs'])
  expect(escritas.length).toBe(antes)
  expect(escritas.some(w => w.collection === 'specs')).toBe(false)
  for (const c of todas) expect(/sessao|"cwd"|ledgerDir/.test(JSON.stringify(c))).toBe(false)
})

test('git add . && git push && gh pr create writes branch-publicada with headSha, then pr-aberto with the url', async ($: any, on: any) => {
  const URLPR = 'https://github.com/NovArc-Sistemas/novarc-skills/pull/31'
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando', { bashText: `pushed
${URLPR}
` })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `git add . && git push -u origin ${B} && gh pr create --title x --body y` })
  await esperar(() => escritas.length >= 2)
  expect(escritas.map(w => w.data.etapa)).toEqual(['branch-publicada', 'pr-aberto'])
  expect([escritas[0].data.headSha, escritas[1].data.pr]).toEqual(['abc123', URLPR])
})

test('git push && gh pr create whose rev-parse throws still writes pr-aberto', async ($: any, on: any) => {
  const URLPR = 'https://github.com/NovArc-Sistemas/novarc-skills/pull/31'
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando', { semSha: true, bashText: `pushed\n${URLPR}\n` })
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B} && gh pr create --head ${B} --title x` })
  await esperar(() => escritas.length > 0)
  await dormir(30)
  expect(escritas.map(w => w.data.etapa)).toEqual(['pr-aberto'])
})

// ---- C11-S01: state read discipline, the one pane open, the bell count, the reads per source

import { abrirPainel, contaSino, dadosFaixa, mesclar } from './register'
import { BUILD, URL as URL_MUNDO, escrito, iniciar as iniciarMundo, montar as montarMundo, tick } from './mundo-teste'

const falso = (store: Record<string, unknown>) => store

test('ler gives the default for null and merges old C01/C02 shapes (A41)', () => {
  const al = { lista: [], alertasVistos: [], sweep: null, limiares: { calado: 15, lockOrfao: 20 }, olhares: 3 }
  let $: Record<string, any> = falso({ maestroAlertas: al, linhas: 'x', maestroModo: 5, exec: { papel: 'conjunto' } })
  const a = mesclar('maestroAlertas', $['maestroAlertas'])
  expect([a.olhares, a.limiares, a.vista]).toEqual([3, { calado: 15, lockOrfao: 20 }, undefined])
  expect(mesclar('linhas', $['linhas'])).toEqual([])
  expect(mesclar('maestroModo', $['maestroModo'])).toBe('auto')
  const ex = mesclar('exec', $['exec'])
  expect([ex.papel, ex.forks, ex.ledgerDir]).toEqual(['conjunto', {}, null])
  expect(mesclar('maestroOutras', $['maestroOutras'])).toBe(null)
  expect(mesclar('maestroPainelAberto', $['maestroPainelAberto'])).toBe(false)
  $ = falso({ maestroAlertas: { ...al, limiares: { calado: 18 }, vista: { locks: [] } }, maestroPendencias: { itens: [], falhas: { repo: true } }, maestroOutras: 'x' })
  const b = mesclar('maestroAlertas', $['maestroAlertas'])
  expect([b.limiares.lockOrfao, b.limiares.calado, b.vista.unidades, b.vista.slots, b.vista.ritmo.amostras]).toEqual([20, 18, [], null, 0])
  expect((mesclar('maestroPendencias', $['maestroPendencias'])).falhas).toEqual({ plano: false, repo: true, ledger: false })
  expect(mesclar('maestroOutras', $['maestroOutras'])).toBe(null)
  expect(mesclar('maestroPendencias', undefined)).toBe(null)
})

test('contaSino: 2 alerts + 1 divergence + counter 2 = 5; spec with no list = 0 (A24)', () => {
  const pend: any = { divergencias: [{}], contador: { n: 2, fase: 'f6' } }
  expect(contaSino('orquestrador', { lista: [{}, {}] as any }, pend)).toBe(5)
  expect(contaSino('conjunto', { lista: [{}, {}] as any }, pend)).toBe(2)
  expect(contaSino('spec', null, null)).toBe(0)
})

test('abrirPainel opens the one pane and sets the flag', async () => {
  const abertos: any[] = []
  const setados: any[] = []
  await abrirPainel({ ui: { open: async (a: any) => abertos.push(a) }, state: { set: async (k: any, v: any) => setados.push([k.key, v]) } })
  expect(abertos).toEqual([{ id: 'novarc-maestro', title: 'Maestro' }])
  expect(setados).toEqual([['maestroPainelAberto', true]])
})

test('every open goes through abrirPainel: band ativar and /maestro set maestroPainelAberto (A38)', async ($: any, on: any) => {
  const m = montarMundo(on, {})
  await iniciarMundo($)
  const banda = await $.ui.mount({ plugin: 'novarc', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } })
  await banda.press({ key: 'ativar' })
  expect(m.abertos).toEqual(['novarc-maestro'])
  expect(escrito(m, 'maestroPainelAberto')).toBe(true)
  await banda.unmount()
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(m.abertos).toEqual(['novarc-maestro', 'novarc-maestro'])
})

test('a failed planning read sets maestroLeitura.falhou; registry fail then success keeps it with fonte planejamento; a good planning read clears it', async ($: any, on: any) => {
  const m = montarMundo(on, {}, 'main', true)
  m.db = { 'execucao/C01': { data: { iniciadoEm: 'x' }, version: 1 } }
  await iniciarMundo($)
  m.semBanco = true
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL_MUNDO}` })
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(escrito(m, 'maestroLeitura')).toMatchObject({ falhou: true, fonte: 'planejamento', falhas: { planejamento: true } })
  const home = m.home
  m.home = null
  const keys = m.store
  m.store = new Proxy({}, { ownKeys: () => { throw new Error('store down') } }) as any
  await tick(m)
  m.home = home
  m.store = keys
  await tick(m)
  expect(escrito(m, 'maestroLeitura')).toMatchObject({ falhou: true, fonte: 'planejamento', falhas: { planejamento: true, registro: false } })
  m.semBanco = false
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(escrito(m, 'maestroLeitura')).toMatchObject({ falhou: false, fonte: null })
})

const AGORA = Date.parse('2026-10-25T13:41:00Z')
const ev = (tipo: string, texto = '', min = 5) => ({ tipo, texto, at: AGORA - min * 60_000 })
const al = (texto: string) => ({ chave: texto, texto, toast: texto, nivel: 'erro' as const, at: AGORA })

test('dadosFaixa v2: orchestrator title, status with the poll text, two alerts, pend and verde only without alerts (A19-A21)', () => {
  const orq: any = { papel: 'orquestrador', ledgerDir: null, forks: {} }
  const pend: any = { divergencias: [], contador: { n: 2, fase: 'f6' }, itens: [], falhas: { plano: false, repo: false, ledger: false } }
  let f = dadosFaixa(orq, 'C03 em implementação', [], null, AGORA, 'eu')
  expect([f.titulo, f.status, f.alertas, f.pend, f.abaAlerta]).toEqual(['orquestrando', '0 conjuntos vivos · C03 em implementação', [], null, null])
  f = dadosFaixa(orq, null, [], null, AGORA, 'eu', [al('lock órfão em C03-S01'), al('C04 calada há 30 min'), al('terceiro')], [{ conjunto: 'C08', n: 2 }], pend)
  expect([f.alertas, f.pend, f.verde, f.nAlertas, f.abaAlerta]).toEqual([['lock órfão em C03-S01', 'C04 calada há 30 min'], null, null, 5, 'locks'])
  f = dadosFaixa(orq, null, [], null, AGORA, 'eu', [], [{ conjunto: 'C08', n: 2 }], pend)
  expect(f.pend).toEqual({ tipo: 'contador', texto: '2 pendências seguram a fase 6' })
  expect(f.verde).toEqual({ titulo: 'pronto para fechar', texto: 'C08 com as 2 specs em DONE, sem lock aberto', dica: 'peça o FECHA na conversa' })
  expect(f.abaAlerta).toBe('pendencias')
})

test('dadosFaixa v2: set segments and feitos; spec status is the structured last checkpoint (A22)', () => {
  const conj: any = {
    papel: 'conjunto', conjunto: 'C03', ledgerDir: 'x', forks: {
      'c03-s01': { slug: 'c03-s01', spec: 'C03-S01', eventos: [ev('READY'), ev('DONE', '', 1)] },
      'c03-s02': { slug: 'c03-s02', spec: 'C03-S02', eventos: [ev('READY'), ev('TASK', '1/3', 2)] },
    },
  }
  const f = dadosFaixa(conj, null, [], null, AGORA, 'eu')
  expect([f.titulo, f.segmentos, f.feitos]).toEqual(['C03', ['d', 'w'], { n: 1, total: 2 }])
  const spec: any = { papel: 'spec', spec: 'C03-S01', ledgerDir: null, forks: { 'c03-s01': { slug: 'c03-s01', spec: 'C03-S01', eventos: [ev('READY'), ev('TASK', '3/7')] } } }
  let g = dadosFaixa(spec, null, [], null, AGORA, 'eu')
  expect([g.titulo, g.status]).toEqual(['C03-S01', 'TASK 3/7'])
  spec.forks['c03-s01'].eventos.push(ev('TASK', '3/7 token ghp_abc123XYZ exposto', 1))
  g = dadosFaixa(spec, null, [], null, AGORA, 'eu')
  expect(g.status).toBe('TASK')
})

// ---- C11-S01: the close flag and the reopen on attach (R42, R43)

import { aoFecharPainel } from './register'

test('ui.close: a plugin close keeps the flag; the person close clears it; unload keeps it (A39)', async ($: any, on: any) => {
  const m = montarMundo(on, {})
  await iniciarMundo($)
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(escrito(m, 'maestroPainelAberto')).toBe(true)
  await $.ui.close?.({ id: 'novarc-maestro' })
  expect(escrito(m, 'maestroPainelAberto')).toBe(true)
  const sets: any[] = []
  const falso$ = { state: { set: async (k: any, v: any) => sets.push([k.key, v]) } }
  await aoFecharPainel(falso$, 'unload')
  await aoFecharPainel(falso$, 'plugin')
  expect(sets).toEqual([])
  await aoFecharPainel(falso$, 'person')
  expect(sets).toEqual([['maestroPainelAberto', false]])
})

test('session.attach reopens a pane this session had open and the panes list lacks; not with the flag false; a refused open is swallowed (A40)', async ($: any, on: any) => {
  const m = montarMundo(on, {})
  let lista: any[] = []
  on('ui.panes', async () => ({ value: lista }))
  on('session.surfaces', async () => ({ value: [] }))
  on('session.attach', async ($: any, e: any) => ({ clientId: e.clientId }))
  await iniciarMundo($)
  await $.command.run?.({ command: 'maestro', args: '' })
  expect(m.abertos.length).toBe(1)
  await $.session.attach?.({ surface: 'desktop', clientId: 'desktop:default' })
  expect(m.abertos.length).toBe(2)
  lista = [{ id: 'novarc-maestro', title: 'Maestro', isPlaced: true }]
  await $.session.attach?.({ surface: 'desktop', clientId: 'desktop:default' })
  expect(m.abertos.length).toBe(2)
  lista = []
  m.falhar = p => p === 'ui.open:novarc-maestro'
  await $.session.attach?.({ surface: 'desktop', clientId: 'desktop:default' })
  expect(m.logs.filter(l => l.includes('ui.open')).length).toBe(0)
  m.falhar = null
  m.servirEstado = { maestroPainelAberto: false }
  await $.session.attach?.({ surface: 'desktop', clientId: 'desktop:default' })
  expect(m.abertos.length).toBe(2)
  m.servirEstado = null
  // session.start with no surface attached opens nothing (the reload case)
  await iniciarMundo($)
  expect(m.abertos.length).toBe(2)
})

// ---- the tool.call shape: the engine (2.1.308) hands the plugin the caller's shape, top-level or under `input`

test('a push and a Skill call carried under input are followed like the top-level shape', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', input: { command: 'git push -u origin feature/c01-s01-sop-base-20261012' } })
  await esperar(() => escritas.length > 0)
  const u = escritas.find(w => w.action === 'update')
  expect(u?.data).toMatchObject({ etapa: 'branch-publicada', branch: 'feature/c01-s01-sop-base-20261012' })
})

test('a Skill call under input turns the orchestrator view on', async ($: any, on: any) => {
  const m = montarMundo(on, {})
  await iniciarMundo($)
  await $.tool.call({ tool: 'Skill', input: { skill: BUILD, args: `orquestrar ${URL_MUNDO}` } })
  expect(escrito(m, 'exec')?.papel).toBe('orquestrador')
})

// ---- C03-S01 Task 4: audit-flush and the session.send audit, on the shared in-memory world

import { dispararDesde, gravar, pendentesDesde, quieto, type Mundo } from './mundo-teste'

const LENTO_A = { timeoutMs: 20_000 }
const SPEC_A = 'feat/c01-s01-olhos-20261026'
const FORCE = 'git push --force origin x'
const negou = (r: any) => (r?.deny ?? (r?.isError ? r.text : undefined)) !== undefined

async function mundoPlanejado($: any, on: any, branch = SPEC_A): Promise<Mundo> {
  const m = montarMundo(on, {}, branch, true)
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL_MUNDO}\n`)
  m.db = {}
  await iniciarMundo($)
  await quieto(m)
  return m
}
const docsAuditoria = (m: Mundo) => Object.keys(m.db ?? {}).filter(k => k.startsWith('auditoria/'))
const lotes = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.action === 'batch')
const fila = (m: Mundo): { id: string }[] => escrito(m, 'auditoriaPendente') ?? []
/** Fires the audit flush's own 5 s timer, armed at or after index `n` of the world's timers. */
const flush5s = async (m: Mundo, n: number) => {
  dispararDesde(m, n)
  await quieto(m)
}

test('A42: a failed batch keeps both entries; the next tick writes them under the ids given at queue time; one entry is written by the 5 s timer', LENTO_A, async ($: any, on: any) => {
  const m = await mundoPlanejado($, on)
  let falhas = 1
  m.falharTool = (e: any) => e.action === 'batch' && falhas-- > 0
  const n = m.timers.length
  expect(negou(await $.tool.call({ tool: 'Bash', command: FORCE }))).toBe(true)
  expect(negou(await $.tool.call({ tool: 'Bash', command: FORCE }))).toBe(true)
  await quieto(m)
  const ids = fila(m).map(x => x.id)
  expect(ids.length).toBe(2)
  expect(pendentesDesde(m, n)).toBe(1)
  await flush5s(m, n)
  expect(docsAuditoria(m).length).toBe(0)
  expect(fila(m).map(x => x.id)).toEqual(ids)
  await tick(m)
  expect(docsAuditoria(m).sort()).toEqual(ids.map(i => `auditoria/${i}`).sort())
  expect(fila(m)).toEqual([])
  const n2 = m.timers.length
  await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  await flush5s(m, n2)
  expect(docsAuditoria(m).length).toBe(3)
})

test('A45, A48: 12 queued entries take exactly one batch call, and every ArtifactData write targets auditoria', LENTO_A, async ($: any, on: any) => {
  const m = await mundoPlanejado($, on)
  const n = m.timers.length
  for (let i = 0; i < 12; i++) await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  await flush5s(m, n)
  expect(lotes(m).length).toBe(1)
  expect(docsAuditoria(m).length).toBe(12)
  const escritas = m.tools.filter((t: any) => t.tool === 'ArtifactData' && ['set', 'update', 'delete', 'batch', 'str_replace'].includes(t.action))
  expect(escritas.length > 0).toBe(true)
  for (const w of escritas) {
    const alvos = w.action === 'batch' ? w.writes.map((x: any) => x.collection) : [w.collection]
    expect(alvos.every((c: string) => c === 'auditoria')).toBe(true)
    if (w.action === 'batch') expect(w.writes.every((x: any) => x.op === 'set' && x.if_version === undefined)).toBe(true)
  }
})

test('Review Focus 4: a batch refused because one id exists drops that id and writes the rest in the same tick', LENTO_A, async ($: any, on: any) => {
  const m = await mundoPlanejado($, on)
  const n = m.timers.length
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  const ids = fila(m).map(x => x.id)
  m.db![`auditoria/${ids[1]}`] = { data: { velho: true }, version: 1 }
  await flush5s(m, n)
  expect(lotes(m).length).toBe(2)
  expect(docsAuditoria(m).sort()).toEqual(ids.map(i => `auditoria/${i}`).sort())
  expect(m.db![`auditoria/${ids[1]}`]!.data).toEqual({ velho: true })
  expect(fila(m)).toEqual([])
})

test('A36: a delivered model HOLD queues one agente entry; a plugin send queues none', LENTO_A, async ($: any, on: any) => {
  const m = await mundoPlanejado($, on, 'main')
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL_MUNDO}` })
  await quieto(m)
  const n = m.timers.length
  await $.session.send?.({ to: 'novarc-X-C02', text: 'GO c02-s01-x phase 4', origin: { kind: 'plugin', name: 'novarc' } })
  await $.session.send?.({ to: 'novarc-X-C02', text: 'TASK 2/3', origin: { kind: 'model' } })
  await quieto(m)
  expect(pendentesDesde(m, n)).toBe(0)
  await $.session.send?.({ to: 'local_ab12cd34-0000-4000-8000-000000000001', text: 'HOLD C02 colisão com C03', origin: { kind: 'model' } })
  await $.session.send?.({ to: 'novarc-X-C03', text: 'status local_ab12cd34-0000-4000-8000-000000000001?', origin: { kind: 'model' } })
  await quieto(m)
  await flush5s(m, n)
  const docs = docsAuditoria(m).map(k => m.db![k]!.data)
  expect(docs.length).toBe(2)
  const hold = docs.find(d => d.acao === 'HOLD')!
  expect([hold.acao, hold.alvo, hold.linha, hold.origem, hold.regra]).toEqual(['HOLD', 'C02', 'HOLD C02 colisão com C03', 'agente', 'orquestrar.md'])
  const st = docs.find(d => d.acao === 'STATUS-PEDIDO')!
  expect([st.alvo, st.linha]).toEqual(['', 'status local_\u2026?'])
  for (const d of docs) expect(/local_[0-9a-f]/.test(JSON.stringify(d))).toBe(false)
})

// ---- Task 4 fix round 1: refusal parsing, single-set fallback, retry bound

/** A world whose first batch refusal is answered with `texto` (no per-entry naming), the rest by the world itself. */
async function mundoRecusa($: any, on: any, texto: (writes: any[]) => string | null) {
  let m: Mundo | null = null
  on('tool.call', { tool: 'ArtifactData' }, async (_$: any, e: any, next: any) => {
    if (e.action === 'batch' && m) {
      const t = texto(e.writes)
      if (t !== null) {
        m.tools.push(e)
        return { result: '', text: t, isError: true }
      }
    }
    return next(e)
  })
  m = await mundoPlanejado($, on)
  return m
}
const sets = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.action === 'set')

test('fix 2: an id named only as the prefix of another is not dropped; an exists refusal naming no queued id falls back to one set per entry', LENTO_A, async ($: any, on: any) => {
  let vez = 0
  const m = await mundoRecusa($, on, ws => (vez++ === 0 ? `Batch refused: auditoria/${ws[0].doc_id}0 already exists; nothing was written.` : null))
  const n = m.timers.length
  for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  const ids = fila(m).map(x => x.id)
  m.db![`auditoria/${ids[2]}`] = { data: { velho: true }, version: 1 }
  await flush5s(m, n)
  expect(lotes(m).length).toBe(1)
  expect(sets(m).length).toBe(3)
  expect(docsAuditoria(m).sort()).toEqual(ids.map(i => `auditoria/${i}`).sort())
  expect(m.db![`auditoria/${ids[2]}`]!.data).toEqual({ velho: true })
  expect(fila(m)).toEqual([])
})

test('fix 2: a refusal naming an id without an exists word keeps the queue; the single-set fallback keeps entries on another failure', LENTO_A, async ($: any, on: any) => {
  let vez = 0
  const m = await mundoRecusa($, on, ws => (vez++ === 0 ? `Batch refused: auditoria/${ws[0].doc_id} version conflict.` : null))
  const n = m.timers.length
  for (let i = 0; i < 2; i++) await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  const ids = fila(m).map(x => x.id)
  await flush5s(m, n)
  expect(lotes(m).length).toBe(1)
  expect(sets(m).length).toBe(0)
  expect(fila(m).map(x => x.id)).toEqual(ids)
})

test('fix 6: more than 3 existing ids in one tick: 4 batch calls, the rest waits for the next look', LENTO_A, async ($: any, on: any) => {
  const m = await mundoPlanejado($, on)
  const n = m.timers.length
  for (let i = 0; i < 6; i++) await $.tool.call({ tool: 'Bash', command: FORCE })
  await quieto(m)
  const ids = fila(m).map(x => x.id)
  for (const i of ids.slice(0, 5)) m.db![`auditoria/${i}`] = { data: { velho: true }, version: 1 }
  await flush5s(m, n)
  expect(lotes(m).length).toBe(4)
  expect(fila(m).map(x => x.id)).toEqual(ids.slice(4))
  await tick(m)
  expect(lotes(m).length).toBe(6)
  expect(m.db![`auditoria/${ids[5]}`]!.data.acao).toBe('BLOQUEIO')
  expect(fila(m)).toEqual([])
})

// ---- C03-S01 Task 7: orchestrator seed, undelivered sends, enviando entries, A46, hot reload; EXISTE wording

const ORQ_DIR7 = 'C:/repo/.novarc/ledger/novarc-orq/20261023-0930'
const COD7 = 'NOVARC-PLUGIN-MAESTRO'
const C02_NOME = `novarc-${COD7}-C02`
const T7 = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00Z`)
const enviados7 = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e === 'object' && 'to' in e && e.to !== 'transcript' && typeof e.text === 'string')
const doc7 = (estado: string, acao = 'STATUS-PEDIDO', alvo = 'C02') => ({
  data: { acao, alvo, motivo: 'x', regra: 'dispatch-prompts.md:442', linha: `status ${alvo}?`, antes: null, depois: null, estado, runId: '20261023-0930', sessao: `novarc-orq-${COD7}`, papel: 'orquestrador', by: '', at: '2026-10-23T10:31:00.000Z', origem: 'maestro' },
  version: 1,
})

/** An orchestrator served from state on ORQ_DIR7, quiet sets at `conjuntos`, the clock held at `agora`; db with the artifact. */
async function orqMundo($: any, on: any, o: { conjuntos: Record<string, number>; agora: number; db?: Record<string, any> | null; estado?: Record<string, unknown> }) {
  const comPlano = o.db !== null
  const m = montarMundo(on, {}, 'main', comPlano)
  if (comPlano) m.db = { 'config/orquestracao': { data: { runId: '20261023-0930' }, version: 1 }, ...o.db }
  gravar(m, `${ORQ_DIR7}/ledger.md`, '# novarc-orq\n')
  const conjuntos = Object.fromEntries(Object.entries(o.conjuntos).map(([c, at]) => [c, { etapa: 'implementacao', texto: '', at }]))
  m.servirEstado = {
    exec: { papel: 'orquestrador', ledgerDir: ORQ_DIR7, forks: {}, codigo: COD7, conjuntos },
    ...(comPlano ? { ctx: { artefato: URL_MUNDO, plano: { conjuntos: [], specs: [], projeto: { codigo: COD7 } }, conjunto: null, spec: null, papel: 'orquestrador' } } : {}),
    ...o.estado,
  }
  m.avanco = o.agora - Date.now()
  await iniciarMundo($)
  await quieto(m)
  return m
}
const consultas = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.action === 'query')

test('A24: after a restart one auditoria query by runId seeds the sent key and nothing is resent', LENTO_A, async ($: any, on: any) => {
  const m = await orqMundo($, on, { conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: { 'auditoria/status-c02-20261023t101500z-1': doc7('enviado') } })
  await tick(m)
  await tick(m)
  expect(enviados7(m)).toEqual([])
  const q = consultas(m)
  expect(q.length).toBe(1)
  expect([q[0].collection, q[0].query.limit, JSON.stringify(q[0].query.where)]).toEqual(['auditoria', 1000, JSON.stringify([['runId', 'eq', '20261023-0930'], ['papel', 'eq', 'orquestrador']])])
  expect(escrito(m, 'diretivasFeitas')).toContain('status-c02-20261023t101500z-1')
})

test('A25: an undelivered send sets falhou, toasts the reason and is not resent on the next tick', LENTO_A, async ($: any, on: any) => {
  const m = await orqMundo($, on, { conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: {} })
  m.entrega = (e: any) => (e.text === 'status C02?' ? { isDelivered: false, reason: 'session not found' } : null)
  await tick(m)
  expect(m.db!['auditoria/status-c02-20261023t101500z-1']!.data.estado).toBe('falhou')
  expect(m.toasts).toContain(`Maestro não conseguiu enviar status a ${C02_NOME}: session not found`)
  expect(escrito(m, 'maestroEnvios')['status-c02-20261023t101500z-1'].estado).toBe('falhou')
  const n = m.eventos.filter(x => x.e?.text === 'status C02?' && 'to' in x.e).length
  await tick(m)
  expect(m.eventos.filter(x => x.e?.text === 'status C02?' && 'to' in x.e).length).toBe(n)
})

test('A26: an entry left enviando by a crash is never resent', LENTO_A, async ($: any, on: any) => {
  const m = await orqMundo($, on, { conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: { 'auditoria/status-c02-20261023t101500z-1': doc7('enviando') } })
  await tick(m)
  await tick(m)
  expect(enviados7(m)).toEqual([])
  expect(escrito(m, 'maestroEnvios')['status-c02-20261023t101500z-1'].estado).toBe('enviando')
})

test('A46: directive-nudge over 5 handled alerts makes 0 ArtifactData calls', LENTO_A, async ($: any, on: any) => {
  const sets = ['C02', 'C03', 'C04', 'C05', 'C06']
  const db = Object.fromEntries(sets.map(c => [`auditoria/status-${c.toLowerCase()}-20261023t101500z-1`, doc7('enviado', 'STATUS-PEDIDO', c)]))
  const m = await orqMundo($, on, { conjuntos: Object.fromEntries(sets.map(c => [c, T7('10:15')])), agora: T7('10:31'), db })
  await tick(m)
  const antes = m.tools.filter((t: any) => t.tool === 'ArtifactData').length
  await tick(m)
  expect(m.tools.filter((t: any) => t.tool === 'ArtifactData').length - antes).toBe(0)
  expect(enviados7(m)).toEqual([])
})

test('Review Focus 5: after a hot reload the stored diretivasFeitas and maestroEnvios keep a sent key from going again', LENTO_A, async ($: any, on: any) => {
  const k = 'status-c02-20261023t101500z-1'
  const m = await orqMundo($, on, {
    conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: null,
    estado: { diretivasFeitas: [k], maestroEnvios: { [k]: { acao: 'STATUS-PEDIDO', alvo: 'C02', at: T7('10:31'), estado: 'enviado' } } },
  })
  await tick(m)
  await tick(m)
  expect(enviados7(m)).toEqual([])
  expect(m.runs.filter(r => r.includes('--type RELAY'))).toEqual([])
})

// Each negation alone: a single-set refusal with it is another failure, never "already written".
for (const recusa of ['Database error: auditoria/x does not exist.', "Database error: auditoria/x doesn't exist.", 'Erro: o documento auditoria/x não existe.']) {
  test(`Task 4 carried fix: a single-set refusal "${recusa}" keeps the entry queued`, LENTO_A, async ($: any, on: any) => {
    let mm: Mundo | null = null
    on('tool.call', { tool: 'ArtifactData' }, async (_$: any, e: any, next: any) => {
      if (mm && e.action === 'batch') {
        mm.tools.push(e)
        return { result: '', text: 'Batch refused: a document already exists; nothing was written.', isError: true }
      }
      if (mm && e.action === 'set' && e.collection === 'auditoria') {
        mm.tools.push(e)
        return { result: '', text: recusa, isError: true }
      }
      return next(e)
    })
    const m = (mm = await mundoPlanejado($, on))
    const n = m.timers.length
    await $.tool.call({ tool: 'Bash', command: FORCE })
    await quieto(m)
    const ids = fila(m).map(x => x.id)
    await flush5s(m, n)
    expect(fila(m).map(x => x.id)).toEqual(ids)
  })
}

// ---- C03-S01 final review fixes: enviar refusals, the hung tool call

for (const recusa of ['a conflicting entry exists', 'permission denied']) {
  test(`final fix 6: a send whose set is refused with "${recusa}" releases the key and toasts the failure`, LENTO_A, async ($: any, on: any) => {
    let ativo = false
    on('tool.call', { tool: 'ArtifactData' }, async (_$: any, e: any, next: any) =>
      ativo && e.action === 'set' && e.collection === 'auditoria' ? { result: '', text: recusa, isError: true } : next(e))
    const m = await orqMundo($, on, { conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: {} })
    ativo = true
    await tick(m)
    expect(enviados7(m)).toEqual([])
    expect(m.toasts).toContain(`Maestro não conseguiu enviar status a ${C02_NOME}: ${recusa}`)
    expect(escrito(m, 'diretivasFeitas') ?? []).not.toContain('status-c02-20261023t101500z-1')
  })
}

test('final fix 6: an already-exists refusal keeps the key reserved and toasts nothing', LENTO_A, async ($: any, on: any) => {
  let ativo = false
  on('tool.call', { tool: 'ArtifactData' }, async (_$: any, e: any, next: any) =>
    ativo && e.action === 'set' && e.collection === 'auditoria' ? { result: '', text: 'Document auditoria/x already exists.', isError: true } : next(e))
  const m = await orqMundo($, on, { conjuntos: { C02: T7('10:15') }, agora: T7('10:31'), db: {} })
  ativo = true
  await tick(m)
  expect(enviados7(m)).toEqual([])
  expect(m.toasts.filter(t => t.startsWith('Maestro não conseguiu'))).toEqual([])
  expect(escrito(m, 'diretivasFeitas')).toContain('status-c02-20261023t101500z-1')
})

test('final fix 7: carregar does not wait on the refresh; a hung list times out at 20 s and the next directive refreshes again', LENTO_A, async ($: any, on: any) => {
  const m = montarMundo(on, {}, 'main', true)
  m.db = {}
  await iniciarMundo($)
  await quieto(m)
  let soltar: () => void = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  // `config` is read only by the db refresh in a set session (R44): holding it holds only refrescarBanco
  m.segurarTool = (e: any) => (e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'config' ? preso : null)
  const r = await Promise.race([
    $.tool.call({ tool: 'Skill', skill: BUILD, args: `conjunto ${URL_MUNDO} C01` }).then(() => 'voltou'),
    dormir(5000).then(() => 'esperou'),
  ])
  expect(r).toBe('voltou')
  await quieto(m)
  const execs = () => m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.action === 'list' && t.collection === 'config').length
  const n = execs()
  expect(n).toBe(1)
  for (const t of m.timers.filter(t => t.ms === 20_000 && !t.disparado && !t.abortado)) {
    t.disparado = true
    t.fire()
  }
  await quieto(m)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'HOLD C01 colisão' })
  await quieto(m)
  expect(execs()).toBe(n + 1)
  soltar()
})

// ---- C05-S02: the owner of specs/{S} writes the milestone; any other session routes or toasts (R8-R14, R17, R19-R22)

const COD5 = 'NOVARC-PLUGIN-MAESTRO'
const DIR5 = 'C:/main/.novarc/ledger/session-build/20261029-0900'
const B5 = 'feat/c02-s01-alertas-locks-espelho-20261029'
const SLUG5 = 'alertas-locks-espelho'
const SHA5 = '9f8e7d6'
const PLANO5 = { conjuntos: [{ id: 'C02', titulo: 'Alertas', specs: ['C02-S01'] }], specs: [{ id: 'C02-S01', conjunto: 'C02', slug: SLUG5 }], projeto: { codigo: COD5 } }
const READY5 = { tipo: 'READY', texto: `${SLUG5} branch=${B5} worktree=C:/w`, at: Date.parse('2026-10-29T09:00:00Z') }
const LENTO5 = { timeoutMs: 20_000 }

/** One session of the C02 run on B5: `papel` from the served run state, specs/C02-S01 at `etapa` in the db. */
async function mundo5(
  $: any,
  on: any,
  o: { papel: 'orquestrador' | 'conjunto' | 'spec'; etapa?: string; headSha?: string; ready?: boolean; ledger?: string; mapa?: boolean; registros?: any[]; d20a?: boolean; eventos?: any[] },
): Promise<Mundo> {
  const m = montarMundo(on, {}, o.papel === 'spec' ? B5 : 'main', true)
  m.sha = SHA5
  m.db = { 'specs/C02-S01': { data: { etapa: o.etapa ?? 'implementando', ...(o.headSha ? { headSha: o.headSha, branch: B5 } : {}) }, version: 3 }, 'execucao/C02': { data: {}, version: 1 } }
  gravar(m, `${DIR5}/fork-${SLUG5}.md`, '# fork\n')
  gravar(m, `${DIR5}/ledger.md`, `# set\n${o.ledger ?? ''}`)
  if (o.d20a) m.store['maestro-d20a'] = true
  const forks = o.ready === false ? {} : { [SLUG5]: { slug: SLUG5, spec: 'C02-S01', eventos: o.eventos ?? [READY5] } }
  m.servirEstado = {
    exec: { papel: o.papel, ledgerDir: DIR5, forks, codigo: COD5, conjunto: 'C02', spec: o.papel === 'spec' ? 'C02-S01' : null },
    ctx: { artefato: URL_MUNDO, plano: PLANO5, conjunto: 'C02', spec: o.papel === 'spec' ? 'C02-S01' : null, papel: o.papel },
    ...(o.mapa ? { maestroMapa: { conjuntos: { C02: { nome: `novarc-${COD5}-C02`, sessao: 'local_c02' } }, specs: {}, orquestrador: null, at: 1 } } : {}),
    ...(o.registros ? { maestroOutras: o.registros } : {}),
  }
  await iniciarMundo($)
  await quieto(m)
  return m
}
const escritasSpecs = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && ['set', 'update'].includes(t.action) && t.collection === 'specs')
const envios5 = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e === 'object' && 'to' in e && e.to !== 'transcript' && typeof e.text === 'string')
const push5 = async ($: any, m: Mundo, branch = B5) => {
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${branch}` })
  await quieto(m)
}
const TOAST5 = `Maestro: marco branch-publicada de C02-S01 ignorado; dona agora: novarc-${COD5}-C02-S01`
const regs5 = () => [
  { sessao: 'sess-1', cwd: 'C:/w', titulo: B5, papel: 'spec', forks: 0, feitos: 0, alerta: null, at: Date.now(), codigo: COD5, ledgerDir: DIR5, conjunto: 'C02', spec: 'C02-S01' },
  { sessao: 'local_c02', cwd: 'C:/main', titulo: 'main', papel: 'conjunto', forks: 1, feitos: 0, alerta: null, at: Date.now(), codigo: COD5, ledgerDir: DIR5, conjunto: 'C02' },
]

test('A9: the spec session that owns the build writes branch-publicada with headSha and its title, pinned; no session id, no auditoria', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'spec' })
  await push5($, m)
  const w = escritasSpecs(m)
  expect(w.length).toBe(1)
  expect([w[0].action, w[0].doc_id, w[0].if_version]).toEqual(['update', 'C02-S01', 3])
  expect(w[0].data.etapa).toBe('branch-publicada')
  expect(w[0].data.headSha).toBe(SHA5)
  expect(w[0].data.origem).toBe('mod')
  expect(w[0].data.sessao).toBe(`novarc-${COD5}-C02-S01`)
  expect(JSON.stringify(m.db)).not.toContain('local_')
  expect(Object.keys(m.db!).some(k => k.startsWith('auditoria/'))).toBe(false)
  expect(m.toasts.filter(t => t.startsWith('Maestro: marco'))).toEqual([])
})

test('A10, A19: the orchestrator with D20a on writes nothing and sends one audited MARCO to the set session id', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'orquestrador', mapa: true, d20a: true })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  const e = envios5(m).filter(x => String(x.text).startsWith('MARCO'))
  expect(e.length).toBe(1)
  expect(e[0].to).toBe('local_c02') // endereco() gives { sessionId }; the engine hands the hook the id
  expect(e[0].text).toBe(`MARCO C02-S01 branch-publicada ${SHA5}`)
  const a = Object.entries(m.db!).filter(([k]) => k.startsWith('auditoria/')).map(([, d]) => d.data)
  expect(a.length).toBe(1)
  expect([a[0].acao, a[0].origem, a[0].linha]).toEqual(['MARCO', 'maestro', `MARCO C02-S01 branch-publicada ${SHA5}`])
})

test('R10: the orchestrator with D20a off (default) only toasts; nothing written or sent', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'orquestrador', mapa: true })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  expect(envios5(m).filter(x => String(x.text).includes('MARCO'))).toEqual([])
  expect(m.toasts).toContain(TOAST5)
})

test('A12: the orchestrator with no route for the set writes nothing and sends nothing', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'orquestrador', d20a: true })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  expect(envios5(m).filter(x => String(x.text).includes('MARCO'))).toEqual([])
})

test('A11: a spec session past its accepted DONE logs NOTE MARCO in its fork ledger and sends it to its set session', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'spec', ledger: `NOTE DONE-ACEITO ${SLUG5} 1a2b3c4  # 2026-10-29T10:00:00Z\n`, registros: regs5() })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  const linha = `MARCO C02-S01 branch-publicada ${B5} ${SHA5}`
  expect(m.runs.some(r => r.includes(`--fork ${SLUG5} --type NOTE --text ${linha}`))).toBe(true)
  const e = envios5(m).filter(x => String(x.text).includes('MARCO'))
  expect(e.map(x => [x.to, x.text])).toEqual([['local_c02', `NOTE ${linha}`]])
})

test('A8 via the hook: a later REABERTO gives the build back to the spec session, which writes again', LENTO5, async ($: any, on: any) => {
  const ledger = `NOTE DONE-ACEITO ${SLUG5} 1a2b3c4  # 2026-10-29T10:00:00Z\nNOTE REABERTO ${SLUG5} VALIDACAO reprovado  # 2026-10-29T10:00:00Z\n`
  const m = await mundo5($, on, { papel: 'spec', ledger, registros: regs5() })
  await push5($, m)
  expect(escritasSpecs(m).length).toBe(1)
})

test('A17: the set session during the build toasts the skipped milestone and writes nothing', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'conjunto' })
  await push5($, m)
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  expect(m.toasts.filter(t => t === TOAST5).length).toBe(2)
})

test('N = 1: a set session with no READY for the spec writes as today', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'conjunto', ready: false })
  await push5($, m)
  expect(escritasSpecs(m).length).toBe(1)
})

test('a push between git switch and READY in the spec session writes nothing and names the set session as owner', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'spec', ready: false })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  expect(m.toasts).toContain(`Maestro: marco branch-publicada de C02-S01 ignorado; dona agora: novarc-${COD5}-C02`)
})

test('A22: gh pr create in the set session writes pr-aberto with the url; the same command in the spec session writes nothing', LENTO5, async ($: any, on: any) => {
  const pr = 'https://github.com/o/r/pull/9'
  const m = await mundo5($, on, { papel: 'conjunto', etapa: 'branch-publicada', headSha: SHA5 })
  m.textoBash = pr
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-end', args: '' }) // the close-out: gh pr create is allowed
  await $.tool.call({ tool: 'Bash', command: `gh pr create --head ${B5} --title t --body b` })
  await quieto(m)
  const w = escritasSpecs(m)
  expect(w.length).toBe(1)
  expect([w[0].data.etapa, w[0].data.pr, w[0].data.sessao]).toEqual(['pr-aberto', pr, `novarc-${COD5}-C02`])
})

test('A22: gh pr create in the spec session writes nothing and toasts the set session as owner', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'spec', etapa: 'branch-publicada', headSha: SHA5 })
  m.textoBash = 'https://github.com/o/r/pull/9'
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-end', args: '' })
  await $.tool.call({ tool: 'Bash', command: `gh pr create --head ${B5} --title t --body b` })
  await quieto(m)
  expect(escritasSpecs(m)).toEqual([])
  expect(m.toasts).toContain(`Maestro: marco pr-aberto de C02-S01 ignorado; dona agora: novarc-${COD5}-C02`)
})

test('later pushes: the owner updates headSha alone, also past pr-aberto; the same sha writes nothing', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'spec', etapa: 'branch-publicada', headSha: 'abc1111' })
  await push5($, m)
  const w = escritasSpecs(m)
  expect(w.length).toBe(1)
  expect(w[0].data).toEqual({ headSha: SHA5 })
  expect(m.db!['specs/C02-S01']!.data.etapa).toBe('branch-publicada')
  await push5($, m)
  expect(escritasSpecs(m).length).toBe(1)
})

test('later pushes after pr-aberto: the set session (owner after DONE-ACEITO) updates headSha alone', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'conjunto', etapa: 'pr-aberto', headSha: 'abc2222', ledger: `NOTE DONE-ACEITO ${SLUG5} abc2222  # 2026-10-29T10:00:00Z\n` })
  await push5($, m)
  const w = escritasSpecs(m)
  expect(w.length).toBe(1)
  expect(w[0].data).toEqual({ headSha: SHA5 })
  expect(m.db!['specs/C02-S01']!.data.etapa).toBe('pr-aberto')
})

test('A13: a failing milestone write and a failing send never change the Bash result', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'orquestrador', mapa: true, d20a: true })
  m.falharTool = (e: any) => e.tool === 'ArtifactData'
  m.entrega = () => {
    throw new Error('send boom')
  }
  const r = await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B5}` })
  expect([r.text, !!r.isError, r.deny]).toEqual(['ok', false, undefined])
  await quieto(m)
  expect(escritasSpecs(m)).toEqual([])
})

test('A14: with ArtifactData and send resolving after 1 s the push hook returns under 50 ms and makes no get of execucao', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'orquestrador', mapa: true, d20a: true })
  let soltar = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  m.segurarTool = (e: any) => (e.tool === 'ArtifactData' ? preso : null)
  const antes = m.tools.length
  const n = m.eventos.length
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B5}` })
  const fim = performance.now()
  // added = from the stubbed Bash call (next(e)) to the hook's return
  const bash = m.eventos.slice(n).find(x => x.e?.tool === 'Bash')!
  expect(fim - bash.at).toBeLessThan(50)
  await dormir(1000)
  soltar()
  await quieto(m)
  expect(m.tools.slice(antes).some((t: any) => t.tool === 'ArtifactData' && t.action === 'get' && t.collection === 'execucao')).toBe(false)
})

test('A24: a push while NOTE WIP-PUSH is the last folded fork line writes, sends and toasts nothing; after DONE the next push writes', LENTO5, async ($: any, on: any) => {
  const wip = { tipo: 'NOTE', texto: `WIP-PUSH ${SLUG5}`, at: READY5.at + 60_000 }
  const m = await mundo5($, on, { papel: 'spec', eventos: [READY5, wip], registros: regs5() })
  await push5($, m)
  expect(escritasSpecs(m)).toEqual([])
  expect(envios5(m).filter(x => String(x.text).includes('MARCO'))).toEqual([])
  expect(m.toasts.filter(t => t.startsWith('Maestro: marco'))).toEqual([])
  const m2 = m
  ;(m2.servirEstado!.exec as any).forks[SLUG5].eventos = [READY5, wip, { tipo: 'DONE', texto: SLUG5, at: wip.at + 60_000 }]
  await push5($, m2)
  expect(escritasSpecs(m2).length).toBe(1)
  expect(escritasSpecs(m2)[0].data.etapa).toBe('branch-publicada')
})

test('Review Focus 1: a push of a branch with no spec of the plan writes, sends and toasts nothing', LENTO5, async ($: any, on: any) => {
  const m = await mundo5($, on, { papel: 'conjunto' })
  await push5($, m, 'feat/sem-spec')
  expect(escritasSpecs(m)).toEqual([])
  expect(m.toasts.filter(t => t.startsWith('Maestro: marco'))).toEqual([])
})
