import { expect, test } from 'claude-code/testing'
import {
  acimaDoTeto, autorizado, camposReinicio, escopoSugerido, faixaDeConjuntos, itensCartao, linhaEscopoCartao, modoDe, mudarModo, nomePerfil, registroLiberacao, resumoEscopo, seloModo,
  type AcaoContinuo, type ContinuoDoc, type EscopoContinuo, type Perfil,
} from './logic'
import { SESSOES, URL as URL_I, disparar, dispararDesde, escrito, gravar, iniciar, montar, partesDaFaixa, quieto, textoNo, tick, todos, type Mundo } from './mundo-teste'
import { dadosFaixa, mesclar } from './register'
import { validarConcessao } from './logic'
import { cartaoLiberacao } from './continuo-ui'
import { abaConfiguracao, camposPerfil } from './configuracao-aba'
import { kit } from './kit'
import {
  PERFIL, RUN, DOC, AGORA, ACOES, base, comEscopo, dois, hhmm, local, LENTO, COD, RUN_I, ORQ_DIR, LDIR, PLANO_I, ATE, ESCOPO_I, DOC_I, seg, calado, enviados, maestro, peer, poll, ctxOrq, listasConfig, orq, conjunto, baseCompose, compor, secaoModo, PANE_I, BANDA_I, LEIT_I, EX_ORQ, EX_CONJ, EX_SPEC, painel, estado, variante, svgsDaFaixa, NOVA, DIR_NOVA, PLANO_V, AG_V, ESC_V, docV, iV, motivo, comA, comE, peca, PECA, montarPeca, desenhar, partes, emOrdem, hojeAs, PERFIL_ALTO, PLANO_A, ctxA, CLAUDE_MD, comImport, LINHA_A, docGrant, gravarGrant, digitar, negado, armar, NAO, TURNO, PERFIL_CFG, PLANO_CFG, docCfg, aba, textoDe, MODO_MAESTRO, PLANO_P, MOTIVO_P, LINHA_P, MAIS_LENTO, orqP, linhasParada, linhasModo, setsParada, submetidos, bloqueio, banda, corpoDoPainel, reiniciar, semReverter,
} from './continuo-teste'

test('autorizado: A11 each refusal has its own motivo; C06 inside the time passes', () => {
  expect(autorizado({ ...base, conjunto: 'C07' })).toEqual({ ok: false, motivo: 'C07 fora do escopo liberado' })
  expect(autorizado({ ...base, runId: '20261104-1000' })).toEqual({ ok: false, motivo: 'liberação de outra execução' })
  const vencida = autorizado({ ...base, agora: Date.parse('2026-11-03T21:00:00Z') })
  expect(vencida.ok).toBe(false)
  expect(vencida.motivo).toBe(`liberação vencida às ${hhmm('2026-11-03T21:00:00Z')}`)
  expect(autorizado({ ...base, autorizacao: { ...DOC, modo: 'pausado' } })).toEqual({ ok: false, motivo: 'modo pausado' })
  const semHab = { ...DOC, autorizacao: { ...DOC.autorizacao! } } as ContinuoDoc
  delete (semHab.autorizacao as Partial<typeof semHab.autorizacao>)!.continuoHabilitado
  expect(autorizado({ ...base, autorizacao: semHab })).toEqual({ ok: false, motivo: 'liberação sem @NOVARC-CONTINUO.md de quem liberou' })
  expect(autorizado({ ...base, autorizacao: { ...DOC, autorizacao: null } })).toEqual({ ok: false, motivo: 'sem liberação do contínuo nesta execução' })
  expect(autorizado({ ...base, autorizacao: null })).toEqual({ ok: false, motivo: 'sem liberação do contínuo nesta execução' })
  expect(autorizado(base)).toEqual({ ok: true, motivo: '' })
})

test('autorizado: A6 porAcao refuses every action', () => {
  const perfil = { ...PERFIL, teto: { ...PERFIL.teto, porAcao: true } }
  for (const acao of ACOES) expect(autorizado({ ...base, perfil, acao })).toEqual({ ok: false, motivo: 'o CLAUDE.md do cliente exige autorização por ação' })
})

test('autorizado: A12 owner', () => {
  expect(autorizado({ ...base, dono: 'Jean' })).toEqual({ ok: false, motivo: 'liberação de Willian; quem conduz agora é Jean: libere de novo' })
  expect(autorizado({ ...base, dono: null }).ok).toBe(true)
  expect(autorizado({ ...base, dono: 'Willian' }).ok).toBe(true)
  expect(autorizado(base).ok).toBe(true)
})

test('autorizado: R11 never above the ceiling', () => {
  const tudo = comEscopo({ merge: true, deploys: true, migracoes: true })
  expect(autorizado({ ...base, autorizacao: tudo, acao: 'deploy' })).toEqual({ ok: false, motivo: 'deploy acima do teto do perfil' })
  expect(autorizado({ ...base, autorizacao: tudo, acao: 'merge', perfil: { ...PERFIL, teto: { ...PERFIL.teto, ate: 'pr-aberto' } } })).toEqual({ ok: false, motivo: 'merge acima do teto do perfil' })
  expect(autorizado({ ...base, autorizacao: tudo, acao: 'migracao' })).toEqual({ ok: false, motivo: 'migracao acima do teto do perfil' })
  expect(autorizado({ ...base, autorizacao: comEscopo({ merge: false }), acao: 'merge' })).toEqual({ ok: false, motivo: 'merge fora do escopo liberado' })
  const alto = { ...PERFIL, teto: { ate: 'deploy' as const, migracaoProducao: true, deploy: true, porAcao: false } }
  for (const acao of ['merge', 'migracao', 'deploy'] as const) expect(autorizado({ ...base, autorizacao: tudo, acao, perfil: alto }).ok).toBe(true)
})

test('autorizado: R6 a profile without teto asks', () => {
  for (const perfil of [{}, null] as (Perfil | null)[])
    for (const acao of ACOES) expect(autorizado({ ...base, perfil, acao })).toEqual({ ok: false, motivo: 'o perfil não descreve o teto do contínuo: o orquestrador pergunta' })
})

test('autorizado: fase outside the scope', () => {
  expect(autorizado({ ...base, fase: 'f7' })).toEqual({ ok: false, motivo: 'fase f7 fora do escopo liberado' })
  expect(autorizado({ ...base, fase: 'f6' }).ok).toBe(true)
  expect(autorizado({ ...base, fase: undefined }).ok).toBe(true)
})

test('autorizado: modo override', () => {
  const pausado = { ...DOC, modo: 'pausado' as const }
  expect(autorizado({ ...base, autorizacao: pausado }).ok).toBe(false)
  expect(autorizado({ ...base, autorizacao: pausado, modo: 'continuo' }).ok).toBe(true)
})

