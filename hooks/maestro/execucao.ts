// Pure helpers of Maestro v2 "olhos": recognise a session-build run without a planning artifact and follow each
// fork through the ledger.py checkpoints. No engine calls here, so tests exercise them directly.
import type { Evento, Execucao, Fork, Registro } from '../../types'
import { idDaBranch, urlOrquestrar } from './logic'

/** The checkpoint track drawn per fork, in protocol order (ledger.py CHECKPOINTS, the ones that advance a fork). */
export const TRILHA = ['READY', 'PLAN', 'CODEX', 'SURFACES', 'TASK', 'LOCK', 'PUSHED', 'DONE'] as const
export type Etapa = (typeof TRILHA)[number]

/** Every keyword ledger.py accepts as a fork checkpoint or orchestrator directive. */
const KW = new Set([
  'READY', 'PLAN', 'CODEX', 'SURFACES', 'TASK', 'LOCK', 'RELEASE', 'APPLIED', 'DEPLOYED', 'PUSHED',
  'BLOCKED', 'WAITING', 'PARKED', 'DONE', 'GO', 'HOLD', 'COORDINATE', 'MERGE',
])


export const VAZIA: Execucao = { papel: null, ledgerDir: null, forks: {} }

/** Checkpoint keyword starting a message or ledger line, or null when the text is prose. */
export function checkpoint(texto: string): { tipo: string; resto: string } | null {
  const m = texto.trim().match(/^([A-Z]+)\b\s*(.*)$/s)
  if (!m || !KW.has(m[1]!)) return null
  return { tipo: m[1]!, resto: (m[2] ?? '').split('\n')[0]!.trim() }
}

