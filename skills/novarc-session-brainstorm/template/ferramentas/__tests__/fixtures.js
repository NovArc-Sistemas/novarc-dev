// fixtures.js: builds a minimal valid planning folder in the OS temp dir for validator and page tests.
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const SPEC_TXT = '# spec\n';
function base() {
  return {
    schema: 'novarc-planejamento/1',
    organizacao: { nome: 'NOVARC', emailProjetos: 'projetos@novarcsistemas.com' },
    projeto: { cliente: 'Cliente', nome: 'Projeto', codigo: 'CLI-SIS-TEMA', versao: 'v0.1', data: '10/10/2026', responsavel: 'Pessoa', resumo: 'x', repositorio: 'repo' },
    fluxo: { aprovacao: ['interna'], execucao: 'interna', aprovadorInterno: 'Pessoa' },
    simuladores: [{ id: 'exemplo', titulo: 'Sim', descricao: 'x', arquivo: 'sims/exemplo.html', telas: [{ id: 'a', nome: 'A', fase: 'f1' }, { id: 'b', nome: 'B', fase: 'f2' }] }],
    fases: [{ id: 'f1', nome: 'F1', objetivo: 'x', executor: 'NOVARC', pronto: ['x'] }, { id: 'f2', nome: 'F2', objetivo: 'x', executor: 'NOVARC', pronto: ['x'] }],
    mudancas: [
      { id: 'm-a1', n: 1, tipo: 'NOVO', tela: 'A', telaId: 'a', fase: 'f1', titulo: 't', porque: 'p', sim: 'exemplo', refs: [{ tipo: 'código', ref: 'a.ts:1' }], decisoes: [], pendencias: [] },
      { id: 'm-b1', n: 2, tipo: 'NOVO', tela: 'B', telaId: 'b', fase: 'f2', titulo: 't', porque: 'p', sim: 'exemplo', refs: [{ tipo: 'código', ref: 'b.ts:1' }], decisoes: [], pendencias: [] },
    ],
    decisoes: [], pendencias: [], abertos: [],
  };
}
function comSpecs(p, dir) {
  fs.mkdirSync(path.join(dir, 'specs/C01-S01'), { recursive: true }); fs.writeFileSync(path.join(dir, 'specs/C01-S01/spec.md'), SPEC_TXT);
  fs.mkdirSync(path.join(dir, 'specs/C02-S01'), { recursive: true }); fs.writeFileSync(path.join(dir, 'specs/C02-S01/spec.md'), SPEC_TXT);
  const item = () => [{ nome: 'spec.md', sha256: sha(SPEC_TXT) }];
  p.conjuntos = [
    { id: 'C01', titulo: 'c1', fase: 'f1', ordem: 1, specs: ['C01-S01'], dependeDe: [], paraleloCom: [], prompt: 'x' },
    { id: 'C02', titulo: 'c2', fase: 'f2', ordem: 2, specs: ['C02-S01'], dependeDe: ['C01'], paraleloCom: [], prompt: 'x' },
  ];
  p.specs = [
    { id: 'C01-S01', conjunto: 'C01', titulo: 's', slug: 'a', mudancas: ['m-a1'], bloqueadoPor: [], arquivos: { repo: 'ai/specs/X/C01-S01-a/', commit: 'abc', itens: item() }, espelho: 'specs/C01-S01/' },
    { id: 'C02-S01', conjunto: 'C02', titulo: 's', slug: 'b', mudancas: ['m-b1'], bloqueadoPor: [], arquivos: { repo: 'ai/specs/X/C02-S01-b/', commit: 'abc', itens: item() }, espelho: 'specs/C02-S01/' },
  ];
  p.mudancas[0].spec = 'C01-S01'; p.mudancas[1].spec = 'C02-S01';
  p.fases[0].conjuntos = ['C01']; p.fases[1].conjuntos = ['C02'];
  p.execucao = { branchPrefixo: 'feature/', ramoDocs: 'direct-main', orquestrador: 'novarc-orq-CLI-SIS-TEMA' };
}
function montar({ comSpecs: cs = false, mutar } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'plano-'));
  fs.mkdirSync(path.join(dir, 'sims')); fs.writeFileSync(path.join(dir, 'sims/exemplo.html'), '<!doctype html>');
  const p = base(); if (cs) comSpecs(p, dir); if (mutar) mutar(p, dir);
  fs.writeFileSync(path.join(dir, 'plano.json'), JSON.stringify(p));
  return dir;
}
// Client repo checkout holding the same spec files as the fixture, for --repo.
function montarRepo({ novarc = false } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-'));
  const raiz = novarc ? '.novarc/specs' : 'ai/specs';
  for (const d of [`${raiz}/X/C01-S01-a`, `${raiz}/X/C02-S01-b`]) { fs.mkdirSync(path.join(repo, d), { recursive: true }); fs.writeFileSync(path.join(repo, d, 'spec.md'), SPEC_TXT); }
  return repo;
}
// Database snapshot in ArtifactData out_dir layout: <db>/<collection>/<doc_id>.json.
function montarDb(docs) {
  const db = fs.mkdtempSync(path.join(os.tmpdir(), 'db-'));
  for (const [k, v] of Object.entries(docs)) { const [col, id] = k.split('/'); fs.mkdirSync(path.join(db, col), { recursive: true }); fs.writeFileSync(path.join(db, col, `${id}.json`), JSON.stringify(v)); }
  return db;
}
module.exports = { montar, montarRepo, montarDb, sha, SPEC_TXT };
