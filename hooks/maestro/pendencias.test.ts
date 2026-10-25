import { expect, test } from 'claude-code/testing'

import {
  aberta, agrupar, abertos, cruzar, destino, faseAtual, filtrarDoc, itensACaminho, lerArquivos, lerLegado, lerListaEstrita, linhaDoc,
  montarItens, resumoDoc, rotuloFase, segurando, specDaPergunta, textoDivergencia, unirRepo,
  type PlanoPend,
} from './pendencias'

// Synthetic fixtures only: no real client pending text.
const PREAMBULO = '# PENDINGS.md\n\nOpen items.\n\n## How to use it\n\n- Mark each entry.\n\n### Write them short\n\n- Density beats prose.\n\n---\n\n'

test('lerLegado parses both heading styles, sections and three facts', () => {
  const t = PREAMBULO + [
    '## Plano X',
    '',
    '### Retry do webhook — `OPEN`',
    '- O que: a',
    '- Por que: b',
    '- Destrava: c',
    '',
    '### ACCEPTED — Stack diferente no cliente',
    '- Pendente: x',
    '',
    '### `DONE` velho',
  ].join('\n')
  const es = lerLegado(t)
  expect(es.map(e => e.status)).toEqual(['OPEN', 'ACCEPTED', 'CLOSED'])
  expect(es[0]!.secao).toBe('Plano X')
  expect(es[0]!.titulo).toBe('Retry do webhook')
  expect(es[1]!.titulo).toBe('Stack diferente no cliente')
  expect(es[2]!.titulo).toBe('velho')
  expect([es[0]!.oQue, es[0]!.porQue, es[0]!.destrava, es[0]!.quem]).toEqual(['a', 'b', 'c', 'equipe'])
})

test('an entry with Status: ??? is unreadable, not dropped', () => {
  const es = lerLegado('## P\n\n### Coisa\n- Status: ???\n')
  expect(es.length).toBe(1)
  expect(es[0]!.status).toBe('ILEGIVEL')
  expect(lerLegado('## P\n\n### Coisa\n**Status:** GATED\n')[0]!.status).toBe('GATED')
  // an upper-case word that starts a title is not a status
  expect(lerLegado('## P\n\n### API retry\n\n### PND-0009 sem status\n').map(e => [e.titulo, e.status])).toEqual([['API retry', 'ILEGIVEL'], ['PND-0009 sem status', 'ILEGIVEL']])
  expect(lerLegado('## P\n\n### CLOSED 2026-10-01 — feito\n')[0]!.status).toBe('CLOSED')
})

test('CRLF parses like LF', () => {
  const lf = '## P\n\n### Retry do webhook — `OPEN`\n- O que: a\n- Por quê: b\n'
  expect(lerLegado(lf.replace(/\n/g, '\r\n'))).toEqual(lerLegado(lf))
  expect(lerLegado(lf)[0]!.porQue).toBe('b')
})

test('responde: cliente marks the entry for the client', () => {
  const es = lerLegado('## P\n\n### A — `OPEN`\n- responde: cliente\n\n### B — `OPEN`\n- O que: x\n')
  expect(es.map(e => e.quem)).toEqual(['cliente', 'equipe'])
})

test('the template preamble is not an entry', () => {
  expect(lerLegado(PREAMBULO + '## Plano\n\n### Um — `OPEN`\n').length).toBe(1)
  expect(lerLegado('# PENDINGS.md\n\n### Write them short\n\n## Plano\n\n### Um — `OPEN`\n').map(e => e.titulo)).toEqual(['Um'])
})

test('legacy entries keep their PND id and the p- ids they name', () => {
  const [e] = lerLegado('## P\n\n### PND-0007 algo (p-exemplo-aberta) — `OPEN`\n- O que: ver p-outra-coisa\n')
  expect(e!.id).toBe('PND-0007')
  expect(e!.planejamento).toEqual(['p-exemplo-aberta', 'p-outra-coisa'])
})

const ARQ = '---\nid: PND-0001\nstatus: OPEN\nquem_responde: cliente\nfase_planejamento: f6\npendencia_planejamento: p-exemplo-aberta\ntitulo: Retry do webhook\n---\n- O que: a\n- Por que: b\n- Destrava: c\n'

test('lerArquivos reads frontmatter, CRLF and LF alike', () => {
  const [e] = lerArquivos([{ nome: 'PND-0001.md', texto: ARQ }])
  expect(e).toMatchObject({ id: 'PND-0001', status: 'OPEN', quem: 'cliente', titulo: 'Retry do webhook', planejamento: ['p-exemplo-aberta'], oQue: 'a', destrava: 'c' })
  expect(lerArquivos([{ nome: 'PND-0001.md', texto: ARQ.replace(/\n/g, '\r\n') }])).toEqual(lerArquivos([{ nome: 'PND-0001.md', texto: ARQ }]))
  const [f] = lerArquivos([{ nome: 'PND-0002.md', texto: '---\nid: PND-0002\nstatus: GATED\npendencia_planejamento: [p-a, p-b]\n---\n' }])
  expect(f).toMatchObject({ titulo: 'PND-0002', quem: 'equipe', planejamento: ['p-a', 'p-b'] })
})

test('file wins over the legacy entry with the same ID', () => {
  const arq = lerArquivos([{ nome: 'PND-0007.md', texto: '---\nid: PND-0007\nstatus: CLOSED\n---\n' }])
  const leg = lerLegado('## P\n\n### PND-0007 algo — `OPEN`\n\n### Sem id — `OPEN`\n')
  const u = unirRepo(arq, leg)
  expect(u.length).toBe(2)
  expect(u.find(e => e.id === 'PND-0007')!.status).toBe('CLOSED')
})

