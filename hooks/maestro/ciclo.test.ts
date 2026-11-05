import { expect, test } from 'claude-code/testing'

// C06-S02: the continuous cycle in the orchestrator (keyed FECHA / GO inicio, proven merges, the merge card, the
// production belt, the go-safety-net, the click merge). Every planning-db write lands in the test world's memory.
import { type ContinuoDoc, type Perfil } from './logic'
import { SESSOES, URL as URL_C, disparar, escrito, gravar, iniciar, montar, partesDaFaixa, quieto, textoNo, todos, type Mundo } from './mundo-teste'
import { mesclar } from './register'

const LENTO = { timeoutMs: 60_000 }
const COD = 'NOVARC-PLUGIN-MAESTRO'
const RUN = '20261103-0930'
const ORQ_DIR = `C:/repo/.novarc/ledger/novarc-orq/${RUN}`
const LDIR = `C:/repo/.novarc/ledger/session-build/${RUN}`
const PIN1 = 'abcdef1234567'
const PIN2 = '1234567abcdef'
const PERFIL = (o: Partial<Perfil> = {}): Perfil => ({
  hostGit: 'github', merge: { quem: 'novarc', clique: false }, migracao: { ferramenta: 'supabase', ordem: 'timestamp' },
  deploys: [{ alvo: 'publicar-dev', dispara: 'merge' }], teto: { ate: 'deploy', migracaoProducao: false, deploy: true, porAcao: false }, ...o,
})
const PLANO = (perfil: Perfil) => ({
  conjuntos: [
    { id: 'C02', titulo: 'Alertas', specs: ['C02-S01', 'C02-S02'] },
    { id: 'C03', titulo: 'Guardas', specs: ['C03-S01'], dependeDe: ['C02'] },
  ],
  specs: [
    { id: 'C02-S01', conjunto: 'C02', slug: 'alertas' },
    { id: 'C02-S02', conjunto: 'C02', slug: 'locks' },
    { id: 'C03-S01', conjunto: 'C03', slug: 'guardas' },
  ],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: COD },
  execucao: { orquestrador: `novarc-orq-${COD}`, perfil },
})
const ATE = () => new Date(Date.now() + 6 * 60 * 60_000).toISOString()
const DOC = (modo: ContinuoDoc['modo'], perfil: Perfil): ContinuoDoc => ({
  runId: RUN, modo, modoBy: 'Willian', modoAt: new Date().toISOString(),
  autorizacao: { by: 'Willian', at: new Date().toISOString(), escopo: { conjuntos: ['C02', 'C03'], fases: [], merge: true, migracoes: false, deploys: true, ate: ATE() }, teto: perfil.teto!, continuoHabilitado: true },
})
const L3 = 'local_33333333-3333-4333-8333-333333333333'
const PANE = { plugin: 'novarc', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 120 } } as const
const BANDA = { plugin: 'novarc', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 78 } } as const
const stamp = (ms = Date.now()) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')

type Opc = { modo?: ContinuoDoc['modo'] | null; perfil?: Perfil; ledger?: string; specs?: Record<string, any>; db?: Record<string, any> }

