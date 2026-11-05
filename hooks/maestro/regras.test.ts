import { expect, test } from 'claude-code/testing'

import { NOVARC_CONTINUO_MD, NOVARC_MD, comImport, importsRegras, regrasNoInicio, semImports } from './regras'
import { gravar, iniciar, montar, norm, type Mundo } from './mundo-teste'

// The exception block of the plan's p-excecao-claude-md, verbatim
const EXCECAO = "- **Exception: Maestro continuous mode, per orchestrator.** When Will authorizes continuous mode for one NOVARC orchestration (in that orchestrator session, by \"orquestra contínuo\" or the Maestro authorization card), the authorization is recorded in that planning artifact's database with its scope (sets, phases, merge, migrations, deploys), the date and who granted it. Within that execution only, a set session that received the orchestrator's `FECHA` may run `/novarc-session-end` for that set's own branches as if Will had invoked it, and the orchestrator may send the directives the protocol already defines (GO, MERGE-OK (after Will's click only when the profile requires it), LIBERA). Never above the project profile's ceiling, never outside that set's branches, never for a repository whose CLAUDE.md requires per-action authorization; a merge the profile marks as requiring a human click waits for it. Outside a recorded authorization, \"never chained autonomously\" holds in full. Force-push, squash, history rewriting and anything the session-end itself forbids stay forbidden."

const GUARDA = new RegExp(['novarc-session-' + 'brainstorm', 'novarc-session-' + 'plan/', 'novarc-' + 'design', 'hooks/' + 'acervo', 'register' + 'Acervo', 'SGstjpcKWK2f7' + 'scagoWXSM'].join('|'))

test('importsRegras: whole trimmed lines only', () => {
  expect(importsRegras('@RTK.md\n  @NOVARC.md  \n')).toEqual({ novarc: true, continuo: false })
  expect(importsRegras('see @NOVARC.md here')).toEqual({ novarc: false, continuo: false })
  expect(importsRegras('@NOVARC-CONTINUO.md\r\n')).toEqual({ novarc: false, continuo: true })
  expect(importsRegras(null)).toEqual({ novarc: false, continuo: false })
})

test('comImport: appends once, keeps the line ending', () => {
  expect(comImport('@RTK.md', '@NOVARC.md')).toBe('@RTK.md\n@NOVARC.md\n')
  expect(comImport('a\r\nb\r\n', '@NOVARC.md')).toBe('a\r\nb\r\n@NOVARC.md\r\n')
  const ja = 'a\n  @NOVARC.md  \n'
  expect(comImport(ja, '@NOVARC.md')).toBe(ja)
  expect(comImport('', '@NOVARC.md')).toBe('@NOVARC.md\n')
})

test('semImports: drops only the two lines, byte for byte', () => {
  expect(semImports('x\r\n@NOVARC.md\r\n@RTK.md\r\n  @NOVARC-CONTINUO.md\r\ny')).toBe('x\r\n@RTK.md\r\ny')
  const sem = 'a\r\nb @NOVARC.md\n\nc'
  expect(semImports(sem)).toBe(sem)
})

