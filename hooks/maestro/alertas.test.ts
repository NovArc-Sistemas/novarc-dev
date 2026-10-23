// C02-S01 pure functions: sweep parse, thresholds, ranking, toast dedupe, rhythm, proposal, mirror summary, ready to close.
import { expect, test } from 'claude-code/testing'

import type { Evento, Slots } from '../../types'
import {
  VAZIA, anotar, calados, cortar, cortarTexto, lerSweep, locksDoEspelho, marcadorDir, montarAlertas, novosToasts, orfaos, proposta,
  resumoEspelho, ritmo, slotsAbertos, slotsPresos, textoCheckpoint, textoLimiares,
} from './execucao'
import { prontosSemLock, type ConjuntoDoc, type Plano, type SpecDoc } from './logic'

const AGORA = Date.parse('2026-10-23T12:30:00Z')
const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()
const SUM = (n: number) => `SWEEP SUMMARY forks=1 grants=0 outstanding=${n} ungranted=${n}`

test('lerSweep reads since and drops dates and UTC (A4, A6)', () => {
  const out = [
    'SWEEP OUTSTANDING c03-s01 migration 20261023_auditoria [UNGRANTED] since=2026-10-23T12:00:00Z LOCK migration 20261023_auditoria',
    'SWEEP OUTSTANDING c03-s01 deploy fnA [UNGRANTED] since=- LOCK deploy fnA',
    'SWEEP OUTSTANDING shopee-webchat-audit verify 2026-08-22 [UNGRANTED] since=- LOCK verify 2026-08-22',
    'SWEEP OUTSTANDING shopee-webchat-audit verify UTC [UNGRANTED] since=- LOCK verify UTC',
    SUM(4),
  ].join('\n')
  const r = lerSweep(out, 1)
  expect(r.semLeitura).toBe(false)
  expect(r.linhas).toEqual([
    { slug: 'c03-s01', kind: 'migration', resource: '20261023_auditoria', estado: 'UNGRANTED', desde: '2026-10-23T12:00:00Z' },
    { slug: 'c03-s01', kind: 'deploy', resource: 'fnA', estado: 'UNGRANTED', desde: null },
  ])
})

test('lerSweep marks a non-result as no reading (A5)', () => {
  expect(lerSweep(SUM(0), 2).semLeitura).toBe(true)
  expect(lerSweep(`SWEEP WARNING 0 fork ledger files in C:/x - if forks were dispatched\n${SUM(0)}`, 0).semLeitura).toBe(true)
  expect(lerSweep('main\n', 0).semLeitura).toBe(true)
  expect(lerSweep(SUM(0), 0).semLeitura).toBe(false)
})

test('the sweep result is per resource: only src/b.ts stays held (A3)', () => {
  const r = lerSweep(`SWEEP OUTSTANDING c03-s01 file src/b.ts [UNGRANTED] since=2026-10-23T12:00:00Z LOCK file src/a.ts src/b.ts\n${SUM(1)}`, 1)
  expect(r.linhas.map(l => [l.slug, l.resource])).toEqual([['c03-s01', 'src/b.ts']])
})

test('marker changes on compensated edits and ignores order and non-fork files', () => {
  const a = marcadorDir([{ name: 'fork-a.md', size: 10, mtimeMs: 1 }, { name: 'fork-b.md', size: 10, mtimeMs: 2 }])
  const b = marcadorDir([{ name: 'fork-a.md', size: 12, mtimeMs: 1 }, { name: 'fork-b.md', size: 8, mtimeMs: 2 }])
  const c = marcadorDir([{ name: 'fork-b.md', size: 10, mtimeMs: 2 }, { name: 'ledger.md', size: 99, mtimeMs: 9 }, { name: 'fork-a.md', size: 10, mtimeMs: 1 }])
  expect(a === b).toBe(false)
  expect(c).toBe(a)
})

const lock = (min: number) => ({ spec: 'C03-S01', kind: 'migration', resource: '20261023_auditoria', desde: iso(AGORA - min * MIN), estado: 'UNGRANTED' })

test('an orphan at 21 minutes, none at 19 (A7)', () => {
  expect(orfaos([lock(21)], AGORA, 20).map(o => o.minutos)).toEqual([21])
  expect(orfaos([lock(19)], AGORA, 20)).toEqual([])
  expect(orfaos([{ ...lock(0), desde: '' }], AGORA, 20)).toEqual([])
})

