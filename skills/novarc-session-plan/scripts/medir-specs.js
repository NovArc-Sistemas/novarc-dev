// Measures every spec folder against the NOVARC size heuristic (spec §5.3) and estimates Claude session hours.
// Usage: node medir-specs.js <specs-dir> <plano.json> [--inicio YYYY-MM-DD]  (with --inicio, prints phase dates from
// the plano's conjuntos[].estimativaHoras)
// Limits are the starting calibration; the pilot result is recorded in SKILL.md.
const fs = require('fs'), path = require('path');
const LIM = { mudMin: 4, mudMax: 20, telasMax: 2, modelosMax: 4, rotasMax: 10, tarMin: 8, tarMax: 25 };
// Claude session hours per spec: fixed part (context, plan, plan approval, verification, PR) + per task. Calibrated
// against the pilot implement sessions (median 3.4 active hours); see SKILL.md Calibration log.
const RITMO = { baseH: 1.25, tarefaH: 0.2 };
const horasSpec = (tarefas) => Math.ceil((RITMO.baseH + RITMO.tarefaH * tarefas) * 2) / 2;
// Active hours of whoever drives the sessions (not Claude): per spec, plan approval and PR review; per phase, browser
// validation and deploy. Approved by NOVARC 2026-10-17 as the starting rule; recalibrate with the real horas collection.
const ATIVAS = { specH: 0.5, faseH: 1 };
const horasAtivasFase = (specs) => Math.ceil((ATIVAS.specH * specs + ATIVAS.faseH) * 2) / 2;
function ativasPorFase(plano) {
  const cs = plano.conjuntos || [];
  return plano.fases.map((f) => ({ id: f.id, horas: horasAtivasFase(cs.filter((c) => c.fase === f.id).reduce((n, c) => n + (c.specs || []).length, 0)) }));
}
// Calendar for Claude-built phases: one operator runs the sessions, CAL.horasDia session hours per business day; sets
// run one after another unless paraleloCom lets them overlap; each phase ends with CAL.validacaoDias business days of
// validation before the next phase starts. Dates assume every pending question is answered before its set starts.
const CAL = { horasDia: 6, validacaoDias: 1 };
function diaUtil(iso, n) { // first business day on or after iso, then n business days later
  const d = new Date(iso + 'T12:00:00Z'), util = () => ![0, 6].includes(d.getUTCDay());
  while (!util()) d.setUTCDate(d.getUTCDate() + 1);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (util()) n--; }
  return d.toISOString().slice(0, 10);
}
function agendaFases(plano, inicio) {
  const ag = new Map(), out = []; let dia = diaUtil(inicio, 0);
  for (const f of plano.fases) {
    const cs = plano.conjuntos.filter((c) => c.fase === f.id); if (!cs.length) continue;
    let fim = 0; for (const c of cs) { const dep = Math.max(0, ...(c.dependeDe || []).map((d) => (ag.get(d) || {}).fim || 0));
      const par = (c.paraleloCom || []).map((d) => ag.get(d)).filter(Boolean); const ini = par.length ? Math.max(dep, Math.min(...par.map((x) => x.ini))) : Math.max(dep, fim);
      ag.set(c.id, { ini, fim: ini + (+c.estimativaHoras || 0) }); fim = Math.max(fim, ini + (+c.estimativaHoras || 0)); }
    for (const c of cs) { const a = ag.get(c.id); a.ini -= fim; a.fim -= fim; } // next phase measures from its own start
    const dias = Math.max(1, Math.ceil(fim / CAL.horasDia)) + CAL.validacaoDias, termino = diaUtil(dia, dias - 1);
    out.push({ id: f.id, horas: fim, dias, inicio: dia, fim: termino }); dia = diaUtil(termino, 1);
  }
  return out;
}
function lerFicha(arq) {
  const t = fs.readFileSync(arq, 'utf8'); const m = t.match(/```json ficha\s*\n([\s\S]*?)\n```/);
  return m ? JSON.parse(m[1]) : null;
}
function medir(dir, plano) {
  const tela = new Map(plano.mudancas.map((m) => [m.id, m.telaId]));
  return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name)).map((d) => {
    const arq = path.join(dir, d.name, 'spec.md');
    let f = null; try { f = fs.existsSync(arq) ? lerFicha(arq) : null; } catch (e) { f = null; }
    if (!f) return { id: d.name, ok: false, tarefas: 0, horas: 0, motivos: ['spec.md sem bloco ```json ficha'], excecao: '' };
    const n = (x) => (x || []).length, motivos = [];
    const ui = (f.mudancas || []).filter((id) => tela.get(id) && tela.get(id) !== '*').length;
    const camadas = [n(f.modelosNovos) > 0, n(f.rotas) > 0, n(f.jobs) > 0, n(f.telas) > 0].filter(Boolean).length;
    // desempenho.md and acesso.md each add one task: indexes, pagination, role checks and audit are real work.
    const transversais = ['desempenho.md', 'acesso.md'].filter((x) => fs.existsSync(path.join(dir, d.name, x))).length;
    const tarefas = n(f.modelosNovos) + n(f.rotas) + n(f.jobs) + n(f.telas) + Math.ceil(ui / 3) + camadas + transversais;
    if (n(f.mudancas) < LIM.mudMin || n(f.mudancas) > LIM.mudMax) motivos.push(`${n(f.mudancas)} mudanças (de ${LIM.mudMin} a ${LIM.mudMax})`);
    if (n(f.telas) > LIM.telasMax) motivos.push(`${n(f.telas)} telas (no máximo ${LIM.telasMax})`);
    if (n(f.modelosNovos) > LIM.modelosMax) motivos.push(`${n(f.modelosNovos)} modelos novos (no máximo ${LIM.modelosMax})`);
    if (n(f.rotas) > LIM.rotasMax) motivos.push(`${n(f.rotas)} rotas (no máximo ${LIM.rotasMax})`);
    if (tarefas < LIM.tarMin || tarefas > LIM.tarMax) motivos.push(`${tarefas} tarefas estimadas (de ${LIM.tarMin} a ${LIM.tarMax})`);
    if (!f.dominio) motivos.push('sem domínio dono');
    return { id: f.id, conjunto: f.conjunto, ok: !motivos.length, tarefas, horas: horasSpec(tarefas), motivos, excecao: f.excecao || '' };
  });
}
module.exports = { medir, lerFicha, LIM, RITMO, horasSpec, CAL, agendaFases, diaUtil, ATIVAS, horasAtivasFase, ativasPorFase };
if (require.main === module) {
  const [dir, pj] = process.argv.slice(2), iIni = process.argv.indexOf('--inicio');
  const plano = JSON.parse(fs.readFileSync(pj, 'utf8')), rs = medir(dir, plano);
  for (const r of rs) console.log(`${r.ok ? 'ok   ' : r.excecao ? 'exc  ' : 'FALHA'} ${r.id.padEnd(10)} ${String(r.tarefas).padStart(3)} tarefas ${String(r.horas).padStart(4)} h ${r.motivos.join('; ')}${r.excecao ? ` | exceção: ${r.excecao}` : ''}`);
  const porC = {}; for (const r of rs) { const c = r.conjunto || r.id.split('-')[0]; porC[c] = (porC[c] || 0) + r.horas; }
  console.log('estimativaHoras: ' + Object.entries(porC).map(([c, h]) => `${c} ${h}`).join(', '));
  if (plano.conjuntos) console.log('horasAtivasPrevistas: ' + ativasPorFase(plano).map((f) => `${f.id} ${f.horas}`).join(', '));
  if (iIni > 0 && plano.conjuntos) for (const f of agendaFases(plano, process.argv[iIni + 1])) console.log(`${f.id} ${f.horas} h, ${f.dias} dias úteis: ${f.inicio} a ${f.fim}`);
  process.exit(rs.some((r) => !r.ok && !r.excecao) ? 1 : 0);
}