/** A file shaped like the large legacy one: 77 OPEN, 88 ACCEPTED, 15 GATED, 3 WATCH, ~100 sections, 8,306 lines. */
function kidsy(): string {
  const st = [...Array(77).fill('OPEN'), ...Array(88).fill('ACCEPTED'), ...Array(15).fill('GATED'), ...Array(3).fill('WATCH')]
  const ls: string[] = PREAMBULO.split('\n')
  st.forEach((s, i) => {
    if (i % 2 === 0) ls.push(`## Plano sintético ${i}`, '')
    ls.push(i % 3 === 0 ? `### ${s} — Item sintético ${i}` : `### Item sintético ${i} — \`${s}\``, `- O que: coisa ${i}`, `- Por que: motivo ${i}`, `- Destrava: gatilho ${i}`, '')
  })
  while (ls.length < 8306) ls.splice(ls.length - 1, 0, '  detalhe sintético de corpo')
  return ls.join('\n')
}

test('Kidsy-sized file: 183 entries, exact counts, under 50 ms', () => {
  const t = kidsy()
  expect(t.split('\n').length).toBe(8306)
  const es = lerLegado(t)
  expect(es.length).toBe(183)
  const n = (s: string) => es.filter(e => e.status === s).length
  expect([n('OPEN'), n('ACCEPTED'), n('GATED'), n('WATCH')]).toEqual([77, 88, 15, 3])
  // best of 3: wall time under machine load is the known flaky lane, never loosened
  const dts = [0, 1, 2].map(() => {
    const t0 = performance.now()
    lerLegado(t)
    return performance.now() - t0
  })
  expect(Math.min(...dts)).toBeLessThan(50)
})

// ---- planning side

const FASES = Array.from({ length: 10 }, (_, i) => ({ id: `f${i + 1}` }))
const PLANO: PlanoPend = {
  fases: FASES,
  conjuntos: Array.from({ length: 6 }, (_, i) => ({ id: `C0${i + 1}`, fase: `f${i + 1}` })),
  specs: [{ id: 'C06-S02', mudancas: ['m-fila'] }],
  pendencias: [
    { id: 'p-exemplo-aberta', titulo: 'Aberta', texto: 'Qual a regra da fila?', quem: 'Willian', fase: 'f6', mudancas: ['m-fila'] },
    { id: 'p-exemplo-parcial', titulo: 'Parcial', texto: 'Parcial?', quem: 'Willian', fase: 'f6' },
    { id: 'p-excecao-claude-md', titulo: 'Exceção', texto: 'Exceção?', quem: 'Willian', fase: 'f6' },
    { id: 'p-exemplo-futura', titulo: 'Futura', texto: 'Futura?', quem: 'Willian', fase: 'f10' },
  ],
}
const STATUS = { C01: 'concluido', C02: 'concluido', C03: 'concluido', C04: 'concluido', C05: 'concluido', C06: 'em-andamento' }
const RESP = { 'p-exemplo-parcial': { resposta: 'sim', situacao: 'parcial' }, 'p-excecao-claude-md': { resposta: 'aprovado', situacao: 'respondida' } }

test('aberta: partial is open, answered is closed', () => {
  expect(aberta({ resposta: 'sim', situacao: 'parcial' })).toBe(true)
  expect(aberta({ resposta: 'aprovado', situacao: 'respondida' })).toBe(false)
  expect(aberta(undefined)).toBe(true)
  expect(aberta({ resposta: '  ' })).toBe(true)
  expect(aberta({ resposta: 'x' })).toBe(false)
})

test('faseAtual and segurando', () => {
  const f = faseAtual(PLANO, STATUS)
  expect(f).toBe('f6')
  expect(segurando(PLANO, RESP, f)).toBe(2)
  expect(rotuloFase('f6')).toBe('6')
  const tudo = { ...RESP, 'p-exemplo-aberta': { resposta: 'ok' }, 'p-exemplo-parcial': { resposta: 'ok', situacao: 'respondida' } }
  expect(segurando(PLANO, tudo, f)).toBe(0)
  expect(faseAtual(PLANO, { ...STATUS, C06: 'concluido' })).toBe(null)
  expect(specDaPergunta(PLANO, PLANO.pendencias![0]!)).toBe('C06-S02')
  expect(specDaPergunta(PLANO, PLANO.pendencias![1]!)).toBe(null)
})

const ev = (tipo: string, texto: string, min: number) => ({ tipo, texto, at: Date.parse('2026-10-30T10:00:00Z') + min * 60_000 })

test('itensACaminho numbers per spec before sorting and cutting', () => {
  const its = itensACaminho({ 'C06-S02': [ev('PARKED', 'fila ignora o deploy de EF; medido em 2 runs', 0), ev('TASK', '2/5', 2), ev('NOTE', 'CUT ordem por prioridade', 5), ev('NOTE', 'PRE-FECHAMENTO x', 6)] })
  expect(its.map(i => i.tipo)).toEqual(['CUT', 'PARKED'])
  expect(its.map(i => i.ref)).toEqual(['C06-S02:2', 'C06-S02:1'])
  expect(its[0]!.texto).toBe('ordem por prioridade')
  expect(its[1]!.at).toBe('2026-10-30T10:00:00.000Z')
  expect(itensACaminho({ 'C06-S02': [ev('PARKED', 'token sbp_123abc vazou', 0)] })[0]!.texto).toBe('PARKED')
  // a credential as the first word never survives either: the keyword is the type, not a word of the text
  for (const t of ['sbp_123abc vazou', 'ghp_x', 'eyJhbGci.x.y fim']) expect(itensACaminho({ X: [ev('BLOCKED', t, 0)] })[0]!.texto).toBe('BLOCKED')
  expect(itensACaminho({ X: [ev('BLOCKED', 'a'.repeat(200), 0)] })[0]!.texto.length).toBe(120)
  const muitos = itensACaminho({ 'C06-S02': Array.from({ length: 60 }, (_, i) => ev('PARKED', `p${i}`, i)) })
  expect(muitos.length).toBe(50)
  expect(muitos[0]!.ref).toBe('C06-S02:60')
  expect(muitos[49]!.ref).toBe('C06-S02:11')
})