test('A16: NOVARC_CONTINUO_MD is the exception under the R17 substitution', () => {
  const esperado = EXCECAO.replace(/Will's click/g, 'the click of the person who owns this CLAUDE.md').replace(/\bWill\b/g, 'the person who owns this CLAUDE.md')
  expect(NOVARC_CONTINUO_MD.includes(esperado)).toBe(true)
  expect(/\bWill\b/.test(NOVARC_CONTINUO_MD)).toBe(false)
  expect(NOVARC_CONTINUO_MD.startsWith('# NOVARC continuous-mode exception\n\n')).toBe(true)
})

test('A17: NOVARC_MD at most 60 lines, names the public pieces', () => {
  expect(NOVARC_MD.split('\n').length).toBeLessThanOrEqual(60)
  for (const parte of ['novarc-session-build', 'novarc-session-end', 'novarc-codex-review', '/maestro', 'skills/novarc-session-build/SKILL.md']) expect(NOVARC_MD).toContain(parte)
})

test('A17: neither constant matches the publish guard', () => {
  expect(NOVARC_MD).not.toMatch(GUARDA)
  expect(NOVARC_CONTINUO_MD).not.toMatch(GUARDA)
  expect(NOVARC_MD.includes(['novarc-session-', 'plan'].join(''))).toBe(false)
})

test('regrasNoInicio: first install writes the rules, then the import', () => {
  const toast = 'Regras NOVARC incluídas no seu CLAUDE.md'
  expect(regrasNoInicio({ novarc: null, continuo: null, claude: '@RTK.md\n', instalado: false })).toEqual({
    escrever: [{ arquivo: 'NOVARC.md', texto: NOVARC_MD }, { arquivo: 'CLAUDE.md', texto: '@RTK.md\n@NOVARC.md\n' }], toast,
  })
  expect(regrasNoInicio({ novarc: null, continuo: null, claude: null, instalado: false }).escrever[1]).toEqual({ arquivo: 'CLAUDE.md', texto: '@NOVARC.md\n' })
  expect(regrasNoInicio({ novarc: null, continuo: null, claude: '@NOVARC.md\n', instalado: false })).toEqual({ escrever: [{ arquivo: 'NOVARC.md', texto: NOVARC_MD }], toast })
})

test('regrasNoInicio: an interrupted install is finished, whatever novarc holds', () => {
  const toast = 'Regras NOVARC incluídas no seu CLAUDE.md'
  expect(regrasNoInicio({ novarc: NOVARC_MD, continuo: null, claude: '@RTK.md\n', instalado: false })).toEqual({ escrever: [{ arquivo: 'CLAUDE.md', texto: '@RTK.md\n@NOVARC.md\n' }], toast })
  const velho = regrasNoInicio({ novarc: 'old', continuo: null, claude: '@RTK.md\n', instalado: false })
  expect(velho.escrever.map(e => e.arquivo)).toEqual(['NOVARC.md', 'CLAUDE.md'])
  expect(velho.toast).toBe(toast)
})

test('regrasNoInicio: an installed home refreshes the rules files and never CLAUDE.md', () => {
  expect(regrasNoInicio({ novarc: 'old', continuo: null, claude: '@RTK.md\n', instalado: true })).toEqual({ escrever: [{ arquivo: 'NOVARC.md', texto: NOVARC_MD }], toast: 'regras NOVARC atualizadas' })
  expect(regrasNoInicio({ novarc: NOVARC_MD, continuo: 'old', claude: '@RTK.md\n', instalado: true })).toEqual({ escrever: [{ arquivo: 'NOVARC-CONTINUO.md', texto: NOVARC_CONTINUO_MD }], toast: 'regras NOVARC atualizadas' })
  expect(regrasNoInicio({ novarc: NOVARC_MD, continuo: null, claude: '@RTK.md\n', instalado: true })).toEqual({ escrever: [], toast: null })
  expect(regrasNoInicio({ novarc: NOVARC_MD, continuo: NOVARC_CONTINUO_MD, claude: '@RTK.md\n', instalado: true })).toEqual({ escrever: [], toast: null })
})

test('R23: no case writes a CLAUDE.md with the continuous import the input did not have', () => {
  for (const instalado of [true, false])
    for (const claude of [null, '@RTK.md\n', '@NOVARC.md\r\n'])
      for (const continuo of [null, 'old', NOVARC_CONTINUO_MD]) {
        const r = regrasNoInicio({ novarc: 'old', continuo, claude, instalado })
        for (const e of r.escrever) if (e.arquivo === 'CLAUDE.md') expect(e.texto).not.toContain('@NOVARC-CONTINUO.md')
      }
})

// ---- Integration: session.start and the two /maestro commands against the world's fake home (C:/Users/t)

const H = 'C:/Users/t/.claude'
const CMD = `${H}/CLAUDE.md`
const NOV = `${H}/NOVARC.md`
const CONT = `${H}/NOVARC-CONTINUO.md`
const FLAG = 'maestro-regras-instaladas'
const INCLUIDAS = 'Regras NOVARC incluídas no seu CLAUDE.md'
const HABILITADA = 'Exceção do modo contínuo incluída no seu CLAUDE.md. Só quem pode liberar o contínuo (sócio ou dev interno da NovArc) deve mantê-la.'
const LENTO = { timeoutMs: 20_000 }
const texto = (m: Mundo, p: string) => m.arquivos[p]?.text
/** Writes under the fake .claude, the session registry left out. */
const naHome = (escritos: Record<string, string>) => Object.keys(escritos).map(norm).filter(k => k.startsWith(`${H}/`) && !k.includes('/maestro/'))
const lidosRegras = (m: Mundo) => m.lidos.filter(p => p.startsWith(`${H}/`) && !p.includes('/maestro/'))
const semContinuo = (escritos: Record<string, string>) => Object.values(escritos).every(t => !t.split(/\r?\n/).some(l => l.trim() === '@NOVARC-CONTINUO.md'))
const limpar = (escritos: Record<string, string>) => { for (const k of Object.keys(escritos)) delete escritos[k] }
const maestro = ($: any, args: string, kind = 'composer') => $.command.run?.({ command: 'maestro', args, origin: { kind } })
/** The world's home without the rules the world seeds as installed: a machine before the first install. */
const virgem = (m: Mundo) => {
  delete m.arquivos[NOV]
  delete m.store[FLAG]
  return m
}
const erroToast = (m: Mundo) => m.toasts.filter(t => t.startsWith('Regras NOVARC não incluídas: ')).length

test('A18 first session writes NOVARC.md and appends @NOVARC.md after @RTK.md, one toast', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, CMD, '@RTK.md\n')
  await iniciar($)
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(naHome(escritos)).toEqual([NOV, CMD])
  expect(texto(m, CMD)).toBe('@RTK.md\n@NOVARC.md\n')
  expect(m.toasts.filter(t => t === INCLUIDAS).length).toBe(1)
  expect(m.store[FLAG]).toBe(true)
  limpar(escritos)
  const toasts = m.toasts.length
  await iniciar($)
  expect(naHome(escritos)).toEqual([])
  expect(m.toasts.length).toBe(toasts)
  expect(semContinuo(escritos)).toBe(true)
})

