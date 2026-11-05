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

test('validarConcessao: the whole document of this run passes, normalized', () => {
  expect(validarConcessao(docV(), iV)).toEqual({ ok: true, doc: docV() })
  // extra fields of the agent never reach the stored document
  expect(validarConcessao({ ...docV(), lixo: 1, autorizacao: { ...docV().autorizacao, lixo: 2 } }, iV)).toEqual({ ok: true, doc: docV() })
})

test('validarConcessao: each refusal has its motivo', () => {
  for (const d of [null, 'x', {}, { ...docV(), autorizacao: null }]) expect(motivo(d)).toBe('pedido sem liberação')
  expect(motivo({ ...docV(), runId: '20261104-1000' })).toBe('liberação de outra execução')
  expect(motivo(docV(), { ...iV, runId: null })).toBe('liberação de outra execução')
  expect(motivo({ ...docV(), modo: 'manual' })).toBe('a liberação grava o modo contínuo')
  expect(motivo(comA({ continuoHabilitado: false }))).toBe('liberação sem @NOVARC-CONTINUO.md de quem liberou')
  for (const by of ['', 'a@b.com', 'local_abc']) expect(motivo(comA({ by }))).toBe('quem liberou vai pelo nome, nunca id ou e-mail')
  expect(motivo(comA({ at: '2026-11-03T14:49:00Z' }))).toBe('hora da liberação fora do turno')
  expect(motivo(comA({ at: '2026-11-03T15:11:00Z' }))).toBe('hora da liberação fora do turno')
  expect(motivo(comA({ at: '2026-11-03T15:09:00Z' }))).toBe('ok')
  expect(motivo(comE({ conjuntos: [] }))).toBe('escopo sem conjunto')
  expect(motivo(comE({ conjuntos: ['C06', 'C42'] }))).toBe('C42 fora do planejamento')
  expect(motivo(comE({ fases: ['f9'] }))).toBe('fase f9 fora do planejamento')
  expect(motivo(comE({ ate: null }))).toBe('liberação sem hora para acabar')
  expect(motivo(comE({ ate: 'amanhã' }))).toBe('liberação sem hora para acabar')
  expect(motivo(comE({ ate: '2026-11-03T14:59:00Z' }))).toBe('liberação já vencida')
  expect(motivo(comE({ ate: '2026-11-04T21:00:00Z' }))).toBe('liberação acima de 24 h')
  expect(motivo(comE({ deploys: true }))).toBe('deploy acima do teto do perfil')
  expect(motivo(comA({ teto: { ...PERFIL.teto, deploy: true } }))).toBe('teto copiado diferente do perfil')
  expect(motivo(docV(), { ...iV, perfil: { ...PERFIL, teto: undefined } })).toBe('o perfil não descreve o teto do contínuo: o orquestrador pergunta')
})

test('A8 card content: alt, the scope line in the Svg, three items, cancelar and liberar', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  const escopo: EscopoContinuo = { conjuntos: ['C06', 'C07', 'C08', 'C09'], fases: [], merge: true, migracoes: false, deploys: true, ate: hojeAs(18, 0).toISOString() }
  expect(linhaEscopoCartao(escopo, 'novarc-maestro')).toBe(LINHA_A)
  const nada = () => {}
  const ui = await desenhar($, (k, u) => cartaoLiberacao(u, k, { escopo, linhaEscopo: LINHA_A, podeLiberar: true, erro: null, aguardando: false, acoes: { cancelar: nada, liberar: nada } }))
  const svg = (await ui.find({ type: 'Svg' }))?.props
  expect(svg.alt).toBe('Ligar o modo contínuo')
  expect([typeof svg.width, typeof svg.height]).toEqual(['number', 'number'])
  for (const t of [LINHA_A, 'GO, HOLD e FECHA sem perguntar', 'merge e deploy na ordem da fila', 'vale até 18:00 de hoje; pausar a qualquer momento']) expect(String(svg.source)).toContain(t)
  expect(String(svg.source)).toContain('prefers-color-scheme: dark')
  expect([(await ui.find({ key: 'continuo-cancelar' }))?.text, await variante(ui, 'continuo-cancelar')]).toEqual(['cancelar', 'secondary'])
  expect([(await ui.find({ key: 'continuo-liberar' }))?.text, await variante(ui, 'continuo-liberar')]).toEqual(['🔁 liberar o contínuo', 'primary'])
  await ui.unmount()
})

