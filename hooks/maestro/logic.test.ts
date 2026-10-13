import { expect, test } from 'claude-code/testing'

import { aFechar, branchDoPush, estadoConjunto, faixaConjunto, lerDocs, liberados, specDaBranch, urlDoPr, urlOrquestrar, type Plano } from './logic'

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
