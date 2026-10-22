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
  expect(ev.slice(n).filter(e => !(e?.tool === 'Bash' && e?.command === 'ls -la')).length).toBe(0)
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

test('atualizar twice over the same data makes 3 list calls each and 0 writes', async ($: any, on: any) => {
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
    expect(l).toEqual(['specs', 'execucao', 'config'])
    todas.length = 0
  }
  expect(escritas.length).toBe(0)
})

test('an orchestrator look plus a push touches only specs, execucao, config; only write is specs/<id>; no sessao, cwd or ledgerDir in any input', async ($: any, on: any) => {
  const escritas: any[] = []
  const todas: any[] = []
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  montar(on, escritas, true, 'implementando', { todas })
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: `orquestrar ${URL} C01` })
  await $.command.run?.({ command: 'maestro', args: '' })
  await $.tool.call({ tool: 'Bash', command: `git push -u origin ${B}` })
  await esperar(() => escritas.length > 0)
  await dormir(60)
  expect([...new Set(todas.map(c => c.collection))].sort()).toEqual(['config', 'execucao', 'specs'])
  expect(escritas.length).toBe(1)
  expect([escritas[0].collection, escritas[0].doc_id]).toEqual(['specs', 'C01-S01'])
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