test('escopoSugerido: A5 without migracao offers no migrations', () => {
  const plano = { conjuntos: [{ id: 'C06', titulo: 'a', specs: [], fase: 'f6' }, { id: 'C07', titulo: 'b', specs: [], fase: 'f6' }, { id: 'C08', titulo: 'c', specs: [], fase: 'f7' }] }
  const alto: Perfil = { ...PERFIL, teto: { ate: 'deploy', migracaoProducao: true, deploy: true, porAcao: false } }
  const tudo = escopoSugerido(alto, plano, local(10, 0).getTime())
  expect(tudo).toMatchObject({ conjuntos: ['C06', 'C07', 'C08'], fases: ['f6', 'f7'], merge: true, migracoes: true, deploys: true })
  expect(escopoSugerido({ ...alto, migracao: undefined }, plano, AGORA).migracoes).toBe(false)
  expect(escopoSugerido({ ...alto, deploys: undefined }, plano, AGORA).deploys).toBe(false)
  expect(escopoSugerido({ ...PERFIL, teto: { ate: 'pr-aberto' } }, plano, AGORA).merge).toBe(false)
  expect(escopoSugerido({ ...PERFIL, teto: { porAcao: true } }, plano, AGORA)).toEqual({ conjuntos: [], fases: [], merge: false, migracoes: false, deploys: false, ate: null })
  expect(escopoSugerido(PERFIL, plano, AGORA, ['C07']).conjuntos).toEqual(['C07'])
  expect(escopoSugerido(PERFIL, plano, AGORA, ['C07']).fases).toEqual(['f6'])
  expect(new Date(tudo.ate!).getTime()).toBe(local(18, 0).getTime())
  expect(new Date(escopoSugerido(alto, plano, local(17, 30).getTime()).ate!).getTime()).toBe(local(18, 30).getTime())
})

test('acimaDoTeto', () => {
  const nada: EscopoContinuo = { conjuntos: [], fases: [], merge: false, migracoes: false, deploys: false, ate: null }
  expect(acimaDoTeto({ ...nada, merge: true }, { ate: 'pr-aberto' })).toBe('merge acima do teto do perfil')
  expect(acimaDoTeto({ ...nada, migracoes: true }, { ate: 'merge', migracaoProducao: false })).toBe('migrações acima do teto do perfil')
  expect(acimaDoTeto({ ...nada, deploys: true }, { ate: 'merge', deploy: false })).toBe('deploy acima do teto do perfil')
  expect(acimaDoTeto(nada, undefined)).toBe('o perfil não descreve o teto do contínuo: o orquestrador pergunta')
  expect(acimaDoTeto({ ...nada, merge: true }, { ate: 'merge' })).toBe(null)
})

test('registroLiberacao: A8 shape and A35 no ids', () => {
  const escopo: EscopoContinuo = { conjuntos: ['C06'], fases: ['f6'], merge: true, migracoes: false, deploys: false, ate: '2026-11-03T21:00:00Z' }
  const i = { by: 'Willian', at: '2026-11-03T13:01:00Z', escopo, perfil: PERFIL, runId: RUN, continuoHabilitado: true, modoAntes: 'manual' as const, projeto: 'Maestro v2' }
  const r = registroLiberacao(i)
  if (!r.ok) throw new Error(r.motivo)
  expect(r.doc.autorizacao!.continuoHabilitado).toBe(true)
  expect(r.doc.runId).toBe(RUN)
  expect(r.doc.modo).toBe('continuo')
  expect(r.doc.modoBy).toBe('Willian')
  expect(r.auditoria).toEqual({ acao: 'LIBERACAO', antes: 'manual', depois: resumoEscopo(escopo, 'Maestro v2'), regra: 'p-excecao-claude-md' })
  expect(JSON.stringify(r.doc)).not.toMatch(/local_/)
  expect(JSON.stringify(r.doc)).not.toMatch(/@[a-z0-9.-]+\.[a-z]/i)
  expect(registroLiberacao({ ...i, continuoHabilitado: false })).toEqual({ ok: false, motivo: 'sem @NOVARC-CONTINUO.md no seu CLAUDE.md; quem pode liberar roda /maestro continuo habilitar' })
  const alto = { ...escopo, deploys: true }
  expect(registroLiberacao({ ...i, escopo: alto })).toEqual({ ok: false, motivo: acimaDoTeto(alto, PERFIL.teto) })
})

test('modoDe', () => {
  expect(modoDe(null, RUN)).toBe('manual')
  expect(modoDe(DOC, '20261104-1000')).toBe('manual')
  expect(modoDe(DOC, RUN)).toBe('continuo')
  expect(modoDe({ ...DOC, modo: 'pausado' }, RUN)).toBe('pausado')
  // a doc with no runId is no other run's (guardas A23 seeds one)
  expect(modoDe({ modo: 'pausado' } as ContinuoDoc, RUN)).toBe('pausado')
  expect(modoDe({ ...DOC, runId: '' }, null)).toBe('continuo')
})

test('mudarModo: R28 pausar', () => {
  const i = { by: 'Willian', agora: AGORA, runId: RUN, perfil: PERFIL }
  const esperado = { ok: true, campos: { modo: 'pausado', modoBy: 'Willian', modoAt: new Date(AGORA).toISOString() }, antes: 'continuo', texto: 'Modo contínuo pausado. Nada sai sozinho até retomar.' }
  expect(mudarModo(DOC, 'pausar', i)).toEqual(esperado)
  expect(mudarModo({ ...DOC, modo: 'pausado' }, 'pausar', i)).toMatchObject({ ok: true, campos: esperado.campos })
  expect(mudarModo(null, 'pausar', i)).toEqual({ ...esperado, antes: 'manual' })
  expect(mudarModo(DOC, 'pausar', { ...i, runId: '20261104-1000' })).toEqual({ ...esperado, antes: 'manual' })
})

test('registroLiberacao: the default project word keeps the summary readable', () => {
  const r = registroLiberacao({ by: 'W', at: '2026-11-03T13:01:00Z', escopo: { conjuntos: ['C06'], fases: [], merge: false, migracoes: false, deploys: false, ate: null }, perfil: PERFIL, runId: RUN, continuoHabilitado: true, modoAntes: 'manual' })
  expect(r.ok && r.auditoria.depois).toBe('GO, HOLD e FECHA no projeto')
})

