// The world beneath the mod for the Maestro tests, in memory (moved out of olhos.test.ts by C11-S01 so the visual
// tests share it): files, git, the store, held clock periods, an in-memory planning db and every $ call the mod makes.
export const PLANO = {
  conjuntos: [{ id: 'C01', titulo: 'Base', specs: ['C01-S01'] }],
  specs: [{ id: 'C01-S01', conjunto: 'C01', slug: 'olhos' }],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: 'NOVARC-PLUGIN-MAESTRO' },
  execucao: { orquestrador: 'novarc-orq-NOVARC-PLUGIN-MAESTRO' },
}
export const URL = 'https://claude.ai/artifact/TESTE'
export const SESSOES = 'C:/Users/t/.claude/maestro/sessoes'

// The world beneath the mod, in memory: files (registry, ledgers) with size and mtimeMs as $.fs.list reports them,
// git answered from `branch` / `head`, the store, held clock periods, and every $ call the mod makes (the `*` hook).
export type Timer = { ms: number; fire: () => void; disparado: boolean; abortado: boolean }
export type Mundo = {
  branch: string
  head: string | null
  gitDir: string
  id: string
  home: string | null
  arquivos: Record<string, { text: string; mtimeMs: number }>
  store: Record<string, unknown>
  runs: string[]
  lidos: string[]
  listados: string[]
  logs: string[]
  tools: unknown[]
  timers: Timer[]
  eventos: { at: number; e: any }[]
  segurar: ((dir: string) => Promise<void> | null) | null
  falhar: ((path: string) => boolean) | null
  abertos: string[]
  semBanco: boolean
  /** Holds or fails one tool call (Artifact / ArtifactData) the way `segurar` / `falhar` do for files. */
  segurarTool: ((e: any) => Promise<void> | null) | null
  falharTool: ((e: any) => boolean) | null
  /** C02-S01: what `ledger.py sweep` answers (and after how long), the toasts raised, an in-memory planning db. */
  sweep: { exitCode: number; stdout: string } | (() => { exitCode: number; stdout: string }) | null
  sweepAtraso: number
  sweepFalha: boolean
  toasts: string[]
  db: Record<string, { data: any; version: number }> | null
  /** Milliseconds added to $.clock.now (the sweep's 5 s gate), so a test steps time without waiting. */
  avanco: number
  /** Holds one plugin state read (`$.state.get`) until the returned promise settles. */
  segurarEstado: ((e: any) => Promise<void> | null) | null
  /** Makes one plugin state write (`$.state.set`) throw. */
  falharEstado: ((e: any) => boolean) | null
  /** C11-S01: answers plugin state reads by key with a prepared value (the drawing tests); undefined passes the read on. */
  servirEstado: Record<string, unknown> | null
  /** C03-S01: what `git rev-parse --show-toplevel` and `git symbolic-ref ... origin/HEAD` answer; null keeps the old answer (the branch). */
  git: { toplevel: string; origemHead: string } | null
  /** C03-S01 Task 7: answers a `$.session.send` (the delivery result) in place of the default `{ isDelivered: true }`. */
  entrega: ((e: any) => any) | null
  /** C03-S01 Task 7: makes one `$.process.run` exit 1 (a `ledger.py append` that failed). */
  falharRun: ((argv: string[]) => boolean) | null
  /** C03-S01 final fix 4: extra environment variables `$.env.get` answers (TEMP, TMPDIR...). */
  env: Record<string, string>
}
export const norm = (p: unknown) => String(p).replace(/\\/g, '/')
export let seq = 0
export function gravar(m: Mundo, path: string, text: string, mtimeMs = Date.now() + ++seq) {
  m.arquivos[norm(path)] = { text, mtimeMs }
}

