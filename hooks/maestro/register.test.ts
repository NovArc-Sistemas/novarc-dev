import { expect, test } from 'claude-code/testing'

// The world beneath the mod: a client repo with ai/specs/EXM/artefato.txt, a plano with one set, and an artifact
// database answered from memory. Bash calls are answered here too, so nothing runs on the host.
const URL = 'https://claude.ai/artifact/TESTE'
const PLANO = {
  conjuntos: [{ id: 'C01', titulo: 'Base', specs: ['C01-S01'] }],
  specs: [{ id: 'C01-S01', conjunto: 'C01', slug: 'sop-base' }],
}

function montar(on: any, escritas: any[], pushOk: boolean, etapaAtual: string | null) {
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }))
  on('fs.list', async () => ({ value: [{ name: 'EXM', kind: 'dir', size: 0 }] }))
  on('fs.read', async ($: any, e: any) => ({ value: String(e.path).endsWith('artefato.txt') ? URL + '\n' : JSON.stringify(PLANO) }))
  on('process.run', async ($: any, e: any) => ({ value: { exitCode: 0, stdout: e.argv.includes('rev-parse') ? 'abc123\n' : 'feature/c01-s01-sop-base-20261012\n', stderr: '' } }))
  on('tool.list', async () => ({ value: [{ name: 'Bash' }, { name: 'Artifact' }, { name: 'ArtifactData' }] }))
  on('tool.call', async ($: any, e: any) => {
    if (e.tool === 'Artifact') return { result: '', text: 'File saved: "C:\\\\tmp\\\\plano.json" (1 bytes)', isError: false }
    if (e.tool === 'ArtifactData') {
      if (e.action === 'get' || e.action === 'list') {
        const linha = etapaAtual === null ? '' : `{"id":"C01-S01","data":{"etapa":"${etapaAtual}"},"version":4,"updatedAt":"x"}`
        return { result: '', text: `=== BEGIN ARTIFACT DB x ===\n${linha}\n=== END ARTIFACT DB x ===`, isError: false }
      }
      escritas.push(e)
      return { result: '', text: 'Database update committed', isError: false }
    }
    if (e.tool === 'Bash') return { result: '', text: pushOk ? 'pushed' : 'rejected', isError: !pushOk }
    return { result: '', text: '', isError: false }
  })
}

test('a successful push of a set branch writes branch-publicada pinned to the read version', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'implementando')
  await $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/c01-s01-sop-base-20261012' })
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
  expect(escritas.length).toBe(0)
})

test('a milestone already reached is not rewritten', async ($: any, on: any) => {
  const escritas: any[] = []
  montar(on, escritas, true, 'pr-aberto')
  await $.session.start?.({ cwd: 'C:/repo', surface: null, isInteractive: false })
  await $.tool.call({ tool: 'Bash', command: 'git push -u origin feature/c01-s01-sop-base-20261012' })
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
