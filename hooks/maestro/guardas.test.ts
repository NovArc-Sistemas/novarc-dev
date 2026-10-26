import { expect, test } from 'claude-code/testing'

import { TEXTOS, avaliarArquivo, avaliarBash, fnv1a32, linhaDaGuarda, type ContextoGuarda } from './guardas'

const RAIZ = '/repo/.claude/worktrees/c02-s01'
const LEDGER = '/repo/.novarc/ledger/session-build/20261023-0930'
const SKILL = '/plugin/skills/novarc-session-build'

const ctx: ContextoGuarda = {
  emExecucao: true,
  papel: 'spec',
  conjunto: 'C02',
  sessionEnd: false,
  hold: false,
  locks: [],
  raiz: RAIZ,
  padrao: 'main',
  isentos: ['/repo/.novarc/ledger', '/plugin'],
  cwd: RAIZ,
  ramo: 'feat/c02-s01-alertas-locks-espelho-20261023',
  ledgerDir: null,
}

const com = (o: Partial<ContextoGuarda>): ContextoGuarda => ({ ...ctx, ...o })
const nivel = (cmd: string, c: ContextoGuarda = ctx) => avaliarBash(cmd, c).nivel
const texto = (cmd: string, c: ContextoGuarda = ctx) => avaliarBash(cmd, c).texto
const ANINHADO = 'Bloqueado pelo Maestro. Comando aninhado demais para a guarda conferir (invariante do session-build: nenhum bypass).'
const A3 = 'Bloqueado pelo Maestro. --no-verify impede o hook de rodar (invariante do session-build: nenhum bypass).'

test('block texts are the interface.md strings verbatim', async () => {
  expect(TEXTOS.pr).toBe('Bloqueado pelo Maestro. Sessão de spec não abre PR (invariante do session-build). Dê DONE; o PR é da sessão do conjunto no fechamento.')
  expect(TEXTOS.merge).toBe('Bloqueado pelo Maestro. Sessão de spec não faz merge de entrega (invariante do session-build). O merge é do fechamento.')
  expect(TEXTOS.bypass('--no-verify')).toBe(A3)
  expect(TEXTOS.force).toBe('Bloqueado pelo Maestro. push --force reescreve a branch publicada (invariante do session-build).')
  expect(TEXTOS.apagar).toBe('Bloqueado pelo Maestro. Apagar branch ou worktree é do fechamento (invariante do session-build).')
  expect(TEXTOS.ledger).toBe('Bloqueado pelo Maestro. O ledger só se escreve pelo ledger.py (fork-contract).')
  expect(TEXTOS.aninhado).toBe(ANINHADO)
})

test('A1: PR creation and merges into the default branch are blocked', async () => {
  const d = avaliarBash('gh pr create --base main', ctx)
  expect(d.nivel).toBe('bloqueia')
  expect(d.texto).toBe(TEXTOS.pr)
  expect(d.regra).toBe('core SKILL.md:69')
  expect(texto('gh pr merge 12')).toBe(TEXTOS.merge)
  expect(texto('git checkout main && git merge feat/x')).toBe(TEXTOS.merge)
  expect(texto('git switch main; git merge feat/x')).toBe(TEXTOS.merge)
  expect(texto('git push origin feat/x:main')).toBe(TEXTOS.merge)
  expect(nivel('git merge origin/main')).toBe(null)
  expect(texto('GH_TOKEN=x gh pr create')).toBe(TEXTOS.pr)
  expect(texto('gh -R org/repo pr create')).toBe(TEXTOS.pr)
})

test('A2: forced pushes are blocked', async () => {
  const d = avaliarBash('git push --force origin feat/c02-s01-alertas-locks-espelho-20261023', ctx)
  expect(d.texto).toBe(TEXTOS.force)
  expect(d.regra).toBe('core SKILL.md:69')
  expect(d.linha).toBe('git push --force')
  expect(texto('git push -f origin x')).toBe(TEXTOS.force)
  expect(texto('git push -uf origin x')).toBe(TEXTOS.force)
  expect(texto('git push --force-with-lease origin x')).toBe(TEXTOS.force)
  expect(texto('git push --force-with-lease=x:abc origin x')).toBe(TEXTOS.force)
  expect(texto('git push origin +feat/x')).toBe(TEXTOS.force)
  expect(nivel('git push -n origin x')).toBe(null)
})

test('A3: hook bypasses are blocked and cite the flag found', async () => {
  const d = avaliarBash('git commit --no-verify -m "wip"', ctx)
  expect(d.texto).toBe(A3)
  expect(d.regra).toBe('core SKILL.md:89')
  expect(texto('git commit -n -m x')).toBe(TEXTOS.bypass('-n'))
  expect(texto('git commit -anm x')).toBe(TEXTOS.bypass('-n'))
  expect(nivel('git commit -mn')).toBe(null)
  expect(texto('git -c core.hooksPath=/dev/null commit -m x')).toBe(TEXTOS.bypass('core.hooksPath'))
  expect(texto('git -c core.hookspath=x commit -m x')).toBe(TEXTOS.bypass('core.hooksPath'))
  expect(texto('git config core.hooksPath /dev/null')).toBe(TEXTOS.bypass('core.hooksPath'))
  expect(nivel('git config --get core.hooksPath')).toBe(null)
  expect(texto('HUSKY=0 git commit -m x')).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto('SKIP_HOOKS=1 git push')).toBe(TEXTOS.bypass('SKIP_HOOKS'))
  expect(texto('git push --no-verify origin x')).toBe(A3)
})

test('A4: branch and worktree deletion is blocked', async () => {
  for (const c of ['git worktree remove ../c02-s02', 'git branch -D x', 'git branch -d x', 'git branch --delete x', 'git branch -Df x', 'git push --delete origin x', 'git push origin :x', 'git push -d origin x']) {
    expect(texto(c)).toBe(TEXTOS.apagar)
  }
  expect(avaliarBash('git branch -d x', ctx).regra).toBe('core SKILL.md:69')
})

test('A5: ledger files are written only through ledger.py', async () => {
  const d = avaliarBash(`echo "DONE x" >> ${LEDGER}/fork-c02-s01-alertas-locks-espelho.md`, ctx)
  expect(d.texto).toBe(TEXTOS.ledger)
  expect(d.regra).toBe('step-05 :54')
  expect(d.linha).toBe('echo >>')
  expect(texto(`tee -a ${LEDGER}/ledger.md`)).toBe(TEXTOS.ledger)
  expect(texto('cat x > ledger.md')).toBe(TEXTOS.ledger)
  expect(texto('cat x 1> ledger.md')).toBe(TEXTOS.ledger)
  expect(texto('cat x &>> "C:\\repo\\ledger.md"')).toBe(TEXTOS.ledger)
  expect(nivel(`python ${SKILL}/scripts/ledger.py append --dir ${LEDGER} --fork c02-s01 --type TASK --text "4 2/5"`)).toBe(null)
  expect(nivel(`cat ${LEDGER}/ledger.md 2>&1`)).toBe(null)
})

test('A6 and R8: flags count by argument position, not by quoting', async () => {
  expect(nivel('git commit -m "docs: explain why --no-verify is forbidden"')).toBe(null)
  expect(nivel('echo "gh pr create"')).toBe(null)
  expect(nivel('grep -- --force file')).toBe(null)
  expect(texto('git push "--force" origin x')).toBe(TEXTOS.force)
  expect(texto("git push '-f' origin x")).toBe(TEXTOS.force)
  expect(nivel('git commit -m "--force"')).toBe(null)
  expect(nivel('git commit --message=--no-verify')).toBe(null)
  expect(nivel('git log -- --force')).toBe(null)
  expect(nivel('git commit -F msg.txt')).toBe(null)
})

test('Review Focus 1: a heredoc commit message never blocks', async () => {
  const msg = "git commit -m \"$(cat <<'EOF'\nfeat: don't use git push --force or --no-verify\n\ngh pr create is the set's job\nEOF\n)\""
  expect(nivel(msg)).toBe(null)
  expect(nivel("cat <<'EOF' > notes.txt\ngit push --force\nEOF\ngit status")).toBe(null)
  expect(texto('cat <<EOF\n$(git push --force origin x)\nEOF')).toBe(TEXTOS.force)
  expect(texto("cat <<'EOF'\nx\nEOF\ngit push -f origin x")).toBe(TEXTOS.force)
})

test('A7: session-end lets PR, merge and deletion run, never a bypass', async () => {
  const fim = com({ sessionEnd: true })
  expect(nivel('gh pr create', fim)).toBe(null)
  expect(nivel('gh pr merge 12', fim)).toBe(null)
  expect(nivel('git branch -d x', fim)).toBe(null)
  expect(nivel('git worktree remove x', fim)).toBe(null)
  expect(nivel('git worktree remove ../c02-s02', fim)).toBe('avisa') // the path warning stays
  expect(texto('git push --no-verify', fim)).toBe(A3)
  expect(texto('git push --force origin x', fim)).toBe(TEXTOS.force)
})

test('warnings: HOLD, migration lock, default branch push and paths outside the worktree', async () => {
  const h = avaliarBash('git commit -m x', com({ hold: true }))
  expect(h.nivel).toBe('avisa')
  expect(h.texto).toBe('Aviso do Maestro: commit durante HOLD de C02. Feito, mas o orquestrador não liberou.')
  expect(h.regra).toBe('conjunto-overrides HOLD')
  const MIG = 'Aviso do Maestro: migração sem LOCK. Peça o LOCK antes de aplicar.'
  for (const c of ['supabase db push', 'supabase migration up', 'prisma migrate deploy', 'npx prisma migrate deploy']) {
    expect(avaliarBash(c, ctx).texto).toBe(MIG)
    expect(nivel(c, com({ locks: ['migration'] }))).toBe(null)
  }
  expect(avaliarBash('supabase db push', ctx).regra).toBe('step-05 §5.4')
  const f = avaliarBash('ls /repo/hooks', ctx)
  expect(f.nivel).toBe('avisa')
  expect(f.texto).toBe('Aviso do Maestro: comando fora do worktree do conjunto (/repo/hooks).')
  expect(f.regra).toBe('session-contract.md:99-103')
  const p = avaliarBash('git push origin main', ctx)
  expect(p.texto).toBe('Aviso do Maestro: push direto na branch principal main.')
  expect(p.regra).toBe('session-contract.md:67')
  expect(nivel('ls /repo/.novarc/ledger/session-build')).toBe(null)
  expect(nivel(`ls ${RAIZ}/hooks`)).toBe(null)
  expect(nivel('ls /repo/.claude/worktrees/c02-s01-foo')).toBe('avisa')
  expect(nivel('git status > /dev/null 2>&1')).toBe(null)
  expect(nivel('git commit -m x', com({ hold: false }))).toBe(null)
})

test('A11: outside a run nothing is judged', async () => {
  expect(avaliarBash('git push --force', com({ emExecucao: false }))).toEqual({ nivel: null, regra: '', texto: '', linha: '' })
  expect(avaliarArquivo(`${LEDGER}/ledger.md`, com({ emExecucao: false })).nivel).toBe(null)
})

test('Review Focus 2: one forbidden segment of a chain blocks the whole call', async () => {
  const d = avaliarBash('git add . && git commit -m x && git push --force', ctx)
  expect(d.texto).toBe(TEXTOS.force)
  expect(d.linha).toBe('git push --force')
  expect(texto('git status | cat; git push -f origin x &')).toBe(TEXTOS.force)
  expect(texto('(cd sub && git push -f)')).toBe(TEXTOS.force)
})

test('Review Focus 3: env prefixes are recognised and never reach linha', async () => {
  expect(linhaDaGuarda('GH_TOKEN=x git push --force origin b', '--force')).toBe('git push --force')
  expect(avaliarBash('GH_TOKEN=x git push --force origin b', ctx).linha).toBe('git push --force')
  expect(avaliarBash('GH_TOKEN=x gh pr create --base main', ctx).linha).toBe('gh pr create')
  const h = avaliarBash('HUSKY=0 git commit -m x', ctx)
  expect(h.linha).toBe('git commit HUSKY')
  expect(h.linha.includes('=')).toBe(false)
})