/** One fork-<slug>.md / ledger.md line written by ledger.py: `KW text  # 2026-10-15T12:00:00Z`. */
export function linhaLedger(linha: string): Evento | null {
  const m = linha.match(/^([A-Z]+)\s(.*?)\s+#\s(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ)\s*$/)
  if (!m || !KW.has(m[1]!)) return null
  return { tipo: m[1]!, texto: (m[2] ?? '').trim(), at: Date.parse(m[3]!) }
}

export function lerLedger(texto: string): Evento[] {
  return texto.split(/\r?\n/).map(linhaLedger).filter((e): e is Evento => e !== null)
}

/** A Bash command that runs ledger.py: its absolute --dir, its --fork and, for append, its --type. */
export function chamadaLedger(cmd: string): { dir: string; fork: string | null; tipo: string | null; texto: string | null } | null {
  if (!/\bledger\.py\b/.test(cmd)) return null
  const arg = (nome: string) => {
    const m = cmd.match(new RegExp(`--${nome}[ =](?:"([^"]*)"|'([^']*)'|(\\S+))`))
    return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null
  }
  const dir = arg('dir')
  if (!dir) return null
  return { dir, fork: arg('fork'), tipo: arg('type')?.toUpperCase() ?? null, texto: arg('text') }
}

/** The fork slug an Agent call names in its description: "spec <slug>" (dispatch-prompts.md 5.1). */
export function slugDoSpawn(descricao: string): string | null {
  const m = descricao.match(/^\s*spec\s+(\S+)/i)
  return m?.[1] ?? null
}

/** True when a Skill call starts session-build or novarc-session-build. */
export function ehBuild(skill: string): boolean {
  return /(^|:)(novarc-)?session-build$/.test(skill)
}

/** Spec role of a session on a spec branch (feat/c01-s01-...), without needing a plan. */
export function papelDaBranch(branch: string | null): { papel: 'spec'; conjunto: string; spec: string } | null {
  const spec = branch ? idDaBranch(branch) : null
  return spec ? { papel: 'spec', conjunto: spec.slice(0, 3), spec } : null
}

const SKILL = String.raw`^\s*\/(?:novarc:)?novarc-session-build`

/** Role announced by a session's first prompt: a skill invocation or the spec brief's `session name:` line. */
export function papelDoPrompt(texto: string): { papel: 'orquestrador' | 'conjunto' | 'spec'; codigo?: string; conjunto?: string; spec?: string; url?: string } | null {
  const n = texto.match(/^\s*session name:\s+novarc-(.+)-(C\d{2})-(S\d{2})\s*$/mi)
  if (n) return { papel: 'spec', codigo: n[1]!, conjunto: n[2]!.toUpperCase(), spec: `${n[2]}-${n[3]}`.toUpperCase() }
  const o = texto.match(new RegExp(`${SKILL}\\s+orquestrar\\b(?:\\s+(https:\\/\\/claude\\.ai\\/\\S+))?`, 'im'))
  if (o) return o[1] ? { papel: 'orquestrador', url: o[1] } : { papel: 'orquestrador' }
  const c = texto.match(new RegExp(`${SKILL}\\s+conjunto\\s+(\\S+)\\s+(C\\d{2})\\b`, 'im'))
  if (c) return { papel: 'conjunto', conjunto: c[2]!.toUpperCase(), url: c[1]! }
  return null
}

/** Role of a Skill call to session-build from its args; anything but `orquestrar` is a set session. */
export function papelDoSkill(args: string): { papel: 'orquestrador' | 'conjunto'; conjunto?: string; url?: string } {
  if (/^\s*orquestrar\b/.test(args)) {
    const url = urlOrquestrar(args)
    return url ? { papel: 'orquestrador', url } : { papel: 'orquestrador' }
  }
  const c = args.match(/^\s*conjunto\s+(\S+)\s+(C\d{2})\b/i)
  return c ? { papel: 'conjunto', conjunto: c[2]!.toUpperCase(), url: c[1]! } : { papel: 'conjunto' }
}

/** `CONJUNTO C01 implementacao ...` first line a set session reports to its orchestrator. */
export function linhaConjunto(texto: string): { conjunto: string; etapa: string; resto: string } | null {
  const m = (texto.split('\n')[0] ?? '').match(/^CONJUNTO\s+(C\d{2})\s+(\S+)\s*(.*)/)
  return m ? { conjunto: m[1]!, etapa: m[2]!, resto: m[3]!.trim() } : null
}

/** True when a spec id is unknown or belongs to set `c` (compared uppercase). */
const doConjunto = (spec: string | undefined, c: string) => !spec || spec.toUpperCase().startsWith(`${c.toUpperCase()}-`)

const idSpec = /\bc\d{2}-s\d{2}\b/gi

/** Lane a fork message belongs to inside a set session: a known fork slug, a fork of that spec, or the spec id itself. */
export function laneDaMensagem(ex: Execucao, texto: string): string | null {
  const c = ex.conjunto
  if (!c) return null
  const ids = (texto.match(idSpec) ?? []).map(i => i.toUpperCase()).filter(i => i.startsWith(`${c.toUpperCase()}-`))
  for (const f of Object.values(ex.forks)) {
    const esc = f.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`(^|[^\\w-])${esc}($|[^\\w-])`).test(texto) && doConjunto(f.spec, c)) return f.slug
  }
  for (const id of ids) {
    const f = Object.values(ex.forks).find(x => x.spec?.toUpperCase() === id)
    if (f) return f.slug
  }
  return ids[0] ?? null
}

const repete = (a: Evento, b: Evento) => a.tipo === b.tipo && a.texto === b.texto && Math.abs(a.at - b.at) < 120_000

/** Adds an event to a fork, keeping order and dropping an exact repeat (the same line seen by message and ledger). */
export function anotar(ex: Execucao, slug: string, ev: Evento, agentId?: string): Execucao {
  const f = ex.forks[slug] ?? { slug, eventos: [] }
  const repetido = f.eventos.some(x => repete(x, ev))
  let eventos = repetido ? f.eventos : [...f.eventos, ev].sort((a, b) => a.at - b.at)
  const b = ev.texto.match(/\bbranch=(\S+)/)?.[1]
  const spec = (b ? papelDaBranch(b)?.spec : undefined) ?? f.spec
  const forks = { ...ex.forks }
  let id = f.agentId ?? agentId
  const orfa = spec && spec !== slug ? forks[spec] : undefined
  if (orfa) {
    // a lane keyed by the bare spec id (from a message) folds into the slug lane the ledger gave it
    for (const e of orfa.eventos) if (!eventos.some(x => repete(x, e))) eventos = [...eventos, e]
    eventos = [...eventos].sort((a, c) => a.at - c.at)
    id = id ?? orfa.agentId
    delete forks[spec!]
  }
  forks[slug] = { ...f, agentId: id, ...(spec ? { spec } : {}), eventos }
  return { ...ex, forks }
}

