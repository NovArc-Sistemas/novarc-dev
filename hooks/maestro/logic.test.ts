import { expect, test } from 'claude-code/testing'

import { VAZIA, anotar, raia } from './execucao'
import { aFechar, decidirMarco, donoDaFase, posseDaSpec, estadoFaixa, faixaOcioso, faixaOrq, quadrados, branchDoPush, prCreate, ultimoComando, porId, estadoConjunto, faixaConjunto, lerDocs, liberados, pastaDoCliente, slugPasta, specDaBranch, urlDoPr, urlOrquestrar, type Plano } from './logic'

const plano: Plano = {
  conjuntos: [
    { id: 'C01', titulo: 'Base', specs: ['C01-S01', 'C01-S02'] },
    { id: 'C02', titulo: 'Compra', specs: ['C02-S01'], dependeDe: ['C01'] },
  ],
  specs: [
    { id: 'C01-S01', conjunto: 'C01', slug: 'sop-base' },
    { id: 'C01-S02', conjunto: 'C01', slug: 'sop-base-cobertura' },
    { id: 'C02-S01', conjunto: 'C02', slug: 'pedido' },
  ],
}

test('maps a branch to its spec by the exact id, not by slug containment', async () => {
  expect(specDaBranch('feature/c01-s02-sop-base-cobertura-20261012', plano)?.id).toBe('C01-S02')
  expect(specDaBranch('feature/c01-s01-sop-base-20261012', plano)?.id).toBe('C01-S01')
  expect(specDaBranch('feature/sop-base-20261012', plano)).toBe(null)
  expect(specDaBranch('feature/c09-s01-x-20261012', plano)).toBe(null)
})

test('reads the branch of a git push command', async () => {
  expect(branchDoPush('git push -u origin feature/c01-s01-sop-base-20261012')).toBe('feature/c01-s01-sop-base-20261012')
  expect(branchDoPush('cd /w && git push origin HEAD:feature/c02-s01-pedido-20261012')).toBe('feature/c02-s01-pedido-20261012')
  expect(branchDoPush('git push')).toBe(null)
  expect(branchDoPush('git status')).toBe(null)
})

test('reads the PR url printed by gh', async () => {
  expect(urlDoPr('Creating pull request\nhttps://github.com/exemplo/erp/pull/324\n')).toBe('https://github.com/exemplo/erp/pull/324')
  expect(urlDoPr('no url here')).toBe(null)
})

test('derives the set aggregate from spec documents', async () => {
  const c = plano.conjuntos![0]
  expect(estadoConjunto(c, {}).status).toBe('nao-iniciado')
  const e = estadoConjunto(c, { 'C01-S01': { etapa: 'merge' }, 'C01-S02': { etapa: 'implementando' } })
  expect(e.status).toBe('em-andamento')
  expect(e.etapa).toBe('implementando')
  expect(e.feitos).toBe(1)
  expect(estadoConjunto(c, { 'C01-S01': { etapa: 'merge' }, 'C01-S02': { etapa: 'merge' } }).status).toBe('concluido')
  expect(estadoConjunto(c, { 'C01-S01': { etapa: 'merge', bloqueios: { hold: { motivo: 'x' } } } }).status).toBe('bloqueado')
})

test('validation counts only for the head it validated', async () => {
  const c = plano.conjuntos![1]
  expect(estadoConjunto(c, { 'C02-S01': { etapa: 'branch-publicada', headSha: 'a', validacao: { resultado: 'aprovado', sha: 'a' } } }).validado).toBe(true)
  expect(estadoConjunto(c, { 'C02-S01': { etapa: 'branch-publicada', headSha: 'b', validacao: { resultado: 'aprovado', sha: 'a' } } }).validado).toBe(false)
})

test('a set is released only when its dependencies concluded', async () => {
  expect(liberados(plano, {}, {})).toEqual(['C01'])
  expect(liberados(plano, { 'C01-S01': { etapa: 'merge' }, 'C01-S02': { etapa: 'merge' } }, {})).toEqual(['C02'])
})