const ITEM_PARKED = { spec: 'C06-S02', ref: 'C06-S02:3', tipo: 'PARKED' as const, texto: 'corrigir ordem da fila', at: '2026-10-30T10:00:00Z' }
const repoA2 = lerLegado('## P\n\n### Retry do webhook — `OPEN`\n\n' + [1, 2, 3, 4].map(i => `### Aceita ${i} — \`ACCEPTED\`\n`).join('\n') + '\n### Vigiar — `WATCH`\n')

test('grouping by who acts', () => {
  const { itens } = montarItens({ plano: PLANO, resp: RESP, repo: repoA2, aCaminho: [ITEM_PARKED], done: new Set(), enviados: [] })
  const g = agrupar(itens, null)
  expect(g.socio.map(i => i.id)).toContain('p-exemplo-aberta')
  expect(g.socio.map(i => i.titulo)).toContain('Retry do webhook')
  expect(g.socio.some(i => i.id === 'p-excecao-claude-md')).toBe(false)
  expect(g.pre.map(i => i.ref)).toEqual(['C06-S02:3'])
  expect(g.pre[0]!.destino).toBe('tratar no pré-fechamento')
  expect(g.aceita).toEqual({ n: 5, accepted: 4, watch: 1 })
  expect(abertos(itens)).toBe(g.socio.length + g.pre.length)
  // the phase filter keeps only items holding that phase
  expect(agrupar(itens, 'f10').socio.map(i => i.id)).toEqual(['p-exemplo-futura'])
  // a planning item sent to pre-close moves to that column
  const env = montarItens({ plano: PLANO, resp: RESP, repo: [], aCaminho: [], done: new Set(), enviados: [{ spec: 'C06-S02', ref: 'p-exemplo-aberta' }] })
  expect(agrupar(env.itens, null).pre.map(i => i.id)).toEqual(['p-exemplo-aberta'])
})

test('refs: planning id, PND id, quoted legacy title, spec ordinal', () => {
  const repo = unirRepo(lerArquivos([{ nome: 'PND-0001.md', texto: ARQ }]), lerLegado('## P\n\n### Sem id — `OPEN`\n'))
  const { itens } = montarItens({ plano: PLANO, resp: {}, repo, aCaminho: [ITEM_PARKED], done: new Set(), enviados: [] })
  const refs = itens.map(i => i.ref)
  expect(refs).toContain('p-exemplo-aberta')
  expect(refs).toContain('PND-0001')
  expect(refs).toContain('"Sem id"')
  expect(refs).toContain('C06-S02:3')
})

test('destino after DONE', () => {
  expect(destino(false)).toBe('tratar no pré-fechamento')
  const { itens } = montarItens({ plano: null, resp: {}, repo: [], aCaminho: [ITEM_PARKED], done: new Set(['C06-S02']), enviados: [] })
  expect(itens[0]!.destino).toBe('vai virar pending no fechamento')
  expect(agrupar(itens, null).pre.length).toBe(0)
})

test('cruzar: resolved in repo', () => {
  const repo = lerLegado('## P\n\n### Deploy na main precisa de aprovação (p-exemplo-aberta) — `ACCEPTED`\n')
  const ds = cruzar(PLANO.pendencias!, RESP, repo)
  expect(ds.length).toBe(1)
  expect(ds[0]!.chave).toBe('pend:p-exemplo-aberta:ACCEPTED:aberta')
  expect(textoDivergencia(ds[0]!)).toBe('Resolvida no repositório (Deploy na main precisa de aprovação (p-exemplo-aberta)), ainda aberta no planejamento')
  const { itens } = montarItens({ plano: PLANO, resp: RESP, repo, aCaminho: [], done: new Set(), enviados: [] })
  const card = itens.find(i => i.id === 'p-exemplo-aberta')!
  expect([card.alerta, card.alertaTexto]).toEqual(['resolvida-no-repo', textoDivergencia(ds[0]!)])
})

test('cruzar: reopened, unlinked and matching states', () => {
  const re = cruzar(PLANO.pendencias!, RESP, lerLegado('## P\n\n### Regra do CLAUDE.md p-excecao-claude-md — `OPEN`\n'))
  expect(re.map(d => d.tipo)).toEqual(['reaberta'])
  expect(textoDivergencia(re[0]!)).toBe('Reaberta no repositório depois de respondida no planejamento')
  expect(cruzar(PLANO.pendencias!, RESP, lerLegado('## P\n\n### Stack diferente no cliente — `OPEN`\n'))).toEqual([])
  expect(cruzar(PLANO.pendencias!, RESP, lerLegado('## P\n\n### Algo p-exemplo-aberta — `OPEN`\n'))).toEqual([])
  expect(cruzar(PLANO.pendencias!, RESP, lerLegado('## P\n\n### Algo p-nao-existe — `CLOSED`\n'))).toEqual([])
})

