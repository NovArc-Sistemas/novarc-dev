// ---- Maestro: the NOVARC execution mod (hooks/maestro)

export type Contexto = {
  artefato: string
  plano: unknown
  conjunto: string | null
  spec: string | null
  papel: 'conjunto' | 'orquestrador' | 'spec' | null
}

// ---- C02-S02: the Pendências tab (hooks/maestro/pendencias.ts)

export type EntradaRepo = {
  id: string | null
  titulo: string
  status: string
  secao: string
  quem: 'equipe' | 'cliente'
  oQue: string
  porQue: string
  destrava: string
  /** p-ids of planning questions the entry names. */
  planejamento: string[]
}
export type ACaminho = { spec: string; ref: string; tipo: 'PARKED' | 'BLOCKED' | 'CUT'; texto: string; at: string }
export type ItemPendencia = {
  id: string
  ref: string
  fonte: 'plano' | 'repo' | 'a-caminho'
  titulo: string
  texto: string
  status: string
  quem: 'socio' | 'cliente' | 'pre-fechamento' | 'aceita'
  fase: string | null
  spec: string | null
  destino: string | null
  alerta: 'resolvida-no-repo' | 'reaberta' | null
  alertaTexto: string | null
  enviada: boolean
  at: number | null
}
export type Divergencia = { pid: string; ref: string; tipo: 'resolvida-no-repo' | 'reaberta'; chave: string }
export type DocResumo = { tot: number; abertos: number; OPEN: number; GATED: number; WATCH: number; ACCEPTED: number; CLOSED: number; ilegiveis: number; equipe: number; cliente: number }
export type FiltroDoc = 'todos' | 'abertos' | 'presos' | 'aceitos' | 'fechados'
export type EstadoPendencias = {
  itens: ItemPendencia[]
  /** null: no pendings in .novarc or the legacy places. */
  repo: EntradaRepo[] | null
  resumo: DocResumo | null
  contador: { n: number; fase: string } | null
  divergencias: Divergencia[]
  falhas: { plano: boolean; repo: boolean; ledger: boolean }
  /** Phase ids of the plan, for the filter row. */
  fases: string[]
}
/** The Pendências tab's own view: phase filter, project doc open, search, filter, open doc item. */
export type VistaPendencias = { fase: string | null; docAberto: boolean; busca: string; filtro: FiltroDoc; itemDoc: string | null }

/** One checkpoint of a fork (ledger.py keyword), from a fork message or a ledger line. */
export type Evento = { tipo: string; texto: string; at: number }
/** `sessao`: the linked spec session id; `spec`: the cNN-sNN id read from the READY `branch=`. */
export type Fork = { slug: string; agentId?: string; sessao?: string; spec?: string; eventos: Evento[] }
/** The session-build run as this session sees it, with or without a planning artifact. */
export type Execucao = {
  papel: 'orquestrador' | 'conjunto' | 'spec' | null
  ledgerDir: string | null
  forks: Record<string, Fork>
  codigo?: string | null
  projeto?: string | null
  artefato?: string | null
  conjunto?: string | null
  spec?: string | null
  nome?: string | null
  conjuntos?: Record<string, { etapa: string; texto: string; at: number }>
  /** C05-S01: opened with a minimal brief and no GO yet (true), GO received (false), not opened empty (null or absent). */
  aguardandoGo?: boolean | null
}
/** One `auditoria/{id}` document (C03-S01 dados.md), exported again by hooks/maestro/logic.ts: append only, only `estado` is ever updated. */
export type AuditoriaDoc = {
  acao: string
  alvo: string
  motivo: string
  regra: string
  linha: string | null
  antes: string | null
  depois: string | null
  estado: 'enviando' | 'enviado' | 'falhou' | null
  runId: string | null
  sessao: string
  papel: 'orquestrador' | 'conjunto' | 'spec'
  by: string
  at: string
  origem: 'maestro' | 'agente'
}
/** C03-S01: the address map (session only, rebuilt from the ledgers); session ids and agentIds never leave this state. */
export type MapaSessoes = {
  conjuntos: Record<string, { nome: string; sessao: string | null }>
  specs: Record<string, { conjunto: string; nome: string; sessao: string | null; slug: string; agentId: string | null }>
  orquestrador: string | null
  at: number
}
/** One session's entry in the machine-wide registry the Agora tab reads. */
export type Registro = {
  sessao: string
  cwd: string
  titulo: string
  papel: 'orquestrador' | 'conjunto' | 'spec' | null
  forks: number
  feitos: number
  alerta: string | null
  at: number
  nome?: string | null
  codigo?: string | null
  projeto?: string | null
  conjunto?: string | null
  /** C05-S01: the session holds only its minimal brief and waits for its GO. */
  aguardandoGo?: boolean | null
  spec?: string | null
  branch?: string | null
  pai?: string | null
  artefato?: string | null
  ledgerDir?: string | null
  /** Orchestrator only: the last CONJUNTO line each set reported. */
  conjuntos?: Record<string, { etapa: string; texto: string; at: number }>
}

