// Pure helpers of Maestro v2 "olhos": recognise a session-build run without a planning artifact and follow each
// fork through the ledger.py checkpoints. No engine calls here, so tests exercise them directly.
import type { Alerta, Evento, Execucao, Fork, LinhaSweep, MapaSessoes, Registro, Slots } from '../../types'
import { idDaBranch, urlOrquestrar, type EspelhoConjunto, type Proposta, type Ritmo } from './logic'
import { itensACaminho } from './pendencias'
import { lerSurfaces, manifestosDisjuntos } from './guardas'

/** The checkpoint track drawn per fork, in protocol order (ledger.py CHECKPOINTS, the ones that advance a fork). */
export const TRILHA = ['READY', 'PLAN', 'CODEX', 'SURFACES', 'TASK', 'LOCK', 'PUSHED', 'DONE'] as const
export type Etapa = (typeof TRILHA)[number]

/** Every keyword ledger.py accepts as a fork checkpoint or orchestrator directive. */
const KW = new Set([
  'READY', 'PLAN', 'CODEX', 'SURFACES', 'TASK', 'LOCK', 'RELEASE', 'APPLIED', 'DEPLOYED', 'PUSHED',
  'BLOCKED', 'WAITING', 'PARKED', 'DONE', 'GO', 'HOLD', 'COORDINATE', 'MERGE',
])
/** A ledger line may also be a NOTE (PRE-FECHAMENTO, CUT, ...): kept as an event, never a message checkpoint (R26). */
const KW_LEDGER = new Set([...KW, 'NOTE'])

/** A lane's checkpoints: every event but NOTE, which moves no lane and resets no quiet clock. */
export const marcos = (evs: Evento[]) => (evs.some(e => e.tipo === 'NOTE') ? evs.filter(e => e.tipo !== 'NOTE') : evs)


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
  if (!m || !KW_LEDGER.has(m[1]!)) return null
  return { tipo: m[1]!, texto: (m[2] ?? '').trim(), at: Date.parse(m[3]!) }
}

export function lerLedger(texto: string): Evento[] {
  return texto.split(/\r?\n/).map(linhaLedger).filter((e): e is Evento => e !== null)
}

type Palavra = { v: string; artefato: boolean }

/**
 * Shell words of a command line: whitespace splits; `;` `|` `&` `&&` `||` and newline are operators; an unquoted `#`
 * starting a word comments out the rest of the line; single quotes are literal; double quotes keep their content with
 * `\` escaping only `"` `\` `$` and a backtick (so `"C:\repo\x"` stays a Windows path); an unquoted `\` escapes
 * whitespace, quotes, `\`, `$`, `#`, `;`, `|`, `&` and is kept literally before anything else. `artefato`: the word held a
 * `$` or a backtick outside single quotes. An unclosed quote gives null.
 */