test('lerListaEstrita accepts only complete, well-formed lists', () => {
  const doc = (id: string, v: number) => `{"id":"${id}","data":{"resposta":"x"},"version":${v},"updatedAt":"t"}`
  const ok = `=== BEGIN ARTIFACT DB x ===\n${doc('p-a', 4)}\n${doc('p-b', 1)}\n=== END ARTIFACT DB x ===`
  const r = lerListaEstrita(ok)!
  expect(Object.keys(r)).toEqual(['p-a', 'p-b'])
  expect(r['p-a']!.version).toBe(4)
  expect(lerListaEstrita(`=== BEGIN ARTIFACT DB x ===\n${doc('p-a', 4)}\n`)).toBe(null)
  expect(lerListaEstrita(`=== BEGIN ARTIFACT DB x ===\n{"id":"p-x","data":\n=== END ARTIFACT DB x ===`)).toBe(null)
  expect(lerListaEstrita('boom')).toBe(null)
  expect(lerListaEstrita('1 document\n=== BEGIN ARTIFACT DB x ===\n=== END ARTIFACT DB x ===')).toEqual({})
})

test('doc summary and filters', () => {
  const repo = lerLegado(kidsy())
  expect(linhaDoc(resumoDoc(repo))).toBe('Doc de pendings do projeto  183 itens · 92 abertos  OPEN 77 GATED 15 WATCH 3 ACCEPTED 88 CLOSED 0')
  const f = filtrarDoc(repo, '', 'todos')
  expect([f.linhas.length, f.mais]).toEqual([50, 133])
  expect(filtrarDoc(repo, '', 'presos').linhas.every(e => e.status === 'GATED')).toBe(true)
  expect(filtrarDoc(repo, '', 'aceitos').linhas.length + filtrarDoc(repo, '', 'aceitos').mais).toBe(91)
  expect(filtrarDoc(repoA2, 'retry', 'todos').linhas.map(e => e.titulo)).toEqual(['Retry do webhook'])
  expect(linhaDoc(null)).toBe('Doc de pendings do projeto  nenhum ainda')
  const r = resumoDoc(lerLegado('## P\n\n### Coisa\n'))
  expect(linhaDoc(r)).toBe('Doc de pendings do projeto  1 itens · 0 abertos  OPEN 0 GATED 0 WATCH 0 ACCEPTED 0 CLOSED 0 · 1 ilegíveis')
  expect([resumoDoc(repoA2).equipe, resumoDoc(repoA2).cliente]).toEqual([6, 0])
})

// ---- integration: the orchestrator's pendencias-refresh, band and tab, drawn through the real hooks (stubs only)

const URL = 'https://claude.ai/artifact/TESTE'
type Db = Record<string, { data: any; version: number }>
type Mundo = {
  db: Db | null; arquivos: Record<string, { text: string; mtimeMs: number }>; tools: any[]; toasts: string[]; copias: string[]
  enviados: any[]; submetidos: string[]; lidos: string[]; timers: { ms: number; fire: () => void; usado: boolean }[]; eventos: any[]
  falharLista: null | 'erro' | 'lixo'; falharEscrita: boolean; plano: any
}
const nrm = (p: unknown) => String(p).replace(/\\/g, '/')
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))

/** Five sets of f1..f5 merged, C06 (f6) running; questions as in A17; C06-S02 maps to m-fila. */
function planoInteg(): any {
  const conjuntos = [1, 2, 3, 4, 5, 6].map(i => ({ id: `C0${i}`, titulo: `Conjunto ${i}`, fase: `f${i}`, specs: [i === 6 ? 'C06-S02' : `C0${i}-S01`] }))
  return {
    projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: 'NOVARC-PLUGIN-MAESTRO' },
    fases: FASES,
    conjuntos,
    specs: conjuntos.map(c => ({ id: c.specs[0], conjunto: c.id, slug: 's', mudancas: c.id === 'C06' ? ['m-fila'] : [] })),
    pendencias: PLANO.pendencias,
  }
}

function dbInteg(extra: Db = {}): Db {
  const db: Db = {}
  for (let i = 1; i <= 5; i++) db[`specs/C0${i}-S01`] = { data: { etapa: 'merge' }, version: 1 }
  db['specs/C06-S02'] = { data: { etapa: 'implementando' }, version: 1 }
  db['pendencias/p-exemplo-parcial'] = { data: { resposta: 'sim', situacao: 'parcial' }, version: 4 }
  db['pendencias/p-excecao-claude-md'] = { data: { resposta: 'aprovado', situacao: 'respondida' }, version: 2 }
  db['pendencias/p-exemplo-futura'] = { data: { resposta: 'depois', situacao: 'respondida' }, version: 1 }
  return { ...db, ...extra }
}

function respostaDb(m: Mundo, e: any) {
  const db = m.db!
  const linha = (k: string) => JSON.stringify({ id: k.split('/').pop(), data: db[k]!.data, version: db[k]!.version, updatedAt: 'x' })
  const k = `${e.collection}/${e.doc_id}`
  const ok = (t: string) => ({ result: '', text: t, isError: false })
  if (e.action === 'list') {
    if (e.collection === 'pendencias' && m.falharLista === 'erro') return { result: '', text: 'boom', isError: true }
    if (e.collection === 'pendencias' && m.falharLista === 'lixo') return ok('=== BEGIN ARTIFACT DB x ===\n{"id":"p-x","data":\n=== END ARTIFACT DB x ===')
    return ok(`=== BEGIN ARTIFACT DB x ===\n${Object.keys(db).filter(x => x.startsWith(`${e.collection}/`)).map(linha).join('\n')}\n=== END ARTIFACT DB x ===`)
  }
  if (e.action === 'get') return ok(`=== BEGIN ARTIFACT DB x ===\n${db[k] ? linha(k) : ''}\n=== END ARTIFACT DB x ===`)
  if (m.falharEscrita) return { result: '', text: 'permission denied', isError: true }
  if (e.action === 'set') {
    if (db[k] && e.if_version === undefined) return { result: '', text: 'exists', isError: true }
    db[k] = { data: e.data, version: (db[k]?.version ?? 0) + 1 }
    return ok(`Database update committed. The document is now at version ${db[k]!.version}.`)
  }
  if (e.action === 'update') {
    if (!db[k] || db[k]!.version !== e.if_version) return { result: '', text: 'version conflict', isError: true }
    db[k] = { data: { ...db[k]!.data, ...e.data }, version: db[k]!.version + 1 }
    return ok(`Database update committed. The document is now at version ${db[k]!.version}.`)
  }
  return ok('ok')
}

