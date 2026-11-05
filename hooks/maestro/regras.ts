// C06-S01: the NOVARC rules files the mod installs in the person's home, and the import lines in their CLAUDE.md.
// Pure text helpers: the callers read and write the files.

export const NOVARC_MD = `# NOVARC rules (installed by the novarc plugin's Maestro mod)

## Skills
- \`novarc-session-build\`: builds one set of specs from a planning artifact, or orchestrates the sets (skills/novarc-session-build/SKILL.md).
- \`novarc-session-end\`: closes a finished branch with the PR, the merge and the cleanup (skills/novarc-session-end/SKILL.md).
- \`novarc-codex-review\`: adversarial review of a plan by a second model before any code (skills/novarc-codex-review/SKILL.md).

## Maestro mod
- hooks/maestro/register.tsx draws the run, the locks and the pendings, and relays the orchestrator's messages.
- \`/maestro orquestrar <url>\`: opens the orchestrator for a planning artifact.
- \`/maestro ativar\` and \`/maestro desativar\`: show or hide the Maestro band.
- \`/maestro pausar\`: stops everything the continuous mode does alone.
- \`/maestro retomar\`: resumes the continuous mode with the scope granted before.
- \`/maestro regras remover\`: removes these rules and their import lines.
- \`/maestro continuo habilitar\`: adds the continuous-mode exception to your CLAUDE.md.

## Process
- Commit, open a pull request and merge only through a skill the person invokes.
- The set prompt's \`Fechamento:\` line is the close-out authorization for that set.
- Only the set session talks to the orchestrator; spec sessions never do.
- Never squash, force-push or rewrite history.
- The continuous-mode exception lives only in NOVARC-CONTINUO.md, added by \`/maestro continuo habilitar\`.
`

export const NOVARC_CONTINUO_MD = '# NOVARC continuous-mode exception\n\n' + "- **Exception: Maestro continuous mode, per orchestrator.** When the person who owns this CLAUDE.md authorizes continuous mode for one NOVARC orchestration (in that orchestrator session, by \"orquestra contínuo\" or the Maestro authorization card), the authorization is recorded in that planning artifact's database with its scope (sets, phases, merge, migrations, deploys), the date and who granted it. Within that execution only, a set session that received the orchestrator's `FECHA` may run `/novarc-session-end` for that set's own branches as if the person who owns this CLAUDE.md had invoked it, and the orchestrator may send the directives the protocol already defines (GO, MERGE-OK (after the click of the person who owns this CLAUDE.md only when the profile requires it), LIBERA). Never above the project profile's ceiling, never outside that set's branches, never for a repository whose CLAUDE.md requires per-action authorization; a merge the profile marks as requiring a human click waits for it. Outside a recorded authorization, \"never chained autonomously\" holds in full. Force-push, squash, history rewriting and anything the session-end itself forbids stay forbidden." + '\n'

const IMPORTS = ['@NOVARC.md', '@NOVARC-CONTINUO.md']
const fim = (texto: string) => (texto.includes('\r\n') ? '\r\n' : '\n')
const linhas = (texto: string) => texto.match(/[^\n]*\n|[^\n]+$/g) ?? []

/** Which import lines the CLAUDE.md holds: whole lines, trimmed. */
export function importsRegras(texto: string | null | undefined): { novarc: boolean; continuo: boolean } {
  const l = new Set((texto ?? '').split(/\r?\n/).map(s => s.trim()))
  return { novarc: l.has(IMPORTS[0]), continuo: l.has(IMPORTS[1]) }
}

/** Appends the import line once, in the file's own line ending. */
export function comImport(texto: string, linha: '@NOVARC.md' | '@NOVARC-CONTINUO.md'): string {
  if (linhas(texto).some(l => l.trim() === linha)) return texto
  const e = fim(texto)
  return (texto && !texto.endsWith('\n') ? texto + e : texto) + linha + e
}

/** Drops the two import lines and nothing else, every other byte kept. */
export function semImports(texto: string): string {
  return linhas(texto).filter(l => !IMPORTS.includes(l.trim())).join('')
}

export type LidosRegras = { novarc: string | null; continuo: string | null; claude: string | null; instalado: boolean }

/** What a session start writes: first install (rules, then the import), or a refresh of the rules files only (A20, R23). */
export function regrasNoInicio(l: LidosRegras): { escrever: { arquivo: 'NOVARC.md' | 'NOVARC-CONTINUO.md' | 'CLAUDE.md'; texto: string }[]; toast: string | null } {
  const escrever: { arquivo: 'NOVARC.md' | 'NOVARC-CONTINUO.md' | 'CLAUDE.md'; texto: string }[] = []
  if (l.novarc !== NOVARC_MD) escrever.push({ arquivo: 'NOVARC.md', texto: NOVARC_MD })
  if (l.continuo !== null && l.continuo !== NOVARC_CONTINUO_MD) escrever.push({ arquivo: 'NOVARC-CONTINUO.md', texto: NOVARC_CONTINUO_MD })
  if (!l.instalado) {
    const claude = comImport(l.claude ?? '', '@NOVARC.md')
    if (claude !== l.claude) escrever.push({ arquivo: 'CLAUDE.md', texto: claude })
    return { escrever, toast: 'Regras NOVARC incluídas no seu CLAUDE.md' }
  }
  return { escrever, toast: escrever.length ? 'regras NOVARC atualizadas' : null }
}