test('Review Focus 6 and R5-3: nested interpreters are judged to depth 3', async () => {
  expect(texto("bash -c 'git push --force origin x'")).toBe(TEXTOS.force)
  expect(texto('sh -c "gh pr create"')).toBe(TEXTOS.pr)
  expect(texto("bash -lc 'git push -f origin x'")).toBe(TEXTOS.force)
  expect(texto('eval "git commit --no-verify -m x"')).toBe(A3)
  expect(texto('echo $(git push -f origin x)')).toBe(TEXTOS.force)
  expect(texto('echo `git push -f origin x`')).toBe(TEXTOS.force)
  expect(texto('echo "$(git push -f origin x)"')).toBe(TEXTOS.force)
  expect(nivel("bash -c 'echo --force'")).toBe(null)
  const q = (s: string) => `bash -c '${s.replace(/'/g, `'\\''`)}'`
  const forca = 'git push --force origin x'
  expect(texto(q(q(q(forca))))).toBe(TEXTOS.force)
  const d = avaliarBash(q(q(q(q(forca)))), ctx)
  expect(d.texto).toBe(ANINHADO)
  expect(d.regra).toBe('core SKILL.md:89')
  expect(texto('eval eval eval git push --force origin x')).toBe(TEXTOS.force)
  expect(texto('eval eval eval eval git push --force origin x')).toBe(ANINHADO)
  expect(texto(`eval "echo 'x"`)).toBe(ANINHADO)
  expect(texto('bash -c')).toBe(ANINHADO)
})

test('R9 and R10: wrappers and git global options do not hide the invocation', async () => {
  expect(texto('env HUSKY=0 git commit -m x')).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto('env git push --force')).toBe(TEXTOS.force)
  expect(texto('timeout 60 git push -f origin x')).toBe(TEXTOS.force)
  expect(texto('git -C ../repo push --force origin x')).toBe(TEXTOS.force)
  expect(nivel('env FOO=1 git status')).toBe(null)
  expect(texto('command -p git push -f origin x')).toBe(TEXTOS.force)
  expect(texto('git --config-env=core.hooksPath=TEMP commit -m x')).toBe(TEXTOS.bypass('core.hooksPath'))
  expect(texto('git --config-env core.hooksPath=TEMP commit -m x')).toBe(TEXTOS.bypass('core.hooksPath'))
  expect(texto('/usr/bin/git push --force origin x')).toBe(TEXTOS.force)
  expect(texto('git.exe push -f')).toBe(TEXTOS.force)
  expect(texto('"C:\\Program Files\\Git\\cmd\\git.exe" push -f')).toBe(TEXTOS.force)
  expect(texto('sudo -u u git push --force')).toBe(TEXTOS.force)
  expect(nivel('echo git status')).toBe(null)
  expect(nivel('grep -r "git" .')).toBe(null)
})

test('R11 and R12: every git word is a candidate, an undetermined one is a mention', async () => {
  expect(texto('env -u git git push --force origin x')).toBe(TEXTOS.force)
  expect(texto('echo git push --force')).toBe(TEXTOS.force)
  expect(nivel('echo "git push --force"')).toBe(null)
  expect(nivel('git commit -m "git push --force"')).toBe(null)
  expect(nivel('echo "git"')).toBe(null)
  expect(nivel('echo git')).toBe(null)
})

test('R12: relative paths resolve against the cwd moved by cd', async () => {
  expect(texto('ls ..')).toBe('Aviso do Maestro: comando fora do worktree do conjunto (/repo/.claude/worktrees).')
  expect(nivel('cd .. && ls hooks')).toBe('avisa')
  expect(texto('cd /repo && ls ./hooks')).toBe('Aviso do Maestro: comando fora do worktree do conjunto (/repo).')
  expect(nivel('ls ./hooks')).toBe(null)
  expect(nivel('cd hooks && ls ../src')).toBe(null)
  expect(nivel('ls ../../c02-s02/x')).toBe('avisa')
  const win = com({ raiz: 'C:/dev/repo/.claude/worktrees/c02-s01', cwd: 'C:/dev/repo/.claude/worktrees/c02-s01', isentos: [] })
  expect(nivel('ls \"C:\\dev\\repo\\.claude\\worktrees\\c02-s01\\hooks\"', win)).toBe(null)
  expect(nivel('ls /c/dev/repo/.claude/worktrees/c02-s01/hooks', win)).toBe(null)
  expect(texto('ls /c/dev/repo/hooks', win)).toBe('Aviso do Maestro: comando fora do worktree do conjunto (C:/dev/repo/hooks).')
  expect(nivel('ls /repo/hooks', com({ raiz: null }))).toBe(null)
})

test('blocks win over warnings', async () => {
  expect(texto('ls /repo/hooks && git push --force origin x')).toBe(TEXTOS.force)
  expect(texto('git push --force origin main')).toBe(TEXTOS.force)
})

test('avaliarArquivo blocks only ledger files', async () => {
  const d = avaliarArquivo('/repo/.novarc/ledger/session-build/r/fork-x.md', ctx)
  expect(d.nivel).toBe('bloqueia')
  expect(d.texto).toBe(TEXTOS.ledger)
  expect(d.regra).toBe('step-05 :54')
  expect(avaliarArquivo('/repo/.novarc/ledger/session-build/r/ledger.md', ctx).texto).toBe(TEXTOS.ledger)
  expect(avaliarArquivo('C:\\repo\\x\\ledger.md', ctx).texto).toBe(TEXTOS.ledger)
  expect(avaliarArquivo('/repo/hooks/maestro/a.ts', ctx).nivel).toBe(null)
})

test('final fix 1: a merge from a session already on the default branch is blocked; session-end lets it run', async () => {
  expect(texto('git merge feat/x', com({ ramo: 'main' }))).toBe(TEXTOS.merge)
  expect(nivel('git merge feat/x', com({ ramo: 'feat/x' }))).toBe(null)
  expect(nivel('git merge feat/x', com({ ramo: 'main', sessionEnd: true }))).toBe(null)
  expect(nivel('git merge feat/x', com({ ramo: null }))).toBe(null)
  expect(nivel('git checkout feat/y && git merge feat/x', com({ ramo: 'main' }))).toBe(null)
})

test('final fix 2: fork-*.md is a ledger only under a ledger root or the session ledger dir; ledger.md anywhere', async () => {
  expect(avaliarArquivo('/plugin/skills/novarc-session-build/core/references/fork-contract.md', ctx).nivel).toBe(null)
  expect(avaliarArquivo('skills/novarc-session-build/core/references/fork-contract.md', ctx).nivel).toBe(null)
  expect(avaliarArquivo('/repo/.novarc/ledger/session-build/r/fork-c02-s01-x.md', ctx).texto).toBe(TEXTOS.ledger)
  expect(avaliarArquivo('C:\\repo\\.superpowers\\novarc-orq\\r\\fork-x.md', ctx).texto).toBe(TEXTOS.ledger)
  expect(avaliarArquivo('/runs/r1/fork-x.md', com({ ledgerDir: '/runs/r1' })).texto).toBe(TEXTOS.ledger)
  expect(avaliarArquivo('/runs/r1/fork-x.md', ctx).nivel).toBe(null)
  expect(avaliarArquivo('/any/where/ledger.md', ctx).texto).toBe(TEXTOS.ledger)
  expect(texto('echo x >> /repo/.novarc/ledger/session-build/r/fork-x.md')).toBe(TEXTOS.ledger)
  expect(nivel(`echo x >> ${RAIZ}/skills/novarc-session-build/core/references/fork-contract.md`)).toBe(null)
  expect(nivel(`cat a | tee ${RAIZ}/docs/fork-contract.md`)).toBe(null)
  expect(texto('cat a | tee /repo/.novarc/ledger/session-build/r/fork-x.md')).toBe(TEXTOS.ledger)
  expect(texto('echo x >> fork-x.md', com({ cwd: '/repo/.novarc/ledger/session-build/r' }))).toBe(TEXTOS.ledger)
  expect(nivel('echo x >> fork-x.md')).toBe(null)
  expect(texto('echo x >> $DIR/fork-x.md')).toBe(TEXTOS.ledger) // a dynamic path may be a ledger: blocked by name
})

test('fnv1a32 gives 8 hex chars', async () => {
  expect(fnv1a32('')).toBe('811c9dc5')
  expect(fnv1a32('a')).toBe('e40c292c')
  expect(fnv1a32('foobar')).toBe('bf9cf968')
})

test('review fix 1: nested commands inherit the bypass env, the default-branch checkout and the cwd', async () => {
  expect(texto("HUSKY=0 bash -c 'git commit -m x'")).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto('env SKIP_HOOKS=1 sh -c "git push"')).toBe(TEXTOS.bypass('SKIP_HOOKS'))
  expect(texto('HUSKY=0 eval "git commit"')).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto("git checkout main && bash -c 'git merge x'")).toBe(TEXTOS.merge)
  expect(texto("bash -c 'git checkout main' && git merge x")).toBe(TEXTOS.merge)
  expect(nivel("cd .. && bash -c 'ls hooks/x'")).toBe('avisa')
  expect(texto('cd .. && echo $(ls ./a)')).toBe('Aviso do Maestro: comando fora do worktree do conjunto (/repo/.claude/worktrees).')
})

test('review fix 2: the default-branch checkout resets and ignores branch creation and file checkout', async () => {
  expect(nivel('git checkout main && git checkout feat/x && git merge y')).toBe(null)
  expect(nivel('git checkout -b feat main && git merge y')).toBe(null)
  expect(nivel('git switch -c feat main && git merge y')).toBe(null)
  expect(nivel('git checkout main -- file && git merge y')).toBe(null)
  expect(texto('git checkout feat/x && git checkout main && git merge y')).toBe(TEXTOS.merge)
})

test('review fix 3: bypass env counts only as a prefix assignment or through env/export', async () => {
  expect(nivel('HUSKY=1 git commit -m x')).toBe(null)
  expect(nivel('grep HUSKY=0 f && git status')).toBe(null)
  expect(nivel('echo SKIP_HOOKS=1 && git push origin x')).toBe(null)
  expect(texto('export HUSKY=0; git commit -m x')).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto('HUSKY=0; git commit -m x')).toBe(TEXTOS.bypass('HUSKY'))
  expect(texto('GIT_CONFIG_PARAMETERS="core.hooksPath=/x" git commit -m x')).toBe(TEXTOS.bypass('core.hooksPath'))
})

test('review fix 4: tee writes a ledger only as the command word', async () => {
  expect(nivel('grep tee ledger.md')).toBe(null)
  expect(texto('echo x | tee -a ledger.md')).toBe(TEXTOS.ledger)
  expect(texto('echo x | sudo tee ledger.md')).toBe(TEXTOS.ledger)
})


// ---- integration (Task 2): the guard before next in the Bash, Write and Edit hooks, driven through the mod

import { BUILD, URL as URL_MUNDO, dormir, gravar, iniciar, montar, quieto, textoNo, todos, type Mundo } from './mundo-teste'

const SPEC_BR = 'feat/c01-s01-olhos-20261026'
const RAIZ_W = '/repo/.claude/worktrees/c01-s01-olhos-20261026'
const LDIR = '/repo/.novarc/ledger/session-build/20261026-0900'
const FORK_MD = `${LDIR}/fork-c01-s01-olhos.md`
const LOG_SEM = 'maestro: guarda sem estado, comando liberado'
// every test loads the plugin: a loaded host makes the first load alone pass 5 s
const LENTO = { timeoutMs: 20_000 }
/** The deny as the test's $.tool.call reads it: `{ deny }` or the errored result carrying it as text. */
const negado = (r: any) => r?.deny ?? (r?.isError ? r.text : undefined)
/** The guard's warning: the last `context` line of the result, the part the model reads. */
const aviso = (r: any) => (r?.context ?? []).at(-1)
const rodou = (m: Mundo, tool: string, campo: string, v: string) => m.tools.some((t: any) => t.tool === tool && (t[campo] ?? t.input?.[campo]) === v)

/** A spec session of C01 in a planned run: artefato.txt, the plan, and `execucao/C01` holding `data`. */
async function comBanco($: any, on: any, data: any) {
  const m = montar(on, {}, SPEC_BR, true)
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL_MUNDO}\n`)
  m.db = { 'execucao/C01': { data, version: 1 } }
  await iniciar($)
  await quieto(m)
  return m
}

/** Stamps the moment the call reaches the tests' hooks, i.e. the moment the mod's guard called `next`. */
function carimbo(on: any, tool = 'Bash') {
  const t = { entrou: 0 }
  on('tool.call', { tool }, async ($: any, e: any, next: any) => {
    t.entrou = performance.now()
    return next(e)
  })
  return t
}

/**
 * Best of 5 times from `$.tool.call` to the tests' hook, minus the same for `Read` (a tool the mod never hooks): what is
 * left is the mod's own cost before `next`, without the engine's dispatch (PreToolUse sits between the mod and the tests).
 */
async function antesDoNext($: any, chamada: any, t: { entrou: number }, leitura: { entrou: number }, cada?: (r: any) => void): Promise<number> {
  const melhor = async (c: any, s: { entrou: number }, f?: (r: any) => void) => {
    const ts: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      const r = await $.tool.call(c)
      ts.push(s.entrou - t0)
      f?.(r)
    }
    return Math.min(...ts)
  }
  const base = await melhor({ tool: 'Read', file_path: 'C:/repo/x' }, leitura)
  return (await melhor(chamada, t, cada)) - base
}

test('A1, A2: in a spec session PR creation and push --force are denied before the tool runs', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git push --force origin x' }))).toBe(TEXTOS.force)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y' }))).toBe(TEXTOS.pr)
  expect(m.tools.some((t: any) => t.tool === 'Bash')).toBe(false)
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(rodou(m, 'Bash', 'command', 'git status')).toBe(true)
})

test('A5: Write and Edit on a ledger file are denied; ledger.py append runs', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  expect(negado(await $.tool.call({ tool: 'Edit', file_path: FORK_MD, old_string: 'a', new_string: 'b' }))).toBe(TEXTOS.ledger)
  expect(negado(await $.tool.call({ tool: 'Write', file_path: `${LDIR}/ledger.md`, content: 'x' }))).toBe(TEXTOS.ledger)
  expect(m.tools.some((t: any) => t.tool === 'Edit' || t.tool === 'Write')).toBe(false)
  const ap = `python /plugin/skills/novarc-session-build/scripts/ledger.py append --dir ${LDIR} --fork c01-s01-olhos --type TASK --text "4 2/5"`
  await $.tool.call({ tool: 'Bash', command: ap })
  expect(rodou(m, 'Bash', 'command', ap)).toBe(true)
  await $.tool.call({ tool: 'Write', file_path: 'C:/repo/hooks/x.ts', content: 'x' })
  expect(rodou(m, 'Write', 'file_path', 'C:/repo/hooks/x.ts')).toBe(true)
})

test('A7: session-end started by the Skill tool lets gh pr create run; --no-verify stays denied', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-end', args: '' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y' })
  expect(rodou(m, 'Bash', 'command', 'gh pr create --title x --body y')).toBe(true)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git push --no-verify' }))).toBe(A3)
})

test('A7: a set session (conjunto role) is denied gh pr create until session-end runs', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `conjunto ${URL_MUNDO} C01` })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' }))).toBe(TEXTOS.pr)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-end', args: '' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' })
  expect(rodou(m, 'Bash', 'command', 'gh pr create --title x')).toBe(true)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git push --no-verify' }))).toBe(A3)
})

test('A7: /novarc-session-end typed by the person sets the flag; the same command from a peer does not', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  const cmd = { name: 'novarc:novarc-session-end', args: '' }
  await $.prompt.submit?.({ text: '/novarc:novarc-session-end', origin: { kind: 'peer' }, command: cmd })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' }))).toBe(TEXTOS.pr)
  await $.prompt.submit?.({ text: '/novarc:novarc-session-end', origin: { kind: 'composer' }, command: cmd })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x' })
  expect(rodou(m, 'Bash', 'command', 'gh pr create --title x')).toBe(true)
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git push --no-verify' }))).toBe(A3)
})

test('A8: a commit during HOLD runs, the warning reaches the model through context and one toast shows it', LENTO, async ($: any, on: any) => {
  const m = await comBanco($, on, { bloqueios: { hold: { at: 'x' } } })
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  expect(rodou(m, 'Bash', 'command', 'git commit -m "feat: x"')).toBe(true)
  expect(aviso(r)).toBe(TEXTOS.hold('C01'))
  expect(r.text).toBe('ok')
  expect(m.toasts.filter(t => t === TEXTOS.hold('C01')).length).toBe(1)
})

test('A9: a migration without LOCK warns; a relayed GO grants it; the own APPLIED releases it', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'GO c01-s01-olhos phase 4' })
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'GO c01-s01-olhos migration 0042_x.sql' })
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(undefined)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir /repo/l --fork c01-s01-olhos --type APPLIED --text "0042_x.sql"' })
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
  expect(m.toasts.filter(t => t === TEXTOS.migracao).length).toBe(3)
})

test('A9: a RELEASE ledger call whose tool errored still frees the lock', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.falharTool = (e: any) => e.tool === 'Bash' && String(e.command ?? e.input?.command).includes('RELEASE')
  await iniciar($)
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'GO c01-s01-olhos migration 0042_x.sql' })
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(undefined)
  await $.tool.call({ tool: 'Bash', command: 'python ledger.py append --dir /repo/l --fork c01-s01-olhos --type RELEASE --text "migration 0042_x.sql"' })
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
})

test('A10: with a known worktree root, a path outside it and a push to the default branch warn', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.git = { toplevel: RAIZ_W, origemHead: 'origin/main' }
  await iniciar($)
  const r1 = await $.tool.call({ tool: 'Bash', command: 'ls /repo/hooks' })
  expect(rodou(m, 'Bash', 'command', 'ls /repo/hooks')).toBe(true)
  expect(aviso(r1)).toBe('Aviso do Maestro: comando fora do worktree do conjunto (/repo/hooks).')
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'git push origin main' }))).toBe('Aviso do Maestro: push direto na branch principal main.')
  expect(aviso(await $.tool.call({ tool: 'Bash', command: `ls ${RAIZ_W}/hooks` }))).toBe(undefined)
})

test('the first ledger.py call, before the ledger dir is known, raises no outside-the-worktree warning', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.git = { toplevel: RAIZ_W, origemHead: 'origin/main' }
  await iniciar($)
  for (const cmd of [
    `python ledger.py init --dir ${LDIR} --run-id 20261026-0900`,
    'python ledger.py append --dir /elsewhere/runs/x --fork c01-s01-olhos --type TASK --text "1 1/3"',
    'cat /repo/.superpowers/session-build/20261026-0900/ledger.md',
    'cat /repo/.superpowers/novarc-orq/20261026-0900/ledger.md',
  ])
    expect(aviso(await $.tool.call({ tool: 'Bash', command: cmd }))).toBe(undefined)
  expect(m.toasts.length).toBe(0)
})

test('A11, R38: on main with no run Bash, Write and Edit pass untouched, 0 $ calls besides next, guard under 2 ms', LENTO, async ($: any, on: any) => {
  const ts: Record<string, { entrou: number }> = Object.fromEntries(['Bash', 'Write', 'Edit', 'Read'].map(x => [x, carimbo(on, x)]))
  const m = montar(on, {}, 'main')
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'git status' }) // warm-up
  await quieto(m)
  for (const chamada of [
    { tool: 'Bash', command: 'git push --force' },
    { tool: 'Write', file_path: FORK_MD, content: 'x' },
    { tool: 'Edit', file_path: FORK_MD, old_string: 'a', new_string: 'b' },
  ]) {
    const n = m.eventos.length
    const custo = await antesDoNext($, chamada, ts[chamada.tool]!, ts.Read!, r => {
      expect(r.text).toBe('ok')
      expect(r.context).toBe(undefined)
    })
    expect(m.eventos.slice(n).filter(x => !x.e?.tool_use_id).length).toBe(0)
    expect(custo).toBeLessThan(2)
  }
})

test('A12: a context that cannot be built lets the commit run and logs one line', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.servirEstado = { exec: { papel: 'spec', ledgerDir: 5, forks: {}, conjunto: 'C01', spec: 'C01-S01' } } // a corrupt run state
  await iniciar($)
  await quieto(m)
  const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
  expect(r.text).toBe('ok')
  expect(rodou(m, 'Bash', 'command', 'git commit -m x')).toBe(true)
  expect(m.logs.filter(l => l === LOG_SEM).length).toBe(1)
})

test('A44: with an open HOLD the guard decides under 10 ms with 0 process.run and 0 own tool.call', LENTO, async ($: any, on: any) => {
  const t = carimbo(on)
  const leitura = carimbo(on, 'Read')
  const m = await comBanco($, on, { bloqueios: { hold: { at: 'x' } } })
  await $.tool.call({ tool: 'Bash', command: 'git status' }) // warm-up
  await quieto(m)
  const n = m.eventos.length
  const custo = await antesDoNext($, { tool: 'Bash', command: 'git commit -m x' }, t, leitura, r => expect(aviso(r)).toBe(TEXTOS.hold('C01')))
  expect(custo).toBeLessThan(10)
  const meus = m.eventos.slice(n).map(x => x.e)
  expect(meus.filter(e => Array.isArray(e?.argv)).length).toBe(0)
  expect(meus.filter(e => e?.tool && !e?.tool_use_id).length).toBe(0)
})

