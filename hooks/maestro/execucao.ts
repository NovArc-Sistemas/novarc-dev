// Pure helpers of Maestro v2 "olhos": recognise a session-build run without a planning artifact and follow each
// fork through the ledger.py checkpoints. No engine calls here, so tests exercise them directly.
import type { Alerta, Evento, Execucao, Fork, LinhaSweep, Registro, Slots } from '../../types'
import { idDaBranch, urlOrquestrar, type EspelhoConjunto, type Proposta, type Ritmo } from './logic'

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
    const evs = [...f.eventos].sort((a, b) => a.at - b.at)
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
    const ult = f.eventos[f.eventos.length - 1]
    if (ult) specs[specDaLane(ex, f.slug)] = { ultimo: ult.tipo, texto: textoCheckpoint(ult), at: new Date(ult.at).toISOString() }
  }
  return { locks, specs, ritmo: ritmo(Object.values(ex.forks)) }
}

/** The outstanding locks of an espelho as rows (orchestrator alerts, the tab, the page). */
export function locksDoEspelho(esp: Pick<EspelhoConjunto, 'locks'> | undefined | null): LockAberto[] {
  return Object.entries(esp?.locks ?? {}).map(([k, v]) => {
    const i = k.indexOf(' ')
    return { spec: v.spec, kind: k.slice(0, i), resource: k.slice(i + 1), desde: v.desde, estado: v.estado, ...(v.espera ? { espera: v.espera } : {}) }
  })
}
