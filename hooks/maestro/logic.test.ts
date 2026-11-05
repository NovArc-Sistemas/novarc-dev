import { expect, test } from 'claude-code/testing'

import { VAZIA, anotar, raia } from './execucao'
import { cartaoMerge, chaveCicloPendentes, chaveCliqueMerge, chaveGoInicio, comprovantes, decidirFecha, goDevidos, liberaProducao, linhaOrdem, linhasEsteira, ordemDoLedger, ordemProducao, proximoProducao, resumoEsteira, type Ci, type PedidoProducao } from './logic'
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

// ---- C06-S02

const planoC06: Plano = {
  conjuntos: [
    { id: 'C06', titulo: 'Contínuo', specs: [] },
    { id: 'C07', titulo: 'Sete', specs: [], dependeDe: ['C06'] },
    { id: 'C08', titulo: 'Oito', specs: [], dependeDe: ['C06'] },
    { id: 'C09', titulo: 'Nove', specs: [], dependeDe: ['C07'] },
  ],
  specs: [],
}
const ped = (conjunto: string, chegada: number, migracoes: string[] = [], deploys: PedidoProducao['deploys'] = []): PedidoProducao => ({ conjunto, chegada, migracoes, deploys })

test('A10: a set is served after the set it depends on, whatever arrived first', async () => {
  expect(ordemProducao(planoC06, [ped('C09', 1), ped('C07', 2)]).ordem).toEqual(['C07', 'C09'])
  expect(proximoProducao([{ conjunto: 'C09' }, { conjunto: 'C07' }], { conjuntos: ['C07', 'C09'], itens: {} })?.conjunto).toBe('C07')
})

test('A12: migrations go by the timestamp rule, not by finish order, with a ruling', async () => {
  const r = ordemProducao(planoC06, [ped('C07', 1, ['20261110_add_auditoria']), ped('C08', 2, ['20261109_add_continuo'])], { migracao: { ordem: 'timestamp' } })
  expect(r.ordem).toEqual(['C08', 'C07'])
  expect(r.rulings.length).toBe(1)
  expect(r.rulings[0]).toContain('20261109_add_continuo')
  expect(r.rulings[0]).toContain('20261110_add_auditoria')
})

test('A13: a deploy waits for the migration it needs, even when its set arrived first', async () => {
  const r = ordemProducao(planoC06, [ped('C08', 1, [], [{ alvo: 'notificar', precisa: '20261110_add_auditoria' }]), ped('C07', 2, ['20261110_add_auditoria'])])
  expect(r.ordem).toEqual(['C07', 'C08'])
})

test('a dependency cycle leaves both sets out of the order', async () => {
  const p: Plano = { conjuntos: [{ id: 'C07', titulo: '', specs: [] }, { id: 'C08', titulo: '', specs: [], dependeDe: ['C07'] }], specs: [] }
  const r = ordemProducao(p, [ped('C07', 1, [], [{ alvo: 'x', precisa: 'm8' }]), ped('C08', 2, ['m8'])])
  expect(r.ordem).toEqual([])
  expect(r.ciclo).toEqual(['C07', 'C08'])
})

test('A14: a ledger without NOTE ORDEM-PRODUCAO serves arrival order', async () => {
  expect(ordemDoLedger([])).toBe(null)
  const fila = [{ conjunto: 'C08' }, { conjunto: 'C07' }]
  expect(proximoProducao(fila, null)).toBe(fila[0])
  expect(proximoProducao([], null)).toBe(null)
})

test('A11: the last NOTE ORDEM-PRODUCAO wins and round-trips', async () => {
  const o = ordemDoLedger([
    { tipo: 'NOTE', texto: 'ORDEM-PRODUCAO C07 C08' },
    { tipo: 'NOTE', texto: 'SESSAO C07 x local_1 vazia' },
    { tipo: 'NOTE', texto: 'ORDEM-PRODUCAO C08:merge C07' },
  ])
  expect(o).toEqual({ conjuntos: ['C08', 'C07'], itens: { C08: ['merge'] } })
  const t = linhaOrdem(['C08', 'C07'], { C08: ['migracao=20261109_x', 'merge', 'deploy-notificar'] })
  expect(t).toBe('ORDEM-PRODUCAO C08:migracao=20261109_x,merge,deploy-notificar C07')
  expect(ordemDoLedger([{ tipo: 'NOTE', texto: t }])).toEqual({ conjuntos: ['C08', 'C07'], itens: { C08: ['migracao=20261109_x', 'merge', 'deploy-notificar'] } })
})

