// C06-S01 final review fixes: I1, I2, I4, I5 and the minors (a)-(d)
import { expect, test } from 'claude-code/testing'
import { camposReinicio, escopoSugerido, validarConcessao } from './logic'
import { URL as URL_I, escrito, quieto } from './mundo-teste'
import { PERFIL, RUN_I, PLANO_I, DOC_I, LENTO, orq, comImport, armar, docGrant, gravarGrant, digitar, negado, NAO, MODO_MAESTRO, maestro, painel } from './continuo-teste'

const DIA_ATE = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3600_000).toISOString()

test('I4 escopoSugerido takes agora as optional: the card scope by contract', () => {
  const e = escopoSugerido(PERFIL, PLANO_I as any)
  expect(e.conjuntos).toEqual(['C02'])
  expect(Number.isNaN(Date.parse(e.ate!))).toBe(false)
})

test('I2 validarConcessao binds the write to the confirmed scope', () => {
  const agora = Date.now()
  const card = escopoSugerido(PERFIL, PLANO_I as any, agora)
  const i = { runId: RUN_I, perfil: PERFIL, plano: PLANO_I as any, agora, confirmado: card }
  const com = (e: Record<string, unknown>) => { const d = docGrant(); return { ...d, autorizacao: { ...d.autorizacao!, escopo: { ...card, ...e } } } }
  expect(validarConcessao(com({}), i).ok).toBe(true)
  // inside the ±10 min window
  expect(validarConcessao(com({ ate: DIA_ATE(card.ate!, 0.1) }), i).ok).toBe(true)
  for (const e of [{ ate: DIA_ATE(card.ate!, 3) }, { merge: false }, { fases: ['f1'] }]) {
    const r = validarConcessao(com(e), { ...i, plano: { ...PLANO_I, conjuntos: [{ ...PLANO_I.conjuntos[0], fase: 'f1' }] } as any })
    expect(r).toEqual({ ok: false, motivo: 'escopo diferente do confirmado no cartão' })
  }
})

test('I2 a grant wider than the card confirmed is refused by the guard', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  const card = escopoSugerido(PERFIL, PLANO_I as any, Date.now())
  expect(negado(await gravarGrant($, docGrant({ escopo: { ate: DIA_ATE(card.ate!, 3) } })))).toBe(NAO('escopo diferente do confirmado no cartão'))
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('I1 the race: a pause lands, then an unpinned grant set is refused and the pause stays', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: camposReinicio(RUN_I, 'Maestro', Date.now()), version: 2 } } })
  comImport(m)
  await armar($, m)
  expect((await maestro($, 'pausar'))?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
  expect(negado(await gravarGrant($, docGrant()))).toBe(NAO('grave com if_version da versão lida'))
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  expect(m.tools.filter((t: any) => t.doc_id === 'continuo' && t.data?.autorizacao && t.action === 'set' && t.if_version === undefined).length).toBe(0)
})

test('I5 the claude-artifacts connector never writes config/continuo, in either shape', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  const W = 'mcp__claude-artifacts__db_write'
  const S = 'mcp__claude-artifacts__db_str_replace'
  const op = (path: string) => ({ slug: 'x', ops: [{ op: 'set', path, data: docGrant() }] })
  expect(negado(await $.tool.call({ tool: W, ...op('config/continuo') }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: W, input: op('/config/continuo') }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: W, slug: 'x', ops: [{ op: 'set', path: 'auditoria/x1', data: {} }, { op: 'delete', path: 'config/continuo', ifVersion: 1 }] }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: W, slug: 'x', ops: [{ op: 'merge', collection: 'config', doc_id: 'continuo', data: { modo: 'continuo' } }] }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: S, slug: 'x', path: 'config/continuo', field: 'modo', old_str: 'manual', new_str: 'continuo' }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: S, input: { slug: 'x', path: 'config/continuo', field: 'modo', old_str: 'manual', new_str: 'continuo' } }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: W, slug: 'x', ops: [{ op: 'set', path: 'auditoria/x1', data: {} }] }))).toBeUndefined()
  expect(negado(await $.tool.call({ tool: S, slug: 'x', path: 'config/orquestracao', field: 'a', old_str: 'b', new_str: 'c' }))).toBeUndefined()
  expect(m.tools.filter((t: any) => t.tool === W || t.tool === S).length).toBe(2)
})

