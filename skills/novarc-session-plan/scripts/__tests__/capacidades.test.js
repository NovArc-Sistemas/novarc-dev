const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');

const SK = path.resolve(__dirname, '..', '..', '..');
const ler = (...p) => fs.readFileSync(path.join(SK, ...p), 'utf8').replace(/\r\n/g, '\n');
const AUD = { path: 'auditoria', read: 'admin', write: 'admin' };

// The first fenced json block that carries a db.rules list.
function regras(md) {
  for (const m of md.matchAll(/^[ \t]*```json\n([\s\S]*?)\n[ \t]*```/gm)) {
    try { const j = JSON.parse(m[1]); if (j.db && j.db.rules) return j.db.rules; } catch (e) { /* not a capabilities block */ }
  }
  throw new Error('no capabilities block');
}

for (const [nome, arq] of [['TEMPLATE.md', ['novarc-session-brainstorm', 'template', 'TEMPLATE.md']], ['session-plan SKILL.md', ['novarc-session-plan', 'SKILL.md']]]) {
  test(`${nome} lists the auditoria rule right after horas (A38)`, () => {
    const r = regras(ler(...arq)), i = r.findIndex((x) => x.path === 'horas');
    assert.ok(i >= 0);
    assert.deepStrictEqual(r[i + 1], AUD);
  });
}

test('TEMPLATE.md documents the auditoria collection and its writers', () => {
  const t = ler('novarc-session-brainstorm', 'template', 'TEMPLATE.md');
  assert.match(t, /^\| `auditoria` \| `\{acao, alvo, motivo, regra, linha, antes, depois, estado, runId, sessao, papel, by, at, origem\}`.*Editor \(`read: admin`, `write: admin`\) \|$/m);
  assert.match(t, /auditoria` \(só acrescenta\)/);
});

test('session-build vocabulary carries the mod-sent lines and the no-double-relay sentence', () => {
  const t = ler('novarc-session-build', 'SKILL.md');
  for (const l of ['`CONJUNTO <C> manifestos ...`', '`CONJUNTO <C> release ...`', '`status <C>?`', '`GO <slug> ...`']) assert.ok(t.includes(l), l);
  assert.match(t, /sent by the `novarc` mod; the agents read them and do not answer them/);
  assert.match(t, /RELAY \.\.\. to <slug>/);
  assert.match(t, /-SEM-PROVA/);
  assert.match(t, /RELAY-NAO-ENTREGUE/);
});
