// Pure guard rules of C03-S01: no `$`, no I/O. avaliarBash and avaliarArquivo decide from the command text and an
// already-built context; register.tsx turns the decision into a deny or an appended warning.

import type { AuditoriaDoc } from './logic'

export type ContextoGuarda = {
  emExecucao: boolean
  papel: 'orquestrador' | 'conjunto' | 'spec' | null
  conjunto: string | null
  sessionEnd: boolean
  hold: boolean
  locks: string[] // granted kinds, e.g. 'migration'
  raiz: string | null // worktree root, forward slashes
  padrao: string // default branch
  isentos: string[] // path prefixes never warned: ledger dir, plugin root
  cwd: string // session cwd; relative paths resolve against it, moved by `cd`
  ramo: string | null // current branch of the session, null when unknown or detached
  ledgerDir: string | null // the session's ledger dir; a fork-*.md under it is a ledger file
}

export type Decisao = { nivel: 'bloqueia' | 'avisa' | null; regra: string; texto: string; linha: string }

export const TEXTOS = {
  pr: 'Bloqueado pelo Maestro. Sessão de spec não abre PR (invariante do session-build). Dê DONE; o PR é da sessão do conjunto no fechamento.',
  merge: 'Bloqueado pelo Maestro. Sessão de spec não faz merge de entrega (invariante do session-build). O merge é do fechamento.',
  bypass: (flag: string) => `Bloqueado pelo Maestro. ${flag} impede o hook de rodar (invariante do session-build: nenhum bypass).`,
  force: 'Bloqueado pelo Maestro. push --force reescreve a branch publicada (invariante do session-build).',
  apagar: 'Bloqueado pelo Maestro. Apagar branch ou worktree é do fechamento (invariante do session-build).',
  ledger: 'Bloqueado pelo Maestro. O ledger só se escreve pelo ledger.py (fork-contract).',
  aninhado: 'Bloqueado pelo Maestro. Comando aninhado demais para a guarda conferir (invariante do session-build: nenhum bypass).',
  hold: (c: string) => `Aviso do Maestro: commit durante HOLD de ${c}. Feito, mas o orquestrador não liberou.`,
  fora: (caminho: string) => `Aviso do Maestro: comando fora do worktree do conjunto (${caminho}).`,
  migracao: 'Aviso do Maestro: migração sem LOCK. Peça o LOCK antes de aplicar.',
  padrao: (branch: string) => `Aviso do Maestro: push direto na branch principal ${branch}.`,
}

export const REGRA = {
  pr: 'core SKILL.md:69', // PR, merge, force, deletion
  bypass: 'core SKILL.md:89',
  ledger: 'step-05 :54',
  hold: 'conjunto-overrides HOLD',
  worktree: 'session-contract.md:99-103',
  migracao: 'step-05 §5.4',
  padrao: 'session-contract.md:67',
}

// Ledger roots of any run (main checkout), never "outside the worktree" even before the session knows its ledger dir.
const RAIZ_LEDGER = /\/(\.novarc\/ledger|\.superpowers\/session-build|\.superpowers\/novarc-orq)(\/|$)/i
const NADA: Decisao = { nivel: null, regra: '', texto: '', linha: '' }
const PROFUNDIDADE = 3

// ---- lexer -------------------------------------------------------------------------------------------------------

type Palavra = { v: string; din: boolean; cit: boolean } // din: holds an expansion; cit: some part was quoted
type Seg = { ws: Palavra[]; redirs: { op: string; alvo: Palavra }[]; subs: string[] } // subs: substitution bodies
type Lex = { segs: Seg[]; fim: number }

const cheio = (x: Seg) => x.ws.length > 0 || x.redirs.length > 0 || x.subs.length > 0

// Command substitutions inside a heredoc body that expands (unquoted delimiter).
function substituicoes(t: string, out: { push: (t: string) => unknown }): boolean {
  for (let k = 0; k < t.length; k++) {
    if (t[k] === '\\') k++
    else if (t[k] === '$' && t[k + 1] === '(') {
      const r = lexar(t, k + 2, true)
      if (!r) return false
      out.push(t.slice(k + 2, r.fim))
      k = r.fim
    } else if (t[k] === '`') {
      const e = t.indexOf('`', k + 1)
      if (e < 0) return false
      out.push(t.slice(k + 1, e))
      k = e
    }
  }
  return true
}

