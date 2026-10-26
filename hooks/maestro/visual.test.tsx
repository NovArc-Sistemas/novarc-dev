import { expect, test } from 'claude-code/testing'

import { escrito, iniciar, montar, partesDaFaixa, quieto, todos } from './mundo-teste'
import { dadosFaixa, haQuanto, semConfirmacao } from './register'

// C11-S01: the drawing of the pane and the band over both surfaces. Data paths are proved by their own tests
// (register.test dadosFaixa, olhos, alertas, pendencias); here a state read beneath the plugin can hand the drawing a
// prepared value, so each case pins what the person sees for one exact state.

const SUP = ['desktop', 'terminal'] as const
const BANDA = { plugin: 'novarc', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 78 } } as const

const FD = (o: Record<string, unknown>) => ({ papel: null, txt: null, titulo: 'NOVARC', status: 'ativo', alertas: [], pend: null, segmentos: [], feitos: null, verde: null, nAlertas: 0, abaAlerta: null, nOutras: 0, ...o })

async function banda($: any, surface: 'desktop' | 'terminal') {
  return $.ui.mount({ ...BANDA, surface })
}

test('band: three fixed columns, truncation props, logo and right column that never shrinks (A18)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { maestroFaixaDados: FD({ papel: 'orquestrador', titulo: 'orquestrando', status: `3 conjuntos vivos · ${'x'.repeat(300)}` }) }
  await iniciar($)
  const ui = await banda($, 'desktop')
  const raiz: any = await ui.drawn()
  expect([raiz.props.flexDirection, raiz.props.borderStyle]).toEqual(['row', 'round'])
  const [logo, meio, dir] = raiz.children
  expect([logo.type, logo.props.height, logo.props.alt]).toEqual(['Svg', 22, 'NovArc'])
  expect([meio.props.flexGrow, meio.props.width]).toEqual([1, 0])
  const status = todos(meio).find(n => n.type === 'Text' && String(n.children?.[0] ?? '').startsWith('3 conjuntos vivos'))
  expect(status.props.wrap).toBe('truncate-end')
  expect(dir.props.flexShrink).toBe(0)
  expect(todos(dir).some(n => n.type === 'Svg' && n.props.alt === 'modo manual')).toBe(true)
  expect(todos(dir).some(n => n.type === 'Button')).toBe(true)
  await ui.unmount()
})