test('mudarModo: R38/R40 retomar', () => {
  const i = { by: 'Willian', agora: AGORA, runId: RUN, perfil: PERFIL }
  const pausado = { ...DOC, modo: 'pausado' as const }
  const r = mudarModo(pausado, 'retomar', i)
  expect(r).toMatchObject({ ok: true, antes: 'pausado', texto: 'Modo contínuo retomado com o escopo de antes.' })
  expect(r.ok && r.campos.modo).toBe('continuo')
  const recusa = { ok: false, texto: 'Retomar exige a liberação desta execução: libere de novo no turno do orquestrador.' }
  expect(mudarModo(pausado, 'retomar', { ...i, runId: '20261104-1000' })).toEqual(recusa)
  expect(mudarModo(pausado, 'retomar', { ...i, agora: Date.parse('2026-11-03T22:00:00Z') })).toEqual(recusa)
  expect(mudarModo({ ...pausado, autorizacao: { ...pausado.autorizacao!, continuoHabilitado: false } }, 'retomar', i)).toEqual(recusa)
  expect(mudarModo(pausado, 'retomar', { ...i, dono: 'Jean' })).toEqual(recusa)
  expect(mudarModo(null, 'retomar', i)).toEqual(recusa)
})

test('mudarModo: manual', () => {
  const r = mudarModo(DOC, 'manual', { by: 'Willian', agora: AGORA, runId: RUN, perfil: PERFIL })
  expect(r).toMatchObject({ ok: true, texto: 'Modo manual: o orquestrador age quando você fala com ele.' })
  expect(r.ok && r.campos.modo).toBe('manual')
})

test('camposReinicio (R14)', () => {
  expect(camposReinicio(RUN, 'Willian', AGORA)).toEqual({ runId: RUN, modo: 'manual', modoBy: 'Willian', modoAt: new Date(AGORA).toISOString(), autorizacao: null })
})

test('resumoEscopo', () => {
  const e: EscopoContinuo = { conjuntos: [], fases: [], merge: true, migracoes: false, deploys: true, ate: local(18, 0).toISOString() }
  expect(resumoEscopo(e, 'Maestro v2')).toBe('GO, HOLD, FECHA, merge e deploy no Maestro v2 · até 18:00')
  expect(resumoEscopo({ ...e, merge: false, deploys: false }, 'Maestro v2')).toBe('GO, HOLD e FECHA no Maestro v2 · até 18:00')
  expect(resumoEscopo({ ...e, migracoes: true }, 'Maestro v2')).toBe('GO, HOLD, FECHA, merge, migrações e deploy no Maestro v2 · até 18:00')
  expect(resumoEscopo({ ...e, ate: null }, 'Maestro v2')).toBe('GO, HOLD, FECHA, merge e deploy no Maestro v2')
})

test('faixaDeConjuntos, nomePerfil and seloModo', () => {
  expect(faixaDeConjuntos(['C06', 'C07', 'C08', 'C09'])).toBe('C06 a C09')
  expect(faixaDeConjuntos(['C06'])).toBe('C06')
  expect(faixaDeConjuntos([])).toBe('nenhum conjunto')
  expect(nomePerfil({ projeto: { cliente: 'Brinkanto', nomeCurto: 'OMNI' } })).toBe('brinkanto-omni')
  expect(nomePerfil({ projeto: { codigo: 'BRK' } })).toBe('brk')
  expect(nomePerfil({})).toBe('projeto')
  expect(seloModo('manual', false)).toEqual({ texto: 'modo manual', tom: 'neutro' })
  expect(seloModo('continuo', false)).toEqual({ texto: 'modo contínuo', tom: 'ok' })
  expect(seloModo('pausado', false)).toEqual({ texto: 'pausado', tom: 'ruim' })
  expect(seloModo('manual', true)).toEqual({ texto: 'manual · definido na orquestradora', tom: 'neutro' })
  expect(seloModo('continuo', true)).toEqual({ texto: 'contínuo · liberado na orquestradora', tom: 'ok' })
  expect(seloModo('pausado', true)).toEqual({ texto: 'pausado · liberado na orquestradora', tom: 'ruim' })
})

test('card lines: linhaEscopoCartao and itensCartao', () => {
  const e: EscopoContinuo = { conjuntos: ['C06', 'C07', 'C08', 'C09'], fases: [], merge: true, migracoes: false, deploys: true, ate: local(18, 0).toISOString() }
  const hoje = local(10, 0).getTime()
  expect(linhaEscopoCartao(e, 'maestro')).toBe('Esta execução · C06 a C09 · merge e deploy automáticos · teto do perfil maestro')
  expect(linhaEscopoCartao({ ...e, deploys: false }, 'maestro')).toContain('· merge automático ·')
  expect(linhaEscopoCartao({ ...e, merge: false, deploys: false }, 'maestro')).toContain('· sem merge automático ·')
  expect(itensCartao(e, hoje)).toEqual(['GO, HOLD e FECHA sem perguntar', 'merge e deploy na ordem da fila', 'vale até 18:00 de hoje; pausar a qualquer momento'])
  expect(itensCartao({ ...e, deploys: false }, hoje)[1]).toBe('merge na ordem da fila')
  expect(itensCartao({ ...e, merge: false, deploys: false, ate: null }, hoje)).toEqual(['GO, HOLD e FECHA sem perguntar', 'sem hora para acabar; pausar a qualquer momento'])
  expect(itensCartao({ ...e, ate: new Date(2026, 10, 4, 9, 5).toISOString() }, hoje)[2]).toBe('vale até 04/11 09:05; pausar a qualquer momento')
})

test('A54 old state draws defaults (R56)', () => {
  expect(mesclar('maestroContinuo', undefined)).toEqual({ doc: null, versao: null, at: null })
  expect(mesclar('maestroContinuoUi', { cartao: true })).toEqual({ cartao: true, erro: null, recado: false, pedidoEm: null })
  expect(mesclar('maestroParadas', { abertas: 'x' })).toEqual({ abertas: [], tratadas: {}, pendentes: {}, pausaPendente: null })
  const D = { acao: 'PARADA' } as any
  expect(mesclar('maestroParadas', { pendentes: { k: { doc: D, falhas: 2 } }, pausaPendente: { at: 1, modoAt: 'x' } })).toEqual({ abertas: [], tratadas: {}, pendentes: { k: { doc: D, falhas: 2 } }, pausaPendente: { at: 1, modoAt: 'x' } })
  expect(mesclar('maestroParadas', { tratadas: [], pausaPendente: 'x' })).toEqual({ abertas: [], tratadas: {}, pendentes: {}, pausaPendente: null })
})

test('A40 poll call count is the same with and without config/continuo; the cache holds it', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  await maestro($, '')
  await quieto(m)
  let n = m.tools.length
  await maestro($, '')
  await quieto(m)
  const sem = m.tools.length - n
  m.db!['config/continuo'] = { data: DOC_I('continuo'), version: 1 }
  n = m.tools.length
  await maestro($, '')
  await quieto(m)
  expect(m.tools.length - n).toBe(sem)
  expect(escrito(m, 'maestroContinuo').doc.modo).toBe('continuo')
  expect(escrito(m, 'maestroContinuo').versao).toBe(1)
})

test('A40 set seal refreshes on a received HOLD', LENTO, async ($: any, on: any) => {
  const m = await conjunto($, on)
  m.db!['config/continuo'] = { data: DOC_I('pausado'), version: 3 }
  await peer($, 'HOLD C02 x')
  await quieto(m)
  expect(escrito(m, 'maestroContinuo').doc.modo).toBe('pausado')
})

