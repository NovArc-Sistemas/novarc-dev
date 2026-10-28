import { expect, test } from 'claude-code/testing'

import type { Execucao, Registro } from '../../types'
import {
  VAZIA, alerta, alertaRaias, anotar, cartoesAgora, chamadaLedger, checkpoint, ehBuild, faixaConjuntoRaias, laneDaMensagem, lerLedger, linhaConjunto,
  espelhoParaGravar, novasLinhas, papelDaBranch, papelDoPrompt, papelDoSkill, progresso, raia, raiasPorConjunto, resumoEspelho, ritmo, slugDoSpawn, vivo,
} from './execucao'
import { ETAPA_FAIXA, idDaBranch, projetoDoPlano, quadrados } from './logic'

const T0 = Date.parse('2026-10-15T12:00:00Z')

test('checkpoint reads the leading keyword of a fork message and ignores prose', () => {
  expect(checkpoint('LOCK migration 20261015_perms.sql')).toEqual({ tipo: 'LOCK', resto: 'migration 20261015_perms.sql' })
  expect(checkpoint('TASK 2/4\nmore prose')?.tipo).toBe('TASK')
  expect(checkpoint('Done with the plan, LOCK next')).toBe(null)
  expect(checkpoint('HELLO world')).toBe(null)
})

test('ledger lines keep their timestamp and skip headers and prose', () => {
  const evs = lerLedger('# session-build - run x\nREADY c02-s01  # 2026-10-15T12:00:00Z\n  prose line\nTASK 2/4  # 2026-10-15T12:10:00Z\n')
  expect(evs.map(e => e.tipo)).toEqual(['READY', 'TASK'])
  expect(evs[1].at).toBe(T0 + 10 * 60_000)
})

test('a ledger.py call yields its absolute dir, fork and type, quoted or not', () => {
  expect(chamadaLedger('python scripts/ledger.py append --dir "C:\\repo\\ai\\ledger" --fork c02-s01 --type pushed --text "branch x"')).toEqual({
    dir: 'C:\\repo\\ai\\ledger',
    fork: 'c02-s01',
    temFork: true,
    tipo: 'PUSHED',
    texto: 'branch x',
    script: null,
  })
  expect(chamadaLedger('python C:/x/skills/novarc-session-build/core/scripts/ledger.py append --dir C:/l --type LOCK --text "m a"')?.script).toBe('C:/x/skills/novarc-session-build/core/scripts/ledger.py')
  expect(chamadaLedger('python ledger.py sweep --dir /abs/ledger')?.fork).toBe(null)
  expect(chamadaLedger('git push origin x')).toBe(null)
})

test('spawn description and skill name recognise a run', () => {
  expect(slugDoSpawn('spec inbound-close-time-clock')).toBe('inbound-close-time-clock')
  expect(slugDoSpawn('Explore the repo')).toBe(null)
  expect(ehBuild('novarc:novarc-session-build')).toBe(true)
  expect(ehBuild('session-build')).toBe(true)
  expect(ehBuild('novarc:novarc-session-plan')).toBe(false)
})

test('a lane advances to the furthest checkpoint, marks an open lock and counts quiet minutes', () => {
  let ex = VAZIA
  ex = anotar(ex, 's1', { tipo: 'READY', texto: 's1', at: T0 })
  ex = anotar(ex, 's1', { tipo: 'PLAN', texto: 'p TASKS 3', at: T0 + 60_000 })
  ex = anotar(ex, 's1', { tipo: 'TASK', texto: '2/3', at: T0 + 120_000 })
  ex = anotar(ex, 's1', { tipo: 'LOCK', texto: 'migration a.sql', at: T0 + 180_000 })
  ex = anotar(ex, 's1', { tipo: 'LOCK', texto: 'migration a.sql', at: T0 + 200_000 }) // same line via message and ledger
  const r = raia(ex.forks.s1, T0 + 23 * 60_000)
  expect(ex.forks.s1.eventos.length).toBe(4)
  expect(r.celulas).toEqual(['feito', 'feito', 'feito', 'feito', 'feito', 'travado', 'vazio', 'vazio'])
  expect(r.rotulos[4]).toBe('2/3')
  expect(r.minutos).toBe(20)
  expect(alerta(ex, T0 + 23 * 60_000)).toBe('s1 segura lock')
})

test('release closes the lock; done forks count toward progress and never alert as quiet', () => {
  let ex = VAZIA
  ex = anotar(ex, 'a', { tipo: 'LOCK', texto: 'file x', at: T0 })
  ex = anotar(ex, 'a', { tipo: 'RELEASE', texto: 'file x', at: T0 + 1000 })
  ex = anotar(ex, 'a', { tipo: 'DONE', texto: '', at: T0 + 2000 })
  ex = anotar(ex, 'b', { tipo: 'TASK', texto: '1/2', at: T0 })
  expect(raia(ex.forks.a, T0).lockAberto).toBe(false)
  expect(progresso(ex)).toEqual({ feitos: 1, total: 2 })
  expect(alerta(ex, T0 + 40 * 60_000)).toBe('b calado há 40 min')
})