const LEGADO_A1 = '## P\n\n### Retry do webhook — `OPEN`\n- O que: reenviar\n- Por que: timeout\n- Destrava: fila\n\n### Dois — `OPEN`\n\n### Três — `OPEN`\n'

function mundo(on: any, o: { db?: Db | null; legado?: string | null; legadoEm?: string; arquivosExtra?: Record<string, string>; plano?: any } = {}): Mundo {
  const m: Mundo = {
    db: o.db === undefined ? dbInteg() : o.db, arquivos: {}, tools: [], toasts: [], copias: [], enviados: [], submetidos: [], lidos: [], timers: [], eventos: [],
    falharLista: null, falharEscrita: false, plano: o.plano ?? planoInteg(),
  }
  if (o.legado !== null) m.arquivos[o.legadoEm ?? 'C:/repo/PENDINGS.md'] = { text: o.legado ?? LEGADO_A1, mtimeMs: 1 }
  for (const [k, text] of Object.entries(o.arquivosExtra ?? {})) m.arquivos[k] = { text, mtimeMs: 1 }
  on('*', async ($: any, e: any, next: any) => {
    m.eventos.push(e)
    return next(e)
  })
  on('session.start', async ($: any, e: any) => ({ cwd: e.cwd }))
  on('command.register', async () => ({ value: undefined }))
  on('session.id', async () => ({ value: 'orq-1' }))
  on('session.cwd', async () => ({ value: 'C:/repo' }))
  on('env.get', async () => ({ value: undefined }))
  on('fs.list', async ($: any, e: any) => {
    const dir = nrm(e.path)
    const filhos = Object.entries(m.arquivos).filter(([k]) => k.startsWith(`${dir}/`) && !k.slice(dir.length + 1).includes('/'))
    if (!filhos.length) throw new Error('no dir')
    return { value: filhos.map(([k, f]) => ({ name: k.slice(dir.length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })) }
  })
  on('fs.read', async ($: any, e: any) => {
    const p = nrm(e.path)
    m.lidos.push(p)
    if (p.endsWith('plano.json')) return { value: JSON.stringify(m.plano) }
    if (p.endsWith('/HEAD')) return { value: 'ref: refs/heads/main\n' }
    if (!m.arquivos[p]) throw new Error('ENOENT')
    return { value: m.arquivos[p]!.text }
  })
  on('fs.write', async () => ({ value: undefined }))
  on('store.get', async () => ({ value: undefined }))
  on('store.set', async () => ({ value: undefined }))
  on('store.delete', async () => ({ value: undefined }))
  on('store.keys', async () => ({ value: [] }))
  on('process.run', async ($: any, e: any) => ({ value: { exitCode: 0, stdout: e.argv.includes('user.name') ? 'Willian Pagane\n' : e.argv.includes('--git-dir') ? '.git\n' : 'main\n', stderr: '' } }))
  on('clock.now', async () => ({ value: Date.now() }))
  on('clock.after', () => new Promise(() => {}))
  on('clock.every', ($: any, e: any) => new Promise(res => m.timers.push({ ms: e.ms, fire: () => res({ value: undefined }), usado: false })))
  on('ui.toast', async ($: any, e: any) => {
    m.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.copy', async ($: any, e: any) => {
    m.copias.push(String(e.text))
    return { value: true }
  })
  on('ui.log', async () => ({ value: undefined }))
  on('ui.open', async () => ({ value: { isPlaced: true } }))
  on('ui.render', async () => ({ type: 'Box', children: ['engine'] }))
  on('tool.list', async () => ({ value: [{ name: 'ArtifactData' }] }))
  on('tool.call', async ($: any, e: any) => {
    m.tools.push(e)
    if (e.tool === 'ArtifactData' && m.db) return respostaDb(m, e)
    if (e.tool === 'ArtifactData') return { result: '', text: 'no db', isError: true }
    return e.tool === 'Artifact' ? { result: '', text: 'File saved: "C:/tmp/plano.json" (1 bytes)', isError: false } : { result: '', text: 'ok', isError: false }
  })
  on('session.send', async ($: any, e: any) => {
    m.enviados.push(e)
    return { isDelivered: true }
  })
  on('prompt.submit', async ($: any, e: any) => {
    m.submetidos.push(String(e.text))
    return { text: e.text }
  })
  on('session.receive', async ($: any, e: any) => ({ text: e.text }))
  return m
}

/** Settles background work: until the mod made no $ call for 40 ms. */
async function quieto(m: Mundo) {
  let n = -1
  while (n !== m.eventos.length) {
    n = m.eventos.length
    await esperar(40)
  }
}
/** The orchestrator skill call: role, plan load and the first poll. */
async function orquestrador($: any, m: Mundo, args = `orquestrar ${URL}`) {
  await $.session.start?.({ cwd: 'C:/repo', surface: 'desktop', isInteractive: false })
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args })
  await quieto(m)
}
/** One 5-minute poll. */
async function poll(m: Mundo) {
  const t = m.timers.filter(x => x.ms === 300_000 && !x.usado).pop()
  if (!t) throw new Error('no poll armed')
  t.usado = true
  t.fire()
  await quieto(m)
}
const listasPend = (m: Mundo) => m.tools.filter(t => t.tool === 'ArtifactData' && t.action === 'list' && t.collection === 'pendencias').length
const texto = (n: any): string =>
  typeof n === 'string' ? n : n?.type === 'Button' ? `${n.props?.hotkey ? `[${n.props.hotkey}] ` : ''}${n.props?.label ?? ''}${(n.children ?? []).map(texto).join('')}` : (n?.children ?? []).map(texto).join(' ')
