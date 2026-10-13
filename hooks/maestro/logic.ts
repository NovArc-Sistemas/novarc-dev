// Pure helpers of the novarc mod: no engine calls here, so tests can exercise them directly.

export const ETAPAS = ['iniciado', 'plano-aprovado', 'implementando', 'branch-publicada', 'pr-aberto', 'merge'] as const
export type Etapa = (typeof ETAPAS)[number]

export const ETAPA_LABEL: Record<Etapa, string> = {
  iniciado: 'iniciado',
  'plano-aprovado': 'plano aprovado',
  implementando: 'implementando',
  'branch-publicada': 'branch publicada',
  'pr-aberto': 'PR aberto',
  merge: 'mergeado',
}

export type PlanoSpec = { id: string; conjunto: string; slug: string; mudancas?: string[] }
export type PlanoConjunto = { id: string; titulo: string; specs: string[]; dependeDe?: string[]; prompt?: string }
export type Plano = { conjuntos?: PlanoConjunto[]; specs?: PlanoSpec[]; execucao?: { orquestrador?: string } }
export type SpecDoc = {
  etapa?: Etapa | null
  bloqueios?: Record<string, { motivo?: string }>
  validacao?: { resultado?: string; sha?: string }
  headSha?: string
  branch?: string
  pr?: string
  removido?: boolean
}
export type ConjuntoDoc = { iniciadoEm?: string; bloqueios?: Record<string, { motivo?: string }> }

/** Rank of an etapa; -1 for none. */
export function rank(etapa: string | null | undefined): number {
  return etapa ? ETAPAS.indexOf(etapa as Etapa) : -1
}

/** Maps a branch name to its spec by the exact spec id it carries (R16): feature/c01-s02-slug-20261012 -> C01-S02. */
export function specDaBranch(branch: string, plano: Plano): PlanoSpec | null {
  const m = branch.toLowerCase().match(/(?:^|[\/-])(c\d{2}-s\d{2})(?:-|$)/)
  if (!m) return null
  const id = m[1].toUpperCase()
  return (plano.specs || []).find(s => s.id === id) || null
}

/** Branch named in a `git push` command line, if any (the last non-flag argument after the remote). */
export function branchDoPush(command: string): string | null {
  const m = command.match(/\bgit\s+push\b([^;&|]*)/)
  if (!m) return null
  const args = m[1].trim().split(/\s+/).filter(a => a && !a.startsWith('-'))
  if (args.length < 2) return null
  const ref = args[args.length - 1]
  return ref.includes(':') ? ref.split(':').pop() || null : ref
}

/** First PR url printed by `gh pr create`. */
export function urlDoPr(text: string): string | null {
  const m = text.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/)
  return m ? m[0] : null
}

export type EstadoConjunto = {
  id: string
  status: 'nao-iniciado' | 'em-andamento' | 'concluido' | 'bloqueado'
  etapa: Etapa | null
  feitos: number
  total: number
  validado: boolean
}

/** Derives a set's state from its spec documents (R18: the aggregate is never stored). */
export function estadoConjunto(c: PlanoConjunto, specs: Record<string, SpecDoc>, doc?: ConjuntoDoc): EstadoConjunto {
  const docs = c.specs.map(id => specs[id] || {})
  const bloqueado = Object.keys(doc?.bloqueios || {}).length > 0 || docs.some(d => Object.keys(d.bloqueios || {}).length > 0)
  const ranks = docs.map(d => rank(d.etapa))
  const feitos = ranks.filter(r => r === ETAPAS.indexOf('merge')).length
  const menor = ranks.length ? Math.min(...ranks) : -1
  const algum = ranks.some(r => r >= 0) || !!doc?.iniciadoEm
  const validado = docs.length > 0 && docs.every(d => d.validacao?.resultado === 'aprovado' && !!d.headSha && d.validacao?.sha === d.headSha)
  const status = bloqueado ? 'bloqueado' : feitos === docs.length && docs.length > 0 ? 'concluido' : algum ? 'em-andamento' : 'nao-iniciado'
  return { id: c.id, status, etapa: menor >= 0 ? ETAPAS[menor] : null, feitos, total: docs.length, validado }
}

/** Sets whose dependencies are all concluded and that have not started: ready to dispatch. */
export function liberados(plano: Plano, specs: Record<string, SpecDoc>, conjuntos: Record<string, ConjuntoDoc>): string[] {
  const cs = plano.conjuntos || []
  const st = new Map(cs.map(c => [c.id, estadoConjunto(c, specs, conjuntos[c.id])]))
  return cs.filter(c => st.get(c.id)!.status === 'nao-iniciado' && (c.dependeDe || []).every(d => st.get(d)?.status === 'concluido')).map(c => c.id)
}

/** A set ready to close: every spec published or later and validated at its head, not all merged, no block. */
export function prontoParaFechar(e: EstadoConjunto): boolean {
  return e.status === 'em-andamento' && e.validado && rank(e.etapa) >= rank('branch-publicada')
}

/** Sets the orchestrator may send FECHA to (orquestrar.md 5.1): ready to close, every dependency concluded. */
export function aFechar(plano: Plano, specs: Record<string, SpecDoc>, conjuntos: Record<string, ConjuntoDoc>): string[] {
  const cs = plano.conjuntos || []
  const st = new Map(cs.map(c => [c.id, estadoConjunto(c, specs, conjuntos[c.id])]))
  return cs.filter(c => prontoParaFechar(st.get(c.id)!) && (c.dependeDe || []).every(d => st.get(d)?.status === 'concluido')).map(c => c.id)
}

/** Artifact url of a `/novarc-session-build orquestrar <url> ...` invocation, if that is what the args are. */
export function urlOrquestrar(args: string): string | null {
  const m = args.match(/^\s*orquestrar\s+(https:\/\/claude\.ai\/\S+)/)
  return m ? m[1] : null
}

/** One-line text for the band of a set session. */
export function faixaConjunto(c: PlanoConjunto, e: EstadoConjunto): string {
  const etapa = e.status === 'bloqueado' ? 'bloqueado' : e.etapa ? ETAPA_LABEL[e.etapa] : 'não iniciado'
  const fim = prontoParaFechar(e) ? ' · pronto para fechar' : e.validado ? ' · validado' : ''
  return `${c.id} · ${etapa} · ${e.feitos}/${e.total} specs${fim}`
}

export type DbDoc = { id: string; data: Record<string, unknown>; version: number }

/**
 * Parses an ArtifactData get/list/query result. The tool prints one JSON object per line between
 * BEGIN/END ARTIFACT DB markers: {"id","data","version","updatedAt"}. Lines that are not such objects are ignored.
 */
export function lerDocs(text: string): DbDoc[] {
  const out: DbDoc[] = []
  for (const linha of text.split(/\r?\n/)) {
    const t = linha.trim()
    if (!t.startsWith('{"id"')) continue
    try {
      const o = JSON.parse(t)
      if (typeof o.id === 'string' && typeof o.version === 'number' && o.data && typeof o.data === 'object') out.push({ id: o.id, data: o.data, version: o.version })
    } catch {
      // not a document line
    }
  }
  return out
}