test('A8 the pane draws the card under the strip, above the section band', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  comImport(m)
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroContinuoUi: { cartao: true } }), ctx: ctxA() }
  await iniciar($)
  const ui = await painel($, 'desktop')
  const raiz = await ui.drawn()
  const ordem = (raiz.children ?? []).map((c: any) => c.props?.key)
  expect(ordem.indexOf('modo') + 1).toBe(ordem.indexOf('cartao-continuo'))
  // above the section band and the tabs: the next element is the 🧭 seções band
  expect(ordem.indexOf('cartao-continuo') < ordem.indexOf('linha-abas')).toBe(true)
  expect(raiz.children[ordem.indexOf('cartao-continuo') + 1]?.props?.alt).toBe('🧭 seções')
  const svg = todos(await ui.find({ key: 'cartao-continuo' })).find((n: any) => n.type === 'Svg')!.props
  expect(svg.alt).toBe('Ligar o modo contínuo')
  expect(String(svg.source)).toContain(LINHA_A)
  expect(String(svg.source)).toContain(itensCartao(escopoSugerido(PERFIL_ALTO, PLANO_A, Date.now()))[2]!.split(';')[0]!)
  expect(await ui.find({ key: 'continuo-liberar' })).toBeDefined()
  await ui.unmount()
  // a set session never draws it
  m.servirEstado = { ...estado(EX_CONJ, null, { maestroContinuoUi: { cartao: true } }), ctx: ctxA() }
  const u2 = await painel($, 'desktop')
  expect(await u2.find({ key: 'cartao-continuo' })).toBeUndefined()
  await u2.unmount()
})

test('A10 no @NOVARC-CONTINUO.md: no liberar Button, the footnote', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  gravar(m, CLAUDE_MD, '@NOVARC.md\n')
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroContinuoUi: { cartao: true } }), ctx: ctxA() }
  await iniciar($)
  const ui = await painel($, 'desktop')
  expect(await ui.find({ type: 'Button', text: '🔁 liberar o contínuo' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'sem @NOVARC-CONTINUO.md no seu CLAUDE.md · quem pode liberar roda /maestro continuo habilitar' })).toBeDefined()
  expect(await ui.find({ key: 'continuo-cancelar' })).toBeDefined()
  await ui.unmount()
})

test("liberar submits the person's words; $.ui.ask 0 calls (A53)", LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  comImport(m)
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroContinuoUi: { cartao: true } }), ctx: ctxA() }
  await iniciar($)
  const ui = await painel($, 'desktop')
  await ui.press({ key: 'continuo-liberar' })
  await quieto(m)
  const subs = m.eventos.map(x => x.e).filter(e => (e?.asUser === true || e?.origin?.asUser === true) && typeof e.text === 'string')
  expect(subs.length).toBe(1)
  expect(subs[0].text.startsWith('Libero o modo contínuo com o escopo: GO, HOLD, FECHA, merge e deploy no Maestro · até ')).toBe(true)
  expect(m.tools.filter((t: any) => 'questions' in t || /AskUserQuestion/.test(String(t.tool))).length).toBe(0)
  expect(typeof escrito(m, 'maestroContinuoUi').pedidoEm).toBe('number')
  await ui.unmount()
})

test('A15 failed grant keeps Manual and shows the error in the card', LENTO, async ($: any, on: any) => {
  const m = montar(on, {})
  comImport(m)
  m.servirEstado = { ...estado(EX_ORQ, null, { maestroContinuoUi: { cartao: true, erro: 'boom' } }), ctx: ctxA() }
  await iniciar($)
  const ui = await painel($, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'liberação não gravada no planejamento: boom' })).toBeDefined()
  expect(await variante(ui, 'modo-manual')).toBe('primary')
  await ui.unmount()
})