test('a quiet set at 16 minutes alerts, a done one never (A9)', () => {
  const r = calados([{ unidade: 'C03', at: AGORA - 16 * MIN, feito: false }, { unidade: 'C04', at: AGORA - 40 * MIN, feito: true }], AGORA, 15)
  expect(r).toEqual([{ unidade: 'C03', at: AGORA - 16 * MIN, minutos: 16 }])
})

const B = 'feat/c03-s01-guardas-diretivas-auditoria-20261023'
const ev = (tipo: string, texto: string, at: number): Evento => ({ tipo, texto, at })

test('a GO verify with no later RELEASE is a held slot; a LOCK after it queues (A10)', () => {
  const go = ev('GO', `C03 verify ${B}`, AGORA - 25 * MIN)
  let s = slotsAbertos([go, ev('LOCK', 'verify feat/c04-x C04 from=a sid=b', AGORA - 10 * MIN)])
  expect(s.verify.dono).toEqual({ conjunto: 'C03', branch: B, desde: iso(AGORA - 25 * MIN) })
  expect(s.verify.fila.map(f => f.conjunto)).toEqual(['C04'])
  expect(s.producao).toEqual({ dono: null, fila: [] })
  expect(slotsPresos(s, AGORA, 20)).toEqual([{ conjunto: 'C03', kind: 'verify', branch: B, minutos: 25 }])
  s = slotsAbertos([go, ev('RELEASE', `verify ${B}`, AGORA - MIN)])
  expect(s.verify.dono).toBe(null)
})

test('an orphan lock outranks a quiet set (A11); slots come between', () => {
  const lista = montarAlertas({
    orfaos: orfaos([lock(21)], AGORA, 20),
    slots: [{ conjunto: 'C05', kind: 'verify', branch: 'b', minutos: 30 }],
    conjuntos: [{ unidade: 'C04', at: 1, minutos: 30 }],
    specs: [{ unidade: 'C04-S01', at: 2, minutos: 31 }],
  }, AGORA)
  expect(lista.map(a => a.texto)).toEqual(['lock órfão em C03-S01', 'C05 segura o slot verify há 30 min', 'C04 calada há 30 min', 'C04-S01 calada há 31 min'])
  expect(lista.map(a => a.chave)).toEqual([`lock:C03-S01:migration:20261023_auditoria:${iso(AGORA - 21 * MIN)}`, 'slot:C05:verify:b', 'calado:C04:1', 'calado:C04-S01:2'])
})

test('one toast per key over three looks; release then relock toasts again (A8)', () => {
  const desde = iso(AGORA - 21 * MIN)
  const toasts: string[] = []
  let vistos: string[] = []
  for (const m of [0, 1, 2]) {
    const l = { ...lock(0), desde }
    const r = novosToasts(montarAlertas({ orfaos: orfaos([l], AGORA + m * MIN, 20), slots: [], conjuntos: [], specs: [] }, AGORA), vistos)
    toasts.push(...r.toasts)
    vistos = r.vistos
  }
  expect(toasts).toEqual(['Maestro: C03-S01 segura 20261023_auditoria há 21 min sem RELEASE'])
  vistos = novosToasts([], vistos).vistos
  expect(vistos).toEqual([])
  const r = novosToasts(montarAlertas({ orfaos: orfaos([lock(22)], AGORA, 20), slots: [], conjuntos: [], specs: [] }, AGORA), vistos)
  expect(r.toasts.length).toBe(1)
})

test('cortar keeps 50 of 80 and says mais 30 (A32)', () => {
  const r = cortar([...Array(80).keys()], 50)
  expect([r.linhas.length, r.mais]).toEqual([50, 30])
})

test('fewer than 5 samples: no proposal, defaults and medindo (A13)', () => {
  expect(proposta([{ checkpointMin: 9, lockMin: 12, amostras: 3 }], 'x')).toBe(null)
  expect(textoLimiares({ calado: 15, lockOrfao: 20 }, { checkpointMin: 9, lockMin: 12, amostras: 3 })).toBe('limiares: calada 15 min · órfão 20 min · medindo o seu ritmo')
})