test('parses the brief line session name into project code, set and spec', () => {
  expect(papelDoPrompt('x\nsession name:         novarc-NOVARC-PLUGIN-MAESTRO-C01-S01\n')).toEqual({ papel: 'spec', codigo: 'NOVARC-PLUGIN-MAESTRO', conjunto: 'C01', spec: 'C01-S01' })
  expect(papelDoPrompt('/novarc-session-build conjunto https://claude.ai/artifact/QcHs5NqkFdUzz3mNFcmVEw C01')).toMatchObject({ papel: 'conjunto', conjunto: 'C01' })
  expect(papelDoPrompt('/novarc:novarc-session-build orquestrar https://claude.ai/artifact/QcHs5NqkFdUzz3mNFcmVEw')).toMatchObject({ papel: 'orquestrador', url: 'https://claude.ai/artifact/QcHs5NqkFdUzz3mNFcmVEw' })
})

test('rejects names that are not a NOVARC spec run', () => {
  expect(papelDoPrompt('session name: novarc-orq-NOVARC-PLUGIN-MAESTRO')).toBe(null)
  expect(papelDoPrompt('session name: novarc-NOVARC-PLUGIN-MAESTRO-C01')).toBe(null)
  expect(papelDoPrompt('c01-s01-olhos-sessao-por')).toBe(null)
})

test('a spec branch gives the spec role without a plan', () => {
  expect(papelDaBranch('feat/c01-s01-olhos-sessao-por-spec-20261017')).toEqual({ papel: 'spec', conjunto: 'C01', spec: 'C01-S01' })
  expect(papelDaBranch('main')).toBe(null)
  expect(papelDaBranch(null)).toBe(null)
  expect(idDaBranch('feature/c01-s02-sop-cobertura-20261012')).toBe('C01-S02')
})

test('skill args give the role', () => {
  expect(papelDoSkill('conjunto https://claude.ai/artifact/abc C02')).toEqual({ papel: 'conjunto', conjunto: 'C02', url: 'https://claude.ai/artifact/abc' })
  expect(papelDoSkill('orquestrar https://claude.ai/artifact/abc')).toEqual({ papel: 'orquestrador', url: 'https://claude.ai/artifact/abc' })
  expect(papelDoSkill('')).toEqual({ papel: 'conjunto' })
})

test('linhaConjunto reads CONJUNTO C01 implementacao and ignores prose', () => {
  expect(linhaConjunto('CONJUNTO C01 implementacao')).toMatchObject({ conjunto: 'C01', etapa: 'implementacao' })
  expect(linhaConjunto('o CONJUNTO C01 está bem')).toBe(null)
})

const reg = (o: Partial<Registro>): Registro => ({ sessao: 's', cwd: 'C:\\dev\\proj', titulo: 't', papel: null, forks: 0, feitos: 0, alerta: null, at: T0, ...o }) as Registro

test('registry liveness: 29 minutes live, 31 not', () => {
  expect(vivo(reg({}), T0 + 29 * 60_000)).toBe(true)
  expect(vivo(reg({}), T0 + 31 * 60_000)).toBe(false)
})

test('a message lane and the ledger slug lane become one lane', () => {
  let ex: Execucao = { ...VAZIA, papel: 'conjunto', conjunto: 'C01' }
  ex = anotar(ex, 'C01-S01', { tipo: 'LOCK', texto: 'db migration', at: T0 })
  ex = anotar(ex, 'olhos-sessao-por-spec', { tipo: 'READY', texto: 'olhos-sessao-por-spec branch=feat/c01-s01-olhos-sessao-por-spec-20261017', at: T0 + 1000 })
  expect(Object.keys(ex.forks)).toEqual(['olhos-sessao-por-spec'])
  expect(ex.forks['olhos-sessao-por-spec'].spec).toBe('C01-S01')
  expect(ex.forks['olhos-sessao-por-spec'].eventos.map(e => e.tipo)).toEqual(['LOCK', 'READY'])
  expect(laneDaMensagem(ex, 'LOCK db C01-S01 again')).toBe('olhos-sessao-por-spec')
})

test('laneDaMensagem ignores a spec of another set', () => {
  const ex: Execucao = { ...VAZIA, conjunto: 'C01' }
  expect(laneDaMensagem(ex, 'LOCK db C02-S01 migration')).toBe(null)
  expect(laneDaMensagem(ex, 'LOCK db C01-S01 migration')).toBe('C01-S01')
  expect(laneDaMensagem(VAZIA, 'LOCK db C01-S01 migration')).toBe(null)
})