test('an unlisted set goes after every listed one, arrival breaking ties', async () => {
  const fila = [{ conjunto: 'C10' }, { conjunto: 'C09' }, { conjunto: 'C07' }]
  expect(proximoProducao(fila, { conjuntos: ['C07'], itens: {} })?.conjunto).toBe('C07')
  expect(proximoProducao(fila.slice(0, 2), { conjuntos: ['C07'], itens: {} })?.conjunto).toBe('C10')
})

test('A27: the order keeps set ids only', async () => {
  const o = ordemDoLedger([{ tipo: 'NOTE', texto: 'ORDEM-PRODUCAO C07 local_abc token C08' }])!
  expect(o.conjuntos).toEqual(['C07', 'C08'])
  expect(o.conjuntos.every(c => /^C\d{2}$/.test(c))).toBe(true)
})

test('A1, A2, A26, A28: when FECHA goes on its own', async () => {
  expect(decidirFecha({ C: 'C06', modo: 'continuo', autorizado: true, clique: false, c08: false })).toEqual({ acao: 'enviar' })
  expect(decidirFecha({ C: 'C06', modo: 'continuo', autorizado: true, clique: true, c08: false })).toEqual({ acao: 'perguntar', texto: 'C06 pronto para fechar' })
  expect(decidirFecha({ C: 'C06', modo: 'continuo', autorizado: false, clique: false, c08: false })).toEqual({ acao: 'perguntar', texto: 'C06 pronto para fechar' })
  expect(decidirFecha({ C: 'C06', modo: 'manual', autorizado: true, clique: false, c08: false })).toEqual({ acao: 'perguntar', texto: 'C06 pronto para fechar' })
  expect(decidirFecha({ C: 'C06', modo: 'pausado', autorizado: true, clique: false, c08: false })).toEqual({ acao: 'nada' })
})

test('A1, A21: deterministic keys of the automatic FECHA, the GO inicio and the click', async () => {
  expect(chaveCicloPendentes('FECHA C06 C06-S01=abcdef1234 C06-S02=1234567890')).toBe('ciclo-pendentes-C06-abcdef1-1234567')
  expect(chaveGoInicio('C07', '20261028-1105')).toBe('go-inicio-C07-20261028-1105')
  expect(chaveGoInicio('C07', '20261028-1105')).not.toMatch(/-fase4-/)
  expect(chaveCliqueMerge('C05', ['ABCDEF1234', '1234567aaa'])).toBe('clique-merge-C05-abcdef1-1234567')
})

test('a malformed FECHA has no key', async () => {
  expect(chaveCicloPendentes('FECHA C06')).toBe(null)
  expect(chaveCicloPendentes('FECHA C06 C06-S01=xyz')).toBe(null)
  expect(chaveCicloPendentes('FECHA C06 C06-S01=abc12')).toBe(null)
  expect(chaveCicloPendentes('GO C06 inicio abcdef1')).toBe(null)
})