test('medians 9 and 12 over 6 samples propose 18 and 24; 1 and 2 give the floor 5 (A14)', () => {
  expect(proposta([{ checkpointMin: 9, lockMin: 12, amostras: 6 }], 'x')).toEqual({ calado: 18, lockOrfao: 24, amostras: 6, at: 'x' })
  expect(proposta([{ checkpointMin: 9, lockMin: 12, amostras: 3 }, { checkpointMin: 9, lockMin: 12, amostras: 3 }], 'x')).toEqual({ calado: 18, lockOrfao: 24, amostras: 6, at: 'x' })
  expect(proposta([{ checkpointMin: 1, lockMin: 2, amostras: 6 }], 'x')).toEqual({ calado: 5, lockOrfao: 5, amostras: 6, at: 'x' })
  expect(textoLimiares({ calado: 15, lockOrfao: 20 }, { checkpointMin: 9, lockMin: 12, amostras: 6 })).toBe('limiares: calada 15 min (seu normal 9) · órfão 20 min (seu normal 12)')
})

test('rhythm: median checkpoint gap and LOCK to RELEASE minutes', () => {
  const r = ritmo([
    { slug: 'a', eventos: [ev('READY', 'a', 0), ev('LOCK', 'migration x', 10 * MIN), ev('RELEASE', 'migration x', 20 * MIN)] },
    { slug: 'b', eventos: [ev('READY', 'b', 0), ev('TASK', '1/2', 8 * MIN)] },
  ])
  expect(r).toEqual({ checkpointMin: 10, lockMin: 10, amostras: 3 })
})

test('espelho summary: holder, since, last checkpoint, waiting spec, stampless first seen (A19)', () => {
  let ex = anotar(VAZIA, 'c03-s01', ev('READY', 'c03-s01 branch=feat/c03-s01-x-20261023', AGORA - 30 * MIN))
  ex = anotar(ex, 'c03-s01', ev('TASK', '2/7', AGORA - 5 * MIN))
  ex = anotar(ex, 'c03-s02', ev('LOCK', 'migration 20261023_auditoria', AGORA - 2 * MIN))
  const linhas = [
    { slug: 'c03-s01', kind: 'migration', resource: '20261023_auditoria', estado: 'UNGRANTED', desde: '2026-10-23T12:00:00Z' },
    { slug: 'c03-s02', kind: 'migration', resource: '20261023_auditoria', estado: 'UNGRANTED', desde: '2026-10-23T12:28:00Z' },
    { slug: 'c03-s01', kind: 'deploy', resource: 'fnA', estado: 'UNGRANTED', desde: null },
  ]
  const r = resumoEspelho(ex, linhas, { 'c03-s01 deploy fnA': 'T0' })
  expect(r.locks['migration 20261023_auditoria']).toEqual({ spec: 'C03-S01', desde: '2026-10-23T12:00:00Z', estado: 'UNGRANTED', espera: ['C03-S02'] })
  expect(r.locks['deploy fnA']!.desde).toBe('T0')
  expect(r.specs['C03-S01']).toEqual({ ultimo: 'TASK', texto: 'TASK 2/7', at: iso(AGORA - 5 * MIN) })
  expect(locksDoEspelho(r).map(l => [l.kind, l.resource])).toEqual([['migration', '20261023_auditoria'], ['deploy', 'fnA']])
})

const tx = (linha: string) => {
  const i = linha.indexOf(' ')
  return textoCheckpoint(ev(i < 0 ? linha : linha.slice(0, i), i < 0 ? '' : linha.slice(i + 1), 0))
}

test('only protocol fields reach texto (R23)', () => {
  expect(tx('TASK 3/7 stdout=segredo')).toBe('TASK 3/7')
  expect(tx('TASK 3/7 stdout: segredo')).toBe('TASK 3/7')
  expect(tx('TASK B 2/5 rodei npm test e deu 3 falhas')).toBe('TASK B 2/5')
  expect(tx('LOCK file src/a.ts sk-live-123')).toBe('LOCK file 2 recurso(s)')
  expect(tx('LOCK migration 20261023_auditoria')).toBe('LOCK migration 1 recurso(s)')
  expect(tx('READY c03-s01 branch=feat/c03-s01-x-20261023 worktree=C:/w sid=abc')).toBe('READY c03-s01 branch=feat/c03-s01-x-20261023')
  expect(tx('PLAN docs/x.md TASKS 11')).toBe('PLAN TASKS 11')
  expect(tx('BLOCKED gh auth falhou Error: bad credentials')).toBe('BLOCKED')
  expect(tx('CODEX STALL ROUND 4 the repeating objection')).toBe('CODEX STALL ROUND 4')
})

