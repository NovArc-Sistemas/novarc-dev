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

test('T17 a parada line from a set of another plan is ignored', LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo')
  await peer($, 'CONJUNTO C09 bloqueado parada:gate-vermelho gate vermelho')
  await peer($, 'CONJUNTO C06 bloqueado parada:nao-existe x')
  await quieto(m)
  await tick(m)
  expect(linhasParada(m)).toEqual([])
  expect(m.toasts.filter(t => t.includes('gate vermelho'))).toEqual([])
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
})

test('A30 Contínuo: pause, band, toast, card, rows (no agent turn)', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo')
  const subs = submetidos(m)
  await peer($, LINHA_P)
  await quieto(m)
  const d = m.db!['config/continuo']!.data
  expect([d.modo, d.modoBy]).toEqual(['pausado', 'Maestro'])
  const rows = linhasParada(m)
  expect(rows.length).toBe(1)
  expect(rows[0]![0]).toMatch(/^auditoria\/parada-conflito-merge-C06-\d{4}-\d\d-\d\dT/)
  expect(rows[0]![1].data).toMatchObject({ acao: 'PARADA', alvo: 'C06', origem: 'maestro', motivo: `parada:conflito-merge ${MOTIVO_P}` })
  expect((m.tools.find((t: any) => t.collection === 'auditoria' && t.action === 'set' && String(t.doc_id).startsWith('parada-')) as any).if_version).toBeUndefined()
  await tick(m) // the audit flush
  expect(linhasModo(m).map(x => [x.antes, x.depois, x.motivo])).toEqual([['continuo', 'pausado', `parada:conflito-merge ${MOTIVO_P}`]])
  expect(m.toasts.filter(t => t === `Maestro pausou o Maestro: ${MOTIVO_P}`).length).toBe(1)
  const raiz = await banda($)
  const p = partesDaFaixa(raiz)
  expect([p.titulo, p.status, p.segunda[0]]).toEqual(['pausado', MOTIVO_P, `🔴 ${MOTIVO_P}`])
  expect(todos(raiz).find((n: any) => n.type === 'Text' && textoNo(n) === `🔴 ${MOTIVO_P}`)?.props.color).toBe('error')
  const c = await corpoDoPainel($)
  expect(String(c.primeiro?.key)).toMatch(/^parada-/)
  expect(c.primeiro?.props.borderColor).toBe('error')
  expect(textoNo(c.primeiro)).toContain('🚨 Maestro pausou o Maestro')
  expect(textoNo(c.primeiro)).toContain(MOTIVO_P)
  expect(textoNo(c.primeiro)).toContain('intervenha nesta sessão')
  await c.ui.unmount()
  expect(submetidos(m)).toBe(subs)
  semReverter(m)
})

test('A30 Manual: parada only, no MODO row, mode unchanged', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  await peer($, LINHA_P)
  await quieto(m)
  await tick(m)
  expect(m.db!['config/continuo']).toBeUndefined()
  expect(linhasParada(m).length).toBe(1)
  expect(linhasModo(m)).toEqual([])
  expect(m.toasts.filter(t => t === `Parada em C06: ${MOTIVO_P}`).length).toBe(1)
  const p = partesDaFaixa(await banda($))
  expect([p.titulo, p.status, p.segunda[0]]).toEqual(['parada', MOTIVO_P, `🔴 parada: ${MOTIVO_P}`])
  const c = await corpoDoPainel($)
  expect(textoNo(c.primeiro)).toContain('🚨 Parada em C06')
  await c.ui.unmount()
  semReverter(m)
})