test('A18 no CLAUDE.md creates it with the import', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  await iniciar($)
  expect(texto(m, CMD)).toBe('@NOVARC.md\n')
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(m.toasts).toContain(INCLUIDAS)
  expect(semContinuo(escritos)).toBe(true)
})

test('A19 changed NOVARC_MD rewrites the copy, NOVARC-CONTINUO.md not created', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, NOV, 'old')
  gravar(m, CMD, '@NOVARC.md\n')
  m.store[FLAG] = true
  await iniciar($)
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(m.toasts).toContain('regras NOVARC atualizadas')
  expect(CONT in m.arquivos).toBe(false)
  expect(naHome(escritos)).toEqual([NOV])
})

test('desempenho: equal content reads only the rules files, 0 writes, 0 toasts', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, NOV, NOVARC_MD)
  gravar(m, CMD, '@NOVARC.md\n')
  m.store[FLAG] = true
  await iniciar($)
  expect(lidosRegras(m)).toEqual([NOV])
  expect(naHome(escritos)).toEqual([])
  expect(m.toasts).toEqual([])
  gravar(m, CONT, NOVARC_CONTINUO_MD)
  m.lidos.length = 0
  await iniciar($)
  expect(lidosRegras(m)).toEqual([NOV, CONT])
  expect(naHome(escritos)).toEqual([])
  expect(m.toasts).toEqual([])
})

test('A23 a rejected CLAUDE.md write toasts and leaves it unchanged, next start retries', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, CMD, '@RTK.md\r\nfim')
  m.falharEscrita = p => p.endsWith('/.claude/CLAUDE.md')
  await iniciar($)
  expect(erroToast(m)).toBe(1)
  expect(texto(m, CMD)).toBe('@RTK.md\r\nfim')
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(FLAG in m.store).toBe(false)
  m.falharEscrita = null
  await iniciar($)
  expect(texto(m, CMD)).toBe('@RTK.md\r\nfim\r\n@NOVARC.md\r\n')
  expect(m.store[FLAG]).toBe(true)
  await iniciar($)
  expect(texto(m, CMD)).toBe('@RTK.md\r\nfim\r\n@NOVARC.md\r\n')
  expect(semContinuo(escritos)).toBe(true)
})

