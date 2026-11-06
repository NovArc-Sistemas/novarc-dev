const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { montar, montarRepo, montarDb, sha, SPEC_TXT } = require('./fixtures');
const { validar, mapear } = require('../validar-plano');
const tem = (r, frag) => r.erros.some((e) => e.includes(frag));
const comSpecs = (mutar) => montar({ comSpecs: true, mutar });

test('legacy plano without specs passes unchanged', () => { assert.deepStrictEqual(validar(montar()).erros, []); });
test('plano with valid specs passes', () => { assert.deepStrictEqual(validar(comSpecs()).erros, []); });
const PERFIL = () => ({ hostGit: 'github', mergePath: 'pr', formato: 'library', gate: { comandos: ['node --test', 'claude plugin test .'], expect: null }, migracao: { ferramenta: null, aplicaNoMerge: false, ordem: 'nenhuma' }, deploys: [{ alvo: 'novarc-dev', dispara: 'merge', comando: null }], merge: { quem: 'novarc', clique: false }, teto: { ate: 'merge', migracaoProducao: false, deploy: false, porAcao: false } });
const comPerfil = (mutar) => validar(comSpecs((p) => { p.execucao.perfil = PERFIL(); if (mutar) mutar(p.execucao.perfil); }));
test('execucao profile valid passes (A3)', () => { assert.deepStrictEqual(comPerfil().erros, []); });
test('execucao without profile still passes (A4)', () => { assert.deepStrictEqual(validar(comSpecs()).erros, []); });
test('profile hostGit svn names field and value (A3)', () => { const r = comPerfil((f) => { f.hostGit = 'svn'; }); assert.ok(tem(r, 'execucao.perfil.hostGit') && tem(r, 'svn')); });
test('profile merge.quem terceiro (A3)', () => { assert.ok(tem(comPerfil((f) => { f.merge.quem = 'terceiro'; }), 'execucao.perfil.merge.quem')); });
test('profile teto.ate fora do enum', () => { assert.ok(tem(comPerfil((f) => { f.teto.ate = 'producao'; }), 'execucao.perfil.teto.ate')); });
test('profile deploys item must be an object with alvo and dispara enum', () => {
  assert.ok(tem(comPerfil((f) => { f.deploys = ['x']; }), 'execucao.perfil.deploys'));
  assert.ok(tem(comPerfil((f) => { f.deploys[0].dispara = 'push'; }), 'dispara'));
});
test('profile empty field is valid (A2)', () => {
  assert.deepStrictEqual(validar(comSpecs((p) => { p.execucao.perfil = {}; })).erros, []);
  assert.deepStrictEqual(validar(comSpecs((p) => { p.execucao.perfil = { gate: {} }; })).erros, []);
});
test('profile is checked wherever execucao exists, specs or not', () => {
  const r = validar(montar({ mutar: (p) => { p.execucao = { perfil: { hostGit: 'svn', teto: { porAcao: 'sim' } } }; } }));
  assert.ok(tem(r, 'execucao.perfil.hostGit') && tem(r, 'execucao.perfil.teto.porAcao'));
  assert.strictEqual(comPerfil((f) => { f.hostGit = 'svn'; }).erros.filter((e) => e.includes('execucao.perfil.hostGit')).length, 1);
});
test('profile booleans', () => { assert.ok(tem(comPerfil((f) => { f.teto.porAcao = 'sim'; }), 'execucao.perfil.teto.porAcao')); });
test('validar is stateless between calls', () => { validar(comSpecs((p) => { delete p.mudancas[1].spec; })); assert.deepStrictEqual(validar(comSpecs()).erros, []); });
test('change without spec once specs exist', () => { assert.ok(tem(validar(comSpecs((p) => { delete p.mudancas[1].spec; })), 'm-b1')); });
test('change without spec in a phase with no set only warns', () => {
  const r = validar(comSpecs((p) => { p.fases.push({ ...p.fases[1], id: 'f9', conjuntos: [] }); p.mudancas.push({ ...p.mudancas[1], id: 'm-z9', fase: 'f9', spec: undefined }); }));
  assert.ok(!tem(r, 'm-z9')); assert.ok(r.avisos.some((a) => a.includes('m-z9') && a.includes('f9')));
});
test('change pointing to unknown spec', () => { assert.ok(tem(validar(comSpecs((p) => { p.mudancas[0].spec = 'C09-S01'; })), 'C09-S01')); });
test('spec not listing its change back', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].mudancas = []; })), 'm-a1')); });
test('spec with no changes', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].mudancas = []; p.mudancas[0].spec = 'C02-S01'; p.specs[1].mudancas.push('m-a1'); p.mudancas[0].fase = 'f2'; })), 'C01-S01')); });
test('set graph cycle', () => { assert.ok(tem(validar(comSpecs((p) => { p.conjuntos[0].dependeDe = ['C02']; })), 'ciclo')); });
test('parallel with own dependency', () => { assert.ok(tem(validar(comSpecs((p) => { p.conjuntos[1].paraleloCom = ['C01']; })), 'paralelo')); });
test('set missing from phases', () => { assert.ok(tem(validar(comSpecs((p) => { p.fases[1].conjuntos = []; })), 'C02')); });
test('change phase disagrees with its set phase', () => { assert.ok(tem(validar(comSpecs((p) => { p.mudancas[1].fase = 'f1'; })), 'm-b1')); });
test('screen phase later than its earliest change', () => { assert.ok(tem(validar(comSpecs((p) => { p.simuladores[0].telas[0].fase = 'f2'; })), 'tela a')); });
test('mirror hash mismatch', () => { assert.ok(tem(validar(comSpecs((p, dir) => { fs.writeFileSync(path.join(dir, 'specs/C01-S01/spec.md'), 'editado'); })), 'espelho')); });
test('mirror file missing', () => { assert.ok(tem(validar(comSpecs((p, dir) => { fs.rmSync(path.join(dir, 'specs/C02-S01'), { recursive: true }); })), 'espelho')); });
test('bloqueadoPor naming unknown pendencia', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].bloqueadoPor = ['p-x']; })), 'p-x')); });