test('credential line stored as keyword; A23 TASK prose gives TASK 2/7 by ruling', () => {
  expect(tx('TASK 3/7 token ghp_abc123XYZ exposto')).toBe('TASK')
  for (const c of ['github_pat_11AB', 'sbp_abc', 'eyJhbGci']) expect(tx(`TASK 3/7 ${c}`)).toBe('TASK')
  expect(tx(`TASK 2/7 ${'palavra '.repeat(40)}`.slice(0, 300))).toBe('TASK 2/7')
})

test('cortarTexto keeps prose for C02-S02 but cuts credentials and length', () => {
  expect(cortarTexto('PARKED hooks/x.ts:10 medido 3 vezes')).toBe('PARKED hooks/x.ts:10 medido 3 vezes')
  expect(cortarTexto('NOTE CUT token ghp_x')).toBe('NOTE')
  expect(cortarTexto('x'.repeat(300)).length).toBe(120)
})

// ---- ready to close (A18)

const PL: Plano = {
  conjuntos: [{ id: 'C07', titulo: 'base', specs: ['C07-S01'] }, { id: 'C08', titulo: 'x', specs: ['C08-S01', 'C08-S02'], dependeDe: ['C07'] }],
  specs: [{ id: 'C07-S01', conjunto: 'C07', slug: 'a' }, { id: 'C08-S01', conjunto: 'C08', slug: 'b' }, { id: 'C08-S02', conjunto: 'C08', slug: 'c' }],
}
const SP: Record<string, SpecDoc> = {
  'C07-S01': { etapa: 'merge' },
  'C08-S01': { etapa: 'branch-publicada', headSha: 'h1', validacao: { resultado: 'aprovado', sha: 'h1' } },
  'C08-S02': { etapa: 'branch-publicada', headSha: 'h2', validacao: { resultado: 'aprovado', sha: 'h2' } },
}
const LIVRE: Slots = { verify: { dono: null, fila: [] }, producao: { dono: null, fila: [] } }
const esp = (locks: Record<string, any>, at = iso(AGORA - MIN)): ConjuntoDoc => ({ espelho: { locks, specs: {}, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at } })

test('ready to close needs a fresh espelho with no lock and no slot (A18)', () => {
  expect(prontosSemLock(PL, SP, { C08: esp({}) }, LIVRE, AGORA)).toEqual([{ conjunto: 'C08', n: 2 }])
  expect(prontosSemLock(PL, SP, { C08: esp({ 'migration x': { spec: 'C08-S01', desde: 'x', estado: 'UNGRANTED' } }) }, LIVRE, AGORA)).toEqual([])
  const preso: Slots = { ...LIVRE, verify: { dono: { conjunto: 'C08', branch: 'b', desde: 'x' }, fila: [] } }
  expect(prontosSemLock(PL, SP, { C08: esp({}) }, preso, AGORA)).toEqual([])
  expect(prontosSemLock(PL, SP, { C08: {} }, LIVRE, AGORA)).toEqual([])
  expect(prontosSemLock(PL, SP, { C08: esp({}, iso(AGORA - 16 * MIN)) }, LIVRE, AGORA)).toEqual([])
})

test('a credential as the first token never reaches the mirror (finding 5, R23)', () => {
  expect(cortarTexto('ghp_abc123 vazou')).toBe('[removido]')
  expect(cortarTexto('github_pat_11AB x')).toBe('[removido]')
  expect(cortarTexto('token=ghp_abc')).toBe('[removido]')
  expect(cortarTexto('eyJhbGciOi.x.y')).toBe('[removido]')
  expect(cortarTexto('NOTE CUT token ghp_x')).toBe('NOTE')
  expect(cortarTexto('PRE-FECHAMENTO sbp_x')).toBe('PRE-FECHAMENTO')
})