test('band: orchestrator seal and painel; no mode Button (A19)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { maestroFaixaDados: FD({ papel: 'orquestrador', titulo: 'orquestrando', status: '3 conjuntos vivos · C03 em implementação' }) }
  await iniciar($)
  for (const surface of SUP) {
    const ui = await banda($, surface)
    const p = partesDaFaixa(await ui.drawn())
    expect([p.titulo, p.status]).toEqual(['orquestrando', '3 conjuntos vivos · C03 em implementação'])
    expect(p.direita).toEqual([surface === 'desktop' ? 'modo manual' : ' [modo manual] ', '[1] painel'])
    const b = await ui.find({ key: 'painel' })
    expect([b?.props.variant, b?.props.hotkey]).toEqual(['secondary', '1'])
    expect(await ui.find({ type: 'Button', text: /Manual/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('band: alerts on line 2, the first pulsing on desktop; the pendings slot only without alerts (A20)', async ($: any, on: any) => {
  const valores: Record<string, unknown> = { maestroFaixaDados: FD({ papel: 'orquestrador', titulo: 'orquestrando', status: '3 conjuntos vivos', alertas: ['lock órfão em C03-S01', 'C04 calada há 30 min'], abaAlerta: 'locks', nAlertas: 2 }) }
  const m = montar(on, {})
  m.servirEstado = valores
  await iniciar($)
  let ui: any = await banda($, 'desktop')
  const cl = await ui.find({ type: 'Client' })
  // register.tsx names it ./pulse.tsx; the loaded tree carries the plugin path, which proves it resolved beside register.tsx
  expect([cl?.props.module, cl?.props.props]).toEqual(['hooks/maestro/pulse.tsx', { label: 'lock órfão em C03-S01' }])
  expect((await ui.find({ type: 'Text', text: '🔴 C04 calada há 30 min' }))?.props.color).toBe('error')
  expect((await ui.find({ key: 'ver' }))?.props.variant).toBe('primary')
  await ui.unmount()
  ui = await banda($, 'terminal')
  expect((await ui.find({ type: 'Text', text: '🔴 lock órfão em C03-S01' }))?.props.color).toBe('error')
  await ui.unmount()
  valores.maestroFaixaDados = FD({ papel: 'orquestrador', titulo: 'orquestrando', status: '3 conjuntos vivos', pend: { tipo: 'contador', texto: '2 pendências seguram a fase 6' } })
  ui = await banda($, 'terminal')
  expect((await ui.find({ type: 'Text', text: '🔴 2 pendências seguram a fase 6' }))?.props.color).toBe('warning')
  expect(await ui.find({ key: 'ver-pend' })).toBeDefined()
  await ui.unmount()
})

test('band: ready to close is green with the seal alone (A21)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { maestroFaixaDados: FD({ papel: 'orquestrador', titulo: 'orquestrando', status: 'x', verde: { titulo: 'pronto para fechar', texto: 'C08 com as 2 specs em DONE, sem lock aberto', dica: 'peça o FECHA na conversa' } }) }
  await iniciar($)
  for (const surface of SUP) {
    const ui = await banda($, surface)
    const raiz: any = await ui.drawn()
    expect(raiz.props.borderColor).toBe('success')
    const p = partesDaFaixa(raiz)
    expect([p.titulo, p.status, p.segunda]).toEqual(['pronto para fechar', 'C08 com as 2 specs em DONE, sem lock aberto', ['peça o FECHA na conversa']])
    expect(p.direita).toEqual([surface === 'desktop' ? 'modo manual' : ' [modo manual] '])
    expect(await ui.find({ type: 'Text', text: '🟢' })).toBeDefined()
    expect(await ui.find({ type: 'Button' })).toBeUndefined()
    await ui.unmount()
  }
})

test('band: set segments and spec checkpoint, both with painel (A22)', async ($: any, on: any) => {
  const valores: Record<string, unknown> = { maestroFaixaDados: FD({ papel: 'conjunto', titulo: 'C03', status: 'C03 · Em implementação · 1/2 specs', segmentos: ['d', 'w'], feitos: { n: 1, total: 2 } }) }
  const m = montar(on, {})
  m.servirEstado = valores
  await iniciar($)
  let ui: any = await banda($, 'desktop')
  expect((await ui.findAll({ type: 'Svg' })).map((s: any) => s.props.alt)).toContain('1 de 2 specs em DONE')
  expect(await ui.find({ type: 'Text', text: '1 de 2 specs em DONE' })).toBeDefined()
  expect(await ui.find({ key: 'painel' })).toBeDefined()
  await ui.unmount()
  ui = await banda($, 'terminal')
  expect((await ui.findAll({ type: 'Text', text: /^■$/ })).map((q: any) => q.props.color)).toEqual(['success', 'claude'])
  await ui.unmount()
  valores.maestroFaixaDados = FD({ papel: 'spec', titulo: 'C03-S01', status: 'TASK 3/7' })
  ui = await banda($, 'desktop')
  const p = partesDaFaixa(await ui.drawn())
  expect([p.titulo, p.status, p.direita]).toEqual(['C03-S01', 'TASK 3/7', ['[1] painel']])
  await ui.unmount()
})

test('band: idle reads maestro and nenhuma execução aqui, nunca and ativar, no NOVARC rules line (A23)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  for (const surface of SUP) {
    const ui = await banda($, surface)
    const p = partesDaFaixa(await ui.drawn())
    expect([p.titulo, p.status, p.direita]).toEqual(['maestro', 'nenhuma execução aqui', ['nunca neste projeto', '[1] ativar']])
    expect((await ui.find({ key: 'nunca' }))?.props.variant).toBe('secondary')
    expect((await ui.find({ key: 'ativar' }))?.props.hotkey).toBe('1')
    expect(await ui.find({ type: 'Text', text: /regras NOVARC/ })).toBeUndefined()
    await ui.unmount()
  }
})

// ---- the pane frame (R8-R13, R25-R32, R45, R51)

const PANE = { plugin: 'novarc', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 120 } } as const
const PLANO_V2 = { projeto: { nomeCurto: 'Maestro v2' }, conjuntos: [{ id: 'C03', titulo: 'Guardas' }], specs: [] }
const ctx = (papel: string | null, extra: Record<string, unknown> = {}) => ({ artefato: 'https://claude.ai/artifact/X', plano: PLANO_V2, conjunto: null, spec: null, papel, ...extra })
const LEIT = (o: Record<string, unknown> = {}) => ({ at: Date.now() - 40_000, falhou: false, fonte: null, falhas: { planejamento: false, registro: false }, ...o })
const ALS = (n: number, extra: Record<string, unknown> = {}) => ({ lista: Array.from({ length: n }, (_, i) => ({ chave: `a${i}`, texto: `alerta ${i}`, toast: '', nivel: 'erro', at: 0 })), alertasVistos: [], sweep: null, limiares: { calado: 15, lockOrfao: 20 }, olhares: 0, ...extra })
const ORQ = { papel: 'orquestrador', ledgerDir: null, forks: {} }
const PEND_V = (o: Record<string, unknown> = {}) => ({ itens: [], repo: null, resumo: null, contador: null, divergencias: [], falhas: { plano: false, repo: false, ledger: false }, fases: [], ...o })

async function painel($: any, surface: 'desktop' | 'terminal', bodyColumns = 120) {
  return $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
}
const svgs = async (ui: any) => (await ui.findAll({ type: 'Svg' })).map((s: any) => s.props)

test('pane order: header 1200x60, strip, seções band, tab row, trail band, body; focus per role (A8, A9, A10)', async ($: any, on: any) => {
  const m = montar(on, {})
  const lock = { spec: 'C03-S01', kind: 'migration', resource: 'x', desde: new Date().toISOString(), estado: 'UNGRANTED', minutos: 21, orfao: true }
  const itens = Array.from({ length: 5 }, (_, i) => ({ ref: `r${i}`, fonte: 'plano', quem: 'socio', titulo: `p${i}`, status: 'OPEN', fase: null, at: null }))
  const v: Record<string, unknown> = {
    ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [],
    maestroAlertas: ALS(0, { vista: { locks: [lock], slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null } }),
    maestroPendencias: PEND_V({ itens }),
  }
  m.servirEstado = v
  await iniciar($)
  const ui = await painel($, 'desktop')
  const raiz: any = await ui.drawn()
  const [cab, faixa, d1, abas, d2] = raiz.children
  expect([cab.type, cab.props.width, cab.props.height]).toEqual(['Svg', 1200, 60])
  expect(cab.props.alt.startsWith('NovArc Maestro · Maestro v2 · toda a execução')).toBe(true)
  expect(faixa.type).toBe('Box')
  expect([d1.type, d1.props.width, d1.props.height, d1.props.alt]).toEqual(['Svg', 1200, 20, '🧭 seções'])
  expect(String(d1.props.source)).toContain('1 a 4 trocam de aba com o painel em foco')
  expect((await ui.findAll({ type: 'Button' })).filter((b: any) => /^t-/.test(b.key)).map((b: any) => [b.key, b.props.hotkey])).toEqual([['t-agora', '1'], ['t-exec', '2'], ['t-locks', '3'], ['t-pend', '4']])
  expect(abas.type).toBe('Box')
  expect(d2.props.alt.startsWith('Maestro v2 › ')).toBe(true)
  const contas = (await ui.findAll({ type: 'Text' })).filter((t: any) => t.props.color === 'error' && t.props.bold).map((t: any) => t.text)
  expect(contas).toEqual([' 1', ' 5'])
  await ui.unmount()
  v.ctx = ctx('conjunto', { conjunto: 'C03' })
  v.exec = { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: {} }
  let u2: any = await painel($, 'desktop')
  expect((await svgs(u2))[0].alt.startsWith('NovArc Maestro · foco: conjunto C03')).toBe(true)
  expect(await u2.find({ key: 't-pend' })).toBeUndefined()
  expect(String((await svgs(u2))[2].source)).toContain('1 a 3 trocam de aba')
  await u2.unmount()
  v.exec = { papel: 'spec', conjunto: 'C03', spec: 'C03-S01', ledgerDir: null, forks: {} }
  u2 = await painel($, 'desktop')
  expect((await svgs(u2))[0].alt.startsWith('NovArc Maestro · foco: spec C03-S01')).toBe(true)
  expect(String((await svgs(u2))[2].source)).toContain('1 a 3 trocam de aba')
  await u2.unmount()
})

test('a stored tab the role does not draw falls back to Agora', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { exec: { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: {} }, maestroAba: 'pendencias', maestroOutras: [] }
  await iniciar($)
  const ui = await painel($, 'terminal')
  expect((await ui.find({ key: 't-agora' }))?.props.variant).toBe('primary')
  await ui.unmount()
})

