// ---- Maestro: the NOVARC execution mod (hooks/maestro)

export type Contexto = {
  artefato: string
  plano: unknown
  conjunto: string | null
  spec: string | null
  papel: 'conjunto' | 'orquestrador' | null
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