test('first call after a reload: no session.start, exec.papel spec in state, git push --force is denied', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  m.servirEstado = { exec: { papel: 'spec', ledgerDir: null, forks: {}, conjunto: 'C01', spec: 'C01-S01' } }
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git push --force origin x' }))).toBe(TEXTOS.force)
  expect(m.eventos.some(x => x.e?.plugin === 'novarc' && x.e?.key === 'exec' && !('value' in x.e))).toBe(true)
  expect(m.tools.some((t: any) => t.tool === 'Bash')).toBe(false)
})

// ---- ToolResult cards for guarded calls (Task 3): A49-A52

const RAZAO_PR = TEXTOS.pr.replace(/^Bloqueado pelo Maestro\. /, '')

async function resultado($: any, surface: string, props: any) {
  const t = await $.ui.mount({ plugin: 'novarc', surface, component: 'ToolResult', props } as any)
  const raiz = await t.drawn()
  await t.unmount()
  return raiz
}
const ehCartao = (r: any) => todos(r).some(n => textoNo(n).includes('Maestro'))

test('A49, A52: a denied call shows the error card on desktop; the terminal carries the same two texts', LENTO, async ($: any, on: any) => {
  montar(on, {}, SPEC_BR)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y', tool_use_id: 'tu-1' })
  const props = { tool_use_id: 'tu-1', tool: 'Bash', output: { stdout: '', stderr: '' }, isErrored: true }
  for (const surface of ['desktop', 'terminal']) {
    const raiz = await resultado($, surface, props)
    const nos = todos(raiz)
    const textos = nos.filter(n => n.type === 'Text').map(textoNo)
    expect(textos).toContain('⛔ Bloqueado pelo Maestro')
    expect(textos).toContain(RAZAO_PR)
    expect(nos.find(n => n.type === 'Text' && textoNo(n) === '⛔ Bloqueado pelo Maestro')!.props.color).toBe('error')
    if (surface === 'desktop') {
      const caixa = nos.find(n => n.type === 'Box' && n.props.borderColor === 'error')!
      expect(caixa.props.backgroundColor).toBe('diffRemovedDimmed')
      expect(nos.some(n => n.type === 'Box' && n.props.width === 0.3 && n.props.backgroundColor === 'error')).toBe(true)
    }
    expect(JSON.stringify(raiz)).not.toMatch(/"#/)
    expect(nos.some(n => n.type === 'Svg')).toBe(false)
    for (const n of nos) for (const c of ['gap', 'paddingX', 'paddingY', 'padding']) if (n.props?.[c] !== undefined) expect(n.props[c]).toMatch(/^(xs|sm|md|lg)$/)
  }
})

test('A50: a warned call shows the first output line and the warning card', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.git = { toplevel: RAIZ_W, origemHead: 'origin/main' }
  await iniciar($)
  const r = await $.tool.call({ tool: 'Bash', command: 'ls /repo/hooks', tool_use_id: 'tu-2' })
  const aviso = (r.context ?? []).at(-1) as string
  expect(aviso.startsWith('Aviso do Maestro: ')).toBe(true)
  const raiz = await resultado($, 'desktop', { tool_use_id: 'tu-2', tool: 'Bash', output: { stdout: 'primeira\nsegunda', stderr: '' } })
  const nos = todos(raiz)
  const sub = nos.find(n => n.type === 'Text' && n.props.color === 'subtle')!
  expect(textoNo(sub)).toBe('⎿ primeira')
  expect(nos.find(n => n.type === 'Box' && n.props.borderColor === 'promptBorder')).toBeDefined()
  expect(nos.some(n => n.type === 'Box' && n.props.width === 0.3 && n.props.backgroundColor === 'warning')).toBe(true)
  const tit = nos.find(n => n.type === 'Text' && textoNo(n) === '⚠️ Aviso do Maestro')!
  expect([tit.props.color, tit.props.bold]).toEqual(['warning', true])
  expect(nos.filter(n => n.type === 'Text').map(textoNo)).toContain(aviso.replace('Aviso do Maestro: ', ''))
})

test('A51: an unrecorded id and an expanded result stay native; 201 guarded ids keep 200', LENTO, async ($: any, on: any) => {
  const nativo: string[] = []
  on('ui.render', { component: 'ToolResult' }, async (_$: any, e: any, next: any) => (nativo.push(e.props.tool_use_id), next(e)))
  montar(on, {}, SPEC_BR)
  await iniciar($)
  for (let i = 0; i < 201; i++) await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body y', tool_use_id: `tu-${i}` })
  const props = (id: string, extra: any = {}) => ({ tool_use_id: id, tool: 'Bash', output: { stdout: '', stderr: '' }, ...extra })
  expect(ehCartao(await resultado($, 'desktop', props('tu-0')))).toBe(false)
  expect(ehCartao(await resultado($, 'desktop', props('desconhecido')))).toBe(false)
  expect(ehCartao(await resultado($, 'desktop', props('tu-1')))).toBe(true)
  expect(ehCartao(await resultado($, 'desktop', props('tu-200')))).toBe(true)
  expect(ehCartao(await resultado($, 'desktop', props('tu-200', { isExpanded: true })))).toBe(false)
  expect(nativo).toEqual(['tu-0', 'desconhecido', 'tu-200'])
})

// ---- audit queue and address map (Task 4): A30, A35, A37

import { MAPA_VAZIO, dobrarMapa, entradaMapa, noMapa } from './execucao'
import { disparar, dispararDesde, escrito, pendentesDesde } from './mundo-teste'
import { entradaAuditoria, idObservado } from './guardas'

const LOCAL = 'local_ab12cd34-0000-4000-8000-000000000001'
const ORQ_LINHA = 'NOTE ORQUESTRADOR novarc-orq-NOVARC-PLUGIN-MAESTRO [253bb9] local_bbe32e06-2b14-4402-a608-c8adae7d635d  # 2026-10-25T14:29:02Z\n'
const SESSAO_LINHA = 'NOTE ORCHESTRATOR-SESSION local_53cd2492-ce47-4269-8c9c-207e77a1f537 (novarc-NOVARC-PLUGIN-MAESTRO-C11); HALT answered A by Willian 2026-10-25T14:3xZ; iniciado written specs/C11-S01 v4, specs/C11-S02 v4, execucao/C11 v2; CONJUNTO C11 iniciado sent. DISPATCH c11-s01-acabamento-visual=local_02455b06-a0fd-458b-97bb-a000462a4325 (c11-s01-acabamento, sdd off); c11-s02-pasta-novarc=local_026b5883-1bea-4dee-b6c3-41c1dc3d355c (c11-s02-pasta-novarc, sdd on); both GO PLAN; PEERS sent  # 2026-10-25T14:35:56Z\n'

test('idObservado: stamp, 8 chars of the session id and the counter', async () => {
  expect(idObservado(new Date('2026-10-26T10:15:00.123Z'), 'abcdef0123456', 3)).toBe('20261026T101500123Z-abcdef01-3')
  expect(idObservado(new Date('2026-10-26T10:15:00.123Z'), LOCAL, 3)).toBe('20261026T101500123Z-ab12cd34-3') // final fix 5
})

test('entradaAuditoria: one-line text fields, no state-change fields', async () => {
  const d = entradaAuditoria(
    { acao: 'BLOQUEIO', alvo: 'C02-S01', motivo: 'a\nb', regra: 'core SKILL.md:69', linha: linhaDaGuarda('GH_TOKEN=x git push --force origin b', '--force'), origem: 'maestro' },
    { at: new Date('2026-10-26T10:15:00.000Z'), runId: '20261026-0900', sessao: 'novarc-X-C02-S01', papel: 'spec', by: 'w' },
  )
  expect([d.motivo, d.linha, d.antes, d.depois, d.estado, d.at]).toEqual(['a', 'git push --force', null, null, null, '2026-10-26T10:15:00.000Z'])
})

test('entradaMapa and noMapa: set and spec names, own_initiative and an id-less result give nothing', async () => {
  expect(entradaMapa({ name: 'novarc-X-C02', initiation: 'own_initiative' }, `ok ${LOCAL}`)).toBe(null)
  expect(entradaMapa({ name: 'novarc-X-C02' }, 'no id here')).toBe(null)
  const e = entradaMapa({ name: 'novarc-X-C02' }, `Started ${LOCAL}.`)!
  expect(e).toEqual({ nome: 'novarc-X-C02', sessao: LOCAL })
  let m = noMapa(MAPA_VAZIO(), e)
  m = noMapa(m, { nome: 'novarc-X-C02-S01', sessao: LOCAL })
  expect(m.conjuntos.C02).toEqual({ nome: 'novarc-X-C02', sessao: LOCAL })
  expect(m.specs['C02-S01']!.conjunto).toBe('C02')
  expect(noMapa(m, { nome: 'outra-sessao', sessao: LOCAL })).toBe(m)
})

test('R1-2: dobrarMapa reads the real C11 ledger lines, incrementally', async () => {
  const t1 = `# session-build - run 20261025-1428\n${ORQ_LINHA}`
  const a = dobrarMapa(MAPA_VAZIO(), t1, 0)
  expect(a.mapa.orquestrador).toBe('local_bbe32e06-2b14-4402-a608-c8adae7d635d')
  const t2 = `${t1}${SESSAO_LINHA}PARTIAL c11-s09-x=local_00000000-0000-4000-8000-000000000000`
  const b = dobrarMapa(a.mapa, t2, a.consumido)
  expect(b.mapa.specs['C11-S01']).toEqual({ conjunto: 'C11', nome: 'c11-s01-acabamento-visual', sessao: 'local_02455b06-a0fd-458b-97bb-a000462a4325', slug: 'c11-s01-acabamento-visual', agentId: null })
  expect(b.mapa.specs['C11-S02']!.sessao).toBe('local_026b5883-1bea-4dee-b6c3-41c1dc3d355c')
  expect(b.mapa.conjuntos.C11!.sessao).toBe('local_53cd2492-ce47-4269-8c9c-207e77a1f537')
  expect(b.mapa.specs['C11-S09']).toBe(undefined) // the partial last line waits
  expect(b.consumido).toBe(t1.length + SESSAO_LINHA.length)
})

/** A session on `branch` with artefato.txt, the plan and an empty planning db. */
async function planejado($: any, on: any, branch: string) {
  const m = montar(on, {}, branch, true)
  gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL_MUNDO}\n`)
  m.db = {}
  await iniciar($)
  await quieto(m)
  return m
}
const auditorias = (m: Mundo) => Object.entries(m.db ?? {}).filter(([k]) => k.startsWith('auditoria/'))

test('A35: the A2 denial is written by audit-flush with no branch name or env value in any field', LENTO, async ($: any, on: any) => {
  const BR = 'feat/c02-s01-alertas-locks-espelho-20261023'
  const m = await planejado($, on, BR)
  const n = m.timers.length
  expect(negado(await $.tool.call({ tool: 'Bash', command: `GH_TOKEN=segredo123 git push --force origin ${BR}` }))).toBe(TEXTOS.force)
  await quieto(m)
  dispararDesde(m, n)
  await quieto(m)
  const docs = auditorias(m)
  expect(docs.length).toBe(1)
  const [k, d] = docs[0]!
  expect(k).toMatch(/^auditoria\/\d{8}T\d{9}Z-sess-1-1$/)
  expect([d.data.acao, d.data.alvo, d.data.linha, d.data.regra, d.data.papel, d.data.origem]).toEqual(['BLOQUEIO', 'C02-S01', 'git push --force', 'core SKILL.md:69', 'spec', 'maestro'])
  const tudo = JSON.stringify(d.data)
  expect(tudo.includes('alertas-locks-espelho')).toBe(false)
  expect(tudo.includes('segredo123')).toBe(false)
  expect(escrito(m, 'auditoriaPendente')).toEqual([])
})

const LDIR_C11 = 'C:/repo/.novarc/ledger/session-build/20261025-1428'

test('A30, A37: start_session fills maestroMapa and queues one SESSAO entry; own_initiative does neither', LENTO, async ($: any, on: any) => {
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async (_$: any, e: any) => ({ result: '', text: `Session started: ${LOCAL} (${e.name})`, isError: false }))
  const m = await planejado($, on, 'main')
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `orquestrar ${URL_MUNDO}` })
  await quieto(m)
  const n = m.timers.length
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', name: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', prompt: 'prompt secreto do conjunto' })
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', name: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', prompt: 'p' })
  await quieto(m)
  const mapa = escrito(m, 'maestroMapa')
  expect(mapa.conjuntos.C02.sessao).toBe(LOCAL)
  expect(mapa.specs['C02-S01'].sessao).toBe(LOCAL)
  dispararDesde(m, n)
  await quieto(m)
  const docs = auditorias(m).map(([, d]) => d.data)
  expect(docs.length).toBe(2)
  const c02 = docs.find(d => d.alvo === 'novarc-NOVARC-PLUGIN-MAESTRO-C02')!
  expect([c02.acao, c02.regra, c02.papel]).toEqual(['SESSAO', 'd-trava-abrir-sessao', 'orquestrador'])
  for (const d of docs) {
    expect(JSON.stringify(d).includes('local_')).toBe(false)
    expect(JSON.stringify(d).includes('prompt secreto')).toBe(false)
  }
  const n2 = m.timers.length
  await $.tool.call({ tool: 'mcp__ccd_session__start_session', name: 'novarc-NOVARC-PLUGIN-MAESTRO-C03', prompt: 'p', initiation: 'own_initiative' })
  await quieto(m)
  expect(escrito(m, 'maestroMapa').conjuntos.C03).toBe(undefined)
  expect(pendentesDesde(m, n2)).toBe(0)
  expect(escrito(m, 'auditoriaPendente')).toEqual([])
})

test('A30 reload half: a set session rebuilds the map from its ledger.md lines', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  gravar(m, `${LDIR_C11}/ledger.md`, `# session-build - run 20261025-1428\n${ORQ_LINHA}${SESSAO_LINHA}`)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${LDIR_C11} --type NOTE --text "x"` })
  await quieto(m)
  const mapa = escrito(m, 'maestroMapa')
  expect(mapa.specs['C11-S01'].sessao).toBe('local_02455b06-a0fd-458b-97bb-a000462a4325')
  expect(mapa.conjuntos.C11.sessao).toBe('local_53cd2492-ce47-4269-8c9c-207e77a1f537')
  expect(mapa.orquestrador).toBe('local_bbe32e06-2b14-4402-a608-c8adae7d635d')
})

test('R1-5, R1-6: after a reload the queue comes back from state and its 5 s flush is re-armed', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR, true)
  const doc = { acao: 'BLOQUEIO', alvo: 'C01-S01', motivo: 'x', regra: 'core SKILL.md:69', linha: 'git push --force', antes: null, depois: null, estado: null, runId: null, sessao: 's', papel: 'spec', by: '', at: '2026-10-26T10:00:00.000Z', origem: 'maestro' }
  m.servirEstado = {
    exec: { papel: 'spec', ledgerDir: null, forks: {}, conjunto: 'C01', spec: 'C01-S01' },
    ctx: { artefato: URL_MUNDO, plano: {}, conjunto: 'C01', spec: 'C01-S01', papel: 'spec' },
    auditoriaPendente: [{ id: '20261026T100000000Z-sess-1-1', doc }],
  }
  m.db = {}
  await iniciar($)
  await quieto(m)
  dispararDesde(m, 0)
  await quieto(m)
  expect(m.db!['auditoria/20261026T100000000Z-sess-1-1']!.data.acao).toBe('BLOQUEIO')
})

// ---- Task 4 fix round 1

const DOC_F = { acao: 'BLOQUEIO', alvo: 'C01-S01', motivo: 'x', regra: 'core SKILL.md:69', linha: 'git push --force', antes: null, depois: null, estado: null, runId: null, sessao: 's', papel: 'spec', by: '', at: '2026-10-26T10:00:00.000Z', origem: 'maestro' }
const CHEIA = 'maestro: fila de auditoria cheia, a entrada mais antiga foi descartada'

test('fix 4: a restored queue over 200 is cut with one log line and mirrored; the overflow episode logs once', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.servirEstado = {
    exec: { papel: 'spec', ledgerDir: null, forks: {}, conjunto: 'C01', spec: 'C01-S01' },
    auditoriaPendente: Array.from({ length: 201 }, (_, i) => ({ id: `20261026T100000000Z-old-${i}`, doc: DOC_F })),
  }
  await iniciar($)
  await quieto(m)
  expect((escrito(m, 'auditoriaPendente') ?? []).length).toBe(200)
  expect(escrito(m, 'auditoriaPendente')[0].id).toBe('20261026T100000000Z-old-1')
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin x' })
  await $.tool.call({ tool: 'Bash', command: 'git push --force origin x' })
  await quieto(m)
  expect(m.logs.filter(l => l === CHEIA).length).toBe(1)
})