// Pending question holding C01-S01, for the --db tests.
const bloqueado = (p) => { p.pendencias = [{ id: 'p-1', titulo: 't', texto: 'x', quem: 'Op', fase: 'f1', mudancas: ['m-a1'] }]; p.mudancas[0].pendencias = ['p-1']; p.specs[0].bloqueadoPor = ['p-1']; };
test('blocked spec answered in db snapshot warns destravado', () => {
  const r = validar(comSpecs(bloqueado), { db: montarDb({ 'pendencias/p-1': { data: { resposta: 'sim' } } }) });
  assert.deepStrictEqual(r.erros, []); assert.ok(r.avisos.some((a) => a.includes('destravado')));
});
test('R1: partial answer in db snapshot does not warn destravado', () => {
  const r = validar(comSpecs(bloqueado), { db: montarDb({ 'pendencias/p-1': { data: { resposta: 'em parte', situacao: 'parcial', falta: 'x' } } }) });
  assert.deepStrictEqual(r.erros, []); assert.ok(!r.avisos.some((a) => a.includes('destravado')));
});
test('R1: blank answer does not warn destravado', () => {
  const r = validar(comSpecs(bloqueado), { db: montarDb({ 'pendencias/p-1': { resposta: '  ' } }) });
  assert.ok(!r.avisos.some((a) => a.includes('destravado')));
});
test('missing db folder is an error, not a silent pass', () => { assert.ok(tem(validar(comSpecs(), { db: '/nao/existe/db' }), '--db')); });
test('unreadable db document is an error, not a crash', () => {
  const db = montarDb({}); fs.mkdirSync(path.join(db, 'pendencias')); fs.writeFileSync(path.join(db, 'pendencias/p-1.json'), '{');
  assert.ok(tem(validar(comSpecs(bloqueado), { db }), 'p-1.json'));
});