test('A13 a new run id resets config/continuo to manual with no grant (R14)', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { dir: 'C:/repo/.novarc/ledger/novarc-orq/20261104-1000', db: { 'config/continuo': { data: DOC_I('continuo'), version: 4 } } })
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: '20261104-1000', modo: 'manual', modoBy: 'Maestro', autorizacao: null })
  const w = m.tools.find((t: any) => t.tool === 'ArtifactData' && t.doc_id === 'continuo' && t.action === 'update') as any
  expect(w?.if_version).toBe(4)
  // the same run on the next poll: nothing more is written
  const n = m.tools.filter((t: any) => t.doc_id === 'continuo').length
  await poll(m)
  expect(m.tools.filter((t: any) => t.doc_id === 'continuo').length).toBe(n)
})

test('pausar closes the gate at once, no refresh in between', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  const n = listasConfig(m)
  await maestro($, 'pausar')
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(listasConfig(m)).toBe(n)
})

test('pausar when the db write fails still closes the local gate, and a refresh that still reads Contínuo never reopens it', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  m.falharTool = (e: any) => e.collection === 'config' && e.doc_id === 'continuo'
  const r = await maestro($, 'pausar')
  expect(r?.text).toBe('Pausado nesta sessão; não consegui gravar no planejamento: boom')
  await tick(m)
  expect(enviados(m)).toEqual([])
  await maestro($, '') // the poll re-reads config: still Contínuo in the db
  await quieto(m)
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(escrito(m, 'maestroContinuo').doc.modo).toBe('pausado')
  expect(escrito(m, 'maestroFaixaDados').modo).toBe('pausado')
})

test('A27 pausar writes modo pinned, replies, and queues one MODO audit row (R28, R37)', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 2 } } })
  const desde = m.timers.length
  const r = await maestro($, 'pausar')
  expect(r?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
  const d = m.db!['config/continuo']!.data
  expect([d.modo, d.modoBy]).toEqual(['pausado', 'Willian'])
  expect(d.autorizacao).toEqual(DOC_I('continuo').autorizacao)
  const w = m.tools.find((t: any) => t.doc_id === 'continuo' && t.action === 'update') as any
  expect([w?.if_version, 'autorizacao' in (w?.data ?? {})]).toEqual([2, false])
  dispararDesde(m, desde)
  await quieto(m)
  const rows = Object.entries(m.db!).filter(([k, v]) => k.startsWith('auditoria/') && v.data.acao === 'MODO').map(([, v]) => v.data)
  expect(rows.map(x => [x.antes, x.depois, x.regra])).toEqual([['continuo', 'pausado', 'd-continuo-por-orquestrador']])
  expect(escrito(m, 'maestroFaixaDados').modo).toBe('pausado')
})

test('A37 pausar and retomar outside the orchestrator change nothing (R39)', LENTO, async ($: any, on: any) => {
  const m = await conjunto($, on)
  m.db!['config/continuo'] = { data: DOC_I('continuo'), version: 1 }
  expect((await maestro($, 'pausar'))?.text).toBe('Pausar só na sessão orquestradora.')
  expect((await maestro($, 'retomar'))?.text).toBe('Retomar só na sessão orquestradora.')
  expect(m.db!['config/continuo']).toEqual({ data: DOC_I('continuo'), version: 1 })
})

test("A38 retomar with another run's authorization stays Pausado (R40)", LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { semPoll: true, db: { 'config/continuo': { data: DOC_I('pausado', '20261102-0800'), version: 1 } } })
  expect((await maestro($, 'retomar'))?.text).toBe('Retomar exige a liberação desta execução: libere de novo no turno do orquestrador.')
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  expect(m.tools.some((t: any) => t.doc_id === 'continuo' && (t.action === 'update' || t.action === 'set'))).toBe(false)
})

test('A36 retomar returns the recorded scope and resends nothing (R38)', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
  const escopo = m.db!['config/continuo']!.data.autorizacao.escopo
  await maestro($, 'pausar')
  await tick(m)
  expect((await maestro($, 'retomar'))?.text).toBe('Modo contínuo retomado com o escopo de antes.')
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
  expect(m.db!['config/continuo']!.data.autorizacao.escopo).toEqual(escopo)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
})

test('pausar with no config/continuo document creates it with set', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  expect((await maestro($, 'pausar'))?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
  const w = m.tools.find((t: any) => t.doc_id === 'continuo' && t.action === 'set') as any
  expect(w?.if_version).toBeUndefined()
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: RUN_I, modo: 'pausado', modoBy: 'Willian', autorizacao: null })
})

test('pausar without an artifact: the mode stays manual', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { exec: { papel: 'orquestrador', ledgerDir: ORQ_DIR, forks: {}, codigo: COD } }
  await iniciar($)
  expect((await maestro($, 'pausar'))?.text).toBe('Sem planejamento: o modo fica manual.')
})

// ---- Task 12: R29 gate proof and the novarc:maestro-modo section (R41)

test('A27 next tick after Pausado sends no status request; Contínuo again sends it (R29)', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('pausado'), version: 1 } } })
  await tick(m)
  expect(enviados(m)).toEqual([])
  m.db!['config/continuo']!.data.modo = 'continuo'
  await poll(m)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
})

test('R29 an action between its audit write and its send completes', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  let soltar = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  m.segurarTool = (e: any) => (e.collection === 'auditoria' && e.action === 'set' ? preso : null)
  disparar(m)
  await quieto(m)
  expect(m.tools.some((t: any) => t.collection === 'auditoria' && t.action === 'set')).toBe(true)
  m.segurarTool = null
  await maestro($, 'pausar')
  soltar()
  await quieto(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
  await tick(m)
  expect(enviados(m).length).toBe(1)
})

test('A39 the section holds the mode and the scope only, under 100 tokens (R41)', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  const s = await secaoModo($)
  expect([s?.scope, s?.text]).toEqual(['session', 'Maestro: modo contínuo · escopo GO, HOLD, FECHA e merge no Maestro · até 18:00'])
  expect(/local_|@/.test(s.text)).toBe(false)
  expect(s.text.length / 4 < 100).toBe(true)
  m.db!['config/continuo']!.data.modo = 'manual'
  await poll(m)
  expect((await secaoModo($))?.text).toBe('Maestro: modo manual · o orquestrador age quando você fala com ele na conversa')
})

test('A39 a set session gets the section', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  await conjunto($, on)
  expect((await secaoModo($))?.text).toBe('Maestro: modo manual · o orquestrador age quando você fala com ele na conversa')
})