const trilhaSvg = async (ui: any) => (await svgs(ui)).find((s: any) => String(s.alt).startsWith('Maestro v2 › '))

test('trail band: live dot and 40 s, 2 min, the planning warning, the set id on Execução (A11)', async ($: any, on: any) => {
  expect([haQuanto(40_000), haQuanto(130_000)]).toEqual(['40 s', '2 min'])
  const m = montar(on, {})
  const v: Record<string, unknown> = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAba: 'locks' }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  let t = await trilhaSvg(ui)
  expect(t.source).toContain('Maestro v2 › 🔒 Locks e filas')
  expect(t.source).toMatch(/ao vivo · atualizado há 4\d s/)
  expect(t.source).toContain('<circle')
  await ui.unmount()
  v.maestroLeitura = LEIT({ falhou: true, fonte: 'planejamento', falhas: { planejamento: true, registro: false } })
  ui = await painel($, 'desktop')
  t = await trilhaSvg(ui)
  expect(t.source).toContain('⚠️ sem conexão com o planejamento')
  expect(t.source).not.toContain('<circle')
  await ui.unmount()
  v.ctx = ctx('conjunto', { conjunto: 'C03' })
  v.exec = { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: {} }
  v.maestroAba = 'execucao'
  ui = await painel($, 'desktop')
  expect((await trilhaSvg(ui)).source).toContain('› ▶️ Execução › C03')
  await ui.unmount()
})

test('bell: header pill count, strip Button text and variant, press routing and toast (A24, A25, A26)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v: Record<string, unknown> = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAlertas: ALS(2), maestroPendencias: PEND_V({ contador: { n: 2, fase: 'f6' }, divergencias: [{}] }) }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  expect((await svgs(ui))[0].source).toContain('🔔 5')
  expect((await ui.find({ key: 'sino' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'sino' }))?.text).toBe('🔔 5 alertas')
  await ui.press({ key: 'sino' })
  expect(escrito(m, 'maestroAba')).toBe('locks')
  await ui.unmount()
  v.maestroAlertas = ALS(1)
  v.maestroPendencias = null
  ui = await painel($, 'desktop')
  expect((await ui.find({ key: 'sino' }))?.text).toBe('🔔 1 alerta')
  await ui.unmount()
  v.maestroAlertas = ALS(0)
  v.maestroPendencias = PEND_V({ contador: { n: 2, fase: 'f6' } })
  ui = await painel($, 'desktop')
  await ui.press({ key: 'sino' })
  expect(escrito(m, 'maestroAba')).toBe('pendencias')
  await ui.unmount()
  v.maestroPendencias = null
  ui = await painel($, 'desktop')
  expect((await svgs(ui))[0].source).toContain('🔔 0')
  expect((await ui.find({ key: 'sino' }))?.text).toBe('🔔 sem alertas')
  expect((await ui.find({ key: 'sino' }))?.props.variant).toBe('secondary')
  await ui.press({ key: 'sino' })
  expect(m.toasts).toContain('nenhum alerta agora')
  await ui.unmount()
  v.exec = { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: {} }
  v.maestroAlertas = ALS(2)
  ui = await painel($, 'desktop')
  expect((await ui.find({ key: 'sino' }))?.text).toBe('🔔 2')
  await ui.unmount()
})

test('set and spec mode strip: MODO, │, the seal, the bell, no mode Button (A47)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { ctx: ctx('conjunto', { conjunto: 'C03' }), exec: { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: {} }, maestroLeitura: LEIT(), maestroOutras: [], maestroAlertas: ALS(2) }
  await iniciar($)
  for (const surface of SUP) {
    const ui = await painel($, surface)
    expect(await ui.find({ type: 'Text', text: 'MODO' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '│' }))?.props.color).toBe('promptBorder')
    if (surface === 'desktop') expect((await svgs(ui)).find((s: any) => s.alt === 'manual · definido na orquestradora')?.height).toBe(18)
    else expect(await ui.find({ type: 'Text', text: ' [manual · definido na orquestradora] ' })).toBeDefined()
    expect((await ui.find({ key: 'sino' }))?.text).toBe('🔔 2')
    expect(await ui.find({ type: 'Button', text: /Manual/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('state cards: loading registry, empty registry, empty Execução (A27, A28)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v: Record<string, unknown> = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT({ at: null }), maestroOutras: null }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  for (const t of ['⏳', 'Lendo…', 'lendo o registro…']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  expect((await svgs(ui)).some((s: any) => s.alt === 'carregando')).toBe(true)
  expect((await trilhaSvg(ui)).source).toContain('⏳ lendo…')
  await ui.unmount()
  v.maestroOutras = []
  ui = await painel($, 'terminal')
  for (const t of ['📭', 'Nada aqui ainda', 'Nenhuma execução ativa na máquina.']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  await ui.unmount()
  v.maestroAba = 'execucao'
  ui = await painel($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'Nenhuma sessão de spec vista ainda.' })).toBeDefined()
  await ui.unmount()
})

test('failed first poll with no snapshot: the error card; tentar re-reads the plan once; registry-only failure draws no card (A29)', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  m.db = { 'execucao/C01': { data: { iniciadoEm: 'x' }, version: 1 } }
  m.semBanco = true
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: 'orquestrar https://claude.ai/artifact/TESTE' })
  await $.command.run?.({ command: 'maestro', args: '' })
  let ui: any = await painel($, 'desktop')
  await ui.press({ key: 't-exec' })
  for (const t of ['⚠️', 'Não consegui ler o banco do planejamento', 'o painel mostra o último estado salvo; nada foi perdido']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  expect((await ui.find({ key: 'tentar' }))?.props.variant).toBe('primary')
  const listas = () => (m.tools as any[]).filter(t => t.tool === 'ArtifactData' && t.action === 'list').length
  const escritas = () => (m.tools as any[]).filter(t => t.tool === 'ArtifactData' && t.action !== 'list' && t.action !== 'get').length
  const [l0, w0] = [listas(), escritas()]
  m.semBanco = false
  await ui.press({ key: 'tentar' })
  expect(listas() - l0).toBe(3)
  expect(escritas()).toBe(w0)
  expect(await ui.find({ type: 'Text', text: 'Não consegui ler o banco do planejamento' })).toBeUndefined()
  await ui.unmount()
  m.servirEstado = { maestroLeitura: LEIT({ falhou: true, fonte: 'registro', falhas: { planejamento: false, registro: true } }) }
  ui = await painel($, 'desktop')
  await ui.press({ key: 't-exec' })
  expect(await ui.find({ type: 'Text', text: 'Não consegui ler o banco do planejamento' })).toBeUndefined()
  expect((await svgs(ui)).some((s: any) => String(s.source).includes('⚠️ registro não lido'))).toBe(true)
  await ui.unmount()
})