// Splits a shell line into segments (separators && || ; | & newline ( )), words after quote removal, redirects with
// their target, and the bodies of $(...), `...`, <(...) to judge one level deeper. Heredoc bodies are skipped.
// With ateParen it stops at the `)` closing a substitution and returns its index in `fim`. null = unbalanced.
function lexar(s: string, i0 = 0, ateParen = false): Lex | null {
  const segs: Seg[] = [{ ws: [], redirs: [], subs: [] }]
  const aninhados = { push: (t: string) => seg().subs.push(t) }
  const docs: { delim: string; tira: boolean; expande: boolean }[] = []
  let w = ''
  let tem = false
  let din = false
  let cit = false
  let redir: string | null = null
  let nivel = 0
  const seg = () => segs[segs.length - 1]!
  const fim = () => {
    if (tem) {
      const p = { v: w, din, cit }
      if (redir === '<<' || redir === '<<-') docs.push({ delim: w, tira: redir === '<<-', expande: !cit })
      else if (redir) seg().redirs.push({ op: redir, alvo: p })
      else seg().ws.push(p)
      redir = null
    }
    w = ''
    tem = din = cit = false
  }
  const novo = () => {
    fim()
    redir = null
    if (cheio(seg())) segs.push({ ws: [], redirs: [], subs: [] })
  }
  const pronto = (fimIdx: number): Lex => ({ segs: segs.filter(cheio), fim: fimIdx })
  const subst = (j: number): number => {
    const r = lexar(s, j + 2, true)
    if (!r) return -1
    aninhados.push(s.slice(j + 2, r.fim))
    w += s.slice(j, r.fim + 1)
    din = tem = true
    return r.fim
  }
  const crase = (j: number): number => {
    let t = ''
    let k = j + 1
    for (; k < s.length && s[k] !== '`'; k++) t += s[k] === '\\' && s[k + 1] === '`' ? s[++k] : s[k]
    if (k >= s.length) return -1
    aninhados.push(t)
    w += '`' + t + '`'
    din = tem = true
    return k
  }
  const chave = (j: number): number => {
    let d = 0
    for (let k = j + 1; k < s.length; k++) {
      if (s[k] === '{') d++
      else if (s[k] === '}' && --d === 0) {
        w += s.slice(j, k + 1)
        din = tem = true
        return k
      }
    }
    return -1
  }
  const duplas = (j: number): number => {
    for (let k = j + 1; k < s.length; k++) {
      const c = s[k]!
      if (c === '"') return k
      if (c === '\\' && k + 1 < s.length) {
        const n = s[k + 1]!
        if ('"\\$`\n'.includes(n)) {
          if (n !== '\n') w += n
          k++
        } else w += c
      } else if (c === '$' && s[k + 1] === '(') {
        k = subst(k)
        if (k < 0) return -1
      } else if (c === '$' && s[k + 1] === '{') {
        k = chave(k)
        if (k < 0) return -1
      } else if (c === '`') {
        k = crase(k)
        if (k < 0) return -1
      } else {
        if (c === '$') din = true
        w += c
      }
    }
    return -1
  }
  // At a newline with heredocs pending: skip their bodies; returns the index just before the next line.
  const corpos = (i: number): number => {
    let p = i + 1
    for (const d of docs.splice(0)) {
      for (;;) {
        if (p >= s.length) return s.length
        const e = s.indexOf('\n', p)
        const fimL = e < 0 ? s.length : e
        const linha = s.slice(p, fimL)
        p = fimL + 1
        if ((d.tira ? linha.replace(/^\t+/, '') : linha) === d.delim) break
        if (d.expande && !substituicoes(linha, aninhados)) return -1
      }
    }
    return p - 1
  }

  for (let i = i0; i < s.length; i++) {
    const c = s[i]!
    if (c === ' ' || c === '\t' || c === '\r') fim()
    else if (c === '\n') {
      novo()
      if (docs.length) {
        i = corpos(i)
        if (i < 0) return null
      }
    } else if (c === "'") {
      const e = s.indexOf("'", i + 1)
      if (e < 0) return null
      w += s.slice(i + 1, e)
      tem = cit = true
      i = e
    } else if (c === '"') {
      tem = cit = true
      i = duplas(i)
      if (i < 0) return null
    } else if (c === '\\') {
      const n = s[i + 1]
      if (n === '\n') i++
      else {
        if (n !== undefined) w += n
        i++
        tem = true
      }
    } else if (c === '$' && s[i + 1] === '(') {
      i = subst(i)
      if (i < 0) return null
    } else if (c === '$' && s[i + 1] === '{') {
      i = chave(i)
      if (i < 0) return null
    } else if (c === '$' && s[i + 1] === "'") {
      let k = i + 2
      for (; k < s.length && s[k] !== "'"; k++) w += s[k] === '\\' ? s[++k] ?? '' : s[k]
      if (k >= s.length) return null
      tem = cit = true
      i = k
    } else if (c === '$') {
      w += c
      tem = din = true
    } else if (c === '`') {
      i = crase(i)
      if (i < 0) return null
    } else if (c === '#' && !tem) {
      while (i + 1 < s.length && s[i + 1] !== '\n') i++
    } else if ((c === '<' || c === '>') && s[i + 1] === '(') {
      const r = lexar(s, i + 2, true)
      if (!r) return null
      aninhados.push(s.slice(i + 2, r.fim))
      w += s.slice(i, r.fim + 1)
      tem = din = true
      i = r.fim
    } else if (c === '<' || c === '>') {
      if (tem && !cit && /^\d+$/.test(w)) {
        w = ''
        tem = false
      } else fim()
      let op = c
      if (s[i + 1] === c) {
        op += s[++i]
        if (c === '<' && (s[i + 1] === '<' || s[i + 1] === '-')) op += s[++i]
      } else if (s[i + 1] === '|' || s[i + 1] === '&' || (c === '<' && s[i + 1] === '>')) op += s[++i]
      redir = op
    } else if (c === '&' && s[i + 1] === '>') {
      fim()
      i++
      redir = '&>'
      if (s[i + 1] === '>') redir += s[++i]
    } else if (c === ';' || c === '|' || c === '&') novo()
    else if (c === '(') {
      novo()
      nivel++
    } else if (c === ')') {
      if (ateParen && nivel === 0) {
        fim()
        return pronto(i)
      }
      novo()
      nivel = Math.max(0, nivel - 1)
    } else {
      w += c
      tem = true
    }
  }
  if (ateParen) return null
  fim()
  return pronto(s.length)
}

