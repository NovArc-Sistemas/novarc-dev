// C11-S01: the Maestro's element kit over `$.ui.resolve(e)`: native buttons, Svg with its terminal fallback, pills,
// cards, grid rows, section bands, the brand header, the one state card, the chat cards and the NovArc rows.
// Pure over `ui`: nothing here reads state. Rules: interface.md "Rendering rules" (theme keys only, named spacing,
// non-empty alt, primary/secondary buttons inside a keyed Box).
import { BARRA_TURNO, COR, ESQUELETO, LOGO_GIRANDO, LOGO_MAESTRO, PX, bannerM, faixaSecaoM, ponto, seloM, type Tom } from './desenho'

const FUNDO: Record<Tom, string> = { ok: 'diffAddedDimmed', ruim: 'diffRemovedDimmed', aviso: 'warning', info: 'suggestion', neutro: 'promptBorder' }
const COR_TOM: Record<Tom, string | undefined> = { ok: 'success', ruim: 'error', aviso: 'inverseText', info: 'inverseText', neutro: undefined }

/** The Button key of a tab: the keys C01/C02 already press stay, a later tab gets `t-<k>`. */
export const chaveAba = (k: string) => ({ agora: 't-agora', execucao: 't-exec', locks: 't-locks', pendencias: 't-pend' } as Record<string, string>)[k] ?? `t-${k}`

/**
 * `superficie`: the render event's surface. The element table may list Svg and Client on the terminal too, where the
 * surface drops them, so the fallback is chosen by the surface, not by the table.
 */
// One kit per element table, width and surface: a redraw reuses the helpers instead of building them again.
const kits = new WeakMap<object, Map<string, ReturnType<typeof criar>>>()
export function kit(ui: any, larg = 60, superficie = 'desktop') {
  let porUi = kits.get(ui)
  if (!porUi) kits.set(ui, (porUi = new Map()))
  const chave = `${larg}|${superficie}`
  let k = porUi.get(chave)
  if (!k) porUi.set(chave, (k = criar(ui, larg, superficie)))
  return k
}