function tokensShell(cmd: string): (Palavra | { op: string })[] | null {
  const out: (Palavra | { op: string })[] = []
  let w = ''
  let tem = false
  let art = false
  const fim = () => {
    if (tem) out.push({ v: w, artefato: art })
    w = ''
    tem = false
    art = false
  }
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i]!
    if (ch === "'") {
      const j = cmd.indexOf("'", i + 1)
      if (j < 0) return null
      w += cmd.slice(i + 1, j)
      tem = true
      i = j
    } else if (ch === '"') {
      tem = true
      let j = i + 1
      for (; j < cmd.length && cmd[j] !== '"'; j++) {
        if (cmd[j] === '\\' && /["\\$`]/.test(cmd[j + 1] ?? '')) w += cmd[++j]
        else {
          if (/[$`]/.test(cmd[j]!)) art = true
          w += cmd[j]
        }
      }
      if (j >= cmd.length) return null
      i = j
    } else if (ch === '\\') {
      const nx = cmd[i + 1]
      if (nx !== undefined && /[\s'"\\$#;|&]/.test(nx)) {
        w += nx
        i++
      } else w += ch
      tem = true
    } else if (ch === '#' && !tem) {
      while (i + 1 < cmd.length && cmd[i + 1] !== '\n') i++
    } else if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') {
      fim()
      const dois = (ch === '&' || ch === '|') && cmd[i + 1] === ch
      out.push({ op: dois ? ch + ch : ch })
      if (dois) i++
    } else if (/\s/.test(ch)) fim()
    else {
      if (ch === '$' || ch === '`') art = true
      w += ch
      tem = true
    }
  }
  fim()
  return out
}

const PYTHON = /(^|[\\/])(python3?|py)(\.exe)?$/i
const FLAGS = new Set(['--dir', '--fork', '--type', '--text'])

/**
 * A Bash command that runs ledger.py: its absolute --dir, its --fork, for append its --type, and the script path when
 * the command named it absolutely (the copy the agent runs, so the mod's own sweep reads the same ledger format).
 * Flags are read only as words of the ledger.py invocation (its own command segment), never inside another flag's value,
 * another command or a comment (finding 6). A `--dir`/`--fork` holding a shell variable, a backtick or a leftover quote,
 * or a `--fork` that is not a slug, comes back null while `temFork` still says a --fork was given (the role rule).
 */
export function chamadaLedger(
  cmd: string,
): { dir: string | null; fork: string | null; temFork: boolean; tipo: string | null; texto: string | null; script: string | null } | null {
  if (!/\bledger\.py\b/.test(cmd)) return null
  const ts = tokensShell(cmd)
  if (!ts) return null
  const segs: Palavra[][] = [[]]
  for (const t of ts) {
    if ('op' in t) segs.push([])
    else segs[segs.length - 1]!.push(t)
  }
  let args: Palavra[] | null = null
  let script = ''
  for (const s of segs) {
    let k = 0
    while (k < s.length && (/^[A-Za-z_]\w*=/.test(s[k]!.v) || s[k]!.v === 'time' || s[k]!.v === 'command')) k++
    const p = s[k]?.v ?? ''
    const q = PYTHON.test(p) ? k + 1 : k
    if ((s[q]?.v ?? '').endsWith('ledger.py')) {
      script = s[q]!.v
      args = s.slice(q + 1)
      break
    }
  }
  if (!args) return null
  const val: Record<string, Palavra> = {}
  let temFork = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!.v
    const eq = a.match(/^(--(?:dir|fork|type|text))=(.*)$/s)
    if (eq) {
      val[eq[1]!] = { v: eq[2]!, artefato: args[i]!.artefato }
      if (eq[1] === '--fork') temFork = true
    } else if (FLAGS.has(a)) {
      if (a === '--fork') temFork = true
      const prox = args[i + 1]
      if (prox) val[a] = prox
      i++ // the value is consumed, never read as a flag
    } else if (a.startsWith('--') && args[i + 1] && !args[i + 1]!.v.startsWith('--')) i++ // an unknown flag and its value
  }
  const limpo = (p: Palavra | undefined) => (!p || p.artefato || /["'`$]/.test(p.v) ? null : p.v)
  if (!val['--dir']) return null
  const fork = limpo(val['--fork'])
  return {
    dir: limpo(val['--dir']),
    fork: fork !== null && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(fork) ? fork : null,
    temFork,
    tipo: val['--type']?.v.toUpperCase() ?? null,
    texto: val['--text']?.v ?? null,
    script: /^([a-zA-Z]:)?[\\/]/.test(script) ? script : null,
  }
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

// C05-S01: the line right after a minimal brief's `session name:` line starts `Aguarde o GO`
const ESPERA = /^[^\S\r\n]*session name:[^\r\n]*\r?\n[^\S\r\n]*Aguarde o GO/mi

/**
 * Role announced by a session's first prompt: a skill invocation, the spec brief's `session name:` line, or a C05-S01
 * minimal brief (set or spec), which also gives `aguardandoGo` and, for the set, the planning url of its first line.
 */
export function papelDoPrompt(texto: string): { papel: 'orquestrador' | 'conjunto' | 'spec'; codigo?: string; conjunto?: string; spec?: string; url?: string; aguardandoGo?: boolean } | null {
  const espera = ESPERA.test(texto)
  const n = texto.match(/^\s*session name:\s+novarc-(.+)-(C\d{2})-(S\d{2})\s*$/mi)
  if (n) return { papel: 'spec', codigo: n[1]!, conjunto: n[2]!.toUpperCase(), spec: `${n[2]}-${n[3]}`.toUpperCase(), ...(espera ? { aguardandoGo: true } : {}) }
  const v = espera ? texto.match(/^\s*session name:\s+novarc-(.+)-(C\d{2})\s*$/mi) : null
  if (v) {
    const url = texto.split(/\r?\n/)[0]!.match(/https:\/\/claude\.ai\/[^\s)]+/)?.[0]?.replace(/[.)]+$/, '')
    return { papel: 'conjunto', codigo: v[1]!, conjunto: v[2]!.toUpperCase(), ...(url ? { url } : {}), aguardandoGo: true }
  }
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
  // the spec comes only from a READY's branch= field: another line's text may quote a branch (finding 6)
  const b = ev.tipo === 'READY' ? ev.texto.match(/\bbranch=(\S+)/)?.[1] : undefined
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
export type Raia = {
  slug: string
  celulas: Celula[]
  rotulos: string[]
  ultimo: string | null
  minutos: number | null
  lockAberto: boolean
  rotulo?: string
  /** C11-S01: when each TRILHA step was first seen (ms), null when never: the lanes table's tooltips. */
  inicios: (number | null)[]
}

/** One lane: furthest checkpoint reached, open locks (LOCK without RELEASE/APPLIED) and minutes since the last event. */
export function raia(f: Fork, agora: number): Raia {
  const evs = marcos(f.eventos)
  if (evs !== f.eventos) f = { ...f, eventos: evs }
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
    inicios: TRILHA.map(t => f.eventos.find(e => e.tipo === t)?.at ?? null),
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

// ---- C02-S01: lock sweep, alerts, rhythm and the mirror (pure; register.tsx wires them to the loops)

/** Quiet and orphan thresholds, in minutes, until the run's own rhythm is measured. */
export const LIMIARES_PADRAO = { calado: 15, lockOrfao: 20 }

/**
 * The `SWEEP OUTSTANDING` lines of `ledger.py sweep`. A resource that is a date or `UTC` comes from a free-text LOCK
 * body and is dropped. `semLeitura`: the output is not a result (exit other than 0/1, no fork file, no summary line),
 * so it must never read as "no locks".
 */
export function lerSweep(stdout: string, exitCode: number): { linhas: LinhaSweep[]; semLeitura: boolean } {
  const linhas: LinhaSweep[] = []
  let resumo = false
  let zero = false
  for (const l of String(stdout).split(/\r?\n/)) {
    if (l.startsWith('SWEEP SUMMARY')) resumo = true
    if (l.startsWith('SWEEP WARNING 0 fork ledger files')) zero = true
    const m = l.match(/^SWEEP OUTSTANDING (\S+) (\S+) (\S+) \[([A-Z-]+)\] since=(\S+)/)
    if (!m || /^\d{4}-\d\d-\d\d$/.test(m[3]!) || m[3] === 'UTC') continue
    linhas.push({ slug: m[1]!, kind: m[2]!, resource: m[3]!, estado: m[4]!, desde: m[5] === '-' ? null : m[5]! })
  }
  return { linhas, semLeitura: (exitCode !== 0 && exitCode !== 1) || zero || !resumo }
}

/** Change marker of a ledger dir: every fork file's name, size and mtime, so compensated edits still change it. */
export function marcadorDir(arquivos: { name: string; size: number; mtimeMs: number }[]): string {
  return arquivos
    .filter(f => /^fork-.+\.md$/.test(String(f.name)))
    .map(f => `${f.name}:${f.size}:${f.mtimeMs}`)
    .sort()
    .join('|')
}

export type LockAberto = { spec: string; kind: string; resource: string; desde: string; estado: string; espera?: string[] }

const minutosDesde = (agora: number, quando: number) => Math.floor((agora - quando) / 60_000)

/** Outstanding locks held at least `limiarMin` minutes, oldest first. */
export function orfaos(locks: LockAberto[], agora: number, limiarMin: number): (LockAberto & { minutos: number })[] {
  return locks
    .map(l => ({ ...l, minutos: minutosDesde(agora, Date.parse(l.desde)) }))
    .filter(l => Number.isFinite(l.minutos) && l.minutos >= limiarMin)
    .sort((a, b) => b.minutos - a.minutos)
}

/** Units (sets or specs) not done whose last checkpoint is at least `limiarMin` minutes old, most quiet first. */
export function calados(unidades: { unidade: string; at: number; feito: boolean }[], agora: number, limiarMin: number): { unidade: string; at: number; minutos: number }[] {
  return unidades
    .filter(u => !u.feito)
    .map(u => ({ unidade: u.unidade, at: u.at, minutos: minutosDesde(agora, u.at) }))
    .filter(u => u.minutos >= limiarMin)
    .sort((a, b) => b.minutos - a.minutos)
}

const KINDS_SLOT = ['verify', 'producao'] as const

/**
 * The orchestrator's slots from its own ledger.md (orquestrar.md 4): a `GO <C> <kind> <branch>` with no later
 * `RELEASE <kind> <branch>` holds the slot; `LOCK <kind> <branch> <C> ...` lines with no GO after them are the queue.
 */
export function slotsAbertos(eventos: Evento[]): Slots {
  const out = {} as Slots
  for (const kind of KINDS_SLOT) {
    const donos = new Map<string, { conjunto: string; branch: string; desde: string }>()
    const fila = new Map<string, { conjunto: string; branch: string; desde: string }>()
    for (const e of [...eventos].sort((a, b) => a.at - b.at)) {
      const t = e.texto.split(/\s+/).filter(Boolean)
      const desde = new Date(e.at).toISOString()
      if (e.tipo === 'GO' && t[1] === kind && t[2]) {
        donos.set(t[2], { conjunto: t[0]!, branch: t[2], desde })
        fila.delete(t[2])
      } else if (e.tipo === 'RELEASE' && t[0] === kind && t[1]) {
        donos.delete(t[1])
        fila.delete(t[1])
      } else if (e.tipo === 'LOCK' && t[0] === kind && t[1] && !donos.has(t[1]) && !fila.has(t[1])) {
        fila.set(t[1], { conjunto: t[2] ?? '', branch: t[1], desde })
      }
    }
    out[kind] = { dono: [...donos.values()][0] ?? null, fila: [...fila.values()] }
  }
  return out
}

/** Held slots at least `limiarMin` minutes old. */
export function slotsPresos(s: Slots, agora: number, limiarMin: number): { conjunto: string; kind: 'verify' | 'producao'; branch: string; minutos: number }[] {
  return KINDS_SLOT.flatMap(kind => {
    const d = s[kind].dono
    const minutos = d ? minutosDesde(agora, Date.parse(d.desde)) : -1
    return d && minutos >= limiarMin ? [{ conjunto: d.conjunto, kind, branch: d.branch, minutos }] : []
  })
}

/** Alerts in band priority (R11): orphan locks, held slots, quiet sets, quiet specs. */
export function montarAlertas(
  a: { orfaos: ReturnType<typeof orfaos>; slots: ReturnType<typeof slotsPresos>; conjuntos: ReturnType<typeof calados>; specs: ReturnType<typeof calados> },
  agora: number,
): Alerta[] {
  const al = (chave: string, texto: string, toast: string): Alerta => ({ chave, texto, toast, nivel: 'erro', at: agora })
  const calada = (c: { unidade: string; at: number; minutos: number }) =>
    al(`calado:${c.unidade}:${c.at}`, `${c.unidade} calada há ${c.minutos} min`, `Maestro: ${c.unidade} calada há ${c.minutos} min`)
  return [
    ...a.orfaos.map(o => al(`lock:${o.spec}:${o.kind}:${o.resource}:${o.desde}`, `lock órfão em ${o.spec}`, `Maestro: ${o.spec} segura ${o.resource} há ${o.minutos} min sem RELEASE`)),
    ...a.slots.map(s => al(`slot:${s.conjunto}:${s.kind}:${s.branch}`, `${s.conjunto} segura o slot ${s.kind} há ${s.minutos} min`, `Maestro: ${s.conjunto} segura o slot ${s.kind} há ${s.minutos} min sem RELEASE`)),
    ...a.conjuntos.map(calada),
    ...a.specs.map(calada),
  ]
}

/** Toasts for keys not seen yet; the returned `vistos` holds only keys still alerting (a cleared key leaves). */
export function novosToasts(lista: Alerta[], vistos: string[]): { toasts: string[]; vistos: string[] } {
  return { toasts: lista.filter(a => !vistos.includes(a.chave)).map(a => a.toast), vistos: lista.map(a => a.chave) }
}

export function cortar<T>(linhas: T[], max: number): { linhas: T[]; mais: number } {
  return { linhas: linhas.slice(0, max), mais: Math.max(0, linhas.length - max) }
}

function mediana(xs: number[]): number | null {
  if (!xs.length) return null
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2
}

/**
 * Rhythm of a set's lanes: median minutes between consecutive checkpoints and from each `LOCK <kind> <res>` to the
 * first later RELEASE (or APPLIED, kind migration) naming it. Statistics only: the outstanding rule stays ledger.py's.
 */
export function ritmo(forks: Fork[]): Ritmo {
  const gaps: number[] = []
  const locks: number[] = []
  for (const f of forks) {
    const evs = [...marcos(f.eventos)].sort((a, b) => a.at - b.at)
    for (let i = 1; i < evs.length; i++) gaps.push((evs[i]!.at - evs[i - 1]!.at) / 60_000)
    evs.forEach((e, i) => {
      if (e.tipo !== 'LOCK') return
      const [kind, res = '-'] = e.texto.split(/\s+/)
      const fim = evs.slice(i + 1).find(x => {
        const t = x.texto.split(/\s+/)
        return (x.tipo === 'RELEASE' && t[0] === kind && t.slice(1).includes(res)) || (x.tipo === 'APPLIED' && kind === 'migration' && t.includes(res))
      })
      if (fim) locks.push((fim.at - e.at) / 60_000)
    })
  }
  return { checkpointMin: mediana(gaps), lockMin: mediana(locks), amostras: gaps.length }
}

/** The run's rhythm over every set's espelho: medians of the medians, samples summed. */
export function ritmoTotal(ritmos: Ritmo[]): Ritmo {
  const de = (k: 'checkpointMin' | 'lockMin') => mediana(ritmos.map(r => r[k]).filter((x): x is number => x !== null))
  return { checkpointMin: de('checkpointMin'), lockMin: de('lockMin'), amostras: ritmos.reduce((a, r) => a + r.amostras, 0) }
}

/** 2 x the measured medians, floor 5 min, only with at least 5 samples in total (d-limiares-pratica). */
export function proposta(ritmos: Ritmo[], at: string): Proposta | null {
  const r = ritmoTotal(ritmos)
  if (r.amostras < 5) return null
  const dobro = (m: number | null, padrao: number) => (m === null ? padrao : Math.max(5, Math.round(2 * m)))
  return { calado: dobro(r.checkpointMin, LIMIARES_PADRAO.calado), lockOrfao: dobro(r.lockMin, LIMIARES_PADRAO.lockOrfao), amostras: r.amostras, at }
}

/** The thresholds line of the Locks e filas tab. */
export function textoLimiares(l: { calado: number; lockOrfao: number }, r: Ritmo): string {
  if (r.amostras < 5) return `limiares: calada ${l.calado} min · órfão ${l.lockOrfao} min · medindo o seu ritmo`
  const n = (m: number | null) => (m === null ? '?' : String(Math.round(m)))
  return `limiares: calada ${l.calado} min (seu normal ${n(r.checkpointMin)}) · órfão ${l.lockOrfao} min (seu normal ${n(r.lockMin)})`
}

const CREDENCIAL = /gh[opsu]_|github_pat_|sbp_|eyJ/

/**
 * The common cut for any mirrored line: when it looks like a credential, only its first token when that token is an
 * all-caps protocol keyword (NOTE, CUT, PARKED, PRE-FECHAMENTO: no credential prefix can match that shape), else the
 * fixed marker `[removido]`; otherwise 120 characters.
 */
export function cortarTexto(linha: string): string {
  const t = String(linha).trim()
  if (!CREDENCIAL.test(t)) return t.slice(0, 120)
  const kw = t.split(/\s+/)[0] ?? ''
  return /^[A-Z][A-Z-]*$/.test(kw) && !CREDENCIAL.test(kw) ? kw : '[removido]'
}

const I_N = /^\d+\/\d+$/
const SLUG = /^[a-z0-9][a-z0-9-]*$/
const RECURSO = (t: string) => t === '-' || (t.length <= 100 && !t.endsWith(':') && !t.includes('=') && /^[\w./@+-]+$/.test(t) && /[/._\-\d]/.test(t))
const recursos = (ts: string[]) => {
  let n = 0
  while (n < ts.length && RECURSO(ts[n]!)) n++
  return n
}

/**
 * `espelho.specs[].texto` (R23; R23 over A23 by ruling): only the structured protocol fields of a checkpoint, read left
 * to right and stopping at the first token that does not fit; resource values are counted, never copied. Then cortarTexto.
 */
export function textoCheckpoint(ev: Evento): string {
  const tipo = ev.tipo
  if (CREDENCIAL.test(`${tipo} ${ev.texto}`)) return tipo
  const t = ev.texto.split(/\s+/).filter(Boolean)
  let out = tipo
  if (tipo === 'TASK') {
    if (I_N.test(t[0] ?? '')) out = `TASK ${t[0]}`
    else if (/^[A-Za-z0-9]{1,12}$/.test(t[0] ?? '') && I_N.test(t[1] ?? '')) out = `TASK ${t[0]} ${t[1]}`
  } else if (tipo === 'LOCK' || tipo === 'RELEASE') {
    if (/^[a-z][a-z0-9-]*$/.test(t[0] ?? '')) {
      const n = recursos(t.slice(1))
      out = n ? `${tipo} ${t[0]} ${n} recurso(s)` : `${tipo} ${t[0]}`
    }
  } else if (tipo === 'APPLIED' || tipo === 'DEPLOYED') {
    const n = recursos(t)
    if (n) out = `${tipo} ${n} recurso(s)`
  } else if (tipo === 'READY') {
    if (SLUG.test(t[0] ?? '')) out = /^branch=[\w./+-]+$/.test(t[1] ?? '') ? `READY ${t[0]} ${t[1]}` : `READY ${t[0]}`
  } else if (tipo === 'PLAN') {
    const i = t.indexOf('TASKS')
    if (i >= 0 && /^\d+$/.test(t[i + 1] ?? '')) out = `PLAN TASKS ${t[i + 1]}`
  } else if (tipo === 'CODEX') {
    if (t[0] === 'APPROVED' && t[1] === 'ROUNDS' && /^\d+$/.test(t[2] ?? '')) out = `CODEX APPROVED ROUNDS ${t[2]}`
    else if (t[0] === 'STALL' && t[1] === 'ROUND' && /^\d+$/.test(t[2] ?? '')) out = `CODEX STALL ROUND ${t[2]}`
  } else if (tipo === 'PUSHED') {
    if (/^[\w./+-]+$/.test(t[0] ?? '')) out = /^[0-9a-f]{7}\.\.[0-9a-f]{7}$/.test(t[1] ?? '') ? `PUSHED ${t[0]} ${t[1]}` : `PUSHED ${t[0]}`
  } else if (tipo === 'SURFACES' || tipo === 'DONE') {
    if (SLUG.test(t[0] ?? '')) out = `${tipo} ${t[0]}`
  }
  return cortarTexto(out)
}

/** Spec id of a lane: the READY branch's id, else the id in the slug, else the slug. */
const specDaLane = (ex: Execucao, slug: string) => ex.forks[slug]?.spec ?? idDaBranch(slug) ?? slug

/**
 * The espelho body of a set session (without `at`): locks from the sweep (holder = the granted line, else the oldest;
 * the other specs on the same resource in `espera`), each lane's last checkpoint, and the rhythm. A stampless LOCK takes
 * the first time this session saw it outstanding (`vistoEm`, key `<slug> <kind> <resource>`).
 */
export function resumoEspelho(ex: Execucao, linhas: LinhaSweep[], vistoEm: Record<string, string>): Omit<EspelhoConjunto, 'at'> {
  type Um = { spec: string; desde: string; estado: 'GRANTED-NOT-RELEASED' | 'UNGRANTED' }
  const grupos = new Map<string, Um[]>()
  for (const l of linhas) {
    const k = `${l.kind} ${l.resource}`
    const desde = l.desde ?? vistoEm[`${l.slug} ${l.kind} ${l.resource}`] ?? ''
    const estado = l.estado === 'GRANTED-NOT-RELEASED' ? 'GRANTED-NOT-RELEASED' : 'UNGRANTED'
    grupos.set(k, [...(grupos.get(k) ?? []), { spec: specDaLane(ex, l.slug), desde, estado }])
  }
  const locks: EspelhoConjunto['locks'] = {}
  for (const [k, g] of grupos) {
    const [dono, ...resto] = [...g].sort((a, b) => (a.estado === b.estado ? a.desde.localeCompare(b.desde) : a.estado === 'GRANTED-NOT-RELEASED' ? -1 : 1))
    locks[k] = { ...dono!, ...(resto.length ? { espera: resto.map(x => x.spec) } : {}) }
  }
  const specs: EspelhoConjunto['specs'] = {}
  for (const f of Object.values(ex.forks)) {
    const ms = marcos(f.eventos)
    const ult = ms[ms.length - 1]
    if (ult) specs[specDaLane(ex, f.slug)] = { ultimo: ult.tipo, texto: textoCheckpoint(ult), at: new Date(ult.at).toISOString() }
  }
  // C02-S02: PARKED, BLOCKED and `NOTE CUT` per spec, numbered here once (the orchestrator's pane reads them, R24)
  const aCaminho = itensACaminho(Object.fromEntries(Object.values(ex.forks).map(f => [specDaLane(ex, f.slug), f.eventos])))
  return { locks, specs, ritmo: ritmo(Object.values(ex.forks)), aCaminho }
}

/** The outstanding locks of an espelho as rows (orchestrator alerts, the tab, the page). */
/**
 * The espelho as written (C11-S01 rework): ArtifactData `update` merges deep, so a lock released (or a spec gone) since
 * the stored espelho stays in the document unless its key is written as `{ __delete__: true }`. Every key of the stored
 * espelho's `locks` and `specs` that the new one lacks is deleted, and so is every field a kept entry no longer has (a
 * lock's `espera` once its queue empties); arrays (`aCaminho`) are replaced whole.
 */
export function espelhoParaGravar<E extends { locks: Record<string, unknown>; specs: Record<string, unknown> }>(
  novo: E,
  antigo: { locks?: Record<string, unknown> | null; specs?: Record<string, unknown> | null } | null | undefined,
): E {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  const DEL = { __delete__: true }
  // two levels: the entry keys, then the fields of each kept entry
  const mapa = (velho: unknown, atual: Record<string, unknown>) => {
    const out: Record<string, unknown> = {}
    if (obj(velho)) for (const k of Object.keys(velho)) if (!(k in atual)) out[k] = DEL
    for (const [k, v] of Object.entries(atual)) {
      const antes = obj(velho) ? velho[k] : undefined
      out[k] = obj(v) && obj(antes) ? { ...Object.fromEntries(Object.keys(antes).filter(c => !(c in v)).map(c => [c, DEL])), ...v } : v
    }
    return out
  }
  return { ...novo, locks: mapa(antigo?.locks, novo.locks), specs: mapa(antigo?.specs, novo.specs) }
}

export function locksDoEspelho(esp: Pick<EspelhoConjunto, 'locks'> | undefined | null): LockAberto[] {
  return Object.entries(esp?.locks ?? {}).map(([k, v]) => {
    const i = k.indexOf(' ')
    return { spec: v.spec, kind: k.slice(0, i), resource: k.slice(i + 1), desde: v.desde, estado: v.estado, ...(v.espera ? { espera: v.espera } : {}) }
  })
}

// ---- C03-S01 address map: start_session results and the ledger lines that rebuild it

export const MAPA_VAZIO = (): MapaSessoes => ({ conjuntos: {}, specs: {}, orquestrador: null, at: 0 })

/** The map entry of one start_session: null for an `own_initiative` card or a result with no `local_...` id. */
export function entradaMapa(input: { name?: string; initiation?: string; prompt?: string }, resultText: string): { nome: string; sessao: string } | null {
  if (input.initiation === 'own_initiative') return null
  const sessao = String(resultText).match(/local_[0-9A-Za-z-]+/)?.[0]
  // C05-S01 (D17): the `name` is a short hint; the brief's `session name:` line carries the title
  const titulo = String(input.prompt ?? '').match(/^\s*session name:\s+(novarc-\S+)/mi)?.[1]
  const nome = (titulo ?? String(input.name ?? '')).trim()
  return sessao && nome ? { nome, sessao } : null
}

/** Puts a session named `...-C02` (set) or `...-C02-S01` (spec) into the map; another name leaves it as it was. */
export function noMapa(mapa: MapaSessoes, e: { nome: string; sessao: string }, at = Date.now()): MapaSessoes {
  // the title shape `...-C02[-S01]`, else a D17 short name: `c02-s01-<slug>` (spec) or `c02-<codigo>` (set)
  const curto = e.nome.match(/^(c\d{2})(?:-(s\d{2})(?=-|$))?(?:-[a-z0-9-]*)?$/i)
  const m = e.nome.match(/-(C\d+)(?:-(S\d+))?$/i) ?? curto
  if (!m) return mapa
  const conjunto = m[1]!.toUpperCase()
  if (!m[2]) return { ...mapa, conjuntos: { ...mapa.conjuntos, [conjunto]: { nome: e.nome, sessao: e.sessao } }, at }
  const id = `${conjunto}-${m[2].toUpperCase()}`
  const v = mapa.specs[id]
  return { ...mapa, specs: { ...mapa.specs, [id]: { conjunto, nome: e.nome, sessao: e.sessao, slug: v?.slug ?? '', agentId: v?.agentId ?? null } }, at }
}

const PAR = /([a-z0-9][a-z0-9.-]*)=(local_[0-9a-f-]{36})/g
const SESSAO_DO_CONJUNTO = /ORCHESTRATOR-SESSION (local_[0-9a-f-]{36}) \(([^)\s]+)\)/
const ORQUESTRADOR = /^NOTE ORQUESTRADOR (.+?)(?:\s+#\s\d{4}-\d\d-\d\dT\S*)?\s*$/

/**
 * Folds the complete `ledger.md` lines after `consumido` into the map (R1-2): every `<slug>=local_<uuid>` pair, the set's
 * own `ORCHESTRATOR-SESSION local_<uuid> (<name>)`, and the `NOTE ORQUESTRADOR` row (its `local_` id, else the row).
 */
export function dobrarMapa(mapa: MapaSessoes, texto: string, consumido: number, at = Date.now()): { mapa: MapaSessoes; consumido: number } {
  const de = consumido > texto.length ? 0 : consumido
  const fim = texto.lastIndexOf('\n')
  if (fim < de) return { mapa, consumido: de }
  let out = mapa
  for (const linha of texto.slice(de, fim + 1).split(/\r?\n/)) {
    for (const [, slug, sessao] of linha.matchAll(PAR)) {
      const id = idDaBranch(slug!)
      if (!id) continue
      const v = out.specs[id]
      out = { ...out, specs: { ...out.specs, [id]: { conjunto: id.split('-')[0]!, nome: v?.nome ?? slug!, sessao: sessao!, slug: slug!, agentId: v?.agentId ?? null } }, at }
    }
    const c = linha.match(SESSAO_DO_CONJUNTO)
    if (c) out = noMapa(out, { nome: c[2]!, sessao: c[1]! }, at)
    const o = linha.match(ORQUESTRADOR)
    if (o) out = { ...out, orquestrador: o[1]!.match(/local_[0-9a-f-]{36}/)?.[0] ?? o[1]!, at }
  }
  return { mapa: out, consumido: fim + 1 }
}

// ---- C03-S01 directives (Task 5): set reports, routing, the orchestrator's due directives, prompt map, turn line

/** The rule a directive line cites (audit `regra`). */
export function regraDaDiretiva(linha: string): string {
  const t = linha.trim().split(/\s+/)
  if (t[0] === 'GO') return t[2] === 'phase' ? 'dispatch-prompts.md:458' : t[2] === 'inicio' ? 'orquestrar.md §5' : 'step-05 §5.3'
  if (t[0] === 'CANCELADO') return 'orquestrar.md §5'
  if (t[0] === 'status') return 'dispatch-prompts.md:442'
  if (t[0] === 'FECHA') return 'orquestrar.md §5.1'
  if (t[0] === 'HOLD' || t[0] === 'LIBERA') return 'orquestrar.md'
  return 'd-diretivas-diretas'
}

/**
 * The set's manifest report (R10, R4-1) once every expected slug has a manifest text, else null: `disjuntos` with the
 * slugs sorted, or `colisao <slug>:<surface> ...`; an illegible manifest is `<slug>:ilegivel` (on doubt, colisao).
 */
export function relatoDoConjunto(C: string, manifestos: Record<string, string>, esperados: string[]): string | null {
  const slugs = [...new Set(esperados)].sort()
  if (!slugs.length || slugs.some(s => manifestos[s] === undefined)) return null
  const lidos = slugs.map(s => ({ s, ...lerSurfaces(manifestos[s]!) }))
  const ilegiveis = lidos.filter(x => !x.legivel).map(x => `${x.s}:ilegivel`)
  const r = manifestosDisjuntos(Object.fromEntries(lidos.filter(x => x.legivel).map(x => [x.s, x.superficies])))
  const colisoes = [...ilegiveis, ...(r.disjuntos ? [] : r.colisoes.map(c => `${c.slug}:${c.superficie}`))].sort()
  return colisoes.length ? `CONJUNTO ${C} manifestos colisao ${colisoes.join(' ')}` : `CONJUNTO ${C} manifestos disjuntos ${slugs.join(' ')}`
}

/** A freed resource (R12): the oldest ungranted LOCK on it from another lane, as `CONJUNTO <C> release ...`. An empty kind (APPLIED) matches any. */
export function relatoRelease(
  C: string,
  locks: { slug: string; kind: string; resource: string; desde: string; concedido: boolean }[],
  liberado: { slug: string; kind: string; resource: string },
): string | null {
  const w = locks
    .filter(l => !l.concedido && l.slug !== liberado.slug && l.resource === liberado.resource && (!liberado.kind || l.kind === liberado.kind))
    .sort((a, b) => a.desde.localeCompare(b.desde))[0]
  return w ? `CONJUNTO ${C} release ${w.kind} ${w.resource} ${w.slug}` : null
}

const DIRETIVA_SPEC = /^(GO) (\S+)(?: .*)?$|^(status) (\S+)\?$/

/**
 * Where a set session routes a received line (R15, R16): `{ para, slug }` for a `GO <slug> ...` / `status <slug>?` from
 * the recorded orchestrator naming one of this set's specs (`para` = its session id, else its name, '' when unknown);
 * `{ recusa }` for another sender or another set's spec; null for anything else (prose, `status <C>?`, HOLD, ...).
 */
export function rotaDaDiretiva(
  mapa: MapaSessoes,
  conjunto: string,
  from: string,
  orquestrador: string | null,
  texto: string,
): { para: string; slug: string } | { recusa: string } | null {
  const m = texto.trim().match(DIRETIVA_SPEC)
  if (!m) return null
  const recusa = m[1] ? 'GO' : 'STATUS'
  const alvo = (m[2] ?? m[4])!
  const id = idDaBranch(alvo)
  if (!id) return null // `status C02?` and the like: for the set session itself
  if (!orquestrador || from !== orquestrador || id.split('-')[0] !== conjunto.toUpperCase()) return { recusa }
  const e = mapa.specs[id]
  if (e?.slug && e.slug !== alvo) return { recusa } // a slug the map does not know for that spec
  return { para: e?.sessao || e?.nome || '', slug: alvo }
}

/** A set report as the orchestrator queues it (R6): the slugs with their manifest revisions, or the release detail. */
export type Relato = {
  conjunto: string
  tipo: 'disjuntos' | 'release'
  slugs: string[]
  revs: Record<string, string>
  linha: string
  release?: { kind: string; resource: string; waiter: string; releaseAt: string }
}

/** One directive due now (jobs.md directive-nudge): `to` the set session, `chave` the at-most-once key. */
export type Prevista = { to: string; text: string; chave: string; acao: string; alvo: string; motivo: string; regra: string }

/** An ISO time or epoch ms as `yyyymmddthhmmssz`, the stamp keys carry. */
const carimbo = (x: string | number) => {
  const d = new Date(x)
  return Number.isNaN(d.getTime()) ? String(x) : d.toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '')
}
/** Keys are lowercased and safe as a db id: anything outside `[a-z0-9._-]` becomes `-`. */
export const chaveDe = (...partes: (string | number)[]) => partes.join('-').toLowerCase().replace(/[^a-z0-9._-]+/g, '-')

/**
 * The directives due now, minus the keys in `feitas` (R13, R19, jobs.md): `status <C|slug>?` for a quiet unit (the second
 * once `2 x limiarCalado` passed, never a third), one `status <slug>?` per orphan lock key in `GRANTED-NOT-RELEASED`
 * (from `locks`; absent = none), `status <C>?` for a held slot (second past `2 x limiarLock`), `GO <slug> phase 4` per
 * slug of a disjoint report (key suffix `-<n>` from the manifest revision n >= 2, R7) and the grant of a release report.
 */
export function diretivasPrevistas(i: {
  alertas: Alerta[]
  relatos: Relato[]
  feitas: Set<string>
  runId: string
  mapa: MapaSessoes
  codigo: string
  agora: number
  limiarCalado: number
  limiarLock?: number
  /** Open locks with their state (`vista.locks`): only `GRANTED-NOT-RELEASED` is chased. */
  locks: { spec: string; kind: string; resource: string; desde: string; estado: string }[]
  /** The orchestrator's slots: a slot alert's held minutes come from its owner's `desde`. */
  slots: Slots | null
}): Prevista[] {
  const sessaoDo = (C: string) => i.mapa.conjuntos[C]?.sessao ?? i.mapa.conjuntos[C]?.nome ?? `novarc-${i.codigo}-${C}`
  const slugDe = (id: string) => i.mapa.specs[id]?.slug || null
  const min = (desde: number) => Math.floor((i.agora - desde) / 60_000)
  const out: Prevista[] = []
  const por = (p: Omit<Prevista, 'regra'>) => {
    if (i.feitas.has(p.chave) || out.some(x => x.chave === p.chave)) return
    out.push({ ...p, regra: regraDaDiretiva(p.text) })
  }
  for (const a of i.alertas) {
    const [tipo, ...resto] = a.chave.split(':')
    if (tipo === 'calado') {
      const at = Number(resto[resto.length - 1])
      const unidade = resto.slice(0, -1).join(':').toUpperCase()
      const ehSpec = /^C\d+-S\d+$/.test(unidade)
      if (!Number.isFinite(at) || (!ehSpec && !/^C\d+$/.test(unidade))) continue
      const alvo = ehSpec ? slugDe(unidade) : unidade
      if (!alvo) continue // a spec with no known slug: `status <slug>?` cannot be written
      const n = i.agora - at >= 2 * i.limiarCalado * 60_000 ? 2 : 1
      por({ to: sessaoDo(unidade.split('-')[0]!), text: `status ${alvo}?`, chave: chaveDe('status', alvo, carimbo(at), n), acao: 'STATUS-PEDIDO', alvo: unidade, motivo: `calado há ${min(at)} min` })
    } else if (tipo === 'lock') {
      // lock:<spec>:<kind>:<resource>:<since>, since an ISO time holding colons
      const m = a.chave.match(/^lock:([^:]+):([^:]+):(.*):(\d{4}-\d\d-\d\dT[\d:.]+Z?)$/)
      if (!m) continue
      const [, spec, kind, resource, desde] = m as unknown as [string, string, string, string, string]
      const l = i.locks.find(x => x.spec === spec && x.kind === kind && x.resource === resource && x.desde === desde)
      const slug = slugDe(spec.toUpperCase())
      if (l?.estado !== 'GRANTED-NOT-RELEASED' || !slug) continue
      por({
        to: sessaoDo(spec.split('-')[0]!.toUpperCase()), text: `status ${slug}?`, chave: chaveDe('lock', spec, kind, resource, carimbo(desde)),
        acao: 'LOCK-COBRADO', alvo: spec.toUpperCase(), motivo: `segura ${resource} há ${min(Date.parse(desde))} min`,
      })
    } else if (tipo === 'slot') {
      const [C, kind, ...b] = resto
      const dono = kind === 'verify' || kind === 'producao' ? i.slots?.[kind].dono : null
      if (!C || !dono || dono.branch !== b.join(':')) continue // released since the alert
      const held = min(Date.parse(dono.desde))
      const n = held >= 2 * (i.limiarLock ?? LIMIARES_PADRAO.lockOrfao) ? 2 : 1
      por({ to: sessaoDo(C), text: `status ${C}?`, chave: chaveDe('slot', C, kind, b.join(':'), n), acao: 'STATUS-PEDIDO', alvo: C, motivo: `segura o slot ${kind} há ${held} min` })
    }
  }
  for (const r of i.relatos) {
    if (r.tipo === 'disjuntos') {
      for (const slug of r.slugs) {
        const n = Number(String(r.revs[slug] ?? '1').split('.')[0]) || 1
        const chave = n === 1 ? chaveDe('go', slug, 'fase4', i.runId) : chaveDe('go', slug, 'fase4', i.runId, n)
        por({ to: sessaoDo(r.conjunto), text: `GO ${slug} phase 4`, chave, acao: 'GO', alvo: idDaBranch(slug) ?? slug, motivo: 'manifestos disjuntos' })
      }
    } else if (r.release) {
      const { kind, resource, waiter, releaseAt } = r.release
      por({
        to: sessaoDo(r.conjunto), text: `GO ${waiter} ${kind} ${resource}`, chave: chaveDe('release', kind, resource, waiter, carimbo(releaseAt)),
        acao: 'RELEASE-REPASSADO', alvo: idDaBranch(waiter) ?? waiter, motivo: 'esperava o lock',
      })
    }
  }
  return out
}

const STAMP_LEDGER = /\s+#\s\d{4}-\d\d-\d\dT\S*\s*$/

/** The set mod's proof line for a report (R6): `RELATO <report> rev <slug>=<rev> ...`, slugs sorted. */
export function linhaProvaRelato(relato: string, revs: Record<string, string>): string {
  const rs = Object.keys(revs).sort().map(s => `${s}=${revs[s]}`)
  return rs.length ? `RELATO ${relato} rev ${rs.join(' ')}` : `RELATO ${relato}`
}

/** Parses a proof line as written (`NOTE ` prefix and the ledger stamp allowed). */
export function lerProvaRelato(linha: string): { relato: string; revs: Record<string, string> } | null {
  const m = linha.trim().replace(STAMP_LEDGER, '').match(/^(?:NOTE )?RELATO (CONJUNTO .+)$/)
  if (!m) return null
  const t = m[1]!
  const i = t.lastIndexOf(' rev ')
  const pares = i < 0 ? [] : t.slice(i + 5).split(' ')
  if (i < 0 || !pares.every(p => /^[^=\s]+=\S+$/.test(p))) return { relato: t, revs: {} }
  return { relato: t.slice(0, i), revs: Object.fromEntries(pares.map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)])) }
}

/** The artifact-less proof line the orchestrator writes before a send (R4-3): `RELAY <acao> <alvo> <chave> <linha exata>`. */
export function linhaRelay(p: Prevista): string {
  return `RELAY ${p.acao} ${p.alvo} ${p.chave} ${p.text}`
}

/** Parses `linhaRelay` back; a RELAY whose third field is not a directive key (the set ledger's own RELAY) is null. */
export function lerRelay(linha: string): { acao: string; alvo: string; chave: string; linha: string } | null {
  const m = linha.trim().replace(STAMP_LEDGER, '').match(/^RELAY (\S+) (\S+) ((?:go|release|status|lock|slot|marco)-\S+) (.+)$/)
  return m ? { acao: m[1]!, alvo: m[2]!, chave: m[3]!, linha: m[4]! } : null
}

/** The main checkout of a set ledger dir (R4-4), forward slashes; null when the dir is not a session-build run dir. */
export function checkoutPrincipal(ledgerDir: string): string | null {
  const m = String(ledgerDir).replace(/\\/g, '/').match(/^(.*)\/(?:\.novarc\/ledger|\.superpowers)\/session-build\/\d{8}-\d{4}(?:-c\d{2}-[0-9a-f]{8})?\/?$/)
  return m ? m[1]! : null
}

const MAX_SECAO = 2800 // characters (R42); the section is cut below it

/** The `novarc:maestro-mapa` prompt section (R25, R42): one address per spec, reserve agents, the hop rule; no time. */
export function secaoMapa(mapa: MapaSessoes): string {
  const linhas: string[] = []
  for (const id of Object.keys(mapa.specs).sort()) {
    const e = mapa.specs[id]!
    if (e.sessao || e.nome) linhas.push(`${id} → ${e.nome || id}${e.sessao ? ` (${e.sessao})` : ''}`)
    if (e.agentId) linhas.push(`${e.slug || id} → ${e.agentId}`)
  }
  const titulo = 'maestro · endereços desta execução'
  const regra = 'só a sessão do conjunto fala com o orquestrador; a sessão de spec fala só com a sessão do seu conjunto'
  // room for the title, the rule, the `e mais <n>` line and their newlines
  let resta = MAX_SECAO - 1 - titulo.length - regra.length - `\ne mais ${linhas.length}\n`.length - 1
  let k = 0
  while (k < linhas.length && linhas[k]!.length + 1 <= resta) resta -= linhas[k++]!.length + 1
  return [titulo, ...linhas.slice(0, k), ...(k < linhas.length ? [`e mais ${linhas.length - k}`] : []), regra].join('\n')
}

/** The turn duration line (R27): `38s · C02 3/5 · 1 lock`, no lock part at 0. */
export function resumoTurno(conjunto: string, feitos: number, total: number, locks: number, durationMs: number): string {
  const s = Math.round(durationMs / 1000)
  const dur = s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
  return `${dur} · ${conjunto} ${feitos}/${total}${locks > 0 ? ` · ${locks} lock` : ''}`
}

// ---- C05-S01: sessions opened empty, the GO with the current brief, the orchestrator's NOTE lines

/** A `GO <C> inicio <sha>` or `GO PLAN` first line: the GO an empty session waits for (R31). */
export function limpaAguardo(texto: string): boolean {
  const l = (String(texto).split(/\r?\n/)[0] ?? '').trim()
  return /^GO C\d{2} inicio \S+/.test(l) || /^GO PLAN\b/.test(l)
}

export type NotaSessao = { id: string; conjunto: string; spec: string | null; nome: string; sessao: string; vazia: boolean; at: number }
export type GoLocal = { sha: string; at: number; atualizadas: string[]; decisoesNovas: number; branches: string[]; merges?: string[] }
export type NotasOrq = {
  sessoes: NotaSessao[]
  base: string | null
  cartoes: { id: string; conjunto: string; fechamento: boolean; at: number }[]
  gos: Record<string, { sha: string; at: number }>
  /** `NOTE CANCELADO <C> <motivo>`: the set was removed from the plan after its session opened (R23). */
  cancelados: Record<string, { motivo: string; at: number }>
}

const ALVO = /^(C\d{2})(?:-(S\d{2}))?$/

/**
 * The orchestrator ledger lines this spec adds (dados.md): `NOTE SESSAO <C>[-<S>] <name> <local id> <vazia|brief>`
 * (a later one for the same id wins), the first `NOTE BASE <sha>`, `NOTE CARTAO <C>[-<S>] <com|sem>-fechamento`, and
 * `GO <C> inicio <sha>`. Any other NOTE, and a malformed one, adds nothing.
 */
export function notasOrq(evs: Evento[]): NotasOrq {
  const sessoes = new Map<string, NotaSessao>()
  const out: NotasOrq = { sessoes: [], base: null, cartoes: [], gos: {}, cancelados: {} }
  for (const e of evs) {
    const t = e.texto.split(/\s+/)
    if (e.tipo === 'GO') {
      if (/^C\d{2}$/.test(t[0] ?? '') && t[1] === 'inicio' && t[2]) out.gos[t[0]!] = { sha: t[2], at: e.at }
      continue
    }
    if (e.tipo !== 'NOTE') continue
    const a = (t[1] ?? '').match(ALVO)
    if (t[0] === 'SESSAO' && a && t[2] && /^local_/.test(t[3] ?? '') && (t[4] === 'vazia' || t[4] === 'brief')) {
      sessoes.delete(t[1]!)
      sessoes.set(t[1]!, { id: t[1]!, conjunto: a[1]!, spec: a[2] ? t[1]! : null, nome: t[2], sessao: t[3]!, vazia: t[4] === 'vazia', at: e.at })
    } else if (t[0] === 'BASE' && t[1] && out.base === null) out.base = t[1]
    else if (t[0] === 'CANCELADO' && /^C\d{2}$/.test(t[1] ?? '')) out.cancelados[t[1]!] = { motivo: t.slice(2).join(' '), at: e.at }
    else if (t[0] === 'CARTAO' && a && (t[2] === 'com-fechamento' || t[2] === 'sem-fechamento')) {
      out.cartoes.push({ id: t[1]!, conjunto: a[1]!, fechamento: t[2] === 'com-fechamento', at: e.at })
    }
  }
  out.sessoes = [...sessoes.values()]
  return out
}

/** What the pane shows of a GO body (R25): its sha, the `specs-atualizadas` lines, the count of new decisions, the branch lines, the PRs of `mudou`. */
export function resumoGo(texto: string): { sha: string | null; atualizadas: string[]; decisoesNovas: number; branches: string[]; merges: string[] } {
  const linhas = String(texto).split(/\r?\n/)
  const sha = (linhas[0] ?? '').match(/^GO C\d{2} inicio (\S+)/)?.[1] ?? null
  // a key's values: the text after `key:` plus the indented lines below it, `nenhuma` dropped
  const valores = (chave: string): string[] => {
    const out: string[] = []
    linhas.forEach((l, i) => {
      if (!l.startsWith(`${chave}:`)) return
      out.push(l.slice(chave.length + 1).trim())
      for (let j = i + 1; j < linhas.length && /^\s+\S/.test(linhas[j]!); j++) out.push(linhas[j]!.trim())
    })
    return out.filter(v => v && v !== 'nenhuma')
  }
  const merges = [...new Set(valores('mudou').flatMap(v => v.match(/PR #\d+/g) ?? []))]
  return { sha, atualizadas: valores('specs-atualizadas'), decisoesNovas: valores('decisoes-novas').length, branches: valores('branch'), merges }
}

/**
 * The orchestrator ledger's sessions into the map, keyed by each note's own id; `nome` keeps a `novarc-` title already
 * there, else builds `novarc-<codigo>-<id>`, else the note's short name (a short name never overwrites a title).
 */
export function mapaDasNotas(mapa: MapaSessoes, sessoes: NotaSessao[], codigo: string | null, at = Date.now()): MapaSessoes {
  let out = mapa
  for (const n of sessoes) {
    const velho = n.spec ? out.specs[n.id]?.nome : out.conjuntos[n.conjunto]?.nome
    const nome = velho?.startsWith('novarc-') ? velho : codigo ? `novarc-${codigo}-${n.id}` : n.nome
    if (!n.spec) out = { ...out, conjuntos: { ...out.conjuntos, [n.conjunto]: { nome, sessao: n.sessao } }, at }
    else {
      const v = out.specs[n.id]
      out = { ...out, specs: { ...out.specs, [n.id]: { conjunto: n.conjunto, nome, sessao: n.sessao, slug: v?.slug ?? '', agentId: v?.agentId ?? null } }, at }
    }
  }
  return out
}

/** A session-build run dir name: `<YYYYMMDD-HHMM>`, or a NOVARC set session's `<YYYYMMDD-HHMM>-<c>-<sid8>`. */
export const RUN_ID = /^\d{8}-\d{4}(?:-c\d{2}-[0-9a-f]{8})?$/

export function runIdDoDir(dir: string | null): string | null {
  const b = String(dir ?? '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  return RUN_ID.test(b) ? b : null
}

export type ConjuntoDaAba = { id: string; titulo: string; raias: (Raia & { rotulo?: string })[]; estado: 'vazia' | 'go' | 'normal' | 'cancelado'; apos: string[]; motivo?: string }

/**
 * The set cards of the Execução tab (R24, R25, R32, R35): every set with a live block, a `NOTE SESSAO` or a `NOTE CARTAO`
 * line, sorted. `vazia` while its session was opened empty (ledger note, or a live registry entry `aguardandoGo`) and no
 * GO for it was seen (ledger or the local copy); `go` once one was.
 */
export function conjuntosDaAba(
  blocos: { conjunto: string; titulo: string; raias: (Raia & { rotulo?: string })[] }[],
  notas: NotasOrq,
  gos: Record<string, GoLocal>,
  regs: Registro[],
  dependeDe: Record<string, string[]>,
  titulos: Record<string, string>,
  agora: number,
): ConjuntoDaAba[] {
  const esperando = new Set([
    ...notas.sessoes.filter(s => !s.spec && s.vazia).map(s => s.conjunto),
    ...regs.filter(r => r.papel === 'conjunto' && r.conjunto && r.aguardandoGo && vivo(r, agora)).map(r => r.conjunto!),
  ])
  const ids = [...new Set([...blocos.map(b => b.conjunto), ...notas.sessoes.map(s => s.conjunto), ...notas.cartoes.map(c => c.conjunto), ...esperando, ...Object.keys(notas.cancelados)])].sort()
  return ids.map(id => {
    const b = blocos.find(x => x.conjunto === id)
    const go = !!(gos[id] || notas.gos[id])
    const cancelado = notas.cancelados[id]
    const estado = cancelado ? 'cancelado' : go ? 'go' : esperando.has(id) ? 'vazia' : 'normal'
    return { id, titulo: b?.titulo || titulos[id] || '', raias: b?.raias ?? [], estado, apos: dependeDe[id] ?? [], ...(cancelado ? { motivo: cancelado.motivo } : {}) }
  })
}

// ---- C05-S02: the set ledger's DONE-ACEITO / REABERTO, the WIP-PUSH skip, the session family tree

/**
 * Per spec slug, whether the set session accepted its DONE: `NOTE DONE-ACEITO <slug> <sha>` and `NOTE REABERTO <slug>
 * <motivo>` folded in the order received (file line order: ledger.py stamps to the second), the last line winning.
 */
export function aceitos(eventos: Evento[]): Record<string, { aceito: boolean; sha: string | null; at: number }> {
  const out: Record<string, { aceito: boolean; sha: string | null; at: number }> = {}
  for (const e of eventos) {
    if (e.tipo !== 'NOTE') continue
    const m = e.texto.match(/^(DONE-ACEITO|REABERTO)\s+(\S+)(?:\s+(\S+))?/)
    if (!m) continue
    out[m[2]!] = { aceito: m[1] === 'DONE-ACEITO', sha: m[1] === 'DONE-ACEITO' ? m[3] ?? null : null, at: e.at }
  }
  return out
}

/**
 * The NOTE prefixes the protocol writes and the mod folds as a lane's line (C02-S02 CUT and PRE-FECHAMENTO, C03-S01
 * ORQUESTRADOR and RELATO, C05-S01 SESSAO, BASE, CARTAO and CANCELADO, C05-S02 MARCO, DONE-ACEITO, REABERTO and
 * WIP-PUSH); any other NOTE (ASSUMPTION, PEERS, ...) is commentary and never ends a WIP-PUSH skip (R24).
 */
export const NOTAS_DOBRADAS: ReadonlySet<string> = new Set([
  'CUT', 'PRE-FECHAMENTO', 'ORQUESTRADOR', 'RELATO', 'SESSAO', 'BASE', 'CARTAO', 'CANCELADO', 'MARCO', 'DONE-ACEITO', 'REABERTO', 'WIP-PUSH',
])

/**
 * Whether the last folded line of a spec's fork ledger is `NOTE WIP-PUSH <slug>` (R24): every checkpoint folds, a NOTE
 * folds only when its first word is in `conhecidas`, so an unknown NOTE never ends the skip.
 */
export function emWip(eventos: Evento[], slug: string, conhecidas: ReadonlySet<string>): boolean {
  const dobrados = eventos.filter(e => e.tipo !== 'NOTE' || conhecidas.has(e.texto.split(/\s+/)[0] ?? ''))
  const u = dobrados[dobrados.length - 1]
  return !!u && u.tipo === 'NOTE' && /^WIP-PUSH\s+(\S+)/.exec(u.texto)?.[1] === slug
}

/** One row of the app's `list_sessions` answer (the fields the family reads). */
export type SessaoApp = { sessionId: string; title: string; isArchived?: boolean; isRunning?: boolean; startedBy?: string; name?: string }
export type LinhaFamilia = {
  chave: string
  nivel: 0 | 1 | 2
  icone: '▶️' | '🔹'
  titulo: string
  papel: 'orquestradora' | 'conjunto' | 'spec'
  estado: '🟠 rodando' | '⚪ aguardando GO' | '🔴 parada' | '💤 arquivada' | null
  branch: string | null
  abertaPor: string | null
}

const MAX_FAMILIA = 31 // 1 orchestrator + 9 sets + 21 specs (R6)

/** The session-build name of a registry entry (`titulo` carries the branch, never the name). */
export function nomeDoRegistro(r: Registro): string {
  return r.papel === 'orquestrador' ? `novarc-orq-${r.codigo ?? ''}` : `novarc-${r.codigo ?? ''}-${r.spec ?? r.conjunto ?? ''}`
}

/**
 * The run's session family in three levels (R1-R6): orchestrator, set sessions, spec sessions under their set; from the
 * app list (`sessoes`, null when unread: registry alone) joined with the registry by session id. An archived or absent
 * set session leaves its specs under a bare `<C>` row. Branch from the registry entry (read from git), never the app's.
 */
export function familia(i: {
  sessoes: SessaoApp[] | null
  registros: Registro[]
  mapa: MapaSessoes
  codigo: string
  eu: string
  agora: number
  aguardando?: (r: Registro) => boolean
}): LinhaFamilia[] {
  const orqTitulo = `novarc-orq-${i.codigo}`
  const esc = i.codigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^novarc-${esc}-(C\\d{2})(?:-(S\\d{2}))?$`)
  const regs = i.registros.filter(r => r.papel && r.codigo === i.codigo)
  const regDe = (id: string) => regs.find(r => r.sessao === id) ?? i.registros.find(r => r.sessao === id)
  type No = { id: string; titulo: string; papel: LinhaFamilia['papel']; conjunto: string | null; app: SessaoApp | null; reg: Registro | null }
  const nos = new Map<string, No>()
  const papelDe = (titulo: string, id: string): Pick<No, 'papel' | 'conjunto'> | null => {
    if (titulo === orqTitulo) return { papel: 'orquestradora', conjunto: null }
    const m = re.exec(titulo)
    if (m) return { papel: m[2] ? 'spec' : 'conjunto', conjunto: m[1]! }
    const c = Object.entries(i.mapa.conjuntos).find(([, v]) => v.sessao === id)?.[0]
    return c ? { papel: 'conjunto', conjunto: c } : null
  }
  for (const s of i.sessoes ?? []) {
    const reg = regDe(s.sessionId) ?? null
    const p = papelDe(s.title, s.sessionId) ?? (reg && regs.includes(reg) ? papelDoRegistro(reg) : null)
    if (p) nos.set(s.sessionId, { id: s.sessionId, titulo: p.papel === 'conjunto' && !re.test(s.title) && reg ? nomeDoRegistro(reg) : s.title, ...p, app: s, reg })
  }
  for (const r of regs) {
    if (nos.has(r.sessao)) continue
    const p = papelDoRegistro(r)
    if (p) nos.set(r.sessao, { id: r.sessao, titulo: nomeDoRegistro(r), ...p, app: null, reg: r })
  }
  const estado = (n: No): LinhaFamilia['estado'] => {
    if (n.app?.isArchived) return '💤 arquivada'
    if (n.id === i.eu) return '🟠 rodando'
    if (n.app?.isRunning) return '🟠 rodando'
    if (n.reg && i.aguardando?.(n.reg)) return '⚪ aguardando GO'
    if (!n.app && i.sessoes === null && n.reg && vivo(n.reg, i.agora)) return '🟠 rodando'
    return '🔴 parada'
  }
  const nomePorId = (id: string | null | undefined): string | null => {
    if (!id) return null
    const r = regDe(id)
    if (r && r.papel) return nomeDoRegistro(r)
    return (i.sessoes ?? []).find(s => s.sessionId === id)?.title ?? null
  }
  const linha = (n: No, nivel: 0 | 1 | 2): LinhaFamilia => ({
    chave: n.id,
    nivel,
    icone: nivel === 0 ? '▶️' : '🔹',
    titulo: n.titulo,
    papel: n.papel,
    estado: estado(n),
    branch: n.reg?.branch ?? null,
    abertaPor: nomePorId(n.reg?.pai) ?? nomePorId(n.app?.startedBy),
  })
  const todos = [...nos.values()]
  const ordem = (a: No, b: No) => a.titulo.localeCompare(b.titulo)
  const out: LinhaFamilia[] = todos.filter(n => n.papel === 'orquestradora').sort(ordem).slice(0, 1).map(n => linha(n, 0))
  const conjuntos = [...new Set(todos.filter(n => n.papel !== 'orquestradora').map(n => n.conjunto!))].sort()
  for (const c of conjuntos) {
    const cj = todos.filter(n => n.papel === 'conjunto' && n.conjunto === c && !n.app?.isArchived).sort(ordem)[0]
    const specs = todos.filter(n => n.papel === 'spec' && n.conjunto === c).sort(ordem)
    if (cj) out.push(linha(cj, 1))
    else if (specs.length) out.push({ chave: c, nivel: 1, icone: '🔹', titulo: c, papel: 'conjunto', estado: null, branch: null, abertaPor: null })
    for (const s of specs) out.push(linha(s, 2))
  }
  return out.slice(0, MAX_FAMILIA)
}

function papelDoRegistro(r: Registro): { papel: LinhaFamilia['papel']; conjunto: string | null } | null {
  if (r.papel === 'orquestrador') return { papel: 'orquestradora', conjunto: null }
  if (r.papel === 'spec' && r.conjunto) return { papel: 'spec', conjunto: r.conjunto }
  if (r.papel === 'conjunto' && r.conjunto) return { papel: 'conjunto', conjunto: r.conjunto }
  return null
}
