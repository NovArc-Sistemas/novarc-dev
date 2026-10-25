// The Pendências tab of the orchestrator pane (C02-S02): drawn from `maestroPendencias` and the pane's own view state
// only; every read and write happens in register.tsx.
import type { VistaPendencias } from '../../types'
import { distribuicaoM } from './desenho'
import type { Kit } from './kit'
import { agrupar, abertos, filtrarDoc, linhaDoc, rotuloFase, type EstadoPendencias, type FiltroDoc, type ItemPendencia } from './pendencias'

export type { VistaPendencias }

type Acao = () => Promise<void>

export const VISTA_PADRAO: VistaPendencias = { fase: null, docAberto: false, busca: '', filtro: 'todos', itemDoc: null }

export type AcoesPendencias = {
  fase: (f: string | null) => Acao
  copiar: (i: ItemPendencia) => Acao
  abrir: Acao
  preFechamento: (i: ItemPendencia) => Acao
  enviada: (i: ItemPendencia) => Acao
  doc: Acao
  busca: (t: string) => Acao
  filtro: (f: FiltroDoc) => Acao
  itemDoc: (id: string | null) => Acao
}

const MAX = 50
const ORIGEM: Record<ItemPendencia['fonte'], string> = { plano: 'planejamento', repo: 'repositório', 'a-caminho': 'execução' }
const TIPO: Record<string, string> = { PARKED: 'PARKED', BLOCKED: 'BLOCKED', CUT: 'corte de escopo' }

function idade(at: number | null, agora: number): string | null {
  if (at === null || !Number.isFinite(at)) return null
  const min = Math.max(0, Math.floor((agora - at) / 60_000))
  return min < 60 * 24 ? `${min} min` : `${Math.floor(min / (60 * 24))} d`
}

/** The tab's count: the open items (the label `📌 Pendências` and the red count are drawn by kit.abas). */
export function rotuloAba(e: EstadoPendencias | null): number {
  return e ? abertos(e.itens) : 0
}

const EMOJI_TIPO: Record<string, string> = { PARKED: '📌', BLOCKED: '⛔', CUT: '✂️' }