function criar(ui: any, larg: number, superficie: string) {
  const { Box, Text, Button } = ui
  const Svg = ui.Svg
  const temSvg = !!Svg && superficie !== 'terminal'
  const temClient = !!ui.Client && superficie === 'desktop'
  const cols = Math.max(30, larg - 4)
  const W = larg * PX

  const botao = (p: { key: string; primario?: boolean; hotkey?: string; onPress: () => any; children: any }) => (
    <Box key={`b-${p.key}`}>
      <Button key={p.key} variant={p.primario ? 'primary' : 'secondary'} hotkey={p.hotkey} onPress={p.onPress}>{p.children}</Button>
    </Box>
  )
  // w 0: a stretched Svg (preserveAspectRatio none) that takes its Box's width
  const sv = (src: string, alt: string, w: number, alto: number, recaida: string, interativo?: boolean) => {
    if (!String(alt).trim()) throw new Error('alt vazio')
    return temSvg ? <Svg source={src} alt={alt} width={w ? Math.round(w) : undefined} height={alto} isInteractive={interativo || undefined} /> : <Text color="subtle">{recaida}</Text>
  }
  const chip = (texto: string, tom: Tom) => {
    if (!temSvg) return <Text size="footnote" backgroundColor={FUNDO[tom]} color={COR_TOM[tom]}>{` [${texto}] `}</Text>
    const s = seloM(texto, tom)
    return <Svg source={s.src} alt={texto} width={s.w} height={18} />
  }
  const dono = (spec: string) => (
    <Box flexDirection="row" gap="sm" alignItems="center">
      {sv(ponto(COR[spec.slice(0, 3)] ?? '#85827a'), `cor do ${spec.slice(0, 3)}`, 8, 8, '●')}
      <Text mono size="footnote">{spec}</Text>
    </Box>
  )
  const faixaBox = (cor: string) => <Box width={temSvg ? 0.3 : 1} backgroundColor={cor} />
  const quadro = (key: string, filhos: any, o: { cor?: string; fundo?: string; faixa?: string; grow?: boolean } = {}) =>
    o.faixa ? (
      <Box key={key} flexDirection="row" borderStyle="round" borderColor={o.cor ?? 'promptBorder'} backgroundColor={o.fundo} flexGrow={o.grow ? 1 : undefined} width={o.grow ? 0 : undefined}>
        {faixaBox(o.faixa)}
        <Box flexDirection="column" gap="xs" paddingX="md" paddingY="sm" flexGrow={1}>{filhos}</Box>
      </Box>
    ) : (
      <Box key={key} flexDirection="column" gap="xs" paddingX="md" paddingY="sm" borderStyle="round" borderColor={o.cor ?? 'promptBorder'} backgroundColor={o.fundo} flexGrow={o.grow ? 1 : undefined} width={o.grow ? 0 : undefined}>
        {filhos}
      </Box>
    )
  const titulo = (t: string, cor = 'subtle') => <Text size="caption" color={cor}>{t.toUpperCase()}</Text>
  const linha = (k: string, a: any, b: any, corB?: string) => (
    <Box key={k} flexDirection="row" justifyContent="space-between" gap="sm">
      {typeof a === 'string' ? <Text wrap="truncate-end">{a}</Text> : a}
      {typeof b === 'string' ? <Text size="footnote" color={corB ?? 'subtle'}>{b}</Text> : b}
    </Box>
  )
  const filas = (key: string, itens: any[], min: number): any[] => {
    const n = Math.max(1, Math.floor((cols + 1) / (min + 1)))
    return Array.from({ length: Math.ceil(itens.length / n) }, (_, l) => itens.slice(l * n, l * n + n)).map((fila, l) => (
      <Box key={`${key}-fila-${l}`} flexDirection="row" gap="sm">
        {[...fila, ...Array(n - fila.length).fill(null)].map((x, i) => x ?? <Box key={`${key}-vz-${l}-${i}`} flexGrow={1} width={0} />)}
      </Box>
    ))
  }
  const kpi = (key: string, emoji: string, n: string, texto: string, cor?: string) => (
    <Box key={key} flexDirection="row" gap="md" alignItems="center" flexGrow={1} width={0} paddingX="md" paddingY="sm" borderStyle="round" borderColor="promptBorder">
      <Text size="title">{emoji}</Text>
      <Box flexDirection="column">
        <Text size="heading" weight="semibold" tabular color={cor}>{n}</Text>
        <Text size="footnote" color="subtle">{texto}</Text>
      </Box>
    </Box>
  )
  const fato = (k: string, rotulo: string, valor: string, cor?: string) => (
    <Box key={k} flexDirection="column" flexGrow={1} width={0}>
      <Text size="caption" color="subtle">{rotulo.toUpperCase()}</Text>
      <Text size="footnote" color={cor} wrap="truncate-end">{valor}</Text>
    </Box>
  )
  const secao = (key: string, esquerda: string, direita = '', aoVivo = false) =>
    temSvg ? (
      <Svg key={key} source={faixaSecaoM(W, esquerda, direita, aoVivo)} alt={esquerda || 'separador de seção'} width={W} height={20} isInteractive={aoVivo || undefined} />
    ) : (
      <Box key={key} flexDirection="row" gap="sm">
        <Text color="subtle" wrap="truncate-end">{`── ${esquerda} ${'─'.repeat(Math.max(0, Math.min(larg, 200) - esquerda.length - direita.length - 6))}`}</Text>
        {direita ? <Text color="subtle">{direita}</Text> : null}
      </Box>
    )
  const cabecalho = (foco: string, alertas: number) =>
    temSvg ? (
      <Svg key="cabecalho" source={bannerM(W, foco, alertas)} alt={`NovArc Maestro · ${foco}${alertas ? ` · ${alertas} ${alertas === 1 ? 'alerta' : 'alertas'}` : ''}`} width={W} height={60} />
    ) : (
      <Box key="cabecalho" flexDirection="row" gap="sm">
        <Text bold>[Nov/Arc] Maestro</Text>
        <Text color="subtle">{foco}</Text>
      </Box>
    )
  const abas = (lista: { k: string; rotulo: string; tecla: number; conta?: number }[], atual: string, ir: (k: string) => () => any) => (
    <Box key="abas" flexDirection="row" flexWrap="wrap" gap="sm">
      {lista.map(a =>
        botao({ key: chaveAba(a.k), primario: a.k === atual, hotkey: String(a.tecla), onPress: ir(a.k), children: [a.rotulo, a.conta ? <Text color="error" bold>{` ${a.conta}`}</Text> : null] }),
      )}
    </Box>
  )
  const EST = { vazio: ['📭', 'Nada aqui ainda'], carregando: ['⏳', 'Lendo…'], erro: ['⚠️', 'Não consegui ler o banco do planejamento'] } as const
  const cartaoEstado = (estado: 'vazio' | 'carregando' | 'erro', texto: string, tentar?: () => any, tituloEstado?: string) => (
    <Box key={`estado-${estado}`} flexDirection="column" gap="sm" alignItems="center" paddingX="md" paddingY="lg" borderStyle="round" borderColor={estado === 'erro' ? 'warning' : 'promptBorder'}>
      <Text size="title">{EST[estado][0]}</Text>
      <Text size="heading" weight="semibold" bold>{tituloEstado ?? EST[estado][1]}</Text>
      <Text size="footnote" color="subtle">{texto}</Text>
      {estado === 'carregando' && temSvg ? (
        <Box key="skel" flexDirection="row" width="60%">
          <Box flexGrow={1} width={0}>{sv(ESQUELETO, 'carregando', 0, 8, '')}</Box>
        </Box>
      ) : null}
      {estado === 'erro' && tentar ? botao({ key: 'tentar', primario: true, onPress: tentar, children: '🔄 tentar de novo' }) : null}
    </Box>
  )

  // ---- chat cards: one card language with the pane (neutral border, a 0.3-cell stripe in the card's color)
  const cartao = (key: string, faixa: string | null, filhos: any, o: { borda?: string; fundo?: string; estilo?: string } = {}) => (
    <Box key={key} flexDirection="row" borderStyle={o.estilo ?? 'round'} borderColor={o.borda ?? 'promptBorder'} backgroundColor={o.fundo}>
      {faixa ? faixaBox(faixa) : null}
      <Box flexDirection="column" gap="xs" paddingX="md" paddingY="sm" flexGrow={1}>{filhos}</Box>
    </Box>
  )
  const caixa = (key: string, tit: string, filhos: any, faixa: string | null = null) => cartao(key, faixa, [titulo(tit, faixa && faixa !== 'promptBorder' ? faixa : 'subtle'), filhos])
  const marcaLogo = (pulsa: boolean) => {
    const b = pulsa ? LOGO_GIRANDO : BARRA_TURNO
    return temSvg ? <Svg source={b.src} alt="NovArc" width={b.w} height={pulsa ? 16 : 14} isInteractive={pulsa || undefined} /> : null
  }
  const linhaLogo = (filhos: any[]) => (
    <Box flexDirection="row" gap="sm" alignItems="center">
      {sv(LOGO_GIRANDO.src, 'NovArc', LOGO_GIRANDO.w, 16, '', true)}
      {filhos}
    </Box>
  )

  return {
    temSvg,
    temClient,
    cols,
    W,
    botao,
    sv,
    chip,
    dono,
    quadro,
    titulo,
    linha,
    filas,
    kpi,
    fato,
    secao,
    cabecalho,
    abas,
    cartaoEstado,
    cartao,
    caixa,
    /** The header of a /maestro answer: the short logo and the caption. */
    cabecalhoMaestro: (tit: string) => {
      const lc = LOGO_MAESTRO
      return (
        <Box key="cab" flexDirection="row" gap="sm" alignItems="center">
          {temSvg ? <Svg source={lc.src} alt="NovArc" width={lc.w} height={14} /> : <Text>[/]</Text>}
          {titulo(tit, 'claude')}
        </Box>
      )
    },
    msg: (key: string, de: string, texto: string) => cartao(key, 'suggestion', [titulo(`mensagem de ${de}`, 'suggestion'), <Text>{texto}</Text>]),
    aviso: (key: string, texto: string) => cartao(key, 'warning', [<Text color="warning" bold>⚠️ Aviso do Maestro</Text>, <Text>{texto}</Text>]),
    bloqueio: (key: string, texto: string) => cartao(key, 'error', [<Text color="error" bold>⛔ Bloqueado pelo Maestro</Text>, <Text>{texto}</Text>], { borda: 'error', fundo: 'diffRemovedDimmed' }),
    injecao: (key: string, tit: string, linhas: any[], tracejado?: boolean) => cartao(key, 'claude', [titulo(tit, 'claude'), linhas], tracejado ? { estilo: 'dashed' } : {}),
    turno: (key: string, texto: string, pulsa = false) => (
      <Box key={key} flexDirection="row" gap="sm" alignItems="center">
        {marcaLogo(pulsa)}
        <Text color="subtle">{texto}</Text>
      </Box>
    ),
    // ---- the NovArc rows of every session: they read no state (R49)
    linhaFerramenta: (tool: string, alvo: string) =>
      linhaLogo([<Text weight="semibold">{tool}</Text>, <Text color="subtle" wrap="truncate-end">{alvo}</Text>]),
    linhaGrupo: (tool: string, alvo: string, feitas: number) =>
      linhaLogo([
        <Text weight="semibold">{tool}</Text>,
        <Text color="subtle" wrap="truncate-end">{alvo}</Text>,
        feitas > 0 ? <Text size="footnote" color="subtle">{`+${feitas} feitas`}</Text> : null,
      ]),
    linhaTrabalhando: (texto: string) => linhaLogo([<Text color="suggestion">{texto}</Text>]),
  }
}

export type Kit = ReturnType<typeof criar>
