// Shared fixtures of the C06-S01 continuo tests (split across continuo*.test.ts to keep each file under the
// runner's per-file cap), the way mundo-teste.ts is shared. Not a test file.
import { expect, test } from 'claude-code/testing'
import {
  acimaDoTeto, autorizado, camposReinicio, escopoSugerido, faixaDeConjuntos, itensCartao, linhaEscopoCartao, modoDe, mudarModo, nomePerfil, registroLiberacao, resumoEscopo, seloModo,
  type AcaoContinuo, type ContinuoDoc, type EscopoContinuo, type Perfil,
} from './logic'
import { SESSOES, URL as URL_I, disparar, dispararDesde, escrito, gravar, iniciar, montar, partesDaFaixa, quieto, textoNo, tick, todos, type Mundo } from './mundo-teste'
import { dadosFaixa, mesclar } from './register'
import { validarConcessao } from './logic'
import { cartaoLiberacao } from './continuo-ui'
import { abaConfiguracao, camposPerfil } from './configuracao-aba'
import { kit } from './kit'


export const PERFIL: Perfil = { hostGit: 'github', merge: { quem: 'novarc', clique: false }, teto: { ate: 'merge', migracaoProducao: false, deploy: false, porAcao: false }, migracao: { ferramenta: 'supabase' }, deploys: [{ alvo: 'publicar-dev', dispara: 'merge' }] }
export const RUN = '20261103-0930'
export const DOC: ContinuoDoc = {
  runId: RUN, modo: 'continuo', modoBy: 'Willian', modoAt: '2026-11-03T13:01:00Z',
  autorizacao: { by: 'Willian', at: '2026-11-03T13:01:00Z', escopo: { conjuntos: ['C06'], fases: ['f6'], merge: true, migracoes: false, deploys: false, ate: '2026-11-03T21:00:00Z' }, teto: PERFIL.teto!, continuoHabilitado: true },
}
export const AGORA = Date.parse('2026-11-03T15:06:00Z')
export const ACOES: AcaoContinuo[] = ['go', 'hold', 'fecha', 'merge', 'migracao', 'deploy']
export const base = { autorizacao: DOC, runId: RUN, perfil: PERFIL, acao: 'fecha' as AcaoContinuo, conjunto: 'C06', agora: AGORA }
export const comEscopo = (e: Partial<EscopoContinuo>): ContinuoDoc => ({ ...DOC, autorizacao: { ...DOC.autorizacao!, escopo: { ...DOC.autorizacao!.escopo, ...e } } })
export const dois = (n: number) => String(n).padStart(2, '0')
export const hhmm = (iso: string) => `${dois(new Date(iso).getHours())}:${dois(new Date(iso).getMinutes())}`
export const local = (h: number, m: number) => new Date(2026, 10, 3, h, m, 0, 0)

// ---- Phase 4 (Tasks 10-13): the config/continuo cache, pausar/retomar, the prompt section, the strip and the seal