test('a set session whose refresh read worked but whose first specs read failed still draws the error card (Task 8 fix)', async ($: any, on: any) => {
  const m = montar(on, {}, 'main', true)
  m.db = { 'execucao/C01': { data: { iniciadoEm: 'x' }, version: 1 } }
  m.falharTool = e => e.tool === 'ArtifactData' && e.action === 'list' && e.collection === 'specs'
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: 'conjunto https://claude.ai/artifact/TESTE C01' })
  await quieto(m)
  const ui: any = await painel($, 'desktop')
  await ui.press({ key: 't-exec' })
  expect(await ui.find({ type: 'Text', text: 'Não consegui ler o banco do planejamento' })).toBeDefined()
  await ui.unmount()
})

test('a fork with eventos null draws the render error card, the Pane handler does not throw (A42)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { exec: { papel: 'conjunto', conjunto: 'C03', ledgerDir: null, forks: { x: { slug: 'x', eventos: null } } }, maestroAba: 'execucao', maestroOutras: [] }
  await iniciar($)
  const ui = await painel($, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'O painel não conseguiu desenhar' })).toBeDefined()
  expect(m.logs.some(l => l.includes('painel falhou'))).toBe(true)
  await ui.unmount()
})

test('Execução on desktop: one interactive table per block with step labels and real tips; terminal keeps text cells (A13)', async ($: any, on: any) => {
  const m = montar(on, {})
  const t = (h: number, mm: number) => new Date(2026, 9, 25, h, mm).getTime()
  m.servirEstado = {
    ctx: ctx('conjunto', { conjunto: 'C03' }), maestroAba: 'execucao', maestroOutras: [],
    exec: { papel: 'conjunto', conjunto: 'C03', ledgerDir: 'L', forks: {
      'c03-s01': { slug: 'c03-s01', spec: 'C03-S01', eventos: [{ tipo: 'READY', texto: '', at: t(13, 0) }, { tipo: 'PLAN', texto: '', at: t(13, 5) }, { tipo: 'CODEX', texto: '', at: t(13, 10) }, { tipo: 'SURFACES', texto: '', at: t(13, 15) }, { tipo: 'TASK', texto: '1/3', at: t(13, 20) }] },
      'c03-s02': { slug: 'c03-s02', spec: 'C03-S02', eventos: [{ tipo: 'READY', texto: '', at: t(13, 30) }] },
    } },
  }
  await iniciar($)
  const ui = await painel($, 'desktop')
  const tb = (await svgs(ui)).find((s: any) => s.alt === 'etapas das specs de C03')
  expect(tb?.isInteractive).toBe(true)
  for (const x of ['SURF', 'PUSH', 'C03-S01', 'entrou 13:20']) expect(String(tb?.source)).toContain(x)
  expect(await ui.find({ type: 'Text', text: /^C03 · Guardas$/ })).toBeDefined()
  await ui.unmount()
  const u2 = await painel($, 'terminal')
  expect(await u2.find({ type: 'Text', text: /^C03-S01$/ })).toBeDefined()
  expect(await u2.find({ type: 'Svg' })).toBeUndefined()
  await u2.unmount()
})

// ---- Locks e filas (R13, R15, R16, R28, R29, R31; A5, A12, A14, A15, A28, A30)

const VISTA = (o: Record<string, unknown> = {}) => ({ locks: [], slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null, ...o })
const LOCK = (o: Record<string, unknown>) => ({ spec: 'C03-S01', kind: 'migration', resource: '20261023_auditoria', desde: new Date(2026, 9, 25, 13, 20).toISOString(), estado: 'UNGRANTED', minutos: 21, orfao: true, ...o })
const SWEEP = (o: Record<string, unknown> = {}) => ({ marcador: 'x', linhas: [], at: 0, semLeitura: false, ...o })

test('Locks: KPIs, the orphan card with its hold bar and tint, a calm card (A12, A14)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v: Record<string, unknown> = {
    ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAba: 'locks',
    maestroAlertas: ALS(1, { vista: VISTA({ locks: [LOCK({})], unidades: [{ unidade: 'C04', minutos: 30, calada: true }] }) }),
  }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  const k1 = await ui.find({ key: 'lk-1' })
  expect(k1?.text).toContain('🔒')
  expect(k1?.text).toContain('1')
  expect((await ui.find({ key: 'lk-2' }))?.text).toContain('lock órfão')
  expect((await ui.find({ key: 'lk-3' }))?.text).toContain('sessão calada')
  const card = await ui.find({ key: 'l-0' })
  expect([card?.props.borderColor, card?.props.backgroundColor]).toEqual(['error', 'diffRemovedDimmed'])
  for (const t of ['🗄️', '20261023_auditoria', 'migration', 'C03-S01']) expect(card?.text).toContain(t)
  expect((await ui.find({ type: 'Text', text: '20261023_auditoria' }))?.props.bold).toBe(true)
  const barra = (await svgs(ui)).find((s: any) => s.alt === 'tempo segurado')
  expect(String(barra?.source)).toContain('<title>C03-S01 segura desde 13:20 · vira órfão aos 20 min</title>')
  expect((await ui.find({ type: 'Text', text: '21 min sem RELEASE' }))?.props.color).toBe('error')
  expect((await svgs(ui)).some((s: any) => s.alt === 'calada' && s.height === 18)).toBe(true) // A5
  await ui.unmount()
  v.maestroAlertas = ALS(0, { vista: VISTA({ locks: [LOCK({ minutos: 4, orfao: false }), LOCK({ resource: 'b', minutos: 2, orfao: false })] }) })
  ui = await painel($, 'terminal')
  expect((await ui.find({ type: 'Text', text: 'segura há 4 min' }))?.props.color).toBe('subtle')
  expect((await ui.find({ key: 'l-0' }))?.props.borderColor).toBe('promptBorder')
  expect((await ui.find({ key: 'lk-1' }))?.text).toContain('2')
  expect((await ui.find({ key: 'lk-2' }))?.text).toContain('nenhum lock órfão')
  expect((await ui.find({ key: 'lk-3' }))?.text).toContain('todas dando sinal')
  await ui.unmount()
})

