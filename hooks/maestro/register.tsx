// novarc mod: shows NOVARC execution state above the prompt and in a pane, and writes the mechanical milestones
// (branch publicada, PR aberto) that this session itself performs. Fork events come from the session-build ledger,
// read by the skills (R20); this mod never assumes it sees a fork's tool calls.
import type { Register } from 'claude-code'

import type { Contexto } from '../../types'
import {
  aFechar,
  branchDoPush,
  estadoConjunto,
  faixaConjunto,
  lerDocs,
  liberados,
  rank,
  specDaBranch,
  urlDoPr,
  urlOrquestrar,
  type ConjuntoDoc,
  type Plano,
  type SpecDoc,
} from './logic'

const PANE = 'novarc-maestro'
const CTX = { plugin: 'novarc', key: 'ctx' } as const
const LINHAS = { plugin: 'novarc', key: 'linhas' } as const
const FAIXA = { plugin: 'novarc', key: 'faixa' } as const

async function chamar($: any, input: Record<string, unknown>): Promise<string> {
  const r = await $.tool.call(input)
  if (!r || r.deny || r.isError) throw new Error(String((r && (r.deny || r.text)) || 'tool call failed'))
  return String(r.text ?? '')
}

/** Reads the artifact url from ai/specs/<codigo>/artefato.txt under the session cwd, if the repo has one. */
async function acharArtefato($: any, cwd: string): Promise<string | null> {
  try {
    const raiz = `${cwd}/ai/specs`
    for (const d of await $.fs.list(raiz)) {
      if (d.kind !== 'dir') continue
      try {
        const t = String(await $.fs.read(`${raiz}/${d.name}/artefato.txt`)).trim()
        if (t.startsWith('https://claude.ai/')) return t
      } catch {
        // no artefato.txt in this folder
      }
    }
  } catch {
    // no ai/specs folder: not a NOVARC client repo
  }
  return null
}

async function lerPlano($: any, url: string): Promise<Plano | null> {
  const t = await chamar($, { tool: 'Artifact', action: 'read', url, path: 'plano.json' })
  const m = t.match(/File saved: "([^"]+)"/)
  if (!m) return null
  return JSON.parse(String(await $.fs.read(m[1].replace(/\\\\/g, '\\'))))
}

async function lerColecao($: any, url: string, collection: string): Promise<Record<string, any>> {
  const t = await chamar($, { tool: 'ArtifactData', action: 'list', url, collection, query: { limit: 1000 } })
  return Object.fromEntries(lerDocs(t).map(d => [d.id, d.data]))
}

/** Writes a milestone on specs/<id> when the stored etapa is earlier (R3): get, compare, pinned update, 3 attempts. */
async function marco($: any, url: string, specId: string, etapa: string, campos: Record<string, unknown>): Promise<string> {
  for (let i = 0; i < 3; i++) {
    const t = await chamar($, { tool: 'ArtifactData', action: 'get', url, collection: 'specs', doc_id: specId })
    const [doc] = lerDocs(t)
    if (!doc) {
      try {
        await chamar($, { tool: 'ArtifactData', action: 'set', url, collection: 'specs', doc_id: specId, data: { etapa, ...campos, at: new Date().toISOString(), origem: 'mod' } })
        return 'criado'
      } catch {
        continue
      }
    }
    if (rank(doc.data.etapa as string) >= rank(etapa)) return 'ja-estava'
    try {
      await chamar($, { tool: 'ArtifactData', action: 'update', url, collection: 'specs', doc_id: specId, if_version: doc.version, data: { etapa, ...campos, at: new Date().toISOString(), origem: 'mod' } })
      return 'gravado'
    } catch {
      // version moved: re-read and retry
    }
  }
  return 'falhou'
}

/** Re-reads the current branch, so a session that switches branch or worktree after start follows it. */
async function seguirBranch($: any, c: Contexto): Promise<Contexto> {
  try {
    const { stdout } = await $.process.run(['git', 'branch', '--show-current'])
    const spec = specDaBranch(stdout.trim(), c.plano as Plano)
    if ((spec?.id ?? null) === c.spec) return c
    const novo: Contexto = { ...c, conjunto: spec ? spec.conjunto : null, spec: spec ? spec.id : null, papel: spec ? 'conjunto' : null }
    await $.state.set(CTX, novo)
    return novo
  } catch {
    return c
  }
}