test('fix 1: after a reload a start_session and a ledger.md fold racing on the map both keep their entries', LENTO, async ($: any, on: any) => {
  on('tool.call', { tool: 'mcp__ccd_session__start_session' }, async (_$: any, e: any) => ({ result: '', text: `Session started: ${LOCAL} (${e.name})`, isError: false }))
  const m = montar(on, {}, 'main')
  gravar(m, `${LDIR_C11}/ledger.md`, `# session-build - run 20261025-1428\n${ORQ_LINHA}${SESSAO_LINHA}`)
  const guardado = { conjuntos: { C05: { nome: 'novarc-X-C05', sessao: 'local_55555555-0000-4000-8000-000000000005' } }, specs: {}, orquestrador: null, at: 1 }
  m.servirEstado = { exec: { papel: 'conjunto', ledgerDir: LDIR_C11, forks: {}, conjunto: 'C11' }, maestroMapa: guardado }
  await iniciar($)
  await quieto(m)
  // from here every map read is held until both writers are in flight
  let soltar = () => {}
  const porta = new Promise<void>(r => (soltar = r))
  m.segurarEstado = (e: any) => (e.key === 'maestroMapa' ? porta : null)
  const inicio = $.tool.call({ tool: 'mcp__ccd_session__start_session', name: 'novarc-X-C12', prompt: 'p' })
  disparar(m)
  await dormir(200)
  soltar()
  await inicio
  await quieto(m)
  const mapa = escrito(m, 'maestroMapa')
  expect(mapa.conjuntos.C05.sessao).toBe('local_55555555-0000-4000-8000-000000000005')
  expect(mapa.conjuntos.C12.sessao).toBe(LOCAL)
  expect(mapa.specs['C11-S01'].sessao).toBe('local_02455b06-a0fd-458b-97bb-a000462a4325')
})

// ---- directive, routing, map and turn helpers (Task 5): pure, A13, A16-A18, A20, A21, A24, A31, A34, A47, R4-R7

import {
  checkoutPrincipal, diretivasPrevistas, lerProvaRelato, lerRelay, linhaProvaRelato, linhaRelay, regraDaDiretiva,
  relatoDoConjunto, relatoRelease, resumoTurno, rotaDaDiretiva, secaoMapa, type Relato,
} from './execucao'
import { lerSurfaces, manifestosDisjuntos, manifestosDoLedger } from './guardas'

// The four real SURFACES lines (.novarc/ledger/session-build/2026102{2-1202,5-1428}/fork-*.md), verbatim except the two
// private planning-skill folder names, renamed `planejamento` and `planos` (publicar-dev.sh private-reference gate).
const SURF_C02_S01 = 'SURFACES c02-s01-alertas-locks-espelho migrations=none tables=none functions=none deploys=none shared-modules: hooks/maestro/register.tsx hooks/maestro/execucao.ts hooks/maestro/logic.ts types/index.d.ts tests: hooks/maestro/execucao.test.ts hooks/maestro/logic.test.ts hooks/maestro/olhos.test.ts hooks/maestro/register.test.ts other: skills/novarc-session-build/core/scripts/ledger.py skills/novarc-session-build/core/scripts/test_ledger_sweep.py(new) skills/novarc-session-build/SKILL.md skills/planejamento/template/index.html skills/planejamento/template/TEMPLATE.md skills/planejamento/template/ferramentas/verificar-pagina.js docs/superpowers/plans/2026-10-22-c02-s01-alertas-locks-espelho.md docs/codex-review/c02-s01-alertas-locks-espelho-20261022-2235/ db-real-writes: specs/C02-S01 milestones only; locks-needed: verify  # 2026-10-23T01:54:33Z'
const SURF_C02_S02 = 'SURFACES c02-s02-pendencias-no-painel migrations=none functions=none shared-modules=none; PRE-MERGE: hooks/maestro/pendencias.ts (new), hooks/maestro/pendencias.test.ts (new), skills/novarc-session-build/steps/orquestrar.md (§5 row), skills/novarc-session-build/steps/conjunto-overrides.md (Messages-from-orchestrator row); POST-MERGE: hooks/maestro/execucao.ts, hooks/maestro/execucao.test.ts, hooks/maestro/register.tsx, hooks/maestro/register.test.ts, hooks/maestro/pendencias-aba.tsx (new), types/index.d.ts, skills/planejamento/template/TEMPLATE.md (pendencias/{id} row), S01 espelho summary file (aCaminho); locks: verify only; db writes: specs/C02-S02 milestones only  # 2026-10-23T01:41:27Z'
const SURF_C11_S01 = 'SURFACES c11-s01-acabamento-visual migrations=none tables=none functions=none deploys=none shared-modules: hooks/maestro/register.tsx (all but acharArtefato and lerRepo bodies), hooks/maestro/execucao.ts (raia(): Raia.inicios only), types/index.d.ts (PluginState novarc maestro block only), hooks/maestro/pendencias-aba.tsx; new: hooks/maestro/desenho.ts, kit.tsx, pulse.tsx, desenho.test.ts, kit.test.ts, visual.test.ts, conversa.test.ts; tests modified: olhos.test.ts, pendencias.test.ts, register.test.ts, alertas.test.ts, execucao.test.ts; docs: docs/superpowers/plans/2026-10-25-c11-s01-acabamento-visual.md, docs/codex-review/c11-s01-acabamento-visual-20261025-1147/; locks needed: verify only  # 2026-10-25T15:01:37Z'
const SURF_C11_S02 = "SURFACES c11-s02-pasta-novarc migrations=none functions=none | PRE-MERGE: new skills/novarc-session-build/core/scripts/{migrar_novarc.py,test_migrar_novarc.py}; skills/novarc-session-build/steps/{conjunto-load.md,orquestrar.md}; skills/novarc-session-build/core/{SKILL.md,dispatch-prompts.md,steps/step-01,step-02,step-04,step-06,assets/closeout-report-template.md,references/incidents.md,references/orchestration-deadlocks.md}; skills/planos/{SKILL.md,references/layer-prompts.md,set-prompt.md,spec-format.md}; skills/novarc-codex-review/SKILL.md; skills/novarc-session-end/{SKILL.md,core/SKILL.md,core/steps/step-04-pendings.md,lane-fork-orchestrator.md,step-00-inventory.md}; skills/planejamento/template/{ferramentas/validar-plano.js,ferramentas/__tests__/fixtures.js,ferramentas/__tests__/validar-plano.test.js,plano.schema.json,TEMPLATE.md,index.html,exemplo/plano.json}; README.md | POST-MERGE (after MERGE feat/c11-s01-acabamento-visual-20261024): hooks/maestro/register.tsx (acharArtefato, lerRepo only), hooks/maestro/pendencias.ts (comments), types/index.d.ts (:47 comment), hooks/maestro/olhos.test.ts, hooks/maestro/pendencias.test.ts; SELF-MIGRATION (last): git mv of ai/, PENDINGS.md, .superpowers/session-build, .superpowers/session-end, docs/superpowers/*, docs/codex-review -> .novarc/ (includes S01's merged plan/codex files) | shared modules: none | locks: verify only  # 2026-10-25T14:55:37Z"

const S01 = 'c02-s01-alertas-locks-espelho'
const S02 = 'c02-s02-pendencias-no-painel'
const PAGINA = 'skills/planejamento/template/index.html' // A13's C02-S02 surface, folder renamed as above
const ID1 = 'local_11111111-0000-4000-8000-000000000001'
const ID2 = 'local_22222222-0000-4000-8000-000000000002'
const IDC = 'local_cccccccc-0000-4000-8000-00000000000c'
const ORQ = 'local_00000000-0000-4000-8000-0000000000aa'
const MAPA = {
  conjuntos: { C02: { nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', sessao: IDC } },
  specs: {
    'C02-S01': { conjunto: 'C02', nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', sessao: ID1, slug: S01, agentId: null },
    'C02-S02': { conjunto: 'C02', nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S02', sessao: ID2, slug: S02, agentId: null },
  },
  orquestrador: ORQ,
  at: 5,
}

test('R4-1: lerSurfaces extracts path and field tokens from the four real lines', async () => {
  const a = lerSurfaces(SURF_C02_S01)
  expect(a.legivel).toBe(true)
  expect(a.superficies).toContain('hooks/maestro/register.tsx')
  expect(a.superficies).toContain('skills/novarc-session-build/core/scripts/test_ledger_sweep.py')
  expect(a.superficies).toContain('docs/codex-review/c02-s01-alertas-locks-espelho-20261022-2235')
  expect(a.superficies.some(s => /^(migrations|tables|functions|deploys)[:=]/.test(s))).toBe(false)
  const b = lerSurfaces(SURF_C02_S02)
  expect(b.legivel).toBe(true)
  expect(b.superficies).toContain('hooks/maestro/pendencias.ts')
  expect(b.superficies).toContain('skills/novarc-session-build/steps/conjunto-overrides.md')
  const c = lerSurfaces(SURF_C11_S01)
  expect(c.superficies).toContain('hooks/maestro/pendencias-aba.tsx')
  expect(c.superficies).toContain('kit.tsx')
  const d = lerSurfaces(SURF_C11_S02)
  expect(d.legivel).toBe(true)
  for (const s of [
    'skills/novarc-session-build/core/scripts/migrar_novarc.py',
    'skills/novarc-session-build/core/scripts/test_migrar_novarc.py',
    'skills/novarc-session-build/core/steps/step-01',
    'skills/novarc-session-build/core/references/incidents.md',
    'skills/novarc-session-end/core/steps/step-04-pendings.md',
    'README.md',
  ]) expect(d.superficies).toContain(s)
  expect(d.superficies.some(s => s.includes('{') || s.includes('}'))).toBe(false)
})

test('R4-1, R5-1: fields, all-none, illegible and truncated manifests', async () => {
  const f = lerSurfaces('SURFACES x migrations=0042_espelho.sql tables: espelho functions=none').superficies
  expect(f).toContain('migrations:0042_espelho.sql')
  expect(f).toContain('tables:espelho')
  expect(lerSurfaces('SURFACES x migrations=none functions=none  # 2026-10-25T14:55:37Z')).toEqual({ superficies: [], legivel: true })
  expect(lerSurfaces('SURFACES x vou mexer em quase tudo').legivel).toBe(false)
  expect(lerSurfaces('SURFACES x files: hooks/maestro/register.tsx hooks/maestro/a…').legivel).toBe(false)
  expect(lerSurfaces('SURFACES x files: hooks/maestro/register.tsx ...').legivel).toBe(false)
  expect(lerSurfaces('SURFACES x files: hooks/maestro/register.tsx [+120 chars]').legivel).toBe(false)
  expect(lerSurfaces(`SURFACES x files: ${'hooks/maestro/a.ts '.repeat(500)}`).legivel).toBe(false)
})

test('manifestosDisjuntos: a shared surface names every slug holding it', async () => {
  expect(manifestosDisjuntos({ a: ['x.ts', 'y.ts'], b: ['z.ts'] })).toEqual({ disjuntos: true })
  expect(manifestosDisjuntos({ b: ['x.ts'], a: ['x.ts', 'y.ts'], c: ['y.ts'] })).toEqual({
    disjuntos: false,
    colisoes: [
      { slug: 'a', superficie: 'x.ts' },
      { slug: 'a', superficie: 'y.ts' },
      { slug: 'b', superficie: 'x.ts' },
      { slug: 'c', superficie: 'y.ts' },
    ],
  })
})

test('A13: the set report once every expected manifest arrived', async () => {
  const m1 = `SURFACES ${S01} files: hooks/maestro/register.tsx`
  const m2 = `SURFACES ${S02} files: ${PAGINA}`
  expect(relatoDoConjunto('C02', { [S01]: m1 }, [S02, S01])).toBe(null)
  expect(relatoDoConjunto('C02', { [S02]: m2, [S01]: m1 }, [S02, S01])).toBe(`CONJUNTO C02 manifestos disjuntos ${S01} ${S02}`)
  expect(relatoDoConjunto('C02', { [S01]: m1, [S02]: `SURFACES ${S02} files: hooks/maestro/register.tsx` }, [S01, S02])).toBe(
    `CONJUNTO C02 manifestos colisao ${S01}:hooks/maestro/register.tsx ${S02}:hooks/maestro/register.tsx`,
  )
  expect(relatoDoConjunto('C02', { [S01]: m1, [S02]: `SURFACES ${S02} mexo em tudo` }, [S01, S02])).toBe(`CONJUNTO C02 manifestos colisao ${S02}:ilegivel`)
  // the real C02 manifests share register.tsx, execucao.ts, ...: a collision
  const real = relatoDoConjunto('C02', { [S01]: SURF_C02_S01, [S02]: SURF_C02_S02 }, [S01, S02])!
  expect(real.startsWith('CONJUNTO C02 manifestos colisao ')).toBe(true)
  expect(real).toContain(`${S01}:hooks/maestro/register.tsx`)
  expect(real).toContain(`${S02}:hooks/maestro/register.tsx`)
})

test('R6, R7: manifestosDoLedger takes the latest SURFACES with its continuation lines, rev n.hash', async () => {
  const fork = [
    `READY ${S01} branch=feat/c02-s01-x-20261023  # 2026-10-23T10:00:00Z`,
    `SURFACES ${S01}`,
    '  files: hooks/maestro/register.tsx',
    '  tables=none',
    'TASK 1/3 x  # 2026-10-23T10:05:00Z',
    '',
  ].join('\n')
  const m = manifestosDoLedger(fork)
  expect(Object.keys(m)).toEqual([S01])
  expect(m[S01]!.texto).toBe(`SURFACES ${S01}\n  files: hooks/maestro/register.tsx\n  tables=none`)
  expect(m[S01]!.rev).toMatch(/^1\.[0-9a-f]{8}$/)
  expect(lerSurfaces(m[S01]!.texto)).toEqual({ superficies: ['hooks/maestro/register.tsx'], legivel: true })
  // two identical re-sends: distinct revisions 1.x and 2.x, same hash
  const linha = `SURFACES ${S01} files: hooks/maestro/register.tsx`
  const um = manifestosDoLedger(`${linha}\n`)[S01]!.rev
  const dois = manifestosDoLedger(`${linha}\n${linha}\n`)[S01]!.rev
  expect(um.startsWith('1.')).toBe(true)
  expect(dois).toBe(`2.${um.slice(2)}`)
  expect(manifestosDoLedger(`${linha}\nSURFACES ${S01} files: hooks/maestro/kit.tsx\n`)[S01]!.texto).toBe(`SURFACES ${S01} files: hooks/maestro/kit.tsx`)
})

test('R6: the RELATO proof line round-trips, with and without the ledger stamp', async () => {
  const relato = `CONJUNTO C02 manifestos disjuntos ${S01} ${S02}`
  const linha = linhaProvaRelato(relato, { [S02]: '1.0000beef', [S01]: '2.deadbeef' })
  expect(linha).toBe(`RELATO ${relato} rev ${S01}=2.deadbeef ${S02}=1.0000beef`)
  expect(lerProvaRelato(linha)).toEqual({ relato, revs: { [S01]: '2.deadbeef', [S02]: '1.0000beef' } })
  expect(lerProvaRelato(`NOTE ${linha}  # 2026-10-23T10:20:00Z`)).toEqual({ relato, revs: { [S01]: '2.deadbeef', [S02]: '1.0000beef' } })
  expect(lerProvaRelato('NOTE RELATO-VELHO C02')).toBe(null)
  expect(lerProvaRelato('NOTE ORQUESTRADOR x')).toBe(null)
})

test('A16: the release report names the oldest ungranted waiter, nothing when nobody waits', async () => {
  const locks = [
    { slug: S01, kind: 'migration', resource: '0042_espelho.sql', desde: '2026-10-23T12:00:00Z', concedido: true },
    { slug: 'c02-s03-x', kind: 'migration', resource: '0042_espelho.sql', desde: '2026-10-23T12:20:00Z', concedido: false },
    { slug: S02, kind: 'migration', resource: '0042_espelho.sql', desde: '2026-10-23T12:10:00Z', concedido: false },
  ]
  const r = `CONJUNTO C02 release migration 0042_espelho.sql ${S02}`
  expect(relatoRelease('C02', locks, { slug: S01, kind: 'migration', resource: '0042_espelho.sql' })).toBe(r)
  // APPLIED carries no kind: any kind on that resource
  expect(relatoRelease('C02', locks, { slug: S01, kind: '', resource: '0042_espelho.sql' })).toBe(r)
  expect(relatoRelease('C02', locks.slice(0, 1), { slug: S01, kind: 'migration', resource: '0042_espelho.sql' })).toBe(null)
  expect(relatoRelease('C02', locks, { slug: S01, kind: 'migration', resource: '0043_outra.sql' })).toBe(null)
})

test('A20, A21: routing from the recorded orchestrator to an own spec; refusals', async () => {
  const grant = `GO ${S02} migration 0042_espelho.sql`
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, grant)).toEqual({ para: ID2, slug: S02 })
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, `status ${S01}?`)).toEqual({ para: ID1, slug: S01 })
  expect(rotaDaDiretiva(MAPA, 'C02', 'local_99999999-0000-4000-8000-000000000099', ORQ, `GO ${S01} phase 4`)).toEqual({ recusa: 'GO' })
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, null, `GO ${S01} phase 4`)).toEqual({ recusa: 'GO' })
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, 'GO c03-s01-guardas phase 4')).toEqual({ recusa: 'GO' })
  expect(rotaDaDiretiva(MAPA, 'C02', 'outra', ORQ, `status ${S01}?`)).toEqual({ recusa: 'STATUS' })
  // the set itself, other directives and prose are not routed
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, 'status C02?')).toBe(null)
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, 'HOLD C02 colisão')).toBe(null)
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, 'oi, tudo certo?')).toBe(null)
})