test('band text names the set, its etapa and progress', async () => {
  const c = plano.conjuntos![0]
  expect(faixaConjunto(c, estadoConjunto(c, { 'C01-S01': { etapa: 'merge' }, 'C01-S02': { etapa: 'branch-publicada' } }))).toBe('C01 · branch publicada · 1/2 specs')
})

test('parses the ArtifactData listing format', async () => {
  const t = '1 document from collection "specs":\n=== BEGIN ARTIFACT DB 7b9ab447 ===\n{"id":"C01-S01","data":{"etapa":"iniciado"},"version":3,"updatedAt":"2026-10-11T00:00:31Z"}\n=== END ARTIFACT DB 7b9ab447 ==='
  const docs = lerDocs(t)
  expect(docs.length).toBe(1)
  expect(docs[0].version).toBe(3)
  expect(docs[0].data.etapa).toBe('iniciado')
  expect(lerDocs('No documents matched in collection "specs".').length).toBe(0)
})

test('a set validated at its head and published is ready to close once its dependencies are merged', async () => {
  const pub = (sha: string) => ({ etapa: 'branch-publicada' as const, headSha: sha, validacao: { resultado: 'aprovado', sha } })
  const specs = { 'C01-S01': pub('a'), 'C01-S02': pub('b'), 'C02-S01': pub('c') }
  expect(aFechar(plano, specs, {})).toEqual(['C01'])
  expect(faixaConjunto(plano.conjuntos![0], estadoConjunto(plano.conjuntos![0], specs))).toBe('C01 · branch publicada · 0/2 specs · pronto para fechar')
  const stale = { ...specs, 'C01-S02': { ...pub('b'), headSha: 'b2' } }
  expect(aFechar(plano, stale, {})).toEqual([])
  const merged = { 'C01-S01': { etapa: 'merge' as const }, 'C01-S02': { etapa: 'merge' as const }, 'C02-S01': pub('c') }
  expect(aFechar(plano, merged, {})).toEqual(['C02'])
  expect(aFechar(plano, specs, { C01: { bloqueios: { hold: { motivo: 'x' } } } })).toEqual([])
})

test('reads the artifact url of an orchestrate invocation only', async () => {
  expect(urlOrquestrar('orquestrar https://claude.ai/artifact/abc C01 C02')).toBe('https://claude.ai/artifact/abc')
  expect(urlOrquestrar('conjunto https://claude.ai/artifact/abc C01')).toBe(null)
  expect(urlOrquestrar('orquestrar')).toBe(null)
})

test('band state, idle and orchestrator texts, set-band squares', () => {
  expect(estadoFaixa('auto', null, null, false)).toBe('ociosa')
  expect(estadoFaixa('on', null, null, false)).toBe('ativa')
  expect(estadoFaixa('off', 'spec', null, false)).toBe('oculta')
  expect(estadoFaixa('auto', 'spec', null, true)).toBe('oculta')
  expect(faixaOcioso(0)).toBe('nenhuma execução aqui')
  expect(faixaOcioso(2)).toBe('2 execução(ões) na máquina')
  expect(faixaOrq(3)).toBe('3 conjuntos vivos')
  const t = Date.parse('2026-10-15T12:00:00Z')
  let ex = anotar(VAZIA, 'a', { tipo: 'DONE', texto: '', at: t })
  ex = anotar(ex, 'b', { tipo: 'LOCK', texto: 'db', at: t })
  ex = anotar(ex, 'c', { tipo: 'TASK', texto: '1/2', at: t })
  expect(quadrados(Object.values(ex.forks).map(f => raia(f, t)))).toEqual(['success', 'error', 'claude'])
})

test('ultimoComando reads only a chain of && and branchDoPush follows it', async () => {
  const b = 'feature/c01-s01-sop-base-20261012'
  expect(ultimoComando('git add . && git push -u origin x')).toEqual(['git', 'push', '-u', 'origin', 'x'])
  expect(ultimoComando('echo "a && b"')).toEqual(['echo', 'a && b'])
  for (const c of ['true || git push origin x', 'git push origin x || true', 'git push origin x; echo', 'git push origin x | cat', 'git push origin x &', 'true # git push origin x', 'a\ngit push origin x']) expect(ultimoComando(c)).toBeNull()
  expect(branchDoPush(`git add . && git push -u origin ${b}`)).toBe(b)
  expect(branchDoPush(`echo "git push origin ${b}"`)).toBeNull()
  expect(branchDoPush(`git -C x push origin ${b}`)).toBeNull()
  expect(branchDoPush('git push')).toBeNull()
  expect(branchDoPush('git push origin')).toBeNull()
  expect(branchDoPush(`git push origin HEAD:${b}`)).toBe(b)
})