/** Parses only the ledger text after `consumido`, up to its last newline; a trailing partial line waits for the next read. */
export function novasLinhas(texto: string, consumido: number): { eventos: Evento[]; consumido: number } {
  const de = consumido > texto.length ? 0 : consumido
  const fim = texto.lastIndexOf('\n')
  if (fim < de) return { eventos: [], consumido: de }
  return { eventos: lerLedger(texto.slice(de, fim + 1)), consumido: fim + 1 }
}

export type Celula = 'feito' | 'agora' | 'travado' | 'vazio'
export type Raia = { slug: string; celulas: Celula[]; rotulos: string[]; ultimo: string | null; minutos: number | null; lockAberto: boolean; rotulo?: string }

/** One lane: furthest checkpoint reached, open locks (LOCK without RELEASE/APPLIED) and minutes since the last event. */
export function raia(f: Fork, agora: number): Raia {
  const tipos = f.eventos.map(e => e.tipo)
  const idx = Math.max(-1, ...tipos.map(t => TRILHA.indexOf(t as Etapa)))
  const locks = tipos.filter(t => t === 'LOCK').length
  const soltos = tipos.filter(t => t === 'RELEASE' || t === 'APPLIED').length
  const lockAberto = locks > soltos // ponytail: counts, not per-resource; per-resource pairing when partial releases matter
  const ultimoEv = f.eventos[f.eventos.length - 1]
  const travado = ultimoEv && (ultimoEv.tipo === 'BLOCKED' || ultimoEv.tipo === 'WAITING' || ultimoEv.tipo === 'PARKED')
  const tarefa = [...f.eventos].reverse().find(e => e.tipo === 'TASK')
  const celulas: Celula[] = TRILHA.map((t, i) => {
    if (t === 'LOCK') return lockAberto ? 'travado' : i <= idx ? 'feito' : 'vazio'
    if (i < idx) return 'feito'
    if (i === idx) return travado ? 'travado' : tipos.includes('DONE') && t === 'DONE' ? 'feito' : 'agora'
    return 'vazio'
  })
  const rotulos = TRILHA.map(t => (t === 'TASK' && tarefa ? (tarefa.texto.match(/\d+\/\d+/)?.[0] ?? 'task') : t.toLowerCase()))
  return {
    slug: f.slug,
    rotulo: f.spec ?? f.slug,
    celulas,
    rotulos,
    ultimo: ultimoEv ? ultimoEv.tipo : null,
    minutos: ultimoEv ? Math.floor((agora - ultimoEv.at) / 60_000) : null,
    lockAberto,
  }
}

/** Progress of a set session for the band: forks done over forks known. */
export function progresso(ex: Execucao): { feitos: number; total: number } {
  const fs = Object.values(ex.forks)
  return { feitos: fs.filter(f => f.eventos.some(e => e.tipo === 'DONE')).length, total: fs.length }
}

/** First alert worth showing for a run: an open lock, then the quietest fork past the threshold. */
export function alerta(ex: Execucao, agora: number, calado = 15): string | null {
  return alertaRaias(Object.values(ex.forks).map(f => raia(f, agora)), calado)
}

/** Same rule as `alerta` over any lane list (e.g. every lane of a run's sets); text uses the spec id when a lane has one. */
export function alertaRaias(rs: Raia[], calado = 15): string | null {
  const nome = (r: Raia) => r.rotulo ?? r.slug
  const lock = rs.find(r => r.lockAberto)
  if (lock) return `${nome(lock)} segura lock`
  const quieto = rs.filter(r => r.ultimo !== 'DONE' && r.minutos !== null && r.minutos >= calado).sort((a, b) => (b.minutos ?? 0) - (a.minutos ?? 0))[0]
  return quieto ? `${nome(quieto)} calado há ${quieto.minutos} min` : null
}

const feita = (r: Raia) => r.celulas[r.celulas.length - 1] === 'feito'

/** Band text of a set session: `C01 · Em implementação · 1/2 specs`; the fraction counts DONE spec lanes. */
export function faixaConjuntoRaias(conjunto: string, etapa: string | null, raias: Raia[]): string {
  return `${conjunto} · ${etapa ?? 'Em implementação'} · ${raias.filter(feita).length}/${raias.length} specs`
}