test('R10 the card closes once the grant of this run is recorded; Contínuo is primary', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  let ui: any = await painel($, 'desktop')
  await ui.press({ key: 'modo-continuo' })
  await quieto(m)
  expect(escrito(m, 'maestroContinuoUi').cartao).toBe(true)
  await ui.unmount()
  m.db!['config/continuo'] = { data: docGrant(), version: 1 }
  await poll(m)
  expect(escrito(m, 'maestroContinuoUi').cartao).toBe(false)
  ui = await painel($, 'desktop')
  expect(await variante(ui, 'modo-continuo')).toBe('primary')
  expect(await ui.find({ key: 'cartao-continuo' })).toBeUndefined()
  await ui.unmount()
})

// ---- Task 16: the grant guard

test('A9 a peer line then the agent grant write is refused', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await peer($, 'orquestra contínuo')
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
  expect(modoDe(escrito(m, 'maestroContinuo')?.doc ?? null, RUN_I)).toBe('manual')
})

test('A9 a token is cleared by a received line after it', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  await peer($, 'C02 implementacao x')
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('A9 a Maestro (automático) prompt is not the person turn', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await digitar($, 'Maestro (automático): orquestra contínuo')
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  // the card's token dies on the mod's own automático turn (origin plugin) before the write
  await armar($, m)
  await $.prompt.submit?.({ text: 'Maestro (automático): pedido de slot C02', origin: { kind: 'plugin', name: 'novarc' } })
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  // and on any turn of the person
  await armar($, m)
  await digitar($, 'sim')
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  // a plugin submit is not the person either
  await $.prompt.submit?.({ text: 'orquestra contínuo', origin: { kind: 'plugin', name: 'x' } })
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('A10 import missing: refused', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  gravar(m, CLAUDE_MD, '@NOVARC.md\n') // removed between the press and the write: the guard reads it fresh
  expect(negado(await gravarGrant($, docGrant()))).toBe(NAO('sem @NOVARC-CONTINUO.md no seu CLAUDE.md; quem pode liberar roda /maestro continuo habilitar'))
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('the card press with the import passes: set with no doc; the cache holds it and the card closes', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  expect(escrito(m, 'maestroContinuoUi').cartao).toBe(true)
  const doc = docGrant()
  const r = await gravarGrant($, doc)
  expect(negado(r)).toBeUndefined()
  await quieto(m)
  expect(m.db!['config/continuo']!.data).toEqual(doc)
  expect(escrito(m, 'maestroContinuo').doc).toEqual(doc)
  expect(escrito(m, 'maestroContinuoUi').cartao).toBe(false)
})

test('the card press passes: update + if_version over a manual doc is stored whole as a set', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: camposReinicio(RUN_I, 'Maestro', Date.now()), version: 2 } } })
  comImport(m)
  await armar($, m)
  const doc = docGrant()
  expect(negado(await gravarGrant($, doc, { action: 'update', if_version: 2 }))).toBeUndefined()
  await quieto(m)
  expect(m.db!['config/continuo']).toEqual({ data: doc, version: 3 })
  expect(escrito(m, 'maestroContinuo')).toMatchObject({ doc, versao: 3 })
  const w = m.tools.filter((t: any) => t.doc_id === 'continuo' && t.data?.autorizacao).pop() as any
  expect([w.action, w.if_version]).toEqual(['set', 2])
})

test('a validated update over an older grant leaves no stale key (forwarded as set)', LENTO, async ($: any, on: any) => {
  const velho = docGrant()
  const sujo = { ...velho, autorizacao: { ...velho.autorizacao!, teto: { ...PERFIL.teto!, velho: true }, escopo: { ...velho.autorizacao!.escopo, lixo: 1 } } }
  const m = await orq($, on, { db: { 'config/continuo': { data: sujo, version: 5 } } })
  comImport(m)
  await armar($, m)
  const doc = docGrant()
  expect(negado(await gravarGrant($, doc, { action: 'update', if_version: 5 }))).toBeUndefined()
  expect(m.db!['config/continuo']!.data).toEqual(doc)
})