test('A32 db only: the poll and the tick handle it as A30, no prompt submitted', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  const subs = submetidos(m)
  m.db!['execucao/C06'] = bloqueio('falha-deploy', 'Deploy de C06 falhou.', new Date().toISOString())
  await poll(m)
  await tick(m)
  expect(linhasParada(m).length).toBe(1)
  expect(linhasParada(m)[0]![0]).toMatch(/^auditoria\/parada-falha-deploy-C06-/)
  expect(m.toasts.filter(t => t === 'Parada em C06: Deploy de C06 falhou.').length).toBe(1)
  expect(partesDaFaixa(await banda($)).segunda[0]).toBe('🔴 parada: Deploy de C06 falhou.')
  const c = await corpoDoPainel($)
  expect(textoNo(c.primeiro)).toContain('🚨 Parada em C06')
  await c.ui.unmount()
  expect(submetidos(m)).toBe(subs)
  semReverter(m)
})

test('A33 10 ticks and one restart: one row, one toast, one card; the paused card survives', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo')
  m.db!['execucao/C06'] = bloqueio('gate-vermelho', 'Gate vermelho em C06-S02.', new Date().toISOString())
  await poll(m)
  for (let i = 0; i < 10; i++) await tick(m)
  const toast = 'Maestro pausou o Maestro: Gate vermelho em C06-S02.'
  expect(m.toasts.filter(t => t.includes('Gate vermelho em C06-S02.'))).toEqual([toast])
  await reiniciar($, m)
  await tick(m)
  await tick(m)
  expect(linhasParada(m).length).toBe(1)
  expect(setsParada(m)).toBe(1)
  expect(m.toasts.filter(t => t.includes('Gate vermelho em C06-S02.'))).toEqual([toast])
  const c = await corpoDoPainel($)
  expect(c.cartoes).toBe(1)
  expect(textoNo(c.primeiro)).toContain('🚨 Maestro pausou o Maestro')
  await c.ui.unmount()
  semReverter(m)
})

test('A33 an at-less db key: one episode across ticks, a restart and a late message of the same stop', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.db!['execucao/C06'] = bloqueio('falha-deploy', 'Deploy falhou.')
  await poll(m)
  await tick(m)
  await reiniciar($, m)
  await peer($, 'CONJUNTO C06 bloqueado parada:falha-deploy Deploy falhou.')
  await quieto(m)
  await tick(m)
  expect(linhasParada(m).length).toBe(1)
  // the ruling: an at-less row records the handling wall time, never epoch 0
  expect(Date.parse(linhasParada(m)[0]![1].data.at)).toBeGreaterThan(0)
  expect(m.toasts.filter(t => t.includes('Deploy falhou.')).length).toBe(1)
  const c = await corpoDoPainel($)
  expect(c.cartoes).toBe(1)
  await c.ui.unmount()
})

test('R34/R31 a failed PARADA row is never lost: 3 tick retries, one log, then once per poll', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.falharTool = (e: any) => e.tool === 'ArtifactData' && e.collection === 'auditoria' && e.action === 'set'
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.toasts.filter(t => t.startsWith('Parada em C06')).length).toBe(1)
  expect(setsParada(m)).toBe(1)
  await tick(m)
  await tick(m)
  expect(setsParada(m)).toBe(3)
  expect(m.logs.filter(l => l.includes('linha PARADA')).length).toBe(1)
  await tick(m)
  expect(setsParada(m)).toBe(3)
  expect(Object.keys(escrito(m, 'maestroParadas').pendentes).length).toBe(1)
  expect(Object.keys((m.store[`maestro-paradas-${RUN_I}`] as any).pendentes).length).toBe(1)
  await poll(m)
  expect(setsParada(m)).toBe(4)
  expect(m.logs.filter(l => l.includes('linha PARADA')).length).toBe(1)
  m.falharTool = null
  await poll(m)
  expect(linhasParada(m).length).toBe(1)
  expect(Object.keys(escrito(m, 'maestroParadas').pendentes)).toEqual([])
  await tick(m)
  await poll(m)
  expect(setsParada(m)).toBe(5)
  expect(m.toasts.filter(t => t.startsWith('Parada em C06')).length).toBe(1)
  // a message-only stop closes at the first db read taken after it that holds no parada key
  const c = await corpoDoPainel($)
  expect(c.cartoes).toBe(0)
  await c.ui.unmount()
})

