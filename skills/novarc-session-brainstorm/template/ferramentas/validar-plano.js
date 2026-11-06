// Confere a integridade de um plano.json antes de publicar.
// Uso: node ferramentas/validar-plano.js <pasta-do-planejamento> [--db <snapshot do banco>] [--repo <raiz do repositório do cliente>]
// Sai com código 1 se houver erro. Avisos não bloqueiam. Como módulo: const { validar } = require('./validar-plano').
const fs = require('fs'), path = require('path');
const sha256 = (b) => require('crypto').createHash('sha256').update(b).digest('hex');
// Snapshot do banco no formato do ArtifactData out_dir: <db>/<colecao>/<doc_id>.json; o documento fica em .data quando existe.
function lerDoc(db, col, id, erro) {
  const f = path.join(db, col, `${id}.json`); if (!fs.existsSync(f)) return null;
  try { const d = JSON.parse(fs.readFileSync(f, 'utf8')); return (d && d.data) || d; } catch (e) { erro(`banco: ${col}/${id}.json ilegível (${e.message})`); return null; }
}
const dentro = (raiz, f) => path.resolve(f).startsWith(path.resolve(raiz) + path.sep);

// Pasta de fluxo migrada: o caminho guardado em ai/specs/ é lido primeiro em .novarc/specs/ (espelha mapear do migrar_novarc.py).
const MAPA = [['ai/specs', '.novarc/specs']];
function mapear(p) {
  for (const [legado, novo] of MAPA) { if (p.startsWith(legado + '/')) return novo + '/' + p.slice(legado.length + 1); if (p === legado) return novo; }
  return p;
}
// Caminho novo primeiro, o guardado depois; sem nenhum dos dois, devolve o mapeado (o erro usa arq.repo).
function resolverRepo(repo, arqRepo, nome) {
  const novo = path.resolve(repo, mapear(arqRepo), nome);
  if (fs.existsSync(novo)) return novo;
  const guardado = path.resolve(repo, arqRepo, nome);
  return fs.existsSync(guardado) ? guardado : novo;
}
function validar(dir, opts = {}) {
const p = JSON.parse(fs.readFileSync(path.join(dir, 'plano.json'), 'utf8'));
const erros = [], avisos = [];
const erro = (m) => erros.push(m), aviso = (m) => avisos.push(m);
const dup = (xs, nome) => { const v = new Set(); for (const x of xs) { if (v.has(x)) erro(`${nome} repetido: ${x}`); v.add(x); } };

if (p.schema !== 'novarc-planejamento/1') erro(`schema deve ser novarc-planejamento/1, veio ${p.schema}`);
for (const k of ['organizacao', 'projeto', 'fluxo', 'simuladores', 'fases', 'mudancas', 'decisoes', 'pendencias', 'abertos']) if (!(k in p)) erro(`falta ${k}`);
if (p.organizacao && p.organizacao.emailProjetos !== 'projetos@novarcsistemas.com') aviso('organizacao.emailProjetos diferente de projetos@novarcsistemas.com');
if (p.template) aviso('template: true só vale no template publicado; tire num planejamento real');
const fases = new Set(p.fases.map((f) => f.id)), sims = new Map(p.simuladores.map((s) => [s.id, s]));
const dec = new Set(p.decisoes.map((d) => d.id)), pend = new Set(p.pendencias.map((x) => x.id)), mud = new Map(p.mudancas.map((m) => [m.id, m]));
dup(p.fases.map((f) => f.id), 'id de fase'); dup(p.mudancas.map((m) => m.id), 'id de mudança'); dup(p.decisoes.map((d) => d.id), 'id de decisão'); dup(p.pendencias.map((x) => x.id), 'id de pendência');
for (const s of p.simuladores) { if (!fs.existsSync(path.join(dir, s.arquivo))) erro(`simulador ${s.id}: arquivo ${s.arquivo} não existe`); dup((s.telas || []).map((t) => t.id), `tela de ${s.id}`);
  for (const t of s.telas || []) if (t.fase && !fases.has(t.fase)) erro(`tela ${t.id}: fase ${t.fase} não existe`);
  dup(p.mudancas.filter((m) => m.sim === s.id).map((m) => m.n), `número de marcador em ${s.id}`); }
for (const f of p.fases) { if (f.inicio && f.fim && f.fim < f.inicio) erro(`fase ${f.id}: fim antes do início`); if (!f.pronto || !f.pronto.length) aviso(`fase ${f.id} sem critério de pronto`); }
const semProva = [];
for (const m of p.mudancas) {
  const s = sims.get(m.sim); if (!s) { erro(`mudança ${m.id}: simulador ${m.sim} não existe`); continue; }
  if (!fases.has(m.fase)) erro(`mudança ${m.id}: fase ${m.fase} não existe`);
  if (m.telaId !== '*' && !(s.telas || []).some((t) => t.id === m.telaId)) erro(`mudança ${m.id}: telaId ${m.telaId} não está em ${m.sim}.telas`);
  if (!['NOVO', 'ALTERADO', 'REAPROVEITA', 'EM DISCUSSÃO'].includes(m.tipo)) erro(`mudança ${m.id}: tipo ${m.tipo}`);
  for (const d of m.decisoes || []) if (!dec.has(d)) erro(`mudança ${m.id}: decisão ${d} não existe`);
  for (const x of m.pendencias || []) if (!pend.has(x)) erro(`mudança ${m.id}: pendência ${x} não existe`);
  if (!(m.refs || []).some((r) => r.tipo !== 'simulador')) semProva.push(m.id);
}
if (semProva.length) aviso(`${semProva.length} mudança(s) sem prova (código, documento, reunião ou dados): ${semProva.slice(0, 8).join(', ')}${semProva.length > 8 ? '...' : ''}`);
// Os dois lados da ligação precisam bater: mudança -> decisão/pendência e decisão/pendência -> mudança.
for (const [lista, campo, nome] of [[p.decisoes, 'decisoes', 'decisão'], [p.pendencias, 'pendencias', 'pendência']]) for (const x of lista) {
  for (const mid of x.mudancas || []) { const m = mud.get(mid); if (!m) erro(`${nome} ${x.id}: mudança ${mid} não existe`); else if (!(m[campo] || []).includes(x.id)) erro(`${nome} ${x.id} -> ${mid} sem o espelho em mudancas[].${campo}`); }
  for (const m of p.mudancas) if ((m[campo] || []).includes(x.id) && !(x.mudancas || []).includes(m.id)) erro(`${m.id} -> ${nome} ${x.id} sem o espelho em ${campo}[].mudancas`);
}
if (p.exibicao && p.exibicao.fasesPorSimulador) for (const f of p.fases) { const ss = new Set(p.mudancas.filter((m) => m.fase === f.id).map((m) => m.sim)); if (ss.size > 1) erro(`fase ${f.id}: fasesPorSimulador exige um simulador só, tem ${[...ss].join(', ')}`); else if (!ss.size) aviso(`fase ${f.id}: sem mudanças, não vira slice de nenhum simulador`); }
for (const x of p.pendencias) if (x.fase && !fases.has(x.fase)) erro(`pendência ${x.id}: fase ${x.fase} não existe`);
const textos = JSON.stringify(p); if (textos.includes('—')) aviso('há travessão (—) no texto; a identidade NOVARC não usa');

// Superfícies, versão Hoje e telas que já existem: campos opcionais do simulador; plano antigo passa igual.
const lista0 = (x, onde) => { if (x === undefined || x === null) return []; if (Array.isArray(x)) return x; erro(`${onde} deve ser uma lista`); return []; };
const ID = /^[a-z0-9-]+$/;
for (const s of p.simuladores) {
  if (s.hoje !== undefined && typeof s.hoje !== 'boolean') erro(`simulador ${s.id}: hoje deve ser true ou false`);
  for (const t of s.telas || []) if (t.existe !== undefined && typeof t.existe !== 'boolean') erro(`tela ${t.id} de ${s.id}: existe deve ser true ou false`);
  if (s.superficies === undefined) { for (const t of s.telas || []) if (t.superficie) aviso(`tela ${t.id} de ${s.id}: superficie ${t.superficie} sem simuladores[].superficies`); continue; }
  const sups = lista0(s.superficies, `simulador ${s.id}: superficies`);
  if (!sups.length) { erro(`simulador ${s.id}: superficies vazia (tire o campo ou declare ao menos uma)`); continue; }
  dup(sups.map((x) => x && x.id), `superfície de ${s.id}`);
  for (const x of sups) { if (!x || typeof x.id !== 'string' || !ID.test(x.id)) erro(`simulador ${s.id}: superfície ${x && x.id} com id fora do padrão [a-z0-9-]`); if (!x || typeof x.nome !== 'string' || !x.nome) erro(`simulador ${s.id}: superfície ${x && x.id} sem nome`); }
  const ids = new Set(sups.map((x) => x && x.id));
  for (const t of s.telas || []) { if (t.id === '*') continue; if (!t.superficie) erro(`tela ${t.id} de ${s.id}: falta superficie (o simulador declara superficies)`); else if (!ids.has(t.superficie)) erro(`tela ${t.id} de ${s.id}: superfície ${t.superficie} não existe`); }
}
// Trabalho técnico (sem tela) e dívida resolvida pelo plano: campos opcionais; plano antigo passa igual.
for (const m of p.mudancas) {
  if (m.tecnica === undefined) continue;
  if (typeof m.tecnica !== 'boolean') erro(`mudança ${m.id}: tecnica deve ser true ou false`);
  else if (m.tecnica && m.telaId !== '*') erro(`mudança ${m.id}: trabalho técnico usa telaId "*"`);
}
for (const a of p.abertos || []) if (a.mudanca !== undefined && !mud.has(a.mudanca)) erro(`aberto ${a.id}: mudança ${a.mudanca} não existe`);
// Mensagens: catálogo de comunicações (WhatsApp, e-mail...) com prévia no simulador.
const CANAIS = ['whatsapp', 'email', 'sms', 'push', 'sistema'], ORIGENS = ['existe', 'alterada', 'nova'], REMETENTES = ['automatico', 'agente', 'equipe', 'pessoa'];
if ('mensagens' in p) {
  const msgs = lista0(p.mensagens, 'mensagens');
  dup(msgs.map((x) => x && x.id), 'id de mensagem');
  for (const x of msgs) {
    if (!x || typeof x !== 'object') { erro('mensagens: item que não é objeto'); continue; }
    if (typeof x.id !== 'string' || !ID.test(x.id)) erro(`mensagem ${x.id}: id fora do padrão [a-z0-9-]`);
    if (typeof x.titulo !== 'string' || !x.titulo) erro(`mensagem ${x.id}: falta titulo`);
    if (!CANAIS.includes(x.canal)) erro(`mensagem ${x.id}: canal ${x.canal} (use ${CANAIS.join(', ')})`);
    if (!ORIGENS.includes(x.origem)) erro(`mensagem ${x.id}: origem ${x.origem} (use ${ORIGENS.join(', ')})`);
    if (x.remetente !== undefined && !REMETENTES.includes(x.remetente)) erro(`mensagem ${x.id}: remetente ${x.remetente} (use ${REMETENTES.join(', ')})`);
    const s = sims.get(x.sim); if (!s) { erro(`mensagem ${x.id}: simulador ${x.sim} não existe`); continue; }
    if (!(s.telas || []).some((t) => t.id === x.tela)) erro(`mensagem ${x.id}: tela ${x.tela} não está em ${x.sim}.telas`);
    const ms = lista0(x.mudancas, `mensagem ${x.id}: mudancas`);
    for (const mid of ms) { const m = mud.get(mid); if (!m) erro(`mensagem ${x.id}: mudança ${mid} não existe`); else if (m.sim !== x.sim) erro(`mensagem ${x.id}: mudança ${mid} é de outro simulador`); }
    if (x.origem !== 'existe' && !ms.length) aviso(`mensagem ${x.id}: ${x.origem === 'nova' ? 'nova' : 'alterada'} sem mudança ligada (o que a cria ou altera?)`);
  }
}

// Specs e conjuntos (session-plan): as invariantes só valem quando specs[] existe; plano antigo passa igual.
// O schema é documentação e não roda: os tipos dos campos novos são conferidos aqui.
const lista = (x, onde) => { if (x === undefined || x === null) return []; if (Array.isArray(x)) return x; erro(`${onde} deve ser uma lista`); return []; };

// Tickets de feedback (opcional): plano sem tickets passa igual.
if ('tickets' in p) {
  const tks = lista(p.tickets, 'tickets');
  dup(tks.map((t) => t.id), 'id de ticket');
  for (const t of tks) {
    for (const k of ['id', 'titulo', 'descricao']) if (typeof t[k] !== 'string' || !t[k]) erro(`ticket ${t.id}: ${k} deve ser texto`);
    if (!['bug', 'improvement'].includes(t.tipo)) erro(`ticket ${t.id}: tipo deve ser bug ou improvement, veio ${t.tipo}`);
    if (!['entra', 'fora', 'decidir'].includes(t.decisao)) erro(`ticket ${t.id}: decisao deve ser entra, fora ou decidir, veio ${t.decisao}`);
    if (t.data && !/^\d{2}\/\d{2}\/\d{4}$/.test(t.data)) erro(`ticket ${t.id}: data ${t.data} fora do formato DD/MM/AAAA`);
    const tm = lista(t.mudancas, `ticket ${t.id}: mudancas`);
    for (const mid of tm) if (!mud.has(mid)) erro(`ticket ${t.id}: mudança ${mid} não existe`);
    if (t.decisao === 'entra' && !tm.length) aviso(`ticket ${t.id} entra no plano mas nenhuma mudança o entrega`);
    // O ticket aparece só no(s) simulador(es) das suas mudanças, ou no do campo sim; nos outros fica escondido.
    if (t.sim !== undefined && !(p.simuladores || []).some((s) => s.id === t.sim)) erro(`ticket ${t.id}: simulador ${t.sim} não existe`);
    const simsDo = [...new Set(tm.map((mid) => (p.mudancas.find((m) => m.id === mid) || {}).sim).filter(Boolean))];
    if (t.sim && simsDo.some((s) => s !== t.sim)) erro(`ticket ${t.id}: sim ${t.sim}, mas há mudanças do simulador ${simsDo.filter((s) => s !== t.sim).join(', ')}`);
    if (!t.sim && !simsDo.length && (p.simuladores || []).length > 1) aviso(`ticket ${t.id} sem sim e sem mudança: não aparece em nenhum simulador; informe sim`);
  }
}

// Revisões conjuntas (opcional): o filtro Revisão da bancada lê mudancas[].revisoes.
if ('revisoes' in p) {
  const rvs = lista(p.revisoes, 'revisoes');
  dup(rvs.map((r) => r.id), 'id de revisão');
  for (const r of rvs) for (const k of ['id', 'titulo']) if (typeof r[k] !== 'string' || !r[k]) erro(`revisão ${r.id}: ${k} deve ser texto`);
  const ids = new Set(rvs.map((r) => r.id));
  for (const m of p.mudancas) for (const r of m.revisoes || []) if (!ids.has(r)) erro(`${m.id}: revisão ${r} não existe em revisoes`);
  for (const r of rvs) if (!p.mudancas.some((m) => (m.revisoes || []).includes(r.id))) aviso(`revisão ${r.id} não tem nenhuma mudança`);
} else for (const m of p.mudancas) if ((m.revisoes || []).length) erro(`${m.id}: cita revisoes, mas o plano não tem a lista revisoes`);

// execucao.perfil (opcional, todos os subcampos opcionais): só enums e sim/não são checados; ausente = o orquestrador pergunta.
function validarPerfil(pf) {
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const enu = (o, k, vals, nome) => { if (o[k] !== undefined && !vals.includes(o[k])) erro(`${nome} deve ser ${vals.join('|')}, veio ${o[k]}`); };
  const bool = (o, k, nome) => { if (o[k] !== undefined && typeof o[k] !== 'boolean') erro(`${nome} deve ser true ou false, veio ${o[k]}`); };
  const sub = (o, k, nome) => { if (o[k] === undefined) return null; if (!obj(o[k])) { erro(`${nome} deve ser objeto`); return null; } return o[k]; };
  if (!obj(pf)) return erro('execucao.perfil deve ser objeto');
  enu(pf, 'hostGit', ['github', 'gitlab', 'bitbucket'], 'execucao.perfil.hostGit');
  enu(pf, 'mergePath', ['pr', 'local-merge'], 'execucao.perfil.mergePath');
  enu(pf, 'formato', ['app', 'docs-only', 'infra-no-suite', 'library'], 'execucao.perfil.formato');
  const g = sub(pf, 'gate', 'execucao.perfil.gate');
  if (g && g.comandos !== undefined && !(Array.isArray(g.comandos) && g.comandos.every((c) => typeof c === 'string'))) erro('execucao.perfil.gate.comandos deve ser lista de textos');
  const mg = sub(pf, 'migracao', 'execucao.perfil.migracao');
  if (mg) bool(mg, 'aplicaNoMerge', 'execucao.perfil.migracao.aplicaNoMerge');
  if (pf.deploys !== undefined) {
    if (!Array.isArray(pf.deploys)) erro('execucao.perfil.deploys deve ser lista');
    else pf.deploys.forEach((d, i) => {
      if (!obj(d) || typeof d.alvo !== 'string' || !d.alvo) return erro(`execucao.perfil.deploys[${i}] deve ser objeto com alvo (texto) e dispara`);
      if (!['merge', 'manual', 'comando'].includes(d.dispara)) erro(`execucao.perfil.deploys[${i}].dispara deve ser merge|manual|comando, veio ${d.dispara}`);
    });
  }
  const me = sub(pf, 'merge', 'execucao.perfil.merge');
  if (me) { enu(me, 'quem', ['novarc', 'cliente'], 'execucao.perfil.merge.quem'); bool(me, 'clique', 'execucao.perfil.merge.clique'); }
  const t = sub(pf, 'teto', 'execucao.perfil.teto');
  if (t) { enu(t, 'ate', ['pr-aberto', 'merge', 'deploy'], 'execucao.perfil.teto.ate'); for (const k of ['migracaoProducao', 'deploy', 'porAcao']) bool(t, k, `execucao.perfil.teto.${k}`); }
}

// o perfil vale onde houver execucao, com ou sem specs
if (p.execucao && typeof p.execucao === 'object' && p.execucao.perfil !== undefined) validarPerfil(p.execucao.perfil);

if ('specs' in p) {
  const specsL = lista(p.specs, 'specs'), conjL = lista(p.conjuntos, 'conjuntos');
  const conj = new Map(conjL.map((c) => [c.id, c])), spc = new Map(specsL.map((s) => [s.id, s]));
  dup(conjL.map((c) => c.id), 'id de conjunto'); dup(specsL.map((s) => s.id), 'id de spec'); dup(specsL.map((s) => s.slug), 'slug de spec');
  const ex = p.execucao;
  if (!ex || typeof ex !== 'object') erro('execucao (branchPrefixo, ramoDocs, orquestrador) é obrigatório quando há specs');
  else {
    for (const k of ['branchPrefixo', 'orquestrador']) if (typeof ex[k] !== 'string' || !ex[k]) erro(`execucao.${k} deve ser texto`);
    if (!['direct-main', 'docs-pr'].includes(ex.ramoDocs)) erro(`execucao.ramoDocs deve ser direct-main ou docs-pr, veio ${ex.ramoDocs}`);
  }
  for (const m of p.mudancas) {
    // Plano cortado por fases: fase que ainda não tem conjunto fica sem spec até a próxima session-plan (aviso);
    // fase que já tem conjunto exige spec em toda mudança dela (erro).
    if (!m.spec) { if (conjL.some((c) => c.fase === m.fase)) erro(`mudança ${m.id} sem spec`); else aviso(`mudança ${m.id} sem spec: a fase ${m.fase} ainda não tem conjunto`); continue; }
    const s = spc.get(m.spec); if (!s) { erro(`mudança ${m.id}: spec ${m.spec} não existe`); continue; }
    if (!(Array.isArray(s.mudancas) && s.mudancas.includes(m.id))) erro(`mudança ${m.id} -> ${m.spec} sem o espelho em specs[].mudancas`);
    const c = conj.get(s.conjunto); if (c && m.fase !== c.fase) erro(`mudança ${m.id}: fase ${m.fase} diferente da fase ${c.fase} do conjunto ${c.id}`);
  }
  const hashEspelho = new Map(); // id do spec -> sha256 do spec.md do espelho, quando lido
  for (const s of specsL) {
    if (!/^C\d{2}-S\d{2}$/.test(s.id)) erro(`spec ${s.id}: id fora do padrão C00-S00`);
    else if (s.conjunto && !s.id.startsWith(`${s.conjunto}-`)) erro(`spec ${s.id}: id não começa pelo conjunto ${s.conjunto}`);
    if (typeof s.slug !== 'string' || !/^[a-z0-9-]+$/.test(s.slug)) erro(`spec ${s.id}: slug ${s.slug} fora do padrão [a-z0-9-]`);
    const smud = lista(s.mudancas, `spec ${s.id}: mudancas`);
    if (!smud.length) erro(`spec ${s.id} sem mudança`);
    for (const mid of smud) { const m = mud.get(mid); if (!m) erro(`spec ${s.id}: mudança ${mid} não existe`); else if (m.spec !== s.id) erro(`spec ${s.id} -> ${mid} sem o espelho em mudancas[].spec`); }
    const c = conj.get(s.conjunto); if (!c) erro(`spec ${s.id}: conjunto ${s.conjunto} não existe`); else if (!(Array.isArray(c.specs) && c.specs.includes(s.id))) erro(`spec ${s.id} fora de conjuntos[].specs de ${c.id}`);
    for (const x of lista(s.bloqueadoPor, `spec ${s.id}: bloqueadoPor`)) if (!pend.has(x)) erro(`spec ${s.id}: pendência ${x} não existe`);
    if (s.sdd !== undefined && typeof s.sdd !== 'boolean') erro(`spec ${s.id}: sdd deve ser true ou false`);
    const arq = s.arquivos;
    if (!arq || typeof arq !== 'object' || Array.isArray(arq)) { erro(`spec ${s.id}: arquivos deve ser um objeto {repo, commit, itens}`); continue; }
    for (const k of ['repo', 'commit']) if (typeof arq[k] !== 'string' || !arq[k]) erro(`spec ${s.id}: arquivos.${k} deve ser texto`);
    const itens = lista(arq.itens, `spec ${s.id}: arquivos.itens`);
    if (!itens.some((it) => it && it.nome === 'spec.md')) erro(`spec ${s.id}: arquivos.itens precisa conter spec.md`);
    const espOk = typeof s.espelho === 'string' && /^specs\/C\d{2}-S\d{2}\/$/.test(s.espelho);
    if (!espOk) erro(`spec ${s.id}: espelho ${s.espelho} fora do padrão specs/C00-S00/`);
    for (const it of itens) {
      const nome = it && it.nome;
      // Nome fora do padrão nem vira caminho: nada fora da pasta é lido.
      if (typeof nome !== 'string' || !/^[a-z0-9-]+\.md$/.test(nome)) { erro(`spec ${s.id}: arquivo ${nome} fora do padrão [a-z0-9-].md`); continue; }
      if (typeof it.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(it.sha256)) { erro(`spec ${s.id}: ${nome} com sha256 inválido (64 hexadecimais)`); continue; }
      if (espOk) {
        const f = path.resolve(dir, s.espelho, nome);
        if (!dentro(dir, f)) erro(`spec ${s.id}: espelho ${s.espelho}${nome} fora da pasta do planejamento`);
        else if (!fs.existsSync(f)) erro(`spec ${s.id}: espelho ${s.espelho}${nome} não existe`);
        else { const h = sha256(fs.readFileSync(f)); if (nome === 'spec.md') hashEspelho.set(s.id, h); if (h !== it.sha256) erro(`spec ${s.id}: espelho ${s.espelho}${nome} com hash diferente do registrado (espelho desatualizado)`); }
      }
      // --repo: a fonte no checkout do cliente precisa bater com o hash registrado na publicação.
      if (opts.repo && typeof arq.repo === 'string') {
        const f = resolverRepo(opts.repo, arq.repo, nome);
        if (!dentro(opts.repo, f)) erro(`spec ${s.id}: ${arq.repo}${nome} fora do repositório`);
        else if (!fs.existsSync(f)) erro(`spec ${s.id}: fonte ${arq.repo}${nome} não existe no repositório`);
        else if (sha256(fs.readFileSync(f)) !== it.sha256) erro(`spec ${s.id}: ${arq.repo}${nome} fonte mudou depois da publicação`);
      }
    }
  }
  for (const c of conjL) {
    if (!/^C\d{2}$/.test(c.id)) erro(`conjunto ${c.id}: id fora do padrão C00`);
    if (!fases.has(c.fase)) erro(`conjunto ${c.id}: fase ${c.fase} não existe`);
    if (!Number.isInteger(c.ordem)) erro(`conjunto ${c.id}: ordem deve ser inteiro`);
    if (typeof c.prompt !== 'string') erro(`conjunto ${c.id}: prompt deve ser texto`);
    const cs = lista(c.specs, `conjunto ${c.id}: specs`); if (!cs.length) erro(`conjunto ${c.id} sem spec`);
    for (const sid of cs) if (!spc.has(sid)) erro(`conjunto ${c.id}: spec ${sid} não existe`);
    for (const d of [...lista(c.dependeDe, `conjunto ${c.id}: dependeDe`), ...lista(c.paraleloCom, `conjunto ${c.id}: paraleloCom`)]) if (!conj.has(d)) erro(`conjunto ${c.id}: conjunto ${d} não existe`);
  }
  const deps = (id) => { const c = conj.get(id); return c && Array.isArray(c.dependeDe) ? c.dependeDe : []; };
  // Ciclo no grafo de dependências: DFS com três cores.
  const cor = {}; const visita = (id, trilha) => { if (cor[id] === 1) { erro(`ciclo de dependência: ${[...trilha, id].join(' -> ')}`); return; } if (cor[id] === 2) return; cor[id] = 1; for (const d of deps(id)) visita(d, [...trilha, id]); cor[id] = 2; };
  for (const id of conj.keys()) visita(id, []);
  const fecho = (id, vist = new Set()) => { for (const d of deps(id)) if (!vist.has(d)) { vist.add(d); fecho(d, vist); } return vist; };
  for (const c of conjL) for (const q of Array.isArray(c.paraleloCom) ? c.paraleloCom : []) if (fecho(c.id).has(q) || fecho(q).has(c.id)) erro(`conjunto ${c.id}: paralelo com ${q}, que está na cadeia de dependência`);
  const naFase = new Map(); for (const f of p.fases) for (const cid of lista(f.conjuntos, `fase ${f.id}: conjuntos`)) naFase.set(cid, (naFase.get(cid) || []).concat(f.id));
  for (const cid of naFase.keys()) if (!conj.has(cid)) erro(`fases: conjunto ${cid} não existe`);
  for (const c of conjL) { const fs_ = naFase.get(c.id) || []; if (fs_.length !== 1) erro(`conjunto ${c.id}: aparece em ${fs_.length} fase(s), deve aparecer em exatamente uma`); else if (fs_[0] !== c.fase) erro(`conjunto ${c.id}: está em fases[${fs_[0]}].conjuntos mas diz fase ${c.fase}`); }
  const ordemFase = new Map(p.fases.map((f, i) => [f.id, i]));
  for (const s of p.simuladores) for (const t of s.telas || []) {
    const fs_ = p.mudancas.filter((m) => m.sim === s.id && m.telaId === t.id).map((m) => ordemFase.get(m.fase)).filter((i) => i !== undefined); if (!fs_.length) continue;
    const cedo = p.fases[Math.min(...fs_)].id; if (t.fase !== cedo) erro(`tela ${t.id}: fase ${t.fase}, mas a primeira mudança nela é da ${cedo}`);
  }
  if (opts.db && !fs.existsSync(opts.db)) erro(`--db ${opts.db}: pasta do snapshot não existe`);
  else if (opts.db) for (const s of specsL) {
    // Pendência resolvida = resposta não vazia e situação diferente de parcial (resposta antiga sem situacao conta como resolvida).
    for (const x of Array.isArray(s.bloqueadoPor) ? s.bloqueadoPor : []) {
      const r = lerDoc(opts.db, 'pendencias', x, erro);
      if (r && String(r.resposta ?? '').trim() !== '' && r.situacao !== 'parcial') aviso(`spec ${s.id}: pendência ${x} respondida no banco, destravado`);
    }
    // Spec iniciado (etapa ou reserva) fica preso à revisão que começou a ser construída.
    const d = lerDoc(opts.db, 'specs', s.id, erro);
    if (d && ((d.etapa !== null && d.etapa !== undefined) || d.reserva)) {
      const h = hashEspelho.get(s.id);
      if (!d.revisao) erro(`spec ${s.id}: iniciado no banco (etapa ${d.etapa}) sem revisao registrada`);
      else if (h && h !== d.revisao) erro(`spec ${s.id}: spec.md alterado depois do início (hash diferente da revisao do banco)`);
    }
  }
}
const resumo = `${p.mudancas.length} mudanças, ${p.decisoes.length} decisões, ${p.pendencias.length} pendências, ${p.fases.length} fases, ${p.simuladores.length} simulador(es)${Array.isArray(p.mensagens) ? `, ${p.mensagens.length} mensagens` : ''}`;
return { erros, avisos, resumo };
}

if (require.main === module) {
  const args = process.argv.slice(2), opts = {}; let dir = '.';
  for (let i = 0; i < args.length; i++) { if (args[i] === '--db') opts.db = args[++i]; else if (args[i] === '--repo') opts.repo = args[++i]; else dir = args[i]; }
  const { erros, avisos, resumo } = validar(dir, opts);
  console.log(resumo);
  for (const a of avisos) console.log('aviso:', a);
  for (const e of erros) console.log('ERRO:', e);
  process.exit(erros.length ? 1 : 0);
}
module.exports = { validar, sha256, mapear };