test('A39 a spec session and a session with no run get no section', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  const m = montar(on, {})
  await iniciar($)
  expect(await secaoModo($)).toBeUndefined()
  m.servirEstado = { exec: { papel: 'spec', conjunto: 'C02', spec: 'C02-S01', ledgerDir: LDIR, forks: {} } }
  await iniciar($)
  await quieto(m)
  expect(await secaoModo($)).toBeUndefined()
})

test('A24 orchestrator strip in Contínuo; the band shows the mode only as its seal', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = estado(EX_ORQ, DOC_I('continuo'))
  await iniciar($)
  const ui = await painel($, 'desktop')
  expect([await variante(ui, 'modo-manual'), await variante(ui, 'modo-continuo'), await variante(ui, 'modo-pausado')]).toEqual(['secondary', 'primary', 'secondary'])
  expect((await ui.find({ key: 'modo-continuo' }))?.text).toBe('🔁 Contínuo')
  expect(await ui.find({ key: 'sino' })).toBeDefined()
  expect((await svgsDaFaixa(ui)).some((s: any) => String(s.alt).startsWith('🔁 escopo: GO, HOLD, FECHA'))).toBe(true)
  await ui.unmount()
  m.servirEstado = { maestroFaixaDados: dadosFaixa({ papel: 'orquestrador', ledgerDir: null, forks: {} } as any, null, [], null, Date.now(), 'eu', [], [], null, [], 'continuo') }
  for (const surface of ['desktop', 'terminal'] as const) {
    const b = await $.ui.mount({ ...BANDA_I, surface })
    const p = partesDaFaixa(await b.drawn())
    expect(p.direita[0]).toBe(surface === 'desktop' ? 'modo contínuo' : ' [modo contínuo] ')
    expect(await b.find({ type: 'Button', text: /Manual|Contínuo|Pausado/ })).toBeUndefined()
    await b.unmount()
  }
})

test('A49 the selected mode is primary; the scope pill per mode', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = estado(EX_ORQ, DOC_I('pausado'))
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  expect([await variante(ui, 'modo-manual'), await variante(ui, 'modo-continuo'), await variante(ui, 'modo-pausado')]).toEqual(['secondary', 'secondary', 'primary'])
  expect((await svgsDaFaixa(ui)).map((s: any) => s.alt)).toEqual(['⏸️ nada sai sozinho · retomar volta ao escopo de antes'])
  await ui.unmount()
  m.servirEstado = estado(EX_ORQ, null)
  ui = await painel($, 'desktop')
  expect(await variante(ui, 'modo-manual')).toBe('primary')
  expect((await svgsDaFaixa(ui)).map((s: any) => s.alt)).toEqual(['ⓘ o orquestrador age quando você fala com ele na conversa'])
  await ui.unmount()
  // another run's document reads Manual (R14)
  m.servirEstado = estado(EX_ORQ, DOC_I('continuo', '20261102-0800'))
  ui = await painel($, 'desktop')
  expect(await variante(ui, 'modo-manual')).toBe('primary')
  await ui.unmount()
})

test('A25 set and spec strip: MODO, the seal, the bell, ✍️ intervir, no mode Button (R26)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (const ex of [EX_CONJ, EX_SPEC]) {
    m.servirEstado = estado(ex, DOC_I('continuo'))
    const ui = await painel($, 'desktop')
    expect(await ui.find({ type: 'Text', text: 'MODO' })).toBeDefined()
    expect((await svgsDaFaixa(ui)).map((s: any) => s.alt)).toEqual(['contínuo · liberado na orquestradora'])
    expect(await ui.find({ key: 'sino' })).toBeDefined()
    expect([(await ui.find({ key: 'intervir' }))?.text, await variante(ui, 'intervir')]).toEqual(['✍️ intervir', 'secondary'])
    for (const k of ['modo-manual', 'modo-continuo', 'modo-pausado']) expect(await ui.find({ key: k })).toBeUndefined()
    await ui.unmount()
  }
  m.servirEstado = estado(EX_CONJ, DOC_I('continuo'), { maestroContinuoUi: { recado: true } })
  const ui = await painel($, 'desktop')
  expect(await variante(ui, 'intervir')).toBe('primary')
  await ui.press({ key: 'intervir' })
  expect(escrito(m, 'maestroContinuoUi').recado).toBe(false)
  await ui.unmount()
})

test('A50 strip Svg rules, theme keys only, and the terminal fallback (R52)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (const [ex, doc] of [[EX_ORQ, DOC_I('continuo')], [EX_ORQ, null], [EX_CONJ, DOC_I('pausado')]] as const) {
    m.servirEstado = estado(ex, doc)
    let ui: any = await painel($, 'desktop')
    const faixa = await ui.find({ key: 'modo' })
    expect(todos(faixa).some((n: any) => n.type === 'Svg')).toBe(true)
    for (const s of todos(faixa).filter((n: any) => n.type === 'Svg')) {
      expect(String(s.props.alt).trim().length > 0).toBe(true)
      expect([typeof s.props.width, typeof s.props.height]).toEqual(['number', 'number'])
      expect(String(s.props.source)).toContain('prefers-color-scheme: dark')
    }
    for (const n of todos(faixa)) for (const p of ['color', 'backgroundColor', 'borderColor']) expect(/^#/.test(String(n.props?.[p] ?? ''))).toBe(false)
    await ui.unmount()
    ui = await painel($, 'terminal')
    const t = todos(await ui.find({ key: 'modo' }))
    expect(t.some((n: any) => n.type === 'Svg')).toBe(false)
    const textos = t.filter((n: any) => n.type === 'Text').map(textoNo)
    if (ex === EX_CONJ) expect(textos).toContain(' [pausado · liberado na orquestradora] ')
    else expect(textos.some((x: string) => (doc ? x.startsWith('🔁 escopo: GO, HOLD, FECHA') : x.startsWith('ⓘ ')))).toBe(true)
    await ui.unmount()
  }
})

test('A53 going Manual → Contínuo opens the card and calls $.ui.ask 0 times (R55)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = estado(EX_ORQ, null)
  await iniciar($)
  const ui = await painel($, 'desktop')
  await ui.press({ key: 'modo-continuo' })
  await quieto(m)
  // $.ui.ask reaches the engine as a tool.call carrying the AskUserQuestion input (`questions`)
  expect(m.tools.filter((t: any) => 'questions' in t || /AskUserQuestion/.test(String(t.tool))).length).toBe(0)
  expect(escrito(m, 'maestroContinuoUi')).toMatchObject({ cartao: true, erro: null })
  await ui.unmount()
})

test('fix 1: the R14 reset keeps a failed pause: the db reads pausado and nothing is sent', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { semPoll: true, dir: DIR_NOVA, conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  m.falharTool = (e: any) => e.collection === 'config' && e.doc_id === 'continuo'
  expect((await maestro($, 'pausar'))?.text).toBe('Pausado nesta sessão; não consegui gravar no planejamento: boom')
  m.falharTool = null
  await poll(m) // the reset of the old run's doc succeeds
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: NOVA, modo: 'pausado', autorizacao: null })
})