/** An orchestrator of run RUN with C02's set session in the registry (ledger LDIR); the poll fired once. */
async function orq($: any, on: any, o: Opc = {}): Promise<Mundo> {
  const perfil = o.perfil ?? PERFIL()
  const m = montar(on, {}, 'main', true)
  m.env.USERNAME = 'Willian'
  m.plano = PLANO(perfil)
  m.db = {
    'config/orquestracao': { data: { runId: RUN }, version: 1 },
    ...(o.modo === null ? {} : { 'config/continuo': { data: DOC(o.modo ?? 'continuo', perfil), version: 1 } }),
    ...Object.fromEntries(Object.entries(o.specs ?? {}).map(([id, d]) => [`specs/${id}`, { data: d, version: 1 }])),
    ...o.db,
  }
  gravar(m, `${ORQ_DIR}/ledger.md`, `# novarc-orq - run ${RUN}\n${o.ledger ?? ''}`)
  gravar(m, `${LDIR}/ledger.md`, `# session-build - run ${RUN}\n`)
  gravar(m, `${SESSOES}/set-c02.json`, JSON.stringify({ sessao: 'set-c02', cwd: 'C:/repo', titulo: 'x', papel: 'conjunto', forks: 2, feitos: 0, alerta: null, at: Date.now(), codigo: COD, conjunto: 'C02', ledgerDir: LDIR }))
  m.servirEstado = { exec: { papel: 'orquestrador', ledgerDir: ORQ_DIR, forks: {}, codigo: COD, conjuntos: {} }, ctx: { artefato: URL_C, plano: m.plano, conjunto: null, spec: null, papel: 'orquestrador' } }
  await iniciar($)
  await quieto(m)
  await poll(m)
  return m
}
const poll = async (m: Mundo) => {
  disparar(m, 300_000)
  await quieto(m)
}
const auditoria = (m: Mundo) => Object.entries(m.db ?? {}).filter(([k]) => k.startsWith('auditoria/')).map(([k, v]) => ({ id: k.slice('auditoria/'.length), ...v.data }))
const fila = (m: Mundo) => ((escrito(m, 'auditoriaPendente') ?? []) as { id: string; doc: any }[])
const agente = ($: any, text: string) => $.session.send?.({ to: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', text, origin: { kind: 'model' } })
const peer = ($: any, text: string) => $.session.receive?.({ origin: { kind: 'peer-send-message' }, text })
const entregas = (m: Mundo, re: RegExp) => m.eventos.filter(x => x.e && typeof x.e === 'object' && 'to' in x.e && re.test(String(x.e.text)) && x.e.origin?.kind === 'model').length
const FECHA = `FECHA C02 C02-S01=${PIN1} C02-S02=${PIN2}`
const CHAVE_FECHA = 'ciclo-pendentes-C02-abcdef1-1234567'

test('A1, R4: an automatic FECHA has its keyed row before the send, enviado after it, and no FECHA row', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  const n = m.eventos.length
  const r = await agente($, `${FECHA}\npendentes resolvidos no pré-fechamento das specs`)
  await quieto(m)
  expect(r?.isDelivered).toBe(true)
  const i = m.eventos.slice(n).findIndex(x => x.e?.tool === 'ArtifactData' && x.e?.doc_id === CHAVE_FECHA && x.e?.action === 'set')
  const j = m.eventos.slice(n).findIndex(x => 'to' in (x.e ?? {}) && String(x.e.text).startsWith('FECHA'))
  expect(i).toBeGreaterThanOrEqual(0)
  expect(i).toBeLessThan(j)
  const linhas = auditoria(m).filter(a => a.id === CHAVE_FECHA)
  expect(linhas.length).toBe(1)
  expect(linhas[0]).toMatchObject({ acao: 'CICLO-PENDENTES', estado: 'enviado' })
  expect(fila(m).filter(f => f.doc.acao === 'FECHA').length).toBe(0)
})

test('two concurrent sends of one FECHA deliver once; a delivered FECHA is refused after', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  let solta: () => void = () => {}
  const espera = new Promise<void>(r => (solta = r))
  let chegou = 0
  m.entrega = (e: any) => (String(e.text).startsWith('FECHA') ? (chegou++, espera.then(() => ({ isDelivered: true }))) : { isDelivered: true })
  const a = agente($, FECHA)
  const b = agente($, FECHA)
  await new Promise(r => setTimeout(r, 100))
  solta()
  const rs = await Promise.all([a, b])
  await quieto(m)
  expect(chegou).toBe(1)
  expect(rs.filter(r => r?.isDelivered).length).toBe(1)
  m.entrega = null
  const c = await agente($, FECHA)
  expect(c?.isDelivered).toBe(false)
  expect(String(c?.reason)).toContain('já entregue')
  expect(auditoria(m).filter(x => x.id === CHAVE_FECHA).length).toBe(1)
})

test('audit and relay both failing refuse the send; a Manual FECHA keeps its observed row', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  m.falharTool = (e: any) => e.tool === 'ArtifactData' && e.doc_id === CHAVE_FECHA
  m.falharRun = (argv: string[]) => argv.includes('RELAY')
  const r = await agente($, FECHA)
  expect(r?.isDelivered).toBe(false)
  expect(String(r?.reason)).toContain('sem trilha durável')
  expect(m.toasts.some(t => t.includes('não enviada'))).toBe(true)
  // the relay works: the send goes, the RELAY line first
  m.falharRun = null
  const n = m.runs.length
  expect((await agente($, FECHA))?.isDelivered).toBe(true)
  expect(m.runs.slice(n).some(x => x.includes('RELAY') && x.includes(CHAVE_FECHA))).toBe(true)
})