test('A15, A16: the profile ceiling and the scope decide what is granted', async () => {
  const perfil = { migracao: { ordem: 'timestamp' }, deploys: [{ alvo: 'notificar', dispara: 'comando' }], merge: { clique: false }, teto: { migracaoProducao: false, deploy: true } }
  const m = liberaProducao({ tipo: 'migracao', nome: '20261109_x' }, perfil, { migracoes: true, deploys: true, merge: true })
  expect(m.ok).toBe(false)
  if (!m.ok) {
    expect(m.perguntar).toBe(false)
    expect(m.espera).toContain('migração 20261109_x')
  }
  const manual = liberaProducao({ tipo: 'migracao', nome: '20261109_x' }, perfil, null)
  expect(!manual.ok && manual.perguntar).toBe(true)
  const semDeploys = liberaProducao({ tipo: 'deploy', nome: 'api' }, { merge: {} }, { deploys: true })
  expect(!semDeploys.ok && semDeploys.perguntar).toBe(true)
  expect(liberaProducao({ tipo: 'deploy', nome: 'notificar' }, perfil, null).ok).toBe(true)
  const escopo = liberaProducao({ tipo: 'deploy', nome: 'notificar' }, perfil, { deploys: false })
  expect(!escopo.ok && !escopo.perguntar && escopo.espera.includes('não cobre deploys')).toBe(true)
  expect(liberaProducao({ tipo: 'merge', nome: 'C07' }, perfil, { merge: true }).ok).toBe(true)
  expect(liberaProducao({ tipo: 'merge', nome: 'C07' }, null, null).ok).toBe(false)
})

test('A23, A24, A26: the dependency GO is due once per set, only in Contínuo', async () => {
  const base = { liberados: ['C07', 'C08'], vazias: ['C07', 'C08'], enviados: new Set<string>(), pedidos: new Set<string>(), modo: 'continuo' }
  expect(goDevidos(base)).toEqual(['C07', 'C08'])
  expect(goDevidos({ ...base, enviados: new Set(['C07']) })).toEqual(['C08'])
  expect(goDevidos({ ...base, pedidos: new Set(['C07', 'C08']) })).toEqual([])
  expect(goDevidos({ ...base, vazias: [] })).toEqual([])
  expect(goDevidos({ ...base, modo: 'pausado' })).toEqual([])
  expect(goDevidos({ ...base, modo: 'manual' })).toEqual([])
})

test('production proofs name every resource of a batch, up to VERIFIED or the stamp', async () => {
  const c = comprovantes(['APPLIED a.sql b.sql  # 2026-10-28T10:00:00Z', 'NOTE APPLIED x', 'DEPLOYED api notificar VERIFIED re-download  # 2026-10-28T11:00:00Z'].join('\n'))
  expect(c.migracoes).toEqual([{ nome: 'a.sql', at: '2026-10-28T10:00:00Z' }, { nome: 'b.sql', at: '2026-10-28T10:00:00Z' }])
  expect(c.deploys.map(d => d.alvo)).toEqual(['api', 'notificar'])
})

const vazio = { migracoes: [], deploys: [], merge: false, go: false }
const ordemA17 = { conjuntos: ['C08'], itens: { C08: ['migracao=20261109_add_continuo', 'merge', 'deploy-notificar'] } }

test('A17: belt rows in order, the holder running, the rest pending', async () => {
  const ls = linhasEsteira(ordemA17, { dono: 'C08', soltos: [], feitos: {}, falha: {}, pr: { C08: 31 } })
  expect(ls.map(l => `${l.k}. ${l.emoji} ${l.titulo}`)).toEqual(['1. 🗄️ migração 20261109_add_continuo', '2. 🔀 merge PR #31', '3. 🚀 deploy da notificar'])
  expect(ls.map(l => l.status)).toEqual(['rodando', 'pendente', 'pendente'])
  expect(linhasEsteira(null, { dono: null, soltos: [], feitos: {}, falha: {}, pr: {} })).toEqual([])
})

test('A18: a failed step turns red and stops the belt', async () => {
  const ls = linhasEsteira({ conjuntos: ['C08', 'C09'], itens: ordemA17.itens }, { dono: 'C08', soltos: [], feitos: {}, falha: { C08: 'timeout' }, pr: {} })
  expect(ls[0]).toMatchObject({ status: 'falhou', erro: 'timeout' })
  expect(ls.slice(1).every(l => l.status === 'pendente')).toBe(true)
})

test('a released set without proofs stays pending, never done', async () => {
  const ls = linhasEsteira(ordemA17, { dono: null, soltos: ['C08'], feitos: { C08: vazio }, falha: {}, pr: {} })
  expect(ls.every(l => l.status === 'pendente' && l.sub.endsWith(' · sem comprovante'))).toBe(true)
  const prova = linhasEsteira(ordemA17, { dono: 'C08', soltos: [], feitos: { C08: { ...vazio, migracoes: ['20261109_add_continuo'] } }, falha: {}, pr: {} })
  expect(prova.map(l => l.status)).toEqual(['feito', 'rodando', 'pendente'])
  expect(prova[0]!.sub).toBe('C08 · aplicada')
})

