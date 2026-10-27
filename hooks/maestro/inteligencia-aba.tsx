// The Inteligência tab of the orchestrator pane (C04-S01): the partners' catalogue card, drawn from this machine's
// `acervo-sync-v1` only; the read and the button actions happen in register.tsx.
import type { AcervoSync } from '../../types'
import type { Kit } from './kit'
import { pastaDoCliente } from './logic'

type Acao = () => Promise<void>

const LINHAS_MAX = 10

const hhmm = (iso: string) => {
  const x = new Date(iso)
  return Number.isFinite(x.getTime()) ? `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` : '—'
}

/** How long ago, like the simulator's row line: agora, há 5 min, há 3 h, ontem, then dd/mm. */
export function quando(iso: string, agora: number): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const min = Math.max(0, Math.floor((agora - t) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`
  if (min < 48 * 60) return 'ontem'
  const x = new Date(t)
  return `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
}

const conta = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function linhaReconciliacao(r: AcervoSync['reconciliacao']): string {
  if (r === null) return '🔄 reconciliação ainda não rodou'
  if (!r.renomeados && !r.criados) return '🔄 reconciliado no início da sessão: nada mudou'
  return `🔄 reconciliado no início da sessão: ${conta(r.renomeados, 'renomeado', 'renomeados')}, ${conta(r.criados, 'criado', 'criados')} no claude.ai`
}

/** The tab body under the tab row: the acervo section (C07-S02 adds its KPI row and blocks above it). */
export function abaInteligencia(
  ui: any,
  k: Kit,
  s: AcervoSync | null,
  cliente: string,
  agora: number,
  acoes: { abrirAcervo: Acao; abrirLinha: (url: string) => Acao },
): any[] {
  const { Box, Text } = ui
  if (s === null) return [k.cartaoEstado('vazio', 'o acervo desta execução aparece depois da primeira publicação')]
  const selo = s.erro ? k.chip('falhou', 'ruim') : s.ultimo ? k.chip(`em dia · ${hhmm(s.ultimo)}`, 'ok') : k.chip('aguardando', 'neutro')
  const pasta = pastaDoCliente(cliente)
  const linhas = s.recentes.filter(r => r.pasta === pasta).slice(0, LINHAS_MAX)
  return [
    k.titulo('acervo desta execução'),
    k.cartao(
      'acervo',
      null,
      [
        <Box key="cab" flexDirection="row" gap="sm" alignItems="center">
          <Text>🗃️</Text>
          <Box flexDirection="column" flexGrow={1}>
            <Text bold>{cliente ? `${cliente} · Acervo dos Sócios` : 'Acervo dos Sócios'}</Text>
            <Text size="footnote" color="subtle">sync automático na publicação</Text>
            {s.erro ? <Text size="footnote" color="subtle">{`sync automático falhou: ${s.erro}`}</Text> : null}
          </Box>
          {selo}
        </Box>,
        ...(linhas.length
          ? linhas.map(r => (
              <Box key={`linha-${r.id}`} flexDirection="row" gap="sm" alignItems="center">
                <Text>📄</Text>
                <Box flexDirection="column" flexGrow={1} width={0}>
                  <Text wrap="truncate-end">{r.titulo}</Text>
                  <Text size="footnote" color="subtle">{quando(r.at, agora)}</Text>
                </Box>
                {k.botao({ key: `abrir-${r.id}`, onPress: acoes.abrirLinha(r.url), children: 'abrir' })}
              </Box>
            ))
          : [<Text key="sem-linhas" size="footnote" color="subtle">Nenhum artefato desta execução ainda.</Text>]),
        <Box key="rodape" flexDirection="row" gap="sm" alignItems="center">
          <Box flexDirection="column" flexGrow={1}>
            <Text size="footnote" color="subtle">{linhaReconciliacao(s.reconciliacao)}</Text>
            <Text size="footnote" color="subtle">🔐 grava só no Acervo dos Sócios, sem confirmação</Text>
          </Box>
          {k.botao({ key: 'abrir-acervo', primario: true, onPress: acoes.abrirAcervo, children: 'abrir Acervo' })}
        </Box>,
      ],
      { borda: s.erro ? 'warning' : undefined },
    ),
  ]
}
