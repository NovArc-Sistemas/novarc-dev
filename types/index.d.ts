// ---- Maestro: the NOVARC execution mod (hooks/maestro)

export type Contexto = {
  artefato: string
  plano: unknown
  conjunto: string | null
  spec: string | null
  papel: 'conjunto' | 'orquestrador' | 'spec' | null
}

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
  spec?: string | null
  branch?: string | null
  pai?: string | null
  artefato?: string | null
  ledgerDir?: string | null
  /** Orchestrator only: the last CONJUNTO line each set reported. */
  conjuntos?: Record<string, { etapa: string; texto: string; at: number }>
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
      maestroAba: 'agora' | 'execucao' | 'locks'
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
        rotulo: string
        texto: string
        extra: string | null
        quadrados: string[]
        alerta: string | null
        nOutras: number
      } | null
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