export const LENTO = { timeoutMs: 20_000 }
export const COD = 'NOVARC-PLUGIN-MAESTRO'
export const RUN_I = '20261103-0930'
export const ORQ_DIR = `C:/repo/.novarc/ledger/novarc-orq/${RUN_I}`
export const LDIR = `C:/repo/.novarc/ledger/session-build/${RUN_I}`
export const PLANO_I = {
  conjuntos: [{ id: 'C02', titulo: 'Alertas', specs: ['C02-S01'] }],
  specs: [{ id: 'C02-S01', conjunto: 'C02', slug: 'alertas' }],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: COD },
  execucao: { orquestrador: `novarc-orq-${COD}`, perfil: PERFIL },
}
// tomorrow 18:00 local: a live grant whose scope line reads `até 18:00`
export const ATE = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 18, 0, 0, 0).toISOString()
}
export const ESCOPO_I = (): EscopoContinuo => ({ conjuntos: ['C02'], fases: [], merge: true, migracoes: false, deploys: false, ate: ATE() })
export const DOC_I = (modo: ContinuoDoc['modo'], runId = RUN_I): ContinuoDoc => ({
  runId, modo, modoBy: 'Willian', modoAt: '2026-11-03T13:01:00.000Z',
  autorizacao: { by: 'Willian', at: '2026-11-03T13:01:00.000Z', escopo: ESCOPO_I(), teto: PERFIL.teto!, continuoHabilitado: true },
})
export const seg = (ms: number) => Math.floor(ms / 1000) * 1000
export const calado = () => ({ C02: { etapa: 'implementacao', texto: '', at: seg(Date.now() - 16.5 * 60_000) } })
export const enviados = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e === 'object' && 'to' in e && e.to !== 'transcript' && typeof e.text === 'string')
// typed by the person: /maestro retomar takes composer|bridge only
export const maestro = ($: any, args: string, kind = 'composer') => $.command.run?.({ command: 'maestro', args, origin: { kind } })
export const peer = ($: any, text: string) => $.session.receive?.({ origin: { kind: 'peer' }, text })
export const poll = async (m: Mundo) => {
  disparar(m, 300_000)
  await quieto(m)
}
export const ctxOrq = () => ({ artefato: URL_I, plano: PLANO_I, conjunto: null, spec: null, papel: 'orquestrador' })
export const listasConfig = (m: Mundo) => m.tools.filter((t: any) => t.action === 'list' && t.collection === 'config').length

/** An orchestrator on ORQ_DIR (run RUN_I unless `dir` says otherwise) with a live C02 set in the registry; the poll fired once. */
export async function orq($: any, on: any, o: { db?: Record<string, any>; conjuntos?: Record<string, any>; semPoll?: boolean; dir?: string; plano?: unknown; antes?: (m: Mundo) => void } = {}) {
  const m = montar(on, {}, 'main', true)
  m.env.USERNAME = 'Willian'
  m.plano = o.plano ?? PLANO_I
  m.db = { 'config/orquestracao': { data: { runId: RUN_I }, version: 1 }, ...o.db }
  const dir = o.dir ?? ORQ_DIR
  gravar(m, `${dir}/ledger.md`, `# novarc-orq - run ${RUN_I}\n`)
  gravar(m, `${SESSOES}/set-c02.json`, JSON.stringify({ sessao: 'set-c02', cwd: 'C:/repo', titulo: 'x', papel: 'conjunto', forks: 2, feitos: 0, alerta: null, at: Date.now(), codigo: COD, conjunto: 'C02', ledgerDir: LDIR }))
  m.servirEstado = { exec: { papel: 'orquestrador', ledgerDir: dir, forks: {}, codigo: COD, conjuntos: o.conjuntos ?? {} }, ctx: { ...ctxOrq(), plano: o.plano ?? PLANO_I } }
  o.antes?.(m)
  await iniciar($)
  await quieto(m)
  if (!o.semPoll) await poll(m)
  return m
}

/** A set session of C02 on LDIR, its context from artefato.txt and the Skill call. */
export async function conjunto($: any, on: any) {
  const m = montar(on, {}, 'main', true)
  m.plano = PLANO_I
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL_I}\n`)
  m.db = { 'config/orquestracao': { data: { runId: RUN_I }, version: 1 } }
  gravar(m, `${LDIR}/ledger.md`, `# session-build - run ${RUN_I}\n`)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-build', args: `conjunto ${URL_I} C02` })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${LDIR} --type NOTE --text "x"` })
  await quieto(m)
  return m
}

export const baseCompose = (on: any) => on('prompt.compose', async () => ({ sections: [{ id: 'engine', scope: 'shared', text: 'e' }] }))
export const compor = ($: any) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
export const secaoModo = async ($: any) => (await compor($)).sections.find((s: any) => s.id === 'novarc:maestro-modo')

// ---- Task 13: the mode strip and the band seal (R25, R26, R51, R52, R55)