test('fix 2: a mode write never sends a cached grant: the doc vanished (create path)', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  delete m.db!['config/continuo']
  await maestro($, 'pausar')
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: RUN_I, modo: 'pausado', autorizacao: null })
  expect(m.tools.filter((t: any) => t.doc_id === 'continuo' && t.data?.autorizacao).length).toBe(0)
})

test('fix 2: a mode write never sends a cached grant: the retry re-reads another run', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  m.db!['config/continuo'] = { data: { runId: '20261105-0800', modo: 'manual', modoBy: 'Maestro', modoAt: 'x', autorizacao: null }, version: 2 }
  await maestro($, 'pausar')
  expect(m.db!['config/continuo']!.data).toMatchObject({ modo: 'pausado', autorizacao: null })
  expect(m.tools.filter((t: any) => t.doc_id === 'continuo' && t.data?.autorizacao).length).toBe(0)
})

test('fix 3: right after a run switch the pause carries the new run id and survives the next poll', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { dir: DIR_NOVA, db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  expect(m.db!['config/orquestracao']!.data.runId).toBe(NOVA)
  await maestro($, 'pausar')
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: NOVA, modo: 'pausado' })
  await poll(m)
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: NOVA, modo: 'pausado' })
})

test('A41 order of the tab body, pane at 64 and 48 columns', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (const bodyColumns of [64, 48]) {
    m.servirEstado = { ...estado(EX_ORQ, null, { maestroAba: 'configuracao' }), ctx: { ...ctxOrq(), plano: PLANO_CFG } }
    const ui = await $.ui.mount({ ...PANE_I, surface: 'desktop', props: { ...PANE_I.props, bodyColumns } })
    const seq = partes(await ui.find({ key: 'corpo' }))
    expect(emOrdem(seq, [
      'Regras desta execução', 'liberação · conferida antes de cada session-end', '🔓 LIBERAÇÃO', '🛡️ TETO DO PERFIL', '⏱️ VALE ATÉ', '📋 ESCOPO LIBERADO',
      'perfil do projeto · novarc-maestro', '🧱 código e testes', '🐙 git e merge', '🚀 banco e deploy',
      '📍 fonte: execucao.perfil no planejamento · gerado pelo session-plan em ', 'passagem da execução', '🤝 Passar a execução para outro sócio',
    ])).toBe(true)
    expect(seq).toContain('modo manual')
    expect(seq.some(s => s.endsWith(' · só tipos, comandos e sim/não, nunca segredo'))).toBe(true)
    await ui.unmount()
  }
})

test('hotkey 6: the tab Button in every role, primary when selected (A49)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  for (const ex of [EX_ORQ, EX_CONJ, EX_SPEC]) {
    m.servirEstado = { ...estado(ex, null, { maestroAba: 'configuracao' }), ctx: { ...ctxOrq(), plano: PLANO_CFG } }
    const ui = await painel($, 'desktop')
    const b = await ui.find({ key: 't-configuracao' })
    expect([b?.text, b?.props.hotkey, b?.props.variant]).toEqual(['⚙️ Configuração', '6', 'primary'])
    expect(await ui.find({ type: 'Text', text: '🤝 Passar a execução para outro sócio' })).toBeDefined()
    await ui.unmount()
  }
  m.servirEstado = { ...estado(EX_ORQ, null), ctx: { ...ctxOrq(), plano: PLANO_CFG } }
  const ui = await painel($, 'desktop')
  expect(await variante(ui, 't-configuracao')).toBe('secondary')
  await ui.press({ key: 't-configuracao' })
  expect(escrito(m, 'maestroAba')).toBe('configuracao')
  await ui.unmount()
})

test('A7 empty profile: the 📭 card, the rest drawn; an empty field asks', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { perfil: null }))
  let seq = partes(await ui.find({ key: 'raiz' }))
  for (const t of ['📭', 'Nada aqui ainda', 'perfil do projeto ainda não gerado pelo session-plan', 'Regras desta execução', '🔓 LIBERAÇÃO', '📋 ESCOPO LIBERADO', 'modo manual']) expect(seq).toContain(t)
  expect(seq.some(s => s.startsWith('📍 fonte:'))).toBe(false)
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { perfil: { ...PERFIL_CFG, gate: {} } }))
  const gate = await ui.find({ key: 'campo-gate' })
  expect(gate.props.borderColor).toBe('warning')
  expect(partes(gate)).toEqual(['🧪 GATE', 'não descrito', '❔ o orquestrador pergunta antes'])
  expect(todos(gate).find((n: any) => n.type === 'Text' && textoNo(n) === 'não descrito').props.color).toBe('warning')
  expect(await textoDe(ui, 'campo-hostGit')).toEqual(['🐙 HOST GIT', 'GitHub', '📍 remote origin'])
  expect((await ui.find({ key: 'campo-hostGit' })).props.borderColor).toBe('promptBorder')
  seq = partes(await ui.find({ key: 'raiz' }))
  expect(seq).toContain('Regras desta execução')
  await ui.unmount()
})

test('A8 liberado: the pill, the LIBERAÇÃO and TETO cards; Manual reads não liberada', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0)) }))
  expect(await textoDe(ui, 'cfg-resumo')).toContain('contínuo liberado')
  expect(await textoDe(ui, 'cfg-lib')).toEqual(['🔓 LIBERAÇÃO', 'liberada às 13:01', '📍 por Willian em 03/11 · banco do planejamento'])
  expect(todos(await ui.find({ key: 'cfg-lib' })).find((n: any) => textoNo(n) === 'liberada às 13:01' && n.type === 'Text').props.color).toBe('success')
  expect(await textoDe(ui, 'cfg-teto')).toEqual(['🛡️ TETO DO PERFIL', 'respeitado · até merge', '📍 escopo nunca acima do teto'])
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u))
  expect(await textoDe(ui, 'cfg-lib')).toEqual(['🔓 LIBERAÇÃO', 'não liberada', '📍 liberar pelo modo Contínuo'])
  expect(await textoDe(ui, 'cfg-resumo')).toContain('modo manual')
  await ui.unmount()
  // another run's grant is no grant here
  ui = await desenhar($, (k, u) => aba(k, u, { continuo: { ...docCfg(local(13, 1), local(18, 0)), runId: '20261102-0800' } }))
  expect(await textoDe(ui, 'cfg-lib')).toContain('não liberada')
  await ui.unmount()
})

