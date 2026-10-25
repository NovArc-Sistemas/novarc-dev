import { expect, test } from 'claude-code/testing'

import {
  banner, barraSegmentos, barraTempoDica, construidos, distribuicao, divisor, faixaSecao, limparMemo, logo, logoCurto, logoGirando, marca, ponto, selo,
  tabelaTrilhas, tabelaTrilhasM, type LinhaTrilha,
  LOGO_FAIXA, barraSegmentosM, bannerM, faixaSecaoM, seloM,
} from './desenho'

const cinco: LinhaTrilha[] = ['C03-S01', 'C03-S02', 'C03-S03', 'C03-S04', 'C03-S05'].map((nome, i) => ({ nome, feitos: i, atual: 'n', idade: `${i} min` }))

// The fixtures of spec A1, by name; the {src, w} builders read through .src.
const A1: [string, string][] = [
  ['banner', banner(1200, 'Maestro v2 · toda a execução', 3)],
  ['faixaSecao', faixaSecao(1200, 'Maestro v2 › 🔒 Locks e filas', 'ao vivo · atualizado há 40 s', true)],
  ['selo', selo('calada', 'ruim').src],
  ['tabelaTrilhas', tabelaTrilhas(1160, cinco)],
  ['barraTempoDica', barraTempoDica(0.6, 'C03-S01 segura desde 13:20 · vira órfão aos 20 min')],
  ['barraSegmentos', barraSegmentos(['d', 'w', ''])],
  ['distribuicao', distribuicao([['OPEN', 15], ['CLOSED', 214]])],
  ['logoCurto', logoCurto(22).src],
  ['logoGirando', logoGirando(16).src],
]
const TODOS: [string, string][] = [...A1, ['logo', logo(30).src], ['marca', marca], ['divisor', divisor], ['ponto', ponto('#a48be0')]]

test('every builder returns one svg with numeric width, height and viewBox', () => {
  for (const [nome, s] of TODOS) {
    expect({ nome, ok: /^<svg[^>]*\swidth="[\d.]+"[^>]*\sheight="[\d.]+"/.test(s) }).toEqual({ nome, ok: true })
    expect({ nome, vb: s.includes('viewBox="') }).toEqual({ nome, vb: true })
    expect({ nome, fim: s.endsWith('</svg>') && s.split('</svg>').length === 2 }).toEqual({ nome, fim: true })
  }
})

test('both palettes except banner, faixaSecao and ponto (A1)', () => {
  for (const [nome, s] of TODOS) {
    if (nome === 'banner' || nome === 'faixaSecao') expect(s).toContain('#04122E')
    else if (nome !== 'ponto') expect({ nome, dark: s.includes('@media (prefers-color-scheme: dark)') }).toEqual({ nome, dark: true })
  }
  const p = ponto('#a48be0')
  expect(p).toContain('viewBox="0 0 8 8"')
  expect(p).toContain('fill="#a48be0"')
})

test('width math', () => {
  for (const s of [banner(1200, 'x'), faixaSecao(1200, 'x')]) {
    expect(s).toContain('width="1200"')
    expect(s).toContain('viewBox="0 0 1200 ')
  }
  const sl = selo('calada', 'ruim')
  expect(sl.w).toBe(54)
  expect(sl.src).toContain('width="54" height="18"')
  expect(logoCurto(22).w).toBe(20)
  expect(tabelaTrilhas(1160, cinco)).toContain('width="116.875"')
})

test('escapes & and <', () => {
  const t = 'a < b & c'
  const e = 'a &lt; b &amp; c'
  expect(faixaSecao(600, t)).toContain(e)
  expect(banner(600, t)).toContain(e)
  expect(selo(t, 'ok').src).toContain(e)
  expect(barraTempoDica(0.5, t)).toContain(e)
  const tb = tabelaTrilhas(1160, [{ nome: 'x<y', feitos: 0, atual: null, idade: '1 min' }])
  expect(tb).toContain('x&lt;y')
  expect(tb).not.toContain('x<y')
})