export const PANE_I = { plugin: 'novarc', component: 'Pane', requestId: 'novarc-maestro', props: { title: 'Maestro', isFocused: false, bodyColumns: 120 } } as const
export const BANDA_I = { plugin: 'novarc', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 78 } } as const
export const LEIT_I = () => ({ at: Date.now() - 40_000, falhou: false, fonte: null, falhas: { planejamento: false, registro: false } })
export const EX_ORQ = { papel: 'orquestrador', ledgerDir: ORQ_DIR, forks: {} }
export const EX_CONJ = { papel: 'conjunto', conjunto: 'C02', ledgerDir: LDIR, forks: {} }
export const EX_SPEC = { papel: 'spec', conjunto: 'C02', spec: 'C02-S01', ledgerDir: LDIR, forks: {} }
export const painel = ($: any, surface: 'desktop' | 'terminal') => $.ui.mount({ ...PANE_I, surface })
export const estado = (ex: unknown, doc: ContinuoDoc | null, extra: Record<string, unknown> = {}) => ({
  ctx: ctxOrq(), exec: ex, maestroLeitura: LEIT_I(), maestroOutras: [], maestroContinuo: { doc, versao: 1, at: 1 }, ...extra,
})
export const variante = async (ui: any, key: string) => (await ui.find({ key }))?.props.variant
export const svgsDaFaixa = async (ui: any) => todos(await ui.find({ key: 'modo' })).filter((n: any) => n.type === 'Svg').map((n: any) => n.props)

// ---- Phase 4 fix round 1

export const NOVA = '20261104-1000'
export const DIR_NOVA = `C:/repo/.novarc/ledger/novarc-orq/${NOVA}`

// ---- Phase 5 (Tasks 14-16): the authorization card, the Configuração tab, the grant guard


// pure section: validarConcessao (Task 1 gains these cases)
export const PLANO_V = { conjuntos: [{ id: 'C06', titulo: 'a', specs: [], fase: 'f6' }, { id: 'C07', titulo: 'b', specs: [], fase: 'f7' }] }
export const AG_V = Date.parse('2026-11-03T15:00:00Z')
export const ESC_V: EscopoContinuo = { conjuntos: ['C06'], fases: ['f6'], merge: true, migracoes: false, deploys: false, ate: '2026-11-03T21:00:00Z' }
export const docV = (escopo: EscopoContinuo = ESC_V, by = 'Willian'): ContinuoDoc => (registroLiberacao({ by, at: '2026-11-03T14:55:00Z', escopo, perfil: PERFIL, runId: RUN, continuoHabilitado: true, modoAntes: 'manual' }) as any).doc
export const iV = { runId: RUN, perfil: PERFIL, plano: PLANO_V, agora: AG_V }
export const motivo = (data: unknown, i = iV) => { const r = validarConcessao(data, i); return r.ok ? 'ok' : r.motivo }
export const comA = (a: Record<string, unknown>) => ({ ...docV(), autorizacao: { ...docV().autorizacao, ...a } })
export const comE = (e: Partial<EscopoContinuo>) => comA({ escopo: { ...ESC_V, ...e } })

// one piece drawn through a real mount: a Pane id the novarc hooks do not claim falls through to this handler
export let peca: (k: any, ui: any) => any = () => null
export const PECA = { plugin: 'novarc', component: 'Pane', requestId: 'c06-peca', props: { title: 'p', isFocused: false, bodyColumns: 64 } } as const
export function montarPeca(on: any) {
  on('ui.render', { component: 'Pane', requestId: 'c06-peca' }, async ($: any, e: any) => {
    const ui = { ...$.ui.resolve(e) }
    if (e.surface === 'terminal') {
      delete ui.Svg
      delete ui.Client
    }
    const k = kit(ui, e.props.bodyColumns ?? 64, e.surface)
    const p = peca(k, ui)
    return k.quadro('raiz', Array.isArray(p) ? p : [p])
  })
}
export const desenhar = ($: any, p: typeof peca, bodyColumns = 64, surface: 'desktop' | 'terminal' = 'desktop') => {
  peca = p
  return $.ui.mount({ ...PECA, surface, props: { ...PECA.props, bodyColumns } })
}
// texts and Svg alts of a drawn subtree, depth first
export const partes = (n: any) => todos(n).flatMap((x: any) => (x.type === 'Svg' ? [String(x.props.alt)] : x.type === 'Text' && x.children?.every((c: any) => typeof c === 'string') ? [textoNo(x)] : []))
export const emOrdem = (seq: string[], esperados: string[]) => {
  let i = -1
  for (const e of esperados) {
    const j = seq.findIndex((s, n) => n > i && s.startsWith(e))
    if (j < 0) throw new Error(`fora de ordem ou ausente: ${e}`)
    i = j
  }
  return true
}
export const hojeAs = (h: number, m: number) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m, 0, 0) }

