// C06-S01: the run-mode furniture of the pane, drawn with the C11-S01 kit. Pure over `ui`, `k` and its data.
import { PX, alturaCartaoContinuo, cartaoContinuoM, escopoModoM } from './desenho'
import type { Kit } from './kit'
import { itensCartao, seloModo, type EscopoContinuo, type ModoContinuo } from './logic'
import type { Parada } from './execucao'

const PILULA: Record<ModoContinuo, (escopo: string | null) => { texto: string; tom: 'info' | 'ok' | 'aviso' }> = {
  manual: () => ({ texto: 'ⓘ o orquestrador age quando você fala com ele na conversa', tom: 'info' }),
  continuo: e => ({ texto: e ? `🔁 escopo: ${e}` : '🔁 escopo liberado', tom: 'ok' }),
  pausado: () => ({ texto: '⏸️ nada sai sozinho · retomar volta ao escopo de antes', tom: 'aviso' }),
}

/**
 * The mode strip under the brand header (R25, R26): in the orchestrator `MODO │ ✋ Manual 🔁 Contínuo ⏸️ Pausado … 🔔`
 * with the scope pill under it; in a set or spec session the read-only seal, the bell and `✍️ intervir`. One element.
 */
export function faixaModo(
  ui: any,
  k: Kit,
  d: { papel: string | null; modo: ModoContinuo; escopo: string | null; sino: number; recadoAberto: boolean; acoes: { modo: (m: 'manual' | 'continuo' | 'pausado') => () => any; sino: () => any; intervir: () => any } },
): any[] {
  const { Box, Text } = ui
  const unidade = d.papel === 'conjunto' || d.papel === 'spec'
  const orq = d.papel === 'orquestrador'
  const sino = d.sino
  const rotuloSino = unidade ? `🔔 ${sino}` : sino === 0 ? '🔔 sem alertas' : `🔔 ${sino} ${sino === 1 ? 'alerta' : 'alertas'}`
  const bell = k.botao({ key: 'sino', primario: sino > 0, onPress: d.acoes.sino, children: rotuloSino })
  const barra = <Text color="promptBorder">│</Text>
  const selo = seloModo(d.modo, unidade)
  const linha = orq
    ? [
        k.botao({ key: 'modo-manual', primario: d.modo === 'manual', onPress: d.acoes.modo('manual'), children: '✋ Manual' }),
        k.botao({ key: 'modo-continuo', primario: d.modo === 'continuo', onPress: d.acoes.modo('continuo'), children: '🔁 Contínuo' }),
        k.botao({ key: 'modo-pausado', primario: d.modo === 'pausado', onPress: d.acoes.modo('pausado'), children: '⏸️ Pausado' }),
        <Box flexGrow={1} />,
        bell,
      ]
    : unidade
      ? [k.chip(selo.texto, selo.tom), <Box flexGrow={1} />, bell, barra, k.botao({ key: 'intervir', primario: d.recadoAberto, onPress: d.acoes.intervir, children: '✍️ intervir' })]
      : [k.chip(selo.texto, selo.tom), <Box flexGrow={1} />, bell]
  const p = PILULA[d.modo](d.escopo)
  const w = k.cols * PX
  return [
    <Box key="modo" flexDirection="column" gap="xs" paddingX="md" paddingY="sm">
      <Box flexDirection="row" gap="sm" alignItems="center">
        <Text size="caption" color="subtle">MODO</Text>
        {barra}
        {linha}
      </Box>
      {orq ? k.sv(escopoModoM(w, p.texto, p.tom), p.texto, w, 22, p.texto) : null}
    </Box>,
  ]
}

/**
 * The authorization card under the strip (R9, R10, R55): the `cartaoContinuo` Svg, the save error, the missing-import
 * footnote, then `cancelar` and `🔁 liberar o contínuo` at the right. Never a dialog. `bloqueio`: why no grant fits
 * the profile (no ceiling, or per-action), shown in place of the liberar Button.
 */
