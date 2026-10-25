import { expect, test } from 'claude-code/testing'

import { iniciar, montar, todos } from './mundo-teste'

// C11-S01: the NovArc rows and the chat cards (R33-R40), in a session with or without a run.

const TOOL = { tool: 'Bash', input: { command: 'npm test', description: 'rodando a suíte do C11-S01' }, isRunning: true, isErrored: false, isInterrupted: false }
const linha = (tipo: string, props: Record<string, unknown>, surface: 'desktop' | 'terminal' = 'desktop') => ({ plugin: 'novarc', surface, component: tipo, props }) as any
const logo = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((s: any) => s.props.alt === 'NovArc')
/** The engine's own drawing under next(e) in the test world. */
const nativo = async (ui: any) => !!(await ui.find({ type: 'Text', text: 'engine' })) || JSON.stringify(await ui.drawn()).includes('engine')

test('ToolUse: the turning logo, the tool and its target while running or prepared; the native row once it has a result (A31)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  const ui = await $.ui.mount(linha('ToolUse', TOOL))
  const l = await logo(ui)
  expect([l?.props.height, l?.props.isInteractive]).toEqual([16, true])
  expect((await ui.find({ type: 'Text', text: 'Bash' }))?.props.weight).toBe('semibold')
  expect((await ui.find({ type: 'Text', text: 'rodando a suíte do C11-S01' }))?.props.color).toBe('subtle')
  await ui.redraw({ ...TOOL, isRunning: false, output: { stdout: 'ok' } } as any)
  expect(await logo(ui)).toBeUndefined()
  expect(await nativo(ui)).toBe(true)
  await ui.redraw({ ...TOOL, isRunning: false, output: undefined } as any)
  expect(await logo(ui)).toBeDefined()
  await ui.unmount()
  const t = await $.ui.mount(linha('ToolUse', TOOL, 'terminal'))
  expect(await nativo(t)).toBe(true)
  await t.unmount()
})

test('ToolGroup: logo, the running call and +n feitas while active; native when expanded (A32)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  const G = { isActive: true, isExpanded: false, calls: [{ tool: 'Read', input: { file_path: 'a.ts' }, isRunning: false }, { tool: 'Grep', input: { pattern: 'TODO' }, isRunning: true }] }
  const ui = await $.ui.mount(linha('ToolGroup', G))
  expect(await logo(ui)).toBeDefined()
  for (const t of ['Grep', 'TODO', '+1 feitas']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  await ui.redraw({ ...G, isExpanded: true } as any)
  expect(await logo(ui)).toBeUndefined()
  await ui.unmount()
})

test('Spinner: logo and message plus suffix in suggestion on the desktop; native on the terminal (A33)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  const S = { message: 'Pensando', word: 'Pensando', suffix: '…' }
  const ui = await $.ui.mount(linha('Spinner', S))
  expect(await logo(ui)).toBeDefined()
  expect((await ui.find({ type: 'Text', text: 'Pensando…' }))?.props.color).toBe('suggestion')
  await ui.unmount()
  const t = await $.ui.mount(linha('Spinner', S, 'terminal'))
  expect(await logo(t)).toBeUndefined()
  await t.unmount()
})

test('the rows draw in a session with the band off and no run, making no data call (A34)', async ($: any, on: any) => {
  const m = montar(on, {})
  await iniciar($)
  await $.command.run?.({ command: 'maestro', args: 'desativar' })
  const n = m.eventos.length
  const rows = [linha('ToolUse', TOOL), linha('ToolGroup', { isActive: true, isExpanded: false, calls: [{ tool: 'Read', input: { file_path: 'a' }, isRunning: true }] }), linha('Spinner', { message: 'x', word: 'x', suffix: '…' })]
  for (const r of rows) {
    const ui = await $.ui.mount(r)
    expect(await logo(ui)).toBeDefined()
    await ui.unmount()
  }
  const dados = m.eventos.slice(n).map(x => x.e).filter(e => e && (('plugin' in e && 'key' in e) || 'path' in e || 'argv' in e || ('tool' in e && !('props' in e)) || ('key' in e && !('plugin' in e) && !('component' in e))))
  expect(dados).toEqual([])
})

test('UserMessage from another session is a card while the band is on; off or no from keeps the native row (A35)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  const U = { from: { name: 'novarc-omni-C03' }, text: 'DONE C03-S01 pronto', isExpanded: false }
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(linha('UserMessage', U, surface))
    const raiz: any = await ui.drawn()
    const card = todos(raiz).find(n => n.props?.borderStyle === 'round')
    expect(card?.props.borderColor).toBe('promptBorder')
    const listra = todos(card).find(n => n.type === 'Box' && n.props?.backgroundColor === 'suggestion')
    expect(listra?.props.width).toBe(surface === 'desktop' ? 0.3 : 1)
    expect(await ui.find({ type: 'Text', text: 'MENSAGEM DE NOVARC-OMNI-C03' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'DONE C03-S01 pronto' })).toBeDefined()
    await ui.unmount()
  }
  let ui: any = await $.ui.mount(linha('UserMessage', { ...U, from: undefined }))
  expect(await nativo(ui)).toBe(true)
  await ui.unmount()
  await $.command.run?.({ command: 'maestro', args: 'desativar' })
  ui = await $.ui.mount(linha('UserMessage', U))
  expect(await nativo(ui)).toBe(true)
  await ui.unmount()
})

test('CommandOutput of /maestro is a card with the short logo and MAESTRO; errored or another command is native (A36)', async ($: any, on: any) => {
  montar(on, {})
  await iniciar($)
  const C = { command: 'maestro', args: 'orquestrar', text: 'Painel aberto; esta sessão acompanha a execução.', isErrored: false }
  let ui: any = await $.ui.mount(linha('CommandOutput', C))
  expect((await logo(ui))?.props.height).toBe(14)
  expect((await ui.find({ type: 'Text', text: 'MAESTRO' }))?.props.color).toBe('claude')
  expect(await ui.find({ type: 'Text', text: C.text })).toBeDefined()
  await ui.unmount()
  for (const p of [{ ...C, isErrored: true }, { ...C, command: 'outro' }]) {
    ui = await $.ui.mount(linha('CommandOutput', p))
    expect(await nativo(ui)).toBe(true)
    await ui.unmount()
  }
})