test('R34 an already-exists answer clears a pending PARADA row', LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.falharTool = (e: any) => e.collection === 'auditoria' && e.action === 'set'
  await peer($, LINHA_P)
  await quieto(m)
  m.falharTool = (e: any) => (e.collection === 'auditoria' && e.action === 'set' ? `Document auditoria/${e.doc_id} already exists.` : false)
  await tick(m)
  expect(Object.keys(escrito(m, 'maestroParadas').pendentes)).toEqual([])
  await tick(m)
  expect(setsParada(m)).toBe(2)
})

test('R31 a failing PARADA row still pauses; the next tick sends no directive', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo', { conjuntos: calado() })
  m.falharTool = (e: any) => e.collection === 'auditoria' && e.action === 'set'
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  await tick(m)
  expect(enviados(m)).toEqual([])
})

test('a stop the tick handles pauses before the nudge of that tick (I2)', MAIS_LENTO, async ($: any, on: any) => {
  // no poll yet and the config read fails: the received stop waits for the tick, whose own stop-alerts must run first
  const m = await orq($, on, { plano: PLANO_P, conjuntos: calado(), semPoll: true, db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  m.falharTool = (e: any) => e.action === 'list' && e.collection === 'config'
  await peer($, LINHA_P)
  await quieto(m)
  expect(linhasParada(m)).toEqual([])
  m.falharTool = null
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  expect(linhasParada(m).length).toBe(1)
})

test('a pending stop pause survives a restart: the gate stays shut and the write lands', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo', { conjuntos: calado() })
  m.falharTool = (e: any) => e.collection === 'config' && e.doc_id === 'continuo' && (e.action === 'update' || e.action === 'set')
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
  expect((m.store[`maestro-paradas-${RUN_I}`] as any).pausaPendente).not.toBeNull()
  await tick(m)
  expect(enviados(m)).toEqual([])
  await reiniciar($, m)
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(m.db!['config/continuo']!.data.modo).toBe('continuo')
  m.falharTool = null
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(m.db!['config/continuo']!.data).toMatchObject({ modo: 'pausado', modoBy: 'Maestro' })
  expect((m.store[`maestro-paradas-${RUN_I}`] as any).pausaPendente).toBeNull()
  semReverter(m)
})

test('a pending PARADA row survives a tick and a restart: one row, no second toast', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.falharTool = (e: any) => e.collection === 'auditoria' && e.action === 'set'
  await peer($, LINHA_P)
  await quieto(m)
  await tick(m)
  expect(Object.keys(escrito(m, 'maestroParadas').pendentes).length).toBe(1)
  m.falharTool = null
  await reiniciar($, m)
  await tick(m)
  expect(linhasParada(m).length).toBe(1)
  expect(m.toasts.filter(t => t.startsWith('Parada em C06')).length).toBe(1)
})

test('A55 the stop card is first on every tab and counts in the bell', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.db!['execucao/C06'] = bloqueio('gate-vermelho', 'Gate vermelho em C06-S02.', new Date().toISOString())
  await poll(m)
  const c = await corpoDoPainel($)
  expect(String(c.primeiro?.key)).toMatch(/^parada-parada-gate-vermelho-C06-/)
  expect(c.alt).toContain('1 alerta')
  expect(c.sino).toBe('🔔 1 alerta')
  await c.ui.press({ key: 't-configuracao' })
  await quieto(m)
  await c.ui.unmount()
  expect(escrito(m, 'maestroAba')).toBe('configuracao')
  const d = await corpoDoPainel($)
  expect(String(d.primeiro?.key)).toMatch(/^parada-parada-gate-vermelho-C06-/)
  expect(d.sino).toBe('🔔 1 alerta')
  await d.ui.unmount()
  expect(escrito(m, 'maestroFaixaDados').nAlertas).toBe(1)
})