export function cartaoLiberacao(
  ui: any,
  k: Kit,
  d: { escopo: EscopoContinuo; linhaEscopo: string; podeLiberar: boolean; erro: string | null; aguardando: boolean; bloqueio?: string | null; acoes: { cancelar: () => any; liberar: () => any } },
): any {
  const { Box, Text } = ui
  const itens = itensCartao(d.escopo)
  const w = k.cols * PX
  const recaida = ['🔁 Ligar o modo contínuo', d.linhaEscopo, ...itens.map(t => `✅ ${t}`)].join('\n')
  return (
    <Box key="cartao-continuo" flexDirection="column" gap="xs" paddingX="md" paddingY="sm">
      {k.sv(cartaoContinuoM(w, d.linhaEscopo, itens), 'Ligar o modo contínuo', w, alturaCartaoContinuo(itens.length), recaida)}
      {d.erro ? <Text color="error">{`liberação não gravada no planejamento: ${d.erro}`}</Text> : null}
      {d.podeLiberar ? null : <Text size="footnote" color="warning">sem @NOVARC-CONTINUO.md no seu CLAUDE.md · quem pode liberar roda /maestro continuo habilitar</Text>}
      <Box flexDirection="row" gap="sm" justifyContent="flex-end" alignItems="center">
        {k.botao({ key: 'continuo-cancelar', onPress: d.acoes.cancelar, children: 'cancelar' })}
        {!d.podeLiberar ? null : d.bloqueio
          ? <Text size="footnote" color="warning">{d.bloqueio}</Text>
          : d.aguardando
          ? <Text size="footnote" color="subtle">⏳ gravando a liberação no planejamento…</Text>
          : k.botao({ key: 'continuo-liberar', primario: true, onPress: d.acoes.liberar, children: '🔁 liberar o contínuo' })}
      </Box>
    </Box>
  )
}

/**
 * The open stops (R31, R57): one card each, `error` border and stripe, first in the body of every tab; the newest first.
 * `🚨 Maestro pausou o <projeto>` when the stop paused the run, `🚨 Parada em <C>` otherwise.
 */
export function cartoesParada(ui: any, k: Kit, abertas: (Parada & { pausou: boolean })[], projeto: string): any[] {
  const { Text } = ui
  return [...abertas]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .map(p =>
      k.cartao(`parada-${p.chave}`, 'error', [
        <Text bold color="error">{p.pausou ? `🚨 Maestro pausou o ${projeto}` : `🚨 Parada em ${p.conjunto}`}</Text>,
        <Text>{p.motivo}</Text>,
        <Text color="subtle">intervenha nesta sessão</Text>,
      ], { borda: 'error' }),
    )
}

/** The recado shortcuts (R48): Button label and the fixed text it sends. */
export const ATALHOS = {
  pausar: ['⏸️ pausar esta spec', 'Pausa esta spec até eu liberar.'],
  status: ['📡 pedir status', 'Qual é o status agora?'],
  plano: ['🔁 refazer o plano', 'Quero rever o plano antes de seguir.'],
} as const

/**
 * The recado card `✍️ intervir` opens under the strip in a set or spec session (R27, R48-R50): the destination line,
 * the `Input` (or `digite o recado na conversa` where the surface has none), the shortcuts and `cancelar`.
 */
export function cartaoRecado(
  ui: any,
  k: Kit,
  d: { destino: string; temInput: boolean; acoes: { enviar: (texto: string) => any; atalho: (t: keyof typeof ATALHOS) => () => any; cancelar: () => any } },
): any {
  const { Box, Text, Input } = ui
  return k.cartao('recado', null, [
    <Box flexDirection="row" gap="sm" alignItems="center">
      <Text>✍️</Text>
      <Text bold>Recado para a execução</Text>
    </Box>,
    <Text size="footnote" color="subtle">{`vai para a ${d.destino} · enviado como mensagem sua nesta sessão`}</Text>,
    d.temInput && Input
      ? <Input key="recado-texto" placeholder="ex.: pausa a C01-S02 antes da migração, quero revisar o schema" submitLabel="enviar" onSubmit={d.acoes.enviar} />
      : <Text color="subtle">digite o recado na conversa</Text>,
    <Box flexDirection="row" gap="sm" alignItems="center">
      <Text size="caption" color="subtle">atalhos</Text>
      {(Object.keys(ATALHOS) as (keyof typeof ATALHOS)[]).map(t => k.botao({ key: `recado-${t}`, onPress: d.acoes.atalho(t), children: ATALHOS[t][0] }))}
      <Box flexGrow={1} />
      {k.botao({ key: 'recado-cancelar', onPress: d.acoes.cancelar, children: 'cancelar' })}
    </Box>,
  ], { borda: 'suggestion' })
}