// ---- helpers -----------------------------------------------------------------------------------------------------

const ATRIB = /^[A-Za-z_]\w*=/
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh'])
const LEDGER_MD = /^ledger\.md$/i
const FORK_MD = /^fork-.*\.md$/i
const GIT_VAL = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env'])
const GH_VAL = new Set(['-R', '--repo'])
// R8: options whose next word (or attached value) is a value, never a flag.
const VALOR = new Set(['-m', '--message', '-F', '--file', '-t', '--title', '-b', '--body', '--body-file', '--template', '-C', '--author', '--date'])
const CURTAS_VALOR = 'mFtbC'

const arquivo = (v: string) => v.split(/[\\/]/).pop() ?? ''
// Command name of a word: basename without .exe; a basename with whitespace is a quoted phrase, never a command.
const nome = (v: string) => {
  const b = arquivo(v)
  return /\s/.test(b) ? '' : b.replace(/\.exe$/i, '').toLowerCase()
}

function primeiraPosicional(ws: Palavra[], de: number, val: Set<string>): number {
  let j = de
  for (; j < ws.length && ws[j]!.v.startsWith('-'); j++) if (val.has(ws[j]!.v)) j++
  return j
}

function linhaDe(ws: Palavra[], k: number, flag: string): string {
  const n = nome(ws[k]!.v)
  const j = n === 'git' ? primeiraPosicional(ws, k + 1, GIT_VAL) : n === 'gh' ? primeiraPosicional(ws, k + 1, GH_VAL) : k + 1
  const p = [n]
  const sub = ws[j]?.v
  if (sub && /^[a-z][a-z0-9-]*$/.test(sub)) p.push(sub)
  if (flag && flag !== p[p.length - 1]) p.push(flag)
  return p.join(' ')
}

// First two command words (env prefixes skipped, git/gh located per R10) plus the matched flag; never arguments.
export function linhaDaGuarda(cmd: string, flag: string): string {
  const ws = lexar(cmd)?.segs[0]?.ws ?? []
  let k = ws.findIndex((w) => nome(w.v) === 'git' || nome(w.v) === 'gh')
  if (k < 0) k = ws.findIndex((w) => !ATRIB.test(w.v))
  return k < 0 ? flag : linhaDe(ws, k, flag)
}

type Opcoes = { longas: string[]; curtas: string; pos: string[] }

// R8: flags by argument position. Values of VALOR options are skipped; words after a bare `--` are positional.
function opcoes(ws: Palavra[], de: number): Opcoes {
  const o: Opcoes = { longas: [], curtas: '', pos: [] }
  let fimOpcoes = false
  for (let i = de; i < ws.length; i++) {
    const v = ws[i]!.v
    if (fimOpcoes || v === '-' || !v.startsWith('-')) o.pos.push(v)
    else if (v === '--') fimOpcoes = true
    else if (v.startsWith('--')) {
      const n = v.split('=')[0]!
      o.longas.push(n)
      if (VALOR.has(n) && !v.includes('=')) i++
    } else {
      for (let k = 1; k < v.length; k++) {
        if (CURTAS_VALOR.includes(v[k]!)) {
          if (k === v.length - 1) i++
          break
        }
        o.curtas += v[k]
      }
    }
  }
  return o
}