test('regraDaDiretiva: rule per directive line', async () => {
  expect(regraDaDiretiva(`GO ${S01} phase 4`)).toBe('dispatch-prompts.md:458')
  expect(regraDaDiretiva(`GO ${S02} migration 0042_espelho.sql`)).toBe('step-05 §5.3')
  expect(regraDaDiretiva(`status ${S01}?`)).toBe('dispatch-prompts.md:442')
  expect(regraDaDiretiva('HOLD C02 colisão com C03')).toBe('orquestrar.md')
  expect(regraDaDiretiva('LIBERA C02')).toBe('orquestrar.md')
  expect(regraDaDiretiva('FECHA C02 C02-S01=abc1234')).toBe('orquestrar.md §5.1')
  expect(regraDaDiretiva('MERGE-OK C02')).toBe('d-diretivas-diretas')
})

const T = (hhmm: string) => Date.parse(`2026-10-23T${hhmm}:00Z`)
const calado = (unidade: string, at: number) => ({ chave: `calado:${unidade}:${at}`, texto: '', toast: '', nivel: 'erro' as const, at: 0 })
const base = { relatos: [] as Relato[], runId: '20261023-0930', mapa: MAPA, codigo: 'NOVARC-PLUGIN-MAESTRO', limiarCalado: 15, locks: [] as any[], slots: null }

test('A17: a quiet set gets status at most twice per episode', async () => {
  const al = [calado('C02', T('10:15'))]
  const p1 = diretivasPrevistas({ ...base, alertas: al, feitas: new Set(), agora: T('10:31') })
  expect(p1).toEqual([
    { to: IDC, text: 'status C02?', chave: 'status-c02-20261023t101500z-1', acao: 'STATUS-PEDIDO', alvo: 'C02', motivo: 'calado há 16 min', regra: 'dispatch-prompts.md:442' },
  ])
  const p2 = diretivasPrevistas({ ...base, alertas: al, feitas: new Set([p1[0]!.chave]), agora: T('10:47') })
  expect(p2.map(p => [p.chave, p.text, p.motivo])).toEqual([['status-c02-20261023t101500z-2', 'status C02?', 'calado há 32 min']])
  expect(diretivasPrevistas({ ...base, alertas: al, feitas: new Set([p1[0]!.chave, p2[0]!.chave]), agora: T('11:03') })).toEqual([])
  // catch-up: a first look at 10:47 sends the second ping only
  expect(diretivasPrevistas({ ...base, alertas: al, feitas: new Set(), agora: T('10:47') }).map(p => p.chave)).toEqual(['status-c02-20261023t101500z-2'])
  // a quiet spec: status <slug>? to its set session; a spec with no known slug is skipped
  const s = diretivasPrevistas({ ...base, alertas: [calado('C02-S01', T('10:15'))], feitas: new Set(), agora: T('10:31') })
  expect(s.map(p => [p.to, p.text, p.alvo, p.chave])).toEqual([[IDC, `status ${S01}?`, 'C02-S01', `status-${S01}-20261023t101500z-1`]])
  expect(diretivasPrevistas({ ...base, alertas: [calado('C02-S09', T('10:15'))], feitas: new Set(), agora: T('10:31') })).toEqual([])
  // no address in the map: the set session's name
  const semMapa = diretivasPrevistas({ ...base, mapa: { ...MAPA, conjuntos: {} }, alertas: al, feitas: new Set(), agora: T('10:31') })
  expect(semMapa[0]!.to).toBe('novarc-NOVARC-PLUGIN-MAESTRO-C02')
})

test('A18: an orphan GRANTED-NOT-RELEASED lock gets one LOCK-COBRADO status per lock key', async () => {
  const desde = '2026-10-23T10:00:00Z'
  const alerta = { chave: `lock:C02-S01:migration:0042_espelho.sql:${desde}`, texto: '', toast: '', nivel: 'erro' as const, at: 0 }
  const lock = { spec: 'C02-S01', kind: 'migration', resource: '0042_espelho.sql', desde, estado: 'GRANTED-NOT-RELEASED' }
  const p = diretivasPrevistas({ ...base, alertas: [alerta], locks: [lock], feitas: new Set(), agora: T('10:32') })
  expect(p).toEqual([
    {
      to: IDC,
      text: `status ${S01}?`,
      chave: 'lock-c02-s01-migration-0042_espelho.sql-20261023t100000z',
      acao: 'LOCK-COBRADO',
      alvo: 'C02-S01',
      motivo: 'segura 0042_espelho.sql há 32 min',
      regra: 'dispatch-prompts.md:442',
    },
  ])
  expect(diretivasPrevistas({ ...base, alertas: [alerta], locks: [lock], feitas: new Set([p[0]!.chave]), agora: T('11:32') })).toEqual([])
  // UNGRANTED, or no lock state at all: nothing (stricter)
  expect(diretivasPrevistas({ ...base, alertas: [alerta], locks: [{ ...lock, estado: 'UNGRANTED' }], feitas: new Set(), agora: T('10:32') })).toEqual([])
  expect(diretivasPrevistas({ ...base, alertas: [alerta], feitas: new Set(), agora: T('10:32') })).toEqual([])
})

test('slot alerts: status <C>? twice, the second past twice the orphan threshold', async () => {
  // the held minutes come from the slots (data), never from the display text
  const branch = 'feat/c02-s01-x-20261023'
  const alerta = { chave: `slot:C02:verify:${branch}`, texto: 'texto qualquer há 999 min', toast: '', nivel: 'erro' as const, at: 0 }
  const slots = { verify: { dono: { conjunto: 'C02', branch, desde: '2026-10-23T10:10:00.000Z' }, fila: [] }, producao: { dono: null, fila: [] } }
  const com = (agora: number, feitas: string[]) => diretivasPrevistas({ ...base, slots, alertas: [alerta], feitas: new Set(feitas), agora })
  const p = com(T('10:31'), [])
  expect(p.map(x => [x.to, x.text, x.chave, x.acao, x.alvo, x.motivo])).toEqual([[IDC, 'status C02?', 'slot-c02-verify-feat-c02-s01-x-20261023-1', 'STATUS-PEDIDO', 'C02', 'segura o slot verify há 21 min']])
  expect(com(T('10:40'), [p[0]!.chave])).toEqual([])
  expect(com(T('10:50'), [p[0]!.chave]).map(x => x.chave)).toEqual(['slot-c02-verify-feat-c02-s01-x-20261023-2'])
  // the slot already released (no owner on that branch): nothing
  expect(diretivasPrevistas({ ...base, alertas: [alerta], feitas: new Set(), agora: T('10:31') })).toEqual([])
})

test('fix 1: collisions are conservative (suffix, directory prefix, key-prefixed tokens, fields vs paths)', async () => {
  const col = (a: string, b: string) => relatoDoConjunto('C09', { a: `SURFACES a ${a}`, b: `SURFACES b ${b}` }, ['a', 'b'])!
  expect(col('new: hooks/maestro/desenho.ts, kit.tsx', 'files: hooks/maestro/kit.tsx')).toBe('CONJUNTO C09 manifestos colisao a:kit.tsx b:hooks/maestro/kit.tsx')
  expect(col('files=hooks/x.ts', 'files: hooks/x.ts')).toBe('CONJUNTO C09 manifestos colisao a:hooks/x.ts b:hooks/x.ts')
  expect(col('migrations=0042_x.sql', 'files: supabase/migrations/0042_x.sql')).toBe('CONJUNTO C09 manifestos colisao a:migrations:0042_x.sql b:supabase/migrations/0042_x.sql')
  expect(col('other: docs/codex-review/', 'files: docs/codex-review/x.md')).toBe('CONJUNTO C09 manifestos colisao a:docs/codex-review b:docs/codex-review/x.md')
  expect(col('functions=espelho', 'files: supabase/functions/espelho/index.ts')).toMatch(/^CONJUNTO C09 manifestos colisao /)
  // still disjoint when nothing overlaps
  expect(col('files: hooks/a.ts', 'files: hooks/ab.ts docs/a.ts.md')).toBe('CONJUNTO C09 manifestos disjuntos a b')
})

test('fix 2: secaoMapa cuts by characters, also with a 40-char codigo', async () => {
  for (const n of [40, 80]) {
    const cod = 'X'.repeat(n)
    const specs: Record<string, any> = {}
    for (let i = 0; i < 21; i++) {
      const id = `C0${(i % 9) + 1}-S${String(Math.floor(i / 9) + 1).padStart(2, '0')}`
      specs[id] = { conjunto: id.slice(0, 3), nome: `novarc-${cod}-${id}`, sessao: `local_${String(i).padStart(8, '0')}-a0fd-458b-97bb-a000462a4325`, slug: `${id.toLowerCase()}-um-slug-bem-comprido-aqui`, agentId: `agent_${'f'.repeat(24)}` }
    }
    const t = secaoMapa({ conjuntos: {}, specs, orquestrador: null, at: 0 })
    expect(t.length).toBeLessThan(2800)
    expect(/\ne mais \d+\n/.test(t)).toBe(true)
    expect(t.endsWith('seu conjunto')).toBe(true)
  }
  // a small map is never cut
  expect(secaoMapa(MAPA)).not.toContain('e mais')
})