async function atualizar($: any): Promise<void> {
  let c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  if (!c || !c.artefato || !c.plano) return
  if (c.papel !== 'orquestrador') c = await seguirBranch($, c)
  try {
    const specs = (await lerColecao($, c.artefato, 'specs')) as Record<string, SpecDoc>
    const execucao = (await lerColecao($, c.artefato, 'execucao')) as Record<string, ConjuntoDoc>
    const plano = c.plano as Plano
    const ls = (plano.conjuntos || []).map(cj => faixaConjunto(cj, estadoConjunto(cj, specs, execucao[cj.id])))
    await $.state.set(LINHAS, ls)
    if (c.papel === 'orquestrador') {
      const prontos = liberados(plano, specs, execucao)
      const publicados = (plano.specs || []).filter(s => specs[s.id]?.etapa === 'branch-publicada' && specs[s.id]?.validacao?.sha !== specs[s.id]?.headSha).map(s => s.id)
      const fechar = aFechar(plano, specs, execucao)
      const txt = [
        publicados.length ? `validar: ${publicados.join(', ')}` : '',
        fechar.length ? `fechar: ${fechar.join(', ')}` : '',
        prontos.length ? `liberado: ${prontos.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      const antes = (await $.state.get(FAIXA)).value ?? null
      if (txt && txt !== antes) $.ui.toast(`NOVARC ${txt}`)
      await $.state.set(FAIXA, txt || null)
    } else if (c.conjunto) {
      const cj = (plano.conjuntos || []).find(x => x.id === c.conjunto)
      if (cj) await $.state.set(FAIXA, faixaConjunto(cj, estadoConjunto(cj, specs, execucao[cj.id])))
    }
  } catch {
    // reading failed (login, network): keep the last band
  }
}

let poll: { cancel: () => void } | null = null

/** Turns this session into the orchestrator view; `url` comes from the skill args when the repo has no artefato.txt. */
async function orquestrar($: any, url: string | null): Promise<void> {
  const atual = ((await $.state.get(CTX)).value ?? null) as Contexto | null
  if (atual?.artefato) {
    await $.state.set(CTX, { ...atual, papel: 'orquestrador' })
  } else if (url) {
    const plano = await lerPlano($, url)
    if (plano) await $.state.set(CTX, { artefato: url, plano, conjunto: null, spec: null, papel: 'orquestrador' })
  }
  if (!poll) poll = $.clock.every(5 * 60 * 1000, () => atualizar($))
}

export const registerMaestro: Register = on => {

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'maestro', description: 'Painel de execução NOVARC (use "orquestrar" na sessão orquestradora)' })
    const artefato = await acharArtefato($, e.cwd)
    if (!artefato) return r
    const tools = (await $.tool.list()).map((t: { name: string }) => t.name)
    if (!tools.includes('ArtifactData')) return r
    let plano: Plano | null = null
    try {
      plano = await lerPlano($, artefato)
    } catch {
      return r
    }
    if (!plano) return r
    const { stdout } = await $.process.run(['git', 'branch', '--show-current'], { cwd: e.cwd })
    const spec = specDaBranch(stdout.trim(), plano)
    await $.state.set(CTX, { artefato, plano, conjunto: spec ? spec.conjunto : null, spec: spec ? spec.id : null, papel: spec ? 'conjunto' : null })
    await atualizar($)
    return r
  })

  on('command.run', { command: 'maestro' }, async ($, e) => {
    const args = e.args.trim()
    if (args.startsWith('orquestrar')) await orquestrar($, urlOrquestrar(args))
    await atualizar($)
    await $.ui.open({ id: PANE, title: 'Maestro' })
    return { text: args.startsWith('orquestrar') ? 'Painel aberto; esta sessão acompanha os conjuntos a cada 5 minutos.' : 'Painel de execução aberto.' }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    try {
      const c = ((await $.state.get(CTX)).value ?? null) as Contexto | null
      if (!c || !c.artefato || !c.plano) return ran
      const cmd = String(e.command)
      const pushed = branchDoPush(cmd)
      if (pushed) {
        const s = specDaBranch(pushed, c.plano as Plano)
        if (s) {
          const sha = await $.process.run(['git', 'rev-parse', pushed])
          await marco($, c.artefato, s.id, 'branch-publicada', { branch: pushed, headSha: sha.stdout.trim() })
          await atualizar($)
        }
      } else if (/\bgh\s+pr\s+create\b/.test(cmd)) {
        const pr = urlDoPr(String(ran.text ?? ''))
        const head = cmd.match(/--head\s+(\S+)/)
        const branch = head ? head[1] : (await $.process.run(['git', 'branch', '--show-current'])).stdout.trim()
        const s = specDaBranch(branch, c.plano as Plano)
        if (s && pr) {
          await marco($, c.artefato, s.id, 'pr-aberto', { pr })
          await atualizar($)
        }
      } else if (/\bgit\s+(checkout|switch)\b/.test(cmd)) {
        await atualizar($)
      }
    } catch {
      // a failed milestone write never breaks the command; the skills reconcile from git and the ledger
    }
    return ran
  }).catch(($, e, next) => next(e))

  // The orchestrator skill turns the view on by itself: no need to also run /maestro orquestrar.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) return ran
    try {
      const url = urlOrquestrar(String((e as any).args ?? ''))
      if (url && String((e as any).skill ?? '').endsWith('novarc-session-build')) {
        await orquestrar($, url)
        await atualizar($)
      }
    } catch {
      // the view is a convenience: a failed read never breaks the skill
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const txt = (await $.state.get(FAIXA)).value
    if (!txt || (e.props as any).hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>NOVARC {txt}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const ls = (await $.state.get(LINHAS)).value ?? []
    return (
      <Box flexDirection="column">
        {ls.length === 0 && <Text dimColor>Nenhum conjunto encontrado nesta sessão.</Text>}
        {ls.map(l => (
          <Text>{l}</Text>
        ))}
      </Box>
    )
  })
}
