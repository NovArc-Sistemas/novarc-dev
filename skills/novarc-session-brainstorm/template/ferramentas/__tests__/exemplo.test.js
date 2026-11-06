// Guarda de compatibilidade da casca: toda mudança no index.html precisa continuar abrindo o exemplo do template
// (com specs e tickets) e um planejamento antigo, sem specs, tickets nem campos novos.
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { montar } = require('./fixtures');
const { montarExemplo } = require('../montar-exemplo');
const { validar } = require('../validar-plano');

const FERR = path.resolve(__dirname, '..');
const pagina = (dir) => execFileSync(process.execPath, [path.join(FERR, 'verificar-pagina.js'), dir], { encoding: 'utf8' });

test('the template example validates with no errors', () => {
  const dir = montarExemplo(fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-')));
  assert.deepStrictEqual(validar(dir).erros, []);
});

test('the shell renders the template example in every profile', () => {
  const dir = montarExemplo(fs.mkdtempSync(path.join(os.tmpdir(), 'vitrine-')));
  assert.match(pagina(dir), /\nok\s*$/);
});

test('the template example carries tickets for the bench selector', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FERR, '..', 'exemplo', 'plano.json'), 'utf8'));
  assert.ok(p.tickets.some((t) => t.decisao === 'entra' && t.mudancas.length), 'um ticket que entra, ligado a mudanças');
  assert.ok(p.tickets.some((t) => t.decisao === 'decidir' && !t.mudancas.length), 'um ticket a decidir, sem mudança');
  assert.match(fs.readFileSync(path.join(FERR, '..', 'index.html'), 'utf8'), /id="bench-ticket"[^>]*hidden/);
});

test('the shell still renders a legacy plan without specs or tickets', () => {
  const dir = montar();
  assert.ok(!('tickets' in JSON.parse(fs.readFileSync(path.join(dir, 'plano.json'), 'utf8'))));
  fs.copyFileSync(path.join(FERR, '..', 'index.html'), path.join(dir, 'index.html'));
  assert.match(pagina(dir), /\nok\s*$/);
});

test('the template example carries a review round for the bench filter', () => {
  const p = JSON.parse(fs.readFileSync(path.join(FERR, '..', 'exemplo', 'plano.json'), 'utf8'));
  assert.ok(p.revisoes.length, 'uma revisão conjunta');
  assert.ok(p.mudancas.some((m) => (m.revisoes || []).includes(p.revisoes[0].id)), 'uma mudança ligada à revisão');
  assert.ok(p.mudancas.some((m) => !(m.revisoes || []).includes(p.revisoes[0].id)), 'uma mudança fora da revisão, cujo marcador o filtro apaga');
  const s = fs.readFileSync(path.join(FERR, '..', 'index.html'), 'utf8');
  assert.match(s, /id="brev"/);
  assert.match(s, /!\(x\.revisoes \|\| \[\]\)\.includes\(rev\)/, 'o filtro Revisão apaga no simulador os marcadores de fora da rodada');
});

test('the bench uses the optional abrirMudanca hook for tickets and markers', () => {
  const s = fs.readFileSync(path.join(FERR, '..', 'index.html'), 'utf8');
  assert.match(s, /typeof w\.abrirMudanca === 'function'/);
  assert.match(fs.readFileSync(path.join(FERR, 'checar-simulador.js'), 'utf8'), /typeof abrirMudanca === 'function'/);
});