test('A42 VALE ATÉ: today, another day, no grant; the bar and its fallback', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0)) }))
  expect(await textoDe(ui, 'cfg-vale')).toEqual(['⏱️ VALE ATÉ', 'hoje 18:00', '42% da janela já passou', '13:01 → 18:00 · pausar a qualquer momento'])
  const bar = todos(await ui.find({ key: 'cfg-vale' })).find((n: any) => n.type === 'Svg').props
  expect([typeof bar.width, bar.height]).toEqual(['number', 8])
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0)) }), 64, 'terminal')
  expect(await textoDe(ui, 'cfg-vale')).toContain('▮▮▯▯▯')
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), new Date(2026, 10, 4, 18, 0)) }))
  expect((await textoDe(ui, 'cfg-vale'))[1]).toBe('04/11 18:00')
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u))
  expect(await textoDe(ui, 'cfg-vale')).toEqual(['⏱️ VALE ATÉ', '-', 'sem janela aberta'])
  await ui.unmount()
})

test('A43 escopo pills', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  const clique = { ...PERFIL_CFG, merge: { quem: 'cliente' as const, clique: true } }
  let ui: any = await desenhar($, (k, u) => aba(k, u, { perfil: clique, continuo: docCfg(local(13, 1), local(18, 0), 'continuo', { merge: true, deploys: false }) }))
  expect(await textoDe(ui, 'esc-go')).toEqual(['🚦 GO, HOLD e FECHA sem perguntar', 'liberado'])
  expect(await textoDe(ui, 'esc-fecha')).toEqual(['🔧 corrigir pendentes e rodar session-end sozinho', 'liberado'])
  expect(await textoDe(ui, 'esc-merge')).toEqual(['🚀 merge, migrações e deploy na ordem da fila', 'liberado'])
  expect(await textoDe(ui, 'esc-clique')).toEqual(['👆 clique humano no merge (o perfil pede)', 'pedido'])
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0), 'continuo', { merge: false }) }))
  expect(await textoDe(ui, 'esc-merge')).toEqual(['🚀 merge, migrações e deploy na ordem da fila', 'não pedido'])
  expect(await textoDe(ui, 'esc-clique')).toEqual(['👆 clique humano no merge (o perfil não pede)', 'não pedido'])
  expect(todos(await ui.find({ key: 'esc-clique' })).find((n: any) => n.type === 'Text').props.color).toBe('subtle')
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u))
  for (const key of ['esc-go', 'esc-fecha', 'esc-merge']) expect((await textoDe(ui, key))[1]).toBe('não pedido')
  await ui.unmount()
})

test('A44 no merge Button; the merge field per profile', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { perfil: { ...PERFIL_CFG, merge: { quem: 'novarc', clique: true } } }))
  expect((await ui.findAll({ type: 'Button' })).filter((b: any) => /merge/i.test(String(b.text ?? b.props?.label ?? ''))).length).toBe(0)
  const v = todos(await ui.find({ key: 'campo-merge' })).find((n: any) => n.type === 'Text' && textoNo(n) === 'cliente · exige clique humano')
  expect(v?.props.color).toBe('warning')
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { perfil: { ...PERFIL_CFG, merge: { quem: 'novarc', clique: false } } }))
  const n = todos(await ui.find({ key: 'campo-merge' })).find((x: any) => x.type === 'Text' && textoNo(x) === 'NovArc · automático no contínuo')
  expect(n?.props.color).toBe('success')
  await ui.unmount()
  expect(camposPerfil({}).every(c => c.valor === null)).toBe(true)
  expect(camposPerfil({ fontes: { hostGit: 'git remote -v' }, hostGit: 'gitlab' }).find(c => c.chave === 'hostGit')).toMatchObject({ valor: 'GitLab', fonte: 'git remote -v' })
})

test('A45 passagem: the pill outside the orchestrator, no Button; the pacote slot right after', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { orq: false }))
  const p = await ui.find({ key: 'cfg-passagem' })
  expect(partes(p)).toContain('só na orquestradora')
  expect(todos(p).some((n: any) => n.type === 'Button')).toBe(false)
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { pacote: k.titulo('pacote-teste') }))
  const raiz = await ui.find({ key: 'raiz' })
  const filhos = raiz.children ?? []
  const i = filhos.findIndex((c: any) => c.props?.key === 'cfg-passagem')
  expect(textoNo(filhos[i + 1])).toBe('PACOTE-TESTE')
  expect(partes(filhos[i])).not.toContain('só na orquestradora')
  expect(todos(filhos[i]).some((n: any) => n.type === 'Button')).toBe(false)
  await ui.unmount()
})

test('A51 grid rows: 3 per row at 64 columns, 2 at 48, padded, cards grow', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  for (const [cols, n] of [[64, 3], [48, 2]] as const) {
    const ui: any = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0)) }), cols)
    const caixas = (await ui.findAll({ type: 'Box' })) as any[]
    const filas = caixas.filter(b => /^(perfil-\d|lib)-fila-/.test(String(b.key ?? '')))
    for (const f of filas) expect(f.children.length).toBe(n)
    // the last banco e deploy row: 4 fields → 1 + 2 padding at 64, a full row at 48
    expect(caixas.filter(b => /^perfil-2-vz-/.test(String(b.key ?? ''))).length).toBe(cols === 64 ? 2 : 0)
    for (const c of caixas.filter(b => /^campo-/.test(String(b.key ?? '')))) expect([c.props.flexGrow, c.props.width]).toEqual([1, 0])
    await ui.unmount()
  }
})

test('A52 loading and error: one state card with tentar de novo', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  let ui: any = await desenhar($, (k, u) => aba(k, u, { estado: 'carregando' }))
  let raiz = await ui.find({ key: 'raiz' })
  expect(raiz.children.length).toBe(1)
  expect(partes(raiz).slice(0, 3)).toEqual(['⏳', 'Lendo…', 'registro de sessões e banco do planejamento'])
  await ui.unmount()
  ui = await desenhar($, (k, u) => aba(k, u, { estado: 'erro' }))
  raiz = await ui.find({ key: 'raiz' })
  expect(raiz.children.length).toBe(1)
  expect(partes(raiz)).toEqual(['⚠️', 'Não consegui ler o banco do planejamento', 'o painel mostra o último estado salvo; nada foi perdido'])
  expect((await ui.find({ key: 'tentar' }))?.text).toBe('🔄 tentar de novo')
  await ui.unmount()
})

test('A52 the pane picks loading before the first plan read and error when it failed with no plan', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroAba: 'configuracao', maestroLeitura: { at: null, falhou: false, fonte: null, falhas: { planejamento: false, registro: false } } }), ctx: { ...ctxOrq(), plano: null } }
  let ui: any = await painel($, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'registro de sessões e banco do planejamento' })).toBeDefined()
  await ui.unmount()
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroAba: 'configuracao', maestroLeitura: { at: Date.now(), falhou: true, fonte: null, falhas: { planejamento: true, registro: false } } }), ctx: { ...ctxOrq(), plano: null } }
  ui = await painel($, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'Não consegui ler o banco do planejamento' })).toBeDefined()
  // the press reaches the pane's retry (a read of the plan)
  const n = m.lidos.length
  await ui.press({ key: 'tentar' })
  await quieto(m)
  expect(m.eventos.some(x => x.e?.element === 'tentar')).toBe(true)
  expect(m.lidos.length >= n).toBe(true)
  await ui.unmount()
})