test('Locks: sections in order, slot cards, usar-medido only in the orchestrator, the mirror line in a set (A15, A5)', async ($: any, on: any) => {
  const m = montar(on, {})
  const desde = new Date(Date.now() - 25 * 60_000).toISOString()
  const slots = { verify: { dono: { conjunto: 'C03', branch: 'feat/c03-s01-guardas-diretivas-auditoria-20261023', desde }, fila: [{ conjunto: 'C04', branch: 'x', desde }] }, producao: { dono: null, fila: [] } }
  const v: Record<string, unknown> = {
    ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAba: 'locks',
    maestroAlertas: ALS(0, { vista: VISTA({ slots, unidades: [{ unidade: 'C03', minutos: 3, calada: false }], proposta: { calado: 18, lockOrfao: 24, amostras: 6, at: 'x' } }) }),
  }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'desktop')
  const caps = (await ui.findAll({ type: 'Text' })).filter((t: any) => t.props.size === 'caption').map((t: any) => t.text)
  const ordem = ['RECURSOS', 'FILAS DA ORQUESTRADORA', 'SINAIS DAS SESSÕES', 'LIMIARES'].map(c => caps.indexOf(c))
  expect(ordem.every((x, i) => x >= 0 && (i === 0 || x > ordem[i - 1]!))).toBe(true)
  expect(await ui.find({ type: 'Text', text: 'verify  C03  25 min' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'fila: C04' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'producao  livre' })).toBeDefined()
  expect((await ui.find({ key: 'usar-medido' }))?.props.variant).toBe('secondary')
  expect((await svgs(ui)).some((s: any) => s.alt === 'ok')).toBe(true)
  expect(caps).toContain('CALADA')
  expect(caps).toContain('ÓRFÃO')
  await ui.unmount()
  v.ctx = ctx('conjunto', { conjunto: 'C03' })
  v.exec = { papel: 'conjunto', conjunto: 'C03', ledgerDir: 'L', forks: {} }
  v.maestroAlertas = ALS(0, { sweep: SWEEP(), vista: VISTA({ espelhadoEm: Date.now() - 12_000, proposta: { calado: 18, lockOrfao: 24, amostras: 6, at: 'x' } }) })
  ui = await painel($, 'terminal')
  expect(await ui.find({ type: 'Text', text: /^🔁 espelhado no planejamento há 1[12] s$/ })).toBeDefined()
  expect(await ui.find({ key: 'usar-medido' })).toBeUndefined()
  await ui.unmount()
})

test('Locks: no lock draws the empty card in recursos and still LIMIARES; first sweep pending is the loading card; a sweep with no reading is the warning card (A27, A28, A30)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v: Record<string, unknown> = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAba: 'locks', maestroAlertas: ALS(0, { vista: VISTA() }) }
  m.servirEstado = v
  await iniciar($)
  let ui: any = await painel($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'Nenhum lock aberto.' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'LIMIARES' })).toBeDefined()
  await ui.unmount()
  v.exec = { papel: 'conjunto', conjunto: 'C03', ledgerDir: 'L', forks: {} }
  v.maestroAlertas = ALS(0)
  ui = await painel($, 'terminal')
  expect(await ui.find({ type: 'Text', text: 'varrendo o ledger…' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Lendo…' })).toBeDefined()
  await ui.unmount()
  v.maestroAlertas = ALS(0, { sweep: SWEEP({ semLeitura: true }), vista: VISTA({ locks: [LOCK({ orfao: false, minutos: 3 })] }) })
  ui = await painel($, 'desktop')
  expect((await ui.find({ key: 'falha' }))?.props.borderColor).toBe('warning')
  expect(await ui.find({ type: 'Text', text: 'varredura sem leitura' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '20261023_auditoria' })).toBeDefined()
  await ui.unmount()
})

// ---- Pendências with a prepared state (R17, R18, R28, R31)

test('Pendências: loading card, and a failed repository read is one warning card above the columns (A27, A30)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroPendencias: null, maestroAba: 'pendencias' }
  await iniciar($)
  let u2: any = await painel($, 'terminal')
  expect(await u2.find({ type: 'Text', text: 'lendo pendências…' })).toBeDefined()
  await u2.unmount()
  m.servirEstado = { ...m.servirEstado, maestroPendencias: PEND_V({ falhas: { plano: false, repo: true, ledger: false } }) }
  u2 = await painel($, 'terminal')
  expect((await u2.find({ key: 'p-falhas' }))?.props.borderColor).toBe('warning')
  expect(await u2.find({ type: 'Text', text: 'repositório não lido' })).toBeDefined()
  expect(await u2.find({ type: 'Text', text: /^🙋 você ou o cliente · 0$/ })).toBeDefined()
  await u2.unmount()
})

test('Pendências pills: divergente with the error border, enviada ao cliente (A17)', async ($: any, on: any) => {
  const m = montar(on, {})
  const item = (o: Record<string, unknown>) => ({ ref: 'p-x', fonte: 'plano', quem: 'socio', titulo: 'Q', status: 'OPEN', fase: null, at: null, texto: 'q', ...o })
  m.servirEstado = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroAba: 'pendencias', maestroPendencias: PEND_V({ itens: [item({ alerta: true, alertaTexto: 'difere do repositório' }), item({ ref: 'p-y', enviada: { at: 'x', by: 'W' } })] }) }
  await iniciar($)
  const ui = await painel($, 'desktop')
  const alts = (await ui.findAll({ type: 'Svg' })).map((s: any) => s.props.alt)
  expect(alts).toContain('divergente')
  expect(alts).toContain('enviada ao cliente')
  expect((await ui.find({ key: 'socio-p-x' }))?.props.borderColor).toBe('error')
  await ui.unmount()
})

// ---- cross-cutting sweeps (A2, A3, A7, A41, A43, A45, A46)

const TEMA = new Set(['text', 'subtle', 'inactive', 'promptBorder', 'success', 'error', 'warning', 'suggestion', 'claude', 'diffAddedDimmed', 'diffRemovedDimmed', 'inverseText'])
const CORES = new Set(['#5b8def', '#6cba7e', '#a48be0', '#d9a157', '#5fb3b3', '#e08b8b', '#b8a46b', '#8fa0c8', '#c58bd0'])
const PASSOS = new Set(['xs', 'sm', 'md', 'lg'])
const ESPACO = ['gap', 'padding', 'paddingX', 'paddingY', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom', 'margin', 'marginX', 'marginY', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom']