test('porId keeps the version of each document', async () => {
  const t = '=== BEGIN ===\n{"id":"C01-S01","data":{"etapa":"merge"},"version":7,"updatedAt":"x"}\n=== END ==='
  expect(porId(t)['C01-S01']!.version).toBe(7)
  expect(porId(t)['C01-S01']!.data.etapa).toBe('merge')
})

test('redirections are not operators and gh pr create is found anywhere a command starts', async () => {
  const b = 'feature/c01-s01-sop-base-20261012'
  for (const r of ['2>&1', '>&2', '&>f.log', '>f.log', '2>f.log', '2>>f.log']) expect(branchDoPush(`git push origin ${b} ${r}`)).toBe(b)
  expect(branchDoPush(`git push origin ${b} 2>&1 | cat`)).toBeNull()
  expect(prCreate('gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('git push origin x || gh pr create --head y')).toEqual(['--head', 'y'])
  expect(prCreate('echo "gh pr create"')).toBeNull()
  expect(prCreate('echo gh pr create')).toBeNull()
})

test('branchDoPush finds the git push segment anywhere in an && chain, never past another operator', async () => {
  const b = 'feature/c01-s01-sop-base-20261012'
  expect(branchDoPush(`git add . && git push -u origin ${b} && gh pr create --title x --body y`)).toBe(b)
  expect(prCreate(`git add . && git push -u origin ${b} && gh pr create --title x --body y`)).toEqual(['--title', 'x', '--body', 'y'])
  for (const c of [`git push origin ${b} && gh pr create || true`, `git push origin ${b} && gh pr create; echo`, `git push origin ${b} && gh pr create | cat`, `git push origin ${b} && x &`, `git push origin ${b} && x # y`, `git push origin ${b} && x
y`]) expect(branchDoPush(c)).toBeNull()
})

test('pendencias: prCreate after env assignments, time or command; never after a plain word', () => {
  expect(prCreate('FOO=1 gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('FOO=1 BAR=2 gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('time gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('command gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('git add . && GH_DEBUG=1 gh pr create --head x')).toEqual(['--head', 'x'])
  expect(prCreate('echo FOO=1 gh pr create')).toBeNull()
  expect(prCreate('FOO=1 echo gh pr create')).toBeNull()
  expect(prCreate('echo time gh pr create')).toBeNull()
  expect(prCreate('echo "FOO=1 gh pr create"')).toBeNull()
})

test('pendencias: a delete push names no published branch', () => {
  const b = 'feature/c01-s01-sop-base-20261012'
  expect(branchDoPush(`git push --delete origin ${b}`)).toBeNull()
  expect(branchDoPush(`git push -d origin ${b}`)).toBeNull()
  expect(branchDoPush(`git push origin :${b}`)).toBeNull()
  expect(branchDoPush(`git add . && git push origin --delete ${b}`)).toBeNull()
  expect(branchDoPush(`git push origin HEAD:${b}`)).toBe(b)
})

test('review: combined short flags with d are a delete push', () => {
  const b = 'feature/c01-s01-sop-base-20261012'
  expect(branchDoPush(`git push -fd origin ${b}`)).toBeNull()
  expect(branchDoPush(`git push -df origin ${b}`)).toBeNull()
  expect(branchDoPush(`git push -uf origin ${b}`)).toBe(b)
  expect(branchDoPush(`git push --dry-run origin ${b}`)).toBe(b)
})

test('pastaDoCliente and slugPasta: the client folder and its page slug', () => {
  expect(pastaDoCliente('Kidsy')).toBe('Kidsy')
  expect(pastaDoCliente(' Kidsy ')).toBe('Kidsy')
  expect(pastaDoCliente('')).toBe('')
  expect(pastaDoCliente(undefined)).toBe('')
  expect(slugPasta('Clientes/Kidsy')).toBe('clientes-kidsy')
  expect(slugPasta('Clientes/São Paulo')).toBe('clientes-sao-paulo')
})

// ---- C05-S02: who owns specs/{S} in each phase (milestones.md ownership table)

test('donoDaFase: load and close-out etapas are the set session, build etapas the spec session from READY to DONE-ACEITO (A8)', () => {
  const build = { ready: true, aceito: false }
  expect(donoDaFase('branch-publicada', build)).toBe('spec')
  expect(donoDaFase('plano-aprovado', build)).toBe('spec')
  expect(donoDaFase('implementando', build)).toBe('spec')
  expect(donoDaFase('iniciado', build)).toBe('conjunto')
  expect(donoDaFase('pr-aberto', build)).toBe('conjunto')
  expect(donoDaFase('merge', build)).toBe('conjunto')
  expect(donoDaFase('branch-publicada', { ready: true, aceito: true })).toBe('conjunto')
  expect(donoDaFase('branch-publicada', { ready: false, aceito: false })).toBe('conjunto')
  expect(donoDaFase('revisando', build)).toBe(null)
})

test('decidirMarco: write, MARCO, NOTE MARCO, toast or nothing by role and phase (R8-R12, R17, R24)', () => {
  const base = { specDaSessao: null, spec: 'C02-S01', etapa: 'branch-publicada', ready: true, aceito: false, wip: false, rota: true, d20a: false }
  const orq = { ...base, papel: 'orquestrador' as const }
  expect(decidirMarco(orq)).toEqual({ acao: 'toast', dona: 'spec' })
  expect(decidirMarco({ ...orq, d20a: true })).toEqual({ acao: 'marco' })
  expect(decidirMarco({ ...orq, d20a: true, rota: false })).toEqual({ acao: 'nada' })
  const cj = { ...base, papel: 'conjunto' as const }
  expect(decidirMarco(cj)).toEqual({ acao: 'toast', dona: 'spec' })
  expect(decidirMarco({ ...cj, etapa: 'pr-aberto' })).toEqual({ acao: 'gravar' })
  expect(decidirMarco({ ...cj, ready: false })).toEqual({ acao: 'gravar' })
  expect(decidirMarco({ ...cj, aceito: true })).toEqual({ acao: 'gravar' })
  const sp = { ...base, papel: 'spec' as const, specDaSessao: 'C02-S01' }
  expect(decidirMarco(sp)).toEqual({ acao: 'gravar' })
  expect(decidirMarco({ ...sp, aceito: true })).toEqual({ acao: 'nota' })
  expect(decidirMarco({ ...sp, aceito: true, rota: false })).toEqual({ acao: 'nada' })
  expect(decidirMarco({ ...sp, etapa: 'pr-aberto' })).toEqual({ acao: 'toast', dona: 'conjunto' })
  expect(decidirMarco({ ...sp, etapa: 'pr-aberto', ready: false })).toEqual({ acao: 'toast', dona: 'conjunto' })
  expect(decidirMarco({ ...sp, ready: false })).toEqual({ acao: 'toast', dona: 'conjunto' })
  expect(decidirMarco({ ...sp, specDaSessao: 'C02-S02', ready: false })).toEqual({ acao: 'toast', dona: 'conjunto' })
  expect(decidirMarco({ ...sp, specDaSessao: 'C02-S02' })).toEqual({ acao: 'toast', dona: 'spec' })
  expect(decidirMarco({ ...sp, wip: true })).toEqual({ acao: 'nada' })
  expect(decidirMarco({ ...sp, etapa: 'revisando' })).toEqual({ acao: 'nada' })
  expect(decidirMarco({ ...base, papel: null })).toEqual({ acao: 'gravar' })
})

test('posseDaSpec: the ownership box row by phase (R16)', () => {
  expect(posseDaSpec({ iniciado: false, ready: false, aceito: false })).toBe('antes')
  expect(posseDaSpec({ iniciado: true, ready: false, aceito: false })).toBe('carga')
  expect(posseDaSpec({ iniciado: true, ready: true, aceito: false })).toBe('build')
  expect(posseDaSpec({ iniciado: true, ready: true, aceito: true })).toBe('fechamento')
})