test('the card liberar press is a grant turn', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  const ui = await painel($, 'desktop')
  await ui.press({ key: 'modo-continuo' })
  await quieto(m)
  await ui.press({ key: 'continuo-liberar' })
  await quieto(m)
  await ui.unmount()
  expect(negado(await gravarGrant($, docGrant()))).toBeUndefined()
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
})

test('A15 a failed grant write shows the error; the cached mode stays manual', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  m.falharTool = (e: any) => e.collection === 'config' && e.doc_id === 'continuo'
  await armar($, m)
  await gravarGrant($, docGrant())
  await quieto(m)
  expect(escrito(m, 'maestroContinuoUi')).toMatchObject({ erro: 'boom', cartao: true })
  expect(modoDe(escrito(m, 'maestroContinuo')?.doc ?? null, RUN_I)).toBe('manual')
})

test('only the orchestrator: a set session refuses the grant write', LENTO, async ($: any, on: any) => {
  const m = await conjunto($, on)
  comImport(m)
  await digitar($, 'orquestra contínuo')
  expect(negado(await gravarGrant($, docGrant()))).toBe(NAO('só na sessão orquestradora'))
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('only the orchestrator: a spec session refuses the grant write', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  comImport(m)
  m.db = {}
  m.servirEstado = { exec: EX_SPEC, ctx: { ...ctxOrq(), papel: 'spec' } }
  await iniciar($)
  await digitar($, 'orquestra contínuo')
  expect(negado(await gravarGrant($, docGrant()))).toBe(NAO('só na sessão orquestradora'))
  expect(m.db['config/continuo']).toBeUndefined()
})

test("the mod's own writes pass untouched", LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  expect((await maestro($, 'pausar'))?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  // the R14 reset (autorizacao null) passes too: A13 above
})

test('one token, one write; another turn clears it; it expires after 10 min', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  expect(negado(await gravarGrant($, docGrant()))).toBeUndefined()
  const v = m.db!['config/continuo']!.version
  expect(negado(await gravarGrant($, docGrant(), { action: 'update', if_version: v }))).toBe(TURNO)
  expect(m.db!['config/continuo']!.version).toBe(v)
  await armar($, m)
  await digitar($, 'oi')
  expect(negado(await gravarGrant($, docGrant(), { action: 'update', if_version: v }))).toBe(TURNO)
  await armar($, m)
  m.avanco = 11 * 60_000
  expect(negado(await gravarGrant($, docGrant(), { action: 'update', if_version: v }))).toBe(TURNO)
  expect(m.db!['config/continuo']!.version).toBe(v)
})

test('R11 the guard refuses a scope above the ceiling and every bad document', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  const casos: [unknown, string, Record<string, unknown>?][] = [
    [docGrant({ escopo: { deploys: true } }), 'deploy acima do teto do perfil'],
    [docGrant({ runId: '20261104-1000' }), 'liberação de outra execução'],
    [docGrant({ escopo: { conjuntos: ['C42'] } }), 'C42 fora do planejamento'],
    [docGrant({ escopo: { ate: new Date(Date.now() + 30 * 3600_000).toISOString() } }), 'liberação acima de 24 h'],
    [{ ...docGrant(), autorizacao: { ...docGrant().autorizacao, teto: { ...PERFIL.teto, ate: 'deploy' } } }, 'teto copiado diferente do perfil'],
    [docGrant({ by: 'a@b.com' }), 'quem liberou vai pelo nome, nunca id ou e-mail'],
    [{ autorizacao: { escopo: docGrant().autorizacao!.escopo } }, 'grave a liberação inteira', { action: 'update', if_version: 1 }],
  ]
  for (const [data, mot, o] of casos) {
    await armar($, m)
    expect(negado(await gravarGrant($, data, o))).toBe(NAO(mot))
  }
  expect(m.db!['config/continuo']).toBeUndefined()
})