/** One `SWEEP OUTSTANDING` line of `ledger.py sweep`; `desde` null when the LOCK line had no stamp (`since=-`). */
export type LinhaSweep = { slug: string; kind: string; resource: string; estado: string; desde: string | null }
/** One alert: `chave` dedupes the toast, `texto` is the band text, `toast` the toast text. */
export type Alerta = { chave: string; texto: string; toast: string; nivel: 'erro' | 'ok'; at: number }
export type Slot = { dono: { conjunto: string; branch: string; desde: string } | null; fila: { conjunto: string; branch: string; desde: string }[] }
/** The orchestrator's `verify` / `producao` slots, paired from its own ledger.md. */
export type Slots = { verify: Slot; producao: Slot }
/** Session-only alert state: the band and the Locks e filas tab read it. */
export type Alertas = {
  lista: Alerta[]
  /** Alert keys already toasted; a key leaves when its cause clears. */
  alertasVistos: string[]
  /** Set session: the last sweep, its dir marker and whether it was a real reading. */
  sweep: { marcador: string; linhas: LinhaSweep[]; at: number; semLeitura: boolean } | null
  limiares: { calado: number; lockOrfao: number }
  /** Set session: timer looks so far (limiares read cadence, survives hot reload). */
  olhares: number
  /** What the Locks e filas tab draws, computed with the alerts (the pane reads state only). */
  vista?: {
    locks: { spec: string; kind: string; resource: string; desde: string; estado: string; espera?: string[]; minutos: number; orfao: boolean }[]
    slots: Slots | null
    unidades: { unidade: string; minutos: number; calada: boolean }[]
    ritmo: { checkpointMin: number | null; lockMin: number | null; amostras: number }
    proposta: { calado: number; lockOrfao: number; amostras: number; at: string } | null
    /** Set session: when the espelho was last written (ms), for `espelhado no planejamento há N s`. */
    espelhadoEm: number | null
  }
}

// ---- Acervo: the artifact organizer (private plugin only)

/** A named list of people the user shares artifacts with. */
export type ShareGroup = { name: string; emails: string[] }

export type ArtifactEntry = { title: string; url: string; updatedAt?: string; rel?: 'mine' | 'shared' }

/** `alias` renames the artifact inside the organizer only; claude.ai keeps its own title. */
export type Assignment = { folder?: string; tags: string[]; archived?: true; alias?: string }

/** Everything persisted in $.store: survives sessions, reloads and account switches. */
export type OrganizerData = {
  /** Every artifact ever listed, by id (last URL segment): another account's stay visible. */
  catalog: Record<string, ArtifactEntry>
  folders: string[]
  /** The fixed tag list: kept even with no artifact carrying them. Absent in data saved before it existed. */
  tagList?: string[]
  /** Favourite share groups: e-mails copied for the claude.ai share dialog. Absent in older data. */
  groups?: ShareGroup[]
  assign: Record<string, Assignment>
}

/**
 * What the main area shows. `home` is the explorer root: folder tiles plus the
 * artifacts in no folder; `folder` is inside one. Every mode but `archived`
 * hides archived artifacts.
 */
export type OrganizerView = { mode: 'home' | 'folder' | 'all' | 'mine' | 'shared' | 'archived' | 'tag'; value?: string }

/** One artifact line as the explorer Client draws it: display-ready, JSON only. */
export type ExplorerRow = {
  id: string
  title: string
  date: string
  folder: string | null
  tags: string[]
  isShared: boolean
  isOtherAccount: boolean
  isArchived: boolean
}

/** The props the hooks module hands `explorer.tsx`. */
export type ExplorerProps = {
  /** Folder tiles to draw on top (the Início view), or null. */
  tiles: { path: string; name: string; count: number }[] | null
  groups: { label: string; rows: ExplorerRow[] }[]
  /** Drop targets offered in the palette while dragging. */
  folders: string[]
  picked: string[]
  isInFolder: boolean
  emptyText: string
}

/** What the explorer Client posts back; validated by the hooks module before use. */
export type ExplorerMessage =
  | { type: 'select' | 'pick' | 'open' | 'archive' | 'rename' | 'tag'; id: string }
  | { type: 'open-folder'; folder: string }
  | { type: 'move'; ids: string[]; folder: string | null }

// ---- C04-S01: the Acervo dos Sócios sync (`$.store` key acervo-sync-v1, written by the Acervo, read by the pane)