test('Manual: FECHA is not keyed and keeps the observed FECHA row', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { modo: 'manual' })
  await agente($, FECHA)
  await quieto(m)
  expect(auditoria(m).some(a => a.id === CHAVE_FECHA)).toBe(false)
  expect(fila(m).some(f => f.doc.acao === 'FECHA')).toBe(true)
})

test('A21, R22: a GO inicio is keyed go-inicio-<C>-<run> once; a phase-4 GO keeps C03 keys', LENTO, async ($: any, on: any) => {
  const m = await orq($, on)
  const go = 'GO C03 inicio 9f8e7d6\nspecs-atualizadas: nenhuma'
  expect((await agente($, go))?.isDelivered).toBe(true)
  await quieto(m)
  expect((await agente($, go))?.isDelivered).toBe(false)
  const k = `go-inicio-C03-${RUN}`
  expect(auditoria(m).filter(a => a.id === k)).toEqual([expect.objectContaining({ acao: 'GO-DEPENDENCIA', estado: 'enviado' })])
  expect(k).not.toMatch(/-fase4-/)
  expect(escrito(m, 'maestroGos').C03.sha).toBe('9f8e7d6')
})

const LEDGER_FECHA = `NOTE FECHA C02 C02-S01=${PIN1} C02-S02=${PIN2}  # ${stamp()}\n`

test('A5: a proven merge draws the card; publish comes only with a DEPLOYED proof after it, toast once', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { ledger: LEDGER_FECHA })
  await peer($, 'CONJUNTO C02 pr-aberto C02-S01 https://github.com/x/y/pull/31')
  await peer($, 'CONJUNTO C02 merge C02-S01 C02-S02 a1b2c3d')
  await quieto(m)
  expect(m.toasts.filter(t => t.includes('mergeado')).length).toBe(0) // the profile deploys on merge: wait for it
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 't-exec' })
  await ui.press({ key: 'sel-C02' })
  expect((await ui.find({ key: 'mrg' }))?.text).toContain('Mergeado')
  expect((await ui.find({ key: 'mrg' }))?.text).toContain('publicação: aguardando o redeploy')
  await ui.unmount()
  gravar(m, `${LDIR}/ledger.md`, `# session-build - run ${RUN}\nAPPLIED 20261109_x.sql  # ${stamp()}\nDEPLOYED publicar-dev VERIFIED re-download  # ${stamp(Date.now() + 1000)}\n`)
  await poll(m)
  await poll(m)
  expect(m.toasts.filter(t => t.startsWith('C02 mergeado e publicado'))).toEqual(['C02 mergeado e publicado · PR #31 · CI verde · migração 20261109_x.sql, deploy da publicar-dev'])
  const ids = fila(m).map(f => f.id).concat(auditoria(m).map(a => a.id))
  expect(ids).toContain('merge-C02-a1b2c3d')
  expect(ids).toContain('migracao-C02-20261109-x-sql')
  expect(ids.filter(i => i.startsWith('deploy-C02-publicar-dev')).length).toBe(1)
  const ui2 = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui2.press({ key: 't-exec' })
  await ui2.press({ key: 'sel-C02' })
  const card = await ui2.find({ key: 'mrg' })
  expect(card?.text).toContain('🚀Mergeado e publicado')
  expect(card?.text).toContain('PR #31 · gate verde · automático pelo perfil')
  expect(JSON.stringify(card)).not.toMatch(/local_/)
  expect((await ui2.find({ key: 'exk-3' }))?.text).toContain('C02 segue a fila sozinho')
  await ui2.unmount()
})

test('a merge report without the approved pins is dropped', LENTO, async ($: any, on: any) => {
  const m = await orq($, on) // no NOTE FECHA: nothing was approved
  await peer($, 'CONJUNTO C02 merge C02-S01 C02-S02 a1b2c3d')
  await quieto(m)
  expect(escrito(m, 'maestroCiclo')?.merges?.C02?.merged).not.toBe(true)
  expect(m.logs.some(l => l.includes('não provado'))).toBe(true)
})

test('a merge report older than the run base is dropped', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { ledger: `${LEDGER_FECHA}NOTE BASE 0ld0ba5e  # ${stamp()}
` })
  // every git check answers 0 in this world: the merge sha is an ancestor of the base, so it is an old merge
  await peer($, 'CONJUNTO C02 merge C02-S01 C02-S02 a1b2c3d')
  await quieto(m)
  expect(escrito(m, 'maestroCiclo')?.merges?.C02?.merged).not.toBe(true)
})