test('fix 4: routing sends to the name when the session id is empty and refuses a slug the map does not know', async () => {
  const semId = { ...MAPA, specs: { ...MAPA.specs, 'C02-S02': { ...MAPA.specs['C02-S02'], sessao: '' } } }
  expect(rotaDaDiretiva(semId, 'C02', ORQ, ORQ, `GO ${S02} migration 0042_espelho.sql`)).toEqual({ para: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S02', slug: S02 })
  expect(rotaDaDiretiva(MAPA, 'C02', ORQ, ORQ, 'GO c02-s02-outro-slug phase 4')).toEqual({ recusa: 'GO' })
  const semSlug = { ...MAPA, specs: { ...MAPA.specs, 'C02-S02': { ...MAPA.specs['C02-S02'], slug: '' } } }
  expect(rotaDaDiretiva(semSlug, 'C02', ORQ, ORQ, 'GO c02-s02-outro-slug phase 4')).toEqual({ para: ID2, slug: 'c02-s02-outro-slug' })
})

test('A14 keys, R6/R7 revisions and the release grant from structured reports', async () => {
  const disj = (r1: string, r2: string): Relato => ({
    conjunto: 'C02', tipo: 'disjuntos', slugs: [S01, S02], revs: { [S01]: r1, [S02]: r2 }, linha: `CONJUNTO C02 manifestos disjuntos ${S01} ${S02}`,
  })
  const p = diretivasPrevistas({ ...base, alertas: [], relatos: [disj('1.aaaaaaaa', '1.bbbbbbbb')], feitas: new Set(), agora: T('10:31') })
  expect(p).toEqual([
    { to: IDC, text: `GO ${S01} phase 4`, chave: `go-${S01}-fase4-20261023-0930`, acao: 'GO', alvo: 'C02-S01', motivo: 'manifestos disjuntos', regra: 'dispatch-prompts.md:458' },
    { to: IDC, text: `GO ${S02} phase 4`, chave: `go-${S02}-fase4-20261023-0930`, acao: 'GO', alvo: 'C02-S02', motivo: 'manifestos disjuntos', regra: 'dispatch-prompts.md:458' },
  ])
  const feitas = new Set(p.map(x => x.chave))
  // A14: the same report again sends nothing
  expect(diretivasPrevistas({ ...base, alertas: [], relatos: [disj('1.aaaaaaaa', '1.bbbbbbbb')], feitas, agora: T('10:32') })).toEqual([])
  // R7: a re-sent manifest (2nd SURFACES of S01) gets a fresh key; the same revision twice sends nothing
  const r2 = diretivasPrevistas({ ...base, alertas: [], relatos: [disj('2.cccccccc', '1.bbbbbbbb')], feitas, agora: T('10:40') })
  expect(r2.map(x => x.chave)).toEqual([`go-${S01}-fase4-20261023-0930-2`])
  feitas.add(r2[0]!.chave)
  expect(diretivasPrevistas({ ...base, alertas: [], relatos: [disj('2.cccccccc', '1.bbbbbbbb')], feitas, agora: T('10:41') })).toEqual([])
  // A16 orchestrator half: the grant goes to the set session
  const rel: Relato = {
    conjunto: 'C02', tipo: 'release', slugs: [S02], revs: {}, linha: `CONJUNTO C02 release migration 0042_espelho.sql ${S02}`,
    release: { kind: 'migration', resource: '0042_espelho.sql', waiter: S02, releaseAt: '2026-10-23T13:05:00Z' },
  }
  expect(diretivasPrevistas({ ...base, alertas: [], relatos: [rel], feitas: new Set(), agora: T('13:05') })).toEqual([
    { to: IDC, text: `GO ${S02} migration 0042_espelho.sql`, chave: `release-migration-0042_espelho.sql-${S02}-20261023t130500z`, acao: 'RELEASE-REPASSADO', alvo: 'C02-S02', motivo: 'esperava o lock', regra: 'step-05 §5.3' },
  ])
})

test('A24: keys already in feitas give nothing; one key never twice in one call', async () => {
  const al = [calado('C02', T('10:15')), calado('C02', T('10:15'))]
  expect(diretivasPrevistas({ ...base, alertas: al, feitas: new Set(), agora: T('10:31') }).length).toBe(1)
  expect(diretivasPrevistas({ ...base, alertas: al, feitas: new Set(['status-c02-20261023t101500z-1']), agora: T('10:31') })).toEqual([])
})

test('R4-3: the artifact-less RELAY line binds the exact text and parses back', async () => {
  const rel: Relato = { conjunto: 'C02', tipo: 'disjuntos', slugs: [S01], revs: { [S01]: '1.aaaaaaaa' }, linha: '' }
  const [p] = diretivasPrevistas({ ...base, alertas: [], relatos: [rel], feitas: new Set(), agora: 0 })
  const linha = linhaRelay(p!)
  expect(linha).toBe(`RELAY GO C02-S01 go-${S01}-fase4-20261023-0930 GO ${S01} phase 4`)
  const lido = { acao: 'GO', alvo: 'C02-S01', chave: `go-${S01}-fase4-20261023-0930`, linha: `GO ${S01} phase 4` }
  expect(lerRelay(linha)).toEqual(lido)
  expect(lerRelay(`${linha}  # 2026-10-23T10:31:00Z`)).toEqual(lido)
  expect(lerRelay(`RELAY GO ${S02} migration 0042_espelho.sql to ${S02}`)).toBe(null) // the set ledger's own RELAY
})

test('R4-4: checkoutPrincipal strips the set ledger suffix', async () => {
  expect(checkoutPrincipal('C:/dev/proj/.novarc/ledger/session-build/20261023-0930')).toBe('C:/dev/proj')
  expect(checkoutPrincipal('C:\\dev\\proj\\.superpowers\\session-build\\20261023-0930\\')).toBe('C:/dev/proj')
  expect(checkoutPrincipal('/repo/.novarc/ledger/novarc-orq/20261023-0930')).toBe(null)
  expect(checkoutPrincipal('/repo/.novarc/ledger/session-build/2026-1023')).toBe(null)
})

test('A31: secaoMapa lists each spec address, reserve agents and the hop rule; deterministic', async () => {
  const mapa = {
    ...MAPA,
    specs: {
      ...MAPA.specs,
      'C01-S01': { conjunto: 'C01', nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C01-S01', sessao: 'local_33333333-0000-4000-8000-000000000003', slug: 'c01-s01-x', agentId: null },
      'C01-S02': { conjunto: 'C01', nome: '', sessao: null, slug: 'c01-s02-y', agentId: 'agent_abc' },
    },
  }
  const t = secaoMapa(mapa)
  expect(t.split('\n')[0]).toBe('maestro · endereços desta execução')
  expect(t).toContain(`C02-S01 → novarc-NOVARC-PLUGIN-MAESTRO-C02-S01 (${ID1})`)
  expect(t).toContain('c01-s02-y → agent_abc')
  expect(t).toContain('só a sessão do conjunto fala com o orquestrador')
  expect(t.indexOf('C01-S01 →')).toBeLessThan(t.indexOf('C02-S01 →'))
  expect(secaoMapa({ ...mapa, at: 999 })).toBe(t)
})

test('A47: secaoMapa for 9 sets x 21 specs stays under 2,800 characters, cut with e mais', async () => {
  const specs: Record<string, any> = {}
  for (let i = 0; i < 21; i++) {
    const c = `C0${(i % 9) + 1}`
    const id = `${c}-S${String(Math.floor(i / 9) + 1).padStart(2, '0')}`
    specs[id] = { conjunto: c, nome: `novarc-NOVARC-PLUGIN-MAESTRO-${id}`, sessao: `local_${String(i).padStart(8, '0')}-a0fd-458b-97bb-a000462a4325`, slug: `${id.toLowerCase()}-um-slug-bem-comprido-aqui`, agentId: `agent_${'f'.repeat(24)}` }
  }
  const t = secaoMapa({ conjuntos: {}, specs, orquestrador: null, at: 0 })
  expect(t.length).toBeLessThan(2800)
  expect(/e mais \d+/.test(t)).toBe(true)
})

test('A34: the turn line', async () => {
  expect(resumoTurno('C02', 3, 5, 1, 38_000)).toBe('38s · C02 3/5 · 1 lock')
  expect(resumoTurno('C02', 3, 5, 0, 38_000)).toBe('38s · C02 3/5')
  expect(resumoTurno('C02', 3, 5, 2, 125_000)).toBe('2m 5s · C02 3/5 · 2 lock')
})

// ---- set session: reports upward, proven routing downward (Task 6): A13, A16, A20, A21, A22, R2-3, R3-3, R3-4

import { tick } from './mundo-teste'

const LDIR6 = 'C:/repo/.novarc/ledger/session-build/20261023-0930'
const ORQ_NOME = 'novarc-orq-NOVARC-PLUGIN-MAESTRO'
const ST = (t: string) => `  # ${t}`
const DISPATCH6 = `NOTE ORCHESTRATOR-SESSION ${IDC} (novarc-NOVARC-PLUGIN-MAESTRO-C02); DISPATCH ${S01}=${ID1} (a); ${S02}=${ID2} (b)${ST('2026-10-23T09:31:00Z')}\n`
const ROW6 = `NOTE ORQUESTRADOR ${ORQ_NOME} [253bb9]${ST('2026-10-23T09:30:00Z')}\n`
const GRANT = `GO ${S02} migration 0042_espelho.sql`
/** What the mod appended through ledger.py, per type (the `--text` value, argv joined by spaces). */
const anexos = (m: Mundo, tipo: string) =>
  m.runs.filter(r => r.includes(' append ') && r.includes(`--type ${tipo} --text `)).map(r => r.slice(r.indexOf('--text ') + 7))
/** Every message the mod sent ($.session.send): received ones carry no `to`, a log line goes `to: 'transcript'`. */
const enviados = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e === 'object' && 'to' in e && e.to !== 'transcript' && typeof e.text === 'string')
const posicao = (m: Mundo, f: (e: any) => boolean) => m.eventos.findIndex(x => f(x.e))
const ehRun = (tipo: string) => (e: any) => Array.isArray(e?.argv) && e.argv.includes(tipo) && e.argv.includes('append')
const ehEnvio = (texto: string) => (e: any) => !!e && typeof e === 'object' && 'to' in e && e.to !== 'transcript' && e.text === texto
const peer = ($: any, text: string) => $.session.receive?.({ origin: { kind: 'peer' }, text })
const recente = () => new Date().toISOString()

/** A C02 set session on `LDIR6`, with or without the planning artifact (db: config/orquestracao.runId). */
async function conjunto6($: any, on: any, ledger: string, comPlano: boolean) {
  const m = montar(on, {}, 'main', comPlano)
  if (comPlano) {
    gravar(m, 'C:/repo/ai/specs/EXM/artefato.txt', `${URL_MUNDO}\n`)
    m.db = { 'config/orquestracao': { data: { runId: '20261023-0930' }, version: 1 } }
  }
  gravar(m, `${LDIR6}/ledger.md`, `# session-build - run 20261023-0930\n${ledger}`)
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `conjunto ${URL_MUNDO} C02` })
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${LDIR6} --type NOTE --text "x"` })
  await quieto(m)
  return m
}

test('A13, A22: the report goes once every manifest is in the fork ledgers, proof line first, again only on a new revision', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6, true)
  gravar(m, `${LDIR6}/fork-${S01}.md`, `READY ${S01}${ST('2026-10-23T10:00:00Z')}\nSURFACES ${S01} files: hooks/maestro/register.tsx${ST('2026-10-23T10:10:00Z')}\n`)
  await peer($, `SURFACES ${S01} files: hooks/maestro/register.tsx`)
  await tick(m)
  expect(enviados(m)).toEqual([])
  const s02 = `READY ${S02}${ST('2026-10-23T10:00:00Z')}\nSURFACES ${S02} files: ${PAGINA}${ST('2026-10-23T10:12:00Z')}\n`
  gravar(m, `${LDIR6}/fork-${S02}.md`, s02)
  await peer($, `SURFACES ${S02} files: ${PAGINA}`)
  await tick(m)
  const relato = `CONJUNTO C02 manifestos disjuntos ${S01} ${S02}`
  expect(enviados(m).map(e => [e.to, e.text])).toEqual([[ORQ_NOME, relato]])
  const provas = anexos(m, 'NOTE').filter(t => t.startsWith('RELATO '))
  expect(provas.length).toBe(1)
  expect(provas[0]).toMatch(new RegExp(`^RELATO ${relato} rev ${S01}=1\\.[0-9a-f]{8} ${S02}=1\\.[0-9a-f]{8}$`))
  expect(posicao(m, ehRun('NOTE'))).toBeLessThan(posicao(m, ehEnvio(relato)))
  await tick(m)
  expect(enviados(m).length).toBe(1) // same revisions: nothing again
  gravar(m, `${LDIR6}/fork-${S02}.md`, `${s02}SURFACES ${S02} files: ${PAGINA}${ST('2026-10-23T10:20:00Z')}\n`)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual([relato, relato])
  expect(anexos(m, 'NOTE').filter(t => t.startsWith('RELATO ')).at(-1)).toContain(` ${S02}=2.`)
  // A22: the set mod never originates a directive
  expect(enviados(m).some(e => /^(GO|HOLD|status)\b/.test(e.text))).toBe(false)
})

test('A16 set half: an APPLIED that frees a waited lock sends one release report', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, ROW6, false)
  gravar(m, `${LDIR6}/fork-${S01}.md`, `LOCK migration 0042_espelho.sql${ST('2026-10-23T12:00:00Z')}\nAPPLIED 0042_espelho.sql${ST('2026-10-23T12:30:00Z')}\n`)
  gravar(m, `${LDIR6}/fork-${S02}.md`, `LOCK migration 0042_espelho.sql${ST('2026-10-23T12:10:00Z')}\n`)
  m.sweep = { exitCode: 1, stdout: `SWEEP OUTSTANDING ${S02} migration 0042_espelho.sql [UNGRANTED] since=2026-10-23T12:10:00Z LOCK migration 0042_espelho.sql\nSWEEP SUMMARY forks=2 grants=0 outstanding=1 ungranted=1\n` }
  m.avanco = 10_000
  await tick(m)
  await tick(m)
  const r = `CONJUNTO C02 release migration 0042_espelho.sql ${S02}`
  expect(enviados(m).map(e => [e.to, e.text])).toEqual([[ORQ_NOME, r]])
  expect(anexos(m, 'NOTE')).toContain(`RELATO ${r}`)
})

test('A20: a GO proven by an orchestrator auditoria row is relayed verbatim once, RELAY and GO appended first', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, true)
  m.db!['auditoria/orq-1'] = { data: { linha: GRANT, papel: 'orquestrador', origem: 'maestro', estado: 'enviado', runId: '20261023-0930', alvo: 'C02-S02', at: recente() }, version: 1 }
  await peer($, GRANT)
  await quieto(m)
  const fwd = enviados(m)
  expect(fwd.length).toBe(1)
  expect(fwd[0].text).toBe(GRANT)
  expect(JSON.stringify(fwd[0].to)).toContain(ID2)
  expect(anexos(m, 'RELAY')).toEqual([`${GRANT} to ${S02} orq-1`])
  expect(anexos(m, 'GO')).toEqual([`${S02} migration 0042_espelho.sql`])
  expect(posicao(m, ehRun('RELAY'))).toBeLessThan(posicao(m, ehEnvio(GRANT)))
  expect(posicao(m, ehRun('GO'))).toBeLessThan(posicao(m, ehEnvio(GRANT)))
  // a replayed copy of the same line finds its proof already relayed
  await peer($, GRANT)
  await quieto(m)
  await tick(m)
  expect(enviados(m).length).toBe(1)
  expect(anexos(m, 'RELAY').length).toBe(1)
})

test('A21: no proof is retried on two looks then SEM-PROVA; a proof for another set and another set spec are RECUSADO', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, true)
  // an old row (over 15 min) and one of another run prove nothing
  m.db!['auditoria/velha'] = { data: { linha: GRANT, papel: 'orquestrador', origem: 'maestro', estado: 'enviado', runId: '20261023-0930', alvo: 'C02-S02', at: new Date(Date.now() - 16 * 60_000).toISOString() }, version: 1 }
  m.db!['auditoria/outro-run'] = { data: { linha: GRANT, papel: 'orquestrador', origem: 'maestro', estado: 'enviado', runId: '20261022-1202', alvo: 'C02-S02', at: recente() }, version: 1 }
  await peer($, GRANT)
  await quieto(m)
  await tick(m)
  expect(anexos(m, 'NOTE').filter(t => t.includes('SEM-PROVA'))).toEqual([])
  await tick(m)
  expect(anexos(m, 'NOTE').filter(t => t.includes('SEM-PROVA'))).toEqual([`GO-SEM-PROVA ${S02}`])
  const st = `status ${S01}?`
  m.db!['auditoria/orq-2'] = { data: { linha: st, papel: 'orquestrador', origem: 'maestro', estado: 'enviado', runId: '20261023-0930', alvo: 'C03-S01', at: recente() }, version: 1 }
  await peer($, st)
  await peer($, 'GO c03-s01-guardas phase 4')
  await quieto(m)
  expect(anexos(m, 'NOTE').filter(t => t.includes('RECUSADO')).sort()).toEqual(['GO-RECUSADO c03-s01-guardas', `STATUS-RECUSADO ${S01}`])
  await tick(m)
  expect(enviados(m)).toEqual([])
})

test('R2-3: an agent row flushed after the line arrived proves it on the next look', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, true)
  const st = `status ${S01}?`
  await peer($, st)
  await quieto(m)
  expect(enviados(m)).toEqual([])
  m.db!['auditoria/20261023T101500000Z-orq-1'] = { data: { linha: st, papel: 'orquestrador', origem: 'agente', estado: null, runId: '20261023-0930', alvo: 'C02-S01', at: recente() }, version: 1 }
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual([st])
  expect(JSON.stringify(enviados(m)[0].to)).toContain(ID1)
  expect(anexos(m, 'GO')).toEqual([]) // a status is no lock grant
})

const ORQ_DIR = 'C:/repo/.novarc/ledger/novarc-orq/20261023-0930'

test('R3-4, R4-3: without an artifact the orchestrator ledger RELAY line proves the exact text', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, false)
  const go = `GO ${S01} phase 4`
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 go-${S01}-fase4-20261023-0930 ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  await peer($, `GO ${S01} phase 4 agora`) // not the exact line: no proof
  await peer($, go)
  await quieto(m)
  expect(enviados(m).map(e => e.text)).toEqual([go])
  expect(anexos(m, 'RELAY')).toEqual([`${go} to ${S01} go-${S01}-fase4-20261023-0930`])
  expect(anexos(m, 'GO')).toEqual([])
})

test('R3-3: after a reload the set ledger RELAY lines keep a relayed proof from going twice', LENTO, async ($: any, on: any) => {
  const go = `GO ${S01} phase 4`
  const chave = `go-${S01}-fase4-20261023-0930`
  const m = await conjunto6($, on, `${DISPATCH6}${ROW6}RELAY ${go} to ${S01} ${chave}${ST('2026-10-23T10:31:00Z')}\n`, false)
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 ${chave} ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  await peer($, go)
  await quieto(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'RELAY')).toEqual([])
})

// ---- orchestrator: enviar and directive-nudge (Task 7): A14-A19, A23, A27-A29, R2-5, R3-1, R7; carried set minors

import { SESSOES } from './mundo-teste'

const COD = 'NOVARC-PLUGIN-MAESTRO'
const RUN = '20261023-0930'
const PLANO7 = {
  conjuntos: [{ id: 'C02', titulo: 'Alertas', specs: ['C02-S01', 'C02-S02'] }],
  specs: [{ id: 'C02-S01', conjunto: 'C02', slug: 'alertas-locks-espelho' }, { id: 'C02-S02', conjunto: 'C02', slug: 'pendencias-no-painel' }],
  projeto: { cliente: 'NOVARC', nomeCurto: 'Maestro', codigo: COD },
  execucao: { orquestrador: ORQ_NOME },
}
const NOME_C02 = `novarc-${COD}-C02`
const DISJ = `CONJUNTO C02 manifestos disjuntos ${S01} ${S02}`
/** Whole seconds: a key stamp carries no milliseconds. */
const seg = (ms: number) => Math.floor(ms / 1000) * 1000
const stamp = (ms: number) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z').replace(/[-:]/g, '').toLowerCase()
const surf = (slug: string, ...linhas: string[]) => linhas.map((t, i) => `SURFACES ${slug} files: ${t}${ST(`2026-10-23T10:1${i}:00Z`)}\n`).join('')
const revDe = (texto: string, slug: string) => manifestosDoLedger(texto)[slug]!.rev
const prova = (relato: string, revs: Record<string, string>, quando = '2026-10-23T10:20:00Z') => `NOTE ${linhaProvaRelato(relato, revs)}${ST(quando)}\n`
const auditoriaDe = (m: Mundo, chave: string) => m.db?.[`auditoria/${chave}`]?.data
/** Fires every pending `$.clock.after(0)` (the report wake-up). */
async function acordar(m: Mundo) {
  for (const t of m.timers.filter(x => x.ms === 0 && !x.disparado && !x.abortado)) {
    t.disparado = true
    t.fire()
  }
  await quieto(m)
}
const automaticos = (m: Mundo) => m.eventos.map(x => x.e).filter(e => e && typeof e.text === 'string' && !('to' in e) && e.text.startsWith('Maestro (automático):'))
const abriuSessao = (m: Mundo) => m.tools.some((t: any) => t.tool === 'mcp__ccd_session__start_session')

/**
 * An orchestrator session on `ORQ_DIR` (run 20261023-0930) served from state, a live C02 set session in the registry on
 * `LDIR6`; with `plano`, the planning context and db (the 5-minute poll is fired once so `banco` holds the db).
 */
async function orq7($: any, on: any, o: { plano?: boolean; conjuntos?: Record<string, any>; db?: Record<string, any>; ledgerOrq?: string; estado?: Record<string, unknown>; semPoll?: boolean } = {}) {
  const m = montar(on, {}, 'main', !!o.plano)
  if (o.plano) m.db = { 'config/orquestracao': { data: { runId: RUN }, version: 1 }, ...o.db }
  gravar(m, `${ORQ_DIR}/ledger.md`, o.ledgerOrq ?? '# novarc-orq - run 20261023-0930\n')
  gravar(m, `${SESSOES}/set-c02.json`, JSON.stringify({ sessao: 'set-c02', cwd: 'C:/repo', titulo: 'x', papel: 'conjunto', forks: 2, feitos: 0, alerta: null, at: Date.now(), codigo: COD, conjunto: 'C02', ledgerDir: LDIR6 }))
  m.servirEstado = {
    exec: { papel: 'orquestrador', ledgerDir: ORQ_DIR, forks: {}, codigo: COD, conjuntos: o.conjuntos ?? {} },
    ...(o.plano ? { ctx: { artefato: URL_MUNDO, plano: PLANO7, conjunto: null, spec: null, papel: 'orquestrador' } } : {}),
    ...o.estado,
  }
  await iniciar($)
  await quieto(m)
  if (o.plano && !o.semPoll) {
    disparar(m, 300_000)
    await quieto(m)
  }
  return m
}

/** The C02 set ledger dir: ledger.md (address lines plus `extra`) and both fork files with one SURFACES each. */
function conjuntoNoDisco(m: Mundo, extra: string, f1 = surf(S01, 'hooks/maestro/register.tsx'), f2 = surf(S02, PAGINA)) {
  gravar(m, `${LDIR6}/fork-${S01}.md`, f1)
  gravar(m, `${LDIR6}/fork-${S02}.md`, f2)
  gravar(m, `${LDIR6}/ledger.md`, `# session-build - run ${RUN}\n${DISPATCH6}${ROW6}${extra}`)
  return { r1: revDe(f1, S01), r2: revDe(f2, S02) }
}