test('novasLinhas keeps a partial last line for the next read', () => {
  const a = 'READY a  # 2026-10-15T12:00:00Z\nPLAN p'
  const r1 = novasLinhas(a, 0)
  expect(r1.eventos.length).toBe(1)
  expect(r1.consumido).toBe(a.indexOf('\n') + 1)
  const b = 'READY a  # 2026-10-15T12:00:00Z\nPLAN p.md TASKS 3  # 2026-10-15T12:05:00Z\n'
  const r2 = novasLinhas(b, r1.consumido)
  expect(r2.eventos.map(e => e.tipo)).toEqual(['PLAN'])
  expect(r2.consumido).toBe(b.length)
  expect(novasLinhas(a, 9999).eventos.length).toBe(1) // file shrank: reparse from 0
})

test('alertaRaias finds a lock in any set lane; faixaConjuntoRaias counts DONE lanes', () => {
  let ex = anotar(VAZIA, 'a', { tipo: 'DONE', texto: '', at: T0 })
  ex = anotar(ex, 'b', { tipo: 'LOCK', texto: 'db', at: T0 })
  ex = { ...ex, forks: { ...ex.forks, b: { ...ex.forks.b, spec: 'C01-S02' } } }
  const rs = Object.values(ex.forks).map(f => raia(f, T0))
  expect(alertaRaias(rs)).toBe('C01-S02 segura lock')
  expect(alerta(ex, T0)).toBe('C01-S02 segura lock')
  expect(faixaConjuntoRaias('C01', ETAPA_FAIXA.implementando, rs)).toBe('C01 · Em implementação · 1/2 specs')
  expect(faixaConjuntoRaias('C01', null, rs)).toBe('C01 · Em implementação · 1/2 specs')
})

test('projetoDoPlano joins cliente and nomeCurto', () => {
  expect(projetoDoPlano({ projeto: { cliente: 'NovArc', nomeCurto: 'Maestro v2', codigo: 'NOVARC-PLUGIN-MAESTRO' } })).toEqual({ codigo: 'NOVARC-PLUGIN-MAESTRO', projeto: 'NovArc · Maestro v2' })
  expect(projetoDoPlano({})).toEqual({ codigo: null, projeto: null })
})

test('a set lane hangs its spec rows by the READY branch, other sets excluded', () => {
  let ex = anotar(VAZIA, 'a', { tipo: 'READY', texto: 'a branch=feat/c01-s01-x-20261017', at: T0 })
  ex = anotar(ex, 'b', { tipo: 'READY', texto: 'b branch=feat/c02-s01-y-20261017', at: T0 })
  const r = raiasPorConjunto([reg({ papel: 'conjunto', conjunto: 'C01', ledgerDir: 'D' })], { D: ex }, T0, { C01: 'Olhos do Maestro' })
  expect(r.length).toBe(1)
  expect(r[0]).toMatchObject({ conjunto: 'C01', titulo: 'Olhos do Maestro' })
  expect(r[0].raias.map(x => x.rotulo)).toEqual(['C01-S01'])
})

test('Agora groups live entries into one card per run, button only on mine', () => {
  const k = { codigo: 'NOVARC-PLUGIN-MAESTRO', projeto: 'NovArc · Maestro v2', artefato: 'U' }
  const regs = [
    reg({ sessao: 'o', papel: 'orquestrador', ...k, at: T0 + 5 }),
    reg({ sessao: 'c1', papel: 'conjunto', conjunto: 'C01', ...k }),
    reg({ sessao: 'c2', papel: 'conjunto', conjunto: 'C02', ...k }),
    reg({ sessao: 's1', papel: 'spec', codigo: k.codigo }),
    reg({ sessao: 's2', papel: 'spec', codigo: k.codigo }),
    reg({ sessao: 's3', papel: 'spec', codigo: k.codigo }),
    reg({ sessao: 'x', papel: 'conjunto', conjunto: 'C04', ledgerDir: 'X', at: T0 + 1 }),
    reg({ sessao: 'old', papel: 'conjunto', cwd: '/old/fase1', at: T0 + 2 }),
  ]
  const cs = cartoesAgora(regs, 'o')
  expect(cs.length).toBe(3)
  expect(cs.find(c => c.meu)).toMatchObject({ titulo: 'NovArc · Maestro v2', linha: 'orquestradora + 2 conjuntos + 3 specs', papel: 'esta sessão' })
  expect(cs.find(c => c.linha === 'conjunto C04 · sem planejamento')?.meu).toBe(false)
  expect(cs.find(c => c.titulo === 'fase1')).toBeTruthy()
})

test('a set entry with codigo and a spec entry with only the shared ledgerDir form one card', () => {
  const cs = cartoesAgora([
    reg({ sessao: 'c', papel: 'conjunto', conjunto: 'C01', codigo: 'P', ledgerDir: 'D', artefato: 'U' }),
    reg({ sessao: 's', papel: 'spec', ledgerDir: 'D' }),
  ], 'zz')
  expect(cs.length).toBe(1)
  expect(cs[0].linha).toBe('conjunto C01 · 1 specs')
  expect(cs[0].papel).toBe('conjunto')
})