// ---- Phase 6 fix round 1

test('C1 a Contínuo stop received before any config read still pauses', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { plano: PLANO_P, conjuntos: calado(), semPoll: true, db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.db!['config/continuo']!.data).toMatchObject({ modo: 'pausado', modoBy: 'Maestro' })
  expect(m.toasts).toContain(`Maestro pausou o Maestro: ${MOTIVO_P}`)
  await tick(m)
  expect(enviados(m)).toEqual([])
})

test('I1 a report wake-up during stop handling waits for the pause: zero sends', MAIS_LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq($, on, { plano: PLANO_P, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } }, semPoll: true, db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } } })
  // a quiet C02 alert is due, so an open gate sends `status C02?`
  m.servirEstado = { ...m.servirEstado, maestroAlertas: { lista: [{ chave: `calado:C02:${at}`, texto: 'C02 calada há 16 min', toast: '', nivel: 'erro', at }], alertasVistos: [], sweep: null, limiares: { calado: 15, lockOrfao: 20 }, olhares: 0 } }
  let soltar = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  // the stop handling is held on its own (first) config read; the nudge's own read goes through
  let n = 0
  m.segurarTool = (e: any) => (e.action === 'list' && e.collection === 'config' && n++ === 0 ? preso : null)
  await peer($, LINHA_P)
  await peer($, 'CONJUNTO C02 manifestos disjuntos c02-s01')
  await quieto(m)
  const t0 = m.timers.find(t => t.ms === 0 && !t.disparado && !t.abortado)
  expect(t0).toBeDefined()
  t0!.disparado = true
  t0!.fire()
  await quieto(m)
  soltar()
  await quieto(m)
  expect(enviados(m)).toEqual([])
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
})

test('I3 message then db: one row, one toast, one card', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  await peer($, LINHA_P)
  await quieto(m)
  m.db!['execucao/C06'] = bloqueio('conflito-merge', MOTIVO_P, new Date(Date.now() - 2000).toISOString())
  await poll(m)
  await tick(m)
  await poll(m)
  expect(linhasParada(m).length).toBe(1)
  expect(setsParada(m)).toBe(1)
  expect(m.toasts.filter(t => t === `Parada em C06: ${MOTIVO_P}`).length).toBe(1)
  const c = await corpoDoPainel($)
  expect(c.cartoes).toBe(1)
  await c.ui.unmount()
})

test('I3 re-raised after clear, more than 10 min later: a second row, toast and card', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, null)
  m.db!['execucao/C06'] = bloqueio('gate-vermelho', 'Gate vermelho.', new Date(Date.now() - 30 * 60_000).toISOString())
  await poll(m)
  m.db!['execucao/C06'] = { data: { bloqueios: {} }, version: 2 }
  await poll(m)
  let c = await corpoDoPainel($)
  expect(c.cartoes).toBe(0)
  await c.ui.unmount()
  m.db!['execucao/C06'] = bloqueio('gate-vermelho', 'Gate vermelho.', new Date().toISOString())
  await poll(m)
  await tick(m)
  expect(linhasParada(m).length).toBe(2)
  expect(m.toasts.filter(t => t === 'Parada em C06: Gate vermelho.').length).toBe(2)
  c = await corpoDoPainel($)
  expect(c.cartoes).toBe(1)
  await c.ui.unmount()
})

test('I3 a stop in Pausado: mode unchanged, no MODO row, Parada em', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'pausado')
  await peer($, LINHA_P)
  await quieto(m)
  await tick(m)
  expect(m.db!['config/continuo']).toEqual({ data: DOC_I('pausado'), version: 1 })
  expect(linhasModo(m)).toEqual([])
  expect(linhasParada(m).length).toBe(1)
  expect(m.toasts.filter(t => t === `Parada em C06: ${MOTIVO_P}`).length).toBe(1)
  expect(partesDaFaixa(await banda($)).titulo).toBe('parada')
})