test('A14, A29: a proven disjoint report sends one GO per slug, enviando before the send and enviado after; again nothing', LENTO, async ($: any, on: any) => {
  const noEnvio: (string | undefined)[] = []
  const m = await orq7($, on, { plano: true })
  m.entrega = (e: any) => {
    if (String(e.text).startsWith('GO ')) noEnvio.push(auditoriaDe(m, `go-${String(e.text).split(' ')[1]}-fase4-${RUN}`)?.estado)
    return null
  }
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await tick(m)
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m).map(e => e.text)).toEqual([`GO ${S01} phase 4`, `GO ${S02} phase 4`])
  expect(enviados(m).every(e => JSON.stringify(e.to).includes(IDC))).toBe(true)
  expect(noEnvio).toEqual(['enviando', 'enviando'])
  const d = auditoriaDe(m, `go-${S01}-fase4-${RUN}`)
  expect([d.estado, d.acao, d.alvo, d.linha, d.origem, d.papel, d.runId, d.regra]).toEqual(['enviado', 'GO', 'C02-S01', `GO ${S01} phase 4`, 'maestro', 'orquestrador', RUN, 'dispatch-prompts.md:458'])
  expect(m.toasts).toContain(`Maestro enviou GO a novarc-${COD}-C02-S01: manifestos disjuntos`)
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  await tick(m)
  expect(enviados(m).length).toBe(2)
  expect(abriuSessao(m)).toBe(false)
})

test('A15: a colisao report sends nothing and writes no auditoria entry', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const col = `CONJUNTO C02 manifestos colisao ${S01}:hooks/maestro/register.tsx ${S02}:hooks/maestro/register.tsx`
  conjuntoNoDisco(m, prova(col, {}))
  await peer($, col)
  await quieto(m)
  await acordar(m)
  expect(enviados(m)).toEqual([])
  expect(auditorias(m)).toEqual([])
})

test('R3-1: a report with no NOTE RELATO sends nothing (RELATO-SEM-PROVA); a stale revision sends nothing (RELATO-VELHO)', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'NOTE')).toEqual(['RELATO-SEM-PROVA C02'])
  // the proof names S02's first manifest, but S02 sent a second one since
  const f2 = surf(S02, PAGINA, `${PAGINA} hooks/maestro/kit.tsx`)
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }), undefined, f2)
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'NOTE')).toEqual(['RELATO-SEM-PROVA C02', 'RELATO-VELHO C02'])
  expect(auditorias(m)).toEqual([])
})

test('R3-1: a spec held by a pendencia is left out of the expected slugs', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true, db: { 'specs/C02-S02': { data: { etapa: 'plano', bloqueios: { 'pendencia:p-cliente': { motivo: 'x' } } }, version: 1 } } })
  const so1 = `CONJUNTO C02 manifestos disjuntos ${S01}`
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'NOTE')).toEqual(['RELATO-SEM-PROVA C02'])
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }) + prova(so1, { [S01]: r1 }))
  await peer($, so1)
  await quieto(m)
  await acordar(m)
  expect(enviados(m).map(e => e.text)).toEqual([`GO ${S01} phase 4`])
})

test('R7: a re-sent manifest gets the second GO key; the other slug is not sent again', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m).length).toBe(2)
  const f1 = surf(S01, 'hooks/maestro/register.tsx', 'hooks/maestro/register.tsx')
  const r1b = revDe(f1, S01)
  expect(r1b.startsWith('2.')).toBe(true)
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }) + prova(DISJ, { [S01]: r1b, [S02]: r2 }, '2026-10-23T10:40:00Z'), f1)
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  expect(enviados(m).map(e => e.text)).toEqual([`GO ${S01} phase 4`, `GO ${S02} phase 4`, `GO ${S01} phase 4`])
  expect(auditoriaDe(m, `go-${S01}-fase4-${RUN}-2`)?.estado).toBe('enviado')
})

test('A16 orchestrator half: a proven release report sends the grant to the set session and toasts RELEASE', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const rel = `CONJUNTO C02 release migration 0042_espelho.sql ${S02}`
  conjuntoNoDisco(m, prova(rel, {}, '2026-10-23T13:05:00Z'))
  await peer($, rel)
  await quieto(m)
  await acordar(m)
  expect(enviados(m).map(e => e.text)).toEqual([GRANT])
  expect(JSON.stringify(enviados(m)[0].to)).toContain(IDC)
  expect(m.toasts).toContain(`Maestro enviou RELEASE a novarc-${COD}-C02-S02: esperava o lock`)
  expect(auditoriaDe(m, `release-migration-0042_espelho.sql-${S02}-20261023t130500z`)?.acao).toBe('RELEASE-REPASSADO')
})

test('A17, A28: a quiet set gets status at the threshold, a second at the next, no third; one sem-resposta toast', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { plano: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } } })
  await tick(m)
  expect(enviados(m).map(e => [e.to, e.text])).toEqual([[NOME_C02, 'status C02?']])
  expect(m.toasts).toContain(`Maestro enviou status a ${NOME_C02}: calado há 16 min`)
  expect(auditoriaDe(m, `status-c02-${stamp(at)}-1`)?.estado).toBe('enviado')
  m.avanco = 16 * 60_000
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?', 'status C02?'])
  expect(auditoriaDe(m, `status-c02-${stamp(at)}-2`)?.acao).toBe('STATUS-PEDIDO')
  m.avanco = 32 * 60_000
  await tick(m)
  await tick(m)
  expect(enviados(m).length).toBe(2)
  expect(m.toasts.filter(t => t === 'Maestro: C02 sem resposta a 2 pedidos de status').length).toBe(1)
  expect(abriuSessao(m)).toBe(false)
})

test('A18: an orphan GRANTED-NOT-RELEASED lock gets one status to the holder set and one LOCK-COBRADO entry', LENTO, async ($: any, on: any) => {
  const desde = new Date(seg(Date.now() - 25 * 60_000)).toISOString().replace(/\.\d+Z$/, 'Z')
  const lock = { spec: 'C02-S01', kind: 'migration', resource: '0042_espelho.sql', desde, estado: 'GRANTED-NOT-RELEASED', minutos: 25, orfao: true }
  const al = { lista: [{ chave: `lock:C02-S01:migration:0042_espelho.sql:${desde}`, texto: 'x', toast: 'x', nivel: 'erro', at: 0 }], alertasVistos: [], sweep: null, limiares: { calado: 15, lockOrfao: 20 }, olhares: 0, vista: { locks: [lock], slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null } }
  const m = await orq7($, on, { plano: true, estado: { maestroAlertas: al, maestroMapa: MAPA } })
  await tick(m)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual([`status ${S01}?`])
  expect(JSON.stringify(enviados(m)[0].to)).toContain(IDC)
  const docs = auditorias(m).map(([, d]) => d.data)
  expect(docs.map(d => [d.acao, d.alvo, d.estado])).toEqual([['LOCK-COBRADO', 'C02-S01', 'enviado']])
})

test('A19, A29: an UNGRANTED slot request past the orphan threshold queues one Maestro (automático) turn and sends nothing', LENTO, async ($: any, on: any) => {
  const quando = new Date(seg(Date.now() - 25 * 60_000)).toISOString().replace(/\.\d+Z$/, 'Z')
  const lockLinha = `LOCK verify feat/c02-s02-pendencias-no-painel-20261023 C02`
  const m = await orq7($, on, { ledgerOrq: `# novarc-orq\n${lockLinha}${ST(quando)}\n` })
  await tick(m)
  await tick(m)
  expect(enviados(m)).toEqual([])
  const turnos = automaticos(m)
  expect(turnos.length).toBe(1)
  expect(turnos[0].text).toContain(lockLinha)
  expect(abriuSessao(m)).toBe(false)
})

test('A23: with config/continuo.modo pausado nothing is sent and no auditoria entry is created', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { plano: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } }, db: { 'config/continuo': { data: { modo: 'pausado' }, version: 1 } } })
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(auditorias(m)).toEqual([])
})

test('A27: without a planning artifact the RELAY line goes to the orchestrator ledger before the send', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { conjuntos: { C02: { etapa: 'implementacao', texto: '', at } } })
  await tick(m)
  const chave = `status-c02-${stamp(at)}-1`
  expect(anexos(m, 'RELAY')).toEqual([`STATUS-PEDIDO C02 ${chave} status C02?`])
  expect(m.runs.find(r => r.includes('--type RELAY'))).toContain(`--dir ${ORQ_DIR}`)
  expect(posicao(m, ehRun('RELAY'))).toBeLessThan(posicao(m, ehEnvio('status C02?')))
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
})

test('R2-5, A27 reload half: after a restart the RELAY line seeds the first key; the second request of the episode still goes once', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const k1 = `status-c02-${stamp(at)}-1`
  const m = await orq7($, on, { conjuntos: { C02: { etapa: 'implementacao', texto: '', at } }, ledgerOrq: `# novarc-orq\nRELAY STATUS-PEDIDO C02 ${k1} status C02?${ST(new Date().toISOString())}\n` })
  await tick(m)
  expect(enviados(m)).toEqual([])
  m.avanco = 16 * 60_000
  await tick(m)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
  expect(anexos(m, 'RELAY')).toEqual([`STATUS-PEDIDO C02 status-c02-${stamp(at)}-2 status C02?`])
})

// ---- carried set-session minors (Task 6 review)

test('fix: a proven GO with no address logs GO-SEM-ENDERECO and writes no RELAY', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, ROW6, false)
  const go = `GO ${S01} phase 4`
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 go-${S01}-fase4-${RUN} ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  await peer($, go)
  await quieto(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'RELAY')).toEqual([])
  expect(anexos(m, 'NOTE')).toEqual([`GO-SEM-ENDERECO ${S01}`])
})

test('fix: a relay the target session does not receive logs RELAY-NAO-ENTREGUE', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, false)
  m.entrega = (e: any) => (String(e.text).startsWith('GO ') ? { isDelivered: false, reason: 'session not found' } : null)
  const go = `GO ${S01} phase 4`
  const chave = `go-${S01}-fase4-${RUN}`
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 ${chave} ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  await peer($, go)
  await quieto(m)
  expect(anexos(m, 'RELAY')).toEqual([`${go} to ${S01} ${chave}`])
  expect(anexos(m, 'NOTE')).toEqual([`RELAY-NAO-ENTREGUE ${S01} ${chave}`])
})

test('fix: a set session known only from a ledger.py call takes its set from the ORCHESTRATOR-SESSION line', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  gravar(m, `${LDIR6}/ledger.md`, `# session-build - run ${RUN}\n${DISPATCH6}${ROW6}`)
  const go = `GO ${S01} phase 4`
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 go-${S01}-fase4-${RUN} ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${LDIR6} --type NOTE --text "x"` })
  await quieto(m)
  await peer($, go)
  await quieto(m)
  expect(enviados(m).map(e => e.text)).toEqual([go])
  expect(JSON.stringify(enviados(m)[0].to)).toContain(ID1)
})

test('fix: a set session with no set known logs one line and routes nothing', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  gravar(m, `${LDIR6}/ledger.md`, `# session-build - run ${RUN}\n${ROW6}`)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: `python ledger.py append --dir ${LDIR6} --type NOTE --text "x"` })
  await quieto(m)
  await peer($, `GO ${S01} phase 4`)
  await peer($, `GO ${S02} phase 4`)
  await quieto(m)
  expect(enviados(m)).toEqual([])
  expect(m.logs.filter(l => l === 'maestro: conjunto desta sessão desconhecido, relatos e repasses parados').length).toBe(1)
})