test('review fixes: bare orquestrar, anchored prompts, spec-only cards, BLOCKED squares', () => {
  expect(papelDoSkill('orquestrar')).toEqual({ papel: 'orquestrador' })
  expect(papelDoPrompt('veja o comando /novarc-session-build conjunto https://claude.ai/artifact/abc C01 acima')).toBe(null)
  expect(papelDoPrompt('use /novarc-session-build orquestrar https://claude.ai/artifact/abc')).toBe(null)
  expect(papelDoPrompt('oi\n  /novarc:novarc-session-build conjunto https://claude.ai/artifact/abc C03')).toMatchObject({ papel: 'conjunto', conjunto: 'C03' })
  const cs = cartoesAgora([reg({ sessao: 's', papel: 'spec', conjunto: 'C01', codigo: 'P' }), reg({ sessao: 't', papel: 'spec', conjunto: 'C01', codigo: 'P' })], 'zz')
  expect(cs[0].linha).toBe('2 specs')
  let ex = anotar(VAZIA, 'b', { tipo: 'BLOCKED', texto: 'x', at: T0 })
  ex = anotar(ex, 'w', { tipo: 'WAITING', texto: 'x', at: T0 })
  expect(quadrados(Object.values(ex.forks).map(f => raia(f, T0)))).toEqual(['error', 'claude'])
})

test('pendencias: laneDaMensagem matches a lowercase set id; orquestrar is case-insensitive; alertaRaias takes calado second', () => {
  expect(laneDaMensagem({ ...VAZIA, conjunto: 'c01' }, 'LOCK db C01-S01 migration')).toBe('C01-S01')
  expect(papelDoPrompt('/NOVARC-SESSION-BUILD ORQUESTRAR https://claude.ai/artifact/abc')).toMatchObject({ papel: 'orquestrador', url: 'https://claude.ai/artifact/abc' })
  const quieta = raia({ slug: 'a', eventos: [{ tipo: 'TASK', texto: '1/3', at: T0 - 16 * 60_000 }] }, T0)
  expect(alertaRaias([quieta])).toBe('a calado há 16 min')
  expect(alertaRaias([quieta], 20)).toBe(null)
})

test('review: laneDaMensagem finds a fork by a lowercase stored spec id', () => {
  const ex: Execucao = { ...VAZIA, conjunto: 'C01', forks: { olhos: { slug: 'olhos', spec: 'c01-s01', eventos: [] } } }
  expect(laneDaMensagem(ex, 'LOCK db C01-S01 migration')).toBe('olhos')
})

// ---- C02-S02: NOTE lines and the items on the way

test('NOTE lines fold as events and move no lane', () => {
  const evs = lerLedger('TASK 2/5  # 2026-10-15T12:00:00Z\nNOTE PRE-FECHAMENTO C06-S02 C06-S02:3 x  # 2026-10-15T12:10:00Z\nNOTE CUT y  # 2026-10-15T12:20:00Z\n')
  expect(evs.map(e => e.tipo)).toEqual(['TASK', 'NOTE', 'NOTE'])
  expect(evs[2]!.texto).toBe('CUT y')
  const r = raia({ slug: 'c06-s02', eventos: evs }, T0 + 30 * 60_000)
  expect(r.ultimo).toBe('TASK')
  expect(r.minutos).toBe(30)
  expect(r.rotulos[4]).toBe('2/5')
  // a NOTE after DONE never makes a finished spec quiet
  const feito = lerLedger('DONE c06-s02  # 2026-10-15T12:00:00Z\nNOTE x  # 2026-10-15T12:30:00Z\n')
  expect(alertaRaias([raia({ slug: 'c06-s02', eventos: feito }, T0 + 60 * 60_000)])).toBe(null)
  expect(checkpoint('NOTE algo')).toBe(null)
  expect(ritmo([{ slug: 'a', eventos: evs }]).amostras).toBe(0)
})

test('espelho carries aCaminho with stable refs and keeps specs.ultimo off NOTE', () => {
  const evs = lerLedger('TASK 1/3  # 2026-10-30T09:00:00Z\nPARKED fila ignora o deploy de EF; medido em 2 runs  # 2026-10-30T10:00:00Z\nNOTE CUT ordem por prioridade  # 2026-10-30T10:05:00Z\nPARKED token sbp_123abc  # 2026-10-30T10:06:00Z\n')
  const ex: Execucao = { ...VAZIA, papel: 'conjunto', conjunto: 'C06', forks: { 'c06-s02': { slug: 'c06-s02', spec: 'C06-S02', eventos: evs } } }
  const e = resumoEspelho(ex, [], {})
  expect(e.aCaminho!.map(i => [i.spec, i.tipo, i.ref])).toEqual([['C06-S02', 'PARKED', 'C06-S02:3'], ['C06-S02', 'CUT', 'C06-S02:2'], ['C06-S02', 'PARKED', 'C06-S02:1']])
  expect(e.aCaminho![0]!.texto).toBe('PARKED')
  expect(e.aCaminho![2]!.texto).toBe('fila ignora o deploy de EF; medido em 2 runs')
  expect(e.specs['C06-S02']!.ultimo).toBe('PARKED')
})

