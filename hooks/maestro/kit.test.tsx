import { expect, test } from 'claude-code/testing'

import { kit } from './kit'

// Each piece is drawn through a real mount: a Pane id the novarc hooks do not claim falls through to the handler
// registered here beneath the plugin, which draws whatever `peca` builds.
let peca: (k: ReturnType<typeof kit>, ui: any) => any = () => null
const PANE = { plugin: 'novarc', component: 'Pane', requestId: 'kit-teste', props: { title: 'k', isFocused: false, bodyColumns: 61 } } as const
const SUP = ['desktop', 'terminal'] as const

function montar(on: any) {
  on('ui.render', { component: 'Pane', requestId: 'kit-teste' }, async ($: any, e: any) => {
    // a handler beneath the plugin gets the full element table on every surface; the plugin's own terminal table has
    // no Svg and no Client, so the terminal mount drops them here to draw what the plugin's terminal draws
    const ui = { ...$.ui.resolve(e) }
    if (e.surface === 'terminal') {
      delete ui.Svg
      delete ui.Client
    }
    const { Box } = ui
    return <Box flexDirection="column">{peca(kit(ui, e.props.bodyColumns ?? 61, e.surface), ui)}</Box>
  })
}
async function desenhar($: any, surface: 'desktop' | 'terminal', p: typeof peca, bodyColumns = 61) {
  peca = p
  return $.ui.mount({ ...PANE, surface, props: { ...PANE.props, bodyColumns } })
}
const caixas = (n: any, out: any[] = []): any[] => {
  if (!n || typeof n !== 'object') return out
  if (n.type === 'Box') out.push(n)
  for (const c of n.children ?? []) caixas(c, out)
  return out
}

test('filas: cols 57 min 18 gives 3 per row; 4 items give 2 rows padded with 2 empty grow boxes; cols floors at 30', async ($: any, on: any) => {
  montar(on)
  let ui: any = await desenhar($, 'desktop', k => [k.cols === 57 ? 'c57' : 'x', ...k.filas('f', [1, 2, 3, 4].map(i => k.kpi(`k${i}`, '🔒', String(i), 't')), 18)])
  const filas = (await ui.findAll({ type: 'Box' })).filter((b: any) => /^f-fila-/.test(b.key ?? ''))
  expect(filas.length).toBe(2)
  expect((await ui.findAll({ type: 'Box' })).filter((b: any) => /^f-vz-1-/.test(b.key ?? '')).map((b: any) => [b.props.flexGrow, b.props.width])).toEqual([[1, 0], [1, 0]])
  expect(await ui.find({ text: 'c57' })).toBeDefined()
  await ui.unmount()
  ui = await desenhar($, 'desktop', k => [String(k.cols)], 20)
  expect(await ui.find({ text: '30' })).toBeDefined()
  await ui.unmount()
  ui = await desenhar($, 'desktop', k => k.filas('g', [1, 2, 3].map(i => k.kpi(`k${i}`, '🔒', String(i), 't')), 18), 40)
  expect((await ui.findAll({ type: 'Box' })).filter((b: any) => /^g-fila-/.test(b.key ?? '')).length).toBe(3)
  await ui.unmount()
})

test('sv draws Svg with alt, the fallback without Svg, throws on blank alt', async ($: any, on: any) => {
  montar(on)
  for (const surface of SUP) {
    const ui = await desenhar($, surface, k => k.sv('<svg width="1" height="1" viewBox="0 0 1 1"></svg>', 'NovArc', 1, 1, '[/]'))
    if (surface === 'desktop') expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('NovArc')
    else expect(await ui.find({ type: 'Text', text: '[/]' })).toBeDefined()
    await ui.unmount()
  }
  const k = kit({ Box: () => null, Text: () => null, Button: () => null, Svg: () => null })
  expect(() => k.sv('<svg/>', '', 1, 1, '')).toThrow()
  expect(() => k.sv('<svg/>', '  ', 1, 1, '')).toThrow()
})

test('chip: Svg 18 tall alt=texto on desktop; Text " [calada] " background diffRemovedDimmed on terminal', async ($: any, on: any) => {
  montar(on)
  let ui: any = await desenhar($, 'desktop', k => k.chip('calada', 'ruim'))
  const s = await ui.find({ type: 'Svg' })
  expect([s?.props.alt, s?.props.height]).toEqual(['calada', 18])
  await ui.unmount()
  ui = await desenhar($, 'terminal', k => k.chip('calada', 'ruim'))
  expect((await ui.find({ type: 'Text', text: ' [calada] ' }))?.props.backgroundColor).toBe('diffRemovedDimmed')
  await ui.unmount()
})

test('botao: primary or secondary, never plain, inside a keyed Box', async ($: any, on: any) => {
  montar(on)
  for (const surface of SUP) {
    const ui = await desenhar($, surface, k => [k.botao({ key: 'a', primario: true, onPress: () => {}, children: 'A' }), k.botao({ key: 'b', onPress: () => {}, children: 'B' })])
    expect((await ui.find({ key: 'a' }))?.props.variant).toBe('primary')
    expect((await ui.find({ key: 'b' }))?.props.variant).toBe('secondary')
    for (const b of await ui.findAll({ type: 'Button' })) expect(b.props.plain).toBeUndefined()
    expect(await ui.find({ key: 'b-a' })).toBeDefined()
    expect(await ui.find({ key: 'b-b' })).toBeDefined()
    await ui.unmount()
  }
})