/** Every color prop a theme key; a set color only on a stripe (width 0.3 or 1) or a set card border (R3, A3); no numeric spacing (R7, A7). */
function regras(raiz: any): string[] {
  const erros: string[] = []
  for (const n of todos(raiz)) {
    const p = n.props ?? {}
    for (const c of ['color', 'backgroundColor', 'borderColor']) {
      const v = p[c]
      if (v === undefined) continue
      if (TEMA.has(v)) continue
      const listra = c === 'backgroundColor' && n.type === 'Box' && (p.width === 0.3 || p.width === 1)
      const cartao = c === 'borderColor' && n.type === 'Box'
      if (CORES.has(v) && (listra || cartao)) continue
      erros.push(`${n.type}.${c}=${v}`)
    }
    for (const e of ESPACO) if (p[e] !== undefined && !PASSOS.has(p[e])) erros.push(`${n.type}.${e}=${p[e]}`)
  }
  return erros
}
const altsVazios = (raiz: any) => todos(raiz).filter(n => n.type === 'Svg' && !String(n.props?.alt ?? '').trim())

const AGORA2 = Date.now()
const reg = (o: Record<string, unknown>) => ({ cwd: 'C:/repo', titulo: 't', papel: null, forks: 0, feitos: 0, alerta: null, at: AGORA2, codigo: 'NOVARC-PLUGIN-MAESTRO', ...o })
/** An orchestrator of 3 sets with 7 lanes each (21), 50 locks and 230 pendings, in prepared state. */
function grande(): Record<string, unknown> {
  const outras: any[] = [reg({ sessao: 'sess-1', papel: 'orquestrador' })]
  const porDir: Record<string, any> = {}
  for (const C of ['C01', 'C02', 'C03']) {
    const dir = `L/${C}`
    outras.push(reg({ sessao: `set-${C}`, papel: 'conjunto', conjunto: C, ledgerDir: dir }))
    const forks: Record<string, any> = {}
    for (let s = 1; s <= 7; s++) {
      const S = `${C}-S0${s}`
      forks[S.toLowerCase()] = { slug: S.toLowerCase(), spec: S, eventos: [{ tipo: 'READY', texto: 'TASK 3/7 token ghp_abc123XYZ exposto', at: AGORA2 - 600_000 }, { tipo: 'TASK', texto: '3/7 token ghp_abc123XYZ exposto', at: AGORA2 - 60_000 }] }
    }
    porDir[dir] = { papel: 'conjunto', ledgerDir: dir, forks }
  }
  const locks = Array.from({ length: 50 }, (_, i) => ({ spec: 'C01-S01', kind: 'file', resource: `res-${i}.sql`, desde: new Date(AGORA2 - i * 60_000).toISOString(), estado: 'UNGRANTED', minutos: i, orfao: i >= 20 }))
  const itens = Array.from({ length: 230 }, (_, i) => ({ ref: `p-${i}`, fonte: 'plano', quem: i % 2 ? 'socio' : 'pre-fechamento', titulo: `Qual a UF de custo do Danilo? ${i}`, status: 'OPEN', fase: null, at: null, texto: 'Qual a UF de custo do Danilo?' }))
  return {
    ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: outras, maestroPorDir: porDir,
    maestroAlertas: ALS(2, { vista: VISTA({ locks }) }), maestroPendencias: PEND_V({ itens }),
  }
}

test('every role and tab mounts on both surfaces: no blank alt, theme keys only, named spacing (A2, A3, A7)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v: Record<string, unknown> = grande()
  m.servirEstado = v
  await iniciar($)
  const papeis: [string, Record<string, unknown>][] = [
    ['orquestrador', {}],
    ['conjunto', { ctx: ctx('conjunto', { conjunto: 'C01' }), exec: { ...(v.maestroPorDir as any)['L/C01'], conjunto: 'C01' }, maestroAlertas: ALS(1, { sweep: SWEEP(), vista: VISTA({ espelhadoEm: AGORA2 }) }) }],
    ['spec', { ctx: ctx('spec', { conjunto: 'C01', spec: 'C01-S01' }), exec: { papel: 'spec', conjunto: 'C01', spec: 'C01-S01', ledgerDir: null, forks: {} } }],
    ['ocioso', { ctx: null, exec: { papel: null, ledgerDir: null, forks: {} } }],
  ]
  for (const [papel, extra] of papeis) {
    m.servirEstado = { ...v, ...extra }
    for (const surface of SUP) {
      for (const larg of [61, 120]) {
        for (const aba of ['agora', 'execucao', 'locks', 'pendencias']) {
          m.servirEstado.maestroAba = aba
          const ui = await painel($, surface, larg)
          const raiz = await ui.drawn()
          expect({ papel, surface, aba, larg, alt: altsVazios(raiz).length, regras: regras(raiz) }).toEqual({ papel, surface, aba, larg, alt: 0, regras: [] })
          await ui.unmount()
        }
      }
      m.servirEstado.maestroFaixaDados = FD({ papel: papel === 'ocioso' ? null : papel, titulo: 'x', status: 'y', alertas: ['a', 'b'], segmentos: ['d', 'w', 'b'], feitos: { n: 1, total: 3 } })
      const b = await banda($, surface)
      const raizB = await b.drawn()
      expect({ papel, surface, alt: altsVazios(raizB).length, regras: regras(raizB) }).toEqual({ papel, surface, alt: 0, regras: [] })
      await b.unmount()
      delete m.servirEstado.maestroFaixaDados
    }
  }
  const t = await $.ui.mount({ plugin: 'novarc', surface: 'desktop', component: 'ToolUse', props: { tool: 'Bash', input: { command: 'x' }, isRunning: true } } as any)
  const raizT = await t.drawn()
  expect([altsVazios(raizT).length, regras(raizT)]).toEqual([0, []])
  await t.unmount()
})

test('old C01/C02 state shapes draw: the band reads NOVARC and ativo, Locks reads with an empty vista (A41)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = {
    exec: { papel: 'orquestrador', ledgerDir: null, forks: {} }, maestroOutras: [],
    maestroAlertas: { lista: [], alertasVistos: [], sweep: null, limiares: { calado: 15, lockOrfao: 20 }, olhares: 3 },
    maestroFaixaDados: { papel: 'orquestrador', rotulo: 'orquestrando', texto: '2 conjuntos vivos', extra: null, quadrados: [], alerta: null, nOutras: 0, verde: null, pend: null, txt: null },
  }
  await iniciar($)
  for (const surface of SUP) {
    const b = await banda($, surface)
    const p = partesDaFaixa(await b.drawn())
    expect([p.titulo, p.status]).toEqual(['NOVARC', 'ativo'])
    await b.unmount()
    m.servirEstado.maestroAba = 'locks'
    const ui = await painel($, surface)
    expect(await ui.find({ type: 'Text', text: 'Nenhum lock aberto.' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'O painel não conseguiu desenhar' })).toBeUndefined()
    await ui.unmount()
  }
})