test('a merge not yet on origin waits and is drawn once origin has it', LENTO, async ($: any, on: any) => {
  const m = await orq($, on, { ledger: LEDGER_FECHA })
  m.falharRun = (argv: string[]) => argv.includes('merge-base') && argv.includes('origin/main')
  await peer($, 'CONJUNTO C02 merge C02-S01 C02-S02 a1b2c3d')
  await quieto(m)
  expect(escrito(m, 'maestroCiclo').pendentes.length).toBe(1)
  m.falharRun = (argv: string[]) => argv.includes('merge-base') && !argv.includes('origin/main') && argv.includes('a1b2c3d') && argv.length === 5 && argv[3] === 'a1b2c3d'
  await poll(m)
  expect(escrito(m, 'maestroCiclo').merges.C02.merged).toBe(true)
})

test('A17: an empty queue shows the caption and no card', LENTO, async ($: any, on: any) => {
  await orq($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 't-locks' })
  expect(textoNo(await ui.drawn())).toContain('esteira de produção · nada na fila')
  expect(await ui.find({ key: 'esteira' })).toBeUndefined()
  await ui.unmount()
})

test('A17, A30, A18: the belt in the orchestrator order, running, failed', LENTO, async ($: any, on: any) => {
  let ui: any
  const m = await orq($, on, { ledger: `NOTE ORDEM-PRODUCAO C02:migracao=20261109_add_continuo,merge,deploy-notificar  # ${stamp()}\nLOCK producao feat/x C02 from=a sid=1  # ${stamp()}\nGO C02 producao feat/x  # ${stamp()}\n` })
  for (const surface of ['desktop', 'terminal'] as const) {
    ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 't-locks' })
    const est = await ui.find({ key: 'esteira' })
    expect(est?.text).toContain('1.')
    expect(est?.text).toContain('migração 20261109_add_continuo')
    expect(est?.text).toContain('deploy da notificar')
    expect(est?.text).toContain('⏳')
    expect(est?.text).toContain('um por vez · falhou, para e avisa · sem revert automático · redeploy só do último')
    if (surface === 'desktop') expect(todos(est).find((x: any) => x.type === 'Svg')?.props.alt).toBe('esteira de produção: 0 de 3 feitos')
    else expect(est?.text).toContain('▯▯▯')
    await ui.unmount()
  }
  const cfg = m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.collection === 'config' && t.doc_id === 'orquestracao' && t.action !== 'get' && t.action !== 'list')
  expect(cfg.length).toBeGreaterThan(0)
  expect(m.db!['config/orquestracao']!.data.ordemProducao).toEqual(['C02'])
  gravar(m, `${ORQ_DIR}/ledger.md`, `${m.arquivos[`${ORQ_DIR}/ledger.md`]!.text}NOTE CONJUNTO C02 bloqueado parada:falha-deploy timeout  # ${stamp()}\n`) // the ledger only grows
  await poll(m)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 't-locks' })
  const est = await ui.find({ key: 'esteira' })
  expect(est?.text).toContain('falhou: timeout')
  await ui.unmount()
})

test('A23-A26: go-safety-net queues one turn per released waiting set, only in Contínuo, with no db read', LENTO, async ($: any, on: any) => {
  const ledger = `NOTE SESSAO C03 c03-novarc-plugin-maestr ${L3} vazia  # ${stamp()}\n`
  const specs = { 'C02-S01': { etapa: 'merge' }, 'C02-S02': { etapa: 'merge' } }
  const m = await orq($, on, { ledger, specs })
  const turnos = () => m.eventos.filter(x => typeof x.e?.text === 'string' && x.e.text.startsWith('Maestro (automático): GO pendente para C03') && !('to' in x.e)).length
  expect(turnos()).toBe(1)
  const n = m.tools.length
  await poll(m)
  await poll(m)
  expect(turnos()).toBe(1)
  const leituras = m.tools.slice(n).filter((t: any) => t.tool === 'ArtifactData' && t.collection === 'auditoria')
  expect(leituras.length).toBe(0)
})

test('A26: in Pausado the go-safety-net queues nothing', LENTO, async ($: any, on: any) => {
  const ledger = `NOTE SESSAO C03 c03-novarc-plugin-maestr ${L3} vazia  # ${stamp()}
`
  const p = await orq($, on, { ledger, specs: { 'C02-S01': { etapa: 'merge' }, 'C02-S02': { etapa: 'merge' } }, modo: 'pausado' })
  expect(p.eventos.filter(x => typeof x.e?.text === 'string' && x.e.text.startsWith('Maestro (automático): GO pendente') && !('to' in x.e)).length).toBe(0)
})