/** The tab body under the tab row (R17, R18), drawn with the C11-S01 kit; every key and action of C02-S02 kept. */
export function abaPendencias(ui: any, e: EstadoPendencias | null, v: VistaPendencias, temArtefato: boolean, agora: number, a: AcoesPendencias, k: Kit): any[] {
  const { Box, Text } = ui
  const Input = 'Input' in ui ? ui.Input : undefined
  if (!e) return [k.cartaoEstado('carregando', 'lendo pendências…')]
  const g = agrupar(e.itens, v.fase)
  const caminho = e.itens.filter(i => i.fonte === 'a-caminho')
  const card = (i: ItemPendencia, col: string) => {
    const key = `${col}-${i.ref}`
    const meta = [ORIGEM[i.fonte], idade(i.at, agora), i.fonte === 'a-caminho' ? `${i.status} ${i.spec}` : null]
    const id = i.fonte === 'a-caminho' || i.ref.startsWith('"') ? null : i.ref
    const acoes: [string, string, () => Promise<void>][] = []
    if (i.fonte === 'plano') acoes.push([`cp-${key}`, 'copiar pergunta', a.copiar(i)])
    if (i.fonte === 'plano' && temArtefato) acoes.push([`ab-${key}`, 'abrir no planejamento', a.abrir])
    if (i.spec && (i.fonte === 'a-caminho' || i.quem !== 'pre-fechamento')) acoes.push([`pf-${key}`, 'mandar ao pré-fechamento', a.preFechamento(i)])
    if (i.fonte === 'plano' && temArtefato && !i.enviada) acoes.push([`en-${key}`, 'marcar como enviada ao cliente', a.enviada(i)])
    return k.quadro(key, [
      <Box flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
        <Text bold>{i.titulo}</Text>
        {i.fase ? k.chip(`segura F${rotuloFase(i.fase)}`, 'ruim') : null}
        {i.alerta ? k.chip('divergente', 'ruim') : null}
        {i.enviada ? k.chip('enviada ao cliente', 'ok') : null}
      </Box>,
      <Text size="footnote" color="subtle">{meta.filter(Boolean).join(' · ')}</Text>,
      id ? <Text mono size="footnote" color="subtle">{id}</Text> : null,
      i.alertaTexto ? <Text size="footnote" color="subtle">{i.alertaTexto}</Text> : null,
      acoes.length ? (
        <Box flexDirection="row" gap="sm" flexWrap="wrap">
          {acoes.map(([chave, rotulo, f], n) => k.botao({ key: chave, primario: n === 0, onPress: f, children: rotulo }))}
        </Box>
      ) : null,
    ], { cor: i.alerta ? 'error' : 'promptBorder' })
  }
  const coluna = (titulo: string, its: ItemPendencia[], col: string) => (
    <Box key={`col-${col}`} flexDirection="column" gap="sm" flexGrow={1} width={0}>
      <Text bold>{`${titulo} · ${its.length}`}</Text>
      {its.length === 0 && <Text>Nada aqui</Text>}
      {its.length === 0 && <Text size="footnote" color="subtle">com este filtro</Text>}
      {its.slice(0, MAX).map(i => card(i, col))}
      {its.length > MAX && <Text size="footnote" color="subtle">{`mais ${its.length - MAX}`}</Text>}
    </Box>
  )
  const out: any[] = []
  // the sources that failed while the others were read (R31): one warning card above the rest
  const falhas = [e.falhas.plano && 'planejamento não lido', e.falhas.repo && 'repositório não lido', e.falhas.ledger && 'ledger não lido'].filter(Boolean) as string[]
  if (falhas.length) out.push(k.quadro('p-falhas', [<Text>⚠️</Text>, ...falhas.map(f => <Text key={`f-${f}`} color="warning">{f}</Text>)], { cor: 'warning' }))
  out.push(
    ...k.filas('pk', [
      k.kpi('pk-1', '🙋', String(g.socio.length), 'esperam você ou o cliente'),
      k.kpi('pk-2', '🔧', String(g.pre.length), 'vão ao pré-fechamento'),
      k.kpi('pk-3', '📬', String(caminho.length), 'a caminho do doc'),
    ], 18),
  )
  out.push(
    <Box key="p-fases" flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
      <Text size="caption" color="subtle">fase</Text>
      <Text color="promptBorder">│</Text>
      {k.botao({ key: 'pf-todas', primario: v.fase === null, onPress: a.fase(null), children: 'todas' })}
      {e.fases.map(f => k.botao({ key: `pf-${f}`, primario: v.fase === f, onPress: a.fase(f), children: `F${rotuloFase(f)}` }))}
    </Box>,
  )
  out.push(k.titulo('a caminho do doc de pendings'))
  out.push(
    k.quadro('p-caminho', [
      <Text size="footnote" color="subtle">geradas pelas specs em execução</Text>,
      caminho.length === 0 ? <Text>Nada a caminho</Text> : null,
      caminho.length === 0 ? <Text size="footnote" color="subtle">as specs ainda não geraram pendência</Text> : null,
      ...caminho.slice(0, MAX).map(i => (
        <Box key={`ac-${i.ref}`} flexDirection="row" gap="sm" alignItems="center" flexWrap="wrap">
          <Text>{EMOJI_TIPO[i.status] ?? '•'}</Text>
          <Text bold>{i.titulo}</Text>
          <Text mono size="footnote">{i.spec}</Text>
          {k.chip(TIPO[i.status] ?? i.status, 'aviso')}
          <Text size="footnote" color="subtle">{i.texto}</Text>
          <Text size="footnote">{i.destino}</Text>
        </Box>
      )),
    ]),
  )
  out.push(k.titulo('quem age'))
  out.push(...k.filas('p-cols', [coluna('🙋 você ou o cliente', g.socio, 'socio'), coluna('🔧 pré-fechamento', g.pre, 'pre')], 26))
  out.push(k.quadro('col-aceita', [<Text bold>{`📚 ${g.aceita.n} dívidas aceitas`}</Text>, <Text size="footnote" color="subtle">{`${g.aceita.accepted} ACCEPTED · ${g.aceita.watch} WATCH`}</Text>]))
  // the project doc
  if (!e.repo) {
    out.push(k.quadro('p-doc-card', [<Text key="p-doc">{linhaDoc(null)}</Text>]))
    return out
  }
  const r = e.resumo
  out.push(
    k.quadro('p-doc-card', [
      <Box flexDirection="row" gap="sm" alignItems="center">
        <Text>🗂️</Text>
        <Box flexGrow={1} width={0}>
          <Text bold wrap="truncate-end">{linhaDoc(r)}</Text>
        </Box>
        {k.botao({ key: 'p-doc', onPress: a.doc, children: v.docAberto ? '🔽 fechar' : '▶️ abrir' })}
      </Box>,
      r ? k.sv(distribuicaoM([['OPEN', r.OPEN], ['GATED', r.GATED], ['WATCH', r.WATCH], ['ACCEPTED', r.ACCEPTED], ['CLOSED', r.CLOSED]]), 'distribuição do doc', 0, 8, '') : null,
    ]),
  )
  if (!v.docAberto) return out
  const f = filtrarDoc(e.repo, v.busca, v.filtro)
  const aberto = v.itemDoc ? e.repo.find(x => (x.id ?? x.titulo) === v.itemDoc) : undefined
  out.push(
    <Box key="p-doc-aberto" flexDirection="column" gap="sm">
      {Input && <Input key="p-busca" placeholder="buscar título ou ID" value={v.busca} submitLabel="buscar" onSubmit={(t: string) => a.busca(t)()} />}
      <Box flexDirection="row" gap="sm" flexWrap="wrap">
        {(['todos', 'abertos', 'presos', 'aceitos', 'fechados'] as FiltroDoc[]).map(x => k.botao({ key: `df-${x}`, primario: v.filtro === x, onPress: a.filtro(x), children: x }))}
      </Box>
      <Text size="footnote" color="subtle">{`quem responde: equipe ${e.resumo?.equipe ?? 0} · cliente ${e.resumo?.cliente ?? 0}`}</Text>
      {f.linhas.map(x => k.botao({ key: `dl-${x.id ?? x.titulo}`, onPress: a.itemDoc((x.id ?? x.titulo) === v.itemDoc ? null : x.id ?? x.titulo), children: `${x.titulo}  ${x.status}` }))}
      {f.mais > 0 && <Text size="footnote" color="subtle">{`mais ${f.mais}: refine a busca`}</Text>}
      {aberto && (
        <Box key="p-item" flexDirection="column">
          <Text bold>{aberto.titulo}</Text>
          <Text>{`O que: ${aberto.oQue}`}</Text>
          <Text>{`Por que: ${aberto.porQue}`}</Text>
          <Text>{`Destrava: ${aberto.destrava}`}</Text>
          <Text size="footnote" color="subtle">{`responde: ${aberto.quem}`}</Text>
        </Box>
      )}
    </Box>,
  )
  return out
}