// ---- Task 14

export const PERFIL_ALTO: Perfil = { ...PERFIL, teto: { ate: 'deploy', migracaoProducao: false, deploy: true, porAcao: false } }
export const PLANO_A = {
  conjuntos: ['C06', 'C07', 'C08', 'C09'].map(id => ({ id, titulo: id, specs: [] })),
  specs: [],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: COD },
  execucao: { orquestrador: `novarc-orq-${COD}`, perfil: PERFIL_ALTO },
}
export const ctxA = () => ({ ...ctxOrq(), plano: PLANO_A })
export const CLAUDE_MD = 'C:/Users/t/.claude/CLAUDE.md'
export const comImport = (m: Mundo) => gravar(m, CLAUDE_MD, '@NOVARC.md\n@NOVARC-CONTINUO.md\n')
export const LINHA_A = 'Esta execução · C06 a C09 · merge e deploy automáticos · teto do perfil novarc-maestro'

// ---- Task 16 helpers (the world of Tasks 10-13)

// the agent's complete document (registroLiberacao's shape), built by hand so a bad one can be sent too
export const docGrant = (o: { runId?: string; escopo?: Partial<EscopoContinuo>; by?: string } = {}): ContinuoDoc => {
  const at = new Date().toISOString()
  const by = o.by ?? 'Willian'
  // the card's own scope (I2: the guard binds the write to it)
  const escopo = { ...escopoSugerido(PERFIL, PLANO_I as any, Date.now()), ...o.escopo }
  return { runId: o.runId ?? RUN_I, modo: 'continuo', modoBy: by, modoAt: at, autorizacao: { by, at, escopo, teto: PERFIL.teto!, continuoHabilitado: true } }
}
export const gravarGrant = ($: any, data: unknown, o: Record<string, unknown> = {}) => $.tool.call({ tool: 'ArtifactData', action: 'set', url: URL_I, collection: 'config', doc_id: 'continuo', data, ...o })
export const digitar = ($: any, text: string) => $.prompt.submit?.({ text, origin: { kind: 'composer' } })
export const negado = (r: any) => r?.deny ?? (r?.isError ? r.text : undefined)
// R-a: the person says "orquestra contínuo" (opens the card), then presses liberar (arms the one token)
export async function armar($: any, m: Mundo) {
  await digitar($, 'orquestra contínuo')
  const ui = await painel($, 'desktop')
  await ui.press({ key: 'continuo-liberar' })
  await quieto(m)
  await ui.unmount()
}
export const NAO = (m: string) => `Modo contínuo não liberado: ${m}.`
export const TURNO = NAO('a liberação só vale no turno de quem conduz')

// ---- Task 15: the Configuração tab

export const PERFIL_CFG: Perfil = {
  ...PERFIL, stack: 'TypeScript · Claude Code mod', base: 'main', gate: { comandos: ['claude plugin test .'] }, janelaDeploy: 'qualquer hora', geradoEm: '2026-11-02T10:00:00Z',
}
export const PLANO_CFG = { ...PLANO_I, execucao: { ...PLANO_I.execucao, perfil: PERFIL_CFG } }
export const docCfg = (at: Date, ate: Date, modo: ContinuoDoc['modo'] = 'continuo', escopo: Partial<EscopoContinuo> = {}): ContinuoDoc => ({
  runId: RUN_I, modo, modoBy: 'Willian', modoAt: at.toISOString(),
  autorizacao: { by: 'Willian', at: at.toISOString(), escopo: { conjuntos: ['C02'], fases: [], merge: true, migracoes: false, deploys: false, ate: ate.toISOString(), ...escopo }, teto: PERFIL.teto!, continuoHabilitado: true },
})
export const aba = (k: any, ui: any, o: Partial<Parameters<typeof abaConfiguracao>[2]> = {}) =>
  abaConfiguracao(ui, k, { orq: true, perfil: PERFIL_CFG, nome: 'novarc-maestro', continuo: null, runId: RUN_I, agora: local(15, 6).getTime(), plano: PLANO_CFG as any, estado: 'normal', tentar: () => {}, ...o })