test('fix: after a reload the set ledger RELAY lines are re-seeded at session start, before any look', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  const go = `GO ${S01} phase 4`
  const chave = `go-${S01}-fase4-${RUN}`
  gravar(m, `${LDIR6}/ledger.md`, `# session-build - run ${RUN}\n${DISPATCH6}${ROW6}RELAY ${go} to ${S01} ${chave}${ST('2026-10-23T10:31:00Z')}\n`)
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY GO C02 ${chave} ${go}${ST('2026-10-23T10:30:00Z')}\n`)
  m.servirEstado = { exec: { papel: 'conjunto', ledgerDir: LDIR6, forks: {}, conjunto: 'C02' } }
  await iniciar($)
  await quieto(m)
  await peer($, go)
  await quieto(m)
  expect(enviados(m)).toEqual([])
  expect(anexos(m, 'RELAY')).toEqual([])
  expect(anexos(m, 'NOTE')).toEqual([])
})

// ---- Task 7 fix round 1: gates before the first poll, reports derived from disk, GO append failure

const listasConfig = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && t.action === 'list' && t.collection === 'config').length

test('fix 1, A23: paused before the first poll (banco empty after a reload): one config read decides, nothing is sent', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { plano: true, semPoll: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } }, db: { 'config/continuo': { data: { modo: 'pausado' }, version: 1 } } })
  await tick(m)
  expect(enviados(m)).toEqual([])
  expect(auditorias(m)).toEqual([])
  expect(listasConfig(m)).toBe(1)
})

test('fix 1: a config read that fails before the first poll sends nothing; the next tick reads again and sends', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { plano: true, semPoll: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } } })
  m.falharTool = (e: any) => e.action === 'list' && e.collection === 'config'
  await tick(m)
  expect(enviados(m)).toEqual([])
  m.falharTool = null
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual(['status C02?'])
})

test('fix 2: a report whose proof is on disk is sent after a reload with no message received, once', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await tick(m)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual([`GO ${S01} phase 4`, `GO ${S02} phase 4`])
})

test('fix 2: a report received while paused is sent once after the pause ends', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true, db: { 'config/continuo': { data: { modo: 'pausado' }, version: 1 } } })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await peer($, DISJ)
  await quieto(m)
  await acordar(m)
  await tick(m)
  await tick(m)
  expect(enviados(m)).toEqual([])
  m.db!['config/continuo']!.data.modo = 'manual'
  disparar(m, 300_000)
  await quieto(m)
  await tick(m)
  await tick(m)
  expect(enviados(m).map(e => e.text)).toEqual([`GO ${S01} phase 4`, `GO ${S02} phase 4`])
})

test('fix 4: a GO append that fails after the RELAY line logs RELAY-NAO-ENTREGUE and sends nothing', LENTO, async ($: any, on: any) => {
  const m = await conjunto6($, on, DISPATCH6 + ROW6, false)
  const chave = `release-migration-0042_espelho.sql-${S02}-20261023t130500z`
  gravar(m, `${ORQ_DIR}/ledger.md`, `RELAY RELEASE-REPASSADO C02-S02 ${chave} ${GRANT}${ST('2026-10-23T13:05:00Z')}\n`)
  m.falharRun = (argv: string[]) => argv.includes('append') && argv.includes('GO')
  await peer($, GRANT)
  await quieto(m)
  expect(anexos(m, 'RELAY')).toEqual([`${GRANT} to ${S02} ${chave}`])
  expect(anexos(m, 'NOTE')).toEqual([`RELAY-NAO-ENTREGUE ${S02} ${chave}`])
  expect(enviados(m)).toEqual([])
})

// ---- Task 7 fix round 2: directives the orchestrator agent sent by hand take their key; the gate's config read

const doMod = (m: Mundo) => enviados(m).filter(e => e.origin?.kind === 'plugin')
const agente = ($: any, text: string) => $.session.send?.({ to: NOME_C02, text, origin: { kind: 'model' } })
const linhasDe = (m: Mundo, linha: string) => auditorias(m).filter(([, d]) => d.data.linha === linha)

test('fix round 2: an agent GO sent before the nudge takes the mod key; the mod does not send it again', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await agente($, `GO ${S01} phase 4`)
  await quieto(m)
  await tick(m)
  await tick(m)
  expect(doMod(m).map(e => e.text)).toEqual([`GO ${S02} phase 4`])
  const rows = linhasDe(m, `GO ${S01} phase 4`)
  expect(rows.map(([k, d]) => [k, d.data.origem])).toEqual([[`auditoria/go-${S01}-fase4-${RUN}`, 'agente']])
  expect(escrito(m, 'auditoriaPendente') ?? []).toEqual([])
})

test('fix round 2: an agent GO for the second manifest maps to the -2 key', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  const f1 = surf(S01, 'hooks/maestro/register.tsx', 'hooks/maestro/register.tsx')
  conjuntoNoDisco(m, '', f1)
  await agente($, `GO ${S01} phase 4`)
  await quieto(m)
  expect(auditoriaDe(m, `go-${S01}-fase4-${RUN}-2`)?.origem).toBe('agente')
  expect(auditoriaDe(m, `go-${S01}-fase4-${RUN}`)).toBe(undefined)
})

test('fix round 2: after a restart the agent row seeds its key and the mod does not send it', LENTO, async ($: any, on: any) => {
  const row = { linha: `GO ${S01} phase 4`, papel: 'orquestrador', origem: 'agente', estado: 'enviado', runId: RUN, acao: 'GO', alvo: 'C02-S01', at: new Date().toISOString() }
  const m = await orq7($, on, { plano: true, db: { [`auditoria/go-${S01}-fase4-${RUN}`]: { data: row, version: 1 } } })
  const { r1, r2 } = conjuntoNoDisco(m, '')
  conjuntoNoDisco(m, prova(DISJ, { [S01]: r1, [S02]: r2 }))
  await tick(m)
  expect(doMod(m).map(e => e.text)).toEqual([`GO ${S02} phase 4`])
})

test('fix round 2: an agent status for an open quiet alert takes the episode key; no key keeps the observed row', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 16.5 * 60_000)
  const m = await orq7($, on, { plano: true, semPoll: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } } })
  disparar(m, 300_000)
  await quieto(m)
  await agente($, 'status C02?')
  await quieto(m)
  expect(auditoriaDe(m, `status-c02-${stamp(at)}-1`)?.origem).toBe('agente')
  await tick(m)
  expect(doMod(m)).toEqual([])
  await agente($, 'HOLD C02 colisão com C03')
  await quieto(m)
  expect((escrito(m, 'auditoriaPendente') ?? []).map((x: any) => x.doc.acao)).toEqual(['HOLD'])
})

test('fix round 2: the gate config read before the first poll leaves the alerts as they were', LENTO, async ($: any, on: any) => {
  const at = seg(Date.now() - 5 * 60_000)
  const m = await orq7($, on, {
    plano: true, semPoll: true, conjuntos: { C02: { etapa: 'implementacao', texto: '', at } },
    db: { 'config/orquestracao': { data: { runId: RUN, limiares: { calado: 1, lockOrfao: 20, fonte: 'medido', at: 'x' } }, version: 1 } },
  })
  await tick(m)
  await tick(m)
  const al = escrito(m, 'maestroAlertas')
  expect(al.lista).toEqual([])
  expect(al.limiares).toEqual({ calado: 15, lockOrfao: 20 })
  expect(doMod(m)).toEqual([])
})

// ---- C03-S01 Task 8: the db refresh of a spec session (R37, R44)
import { disparar as dispararP } from './mundo-teste'

const listasDe = (m: Mundo, n = 0) => m.tools.slice(n).filter((t: any) => t.tool === 'ArtifactData' && t.action === 'list').map((t: any) => t.collection)

test('A43: a spec session idle for 10 looks with the poll firing twice lists specs and execucao only (R44)', LENTO, async ($: any, on: any) => {
  const m = await comBanco($, on, {})
  const n = m.tools.length
  for (let i = 0; i < 10; i++) await tick(m)
  for (let i = 0; i < 2; i++) {
    dispararP(m, 300_000)
    await quieto(m)
  }
  const chamadas = m.tools.slice(n).filter((t: any) => t.tool === 'ArtifactData')
  expect(chamadas.length).toBeLessThanOrEqual(4)
  expect(listasDe(m, n)).toEqual(['specs', 'execucao', 'specs', 'execucao'])
})

test('R37: a received HOLD triggers one refresh (2 lists) at once and the next commit warns with the HOLD text', LENTO, async ($: any, on: any) => {
  const m = await comBanco($, on, {})
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'git commit -m x' }))).toBe(undefined)
  m.db!['execucao/C01'] = { data: { bloqueios: { hold: { at: 'x' } } }, version: 2 }
  const n = m.tools.length
  await $.session.receive?.({ origin: { kind: 'peer-send-message' }, text: 'HOLD C01 colisão' })
  await quieto(m)
  expect(listasDe(m, n)).toEqual(['execucao', 'config'])
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'git commit -m x' }))).toBe(TEXTOS.hold('C01'))
})

// ---- C03-S01 Task 9: the address map in the prompt and the terminal turn line (A31, A32, A34)

const ID_S1 = 'local_11111111-0000-4000-8000-000000000001'
const MAPA9 = {
  conjuntos: { C02: { nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02', sessao: 'local_cccccccc-0000-4000-8000-00000000000c' } },
  specs: {
    'C02-S01': { conjunto: 'C02', nome: 'novarc-NOVARC-PLUGIN-MAESTRO-C02-S01', sessao: ID_S1, slug: 'c02-s01-x', agentId: null },
  },
  orquestrador: null,
  at: 5,
}
const ids9 = (r: any) => r.sections.map((s: any) => s.id)
const MAPA_ID = 'novarc:maestro-mapa'
/** The engine's own composition under the mod's hook. */
const baseCompose = (on: any) => on('prompt.compose', async () => ({ sections: [{ id: 'engine', scope: 'shared', text: 'e' }] }))
const compor = ($: any) => $.prompt.compose({ model: 'm', promptModel: 'm', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] })
const noEstado = (m: Mundo) => m.tools.filter((t: any) => t.tool === 'ArtifactData' && JSON.stringify(t).includes('maestro · endereços'))

test('A31: the orchestrator compose ends with the address map section; two composes are ===, no ArtifactData carries it', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  const m = await orq7($, on, { plano: true, estado: { maestroMapa: MAPA9 } })
  const a = await compor($)
  const b = await compor($)
  const s = a.sections.at(-1)
  expect(s.id).toBe(MAPA_ID)
  expect(s.scope).toBe('session')
  expect(s.text).toContain(`C02-S01 → novarc-NOVARC-PLUGIN-MAESTRO-C02-S01 (${ID_S1})`)
  expect(b.sections.at(-1).text === s.text).toBe(true)
  expect(noEstado(m)).toEqual([])
})

test('A32: the section is rebuilt on every compose, so a compaction cannot drop it', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  await orq7($, on, { plano: true, estado: { maestroMapa: MAPA9 } })
  const a = await compor($)
  const b = await compor($)
  expect([ids9(a).at(-1), ids9(b).at(-1)]).toEqual([MAPA_ID, MAPA_ID])
})

test('A31: outside a run and in a spec session the sections are the engine own', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  montar(on, {}, 'main')
  await iniciar($)
  expect(ids9(await compor($))).not.toContain(MAPA_ID)
})

test('A31: a spec session gets no map section', LENTO, async ($: any, on: any) => {
  baseCompose(on)
  const m = await comBanco($, on, {})
  expect(m).toBeDefined()
  expect(ids9(await compor($))).not.toContain(MAPA_ID)
})

async function turno($: any, surface: string, durationMs = 38_000) {
  const t = await $.ui.mount({ plugin: 'novarc', surface, component: 'TurnDuration', props: { word: 'Baked', durationMs } } as any)
  const raiz = await t.drawn()
  await t.unmount()
  return raiz
}
const forks9 = (feitos: number) => Object.fromEntries([0, 1, 2, 3, 4].map(i => [`f${i}`, { slug: `f${i}`, eventos: i < feitos ? [{ tipo: 'DONE', texto: '', at: 1 }] : [] }]))

test('A34: the terminal turn line reads the run summary, with and without an open lock', LENTO, async ($: any, on: any) => {
  const lock = { spec: 'C02-S01', kind: 'migration', resource: 'x', desde: 'T0', estado: 'GRANTED', minutos: 1, orfao: false }
  const vista = (locks: any[]) => ({ locks, slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null })
  const exec9 = { papel: 'conjunto', ledgerDir: LDIR6, forks: forks9(3), codigo: COD, conjunto: 'C02' }
  const m = await orq7($, on, { estado: { exec: exec9, maestroAlertas: { lista: [], vista: vista([lock]) } } })
  expect(m).toBeDefined()
  expect(textoNo(await turno($, 'terminal'))).toContain('38s · C02 3/5 · 1 lock')
})

test('A34: with no open lock the lock part is dropped', LENTO, async ($: any, on: any) => {
  const exec9 = { papel: 'conjunto', ledgerDir: LDIR6, forks: forks9(3), codigo: COD, conjunto: 'C02' }
  await orq7($, on, { estado: { exec: exec9 } })
  expect(textoNo(await turno($, 'terminal'))).toContain('38s · C02 3/5')
  expect(textoNo(await turno($, 'terminal'))).not.toContain('lock')
})

test('A34: with no run the app own line stays (next)', LENTO, async ($: any, on: any) => {
  montar(on, {}, 'main')
  await iniciar($)
  expect(textoNo(await turno($, 'terminal'))).not.toContain('·')
})

test('desktop is not raised on 2.1.308', LENTO, async ($: any, on: any) => {
  const exec9 = { papel: 'conjunto', ledgerDir: LDIR6, forks: forks9(3), codigo: COD, conjunto: 'C02' }
  await orq7($, on, { estado: { exec: exec9 } })
  expect(textoNo(await turno($, 'desktop'))).not.toContain('C02 3/5')
})

/** An orchestrator whose sets live in the registry and porDir: `sets` = [conjunto, feitos, total, minutes since the last event]. */
async function orqComSets($: any, on: any, sets: [string, number, number, number][], locks: any[]) {
  const outras: any[] = [{ sessao: 'sess-1', cwd: 'C:/repo', titulo: 'x', papel: 'orquestrador', forks: 0, feitos: 0, alerta: null, at: Date.now(), codigo: COD }]
  const porDir: Record<string, any> = {}
  for (const [c, feitos, total, min] of sets) {
    const dir = `C:/repo/.novarc/ledger/session-build/${c}`
    outras.push({ sessao: `set-${c}`, cwd: 'C:/repo', titulo: 'x', papel: 'conjunto', forks: total, feitos, alerta: null, at: Date.now(), codigo: COD, conjunto: c, ledgerDir: dir })
    porDir[dir] = { papel: 'conjunto', ledgerDir: dir, forks: Object.fromEntries(Array.from({ length: total }, (_, i) => {
      const slug = `${c.toLowerCase()}-s${String(i + 1).padStart(2, '0')}-x`
      const at = Date.now() - min * 60_000
      return [slug, { slug, spec: `${c}-S${String(i + 1).padStart(2, '0')}`, eventos: i < feitos ? [{ tipo: 'DONE', texto: '', at }] : [{ tipo: 'TASK', texto: 't', at }] }]
    })) }
  }
  const vista = { locks, slots: null, unidades: [], ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, proposta: null, espelhadoEm: null }
  return orq7($, on, { estado: { maestroOutras: outras, maestroPorDir: porDir, maestroAlertas: { lista: [], vista } } })
}
const lockDe = (spec: string) => ({ spec, kind: 'migration', resource: 'x', desde: 'T0', estado: 'GRANTED', minutos: 1, orfao: false })

test('A34: the orchestrator turn line reads the set in progress from the registry lanes, with its open lock', LENTO, async ($: any, on: any) => {
  await orqComSets($, on, [['C02', 3, 5, 1]], [lockDe('C02-S01'), lockDe('C03-S01')])
  expect(textoNo(await turno($, 'terminal'))).toContain('38s · C02 3/5 · 1 lock')
})

test('A34: with two sets in progress the more recent one wins; none in progress leaves the app line', LENTO, async ($: any, on: any) => {
  await orqComSets($, on, [['C02', 3, 5, 10], ['C03', 1, 2, 2]], [])
  expect(textoNo(await turno($, 'terminal'))).toContain('38s · C03 1/2')
})

test('A34: an orchestrator whose sets are all done keeps the app line', LENTO, async ($: any, on: any) => {
  await orqComSets($, on, [['C02', 5, 5, 1]], [])
  expect(textoNo(await turno($, 'terminal'))).not.toContain('·')
})

// ---- C03-S01 final review fixes (guard context, path-warning flood, default branch fallback, agent directives)

test('final fix 1: a set session on main is denied git merge feat/x; session-end lets it run', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, 'main')
  await iniciar($)
  await $.tool.call({ tool: 'Skill', skill: BUILD, args: `conjunto ${URL_MUNDO} C01` })
  expect(negado(await $.tool.call({ tool: 'Bash', command: 'git merge feat/x' }))).toBe(TEXTOS.merge)
  await $.tool.call({ tool: 'Skill', skill: 'novarc:novarc-session-end', args: '' })
  await $.tool.call({ tool: 'Bash', command: 'git merge feat/x' })
  expect(rodou(m, 'Bash', 'command', 'git merge feat/x')).toBe(true)
})

test('final fix 1: a spec session on its feature branch merges freely', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  await $.tool.call({ tool: 'Bash', command: 'git merge feat/x' })
  expect(rodou(m, 'Bash', 'command', 'git merge feat/x')).toBe(true)
})

test('final fix 2: an Edit of the skill fork-contract.md runs; an Edit of a run fork ledger is denied', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  await iniciar($)
  const doc = 'C:/repo/skills/novarc-session-build/core/references/fork-contract.md'
  await $.tool.call({ tool: 'Edit', file_path: doc, old_string: 'a', new_string: 'b' })
  expect(rodou(m, 'Edit', 'file_path', doc)).toBe(true)
  expect(negado(await $.tool.call({ tool: 'Edit', file_path: `${LDIR}/fork-c02-s01-x.md`, old_string: 'a', new_string: 'b' }))).toBe(TEXTOS.ledger)
})

test('final fix 4: temp dirs and <home>/.claude never warn; the same outside path toasts and audits once, the model reads it each time', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.env = { TEMP: 'C:\\Users\\t\\AppData\\Local\\Temp', TMPDIR: '/tmp' }
  m.git = { toplevel: RAIZ_W, origemHead: 'origin/main' }
  await iniciar($)
  for (const cmd of ['ls C:/Users/t/AppData/Local/Temp/claude/x', 'cat /tmp/out.txt', 'ls C:/Users/t/.claude/projects']) {
    expect(aviso(await $.tool.call({ tool: 'Bash', command: cmd }))).toBe(undefined)
  }
  const FORA = 'Aviso do Maestro: comando fora do worktree do conjunto (/repo/hooks).'
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'ls /repo/hooks' }))).toBe(FORA)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'ls /repo/hooks' }))).toBe(FORA)
  await quieto(m)
  expect(m.toasts.filter(t => t === FORA).length).toBe(1)
  expect((escrito(m, 'auditoriaPendente') ?? []).filter((x: any) => x.doc.motivo === FORA).length).toBe(1)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'supabase db push' }))).toBe(TEXTOS.migracao)
  expect(m.toasts.filter(t => t === TEXTOS.migracao).length).toBe(2) // other warnings toast every time
})

test('final fix 11: without origin/HEAD the default branch is main when it exists, else master, resolved once', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.falharRun = (argv: string[]) => argv.includes('symbolic-ref') || argv.includes('--verify')
  await iniciar($)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'git push origin master' }))).toBe('Aviso do Maestro: push direto na branch principal master.')
  await $.tool.call({ tool: 'Bash', command: 'git switch feat/c01-s01-olhos-20261026' })
  expect(m.runs.filter(r => r.includes('--verify')).length).toBe(1)
})

test('final fix 11: without origin/HEAD and with a local main, main is the default branch', LENTO, async ($: any, on: any) => {
  const m = montar(on, {}, SPEC_BR)
  m.falharRun = (argv: string[]) => argv.includes('symbolic-ref')
  await iniciar($)
  expect(aviso(await $.tool.call({ tool: 'Bash', command: 'git push origin main' }))).toBe('Aviso do Maestro: push direto na branch principal main.')
  expect(m.runs).toContain('git rev-parse --verify --quiet main')
})

test('final fix 9: an agent directive whose keyed set fails still gets a queued audit row', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  conjuntoNoDisco(m, '')
  m.falharTool = (e: any) => e.tool === 'ArtifactData' && e.action === 'set' && e.collection === 'auditoria'
  await agente($, `GO ${S01} phase 4`)
  await quieto(m)
  const fila = (escrito(m, 'auditoriaPendente') ?? []).map((x: any) => [x.doc.acao, x.doc.alvo, x.doc.origem, x.doc.linha])
  expect(fila).toEqual([['GO', 'C02-S01', 'agente', `GO ${S01} phase 4`]])
})

test('final fix 8: an observed agent directive carries the spec id form as alvo', LENTO, async ($: any, on: any) => {
  const m = await orq7($, on, { plano: true })
  await agente($, 'GO c02-s07-outra phase 4')
  await quieto(m)
  expect((escrito(m, 'auditoriaPendente') ?? []).map((x: any) => [x.doc.acao, x.doc.alvo])).toEqual([['GO', 'C02-S07']])
})