// R5: complete mirror and safe paths.
test('R5: empty itens', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].arquivos.itens = []; })), 'spec.md')); });
test('R5: itens without spec.md', () => {
  assert.ok(tem(validar(comSpecs((p, dir) => { fs.writeFileSync(path.join(dir, 'specs/C01-S01/dados.md'), 'd'); p.specs[0].arquivos.itens = [{ nome: 'dados.md', sha256: sha('d') }]; })), 'spec.md'));
});
test('R5: espelho outside the pattern', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].espelho = 'specs/qualquer/'; })), 'espelho')); });
test('R5: nome outside the pattern', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].arquivos.itens.push({ nome: 'Dados.MD', sha256: sha('d') }); })), 'Dados.MD')); });
test('R5: traversal in nome is refused without reading the file', () => {
  const r = validar(comSpecs((p, dir) => { p.specs[0].arquivos.itens.push({ nome: '../../plano.json', sha256: sha('x') }); }));
  assert.ok(tem(r, '../../plano.json')); assert.ok(!r.erros.some((e) => e.includes('hash diferente') && e.includes('plano.json')));
});
test('R5: mudancas as a string', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].mudancas = 'm-a1'; })), 'lista')); });
test('R5: sha256 not 64 hex', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].arquivos.itens[0].sha256 = 'abc'; })), 'sha256')); });
test('R5: bad spec id', () => {
  assert.ok(tem(validar(comSpecs((p) => { p.specs[0].id = 'c1-s1'; p.conjuntos[0].specs = ['c1-s1']; p.mudancas[0].spec = 'c1-s1'; })), 'c1-s1'));
});
test('R5: bad conjunto id', () => {
  assert.ok(tem(validar(comSpecs((p) => { p.conjuntos[0].id = 'X1'; p.specs[0].conjunto = 'X1'; p.fases[0].conjuntos = ['X1']; p.conjuntos[1].dependeDe = ['X1']; })), 'X1'));
});
test('R5: arquivos not an object', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].arquivos = 'x'; })), 'arquivos')); });
test('R5: bad ramoDocs', () => { assert.ok(tem(validar(comSpecs((p) => { p.execucao.ramoDocs = 'push'; })), 'ramoDocs')); });

test('sdd must be boolean', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].sdd = 'sim'; })), 'sdd')); assert.ok(!tem(validar(comSpecs((p) => { p.specs[0].sdd = true; })), 'sdd')); });
// R16: unique slug.
test('R16: duplicate slug', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[1].slug = 'a'; })), 'slug')); });

// R6: source in the client repo.
test('R6: repo matching the recorded hashes passes', () => { assert.deepStrictEqual(validar(comSpecs(), { repo: montarRepo() }).erros, []); });
test('R6: repo file changed after publishing', () => {
  const repo = montarRepo(); fs.writeFileSync(path.join(repo, 'ai/specs/X/C01-S01-a/spec.md'), 'mudou');
  assert.ok(tem(validar(comSpecs(), { repo }), 'fonte mudou depois da publicação'));
});
test('R6: repo file missing', () => {
  const repo = montarRepo(); fs.rmSync(path.join(repo, 'ai/specs/X/C02-S01-b'), { recursive: true });
  assert.ok(tem(validar(comSpecs(), { repo }), 'C02-S01'));
});
test('R6: arquivos.repo escaping the repo is refused', () => { assert.ok(tem(validar(comSpecs((p) => { p.specs[0].arquivos.repo = '../fora/'; }), { repo: montarRepo() }), 'fora do repositório')); });
test('R6: mapear', () => {
  assert.strictEqual(mapear('ai/specs/X/C01-S01-a/'), '.novarc/specs/X/C01-S01-a/');
  assert.strictEqual(mapear('src/a/'), 'src/a/');
  assert.strictEqual(mapear('ai/specsX/'), 'ai/specsX/');
});
test('R6/A5: plan with ai/specs on a migrated repo passes', () => { assert.deepStrictEqual(validar(comSpecs(), { repo: montarRepo({ novarc: true }) }).erros, []); });
test('A5: migrated file changed after publishing', () => {
  const repo = montarRepo({ novarc: true }); fs.writeFileSync(path.join(repo, '.novarc/specs/X/C01-S01-a/spec.md'), 'mudou');
  assert.ok(tem(validar(comSpecs(), { repo }), 'fonte mudou depois da publicação'));
});
test('A5: plan storing .novarc path passes', () => {
  const mutar = (p) => { p.specs[0].arquivos.repo = '.novarc/specs/X/C01-S01-a/'; p.specs[1].arquivos.repo = '.novarc/specs/X/C02-S01-b/'; };
  assert.deepStrictEqual(validar(comSpecs(mutar), { repo: montarRepo({ novarc: true }) }).erros, []);
});

// R25: a started spec keeps its content.
test('R25: started spec whose spec.md differs from revisao', () => {
  assert.ok(tem(validar(comSpecs(), { db: montarDb({ 'specs/C01-S01': { data: { etapa: 'implementando', revisao: sha('outro') } } }) }), 'alterado depois do início'));
});
test('R25: started spec matching revisao passes', () => {
  assert.deepStrictEqual(validar(comSpecs(), { db: montarDb({ 'specs/C01-S01': { etapa: 'implementando', revisao: sha(SPEC_TXT) } }) }).erros, []);
});
test('R25: not started spec ignores revisao', () => {
  assert.deepStrictEqual(validar(comSpecs(), { db: montarDb({ 'specs/C01-S01': { etapa: null, revisao: sha('outro') } }) }).erros, []);
});
test('R25: started spec without revisao', () => {
  assert.ok(tem(validar(comSpecs(), { db: montarDb({ 'specs/C01-S01': { etapa: 'iniciado' } }) }), 'revisao'));
});