// ponytail: git accepts any unambiguous long-option prefix; we match prefixes of 5+ chars (`--for`), shorter ones
// are ambiguous for git itself on these subcommands.
const longa = (o: Opcoes, alvo: string) => o.longas.some((n) => n.length >= 5 && alvo.startsWith(n))

const ramo = (r: string) => r.replace(/^\+/, '').replace(/^refs\/heads\//, '')

// ---- paths (R12) -------------------------------------------------------------------------------------------------

function norm(p: string, win: boolean): string {
  let s = p.replace(/\\/g, '/')
  if (win) s = s.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:')
  s = s.replace(/^([a-z]):/, (_, d: string) => d.toUpperCase() + ':')
  const partes: string[] = []
  for (const x of s.split('/')) {
    if (!x || x === '.') continue
    if (x === '..') {
      if (partes.length && !/^[A-Za-z]:$/.test(partes[partes.length - 1]!)) partes.pop()
    } else partes.push(x)
  }
  return (s.startsWith('/') ? '/' : '') + partes.join('/')
}

function dentro(p: string, raiz: string, win: boolean): boolean {
  const a = win ? p.toLowerCase() : p
  const b = win ? raiz.toLowerCase() : raiz
  return a === b || a.startsWith(b.endsWith('/') ? b : b + '/')
}

// Resolved path of a path-like argument, or null when the word is not one.
function caminho(w: Palavra, base: string | null, win: boolean): string | null {
  if (w.din) return null
  let v = w.v
  if (v.startsWith('-')) {
    const m = /^-[^=]*=(.+)$/.exec(v)
    if (!m) return null
    v = m[1]!
  }
  if (/\s/.test(v) || /^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return null
  if (/^([\\/~]|[A-Za-z]:)/.test(v)) return norm(v, win)
  if (!/[\\/]/.test(v) && v !== '.' && v !== '..') return null
  return base === null ? null : norm(base + '/' + v, win)
}

/**
 * A ledger file: `ledger.md` by name in any folder; `fork-*.md` only under a ledger root or the session's ledger dir
 * (a skill's fork-contract.md is a doc). A dynamic word may be anything: matched by name.
 */
function ehLedger(w: Palavra, base: string | null, ctx: ContextoGuarda, win: boolean): boolean {
  const f = arquivo(w.v)
  if (LEDGER_MD.test(f)) return true
  if (!FORK_MD.test(f)) return false
  if (w.din) return true
  const p = /^([\\/~]|[A-Za-z]:)/.test(w.v) ? norm(w.v, win) : base === null ? null : norm(base + '/' + w.v, win)
  return p !== null && (RAIZ_LEDGER.test(p) || (!!ctx.ledgerDir && dentro(p, norm(ctx.ledgerDir, win), win)))
}

// ---- judging -----------------------------------------------------------------------------------------------------

type Saida = Decisao[]

const bloqueio = (texto: string, regra: string, linha: string): Decisao => ({ nivel: 'bloqueia', regra, texto, linha })
const aviso = (texto: string, regra: string, linha: string): Decisao => ({ nivel: 'avisa', regra, texto, linha })

// One git candidate at ws[k] (R10-R12). Returns true/false when it switched onto/off the default branch, null otherwise.
function julgarGit(ws: Palavra[], k: number, ctx: ContextoGuarda, envBypass: string | null, naPadrao: boolean, out: Saida): boolean | null {
  const globais: string[] = []
  let j = k + 1
  for (; j < ws.length && ws[j]!.v.startsWith('-'); j++) {
    globais.push(ws[j]!.v)
    if (GIT_VAL.has(ws[j]!.v) && j + 1 < ws.length) globais.push(ws[++j]!.v)
  }
  if (j >= ws.length) return null // undetermined subcommand: a mention
  const sub = ws[j]!.v
  const L = (f: string) => linhaDe(ws, k, f)
  const livre = ctx.sessionEnd
  if (globais.some((g) => /core\.hookspath/i.test(g))) out.push(bloqueio(TEXTOS.bypass('core.hooksPath'), REGRA.bypass, L('core.hooksPath')))
  if (envBypass) out.push(bloqueio(TEXTOS.bypass(envBypass), REGRA.bypass, L(envBypass)))
  const o = opcoes(ws, j + 1)
  if (longa(o, '--no-verify')) out.push(bloqueio(TEXTOS.bypass('--no-verify'), REGRA.bypass, L('--no-verify')))
  if (sub === 'commit') {
    if (o.curtas.includes('n')) out.push(bloqueio(TEXTOS.bypass('-n'), REGRA.bypass, L('-n')))
    if (ctx.hold) out.push(aviso(TEXTOS.hold(ctx.conjunto ?? ''), REGRA.hold, L('')))
  } else if (sub === 'push') {
    const refs = o.pos.slice(1)
    const forca = longa(o, '--force') ? '--force' : longa(o, '--force-with-lease') ? '--force-with-lease' : o.curtas.includes('f') ? '-f' : refs.some((r) => r.startsWith('+')) ? '+' : null
    if (forca) out.push(bloqueio(TEXTOS.force, REGRA.pr, L(forca)))
    const apaga = longa(o, '--delete') ? '--delete' : o.curtas.includes('d') ? '-d' : refs.some((r) => /^:./.test(r)) ? ':' : null
    if (apaga && !livre) out.push(bloqueio(TEXTOS.apagar, REGRA.pr, L(apaga)))
    if (refs.some((r) => r.includes(':') && !r.startsWith(':') && ramo(r.split(':').pop()!) === ctx.padrao && ramo(r.split(':')[0]!) !== ctx.padrao)) {
      if (!livre) out.push(bloqueio(TEXTOS.merge, REGRA.pr, L('')))
    } else if (refs.some((r) => ramo(r.split(':').pop()!) === ctx.padrao)) out.push(aviso(TEXTOS.padrao(ctx.padrao), REGRA.padrao, L('')))
  } else if (sub === 'branch') {
    const curta = /[dD]/.exec(o.curtas)?.[0]
    const apaga = longa(o, '--delete') ? '--delete' : curta ? '-' + curta : null
    if (apaga && !livre) out.push(bloqueio(TEXTOS.apagar, REGRA.pr, L(apaga)))
  } else if (sub === 'worktree') {
    if (o.pos[0] === 'remove' && !livre) out.push(bloqueio(TEXTOS.apagar, REGRA.pr, 'git worktree remove'))
  } else if (sub === 'merge') {
    if (naPadrao && !livre) out.push(bloqueio(TEXTOS.merge, REGRA.pr, L('')))
  } else if (sub === 'config') {
    const i = o.pos.findIndex((p) => /^core\.hookspath$/i.test(p))
    if (i >= 0 && o.pos.length > i + 1) out.push(bloqueio(TEXTOS.bypass('core.hooksPath'), REGRA.bypass, L('core.hooksPath')))
  } else if (sub === 'checkout' || sub === 'switch') {
    const resto = ws.slice(j + 1).map((w) => w.v)
    if (resto.some((v) => /^-[bBcC]$/.test(v) || v === '--orphan')) return false // creates a branch: never the default
    if (resto.includes('--') || !o.pos.length) return null // file checkout or no target: branch unchanged
    return o.pos[0] === ctx.padrao
  }
  return null
}

function julgarGh(ws: Palavra[], k: number, ctx: ContextoGuarda, out: Saida): void {
  const j = primeiraPosicional(ws, k + 1, GH_VAL)
  if (ws[j]?.v !== 'pr' || ctx.sessionEnd) return
  const acao = ws[primeiraPosicional(ws, j + 1, GH_VAL)]?.v
  if (acao === 'create') out.push(bloqueio(TEXTOS.pr, REGRA.pr, linhaDe(ws, k, 'create')))
  if (acao === 'merge') out.push(bloqueio(TEXTOS.merge, REGRA.pr, linhaDe(ws, k, 'merge')))
}

// State carried along a command line and into nested commands (R5-3 review): cwd, default-branch checkout, hook-bypass env.
type Estado = { base: string | null; naPadrao: boolean; envBypass: string | null }

const bypassDe = (v: string): string | null =>
  v === 'HUSKY=0' ? 'HUSKY' : v.startsWith('SKIP_HOOKS=') ? 'SKIP_HOOKS' : ATRIB.test(v) && /core\.hookspath/i.test(v) ? 'core.hooksPath' : null
const ENV_CMDS = new Set(['env', 'export', 'sudo'])

function julgar(cmd: string, ctx: ContextoGuarda, prof: number, out: Saida, st: Estado): void {
  if (prof > PROFUNDIDADE) {
    out.push(bloqueio(TEXTOS.aninhado, REGRA.bypass, 'aninhado'))
    return
  }
  const lx = lexar(cmd)
  if (!lx) {
    // top level: bash rejects it itself; nested: the guard cannot see inside, so deny (R5-3)
    if (prof) out.push(bloqueio(TEXTOS.aninhado, REGRA.bypass, 'aninhado'))
    return
  }
  const win = /^[A-Za-z]:/.test(ctx.raiz ?? '')
  const raiz = ctx.raiz ? norm(ctx.raiz, win) : null
  const isentos = ctx.isentos.map((x) => norm(x, win))
  for (const { ws, redirs, subs } of lx.segs) {
    const k0 = ws.findIndex((w) => !ATRIB.test(w.v))
    const cmdNome = k0 >= 0 ? nome(ws[k0]!.v) : ''
    // Bypass env only as a command-prefix assignment, or through env/export/sudo; a bare assignment or export persists.
    const segEnv = ws.filter((w, i) => i < k0 || k0 < 0 || (ENV_CMDS.has(cmdNome) && i > k0)).map((w) => bypassDe(w.v)).find(Boolean) ?? null
    if (segEnv && (k0 < 0 || cmdNome === 'export')) st.envBypass ??= segEnv
    const envBypass = st.envBypass ?? segEnv
    const aninhar = (texto: string) => {
      const filho: Estado = { ...st, envBypass }
      julgar(texto, ctx, prof + 1, out, filho)
      st.naPadrao = filho.naPadrao
    }
    for (const t of subs) aninhar(t)
    for (let i = 0; i < ws.length; i++) {
      const n = nome(ws[i]!.v)
      if (n === 'git') {
        const r = julgarGit(ws, i, ctx, envBypass, st.naPadrao, out)
        if (r !== null) st.naPadrao = r
      } else if (n === 'gh') julgarGh(ws, i, ctx, out)
      else if (SHELLS.has(n)) {
        const c = ws.findIndex((w, j) => j > i && /^-[a-zA-Z]*c[a-zA-Z]*$/.test(w.v))
        if (c >= 0) {
          const a = ws[c + 1]
          if (a) aninhar(a.v)
          else out.push(bloqueio(TEXTOS.aninhado, REGRA.bypass, 'aninhado'))
        }
      } else if (n === 'eval' && i + 1 < ws.length) aninhar(ws.slice(i + 1).map((w) => w.v).join(' '))
      else if (n === 'tee' && (i === k0 || cmdNome === 'sudo')) {
        if (ws.slice(i + 1).some((w) => !w.v.startsWith('-') && ehLedger(w, st.base, ctx, win))) out.push(bloqueio(TEXTOS.ledger, REGRA.ledger, 'tee'))
      } else if (n === 'supabase' || n === 'prisma') {
        const [a, b] = ws.slice(i + 1).filter((w) => !w.v.startsWith('-')).map((w) => w.v)
        const mig = n === 'supabase' ? (a === 'db' && b === 'push') || (a === 'migration' && b === 'up') : a === 'migrate' && b === 'deploy'
        if (mig && !ctx.locks.includes('migration')) out.push(aviso(TEXTOS.migracao, REGRA.migracao, `${n} ${a} ${b}`))
      }
    }
    for (const r of redirs) {
      if (r.op.includes('>') && ehLedger(r.alvo, st.base, ctx, win)) out.push(bloqueio(TEXTOS.ledger, REGRA.ledger, [cmdNome, r.op].filter(Boolean).join(' ')))
    }
    if (raiz) {
      const cands = [...ws.filter((w, i) => i !== k0 && !ATRIB.test(w.v) && nome(w.v) !== 'git' && nome(w.v) !== 'gh'), ...redirs.filter((r) => r.op !== '<<<').map((r) => r.alvo)]
      for (const w of cands) {
        const p = caminho(w, st.base, win)
        if (p && !p.startsWith('/dev/') && !RAIZ_LEDGER.test(p) && !dentro(p, raiz, win) && !isentos.some((x) => dentro(p, x, win))) {
          out.push(aviso(TEXTOS.fora(p), REGRA.worktree, cmdNome))
          break
        }
      }
    }
    if (cmdNome === 'cd') {
      const a = ws.slice(k0 + 1).find((w) => !w.v.startsWith('-'))
      st.base = a && !a.din ? (caminho({ ...a, v: /[\\/]/.test(a.v) || a.v === '.' || a.v === '..' ? a.v : './' + a.v }, st.base, win)) : null
    }
  }
}

export function avaliarBash(cmd: string, ctx: ContextoGuarda): Decisao {
  if (!ctx.emExecucao) return NADA
  const out: Saida = []
  const win = /^[A-Za-z]:/.test(ctx.raiz ?? '')
  julgar(cmd, ctx, 0, out, { base: ctx.cwd ? norm(ctx.cwd, win) : null, naPadrao: ctx.ramo === ctx.padrao, envBypass: null })
  return out.find((d) => d.nivel === 'bloqueia') ?? out[0] ?? NADA
}

export function avaliarArquivo(path: string, ctx: ContextoGuarda): Decisao {
  if (!ctx.emExecucao) return NADA
  const f = arquivo(path)
  const win = /^[A-Za-z]:/.test(ctx.raiz ?? '') || /^[A-Za-z]:/.test(path)
  const base = ctx.cwd ? norm(ctx.cwd, win) : null
  return ehLedger({ v: path, din: false, cit: false }, base, ctx, win) ? bloqueio(TEXTOS.ledger, REGRA.ledger, /^ledger/i.test(f) ? 'ledger.md' : 'fork-*.md') : NADA
}

// FNV-1a 32-bit over the UTF-8 bytes, as 8 hex chars (manifest revision ids, R6/R7).
export function fnv1a32(s: string): string {
  let h = 0x811c9dc5
  for (const b of new TextEncoder().encode(s)) h = Math.imul(h ^ b, 16777619) >>> 0
  return h.toString(16).padStart(8, '0')
}

// ---- audit entries (Task 4): observed records, id scheme (a) of dados.md

/** `<at as YYYYMMDDTHHMMSSmmmZ>-<first 8 chars of the session id>-<n>`, assigned at queue time so a retry keeps it. */
export function idObservado(at: Date, sessaoId: string, n: number): string {
  return `${at.toISOString().replace(/[-:.]/g, '')}-${sessaoId.replace(/^local_/, '').slice(0, 8)}-${n}`
}

const umaLinha = (s: string) => s.split(/\r?\n/)[0]!.trim().slice(0, 300)

/** One observed `AuditoriaDoc`: text fields one line each; `antes`/`depois` only when the caller gives them, never `estado`. */
export function entradaAuditoria(
  e: Pick<AuditoriaDoc, 'acao' | 'alvo' | 'motivo' | 'regra' | 'linha' | 'origem'> & { antes?: string | null; depois?: string | null },
  m: { at: Date; runId: string | null; sessao: string; papel: AuditoriaDoc['papel']; by: string },
): AuditoriaDoc {
  return {
    acao: e.acao,
    alvo: umaLinha(e.alvo),
    motivo: umaLinha(e.motivo),
    regra: umaLinha(e.regra),
    linha: e.linha === null ? null : umaLinha(e.linha),
    antes: e.antes ?? null,
    depois: e.depois ?? null,
    estado: null,
    runId: m.runId,
    sessao: m.sessao,
    papel: m.papel,
    by: m.by,
    at: m.at.toISOString(),
    origem: e.origem,
  }
}

// ---- SURFACES manifests (Task 5): R4-1, R5-1, R6, R7

const CAMPOS = /^(migrations|tables|functions|deploys)$/
const NADA_CAMPO = /^(none|-|nenhum)$/i
const EXT = /\.(ts|tsx|js|md|sql|py|json|html|sh|yml)$/i
const CARIMBO = /\s+#\s\d{4}-\d\d-\d\dT\S*\s*$/
const MAX_MANIFESTO = 8000

/** `a/{b,c/d}.ts` -> `a/b.ts`, `a/c/d.ts`; groups expand left to right. */
function expandir(t: string): string[] {
  const m = t.match(/^([^{}]*)\{([^{}]*)\}(.*)$/)
  return m ? m[2]!.split(',').flatMap((x) => expandir(`${m[1]}${x}${m[3]}`)) : [t]
}

const limpar = (t: string) => {
  let s = t.replace(/^[(]+/, '')
  for (let antes = ''; antes !== s; ) {
    antes = s
    s = s.replace(/\([^()]*\)$/, '').replace(/[,;:)]+$/, '')
  }
  return s.replace(/\/+$/, '')
}

/**
 * Surface tokens of a free-form manifest (R4-1): every path-like word (has `/` or a known extension), brace groups
 * expanded, plus `migrations|tables|functions|deploys` fields whose value is not none, as `<key>:<value>`. Not legible:
 * a truncation marker, over 8,000 characters, or no token in a text that is not only none-valued fields (R5-1).
 */
export function lerSurfaces(texto: string): { superficies: string[]; legivel: boolean } {
  const t = String(texto).trim().replace(CARIMBO, '')
  if (t.length > MAX_MANIFESTO || /(…|\.\.\.)$/.test(t) || /\[\+\d+ ?chars?\]/i.test(t)) return { superficies: [], legivel: false }
  const ws = t.split(/\s+/).filter(Boolean)
  const out = new Set<string>()
  let campos = 0 // none-valued fields seen
  let outras = 0 // words after the keyword and slug that are neither a field nor a token
  ws.forEach((w, i) => {
    if (i < 2 && ws[0] === 'SURFACES') return // keyword and slug
    const kv = w.match(/^([\w-]+)([=:])(.*)$/)
    if (kv && (kv[2] === '=' || kv[3])) {
      const v = limpar(kv[3]!)
      if (NADA_CAMPO.test(v)) return void campos++
      if (CAMPOS.test(kv[1]!)) {
        for (const x of v.split(',').filter(Boolean)) out.add(`${kv[1]}:${x}`)
        return
      }
    }
    if (/^[\w-]+:$/.test(w) && CAMPOS.test(w.slice(0, -1)) && ws[i + 1]) {
      const v = limpar(ws[i + 1]!)
      if (NADA_CAMPO.test(v)) return void campos++
      for (const x of v.split(',').filter(Boolean)) out.add(`${w.slice(0, -1)}:${x}`)
      return
    }
    if (/^[\w-]+:$/.test(w) && NADA_CAMPO.test(limpar(ws[i + 1] ?? ''))) return
    if (i > 0 && /^[\w-]+:$/.test(ws[i - 1]!) && NADA_CAMPO.test(limpar(w))) return void campos++
    let achou = false
    for (const x of expandir(w)) {
      const p = limpar(x).replace(/^[\w-]+[=:](?=.)/, '') // `files=a/b.ts`, `new:a.ts`
      if (p && (p.includes('/') || EXT.test(p))) {
        out.add(p)
        achou = true
      }
    }
    if (!achou) outras++
  })
  const superficies = [...out]
  return { superficies, legivel: superficies.length > 0 || (campos > 0 && outras === 0) }
}

const CAMPO_TOKEN = /^(migrations|tables|functions|deploys):(.+)$/

/**
 * Two surfaces overlap (conservative, "on any doubt colisao"): equal; one a path suffix of the other (`kit.tsx` vs
 * `hooks/maestro/kit.tsx`); one a directory of the other; a field `<key>:<v>` vs a path holding a segment `<v>`.
 */
function colide(a: string, b: string): boolean {
  if (a === b) return true
  const fa = a.match(CAMPO_TOKEN)
  const fb = b.match(CAMPO_TOKEN)
  if (fa || fb) return !!fa !== !!fb && (fa ? b : a).split('/').includes((fa ?? fb)![2]!)
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`) || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
}

/** Pairwise overlap (see `colide`): every (slug, surface) that overlaps a surface of another slug, sorted. */
export function manifestosDisjuntos(
  m: Record<string, string[]>,
): { disjuntos: true } | { disjuntos: false; colisoes: { slug: string; superficie: string }[] } {
  const es = Object.entries(m)
  const colisoes = es
    .flatMap(([slug, ss]) =>
      [...new Set(ss)]
        .filter((s) => es.some(([outro, os]) => outro !== slug && os.some((o) => colide(s, o))))
        .map((superficie) => ({ slug, superficie })),
    )
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.superficie.localeCompare(b.superficie))
  return colisoes.length ? { disjuntos: false, colisoes } : { disjuntos: true }
}

/**
 * The latest manifest per slug of a fork ledger file's raw text (R6, R7): the `SURFACES <slug>` keyword line plus the
 * two-space continuation lines after it; `rev` = `<n>.<fnv1a32 of that text>`, n = the raw count of that slug's lines.
 */
export function manifestosDoLedger(texto: string): Record<string, { texto: string; rev: string }> {
  const out: Record<string, { texto: string; rev: string }> = {}
  const n: Record<string, number> = {}
  const linhas = String(texto).split(/\r?\n/)
  linhas.forEach((l, i) => {
    const m = l.match(/^SURFACES (\S+)/)
    if (!m) return
    const slug = m[1]!
    const corpo = [l.trimEnd()]
    for (let j = i + 1; j < linhas.length && linhas[j]!.startsWith('  '); j++) corpo.push(linhas[j]!.trimEnd())
    n[slug] = (n[slug] ?? 0) + 1
    const t = corpo.join('\n')
    out[slug] = { texto: t, rev: `${n[slug]}.${fnv1a32(t)}` }
  })
  return out
}