const nos = (n: any): number => (typeof n === 'string' ? 0 : 1 + (n?.children ?? []).reduce((s: number, c: any) => s + nos(c), 0))
/** The band as one line with single spaces. */
const linhaBanda = async (b: any) => texto(await b.drawn()).replace(/\s+/g, ' ')
const BANDA = { plugin: 'novarc', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false } } as const
const PAINEL = { plugin: 'novarc', surface: 'terminal', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 120 } } as const
async function abrirAba($: any, m: Mundo) {
  const ui = await $.ui.mount(PAINEL)
  await ui.press({ key: 't-pend' })
  await quieto(m)
  return ui
}

test('tab, counter and one pendencias list per poll; PENDINGS.md read once while its marker holds', async ($: any, on: any) => {
  const m = mundo(on)
  await orquestrador($, m)
  expect(listasPend(m)).toBe(1)
  const banda = await $.ui.mount(BANDA)
  expect(await linhaBanda(banda)).toContain('🔴 2 pendências seguram a fase 6')
  await poll(m)
  expect(listasPend(m)).toBe(2)
  expect(m.lidos.filter(p => p.endsWith('PENDINGS.md')).length).toBe(1)
  const ui = await $.ui.mount(PAINEL)
  const abas = texto(await ui.drawn())
  // C11-S01: the emoji tabs; the open count is the tab's own red bold Text
  expect(abas.indexOf('🔒 Locks e filas')).toBeLessThan(abas.indexOf('📌 Pendências'))
  expect((await ui.find({ key: 't-pend' }))?.children).toContainEqual(expect.objectContaining({ type: 'Text', children: [' 5'] }))
  // ver opens the pane on Pendências
  await banda.press({ key: 'ver-pend' })
  expect(texto(await ui.drawn())).toContain('você ou o cliente')
  // with both f6 questions answered the counter goes away
  m.db!['pendencias/p-exemplo-aberta'] = { data: { resposta: 'ok' }, version: 1 }
  m.db!['pendencias/p-exemplo-parcial'] = { data: { resposta: 'ok', situacao: 'respondida' }, version: 5 }
  await poll(m)
  expect(await linhaBanda(banda)).not.toContain('pendências seguram')
})

test('R8: .novarc/PENDINGS.md read once while its marker holds', async ($: any, on: any) => {
  const m = mundo(on, { legadoEm: 'C:/repo/.novarc/PENDINGS.md' })
  await orquestrador($, m)
  await poll(m)
  expect(m.lidos.filter(p => p.endsWith('PENDINGS.md')).length).toBe(1)
})

// ---- C11-S02: pendings read from .novarc first, the legacy places second (A7)

const fm = (id: string, titulo: string) => `---\nid: ${id}\ntitulo: ${titulo}\nstatus: OPEN\n---\n`

test('A7: .novarc/pendings files plus root PENDINGS.md', async ($: any, on: any) => {
  const m = mundo(on, { legado: '## P\n\n### Um — `OPEN`\n', arquivosExtra: { 'C:/repo/.novarc/pendings/P-01.md': fm('P-01', 'Do arquivo P-01') } })
  await orquestrador($, m)
  const t = texto(await (await abrirAba($, m)).drawn())
  expect(t).toContain('Do arquivo P-01')
  expect(t).toContain('Um')
  expect(m.lidos).toContain('C:/repo/.novarc/pendings/P-01.md')
})

test('A7: the file wins on the same id', async ($: any, on: any) => {
  const m = mundo(on, { legado: '## P\n\n### PND-01 Versao do legado — `OPEN`\n', arquivosExtra: { 'C:/repo/.novarc/pendings/PND-01.md': fm('PND-01', 'Versao do arquivo') } })
  await orquestrador($, m)
  const t = texto(await (await abrirAba($, m)).drawn())
  expect(t).toContain('Versao do arquivo')
  expect(t).not.toContain('Versao do legado')
})

test('A7: empty .novarc/pendings falls back to ai/pendings', async ($: any, on: any) => {
  const m = mundo(on, { arquivosExtra: { 'C:/repo/.novarc/pendings/leia.txt': 'x', 'C:/repo/ai/pendings/P-02.md': fm('P-02', 'Antigo P-02') } })
  await orquestrador($, m)
  const t = texto(await (await abrirAba($, m)).drawn())
  expect(t).toContain('Antigo P-02')
  expect(m.lidos).toContain('C:/repo/ai/pendings/P-02.md')
})

test('A7: only docs/PENDINGS.md', async ($: any, on: any) => {
  const m = mundo(on, { legado: null, arquivosExtra: { 'C:/repo/docs/PENDINGS.md': LEGADO_A1 } })
  await orquestrador($, m)
  expect(texto(await (await abrirAba($, m)).drawn())).toContain('Retry do webhook')
})