test('CLI prints summary and exits 1 on errors', () => {
  const { spawnSync } = require('child_process'); const cli = path.join(__dirname, '..', 'validar-plano.js');
  const ok = spawnSync(process.execPath, [cli, comSpecs()], { encoding: 'utf8' });
  assert.strictEqual(ok.status, 0); assert.match(ok.stdout, /^2 mudanças/);
  const ruim = spawnSync(process.execPath, [cli, '--repo', montarRepo(), comSpecs((p) => { delete p.mudancas[0].spec; })], { encoding: 'utf8' });
  assert.strictEqual(ruim.status, 1); assert.match(ruim.stdout, /ERRO: mudança m-a1 sem spec/);
});

// Superfícies, versão Hoje, telas que já existem e mensagens: campos opcionais.
const multi = (mutar) => montar({ mutar: (p, dir) => {
  const s = p.simuladores[0]; s.hoje = true;
  s.superficies = [{ id: 'cliente', nome: 'Cliente' }, { id: 'operador', nome: 'Operador' }];
  s.telas[0].superficie = 'cliente'; s.telas[0].existe = true; s.telas[1].superficie = 'operador';
  p.mensagens = [{ id: 'msg-a', canal: 'email', titulo: 'Aviso', origem: 'nova', sim: 'exemplo', tela: 'a', mudancas: ['m-a1'] }];
  if (mutar) mutar(p, dir);
} });
test('plano with superficies, hoje, existe and mensagens passes', () => { assert.deepStrictEqual(validar(multi()).erros, []); });
test('summary counts mensagens only when the field exists', () => {
  assert.match(validar(multi()).resumo, /1 mensagens/); assert.doesNotMatch(validar(montar()).resumo, /mensagens/);
});
test('screen without superficie when the simulator declares superficies', () => { assert.ok(tem(validar(multi((p) => { delete p.simuladores[0].telas[1].superficie; })), 'tela b')); });
test('screen pointing to unknown superficie', () => { assert.ok(tem(validar(multi((p) => { p.simuladores[0].telas[1].superficie = 'x'; })), 'superfície x')); });
test('duplicate superficie id', () => { assert.ok(tem(validar(multi((p) => { p.simuladores[0].superficies[1].id = 'cliente'; })), 'superfície')); });
test('empty superficies list', () => { assert.ok(tem(validar(multi((p) => { p.simuladores[0].superficies = []; })), 'superficies vazia')); });
test('superficie without nome', () => { assert.ok(tem(validar(multi((p) => { delete p.simuladores[0].superficies[0].nome; })), 'sem nome')); });
test('superficie on a screen without superficies only warns', () => {
  const r = validar(montar({ mutar: (p) => { p.simuladores[0].telas[0].superficie = 'x'; } }));
  assert.deepStrictEqual(r.erros, []); assert.ok(r.avisos.some((a) => a.includes('superficie')));
});
test('hoje and existe must be booleans', () => {
  assert.ok(tem(validar(multi((p) => { p.simuladores[0].hoje = 'sim'; })), 'hoje'));
  assert.ok(tem(validar(multi((p) => { p.simuladores[0].telas[0].existe = 1; })), 'existe'));
});
test('mensagem with bad canal, origem or remetente', () => {
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].canal = 'telegrama'; })), 'canal'));
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].origem = 'velha'; })), 'origem'));
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].remetente = 'robo'; })), 'remetente'));
});
test('mensagem pointing to unknown screen, simulator or change', () => {
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].tela = 'z'; })), 'tela z'));
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].sim = 'outro'; })), 'simulador outro'));
  assert.ok(tem(validar(multi((p) => { p.mensagens[0].mudancas = ['m-x']; })), 'm-x'));
});
test('duplicate mensagem id and mensagens not a list', () => {
  assert.ok(tem(validar(multi((p) => { p.mensagens.push({ ...p.mensagens[0] }); })), 'id de mensagem'));
  assert.ok(tem(validar(multi((p) => { p.mensagens = 'x'; })), 'lista'));
});
test('new mensagem without a change only warns', () => {
  const r = validar(multi((p) => { p.mensagens[0].mudancas = []; }));
  assert.deepStrictEqual(r.erros, []); assert.ok(r.avisos.some((a) => a.includes('msg-a')));
});