/** ArtifactData `update`: objects merge deep, arrays and scalars replace, `{ __delete__: true }` removes the key. */
export function mesclarFundo(a: any, b: any): any {
  if (!b || typeof b !== 'object' || Array.isArray(b) || !a || typeof a !== 'object' || Array.isArray(a)) return b
  const out: any = { ...a }
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && (v as any).__delete__ === true) delete out[k]
    else out[k] = mesclarFundo(a[k], v)
  }
  return out
}

/** An in-memory planning db keyed `<collection>/<id>`: get/list print document lines, writes check `if_version`. */
export function banco(db: Record<string, { data: any; version: number }>, e: any) {
  const linha = (k: string) => JSON.stringify({ id: k.split('/').pop(), data: db[k]!.data, version: db[k]!.version, updatedAt: 'x' })
  const k = `${e.collection}/${e.doc_id}`
  const ok = (t: string) => ({ result: '', text: t, isError: false })
  // the platform's batch: one unpinned `set` on an existing document refuses the whole batch, naming that entry
  if (e.action === 'batch') {
    const ws: any[] = e.writes ?? []
    const ruim = ws.find(w => w.op === 'set' && w.if_version === undefined && db[`${w.collection}/${w.doc_id}`])
    if (ruim) return { result: '', text: `Batch refused: ${ruim.collection}/${ruim.doc_id} already exists and the entry carries no if_version. Nothing was written.`, isError: true }
    for (const w of ws) {
      const r = banco(db, { ...w, action: w.op })
      if (r.isError) return r
    }
    return ok(`Batch committed: ${ws.length} writes.`)
  }
  if (e.action === 'get') return ok(`=== BEGIN ARTIFACT DB x ===\n${db[k] ? linha(k) : ''}\n=== END ARTIFACT DB x ===`)
  if (e.action === 'list') return ok(`=== BEGIN ARTIFACT DB x ===\n${Object.keys(db).filter(x => x.startsWith(`${e.collection}/`)).map(linha).join('\n')}\n=== END ARTIFACT DB x ===`)
  // C03-S01: `query` with equality `where` clauses only ([field, 'eq' | '==', value])
  if (e.action === 'query') {
    const ws: any[][] = e.query?.where ?? []
    const casa = (k: string) => ws.every(([f, op, v]) => (op === 'eq' || op === '==') && db[k]!.data?.[f] === v)
    return ok(`=== BEGIN ARTIFACT DB x ===\n${Object.keys(db).filter(x => x.startsWith(`${e.collection}/`) && casa(x)).map(linha).join('\n')}\n=== END ARTIFACT DB x ===`)
  }
  if (e.action === 'set') {
    if (db[k] && e.if_version === undefined) return { result: '', text: `Document ${k} already exists.`, isError: true }
    db[k] = { data: e.data, version: (db[k]?.version ?? 0) + 1 }
    return ok(`Database update committed. The document is now at version ${db[k]!.version}.`)
  }
  if (e.action === 'update') {
    if (!db[k] || db[k]!.version !== e.if_version) return { result: '', text: 'version conflict', isError: true }
    db[k] = { data: mesclarFundo(db[k]!.data, e.data), version: db[k]!.version + 1 }
    return ok(`Database update committed. The document is now at version ${db[k]!.version}.`)
  }
  return ok('ok')
}