test('tabelaTrilhas uses only the given tips', () => {
  const dicas = [[], [], [], [], ['entrou 13:20'], [], [], []]
  const s = tabelaTrilhas(1160, [{ nome: 'C03-S01', feitos: 4, atual: 'n', idade: '3 min', dicas }, { nome: 'C03-S02', feitos: 0, atual: 'n', idade: '1 min' }])
  expect(s).toContain('entrou 13:20')
  expect(s).toContain('SURF')
  expect(s).toContain('PUSH')
  expect((s.match(/13:\d\d/g) ?? []).every(x => x === '13:20')).toBe(true)
  expect(s).toContain('ainda não começou')
  expect(tabelaTrilhas(1160, [{ nome: 'C03-S01-nome-muito-longo', feitos: 0, atual: null, idade: '' }])).toContain('C03-S01-nome-mui…')
})

test('estados override feitos', () => {
  const s = tabelaTrilhas(1160, [{ nome: 'C03-S01', feitos: 0, atual: null, idade: '', estados: ['d', 'd', 'd', 'd', 'd', 'b', 'd', ''] }])
  expect((s.match(/fill="url\(#cb\)"/g) ?? []).length).toBe(1)
  expect((s.match(/fill="url\(#cd\)"/g) ?? []).length).toBe(6)
})

test('size ceiling (A43)', () => {
  const linhas: LinhaTrilha[] = Array.from({ length: 21 }, (_, i) => ({
    nome: `C03-S${String(i).padStart(2, '0')}-abcdefghi`,
    feitos: 7,
    atual: 'n',
    idade: '12 min',
    dicas: Array.from({ length: 8 }, () => ['entrou 13:20', 'levou 12 min']),
  }))
  expect(linhas[0]!.nome.length).toBe(17)
  expect(tabelaTrilhas(1160, linhas).length).toBeLessThan(110_000)
  for (const [, s] of A1) expect(s.length).toBeLessThan(131_072)
})

test('no animation in charts (A44)', () => {
  for (const [nome, s] of A1) if (nome !== 'logoGirando' && nome !== 'faixaSecao') expect({ nome, anim: s.includes('<animate') }).toEqual({ nome, anim: false })
  expect(faixaSecao(1200, 'a', 'b', false)).not.toContain('<animate')
})

test('barraSegmentos classes in order', () => {
  expect(barraSegmentos(['d', 'w', 'b', ''])).toMatch(/class="grn"[\s\S]*class="now"[\s\S]*class="red"[\s\S]*class="vz"/)
})

test('memo builds once per distinct argument list', () => {
  limparMemo()
  tabelaTrilhasM(1160, cinco)
  tabelaTrilhasM(1160, cinco)
  expect(construidos.tabelaTrilhas).toBe(1)
  tabelaTrilhasM(1160, cinco.slice(1))
  expect(construidos.tabelaTrilhas).toBe(2)
  limparMemo()
  expect(construidos.tabelaTrilhas).toBeUndefined()
})

test('every Svg a band redraw draws is memoized or a module constant: a repeat builds nothing (C11-S01 rework)', () => {
  limparMemo()
  for (let i = 0; i < 5; i++) {
    seloM('modo manual', 'neutro')
    barraSegmentosM(['d', 'w', 'b'])
    bannerM(1200, 'x', 0)
    faixaSecaoM(1200, '🧭 seções', '1 a 4', false)
  }
  expect(construidos).toEqual({ selo: 1, barraSegmentos: 1, banner: 1, faixaSecao: 1 })
  expect(seloM('modo manual', 'neutro')).toBe(seloM('modo manual', 'neutro'))
  expect(LOGO_FAIXA).toEqual(logoCurto(22))
  barraSegmentosM(['d', 'd', 'b'])
  expect(construidos.barraSegmentos).toBe(2)
})