test('R24 (a) a failed NOVARC.md write writes nothing else; (c) a failed store flag is silent and finished next start', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  const original = '  @RTK.md  \r\nfim'
  gravar(m, CMD, original)
  m.falharEscrita = p => p.endsWith('/NOVARC.md')
  await iniciar($)
  expect([texto(m, CMD), NOV in m.arquivos, FLAG in m.store]).toEqual([original, false, false])
  expect(erroToast(m)).toBe(1)
  m.toasts.length = 0
  m.falharEscrita = p => p === `store:${FLAG}`
  await iniciar($)
  expect(texto(m, CMD)).toBe(`${original}\r\n@NOVARC.md\r\n`)
  expect(FLAG in m.store).toBe(false)
  expect(erroToast(m)).toBe(0)
  m.falharEscrita = null
  limpar(escritos)
  await iniciar($)
  expect(naHome(escritos)).toEqual([])
  expect(m.store[FLAG]).toBe(true)
})

test('R24 (e) NOVARC.md from an interrupted install and no flag: import added once, flag set', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, NOV, NOVARC_MD)
  gravar(m, CMD, '@RTK.md\n')
  await iniciar($)
  expect(texto(m, CMD)).toBe('@RTK.md\n@NOVARC.md\n')
  expect(naHome(escritos)).toEqual([CMD])
  expect(m.store[FLAG]).toBe(true)
})

test('run detection unaffected when every .claude call fails', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  m.falhar = p => p.startsWith(`${H}/`)
  m.falharEscrita = p => p.startsWith(`${H}/`)
  await iniciar($)
  expect(erroToast(m)).toBe(1)
  // the registry write under .claude fails too: the session entry lands in the store, so iniciarSessao ran
  expect(m.store['maestro-sessao-sess-1']).toBeTruthy()
})

test('A20 remover keeps every other line byte for byte; the next start adds nothing back', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, NOV, NOVARC_MD)
  m.store[FLAG] = true
  gravar(m, CMD, '@RTK.md\r\n@NOVARC.md\r\n@NOVARC-CONTINUO.md\r\nfim')
  const out = await maestro($, 'regras remover')
  expect(out.text).toBe('Regras NOVARC removidas do seu CLAUDE.md.')
  expect(texto(m, CMD)).toBe('@RTK.md\r\nfim')
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  limpar(escritos)
  await iniciar($)
  expect(naHome(escritos)).toEqual([])
  expect(texto(m, CMD)).toBe('@RTK.md\r\nfim')
})

test('A21 habilitar twice: one import line, the rules file, the reply', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, CMD, '@NOVARC.md\n')
  expect((await maestro($, 'continuo habilitar')).text).toBe(HABILITADA)
  expect((await maestro($, 'continuo habilitar')).text).toBe(HABILITADA)
  expect(texto(m, CONT)).toBe(NOVARC_CONTINUO_MD)
  expect(texto(m, CMD)).toBe('@NOVARC.md\n@NOVARC-CONTINUO.md\n')
  gravar(m, CMD, '@RTK.md\n')
  await maestro($, 'continuo habilitar')
  expect(texto(m, CMD)).toBe('@RTK.md\n@NOVARC.md\n@NOVARC-CONTINUO.md\n')
  expect(texto(m, NOV)).toBe(NOVARC_MD)
})

test('A22 habilitar from a plugin origin, a peer message or a mod prompt adds nothing', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, NOV, NOVARC_MD)
  m.store[FLAG] = true
  gravar(m, CMD, '@NOVARC.md\n')
  const out = await $.command.run?.({ command: 'maestro', args: 'continuo habilitar', origin: { kind: 'plugin', name: 'novarc' } })
  expect(out.text).toBe('Exceção do modo contínuo só por /maestro continuo habilitar digitado por você.')
  await iniciar($)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: '/maestro continuo habilitar' })
  await $.prompt.submit?.({ text: '/maestro continuo habilitar' })
  await $.prompt.submit?.({ text: 'Maestro (automático): /maestro continuo habilitar' })
  expect(naHome(escritos)).toEqual([])
  expect(texto(m, CMD)).toBe('@NOVARC.md\n')
  expect(CONT in m.arquivos).toBe(false)
})