/** One block per live set entry: its ledger lanes that belong to that set, labelled by spec id when known. */
export function raiasPorConjunto(
  regs: Registro[],
  porDir: Record<string, Execucao>,
  agora: number,
  titulos: Record<string, string> = {},
): { conjunto: string; titulo: string; raias: (Raia & { rotulo: string })[] }[] {
  return regs
    .filter(r => r.papel === 'conjunto' && r.conjunto && vivo(r, agora))
    .sort((a, b) => a.conjunto!.localeCompare(b.conjunto!))
    .map(r => {
      const c = r.conjunto!
      const forks = Object.values((r.ledgerDir && porDir[r.ledgerDir]?.forks) || {})
      const raias = forks
        .map(f => ({ f, spec: f.spec ?? (/^C\d{2}-S\d{2}$/i.test(f.slug) ? f.slug.toUpperCase() : undefined) }))
        .filter(x => doConjunto(x.spec, c))
        .map(x => ({ ...raia(x.f, agora), rotulo: x.spec ?? x.f.slug }))
      return { conjunto: c, titulo: titulos[c] ?? '', raias }
    })
}

export type Cartao = { chave: string; titulo: string; papel: string; linha: string; alerta: string | null; meu: boolean; at: number }

/** Runs of the machine: entries sharing a codigo, artefato or ledgerDir are one run; the rest stand alone. */
function agrupar(regs: Registro[]): Registro[][] {
  const pai = regs.map((_, i) => i)
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i]!)))
  const visto = new Map<string, number>()
  regs.forEach((r, i) => {
    for (const k of [['c', r.codigo], ['a', r.artefato], ['d', r.ledgerDir]] as const) {
      if (!k[1]) continue
      const j = visto.get(`${k[0]}:${k[1]}`)
      if (j === undefined) visto.set(`${k[0]}:${k[1]}`, i)
      else pai[raiz(i)] = raiz(j)
    }
  })
  const grupos = new Map<number, Registro[]>()
  regs.forEach((r, i) => grupos.set(raiz(i), [...(grupos.get(raiz(i)) ?? []), r]))
  return [...grupos.values()]
}

/** The entries of the run session `eu` belongs to (by the same identity as the Agora cards); none before its entry is read. */
export function daMinhaExecucao(regs: Registro[], eu: string): Registro[] {
  return agrupar(regs).find(g => g.some(r => r.sessao === eu)) ?? []
}

/** Agora tab: one card per run (see `agrupar`). */
export function cartoesAgora(regs: Registro[], eu: string): Cartao[] {
  const cartoes = agrupar(regs).map((g): Cartao => {
    const novos = [...g].sort((a, b) => b.at - a.at)
    const orq = g.filter(r => r.papel === 'orquestrador')
    const conj = g.filter(r => r.papel === 'conjunto')
    const specs = g.filter(r => r.papel === 'spec')
    const meu = g.some(r => r.sessao === eu)
    const cwd = (novos[0]!.cwd ?? '').split(/[\\/]/).filter(Boolean).pop() ?? ''
    const c = conj.find(r => r.conjunto)?.conjunto
    const linha = orq.length
      ? `orquestradora + ${conj.length} conjuntos + ${specs.length} specs`
      : c
        ? g.some(r => r.artefato) ? `conjunto ${c} · ${specs.length} specs` : `conjunto ${c} · sem planejamento`
        : specs.length ? `${specs.length} specs` : 'sem execução'
    return {
      chave: g.map(r => r.sessao).sort()[0]!,
      titulo: novos.find(r => r.projeto)?.projeto ?? cwd,
      papel: meu ? 'esta sessão' : orq.length ? 'orquestradora' : conj.length ? 'conjunto' : specs.length ? 'spec' : 'parado',
      linha,
      alerta: novos.find(r => r.alerta)?.alerta ?? null,
      meu,
      at: novos[0]!.at,
    }
  })
  return cartoes.sort((a, b) => b.at - a.at).slice(0, 10)
}

/** A registry entry is live while its session wrote in the last 30 minutes. */
export function vivo(r: Registro, agora: number): boolean {
  return agora - r.at < 30 * 60_000
}