test('shell variables in --dir and --fork are not taken as a path or a lane (F2)', () => {
  expect(chamadaLedger('python ledger.py append --dir "$D" --fork "$F" --type LOCK --text "migration a"')).toEqual({
    dir: null, fork: null, temFork: true, tipo: 'LOCK', texto: 'migration a', script: null,
  })
  expect(chamadaLedger('python ledger.py append --dir $D --type NOTE --text x')?.dir).toBe(null)
  expect(chamadaLedger('python ledger.py append --dir "${D}" --type NOTE --text x')?.dir).toBe(null)
  expect(chamadaLedger('python ledger.py append --dir C:/x --fork c03-s01 --type TASK --text "1/2"')).toEqual({
    dir: 'C:/x', fork: 'c03-s01', temFork: true, tipo: 'TASK', texto: '1/2', script: null,
  })
  expect(chamadaLedger('python ledger.py sweep --dir /abs/ledger')?.temFork).toBe(false)
})

const L6 = (args: string) => chamadaLedger(`python ledger.py append ${args}`)

test('finding 6: a --fork inside --text, after a comment or after another command is not read', () => {
  const r1 = L6('--dir C:/x --type NOTE --text "rework 2 ($ in --dir/--fork becomes data / phantom lane) done"')
  expect([r1?.fork, r1?.temFork, r1?.dir, r1?.tipo]).toEqual([null, false, 'C:/x', 'NOTE'])
  expect(L6('--dir C:/x --type NOTE --text "a --fork are b"')?.fork).toBe(null)
  expect(L6('--dir C:/x --type NOTE --text x # --fork becomes')?.fork).toBe(null)
  expect(L6('--dir C:/x --type TASK --text "1/2" ; echo --fork z')?.fork).toBe(null)
  const r5 = L6('--dir C:/x --type NOTE --text x\\ --fork\\ becomes') // real backslashes reach the parser
  expect([r5?.fork, r5?.texto]).toEqual([null, 'x --fork becomes'])
})

test('finding 6: a --dir inside --text placed first is not the dir', () => {
  expect(chamadaLedger('python ledger.py append --text "x --dir /tmp/y" --dir C:/real --type NOTE')?.dir).toBe('C:/real')
})

test('finding 6: a slug with quotes or punctuation left is not a lane', () => {
  expect(L6('--dir C:/x --fork dash-v2-10"; echo segura lock')).toBe(null)
  expect(L6("--dir C:/x --fork 'dash-v2-10;' --type LOCK --text a")?.fork).toBe(null)
  expect(L6('--dir C:/x --fork \\"$F\\" --type NOTE --text a')?.fork).toBe(null)
})

test('finding 6: a NOTE text naming branch= gives its lane no spec; a READY does', () => {
  const nota = anotar(VAZIA, 'x', { tipo: 'NOTE', texto: 'MARCO branch=feat/c02-s01-y-20261021', at: 1 })
  expect(nota.forks.x!.spec).toBe(undefined)
  const pronto = anotar(VAZIA, 'x', { tipo: 'READY', texto: 'x branch=feat/c02-s01-y-20261021', at: 1 })
  expect(pronto.forks.x!.spec).toBe('C02-S01')
})

test('finding 6 guards: real flags in every quoting form keep working', () => {
  expect(L6('--dir C:/x --fork=c03-s01 --type TASK --text 1/2')?.fork).toBe('c03-s01')
  expect(L6('--dir C:/x --fork "c03-s01" --type TASK --text 1/2')?.fork).toBe('c03-s01')
  expect(L6("--dir='C:/x y' --type TASK --text 1/2")?.dir).toBe('C:/x y')
  const r = L6('--dir C:/x --fork $F --type NOTE --text y')
  expect([r?.fork, r?.temFork, r?.tipo]).toEqual([null, true, 'NOTE'])
  expect(chamadaLedger('echo ledger.py && python ledger.py append --dir C:/x --type TASK --text 1/2')?.dir).toBe('C:/x')
  const t = L6('--dir C:/x --fork c03-s01 --type NOTE --text "custa $5"')
  expect([t?.fork, t?.texto]).toEqual(['c03-s01', 'custa $5'])
})

test('raia().inicios gives the first at per step and null for unseen steps (C11-S01)', () => {
  let ex = VAZIA
  ex = anotar(ex, 's1', { tipo: 'READY', texto: 's1', at: T0 })
  ex = anotar(ex, 's1', { tipo: 'TASK', texto: '1/3', at: T0 + 120_000 })
  ex = anotar(ex, 's1', { tipo: 'TASK', texto: '2/3', at: T0 + 180_000 })
  expect(raia(ex.forks.s1, T0 + 240_000).inicios).toEqual([T0, null, null, null, T0 + 120_000, null, null, null])
})