test('R24 a failed command write replies with the error and leaves CLAUDE.md unchanged', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, CMD, '@NOVARC.md\n')
  m.falharEscrita = p => p.endsWith('/.claude/CLAUDE.md')
  expect((await maestro($, 'continuo habilitar')).text).toMatch(/^Regras NOVARC não incluídas: .+/)
  expect(texto(m, CMD)).toBe('@NOVARC.md\n')
  gravar(m, CMD, '@RTK.md\n@NOVARC.md\n')
  expect((await maestro($, 'regras remover')).text).toMatch(/^Regras NOVARC não incluídas: .+/)
  expect(texto(m, CMD)).toBe('@RTK.md\n@NOVARC.md\n')
})

test('fix1 R21: remover on a machine with NOVARC.md and no flag; the next start adds nothing back', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos)
  delete m.store[FLAG]
  gravar(m, CMD, '@RTK.md\n@NOVARC.md\n')
  await maestro($, 'regras remover')
  expect(texto(m, CMD)).toBe('@RTK.md\n')
  limpar(escritos)
  m.toasts.length = 0
  await iniciar($)
  expect(naHome(escritos)).toEqual([])
  expect(m.toasts.includes(INCLUIDAS)).toBe(false)
})

test('fix1 R21: habilitar on a virgin machine, then remover, then a start: no import re-added', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  await maestro($, 'continuo habilitar')
  delete m.store[FLAG] // even had habilitar not set it, remover sets it
  await maestro($, 'regras remover')
  expect(texto(m, CMD)).toBe('')
  expect(m.store[FLAG]).toBe(true)
  limpar(escritos)
  m.toasts.length = 0
  await iniciar($)
  expect(naHome(escritos)).toEqual([])
  expect(m.toasts.includes(INCLUIDAS)).toBe(false)
})

test('fix1 R21: habilitar leaves NOVARC.md present and the flag set', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  await maestro($, 'continuo habilitar')
  expect([texto(m, NOV), m.store[FLAG]]).toEqual([NOVARC_MD, true])
})

test('fix1 R23: habilitar from an sdk origin is refused like a plugin', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = montar(on, escritos)
  gravar(m, CMD, '@NOVARC.md\n')
  expect((await maestro($, 'continuo habilitar', 'sdk')).text).toBe('Exceção do modo contínuo só por /maestro continuo habilitar digitado por você.')
  expect(naHome(escritos)).toEqual([])
  expect((await maestro($, 'continuo habilitar', 'bridge')).text).toBe(HABILITADA)
})

test('fix1: not installed, CLAUDE.md already imports: a fresh NOVARC.md toasts nothing, an older one "atualizadas"', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  gravar(m, CMD, '@NOVARC.md\n')
  await iniciar($)
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(naHome(escritos)).toEqual([NOV])
  expect(m.toasts.filter(t => /Regras NOVARC|regras NOVARC/.test(t))).toEqual([])
  virgem(m)
  gravar(m, NOV, 'old')
  await iniciar($)
  expect(texto(m, NOV)).toBe(NOVARC_MD)
  expect(m.toasts.filter(t => /Regras NOVARC|regras NOVARC/.test(t))).toEqual(['regras NOVARC atualizadas'])
})

test('fix2 R24: a failing install marker (flag or NOVARC.md) before CLAUDE.md: both commands reply the error, CLAUDE.md byte-identical', LENTO, async ($: any, on: any) => {
  const escritos: Record<string, string> = {}
  const m = virgem(montar(on, escritos))
  const original = '@RTK.md\r\n@NOVARC.md\r\nfim'
  for (const falha of [(p: string) => p === `store:${FLAG}`, (p: string) => p.endsWith('/.claude/NOVARC.md')]) {
    for (const args of ['regras remover', 'continuo habilitar']) {
      virgem(m)
      gravar(m, CMD, original)
      m.falharEscrita = falha
      expect((await maestro($, args)).text).toMatch(/^Regras NOVARC não incluídas: .+/)
      expect(texto(m, CMD)).toBe(original)
    }
  }
})