test('minor a: on config/continuo every action but get|list|query is refused, a grant included', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('manual'), version: 1 } } })
  comImport(m)
  const chamar = (o: Record<string, unknown>) => $.tool.call({ tool: 'ArtifactData', url: URL_I, collection: 'config', doc_id: 'continuo', ...o })
  expect(negado(await chamar({ action: 'merge', if_version: 1, data: { modo: 'continuo' } }))).toBe(MODO_MAESTRO)
  await armar($, m)
  expect(negado(await chamar({ action: 'merge', if_version: 1, data: docGrant() }))).toBe(MODO_MAESTRO)
  expect(negado(await chamar({ action: 'get' }))).toBeUndefined()
  expect(m.db!['config/continuo']).toEqual({ data: DOC_I('manual'), version: 1 })
})

test('minor b: orquestra contínuo from an sdk program opens no card', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await $.prompt.submit?.({ text: 'orquestra contínuo', origin: { kind: 'sdk' } })
  await quieto(m)
  expect(escrito(m, 'maestroContinuoUi')?.cartao ?? false).toBe(false)
  await digitar($, 'orquestra contínuo')
  expect(escrito(m, 'maestroContinuoUi')?.cartao).toBe(true)
})

test('minor c: /maestro retomar only typed by the person; pausar stays open', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('pausado'), version: 1 } } })
  for (const kind of ['plugin', 'sdk']) expect((await maestro($, 'retomar', kind))?.text).toBe('Retomar só por /maestro retomar digitado por você.')
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  expect((await maestro($, 'retomar'))?.text).toBe('Modo contínuo retomado com o escopo de antes.')
  expect((await maestro($, 'pausar', 'plugin'))?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
})

const SEM_LIBERAR: [string, Record<string, unknown> | undefined, string][] = [
  ['no teto', undefined, 'o perfil não descreve o teto do contínuo: o orquestrador pergunta'],
  ['porAcao', { ...PERFIL.teto, porAcao: true }, 'o CLAUDE.md do cliente exige autorização por ação'],
]
for (const [nome, teto, motivo] of SEM_LIBERAR) {
  test(`minor d: with ${nome} the card shows the reason in place of liberar`, LENTO, async ($: any, on: any) => {
    const plano = { ...PLANO_I, execucao: { ...PLANO_I.execucao, perfil: { ...PERFIL, teto } } }
    const m = await orq($, on, { plano })
    comImport(m)
    await digitar($, 'orquestra contínuo')
    const ui = await painel($, 'desktop')
    expect(await ui.find({ key: 'continuo-liberar' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: motivo })).toBeDefined()
    expect(await ui.find({ key: 'continuo-cancelar' })).toBeDefined()
    await ui.unmount()
  })
}

// ---- Residual round (final-fix-rereview N1, the card scope JSON, if_version null)

test('N1 a call that names config/continuo at the top level with a stray input is still guarded', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  const plano = { tool: 'ArtifactData', action: 'set', url: URL_I, collection: 'config', doc_id: 'continuo', data: docGrant() }
  expect(negado(await $.tool.call({ ...plano, input: {} }))).toBe(NAO('a liberação só vale no turno de quem conduz'))
  expect(negado(await $.tool.call({ tool: 'ArtifactData', action: 'batch', url: URL_I, writes: [{ op: 'set', collection: 'config', doc_id: 'continuo', data: docGrant() }], input: {} }))).toBe(NAO('grave a liberação inteira'))
  expect(negado(await $.tool.call({ tool: 'mcp__claude-artifacts__db_write', slug: 'x', ops: [{ op: 'set', path: 'config/continuo', data: docGrant() }], input: {} }))).toBe(MODO_MAESTRO)
  expect(negado(await $.tool.call({ tool: 'mcp__claude-artifacts__db_str_replace', slug: 'x', path: 'config/continuo', field: 'modo', old_str: 'manual', new_str: 'continuo', input: {} }))).toBe(MODO_MAESTRO)
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('the card prompt carries the exact scope as JSON; a grant copied from it passes', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  const texto: string = m.eventos.map(x => x.e).filter(e => e?.origin?.asUser === true || e?.asUser === true).filter(e => typeof e.text === 'string').pop()!.text
  const linha = texto.split('\n').find(l => l.startsWith('escopo: '))!
  const escopo = JSON.parse(linha.slice('escopo: '.length))
  expect(Object.keys(escopo)).toEqual(['conjuntos', 'fases', 'merge', 'migracoes', 'deploys', 'ate'])
  const d = docGrant()
  expect(negado(await gravarGrant($, { ...d, autorizacao: { ...d.autorizacao!, escopo } }))).toBeUndefined()
  expect(m.db!['config/continuo']!.data.autorizacao.escopo).toEqual(escopo)
})

test('I1 an if_version null counts as no pin', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: camposReinicio(RUN_I, 'Maestro', Date.now()), version: 2 } } })
  comImport(m)
  await armar($, m)
  await maestro($, 'pausar')
  expect(negado(await gravarGrant($, docGrant(), { if_version: null }))).toBe(NAO('grave com if_version da versão lida'))
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
})