test('espelhoParaGravar deletes the lock and spec keys the new espelho lacks, keeps the rest (C11-S01 rework)', () => {
  const novo = { locks: { 'verify b': { spec: 'S2' } }, specs: { S1: { ultimo: 'TASK' } }, aCaminho: [] as unknown[] }
  const g = espelhoParaGravar(novo, { locks: { 'verify a': {}, 'verify b': {} }, specs: { S1: {}, S9: {} } })
  expect(g.locks).toEqual({ 'verify a': { __delete__: true }, 'verify b': { spec: 'S2' } })
  expect(g.specs).toEqual({ S9: { __delete__: true }, S1: { ultimo: 'TASK' } })
  expect(espelhoParaGravar(novo, null)).toEqual(novo)
  // a kept lock whose queue emptied: its espera is deleted, not left in the document
  const h = espelhoParaGravar({ locks: { 'verify b': { spec: 'S2', desde: 'x' } }, specs: {} }, { locks: { 'verify b': { spec: 'S2', desde: 'x', espera: ['S3'] } }, specs: {} })
  expect(h.locks).toEqual({ 'verify b': { espera: { __delete__: true }, spec: 'S2', desde: 'x' } })
})

// ---- C05-S01: empty sessions, NOTE SESSAO/BASE/CARTAO, the GO brief, D17 names, the set RUN_ID

import {
  MAPA_VAZIO, checkoutPrincipal, conjuntosDaAba, entradaMapa, limpaAguardo, mapaDasNotas, noMapa, notasOrq, regraDaDiretiva, resumoGo, rotaDaDiretiva,
  runIdDoDir,
} from './execucao'

const URL_X = 'https://claude.ai/artifact/X'
const SET_MIN = `Você é a sessão do conjunto C02 da execução NOVARC-PLUGIN-MAESTRO (${URL_X}).\nsession name: novarc-NOVARC-PLUGIN-MAESTRO-C02\nAguarde o GO do orquestrador. Não leia specs nem crie branch antes dele.`
const SPEC_MIN = `Você é a sessão da spec S01 do conjunto C02 da execução NOVARC-PLUGIN-MAESTRO (${URL_X}).\nsession name: novarc-NOVARC-PLUGIN-MAESTRO-C02-S01\nAguarde o GO da sessão do conjunto C02. Não leia specs nem crie branch antes dele.`
const U1 = 'local_11111111-1111-4111-8111-111111111111'
const U2 = 'local_22222222-2222-4222-8222-222222222222'

test('papelDoPrompt recognises both minimal briefs and flags them aguardandoGo (C05-S01 A29)', () => {
  expect(papelDoPrompt(SET_MIN)).toEqual({ papel: 'conjunto', codigo: 'NOVARC-PLUGIN-MAESTRO', conjunto: 'C02', url: URL_X, aguardandoGo: true })
  expect(papelDoPrompt(SPEC_MIN)).toEqual({ papel: 'spec', codigo: 'NOVARC-PLUGIN-MAESTRO', conjunto: 'C02', spec: 'C02-S01', aguardandoGo: true })
  // a bare set name line, without the wait line, names no role
  expect(papelDoPrompt('session name: novarc-NOVARC-PLUGIN-MAESTRO-C02\noutra coisa')).toBe(null)
  // the full implementer payload keeps today's reading: no flag, even with GO PLAN in its body
  const cheio = 'spec slug: x\nsession name: novarc-NOVARC-PLUGIN-MAESTRO-C01-S01\nstarting state: GO PLAN'
  expect(papelDoPrompt(cheio)).toEqual({ papel: 'spec', codigo: 'NOVARC-PLUGIN-MAESTRO', conjunto: 'C01', spec: 'C01-S01' })
})

test('limpaAguardo is true only for a GO inicio or GO PLAN first line (C05-S01 R31)', () => {
  expect(limpaAguardo('GO C02 inicio 9f8e7d6\nspecs: x')).toBe(true)
  expect(limpaAguardo('GO PLAN\npayload')).toBe(true)
  expect(limpaAguardo('GO c02-s01 verify feat/x')).toBe(false)
  expect(limpaAguardo('prose GO PLAN')).toBe(false)
})

const NOTAS = lerLedger([
  `NOTE SESSAO C02-S01 c02-s01-alertas-locks-es ${U1} vazia  # 2026-10-28T10:00:00Z`,
  `NOTE SESSAO C02 c02-novarc-plugin-maestr ${U2} vazia  # 2026-10-28T10:00:01Z`,
  'NOTE BASE aaaa111  # 2026-10-28T10:00:02Z',
  'NOTE BASE bbbb222  # 2026-10-28T10:00:03Z',
  'NOTE CARTAO C11 sem-fechamento  # 2026-10-28T14:05:00Z',
  'NOTE CARTAO C12-S01 com-fechamento  # 2026-10-28T14:06:00Z',
  'NOTE CUT x  # 2026-10-28T14:07:00Z',
  'NOTE SESSAO bogus  # 2026-10-28T14:08:00Z',
  'GO C02 inicio 9f8e7d6  # 2026-10-28T15:10:00Z',
  'GO C03 verify feat/x  # 2026-10-28T15:11:00Z',
].join('\n') + '\n')