// Trabalho técnico (tecnica) e dívida resolvida pelo plano (abertos[].mudanca).
test('technical change on "*" and aberto pointing to it pass', () => {
  assert.deepStrictEqual(validar(montar({ mutar: (p) => { p.mudancas[0].tecnica = true; p.mudancas[0].telaId = '*'; p.abertos = [{ id: 'a-1', titulo: 't', texto: 'x', mudanca: 'm-a1' }]; } })).erros, []);
});
test('technical change must use telaId "*" and be boolean', () => {
  assert.ok(tem(validar(montar({ mutar: (p) => { p.mudancas[0].tecnica = true; } })), 'telaId "*"'));
  assert.ok(tem(validar(montar({ mutar: (p) => { p.mudancas[0].tecnica = 'sim'; } })), 'tecnica deve ser'));
});
test('aberto pointing to unknown change', () => { assert.ok(tem(validar(montar({ mutar: (p) => { p.abertos = [{ id: 'a-1', titulo: 't', texto: 'x', mudanca: 'm-x' }]; } })), 'a-1')); });
// Tickets de feedback (opcional).
const comTickets = (mutar) => montar({ mutar: (p, dir) => {
  p.tickets = [{ id: 'T-1', titulo: 'Ticket', tipo: 'bug', severidade: null, data: '10/10/2026', origem: '/a', descricao: 'pedido', decisao: 'entra', mudancas: ['m-a1'] }];
  if (mutar) mutar(p, dir);
} });
test('tickets: valid list passes', () => { assert.deepStrictEqual(validar(comTickets()).erros, []); });
test('tickets: sim naming an unknown simulator', () => { assert.ok(tem(validar(comTickets((p) => { p.tickets[0].sim = 'nao-existe'; })), 'nao-existe')); });
test('tickets: sim disagreeing with its changes', () => { const r = validar(comTickets((p) => { p.simuladores.push({ ...p.simuladores[0], id: 'outro' }); p.tickets[0].sim = 'outro'; })); assert.ok(tem(r, 'T-1')); });
test('tickets: duplicate id', () => { assert.ok(tem(validar(comTickets((p) => { p.tickets.push({ ...p.tickets[0] }); })), 'id de ticket')); });
test('tickets: unknown change', () => { assert.ok(tem(validar(comTickets((p) => { p.tickets[0].mudancas = ['m-zz']; })), 'm-zz')); });
test('tickets: bad tipo and decisao', () => {
  const r = validar(comTickets((p) => { p.tickets[0].tipo = 'feature'; p.tickets[0].decisao = 'talvez'; }));
  assert.ok(tem(r, 'tipo')); assert.ok(tem(r, 'decisao'));
});
test('tickets: entra without changes warns, decidir without changes is quiet', () => {
  assert.ok(validar(comTickets((p) => { p.tickets[0].mudancas = []; })).avisos.some((a) => a.includes('T-1')));
  const r = validar(comTickets((p) => { p.tickets[0].mudancas = []; p.tickets[0].decisao = 'decidir'; }));
  assert.deepStrictEqual(r.erros, []); assert.ok(!r.avisos.some((a) => a.includes('T-1')));
});

// Revisões conjuntas (opcional): filtro Revisão da bancada.
const comRevisoes = (mutar) => montar({ mutar: (p, dir) => {
  p.revisoes = [{ id: 'rev-1', titulo: 'Reunião com o cliente', data: '17/10/2026', versao: 'v0.2' }];
  p.mudancas[0].revisoes = ['rev-1'];
  if (mutar) mutar(p, dir);
} });
test('revisoes: valid list passes', () => { assert.deepStrictEqual(validar(comRevisoes()).erros, []); });
test('revisoes: duplicate id', () => { assert.ok(tem(validar(comRevisoes((p) => { p.revisoes.push({ ...p.revisoes[0] }); })), 'id de revisão')); });
test('revisoes: change cites an unknown round', () => { assert.ok(tem(validar(comRevisoes((p) => { p.mudancas[0].revisoes = ['rev-zz']; })), 'rev-zz')); });
test('revisoes: change cites a round but the plan has no list', () => { assert.ok(tem(validar(comRevisoes((p) => { delete p.revisoes; })), 'não tem a lista revisoes')); });
test('revisoes: round without changes warns', () => { assert.ok(validar(comRevisoes((p) => { p.mudancas[0].revisoes = []; })).avisos.some((a) => a.includes('rev-1'))); });