test("a subagent's grant write is refused", LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  expect(negado(await gravarGrant($, docGrant(), { agentId: 'ag-1' }))).toBe(NAO('só no turno principal de quem conduz'))
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('a grant through a file or a batch entry is refused; other batches pass', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  const inteira = NAO('grave a liberação inteira')
  await armar($, m)
  expect(negado(await gravarGrant($, undefined, { file_path: 'C:/tmp/grant.json' }))).toBe(inteira)
  await armar($, m)
  const lote = (writes: unknown[]) => $.tool.call({ tool: 'ArtifactData', action: 'batch', url: URL_I, writes })
  expect(negado(await lote([{ op: 'set', collection: 'config', doc_id: 'continuo', data: docGrant() }]))).toBe(inteira)
  expect(m.db!['config/continuo']).toBeUndefined()
  // the token went with the refused attempt
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(negado(await lote([{ op: 'set', collection: 'auditoria', doc_id: 'x1', data: { acao: 'MODO' } }]))).toBeUndefined()
  expect(m.db!['auditoria/x1']).toBeDefined()
})

// ---- final review C1: the call under `input` is the same call

const aninhado = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'ArtifactData', input: { url: URL_I, collection: 'config', doc_id: 'continuo', ...input } })

test('C1 a nested-shape grant write with no token, a str_replace or a file is refused', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  expect(negado(await aninhado($, { action: 'set', data: docGrant() }))).toBe(TURNO)
  expect(negado(await aninhado($, { action: 'str_replace', field: 'modo', old_str: 'manual', new_str: 'continuo' }))).toBe(MODO_MAESTRO)
  await armar($, m)
  expect(negado(await aninhado($, { action: 'set', file_path: 'C:/tmp/grant.json' }))).toBe(NAO('grave a liberação inteira'))
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('C1 a nested-shape grant after the card press is validated and forwarded whole as a set, under input', LENTO, async ($: any, on: any) => {
  const velho = docGrant()
  const sujo = { ...velho, autorizacao: { ...velho.autorizacao!, escopo: { ...velho.autorizacao!.escopo, lixo: 1 } } }
  const m = await orq($, on, { db: { 'config/continuo': { data: sujo, version: 5 } } })
  comImport(m)
  await armar($, m)
  const doc = docGrant()
  expect(negado(await aninhado($, { action: 'update', if_version: 5, data: doc }))).toBeUndefined()
  expect(m.db!['config/continuo']).toEqual({ data: doc, version: 6 })
  const w = m.tools.filter((t: any) => t.input?.doc_id === 'continuo').pop() as any
  expect([w.input.action, w.input.if_version, w.action]).toEqual(['set', 5, undefined])
})

test('a guard refusal after the card press shows the motivo in the card and gives liberar back', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  let ui: any = await painel($, 'desktop')
  await ui.press({ key: 'modo-continuo' })
  await quieto(m)
  await ui.press({ key: 'continuo-liberar' })
  await quieto(m)
  await ui.unmount()
  expect(negado(await gravarGrant($, docGrant({ escopo: { deploys: true } })))).toBe(NAO('deploy acima do teto do perfil'))
  expect(escrito(m, 'maestroContinuoUi')).toMatchObject({ cartao: true, erro: 'deploy acima do teto do perfil', pedidoEm: null })
  ui = await painel($, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'liberação não gravada no planejamento: deploy acima do teto do perfil' })).toBeDefined()
  expect(await ui.find({ key: 'continuo-liberar' })).toBeDefined()
  await ui.unmount()
})

test('the guard fails closed: a check that throws refuses the grant', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  // a broken plan in state makes the check throw (a throwing test hook is skipped by the engine, so state cannot fail here)
  m.servirEstado = { ...m.servirEstado, ctx: { ...ctxOrq(), plano: { ...PLANO_I, conjuntos: 7 } } }
  const r = negado(await gravarGrant($, docGrant()))
  expect(String(r).startsWith('Modo contínuo não liberado: ')).toBe(true)
  expect(r).not.toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('R-a typed orquestra contínuo opens the card and arms no token', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await digitar($, 'orquestra contínuo')
  expect(escrito(m, 'maestroContinuoUi')).toMatchObject({ cartao: true, erro: null })
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
  const ui = await painel($, 'desktop')
  expect(await ui.find({ key: 'continuo-liberar' })).toBeDefined()
  await ui.unmount()
})