test('A6, A7, A8, A31, A32: a click profile waits with the Button and the band; the click records first', LENTO, async ($: any, on: any) => {
  const perfil = PERFIL({ merge: { quem: 'novarc', clique: true } })
  const specs = { 'C02-S01': { etapa: 'pr-aberto', headSha: PIN1 }, 'C02-S02': { etapa: 'pr-aberto', headSha: PIN2 } }
  const m = await orq($, on, { perfil, specs })
  await peer($, 'CONJUNTO C02 pr-aberto C02-S01 https://github.com/x/y/pull/31')
  await quieto(m)
  for (let i = 0; i < 3; i++) await poll(m)
  expect(m.toasts.filter(t => t.includes('mergeado')).length).toBe(0)
  const b = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  const p = partesDaFaixa(await b.drawn())
  expect(p.titulo).toBe('espera seu clique')
  expect(p.status).toBe('C02 pronto para merge · PR #31 · gate verde')
  expect((await b.find({ key: 'ver-merge' }))?.props).toMatchObject({ variant: 'primary', hotkey: '1' })
  await b.press({ key: 'ver-merge' })
  await quieto(m)
  expect(escrito(m, 'maestroAba')).toBe('execucao')
  expect(escrito(m, 'maestroSelConjunto')).toBe('C02')
  await b.unmount()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 't-exec' })
  await ui.press({ key: 'sel-C02' })
  const card = await ui.find({ key: 'mrg' })
  expect(card?.text).toContain('Pronto para merge')
  expect(card?.text).toContain('o perfil pede aprovação humana · espera o clique, sem prazo')
  expect(card?.props.borderColor).toBe('warning')
  expect(todos(card).filter((x: any) => x?.type === 'Text').every((x: any) => !String(x?.props?.color ?? '').startsWith('#'))).toBe(true)
  expect((await ui.find({ key: 'fazer-merge' }))?.props.variant).toBe('primary')
  const n = m.eventos.length
  await ui.press({ key: 'fazer-merge' })
  await quieto(m)
  const depois = m.eventos.slice(n)
  const iw = depois.findIndex(x => x.e?.tool === 'ArtifactData' && String(x.e?.doc_id).startsWith('clique-merge-C02-abcdef1-1234567'))
  const is = depois.findIndex(x => x.e?.text === 'Libero o merge do C02')
  expect(iw).toBeGreaterThanOrEqual(0)
  expect(is).toBeGreaterThan(iw)
  expect(auditoria(m).find(a => a.id === 'clique-merge-C02-abcdef1-1234567')).toMatchObject({ acao: 'CLIQUE-MERGE', by: 'Willian' })
  expect(m.tools.filter((t: any) => 'questions' in t || /AskUserQuestion/.test(String(t.tool))).length).toBe(0)
  await ui.unmount()
})

test('A9, A29: a peer line records no click; podeLiberar false draws no Button', LENTO, async ($: any, on: any) => {
  const perfil = PERFIL({ merge: { quem: 'novarc', clique: true } })
  const specs = { 'C02-S01': { etapa: 'pr-aberto', headSha: PIN1 }, 'C02-S02': { etapa: 'pr-aberto', headSha: PIN2 } }
  const m = await orq($, on, { perfil, specs, db: { 'config/dono': { data: { pessoa: 'Ana', podeLiberar: false }, version: 1 } } })
  await peer($, 'Libero o merge do C02')
  await quieto(m)
  expect(auditoria(m).some(a => a.acao === 'CLIQUE-MERGE')).toBe(false)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 't-exec' })
  await ui.press({ key: 'sel-C02' })
  expect((await ui.find({ key: 'mrg' }))?.text).toContain('merge e deploy esperam alguém da NovArc')
  expect(await ui.find({ key: 'fazer-merge' })).toBeUndefined()
  await ui.unmount()
})

test('A35: old state without the cycle keys draws the empty belt and throws nothing', () => {
  expect(mesclar('maestroCiclo', undefined)).toEqual({ merges: {}, pendentes: [], provas: [], goPedidos: {}, goFalhas: {} })
  expect(mesclar('maestroCiclo', { merges: { C02: { pr: 1 } } }).pendentes).toEqual([])
})