test('24 lanes in one block draw 3 tables of at most 10 lanes, each under 131072 (A43)', async ($: any, on: any) => {
  const m = montar(on, {})
  const forks: Record<string, any> = {}
  for (let s = 1; s <= 24; s++) {
    const S = `C03-S${String(s).padStart(2, '0')}`
    forks[S.toLowerCase()] = { slug: S.toLowerCase(), spec: S, eventos: [{ tipo: 'READY', texto: '', at: AGORA2 - 60_000 }, { tipo: 'TASK', texto: '1/2', at: AGORA2 }] }
  }
  m.servirEstado = { ctx: ctx('conjunto', { conjunto: 'C03' }), exec: { papel: 'conjunto', conjunto: 'C03', ledgerDir: 'L', forks }, maestroAba: 'execucao', maestroOutras: [] }
  await iniciar($)
  const ui = await painel($, 'desktop')
  const tabelas = (await svgs(ui)).filter((s: any) => s.alt === 'etapas das specs de C03')
  // MAX_RAIAS cuts at 21: 10 + 10 + 1, and `mais 3`
  expect(tabelas.length).toBe(3)
  for (const t of tabelas) expect(String(t.source).length).toBeLessThan(131_072)
  expect(await ui.find({ type: 'Text', text: 'mais 3' })).toBeDefined()
  await ui.unmount()
})

test('20 redraws with unchanged state: median under 30 ms, the 3 lane tables unchanged (A45)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { ...grande(), maestroAba: 'execucao' }
  await iniciar($)
  const ui = await painel($, 'desktop')
  const fontes = async () => (await svgs(ui)).filter((s: any) => String(s.alt).startsWith('etapas das specs de ')).map((s: any) => s.source)
  const antes = await fontes()
  expect(antes.length).toBe(3)
  const tempos: number[] = []
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now()
    await ui.redraw()
    tempos.push(performance.now() - t0)
  }
  tempos.sort((a, b) => a - b)
  expect(tempos[10]!).toBeLessThan(30)
  // the plugin's memo runs in the plugin's own module copy, out of this file's reach: the build count is proved by
  // desenho.test (memo builds once per distinct argument list); here the tables come back unchanged
  expect(await fontes()).toEqual(antes)
  await ui.unmount()
})

test('no Svg alt or source carries a credential, checkpoint free text, question text or a session id (A46)', async ($: any, on: any) => {
  const m = montar(on, {})
  const v = grande()
  m.servirEstado = v
  await iniciar($)
  for (const aba of ['agora', 'execucao', 'locks', 'pendencias']) {
    m.servirEstado.maestroAba = aba
    const ui = await painel($, 'desktop')
    for (const s of await svgs(ui)) {
      const txt = `${s.alt}\n${s.source}`
      for (const proibido of ['ghp_', 'exposto', 'UF de custo', 'sess-1', 'set-C01']) expect({ aba, proibido, achou: txt.includes(proibido) }).toEqual({ aba, proibido, achou: false })
    }
    await ui.unmount()
  }
})

// ---- C03-S01 Task 10: directive state on the pane and the band (R52, R53; A33, A41, A54, A55)

const sel = (x: number | string) => new Date(x).toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '').toLowerCase()
const MAPA_T = (specs: Record<string, any> = {}) => ({ conjuntos: {}, specs, orquestrador: null, at: 0 })
const SPEC_T = (id: string) => ({ conjunto: id.slice(0, 3), nome: `novarc-NOVARC-PLUGIN-MAESTRO-${id}`, sessao: `s-${id}`, slug: `${id.toLowerCase()}-x`, agentId: null })

/** An orchestrator with an orphan lock (A18 shape) and a quiet set (A17 shape), the lock reminded at 13:40 and the status asked at 10:31. */
function cobrado(com: { lock?: boolean; status?: boolean } = { lock: true, status: true }): Record<string, unknown> {
  const agora = Date.now()
  const desde = new Date(agora - 32 * 60_000).toISOString()
  const calado = agora - 20 * 60_000
  const lock = LOCK({ spec: 'C03-S01', estado: 'GRANTED-NOT-RELEASED', desde, minutos: 32 })
  const lista = [
    { chave: `lock:C03-S01:migration:20261023_auditoria:${desde}`, texto: 'lock órfão em C03-S01', toast: '', nivel: 'erro', at: 0 },
    { chave: `calado:c02:${calado}`, texto: 'C02 calada', toast: '', nivel: 'erro', at: 0 },
  ]
  const envios: Record<string, unknown> = {}
  if (com.lock) envios[`lock-c03-s01-migration-20261023_auditoria-${sel(desde)}`] = { acao: 'LOCK-COBRADO', alvo: 'C03-S01', at: new Date(2026, 9, 25, 13, 40).getTime(), estado: 'enviado' }
  if (com.status) envios[`status-c02-${sel(calado)}-1`] = { acao: 'STATUS-PEDIDO', alvo: 'C02', at: new Date(2026, 9, 25, 10, 31).getTime(), estado: 'enviado' }
  return {
    ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [],
    maestroAlertas: ALS(0, { lista, vista: VISTA({ locks: [lock], unidades: [{ unidade: 'C02', minutos: 20, calada: true }] }) }),
    maestroMapa: MAPA_T({ 'C03-S01': SPEC_T('C03-S01') }),
    maestroEnvios: envios,
  }
}

test('Locks: the orphan card and the quiet card carry the time the orchestrator acted (A54)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { ...cobrado(), maestroAba: 'locks' }
  await iniciar($)
  const ui = await painel($, 'terminal')
  expect((await ui.find({ type: 'Text', text: '32 min sem RELEASE · o orquestrador cobrou às 13:40' }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: 'o orquestrador pediu status às 10:31' }))?.props.color).toBe('subtle')
  await ui.unmount()
  m.servirEstado = { ...cobrado({}), maestroAba: 'locks' }
  const sem = await painel($, 'terminal')
  expect(await sem.find({ type: 'Text', text: '32 min sem RELEASE' })).toBeDefined()
  expect(await sem.find({ type: 'Text', text: /orquestrador/ })).toBeUndefined()
  await sem.unmount()
})

test('Execução: the third KPI reads já cobrados only when every open alert has a send (A54)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = { ...cobrado(), maestroAba: 'execucao' }
  await iniciar($)
  let ui = await painel($, 'terminal')
  const k = await ui.find({ key: 'exk-3' })
  for (const t of ['🚨', '2', '1 lock órfão e 1 bloqueio · já cobrados']) expect(k?.text).toContain(t)
  expect(k?.text).not.toContain('pede atenção')
  await ui.unmount()
  m.servirEstado = { ...cobrado({ lock: true }), maestroAba: 'execucao' }
  ui = await painel($, 'terminal')
  expect((await ui.find({ key: 'exk-3' }))?.text).toContain('pede atenção')
  await ui.unmount()
})