export type AcervoLinha = { id: string; url: string; titulo: string; pasta: string; at: string }
export type AcervoSync = {
  url: string
  ultimo: string | null
  erro: string | null
  reconciliacao: { at: string; renomeados: number; criados: number } | null
  /** Newest first, at most 50. */
  recentes: AcervoLinha[]
  /** Failed writes, retried by the next reconciliation. */
  pendentes: (AcervoLinha & { erro: string })[]
}
/** One `artefatos/{id}` document as the mod creates it: no account, no e-mail (R21). */
export type EntradaAcervo = {
  dono: string
  conta: ''
  titulo: string
  url: string
  pasta: string
  tags: []
  acesso: {}
  apelido: ''
  atualizadoEm: string
  fonte: 'maestro'
}

declare module 'claude-code' {
  interface PluginState {
    novarc: {
      // Maestro
      ctx: Contexto | null
      linhas: string[]
      faixa: string | null
      exec: Execucao
      /** auto: the band shows itself; on: forced by "ativar"; off: "desativar" or "nunca neste projeto". */
      maestroModo: 'auto' | 'on' | 'off'
      maestroAba: 'agora' | 'execucao' | 'locks' | 'pendencias' | 'inteligencia'
      /** null until this session's first registry read (Agora shows `lendo o registro…`). */
      maestroOutras: Registro[] | null
      /** Where this session's registry entry landed: the per-session file or the store fallback. */
      maestroRegistro: 'arquivo' | 'store' | null
      /** Orchestrator only: each live set session's ledger dir folded on its own, keyed by that dir (Execução tab). */
      maestroPorDir: Record<string, Execucao>
      /** Set session only: its set's stage label from the plan (estadoConjunto), drawn in the band. */
      maestroEtapa: string | null
      /** The band's fields, computed after every look, poll and event; the band render reads only this and the mode (R34). */
      maestroFaixaDados: {
        papel: string | null
        txt: string | null
        titulo: string
        status: string
        /** The first two alert texts, most urgent first. */
        alertas: string[]
        /** Orchestrator only (C02-S02): divergences or the pending counter, when no alert is shown. */
        pend: { tipo: 'divergente' | 'contador'; texto: string } | null
        segmentos: ('d' | 'w' | 'b')[]
        feitos: { n: number; total: number } | null
        /** Orchestrator only: a set ready to close (green band). */
        verde: { titulo: string; texto: string; dica: string } | null
        nAlertas: number
        abaAlerta: 'locks' | 'pendencias' | null
        nOutras: number
      } | null
      /** Alerts of this session (lock órfão, slot, calada), the toast dedupe and the last sweep. */
      maestroAlertas: Alertas | null
      /** Orchestrator only (C02-S02): the Pendências list, counter, divergences and source failures; repository text stays here (R31). */
      maestroPendencias: EstadoPendencias | null
      /** The Pendências tab's view: phase filter, doc open, search, filter, open doc item. */
      maestroPendVista: Partial<VistaPendencias> | null
      /** C11-S01: this session opened the pane and the person did not close it (reopened on session.attach). */
      maestroPainelAberto: boolean
      /** C11-S01: the last reads per source, for the trail band and the error card (`falhas`: each source on its own). */
      maestroLeitura: { at: number | null; falhou: boolean; fonte: 'planejamento' | 'registro' | null; falhas: { planejamento: boolean; registro: boolean } } | null
      /** C03-S01: observed audit records waiting for audit-flush (id assigned at queue time), at most 200. */
      auditoriaPendente: { id: string; doc: AuditoriaDoc }[]
      /** C03-S01: set and spec name -> session id, the orchestrator row (session only). */
      maestroMapa: MapaSessoes
      /** C03-S01: set session, received GO/status lines waiting for their proof (retried on two looks). */
      maestroRotas: { texto: string; tentativas: number }[]
      /** C03-S01: orchestrator, the keys of its own directives already handled (at most once, R19), seeded at start. */
      diretivasFeitas: string[]
      /** C03-S01: orchestrator, the send lifecycle per directive key (at most 200, newest kept). */
      maestroEnvios: Record<string, { acao: string; alvo: string; at: number; estado: 'enviando' | 'enviado' | 'falhou' }>
      /** C05-S01: orchestrator only, its local copy of each `GO <C> inicio` it sent (never a collection, R30). */
      maestroGos: Record<string, { sha: string; at: number; atualizadas: string[]; decisoesNovas: number; branches: string[]; merges?: string[] }>
      /** C05-S01: the set selected in the Execução tab (its detail card). */
      maestroSelConjunto: string | null
      // Acervo
      acervoData: OrganizerData
      /** Ids returned by the last list call: the account signed in now. */
      acervoCurrent: string[]
      acervoView: OrganizerView
      acervoSelected: string | null
      acervoQuery: string
      acervoStatus: string
      /** Ids ticked for a bulk action. */
      acervoPicked: string[]
      /** The row being renamed inline. */
      acervoRenaming: string | null
      /** The row whose tag picker is open below it. */
      acervoTagging: string | null
    }
  }
}