test('A30: the belt bar has one segment per row, its alt and the terminal fallback', async () => {
  const ls = linhasEsteira(ordemA17, { dono: 'C08', soltos: [], feitos: { C08: { ...vazio, migracoes: ['20261109_add_continuo'] } }, falha: {}, pr: {} })
  expect(resumoEsteira(ls)).toEqual({ segmentos: ['d', 'w', ''], alt: 'esteira de produção: 1 de 3 feitos', terminal: '▮▯▯' })
})

const cart = (o: Partial<Parameters<typeof cartaoMerge>[0]> = {}) =>
  cartaoMerge({
    C: 'C05', pr: 31, ci: 'verde' as Ci, merged: false, deployNoMerge: true, publicado: false, prontoParaMerge: false, clique: false,
    orquestrador: true, dono: null, eu: { pessoa: 'Willian', maquina: 'PC1' }, aplicado: ['migração x'], ...o,
  })

test('A5: the merge card and toast claim only what is proven', async () => {
  const pub = cart({ merged: true, publicado: true })!
  expect(`${pub.emoji} ${pub.titulo}`).toBe('🚀 Mergeado e publicado')
  expect(pub.sub).toBe('PR #31 · gate verde · automático pelo perfil')
  expect(pub.toast).toBe('C05 mergeado e publicado · PR #31 · CI verde · migração x')
  const aguarda = cart({ merged: true })!
  expect(`${aguarda.emoji} ${aguarda.titulo}`).toBe('🔀 Mergeado')
  expect(aguarda.toast).toBe(null)
  expect(aguarda.ultima).toBe('publicação: aguardando o redeploy')
  expect(cart({ merged: true, deployNoMerge: false, aplicado: [] })!.toast).toBe('C05 mergeado · PR #31 · CI verde · só o merge')
  const semChecks = cart({ merged: true, deployNoMerge: false, ci: 'sem-checks' })!
  expect(semChecks.sub).toContain('gate sem checks')
  expect(semChecks.toast).toContain('sem CI')
  expect(semChecks.toast).not.toContain('CI verde')
  expect(cart({ merged: true, deployNoMerge: false, ci: 'sem-pr' })!.toast).not.toContain('PR #')
})

test('A6, A29: a click profile waits with the Button only for the owner', async () => {
  const w = cart({ clique: true, prontoParaMerge: true })!
  expect(`${w.emoji} ${w.titulo}`).toBe('🔀 Pronto para merge')
  expect(w).toMatchObject({ botao: true, borda: 'warning', toast: null, ultima: 'o perfil pede aprovação humana · espera o clique, sem prazo' })
  expect(cart({ clique: true, prontoParaMerge: true, ci: 'nao-confirmado' })!.sub).toBe('PR #31 · gate ainda não confirmado · merge pelo seu clique')
  const ana = cart({ clique: true, prontoParaMerge: true, dono: { pessoa: 'Ana', podeLiberar: false } })!
  expect(ana.botao).toBe(false)
  expect(ana.ultima).toBe('merge e deploy esperam alguém da NovArc')
  expect(cart({ clique: true, prontoParaMerge: true, dono: { pessoa: 'Willian', maquina: 'PC2', podeLiberar: true } })!.botao).toBe(false)
  expect(cart({ clique: true, prontoParaMerge: true, dono: { pessoa: 'Willian', maquina: 'PC1', podeLiberar: true } })!.botao).toBe(true)
  expect(cart({ clique: true, prontoParaMerge: true, orquestrador: false })!.botao).toBe(false)
  expect(cart({ clique: true, prontoParaMerge: false })).toBe(null)
})

test('a card without a PR says PR #? and carries no session id', async () => {
  const c = cart({ pr: null, merged: true, deployNoMerge: false })!
  expect(c.sub).toContain('PR #?')
  expect(JSON.stringify(c)).not.toMatch(/undefined|local_/)
})
