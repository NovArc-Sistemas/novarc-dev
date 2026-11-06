const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { medir, lerFicha, horasSpec, agendaFases, diaUtil, horasAtivasFase, ativasPorFase } = require('../medir-specs');
function pasta(fichas) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-'));
  for (const f of fichas) { const d = path.join(dir, `${f.id}-x`); fs.mkdirSync(d); fs.writeFileSync(path.join(d, 'spec.md'), '```json ficha\n' + JSON.stringify(f) + '\n```\n\n# Spec\n'); }
  return dir;
}
const plano = (n, tela = 'a') => ({ mudancas: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, telaId: tela })) });
const ficha = (o) => ({ id: 'C01-S01', conjunto: 'C01', dominio: 'compras', telas: ['a'], mudancas: Array.from({ length: 8 }, (_, i) => `m${i}`), modelosNovos: ['A'], rotas: ['GET /a', 'POST /a'], jobs: [], excecao: '', ...o });

test('reads the ficha block', () => { const d = pasta([ficha({})]); assert.strictEqual(lerFicha(path.join(d, 'C01-S01-x', 'spec.md')).id, 'C01-S01'); });
test('typical spec passes', () => { const [r] = medir(pasta([ficha({})]), plano(8)); assert.ok(r.ok, r.motivos.join()); assert.strictEqual(r.tarefas, 1 + 2 + 0 + 1 + 3 + 3); });
test('too few changes fails', () => { const [r] = medir(pasta([ficha({ mudancas: ['m0', 'm1'] })]), plano(2)); assert.ok(!r.ok); assert.ok(r.motivos.some((m) => m.includes('mudanças'))); });
test('too many changes fails', () => { const ids = Array.from({ length: 21 }, (_, i) => `m${i}`); const [r] = medir(pasta([ficha({ mudancas: ids })]), plano(21)); assert.ok(!r.ok); });
test('three screens fails', () => { const [r] = medir(pasta([ficha({ telas: ['a', 'b', 'c'] })]), plano(8)); assert.ok(r.motivos.some((m) => m.includes('telas'))); });
test('five new models fails', () => { const [r] = medir(pasta([ficha({ modelosNovos: ['A', 'B', 'C', 'D', 'E'] })]), plano(8)); assert.ok(r.motivos.some((m) => m.includes('modelos'))); });
test('eleven routes fails', () => { const [r] = medir(pasta([ficha({ rotas: Array.from({ length: 11 }, (_, i) => `GET /r${i}`) })]), plano(8)); assert.ok(r.motivos.some((m) => m.includes('rotas'))); });
test('task estimate out of range fails', () => { const [r] = medir(pasta([ficha({ mudancas: ['m0', 'm1', 'm2', 'm3'], modelosNovos: [], rotas: [] })]), plano(4)); assert.ok(r.motivos.some((m) => m.includes('tarefas'))); });
test('navigation changes do not count as UI changes', () => { const p = plano(8); p.mudancas.forEach((m) => { m.telaId = '*'; }); const [r] = medir(pasta([ficha({})]), p); assert.strictEqual(r.tarefas, 1 + 2 + 0 + 1 + 0 + 3); });
test('exception keeps a failing spec from failing the run', () => { const [r] = medir(pasta([ficha({ mudancas: ['m0'], excecao: 'tela única de configuração' })]), plano(1)); assert.ok(!r.ok); assert.ok(r.excecao); });
test('missing ficha is a failure, not a crash', () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'specs-')); fs.mkdirSync(path.join(d, 'C01-S01-x')); fs.writeFileSync(path.join(d, 'C01-S01-x', 'spec.md'), '# sem ficha'); const [r] = medir(d, plano(0)); assert.ok(!r.ok); assert.ok(r.motivos.some((m) => m.includes('ficha'))); });
test('Claude session hours: fixed part plus per task, rounded up to half hours', () => { const [r] = medir(pasta([ficha({})]), plano(8)); assert.strictEqual(r.horas, 3.5); assert.strictEqual(horasSpec(7), 3); assert.strictEqual(horasSpec(21), 5.5); });
test('business days skip weekends', () => { assert.strictEqual(diaUtil('2026-10-17', 0), '2026-10-19'); assert.strictEqual(diaUtil('2026-10-23', 1), '2026-10-26'); assert.strictEqual(diaUtil('2026-10-19', 4), '2026-10-23'); });
test('phase calendar: sequential sets, parallel overlap, validation day, next phase starts next business day', () => { const p = { fases: [{ id: 'f1' }, { id: 'f2' }], conjuntos: [{ id: 'C01', fase: 'f1', estimativaHoras: 10 }, { id: 'C02', fase: 'f1', estimativaHoras: 8, paraleloCom: ['C01'] }, { id: 'C03', fase: 'f2', dependeDe: ['C01'], estimativaHoras: 7 }] }; const [a, b] = agendaFases(p, '2026-10-19'); assert.deepStrictEqual(a, { id: 'f1', horas: 10, dias: 3, inicio: '2026-10-19', fim: '2026-10-21' }); assert.deepStrictEqual(b, { id: 'f2', horas: 7, dias: 3, inicio: '2026-10-22', fim: '2026-10-26' }); });
test('desempenho.md and acesso.md each count as one task', () => { const dir = pasta([ficha({})]); const sub = fs.readdirSync(dir)[0]; fs.writeFileSync(path.join(dir, sub, 'acesso.md'), '# Acesso'); fs.writeFileSync(path.join(dir, sub, 'desempenho.md'), '# Desempenho'); const [r] = medir(dir, plano(8)); assert.strictEqual(r.tarefas, 1 + 2 + 0 + 1 + 3 + 3 + 2); });
test('active hours per phase: 0.5 h per spec plus 1 h per phase, rounded up to half hours', () => { assert.strictEqual(horasAtivasFase(0), 1); assert.strictEqual(horasAtivasFase(3), 2.5); assert.strictEqual(horasAtivasFase(4), 3); const p = { fases: [{ id: 'f1' }, { id: 'f2' }], conjuntos: [{ id: 'C01', fase: 'f1', specs: ['a', 'b'] }, { id: 'C02', fase: 'f1', specs: ['c'] }, { id: 'C03', fase: 'f2', specs: ['d'] }] }; assert.deepStrictEqual(ativasPorFase(p), [{ id: 'f1', horas: 2.5 }, { id: 'f2', horas: 1.5 }]); });
