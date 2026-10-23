import { expect, test } from 'claude-code/testing'

import type { Execucao, Registro } from '../../types'
import {
  VAZIA, alerta, alertaRaias, anotar, cartoesAgora, chamadaLedger, checkpoint, ehBuild, faixaConjuntoRaias, laneDaMensagem, lerLedger, linhaConjunto,
  novasLinhas, papelDaBranch, papelDoPrompt, papelDoSkill, progresso, raia, raiasPorConjunto, slugDoSpawn, vivo,
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