test('the mode is the Maestro: an agent write of modo, runId or a str_replace is refused', LENTO, async ($: any, on: any) => {
  const guardado = { ...docGrant(), modo: 'manual' as const }
  const m = await orq($, on, { db: { 'config/continuo': { data: guardado, version: 1 } } })
  for (const o of [
    { action: 'update', if_version: 1, data: { modo: 'continuo' } },
    { action: 'update', if_version: 1, data: { runId: RUN_I } },
    { action: 'set', if_version: 1, data: { ...guardado, autorizacao: null } },
    { action: 'str_replace', field: 'modo', old_str: 'manual', new_str: 'continuo', data: undefined },
  ]) expect(negado(await gravarGrant($, o.data, o))).toBe(MODO_MAESTRO)
  const lote = await $.tool.call({ tool: 'ArtifactData', action: 'batch', url: URL_I, writes: [{ op: 'update', collection: 'config', doc_id: 'continuo', if_version: 1, data: { modo: 'continuo' } }] })
  expect(negado(lote)).toBe(MODO_MAESTRO)
  expect(m.db!['config/continuo']).toEqual({ data: guardado, version: 1 })
  // the mod's own pausar and retomar pass
  expect((await maestro($, 'pausar'))?.text).toBe('Modo contínuo pausado. Nada sai sozinho até retomar.')
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  expect((await maestro($, 'retomar'))?.text).toBe('Modo contínuo retomado com o escopo de antes.')
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
})

test('the tab shows a stored grant only in Contínuo: Manual and Pausado read as without one', LENTO, async ($: any, on: any) => {
  montarPeca(on)
  for (const modo of ['manual', 'pausado'] as const) {
    const ui: any = await desenhar($, (k, u) => aba(k, u, { continuo: docCfg(local(13, 1), local(18, 0), modo) }))
    expect(await textoDe(ui, 'cfg-lib')).toEqual(['🔓 LIBERAÇÃO', 'não liberada', '📍 liberar pelo modo Contínuo'])
    expect(await textoDe(ui, 'cfg-vale')).toEqual(['⏱️ VALE ATÉ', '-', 'sem janela aberta'])
    for (const key of ['esc-go', 'esc-fecha', 'esc-merge']) expect((await textoDe(ui, key))[1]).toBe('não pedido')
    expect(await textoDe(ui, 'cfg-resumo')).toContain('modo manual')
    await ui.unmount()
  }
})

// ---- Phase 5 fix round 2

test('N1 the card token holds when the host dispatches its submit after the press resolved', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  const texto = m.eventos.map(x => x.e).filter(e => e?.origin?.asUser === true && typeof e.text === 'string').pop()!.text
  // the queued turn reaches prompt.submit later, as the host dispatches it
  await $.prompt.submit?.({ text: texto, origin: { kind: 'plugin', name: 'novarc' } })
  expect(negado(await gravarGrant($, docGrant()))).toBeUndefined()
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
})

test('N1 a different submit between the press and the write clears the card token', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await armar($, m)
  await $.prompt.submit?.({ text: 'Libero o modo contínuo com o escopo: outra coisa', origin: { kind: 'plugin', name: 'novarc' } })
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(m.db!['config/continuo']).toBeUndefined()
})

test('M1 an agent delete of config/continuo is refused', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  const r = await $.tool.call({ tool: 'ArtifactData', action: 'delete', url: URL_I, collection: 'config', doc_id: 'continuo' })
  expect(negado(r)).toBe(NAO('o modo é do Maestro; use os botões ou /maestro pausar|retomar'))
  expect(m.tools.filter((t: any) => t.action === 'delete').length).toBe(0)
  expect(m.db!['config/continuo']).toEqual({ data: DOC_I('continuo'), version: 1 })
})

test('M2 a token-missing refusal leaves a card opened by the typed turn without an error', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  comImport(m)
  await digitar($, 'orquestra contínuo')
  expect(negado(await gravarGrant($, docGrant()))).toBe(TURNO)
  expect(escrito(m, 'maestroContinuoUi')).toMatchObject({ cartao: true, erro: null, pedidoEm: null })
})