test('cartao family: border, stripe color, stripe width 0.3 desktop and 1 terminal, caption', async ($: any, on: any) => {
  montar(on)
  for (const surface of SUP) {
    const w = surface === 'desktop' ? 0.3 : 1
    const listra = (raiz: any) => caixas(raiz).find(b => b.props.width === w && b.props.backgroundColor)
    const um = async (p: typeof peca) => {
      const ui = await desenhar($, surface, p)
      const arv = await ui.drawn()
      const card = (arv as any).children[0]
      const r = { borda: card.props.borderColor, fundo: card.props.backgroundColor, listra: listra(card)?.props.backgroundColor, ui }
      return r
    }
    let r = await um(k => k.msg('m', 'novarc-omni-C03', 'DONE C03-S01 pronto'))
    expect([r.borda, r.listra]).toEqual(['promptBorder', 'suggestion'])
    expect(await r.ui.find({ type: 'Text', text: 'MENSAGEM DE NOVARC-OMNI-C03' })).toBeDefined()
    await r.ui.unmount()
    r = await um(k => k.bloqueio('b', 'Sessão de spec não abre PR.'))
    expect([r.borda, r.fundo, r.listra]).toEqual(['error', 'diffRemovedDimmed', 'error'])
    expect((await r.ui.find({ type: 'Text', text: '⛔ Bloqueado pelo Maestro' }))?.props.bold).toBe(true)
    await r.ui.unmount()
    r = await um(k => k.aviso('a', 'Arquivo na superfície de C03-S02.'))
    expect([r.borda, r.listra]).toEqual(['promptBorder', 'warning'])
    expect(await r.ui.find({ type: 'Text', text: '⚠️ Aviso do Maestro' })).toBeDefined()
    await r.ui.unmount()
    r = await um(k => k.injecao('i', 'contexto', ['x']))
    expect(r.listra).toBe('claude')
    await r.ui.unmount()
    const ui = await desenhar($, surface, k => k.turno('t', '3 min · 12k tokens'))
    expect((await ui.find({ type: 'Text', text: '3 min · 12k tokens' }))?.props.color).toBe('subtle')
    await ui.unmount()
  }
})

test('cartaoEstado: emoji, bold title, line; skeleton only when loading; tentar only on error', async ($: any, on: any) => {
  montar(on)
  let ui: any = await desenhar($, 'desktop', k => k.cartaoEstado('carregando', 'lendo o registro…'))
  for (const t of ['⏳', 'Lendo…', 'lendo o registro…']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('carregando')
  expect(await ui.find({ key: 'tentar' })).toBeUndefined()
  await ui.unmount()
  ui = await desenhar($, 'desktop', k => k.cartaoEstado('vazio', 'Nenhuma execução ativa na máquina.'))
  expect((await ui.find({ type: 'Text', text: 'Nada aqui ainda' }))?.props.bold).toBe(true)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
  ui = await desenhar($, 'desktop', k => k.cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', () => {}))
  expect(await ui.find({ type: 'Text', text: 'Não consegui ler o banco do planejamento' })).toBeDefined()
  expect((await ui.find({ key: 'tentar' }))?.props.variant).toBe('primary')
  expect(((await ui.drawn()) as any).children[0].props.borderColor).toBe('warning')
  await ui.unmount()
})

test('abas: Button key is chaveAba(k), hotkeys by position, primary on the selected, red bold count only when > 0', async ($: any, on: any) => {
  montar(on)
  const ui = await desenhar($, 'desktop', k =>
    k.abas([{ k: 'agora', rotulo: '🕒 Agora', tecla: 1 }, { k: 'execucao', rotulo: '▶️ Execução', tecla: 2 }, { k: 'locks', rotulo: '🔒 Locks e filas', tecla: 3, conta: 1 }, { k: 'x', rotulo: 'X', tecla: 5, conta: 0 }], 'locks', () => () => {}),
  )
  expect((await ui.findAll({ type: 'Button' })).map((b: any) => [b.key, b.props.hotkey, b.props.variant])).toEqual([
    ['t-agora', '1', 'secondary'], ['t-exec', '2', 'secondary'], ['t-locks', '3', 'primary'], ['t-x', '5', 'secondary'],
  ])
  const conta = await ui.findAll({ type: 'Text', text: ' 1' })
  expect(conta.map((t: any) => [t.props.color, t.props.bold])).toEqual([['error', true]])
  await ui.unmount()
})

test('kit is reused for the same element table, width and surface', () => {
  const ui = { Box: () => null, Text: () => null, Button: () => null, Svg: () => null }
  expect(kit(ui, 78, 'desktop')).toBe(kit(ui, 78, 'desktop'))
  expect(kit(ui, 78, 'desktop')).not.toBe(kit(ui, 61, 'desktop'))
  expect(kit(ui, 78, 'terminal').temSvg).toBe(false)
})
