// C06-S01: the sixth tab `⚙️ Configuração` (m-aba-configuracao): the rules of this run, the grant, its scope, the
// project profile and the hand-over slot. Pure over `ui`, `k` and its data.
import { PX, barraJanelaM } from './desenho'
import type { Kit } from './kit'
import type { CampoPerfil, ContinuoDoc, Perfil, Plano } from './logic'

export type CampoCartao = { grupo: '🧱 código e testes' | '🐙 git e merge' | '🚀 banco e deploy'; chave: CampoPerfil; rotulo: string; valor: string | null; fonte: string; cor?: 'success' | 'warning' }

const FONTE: Partial<Record<CampoPerfil, string>> = {
  hostGit: 'remote origin', base: 'branch padrão do remoto', gate: 'scripts do package.json', stack: 'package.json',
  porAcao: 'CLAUDE.md do cliente', migracaoProducao: 'teto do perfil', deploy: '.github/workflows',
}
const HOST: Record<string, string> = { github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket' }
const simNao = (b: boolean | undefined) => (b === undefined ? null : b ? 'sim' : 'não')

/** The profile's field cards, in drawing order; `valor` null = the profile leaves it empty. */
export function camposPerfil(perfil: Perfil): CampoCartao[] {
  const m = perfil.merge
  const merge: Pick<CampoCartao, 'valor' | 'cor'> =
    m?.clique || m?.quem === 'cliente' ? { valor: 'cliente · exige clique humano', cor: 'warning' } : m?.quem === 'novarc' ? { valor: 'NovArc · automático no contínuo', cor: 'success' } : { valor: null }
  const campo = (grupo: CampoCartao['grupo'], chave: CampoPerfil, rotulo: string, v: Pick<CampoCartao, 'valor' | 'cor'>): CampoCartao => ({
    grupo, chave, rotulo, ...v, fonte: perfil.fontes?.[chave] ?? FONTE[chave] ?? 'perfil do projeto',
  })
  const deploys = perfil.deploys?.length ? perfil.deploys.map(d => `${d.alvo} · ${d.dispara}`).join(', ') : null
  return [
    campo('🧱 código e testes', 'stack', '🧱 stack', { valor: perfil.stack ?? null }),
    campo('🧱 código e testes', 'gate', '🧪 gate', { valor: perfil.gate?.comandos?.length ? perfil.gate.comandos.join(' · ') : null }),
    campo('🧱 código e testes', 'porAcao', '✋ autorização por ação', { valor: simNao(perfil.teto?.porAcao) }),
    campo('🐙 git e merge', 'hostGit', '🐙 host git', { valor: perfil.hostGit ? HOST[perfil.hostGit] ?? perfil.hostGit : null }),
    campo('🐙 git e merge', 'merge', '🔀 merge', merge),
    campo('🐙 git e merge', 'base', '🌿 base', { valor: perfil.base ?? null }),
    campo('🚀 banco e deploy', 'migracao', '🗄️ migrações', { valor: perfil.migracao?.ferramenta ?? null }),
    campo('🚀 banco e deploy', 'migracaoProducao', '🏭 migração em produção', { valor: simNao(perfil.teto?.migracaoProducao) }),
    campo('🚀 banco e deploy', 'deploy', '🚀 deploy', { valor: deploys }),
    campo('🚀 banco e deploy', 'janelaDeploy', '🕘 janela de deploy', { valor: perfil.janelaDeploy ?? null }),
  ]
}

const dois = (n: number) => String(n).padStart(2, '0')
const hhmm = (t: number) => `${dois(new Date(t).getHours())}:${dois(new Date(t).getMinutes())}`
const ddmm = (t: number) => `${dois(new Date(t).getDate())}/${dois(new Date(t).getMonth() + 1)}`

/** The tab body (R8, R43-R47, R53, R54); `pacote`: the hand-over package C10-S01 draws right under the passagem card. */
export function abaConfiguracao(
  ui: any,
  k: Kit,
  d: { orq: boolean; perfil: Perfil | null | undefined; nome: string; continuo: ContinuoDoc | null; runId: string | null; agora: number; plano: Plano | null; estado: 'normal' | 'carregando' | 'erro'; tentar: () => any; pacote?: any },
): any[] {
  const { Box, Text } = ui
  if (d.estado === 'carregando') return [k.cartaoEstado('carregando', 'registro de sessões e banco do planejamento')]
  if (d.estado === 'erro') return [k.cartaoEstado('erro', 'o painel mostra o último estado salvo; nada foi perdido', d.tentar)]
  const doc = d.continuo && d.runId && d.continuo.runId === d.runId ? d.continuo : null
  // the grant shows only while it acts: Contínuo of this run (Manual or Pausado read as without one)
  const liberado = !!doc?.autorizacao && doc.modo === 'continuo'
  const aut = liberado ? doc!.autorizacao : null
  const teto = d.perfil?.teto
  const porFila = Math.max(1, Math.floor((k.cols + 1) / 19))

  const valor = (texto: string, cor?: string) => <Text weight="semibold" color={cor} wrap="truncate-end">{texto}</Text>
  const nota = (texto: string) => <Text size="footnote" color="subtle" wrap="truncate-end">{texto}</Text>
  const cartao = (key: string, rotulo: string, filhos: any[], vazio = false) =>
    k.quadro(key, [k.titulo(rotulo), ...filhos], { grow: true, cor: vazio ? 'warning' : undefined })

  const resumo = k.quadro('cfg-resumo', [
    <Box key="cfg-resumo-l" flexDirection="row" gap="md" alignItems="center">
      <Text size="title">🛡️</Text>
      <Box flexDirection="column" flexGrow={1} width={0}>
        <Text size="heading" weight="semibold">Regras desta execução</Text>
        {nota('até onde o Maestro age sozinho · o perfil vem do repositório do cliente, lido pelo session-plan; a liberação, do banco do planejamento')}
      </Box>
      {k.chip(liberado ? 'contínuo liberado' : 'modo manual', liberado ? 'ok' : 'neutro')}
    </Box>,
  ], liberado ? { faixa: 'success' } : {})

  const at = aut ? Date.parse(aut.at) : NaN
  const fim = aut?.escopo.ate ? Date.parse(aut.escopo.ate) : NaN
  const lib = aut && !Number.isNaN(at)
    ? cartao('cfg-lib', '🔓 liberação', [valor(`liberada às ${hhmm(at)}`, 'success'), nota(`📍 por ${aut.by} em ${ddmm(at)} · banco do planejamento`)])
    : cartao('cfg-lib', '🔓 liberação', [valor('não liberada'), nota('📍 liberar pelo modo Contínuo')])
  const tetoC = teto
    ? cartao('cfg-teto', '🛡️ teto do perfil', [valor(`respeitado · até ${teto.ate ?? 'pr-aberto'}`), nota('📍 escopo nunca acima do teto')])
    : cartao('cfg-teto', '🛡️ teto do perfil', [valor('não descrito', 'warning'), nota('❔ o orquestrador pergunta antes')], true)
  let vale: any
  if (aut && !Number.isNaN(at) && !Number.isNaN(fim)) {
    const f = Math.min(1, Math.max(0, fim > at ? (d.agora - at) / (fim - at) : 1))
    const p = Math.round(f * 100)
    const w = PX * Math.max(10, Math.floor(k.cols / porFila) - 4)
    const cheios = Math.round(f * 5)
    const quando = new Date(fim).toDateString() === new Date(d.agora).toDateString() ? `hoje ${hhmm(fim)}` : `${ddmm(fim)} ${hhmm(fim)}`
    vale = cartao('cfg-vale', '⏱️ vale até', [
      valor(quando),
      k.sv(barraJanelaM(w, f), `${p}% da janela já passou`, w, 8, '▮'.repeat(cheios) + '▯'.repeat(5 - cheios)),
      nota(`${hhmm(at)} → ${hhmm(fim)} · pausar a qualquer momento`),
    ])
  } else vale = cartao('cfg-vale', '⏱️ vale até', [valor('-'), nota('sem janela aberta')])

  const e = aut?.escopo
  const item = (key: string, texto: string, pilula: 'liberado' | 'não pedido' | 'pedido', dim = false) => (
    <Box key={key} flexDirection="row" gap="sm" alignItems="center">
      <Box flexGrow={1} width={0}><Text color={dim ? 'subtle' : undefined} wrap="truncate-end">{texto}</Text></Box>
      {k.chip(pilula, pilula === 'liberado' ? 'ok' : pilula === 'pedido' ? 'aviso' : 'neutro')}
    </Box>
  )
  const clique = !!d.perfil?.merge?.clique
  const escopo = k.quadro('cfg-escopo', [
    k.titulo('📋 escopo liberado'),
    item('esc-go', '🚦 GO, HOLD e FECHA sem perguntar', aut ? 'liberado' : 'não pedido'),
    item('esc-fecha', '🔧 corrigir pendentes e rodar session-end sozinho', aut ? 'liberado' : 'não pedido'),
    item('esc-merge', '🚀 merge, migrações e deploy na ordem da fila', e && (e.merge || e.migracoes || e.deploys) ? 'liberado' : 'não pedido'),
    clique ? item('esc-clique', '👆 clique humano no merge (o perfil pede)', 'pedido') : item('esc-clique', '👆 clique humano no merge (o perfil não pede)', 'não pedido', true),
  ])

  let perfil: any[]
  if (!d.perfil) perfil = [k.cartaoEstado('vazio', 'perfil do projeto ainda não gerado pelo session-plan')]
  else {
    const campos = camposPerfil(d.perfil)
    const grupos = ['🧱 código e testes', '🐙 git e merge', '🚀 banco e deploy'] as const
    const gerado = d.perfil.geradoEm && !Number.isNaN(Date.parse(d.perfil.geradoEm)) ? ` em ${ddmm(Date.parse(d.perfil.geradoEm))}` : ''
    perfil = [
      ...grupos.flatMap((g, gi) => [
        <Text key={`grupo-${gi}`} size="caption" weight="semibold" color="subtle">{g}</Text>,
        ...k.filas(`perfil-${gi}`, campos.filter(c => c.grupo === g).map(c =>
          c.valor === null
            ? cartao(`campo-${c.chave}`, c.rotulo, [valor('não descrito', 'warning'), nota('❔ o orquestrador pergunta antes')], true)
            : cartao(`campo-${c.chave}`, c.rotulo, [valor(c.valor, c.cor), nota(`📍 ${c.fonte}`)]),
        ), 18),
      ]),
      <Text key="perfil-fonte" size="footnote" color="subtle">{`📍 fonte: execucao.perfil no planejamento · gerado pelo session-plan${gerado} · só tipos, comandos e sim/não, nunca segredo`}</Text>,
    ]
  }

  const passagem = k.quadro('cfg-passagem', [
    <Box key="passagem-l" flexDirection="row" gap="sm" alignItems="center">
      <Box flexDirection="column" flexGrow={1} width={0}>
        <Text weight="semibold">🤝 Passar a execução para outro sócio</Text>
        {nota('monta o pacote a partir do estado e grava no planejamento; o contínuo não vai junto, quem assume libera de novo')}
      </Box>
      {d.orq ? null : k.chip('só na orquestradora', 'neutro')}
    </Box>,
  ])

  return [
    resumo,
    k.secao('cfg-s-lib', 'liberação · conferida antes de cada session-end'),
    ...k.filas('lib', [lib, tetoC, vale], 18),
    escopo,
    k.secao('cfg-s-perfil', `perfil do projeto · ${d.nome}`),
    ...perfil,
    k.secao('cfg-s-passagem', 'passagem da execução'),
    passagem,
    ...(d.pacote ? [d.pacote] : []),
  ]
}