test('a failed directive: the bell counts it, band line 2 leads with it in error (A55, R53)', async ($: any, on: any) => {
  const falhou = { 'status-c02-20261025t103100z-1': { acao: 'STATUS-PEDIDO', alvo: 'C02', at: Date.now() - 5000, estado: 'falhou' } }
  const velho = { 'status-c05-x-1': { acao: 'STATUS-PEDIDO', alvo: 'C05', at: Date.now() - 120_000, estado: 'enviando' }, 'go-x': { acao: 'GO', alvo: 'C01-S01', at: Date.now() - 1000, estado: 'enviando' } }
  const orq = { papel: 'orquestrador', ledgerDir: null, forks: {} } as any
  expect(semConfirmacao(falhou as any, Date.now()).map(e => e.alvo)).toEqual(['C02'])
  expect(semConfirmacao(velho as any, Date.now()).map(e => e.alvo)).toEqual(['C05']) // a send still running is not stale
  const f = dadosFaixa(orq, null, [], null, Date.now(), 'eu', [], [], null, semConfirmacao(falhou as any, Date.now()))
  expect(f.alertas).toEqual(['diretiva sem confirmação: STATUS-PEDIDO C02'])
  expect(f.nAlertas).toBe(1)
  expect(dadosFaixa({ ...orq, papel: 'conjunto' }, null, [], null, Date.now(), 'eu', [], [], null, semConfirmacao(falhou as any, Date.now())).nAlertas).toBe(0)
  const m = montar(on, {})
  m.servirEstado = { ctx: ctx('orquestrador'), exec: ORQ, maestroLeitura: LEIT(), maestroOutras: [], maestroEnvios: falhou, maestroAba: 'agora', maestroFaixaDados: f }
  await iniciar($)
  const ui = await painel($, 'terminal')
  expect((await ui.find({ key: 'sino' }))?.text).toContain('🔔 1 alerta')
  await ui.unmount()
  const b = await banda($, 'terminal')
  const t = await b.find({ type: 'Text', text: '🔴 diretiva sem confirmação: STATUS-PEDIDO C02' })
  expect([t?.props.color, t?.props.wrap]).toEqual(['error', 'truncate-end'])
  await b.unmount()
})

test('Locks: each unconfirmed directive is one error card, so the bell lands on its reason (final fix 10)', async ($: any, on: any) => {
  const falhou = {
    'status-c02-x-1': { acao: 'STATUS-PEDIDO', alvo: 'C02', at: Date.now() - 5000, estado: 'falhou' },
    'go-c03-s01-x': { acao: 'GO', alvo: 'C03-S01', at: Date.now() - 120_000, estado: 'enviando' },
    'go-ok': { acao: 'GO', alvo: 'C04-S01', at: Date.now() - 1000, estado: 'enviado' },
  }
  const m = montar(on, {})
  m.servirEstado = { ...cobrado({}), maestroEnvios: falhou, maestroAba: 'locks' }
  await iniciar($)
  for (const s of SUP) {
    const ui = await painel($, s)
    for (const t of ['🔴 diretiva sem confirmação: STATUS-PEDIDO C02', '🔴 diretiva sem confirmação: GO C03-S01']) {
      expect((await ui.find({ type: 'Text', text: t }))?.props.color).toBe('error')
    }
    expect(await ui.find({ type: 'Text', text: /C04-S01/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('Execução: each set card ends with its sessões block and the restored-addresses line (A33)', async ($: any, on: any) => {
  const m = montar(on, {})
  m.servirEstado = {
    ...grande(), maestroAba: 'execucao',
    maestroMapa: MAPA_T({ 'C02-S01': SPEC_T('C02-S01'), 'C02-S02': SPEC_T('C02-S02') }),
  }
  await iniciar($)
  const ui = await painel($, 'terminal')
  const c2 = await ui.find({ key: 'b-1' })
  expect(c2?.text.endsWith('endereços restaurados após compactação')).toBe(true)
  expect(c2?.text).toContain('SESSÕES')
  const linhas = (await ui.findAll({ type: 'Text' })).filter((t: any) => t.props.mono && String(t.text).startsWith('🔹')).map((t: any) => t.text)
  expect(linhas).toEqual(['🔹 novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', '🔹 novarc-NOVARC-PLUGIN-MAESTRO-C02-S02'])
  expect((await ui.find({ key: 'b-0' }))?.text).not.toContain('SESSÕES')
  expect((await ui.find({ type: 'Text', text: 'endereços restaurados após compactação' }))?.props.color).toBe('subtle')
  await ui.unmount()
})

test('the orchestrator pane has no element that sends a directive (A41, R35)', async ($: any, on: any) => {
  const m = montar(on, {})
  const enviadas: any[] = []
  m.entrega = e => (enviadas.push(e), { isDelivered: true })
  const itens = [{ ref: 'r1', fonte: 'plano', quem: 'pre-fechamento', titulo: 'p', status: 'OPEN', fase: null, at: null, spec: 'C03-S01', texto: 'x' }]
  const g: any = grande()
  m.servirEstado = { ...cobrado(), maestroOutras: g.maestroOutras, maestroPorDir: g.maestroPorDir, maestroPendencias: PEND_V({ itens }), maestroMapa: MAPA_T({ 'C02-S01': SPEC_T('C02-S01') }) }
  await iniciar($)
  await quieto(m)
  const antes = m.eventos.length
  let botoes = 0
  for (const surface of SUP) {
    for (const aba of ['agora', 'execucao', 'locks', 'pendencias']) {
      m.servirEstado.maestroAba = aba
      const ui = await painel($, surface)
      for (const b of await ui.findAll({ type: 'Button' })) {
        botoes++
        try { await b.props.onPress?.() } catch { /* a press may fail on a prepared state; only what it sends matters */ }
      }
      await ui.unmount()
    }
  }
  await quieto(m)
  expect(botoes).toBeGreaterThan(10)
  const novos = m.eventos.slice(antes).map(x => x.e)
  const linhas = novos.filter(e => typeof e?.text === 'string' && /^\s*(GO|HOLD|FECHA|LIBERA|RELEASE|LOCK|status)\b/i.test(e.text))
  expect({ enviadas: enviadas.length, linhas }).toEqual({ enviadas: 0, linhas: [] })
  expect(novos.filter(e => e && 'to' in e && typeof e.text === 'string')).toEqual([])
})