test('notasOrq reads SESSAO, the first BASE, CARTAO and GO inicio; other NOTEs add nothing (C05-S01 A6, A7)', () => {
  const n = notasOrq(NOTAS)
  expect(n.sessoes.map(s => [s.id, s.conjunto, s.spec, s.nome, s.sessao, s.vazia])).toEqual([
    ['C02-S01', 'C02', 'C02-S01', 'c02-s01-alertas-locks-es', U1, true],
    ['C02', 'C02', null, 'c02-novarc-plugin-maestr', U2, true],
  ])
  expect(n.base).toBe('aaaa111')
  expect(n.cartoes.map(c => [c.id, c.conjunto, c.fechamento])).toEqual([['C11', 'C11', false], ['C12-S01', 'C12', true]])
  expect(Object.keys(n.gos)).toEqual(['C02'])
  expect(n.gos.C02!.sha).toBe('9f8e7d6')
  // a later SESSAO for the same id replaces the earlier one
  const d = notasOrq(lerLedger(`NOTE SESSAO C02 a ${U1} vazia  # 2026-10-28T10:00:00Z\nNOTE SESSAO C02 b ${U2} brief  # 2026-10-28T10:01:00Z\n`))
  expect(d.sessoes.map(s => [s.nome, s.vazia])).toEqual([['b', false]])
  expect(notasOrq([])).toEqual({ sessoes: [], base: null, cartoes: [], gos: {}, cancelados: {} })
  // validation fix 3: a set removed from the plan after its session opened
  const c = notasOrq(lerLedger('NOTE CANCELADO C04 removido do plano  # 2026-10-28T10:00:00Z\nNOTE CANCELADO bogus x  # 2026-10-28T10:00:01Z\n'))
  expect(c.cancelados).toEqual({ C04: { motivo: 'removido do plano', at: Date.parse('2026-10-28T10:00:00Z') } })
})

test('resumoGo reads specs-atualizadas, decisoes-novas and the branch lines of a GO body (C05-S01 A23)', () => {
  const g = resumoGo('GO C03 inicio 9f8e7d6\nspecs: 9f8e7d6 (relidos)\nprompt: x\ndecisoes: /d/DECISIONS.md\ndecisoes-novas: d-x título\n  d-y outro\nmudou: C01 PR #31 abc1234\nspecs-atualizadas: C03-S01 ganhou 1 critério\nbranch: git fetch origin && git switch -c feat/c03-s01-a-20261029 --no-track origin/main\nbranch: git fetch origin && git switch -c feat/c03-s02-b-20261029 --no-track origin/main')
  expect(g).toEqual({
    sha: '9f8e7d6',
    atualizadas: ['C03-S01 ganhou 1 critério'],
    decisoesNovas: 2,
    branches: ['git fetch origin && git switch -c feat/c03-s01-a-20261029 --no-track origin/main', 'git fetch origin && git switch -c feat/c03-s02-b-20261029 --no-track origin/main'],
    merges: ['PR #31'],
  })
  expect(resumoGo('GO C03 inicio 1a2b3c4\nspecs-atualizadas: nenhuma\ndecisoes-novas: nenhuma')).toEqual({ sha: '1a2b3c4', atualizadas: [], decisoesNovas: 0, branches: [], merges: [] })
  expect(resumoGo('GO C04 inicio a\nmudou: C01 PR #31 abc1234\n  C02 PR #35 def5678').merges).toEqual(['PR #31', 'PR #35'])
  expect(resumoGo('prosa').sha).toBe(null)
})