test('I3 a plan with no sets folds any C\d\d line; others are ignored', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { plano: { ...PLANO_I, conjuntos: [] } })
  await peer($, 'CONJUNTO X7 bloqueado parada:gate-vermelho nao')
  await peer($, 'CONJUNTO C07 bloqueado parada:gate-vermelho Gate vermelho em C07.')
  await quieto(m)
  expect(linhasParada(m).map(([k]) => k.split('-').slice(0, 4).join('-'))).toEqual(['auditoria/parada-gate-vermelho-C07'])
  expect(m.toasts).toContain('Parada em C07: Gate vermelho em C07.')
  expect(m.toasts.some(t => t.includes('nao'))).toBe(false)
})

test('I4 the stops restore only the current run key; the previous run entry is never read nor written', MAIS_LENTO, async ($: any, on: any) => {
  const NOVO = '20261104-1000'
  const velha = { abertas: [], tratadas: { 'C06|conflito-merge': 1 }, pendentes: {}, pausaPendente: { at: 1, modoAt: '1970-01-01T00:00:00.001Z' }, pausaLocal: { at: 1 } }
  const m = await orq($, on, {
    plano: PLANO_P, dir: `C:/repo/.novarc/ledger/novarc-orq/${NOVO}`,
    db: { 'config/continuo': { data: DOC_I('continuo', NOVO), version: 1 } },
    // config/orquestracao keeps the old run id: its write fails, so runIdAtual still reads RUN_I
    antes: (mm: Mundo) => {
      mm.store[`maestro-paradas-${RUN_I}`] = JSON.parse(JSON.stringify(velha))
      mm.falharTool = (e: any) => e.collection === 'config' && e.doc_id === 'orquestracao' && (e.action === 'update' || e.action === 'set')
    },
  })
  expect(m.db!['config/orquestracao']!.data.runId).toBe(RUN_I)
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.db!['config/continuo']!.data).toMatchObject({ runId: NOVO, modo: 'pausado', modoBy: 'Maestro' })
  expect(m.toasts).toContain(`Maestro pausou o Maestro: ${MOTIVO_P}`)
  expect(m.store[`maestro-paradas-${RUN_I}`]).toEqual(velha)
  expect(Object.keys((m.store[`maestro-paradas-${NOVO}`] as any).tratadas)).toEqual(['C06|conflito-merge'])
})

// ---- Phase 7: carried from the Phase 6 review (N4, N6)

test('N4 a failed stop restore is not cached: the next nudge restores again and sends', MAIS_LENTO, async ($: any, on: any) => {
  // every read of the stops state fails through the setup and one tick, then the store works again
  let falha = true
  let n = 0
  const m = await orq($, on, {
    plano: PLANO_P, conjuntos: calado(), db: { 'config/continuo': { data: DOC_I('continuo'), version: 1 } },
    antes: w => { w.falharLeituraEstado = (e: any) => e.key === 'maestroParadas' && falha && ++n > 0 },
  })
  await tick(m)
  expect(n).toBeGreaterThan(0)
  expect(enviados(m)).toEqual([])
  falha = false
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
})

test('N6 a stop that pauses while the nudge awaits after its gate check: zero sends', MAIS_LENTO, async ($: any, on: any) => {
  const m = await orqP($, on, 'continuo', { conjuntos: calado() })
  let soltar = () => {}
  const preso = new Promise<void>(r => (soltar = r))
  // the tick lists the set ledger twice: its alert scan, then the nudge's report read (after the gate); the second is held
  let n = 0
  m.segurar = (dir: string) => (dir === LDIR && n++ === 1 ? preso : null)
  disparar(m)
  await quieto(m)
  expect(n).toBe(2)
  await peer($, LINHA_P)
  await quieto(m)
  expect(m.db!['config/continuo']!.data.modo).toBe('pausado')
  soltar()
  await quieto(m)
  expect(enviados(m)).toEqual([])
})