// ---- Phase 7 (Task 20): `✍️ intervir` and the recado card in set and spec sessions (R27, R48-R50)

import { ATALHOS, cartaoRecado } from './continuo-ui'

const EX_SPEC6 = { papel: 'spec', conjunto: 'C06', spec: 'C06-S02', codigo: COD, ledgerDir: LDIR, forks: {} }
const EX_CONJ6 = { papel: 'conjunto', conjunto: 'C06', codigo: COD, ledgerDir: LDIR, forks: {} }
const recados = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e.text === 'string' && !('to' in e) && (e.asUser === true || e.origin?.asUser === true))
const PARA_C06 = `Mande este recado por SendMessage para a sessão do conjunto novarc-${COD}-C06: `
const PARA_ORQ = `Mande este recado por SendMessage para a orquestradora novarc-orq-${COD}: `
/** The pane of `ex` with the recado card opened by the `✍️ intervir` press. */
async function abrirRecado($: any, m: Mundo, ex: unknown, surface = 'desktop') {
  m.servirEstado = estado(ex, DOC_I('continuo'))
  const ui = await $.ui.mount({ ...PANE_I, surface })
  await ui.press({ key: 'intervir' })
  return ui
}

test('A26 spec session recado goes to its set session; the set session one to the orchestrator (R27)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  let ui = await abrirRecado($, m, EX_SPEC6)
  expect(escrito(m, 'maestroContinuoUi').recado).toBe(true)
  const card = partes(await ui.find({ key: 'recado' }))
  expect(card).toContain('Recado para a execução')
  expect(card).toContain(`vai para a sessão do conjunto novarc-${COD}-C06 · enviado como mensagem sua nesta sessão`)
  const campo = await ui.find({ type: 'Input' })
  expect([campo?.props.placeholder, campo?.props.submitLabel]).toEqual(['ex.: pausa a C01-S02 antes da migração, quero revisar o schema', 'enviar'])
  const n = m.eventos.length
  await ui.input({ key: 'recado-texto', text: 'pausa a C06-S02 antes da migração' })
  await quieto(m)
  expect(recados(m).map(e => e.text)).toEqual([`${PARA_C06}pausa a C06-S02 antes da migração`])
  expect(m.eventos.slice(n).some(x => x.e && typeof x.e === 'object' && 'to' in x.e && x.e.to !== 'transcript')).toBe(false)
  expect(escrito(m, 'maestroContinuoUi').recado).toBe(false)
  await ui.unmount()
  ui = await abrirRecado($, m, EX_CONJ6)
  expect(partes(await ui.find({ key: 'recado' }))).toContain('vai para a orquestradora · enviado como mensagem sua nesta sessão')
  await ui.input({ key: 'recado-texto', text: 'segura o merge' })
  await quieto(m)
  expect(recados(m).map(e => e.text).slice(1)).toEqual([`${PARA_ORQ}segura o merge`])
  await ui.unmount()
})

test('A46 each shortcut submits its fixed text to the destination and closes (R48)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  const esperados: string[] = []
  for (const [t, [rotulo, texto]] of Object.entries(ATALHOS)) {
    const ui = await abrirRecado($, m, EX_SPEC6)
    expect([(await ui.find({ key: `recado-${t}` }))?.text, await variante(ui, `recado-${t}`)]).toEqual([rotulo, 'secondary'])
    await ui.press({ key: `recado-${t}` })
    await quieto(m)
    esperados.push(`${PARA_C06}${texto}`)
    expect(recados(m).map(e => e.text)).toEqual(esperados)
    expect(escrito(m, 'maestroContinuoUi').recado).toBe(false)
    await ui.unmount()
  }
})

test('A47 a blank recado sends nothing and keeps the card; cancelar closes and sends nothing (R49)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  const ui = await abrirRecado($, m, EX_SPEC6)
  await ui.input({ key: 'recado-texto', text: '   ' })
  await quieto(m)
  expect(recados(m)).toEqual([])
  expect(escrito(m, 'maestroContinuoUi').recado).toBe(true)
  expect(await ui.find({ key: 'recado' })).toBeDefined()
  expect([(await ui.find({ key: 'recado-cancelar' }))?.text, await variante(ui, 'recado-cancelar')]).toEqual(['cancelar', 'secondary'])
  await ui.press({ key: 'recado-cancelar' })
  await quieto(m)
  expect(recados(m)).toEqual([])
  expect(escrito(m, 'maestroContinuoUi').recado).toBe(false)
  expect(await ui.find({ key: 'recado' })).toBeUndefined()
  await ui.unmount()
})

test('A48 no Input: digite o recado na conversa, the three shortcuts stay (R50)', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  const nada = () => {}
  const ui = await desenhar($, (k, u) => cartaoRecado(u, k, { destino: 'orquestradora', temInput: false, acoes: { enviar: nada, atalho: () => nada, cancelar: nada } }))
  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(partes(await ui.drawn())).toContain('digite o recado na conversa')
  for (const t of Object.keys(ATALHOS)) expect(await ui.find({ key: `recado-${t}` })).toBeDefined()
  await ui.unmount()
})

test('A48 the real pane on the mobile surface, which has no Input (R50)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  const p = await abrirRecado($, m, EX_SPEC6, 'mobile')
  expect(await p.find({ type: 'Input' })).toBeUndefined()
  expect(partes(await p.drawn())).toContain('digite o recado na conversa')
  for (const t of Object.keys(ATALHOS)) expect(await p.find({ key: `recado-${t}` })).toBeDefined()
  await p.unmount()
})

test('A49 intervir is secondary closed and primary open; the card sits under the strip (R51)', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  m.servirEstado = estado(EX_SPEC6, DOC_I('continuo'))
  const ui = await $.ui.mount({ ...PANE_I, surface: 'desktop' })
  expect(await variante(ui, 'intervir')).toBe('secondary')
  expect(await ui.find({ key: 'recado' })).toBeUndefined()
  await ui.press({ key: 'intervir' })
  expect(await variante(ui, 'intervir')).toBe('primary')
  const seq = partes(await ui.drawn())
  expect(emOrdem(seq, ['MODO', 'Recado para a execução', '🧭 seções'])).toBe(true)
  await ui.unmount()
  // the orchestrator never draws it
  m.servirEstado = estado(EX_ORQ, DOC_I('continuo'), { maestroContinuoUi: { cartao: false, erro: null, recado: true, pedidoEm: null } })
  const o = await $.ui.mount({ ...PANE_I, surface: 'desktop' })
  expect(await o.find({ key: 'recado' })).toBeUndefined()
  await o.unmount()
})