test('D17 short names land in the map; a prompt title wins; NOTE SESSAO folds in keeping titles (C05-S01 R9)', () => {
  expect(noMapa(MAPA_VAZIO(), { nome: 'c02-s01-alertas-locks-es', sessao: 'local_a' }).specs['C02-S01']?.sessao).toBe('local_a')
  expect(noMapa(MAPA_VAZIO(), { nome: 'c02-novarc-plugin-maestr', sessao: 'local_b' }).conjuntos.C02?.sessao).toBe('local_b')
  expect(noMapa(MAPA_VAZIO(), { nome: 'novarc-X-C02-S01', sessao: 'local_c' }).specs['C02-S01']?.nome).toBe('novarc-X-C02-S01')
  expect(noMapa(MAPA_VAZIO(), { nome: 'outra-coisa', sessao: 'local_d' }).specs).toEqual({})
  expect(entradaMapa({ name: 'c02-s01-alertas-locks-es', initiation: 'user_asked', prompt: SPEC_MIN }, `started ${U1}`)).toEqual({ nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', sessao: U1 })
  expect(entradaMapa({ name: 'c02-s01-alertas-locks-es', initiation: 'own_initiative', prompt: SPEC_MIN }, `started ${U1}`)).toBe(null)
  const s = notasOrq(NOTAS).sessoes
  const m = mapaDasNotas(MAPA_VAZIO(), s, 'NOVARC-PLUGIN-MAESTRO', 1)
  expect(m.specs['C02-S01']).toMatchObject({ conjunto: 'C02', nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', sessao: U1 })
  expect(m.conjuntos.C02).toEqual({ nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', sessao: U2 })
  const titulado = noMapa(MAPA_VAZIO(), { nome: 'novarc-OUTRO-C02-S01', sessao: 'local_velho' })
  expect(mapaDasNotas(titulado, s, null, 1).specs['C02-S01']).toMatchObject({ nome: 'novarc-OUTRO-C02-S01', sessao: U1 })
  expect(mapaDasNotas(MAPA_VAZIO(), s, null, 1).specs['C02-S01']?.nome).toBe('c02-s01-alertas-locks-es')
})

test('directive rules for GO inicio and CANCELADO; regression pins (C05-S01 R28, A17)', () => {
  expect(regraDaDiretiva('GO C02 inicio 9f8e7d6')).toBe('orquestrar.md §5')
  expect(regraDaDiretiva('CANCELADO C04 removido do plano')).toBe('orquestrar.md §5')
  expect(regraDaDiretiva('GO c02-s01 verify feat/x')).toBe('step-05 §5.3')
  // regression pins: green before this spec, kept
  expect(rotaDaDiretiva(MAPA_VAZIO(), 'C02', 'o', 'o', 'GO C02 inicio 9f8e7d6')).toBe(null)
  expect(papelDoPrompt('c02-s01-alertas-locks-es')).toBe(null)
  expect(papelDaBranch('feat/c02-s01-alertas-locks-espelho-20261029')).toEqual({ papel: 'spec', conjunto: 'C02', spec: 'C02-S01' })
})

test('the set RUN_ID carries the set and the session prefix; checkoutPrincipal follows (C05-S01 Task 3b)', () => {
  expect(runIdDoDir('C:/r/.novarc/ledger/session-build/20261028-0300-c02-3b2b0f69')).toBe('20261028-0300-c02-3b2b0f69')
  expect(runIdDoDir('C:/r/.novarc/ledger/session-build/20261028-0300/')).toBe('20261028-0300')
  expect(runIdDoDir('C:\\r\\.novarc\\ledger\\session-build\\20261028-0300-c02')).toBe(null)
  expect(runIdDoDir('C:/r/x/20261028-0300-foo')).toBe(null)
  expect(runIdDoDir(null)).toBe(null)
  expect(checkoutPrincipal('C:/r/.novarc/ledger/session-build/20261028-0300-c02-3b2b0f69')).toBe('C:/r')
  expect(checkoutPrincipal('C:/r/.novarc/ledger/session-build/20261028-0300')).toBe('C:/r')
  expect(checkoutPrincipal('C:/r/.superpowers/session-build/20261028-0300')).toBe('C:/r')
})

test('conjuntosDaAba unions blocks, SESSAO and CARTAO sets and classifies vazia / go / normal (C05-S01 R24, R25, R32)', () => {
  const T = Date.parse('2026-10-28T16:00:00Z')
  const regs = [{ sessao: 's3', cwd: '', titulo: '', papel: 'conjunto', forks: 0, feitos: 0, alerta: null, at: T, conjunto: 'C03', aguardandoGo: true }] as Registro[]
  const cs = conjuntosDaAba([{ conjunto: 'C01', titulo: 'Base', raias: [] }], notasOrq(NOTAS), {}, regs, { C02: ['C01'], C03: ['C02'] }, { C01: 'Base' }, T)
  expect(cs.map(c => [c.id, c.titulo, c.estado, c.apos])).toEqual([
    ['C01', 'Base', 'normal', []],
    ['C02', '', 'go', ['C01']],
    ['C03', '', 'vazia', ['C02']],
    ['C11', '', 'normal', []],
    ['C12', '', 'normal', []],
  ])
  // a GO the local copy saw also ends the wait; a stale registry entry does not start one
  const sem = notasOrq(lerLedger(`NOTE SESSAO C04 c04-x ${U1} vazia  # 2026-10-28T10:00:00Z\n`))
  expect(conjuntosDaAba([], sem, {}, [], {}, {}, T)[0]!.estado).toBe('vazia')
  expect(conjuntosDaAba([], sem, { C04: { sha: 'a', at: T, atualizadas: [], decisoesNovas: 0, branches: [] } }, [], {}, {}, T)[0]!.estado).toBe('go')
  expect(conjuntosDaAba([], notasOrq([]), {}, [{ ...regs[0]!, at: T - 3 * 3600_000 }], {}, {}, T)).toEqual([])
  // validation fix 3: a cancelled set is its own state, never waiting
  const can = notasOrq(lerLedger(`NOTE SESSAO C04 c04-x ${U1} vazia  # 2026-10-28T10:00:00Z\nNOTE CANCELADO C04 removido do plano  # 2026-10-28T11:00:00Z\n`))
  expect(conjuntosDaAba([], can, {}, [], {}, {}, T).map(c => [c.id, c.estado, c.motivo])).toEqual([['C04', 'cancelado', 'removido do plano']])
})