export const textoDe = async (ui: any, key: string) => partes(await ui.find({ key }))

export const MODO_MAESTRO = NAO('o modo é do Maestro; use os botões ou /maestro pausar|retomar')

// ---- Phase 6 (Tasks 17-19): mandatory stops, from a received line or a db key; one episode, one row, one toast, one card

export const PLANO_P = {
  ...PLANO_I,
  conjuntos: [...PLANO_I.conjuntos, { id: 'C06', titulo: 'Paradas', specs: ['C06-S01'] }],
  specs: [...PLANO_I.specs, { id: 'C06-S01', conjunto: 'C06', slug: 'paradas' }],
}
export const MOTIVO_P = 'Conflito em hooks/maestro/logic.ts entre C06-S01 e C06-S02.'
export const LINHA_P = `CONJUNTO C06 bloqueado parada:conflito-merge ${MOTIVO_P}`
export const MAIS_LENTO = { timeoutMs: 90_000 }
/** An orchestrator whose plan has C06, in Contínuo (granted doc), Pausado, or Manual (no config/continuo). */
export const orqP = ($: any, on: any, modo: ContinuoDoc['modo'] | null, o: { conjuntos?: Record<string, any>; db?: Record<string, any> } = {}) =>
  orq($, on, { plano: PLANO_P, conjuntos: o.conjuntos, db: { ...(modo && modo !== 'manual' ? { 'config/continuo': { data: DOC_I(modo), version: 1 } } : {}), ...o.db } })
export const linhasParada = (m: Mundo) => Object.entries(m.db!).filter(([k]) => k.startsWith('auditoria/parada-'))
export const linhasModo = (m: Mundo) => Object.values(m.db!).filter(v => v.data?.acao === 'MODO').map(v => v.data)
export const setsParada = (m: Mundo) => m.tools.filter((t: any) => t.collection === 'auditoria' && t.action === 'set' && String(t.doc_id).startsWith('parada-')).length
export const submetidos = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e.text === 'string' && !('to' in e) && (e.asUser === true || e.origin?.kind === 'plugin')).length
export const bloqueio = (tipo: string, motivo: string, at?: string) => ({ data: { bloqueios: { [`parada:${tipo}`]: at ? { motivo, at } : { motivo } } }, version: 1 })
export const banda = async ($: any) => {
  const b = await $.ui.mount({ ...BANDA_I, surface: 'desktop' })
  const raiz = await b.drawn()
  await b.unmount()
  return raiz
}
export const corpoDoPainel = async ($: any) => {
  const ui = await painel($, 'desktop')
  const corpo = await ui.find({ key: 'corpo' })
  const cartoes = (await ui.findAll({ type: 'Box' })).filter((n: any) => String(n.key ?? '').startsWith('parada-'))
  // the body's first child is the first stop card (keys are read from findAll; drawn children carry none)
  const primeiro = cartoes[0] && textoNo(corpo?.children?.[0]) === textoNo(cartoes[0]) ? cartoes[0] : corpo?.children?.[0]
  return {
    primeiro,
    cartoes: cartoes.length,
    alt: String((await ui.findAll({ type: 'Svg' })).map((x: any) => String(x.props.alt ?? '')).find((a: string) => a.startsWith('NovArc Maestro')) ?? ''),
    sino: (await ui.find({ key: 'sino' }))?.text,
    ui,
  }
}
export async function reiniciar($: any, m: Mundo) {
  await $.session.end?.({ reason: 'other', sessionId: 'sess-1', resume: { id: 'sess-1' } })
  await quieto(m)
  await iniciar($)
  await quieto(m)
  await poll(m)
}
/** A34 (R35): nothing a stop does reverts anything. */
export const semReverter = (m: Mundo) => {
  expect(m.runs.some(r => /revert|reset --hard|rollback/.test(r))).toBe(false)
  expect(m.tools.some((t: any) => /revert|reset --hard|rollback/.test(JSON.stringify(t)))).toBe(false)
}