test('A7: .novarc/PENDINGS.md wins over root', async ($: any, on: any) => {
  const m = mundo(on, { legado: '## P\n\n### Raiz antiga — `OPEN`\n', arquivosExtra: { 'C:/repo/.novarc/PENDINGS.md': '## P\n\n### Pasta nova — `OPEN`\n' } })
  await orquestrador($, m)
  const t = texto(await (await abrirAba($, m)).drawn())
  expect(m.lidos).toContain('C:/repo/.novarc/PENDINGS.md')
  expect(m.lidos).not.toContain('C:/repo/PENDINGS.md')
  expect(t).toContain('Pasta nova')
  expect(t).not.toContain('Raiz antiga')
})

test('no tool call carries repository pending text', async ($: any, on: any) => {
  const m = mundo(on, { legado: kidsy() })
  await orquestrador($, m)
  await poll(m)
  const titulos = lerLegado(kidsy()).map(e => e.titulo)
  const tudo = m.tools.map(t => JSON.stringify(t)).join('\n')
  expect(titulos.length).toBe(183)
  expect(titulos.filter(t => tudo.includes(t))).toEqual([])
})

test('a failed or garbled pendencias list keeps the counter and says planejamento não lido', async ($: any, on: any) => {
  const m = mundo(on)
  await orquestrador($, m)
  const banda = await $.ui.mount(BANDA)
  for (const modo of ['erro', 'lixo'] as const) {
    m.falharLista = modo
    await poll(m)
    expect(await linhaBanda(banda)).toContain('🔴 2 pendências seguram a fase 6')
    const ui = await abrirAba($, m)
    const t = texto(await ui.drawn())
    expect(t).toContain('planejamento não lido')
    expect(t).toContain('Retry do webhook')
    await ui.unmount()
  }
})

test('a repository with no pending doc shows the planning questions and nenhum ainda', async ($: any, on: any) => {
  const m = mundo(on, { legado: null })
  await orquestrador($, m)
  const ui = await abrirAba($, m)
  const t = texto(await ui.drawn())
  expect(t).toContain('Doc de pendings do projeto  nenhum ainda')
  expect(t).toContain('Aberta')
})

test('a run with no planning artifact shows the repository entries only', async ($: any, on: any) => {
  const m = mundo(on, { db: null })
  await orquestrador($, m, 'orquestrar')
  const ui = await abrirAba($, m)
  const t = texto(await ui.drawn())
  expect(t).toContain('Retry do webhook')
  expect(t).not.toContain('Aberta')
  expect(t).not.toContain('planejamento não lido')
})

test('one divergence over two polls: band and a single toast; an orphan lock outranks it', async ($: any, on: any) => {
  const m = mundo(on, { legado: '## P\n\n### Deploy na main precisa de aprovação (p-exemplo-aberta) — `ACCEPTED`\n' })
  await orquestrador($, m)
  await poll(m)
  const banda = await $.ui.mount(BANDA)
  expect(await linhaBanda(banda)).toContain('🔴 1 pendências divergentes')
  expect(m.toasts.filter(t => t.startsWith('Resolvida no repositório')).length).toBe(1)
  const ui = await abrirAba($, m)
  expect(texto(await ui.drawn())).toContain('divergente')
  // an orphan lock mirrored by a set takes the band slot (R19)
  const desde = new Date(Date.now() - 3 * 3600_000).toISOString()
  m.db!['execucao/C06'] = { data: { espelho: { locks: { 'migration x.sql': { spec: 'C06-S02', desde, estado: 'GRANTED-NOT-RELEASED' } }, specs: {}, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at: desde } }, version: 1 }
  await poll(m)
  const linha = await linhaBanda(banda)
  expect(linha).not.toContain('pendências divergentes')
  expect(linha).toContain('🔴')
})

const ESPELHO = (ultimo: string, aCaminho: any[] = [{ spec: 'C06-S02', ref: 'C06-S02:3', tipo: 'PARKED', texto: 'corrigir ordem da fila', at: new Date().toISOString() }]) => ({
  espelho: {
    locks: {}, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at: new Date().toISOString(),
    specs: { 'C06-S02': { ultimo, texto: ultimo, at: new Date().toISOString() } },
    aCaminho,
  },
})

test('a caminho, columns and the card actions', async ($: any, on: any) => {
  const m = mundo(on, { db: dbInteg({ 'execucao/C06': { data: ESPELHO('TASK'), version: 1 } }) })
  await orquestrador($, m)
  const ui = await abrirAba($, m)
  let t = texto(await ui.drawn())
  // C11-S01: the caption and the KPI replace the count line
  expect(t).toContain('A CAMINHO DO DOC DE PENDINGS')
  expect((await ui.find({ key: 'pk-3' }))?.text).toBe('📬1a caminho do doc')
  expect(t).toContain('tratar no pré-fechamento')
  expect(t).toContain('📚 0 dívidas aceitas')
  await ui.press({ key: 'cp-socio-p-exemplo-aberta' })
  expect(m.copias).toEqual(['Qual a regra da fila?'])
  await ui.press({ key: 'ab-socio-p-exemplo-aberta' })
  const abertos = m.tools.filter(x => x.tool === 'Artifact' && x.action === 'open')
  expect(abertos.length).toBe(1)
  expect(abertos[0]).toMatchObject({ tool: 'Artifact', action: 'open', url: URL })
  // mandar ao pré-fechamento: only the person's words, no directive from the mod
  await ui.press({ key: 'pf-pre-C06-S02:3' })
  expect(m.submetidos).toContain('Mande para o pré-fechamento de C06-S02: C06-S02:3')
  expect(m.enviados).toEqual([])
  // marcar como enviada: set with only enviada when absent; pinned update when present
  await ui.press({ key: 'en-socio-p-exemplo-aberta' })
  await quieto(m)
  const escritas = m.tools.filter(x => x.tool === 'ArtifactData' && (x.action === 'set' || x.action === 'update'))
  expect(escritas[0].action).toBe('set')
  expect(escritas[0].if_version).toBe(undefined)
  expect(Object.keys(escritas[0].data)).toEqual(['enviada'])
  expect(escritas[0].data.enviada.by).toBe('Willian Pagane')
  await ui.press({ key: 'en-socio-p-exemplo-parcial' })
  await quieto(m)
  const u = m.tools.filter(x => x.tool === 'ArtifactData' && x.action === 'update').pop()
  expect([u.if_version, Object.keys(u.data)]).toEqual([4, ['enviada']])
  expect(await ui.find({ type: 'Text', text: /^ \[enviada ao cliente\] $/ })).toBeDefined()
  // after DONE the item heads for the close-out
  m.db!['execucao/C06'] = { data: ESPELHO('DONE'), version: 2 }
  await poll(m)
  expect(texto(await ui.drawn())).toContain('vai virar pending no fechamento')
})