// A run with no planning artifact: no ai/specs, a session-build orchestrator that spawns a fork, the fork reports
// checkpoints by message and through ledger.py. Nothing touches the host.
export function montar(on: any, escritos: Record<string, string>, branch = 'main', comPlano = false): Mundo {
  const m: Mundo = {
    branch, head: null, gitDir: '.git', id: 'sess-1', home: 'C:/Users/t', arquivos: {}, store: {},
    runs: [], lidos: [], listados: [], logs: [], tools: [], timers: [], eventos: [], segurar: null, falhar: null, abertos: [], semBanco: false,
    segurarTool: null, falharTool: null, sweep: null, sweepAtraso: 0, sweepFalha: false, toasts: [], db: null, avanco: 0, segurarEstado: null, falharEstado: null, servirEstado: null, git: null, entrega: null, falharRun: null, env: {},
  }
  gravar(m, 'C:/repo/ai/ledger/fork-c02-s01.md', 'READY c02-s01  # 2026-10-15T12:00:00Z\nPLAN p.md TASKS 3  # 2026-10-15T12:05:00Z\n', 1)
  on('*', async ($: any, e: any, next: any) => {
    m.eventos.push({ at: performance.now(), e })
    return next(e)
  })
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('session.end', async ($: any, e: any) => ({ sessionId: e.sessionId }))
  on('command.register', async () => ({ value: undefined }))
  on('session.id', async () => ({ value: m.id }))
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async ($: any, e: any) => ({ value: e.name === 'USERPROFILE' && m.home ? m.home : m.env[e.name] }))
  on('fs.list', async ($: any, e: any) => {
    const dir = norm(e.path)
    m.listados.push(dir)
    const espera = m.segurar?.(dir)
    if (espera) await espera
    const filhos = Object.entries(m.arquivos).filter(([k]) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
    // immediate subfolders (ai/specs/<codigo>/artefato.txt), so the artifact half of session start can find its url
    const pastas = [...new Set(Object.keys(m.arquivos).filter(k => k.startsWith(`${dir}/`) && k.slice(dir.length + 1).includes('/')).map(k => k.slice(dir.length + 1).split('/')[0]!))]
    if (!filhos.length && !pastas.length) throw new Error('no dir')
    return {
      value: [
        ...filhos.map(([k, f]) => ({ name: k.slice(dir.length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })),
        ...pastas.map(name => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })),
      ],
    }
  })
  on('fs.read', async ($: any, e: any) => {
    const p = norm(e.path)
    m.lidos.push(p)
    if (m.falhar?.(p)) throw new Error('EBUSY')
    if (p.endsWith('plano.json')) return { value: JSON.stringify(PLANO) }
    if (p.endsWith('/HEAD')) return { value: m.head ?? `ref: refs/heads/${m.branch}\n` }
    return { value: m.arquivos[p]?.text ?? '' }
  })
  on('fs.write', async ($: any, e: any) => {
    const espera = m.segurar?.(norm(e.path))
    if (espera) await espera
    escritos[e.path] = e.text
    gravar(m, e.path, e.text)
    return { value: undefined }
  })
  on('store.get', async ($: any, e: any) => ({ value: m.store[e.key] }))
  on('store.set', async ($: any, e: any) => {
    m.store[e.key] = e.value
    return { value: undefined }
  })
  on('store.delete', async ($: any, e: any) => {
    delete m.store[e.key]
    return { value: undefined }
  })
  on('store.keys', async () => ({ value: Object.keys(m.store) }))
  on('process.run', async ($: any, e: any) => {
    m.runs.push(e.argv.join(' '))
    if (m.falharRun?.(e.argv)) return { value: { exitCode: 1, stdout: '', stderr: 'falhou' } }
    if (e.argv.includes('sweep')) {
      if (m.sweepAtraso) await dormir(m.sweepAtraso)
      if (m.sweepFalha) throw new Error('no python')
      const s = typeof m.sweep === 'function' ? m.sweep() : m.sweep
      return { value: { ...(s ?? { exitCode: 0, stdout: 'SWEEP SUMMARY forks=1 grants=0 outstanding=0 ungranted=0\n' }), stderr: '' } }
    }
    if (m.git && e.argv.includes('--show-toplevel')) return { value: { exitCode: 0, stdout: `${m.git.toplevel}\n`, stderr: '' } }
    if (m.git && e.argv.includes('symbolic-ref')) return { value: { exitCode: 0, stdout: `${m.git.origemHead}\n`, stderr: '' } }
    return { value: { exitCode: 0, stdout: e.argv.includes('--git-dir') ? `${m.gitDir}\n` : `${m.branch}\n`, stderr: '' } }
  })
  on('clock.now', async () => ({ value: Date.now() + m.avanco }))
  on('state.get', async ($: any, e: any, next: any) => {
    const espera = m.segurarEstado?.(e)
    if (espera) await espera
    if (m.servirEstado && e.plugin === 'novarc' && e.key in m.servirEstado) return { value: { value: m.servirEstado[e.key] } }
    return next(e)
  })
  on('state.set', async ($: any, e: any, next: any) => {
    if (m.falharEstado?.(e)) throw new Error('state write failed')
    return next(e)
  })
  on('clock.after', ($: any, e: any, next: any) =>
    new Promise(res => {
      const t: Timer = { ms: e.ms, fire: () => res({ value: undefined }), disparado: false, abortado: false }
      next.signal?.addEventListener('abort', () => (t.abortado = true))
      m.timers.push(t)
    }))
  on('ui.toast', async ($: any, e: any) => {
    m.toasts.push(String(e.text))
    return { value: undefined }
  })
  // Each period is one dispatch, held until the test fires it; an aborted dispatch is a cancelled timer.
  on('clock.every', ($: any, e: any, next: any) =>
    new Promise(res => {
      const t: Timer = { ms: e.ms, fire: () => res({ value: undefined }), disparado: false, abortado: false }
      next.signal?.addEventListener('abort', () => (t.abortado = true))
      m.timers.push(t)
    }))
  on('ui.log', async ($: any, e: any) => {
    m.logs.push(String(e.text))
    return { value: undefined }
  })
  on('ui.open', async ($: any, e: any) => {
    if (m.falhar?.(`ui.open:${e.id}`)) throw new Error('no pane')
    m.abertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.render', async () => ({ type: 'Box', children: ['engine'] })) // the engine's own drawing, under a hook's next(e)
  on('tool.list', async () => ({ value: comPlano ? [{ name: 'ArtifactData' }] : [] }))
  on('tool.call', async ($: any, e: any) => {
    m.tools.push(e)
    const espera = m.segurarTool?.(e)
    if (espera) await espera
    if (m.falharTool?.(e)) return { result: '', text: 'boom', isError: true }
    if (e.tool === 'ArtifactData' && m.semBanco) return { result: '', text: 'offline', isError: true }
    if (e.tool === 'ArtifactData' && m.db) return banco(m.db, e)
    return e.tool === 'Artifact' ? { result: '', text: 'File saved: "C:/tmp/plano.json" (1 bytes)', isError: false } : { result: '', text: 'ok', isError: false }
  })
  on('agent.spawn', async () => ({ model: 'm', agentId: 'ag-1' }))
  on('session.send', async ($: any, e: any) => m.entrega?.(e) ?? { isDelivered: true })
  on('prompt.submit', async ($: any, e: any) => ({ text: e.text }))
  on('session.receive', async ($: any, e: any) => ({ text: e.text }))
  return m
}

export const dormir = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Every $ call but the clock's own period requests. */
export const chamadas = (m: Mundo) => m.eventos.filter(x => !(Object.keys(x.e ?? {}).length === 1 && 'ms' in x.e))
/** Waits until the mod made no $ call for 40 ms. */
export async function quieto(m: Mundo) {
  let n = -1
  while (n !== m.eventos.length) {
    n = m.eventos.length
    await dormir(40)
  }
}
/** Fires the oldest held period of the one-minute look without waiting for the tick. */
export function disparar(m: Mundo, ms = 60_000) {
  const t = m.timers.find(x => x.ms === ms && !x.disparado && !x.abortado)
  if (!t) throw new Error(`no armed ${ms} ms timer`)
  t.disparado = true
  t.fire()
}
/**
 * Fires the one `ms` timer armed at or after index `desde` of `m.timers` (taken right before the action that should arm
 * it), so a test fires the audit flush's own 5 s timer and never a sweep's; throws unless exactly one is pending.
 */
export function dispararDesde(m: Mundo, desde: number, ms = 5000) {
  const ts = m.timers.slice(desde).filter(t => t.ms === ms && !t.disparado && !t.abortado)
  if (ts.length !== 1) throw new Error(`${ts.length} pending ${ms} ms timers since ${desde}`)
  ts[0]!.disparado = true
  ts[0]!.fire()
}
/** Pending `ms` timers armed at or after index `desde`. */
export const pendentesDesde = (m: Mundo, desde: number, ms = 5000) => m.timers.slice(desde).filter(t => t.ms === ms && !t.disparado && !t.abortado).length
/** One look: fires it, waits for it to settle, returns the time from the fire to its last $ call. */
export async function tick(m: Mundo): Promise<number> {
  const n = m.eventos.length
  const t0 = performance.now()
  disparar(m)
  await quieto(m)
  const meus = chamadas({ ...m, eventos: m.eventos.slice(n) })
  return meus.length ? meus[meus.length - 1]!.at - t0 : 0
}
/** Timers armed (not period follow-ups): dispatches of that period minus the ones fired. */
export const armados = (m: Mundo, ms = 60_000) => m.timers.filter(t => t.ms === ms).length - m.timers.filter(t => t.ms === ms && t.disparado).length
/** The last value the mod wrote to its `$.state` key (state.set events carry `value`; a get has none). */
export const escrito = (m: Mundo, key: string) => [...m.eventos].reverse().find(x => x.e?.plugin === 'novarc' && x.e?.key === key && 'value' in x.e)?.e.value
export const cancelados = (m: Mundo, ms: number) => m.timers.filter(t => t.ms === ms && t.abortado).length

export const registro = (escritos: Record<string, string>, id = 'sess-1') =>
  JSON.parse(Object.entries(escritos).find(([k]) => norm(k).endsWith(`/.claude/maestro/sessoes/${id}.json`))![1])
export const iniciar = ($: any) => $.session.start?.({ cwd: 'C:/repo', surface: 'desktop', isInteractive: false })
export const CONJ = `conjunto ${URL} C01`
export const BUILD = 'novarc:novarc-session-build'

// ---- C11-S01: reading a drawn tree

/** A node's shown text: its strings, a Button's `[hotkey] label`, nothing for an Svg. */
export const textoNo = (n: any): string =>
  typeof n === 'string' ? n : n?.type === 'Button' ? `${n.props?.hotkey ? `[${n.props.hotkey}] ` : ''}${n.props?.label ?? ''}` : (n?.children ?? []).map(textoNo).join('')
/** Every element of a drawn tree, depth first. */
export const todos = (n: any, out: any[] = []): any[] => {
  if (!n || typeof n !== 'object') return out
  out.push(n)
  for (const c of n.children ?? []) todos(c, out)
  return out
}
const parte = (n: any): string => (n?.type === 'Svg' ? String(n.props?.alt ?? '') : n?.type === 'Client' ? String(n.props?.props?.label ?? '') : textoNo(n))
/**
 * The band's three columns (R19): title and status of line 1, the parts of line 2 (a Client's label, an Svg's alt, a
 * Text's text) and of the right column.
 */
export function partesDaFaixa(raiz: any): { titulo: string; status: string; segunda: string[]; direita: string[] } {
  const [, meio, dir] = raiz?.children ?? []
  const [l1, l2] = meio?.children ?? []
  const textos = (l1?.children ?? []).filter((c: any) => c?.type !== 'Svg')
  return {
    titulo: textoNo(textos.find((c: any) => c?.props?.bold)),
    status: textoNo(textos[textos.length - 1]),
    segunda: (l2?.children ?? []).flatMap((c: any) => (c?.type === 'Box' && c.children?.length === 1 && c.children[0]?.type === 'Svg' ? [parte(c.children[0])] : [parte(c)])).filter(Boolean),
    direita: (dir?.children ?? []).map(parte).filter(Boolean),
  }
}
