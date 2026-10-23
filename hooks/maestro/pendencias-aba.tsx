// The Pendências tab of the orchestrator pane (C02-S02): drawn from `maestroPendencias` and the pane's own view state
// only; every read and write happens in register.tsx.
import type { VistaPendencias } from '../../types'
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

/** The tab label: `Pendências <n>` with the open items. */
export function rotuloAba(e: EstadoPendencias | null): string {
  return e ? `Pendências ${abertos(e.itens)}` : 'Pendências'
}

/** The tab body under the tab row. */
export function abaPendencias(ui: any, e: EstadoPendencias | null, v: VistaPendencias, temArtefato: boolean, agora: number, a: AcoesPendencias): any[] {
  const { Box, Text, Button } = ui
  const Input = 'Input' in ui ? ui.Input : undefined
  if (!e) return [<Text key="p-lendo" dimColor>lendo pendências…</Text>]
  const g = agrupar(e.itens, v.fase)
  const caminho = e.itens.filter(i => i.fonte === 'a-caminho')
  const card = (i: ItemPendencia, col: string) => {
    const k = `${col}-${i.ref}`
    const meta = [ORIGEM[i.fonte], i.fase ? `segura F${rotuloFase(i.fase)}` : null, idade(i.at, agora), i.fonte === 'a-caminho' ? `${i.status} ${i.spec}` : i.ref.startsWith('"') ? null : i.ref]
    return (
      <Box key={k} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text bold>{i.titulo}</Text>
          {i.alerta && <Text color="error">divergente</Text>}
          {i.enviada && <Text color="success">enviada ao cliente</Text>}
        </Box>
        <Text dimColor>{meta.filter(Boolean).join(' · ')}</Text>
        {i.alertaTexto && <Text dimColor>{i.alertaTexto}</Text>}
        <Box flexDirection="row" gap={1}>
          {i.fonte === 'plano' && <Button key={`cp-${k}`} plain onPress={a.copiar(i)}>copiar pergunta</Button>}
          {i.fonte === 'plano' && temArtefato && <Button key={`ab-${k}`} plain onPress={a.abrir}>abrir no planejamento</Button>}
          {i.spec && (i.fonte === 'a-caminho' || i.quem !== 'pre-fechamento') && <Button key={`pf-${k}`} plain onPress={a.preFechamento(i)}>mandar ao pré-fechamento</Button>}
          {i.fonte === 'plano' && temArtefato && !i.enviada && <Button key={`en-${k}`} plain onPress={a.enviada(i)}>marcar como enviada ao cliente</Button>}
        </Box>
      </Box>
    )
  }
  const coluna = (titulo: string, its: ItemPendencia[], col: string) => (
    <Box key={`col-${col}`} flexDirection="column">
      <Text bold>{`${titulo} ${its.length}`}</Text>
      {its.length === 0 && <Text>Nada aqui</Text>}
      {its.length === 0 && <Text dimColor>com este filtro</Text>}
      {its.slice(0, MAX).map(i => card(i, col))}
      {its.length > MAX && <Text dimColor>{`mais ${its.length - MAX}`}</Text>}
    </Box>
  )
  const out: any[] = []
  if (e.falhas.plano) out.push(<Text key="f-plano" dimColor>planejamento não lido</Text>)
  if (e.falhas.repo) out.push(<Text key="f-repo" dimColor>repositório não lido</Text>)
  if (e.falhas.ledger) out.push(<Text key="f-ledger" dimColor>ledger não lido</Text>)
  out.push(
    <Box key="p-fases" flexDirection="row" gap={1}>
      <Text dimColor>fase</Text>
      <Button key="pf-todas" variant={v.fase === null ? 'primary' : 'secondary'} onPress={a.fase(null)}>todas</Button>
      {e.fases.map(f => (
        <Button key={`pf-${f}`} variant={v.fase === f ? 'primary' : 'secondary'} onPress={a.fase(f)}>{`F${rotuloFase(f)}`}</Button>
      ))}
    </Box>,
  )
  out.push(
    <Box key="p-caminho" flexDirection="column">
      <Text bold>{`${caminho.length} a caminho do doc de pendings`}</Text>
      <Text dimColor>geradas pelas specs em execução</Text>
      {caminho.length === 0 && <Text>Nada a caminho</Text>}
      {caminho.length === 0 && <Text dimColor>as specs ainda não geraram pendência</Text>}
      {caminho.slice(0, MAX).map(i => (
        <Box key={`ac-${i.ref}`} flexDirection="row" gap={1}>
          <Text bold>{i.titulo}</Text>
          <Text color="claude">{i.spec}</Text>
          <Text>{TIPO[i.status] ?? i.status}</Text>
          <Text dimColor>{i.texto}</Text>
          <Text>{i.destino}</Text>
        </Box>
      ))}
    </Box>,
  )
  out.push(coluna('você ou o cliente', g.socio, 'socio'))
  out.push(coluna('pré-fechamento', g.pre, 'pre'))
  out.push(
    <Box key="col-aceita" flexDirection="column">
      <Text bold>{`dívida aceita ${g.aceita.n}`}</Text>
      <Text dimColor>{`${g.aceita.accepted} ACCEPTED · ${g.aceita.watch} WATCH`}</Text>
    </Box>,
  )
  // the project doc
  if (!e.repo) {
    out.push(<Text key="p-doc">{linhaDoc(null)}</Text>)
    return out
  }
  out.push(<Button key="p-doc" plain onPress={a.doc}>{linhaDoc(e.resumo)}</Button>)
  if (!v.docAberto) return out
  const f = filtrarDoc(e.repo, v.busca, v.filtro)
  const aberto = v.itemDoc ? e.repo.find(x => (x.id ?? x.titulo) === v.itemDoc) : undefined
  out.push(
    <Box key="p-doc-aberto" flexDirection="column">
      {Input && <Input key="p-busca" placeholder="buscar título ou ID" value={v.busca} submitLabel="buscar" onSubmit={(t: string) => a.busca(t)()} />}
      <Box flexDirection="row" gap={1}>
        {(['todos', 'abertos', 'presos', 'aceitos', 'fechados'] as FiltroDoc[]).map(x => (
          <Button key={`df-${x}`} variant={v.filtro === x ? 'primary' : 'secondary'} onPress={a.filtro(x)}>{x}</Button>
        ))}
      </Box>
      <Text dimColor>{`quem responde: equipe ${e.resumo?.equipe ?? 0} · cliente ${e.resumo?.cliente ?? 0}`}</Text>
      {f.linhas.map(x => (
        <Button key={`dl-${x.id ?? x.titulo}`} plain onPress={a.itemDoc((x.id ?? x.titulo) === v.itemDoc ? null : x.id ?? x.titulo)}>{`${x.titulo}  ${x.status}`}</Button>
      ))}
      {f.mais > 0 && <Text dimColor>{`mais ${f.mais}: refine a busca`}</Text>}
      {aberto && (
        <Box key="p-item" flexDirection="column">
          <Text bold>{aberto.titulo}</Text>
          <Text>{`O que: ${aberto.oQue}`}</Text>
          <Text>{`Por que: ${aberto.porQue}`}</Text>
          <Text>{`Destrava: ${aberto.destrava}`}</Text>
          <Text dimColor>{`responde: ${aberto.quem}`}</Text>
        </Box>
      )}
    </Box>,
  )
  return out
}