test('a refused enviada write toasts and draws no mark', async ($: any, on: any) => {
  const m = mundo(on)
  await orquestrador($, m)
  const ui = await abrirAba($, m)
  m.falharEscrita = true
  await ui.press({ key: 'en-socio-p-exemplo-aberta' })
  await quieto(m)
  expect(m.toasts.some(t => t.includes('p-exemplo-aberta') && t.includes('falhou'))).toBe(true)
  expect(await ui.find({ type: 'Text', text: /^ \[enviada ao cliente\] $/ })).toBeUndefined()
})

test('project doc collapsed, expanded, item facts; 230 items under 2,500 nodes', async ($: any, on: any) => {
  const caminho = Array.from({ length: 23 }, (_, i) => ({ spec: 'C06-S02', ref: `C06-S02:${i + 1}`, tipo: 'PARKED', texto: `item ${i}`, at: new Date().toISOString() }))
  const m = mundo(on, { legado: kidsy(), db: dbInteg({ 'execucao/C06': { data: ESPELHO('TASK', caminho), version: 1 } }) })
  m.plano = { ...planoInteg(), pendencias: [...PLANO.pendencias!, ...Array.from({ length: 20 }, (_, i) => ({ id: `p-extra-${i}`, titulo: `Extra ${i}`, texto: 'x', quem: 'Willian', fase: 'f6' }))] }
  await orquestrador($, m)
  const ui = await abrirAba($, m)
  let arvore = await ui.drawn()
  expect(texto(arvore)).toContain('Doc de pendings do projeto  183 itens · 92 abertos  OPEN 77 GATED 15 WATCH 3 ACCEPTED 88 CLOSED 0')
  await ui.press({ key: 'p-doc' })
  arvore = await ui.drawn()
  expect(texto(arvore)).toContain('mais 133: refine a busca')
  expect(texto(arvore)).toContain('quem responde: equipe 183 · cliente 0')
  expect(nos(arvore)).toBeLessThan(2500)
  await ui.press({ key: 'dl-Item sintético 1' })
  const t = texto(await ui.drawn())
  for (const s of ['O que: coisa 1', 'Por que: motivo 1', 'Destrava: gatilho 1', 'responde: equipe']) expect(t).toContain(s)
})

// ---- C11-S01: the Pendências tab drawn with the kit (R13, R17, R18, R28, R31)

test('Pendências on desktop: KPIs, filter row, captions, two columns, debt card, doc card toggle and Input (A12, A16)', async ($: any, on: any) => {
  const m = mundo(on, { db: dbInteg({ 'execucao/C06': { data: ESPELHO('TASK'), version: 1 } }) })
  await orquestrador($, m)
  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 't-pend' })
  await quieto(m)
  const col = async (re: RegExp) => Number((await ui.find({ type: 'Text', text: re }))?.text.match(/· (\d+)$/)?.[1])
  const socio = await col(/^🙋 você ou o cliente · \d+$/)
  const pre = await col(/^🔧 pré-fechamento · \d+$/)
  expect([socio, pre].every(n => Number.isInteger(n))).toBe(true)
  expect((await ui.find({ key: 'pk-1' }))?.text).toBe(`🙋${socio}esperam você ou o cliente`)
  expect((await ui.find({ key: 'pk-2' }))?.text).toBe(`🔧${pre}vão ao pré-fechamento`)
  expect((await ui.find({ key: 'pk-3' }))?.text).toBe('📬1a caminho do doc')
  expect(await ui.find({ type: 'Text', text: 'fase' })).toBeDefined()
  expect((await ui.find({ type: 'Text', text: '│' }))?.props.color).toBe('promptBorder')
  expect((await ui.find({ key: 'pf-todas' }))?.props.variant).toBe('primary')
  for (const t of ['A CAMINHO DO DOC DE PENDINGS', 'QUEM AGE']) expect(await ui.find({ type: 'Text', text: t })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^📚 \d+ dívidas aceitas$/ })).toBeDefined()
  expect((await ui.find({ key: 'p-doc' }))?.text).toBe('▶️ abrir')
  expect((await ui.findAll({ type: 'Svg' })).some((s: any) => s.props.alt === 'distribuição do doc')).toBe(true)
  await ui.press({ key: 'p-doc' })
  expect((await ui.find({ key: 'p-doc' }))?.text).toBe('🔽 fechar')
  expect((await ui.find({ key: 'p-busca' }))?.props.placeholder).toBe('buscar título ou ID')
  for (const b of await ui.findAll({ type: 'Button' })) expect(b.props.plain).toBeUndefined()
  await ui.unmount()
})

