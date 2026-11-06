// Teste de fumaça da página (index.html + plano.json) sem navegador: roda o script com um DOM mínimo e um banco falso,
// em quatro perfis (dono, editor, cliente colaborador, leitor), e confere que nada quebra e que a área interna
// (Configurações e horas) só aparece para dono e editor. Quando o plano testado não tem specs (ou com --fixture-specs),
// roda também um plano de exemplo em memória com conjuntos, specs e o estado de execução no banco, e confere a seção
// "Specs e execução" no formato interno e no formato cliente.
// Uso: node ferramentas/verificar-pagina.js <pasta-do-planejamento> [--fixture-specs [pasta-de-saida]]
// Com pasta-de-saida, grava ali o planejamento de exemplo (index.html, plano.json, sims/, specs/) para abrir no navegador.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const args = process.argv.slice(2);
const iFix = args.indexOf('--fixture-specs');
const dir = args.find((a, i) => !a.startsWith('--') && (iFix < 0 || i !== iFix + 1)) || '.';
const saida = iFix >= 0 && args[iFix + 1] && !args[iFix + 1].startsWith('--') ? args[iFix + 1] : null;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const plano = JSON.parse(fs.readFileSync(path.join(dir, 'plano.json'), 'utf8'));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

// Plano de exemplo com três conjuntos: C01 concluído, C02 em implementação (validação velha, spec alterado, preso por
// uma resposta parcial), C03 bloqueado por hold. Mesmo formato do fixture do validador, montado aqui sem depender dele.
const SPEC_TXT = '# C01-S01 · Spec de exemplo\n\nTexto do espelho, UTF-8 sem BOM.\n';
function fixtureSpecs() {
  const item = [{ nome: 'spec.md', sha256: sha(SPEC_TXT) }];
  const p = {
    schema: 'novarc-planejamento/1',
    organizacao: { nome: 'NOVARC', emailProjetos: 'projetos@novarcsistemas.com' },
    projeto: { cliente: 'Cliente', nome: 'Projeto', codigo: 'CLI-SIS-TEMA', versao: 'v0.1', data: '10/10/2026', responsavel: 'Pessoa', resumo: 'x', repositorio: 'repo' },
    fluxo: { aprovacao: ['interna'], execucao: 'interna', aprovadorInterno: 'Pessoa' },
    simuladores: [{ id: 'exemplo', titulo: 'Sim', descricao: 'x', arquivo: 'sims/exemplo.html', telas: [{ id: 'a', nome: 'A', fase: 'f1' }, { id: 'b', nome: 'B', fase: 'f2' }] }],
    fases: [{ id: 'f1', nome: 'F1', objetivo: 'x', executor: 'NOVARC', pronto: ['x'], inicio: '2026-10-12', fim: '2026-10-20', conjuntos: ['C01'] },
      { id: 'f2', nome: 'F2', objetivo: 'x', executor: 'NOVARC', pronto: ['x'], inicio: '2026-10-21', fim: '2026-10-31', conjuntos: ['C02', 'C03'] }],
    mudancas: [
      { id: 'm-a1', n: 1, tipo: 'NOVO', tela: 'A', telaId: 'a', fase: 'f1', titulo: 't', porque: 'p', sim: 'exemplo', refs: [{ tipo: 'código', ref: 'a.ts:1' }], decisoes: [], pendencias: [], spec: 'C01-S01' },
      { id: 'm-b1', n: 2, tipo: 'NOVO', tela: 'B', telaId: 'b', fase: 'f2', titulo: 't', porque: 'p', sim: 'exemplo', refs: [{ tipo: 'código', ref: 'b.ts:1' }], decisoes: [], pendencias: ['p-1'], spec: 'C02-S01' },
      { id: 'm-b2', n: 3, tipo: 'NOVO', tela: 'B', telaId: 'b', fase: 'f2', titulo: 't', porque: 'p', sim: 'exemplo', refs: [{ tipo: 'código', ref: 'b.ts:2' }], decisoes: [], pendencias: [], spec: 'C03-S01' },
    ],
    decisoes: [], abertos: [],
    pendencias: [{ id: 'p-1', titulo: 'Pergunta', texto: 'x', quem: 'Operação', fase: 'f2', mudancas: ['m-b1'] }],
    conjuntos: [
      { id: 'C01', titulo: 'Conjunto um', fase: 'f1', ordem: 1, specs: ['C01-S01'], dependeDe: [], paraleloCom: [], prompt: 'prompt C01' },
      { id: 'C02', titulo: 'Conjunto dois', fase: 'f2', ordem: 2, specs: ['C02-S01'], dependeDe: ['C01'], paraleloCom: ['C03'], prompt: 'prompt C02' },
      { id: 'C03', titulo: 'Conjunto três', fase: 'f2', ordem: 3, specs: ['C03-S01'], dependeDe: ['C01'], paraleloCom: ['C02'], prompt: 'prompt C03' },
    ],
    specs: ['C01-S01:C01:a:m-a1', 'C02-S01:C02:b:m-b1', 'C03-S01:C03:c:m-b2'].map((x) => { const [id, c, slug, m] = x.split(':');
      return { id, conjunto: c, titulo: 'Spec ' + id, slug, mudancas: [m], bloqueadoPor: id === 'C02-S01' ? ['p-1'] : [], arquivos: { repo: `ai/specs/X/${id}-${slug}/`, commit: 'abc1234', itens: item }, espelho: `specs/${id}/` }; }),
    execucao: { branchPrefixo: 'feature/', ramoDocs: 'direct-main', orquestrador: 'novarc-orq-CLI-SIS-TEMA' },
  };
  const at = '2026-10-10T12:00:00Z';
  const cols = {
    execucao: [{ id: 'C01', sessao: 's1', iniciadoEm: at }, { id: 'C02', sessao: 's2', iniciadoEm: at }, { id: 'C03', sessao: 's3', iniciadoEm: at, bloqueios: { hold: { motivo: 'Aguardando a revisão do C02', at } } }],
    specs: [
      { id: 'C01-S01', etapa: 'merge', branch: 'feature/c01-s01-a-20261010', headSha: 'aaa', pr: 'https://github.com/x/y/pull/1', revisao: sha(SPEC_TXT), validacao: { resultado: 'aprovado', sha: 'aaa', falhas: [] } },
      { id: 'C02-S01', etapa: 'implementando', branch: 'feature/c02-s01-b-20261011', headSha: 'bbb', revisao: 'f'.repeat(64), validacao: { resultado: 'aprovado', sha: 'velho', falhas: [] } },
      { id: 'C09-S09', etapa: 'merge', branch: 'feature/orfao' },
    ],
    pendencias: [{ id: 'p-1', resposta: 'Parte da resposta', situacao: 'parcial', falta: 'o resto' }],
  };
  return { plano: p, cols };
}

async function perfil(nome, me, grava, { pl = plano, extra = {}, docsExtra = {}, comSala = false } = {}) {
  const els = {};
  const el = (id) => els[id] || (els[id] = { id, innerHTML: '', hidden: false, textContent: '', style: { setProperty() {} }, value: '', dataset: {}, addEventListener() {}, classList: { toggle() {}, add() {}, remove() {}, contains: () => false }, scrollIntoView() {}, querySelector: () => null, querySelectorAll: () => [], focus() {}, select() {}, setSelectionRange() {}, getBoundingClientRect: () => ({}) });
  const m0 = pl.mudancas[0];
  const docs = { 'plano/estado': { status: 'aprovacao-interna', by: 'u1', at: '2026-10-10T12:00:00Z', nota: 'ok' }, ...docsExtra };
  const cols = { notas: m0 ? [{ mudanca: m0.id, tipo: 'prova', texto: 'x', ref: 'a.ts:1', by: 'u1', at: '2026-10-10T12:00:00Z' }] : [],
    documentos: [{ tipo: 'spec', camada: 'back', titulo: 'Spec F1', ref: 'https://x', fase: pl.fases[0].id, by: 'u1', at: '2026-10-10T12:00:00Z' }],
    horas: [{ data: '2026-10-10', minutos: 95, fase: pl.fases[0].id, pessoa: 'Pessoa A', branch: 'feat/x' }], videos: [{ titulo: 'Tour', url: 'https://x', sim: pl.simuladores[0].id, by: 'u1', at: '2026-10-10T12:00:00Z' }],
    historico: [{ status: 'aprovacao-interna', by: 'u1', at: '2026-10-10T12:00:00Z' }], pendencias: [], fases: [], ...extra };
  const snap = (rows) => ({ docs: rows.map((r, i) => ({ id: r.id || 'd' + i, data: () => r })) });
  const ouvidos = []; // listeners opened, as "<colecao>.orderBy(..).limit(..)"
  const q = (n, ch = [], lim = Infinity) => ({ orderBy: (...a) => q(n, [...ch, `orderBy(${a.map((x) => `'${x}'`).join(',')})`], lim), limit: (k) => q(n, [...ch, `limit(${k})`], k),
    onSnapshot: (fn) => { ouvidos.push([n, ...ch].join('.')); fn(snap((cols[n] || []).slice(0, lim))); }, add: async () => {} });
  const db = { doc: (p) => ({ onSnapshot: (fn) => fn({ exists: !!docs[p], data: () => docs[p] }), set: async () => {} }), collection: q };
  const user = { me: async () => me, can: async () => grava, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Pessoa' }])) };
  // Sala falsa: um visitante além de quem testa, com cursor e a primeira mudança aberta na bancada.
  const outro = { peer: 'p2', by: 'u9', isMe: false, kind: 'viewer', presence: { x: 0.4, y: 0.2, modo: 'doc', sec: 'status', chg: null } };
  const room = comSala ? { presence: async () => {}, onPeers: (fn) => { setTimeout(() => fn({ peers: [{ peer: 'p1', by: me.id, isMe: true, kind: 'viewer', presence: {} }, outro] }), 10); return () => {}; } } : null;
  const errors = []; let clicar = null;
  const g = {
    document: { documentElement: el('html'), querySelector: (s) => el(s.replace('#', '')), getElementById: el, querySelectorAll: () => [], addEventListener: (t, f) => { if (t === 'click') clicar = f; }, createElement: () => el('x'), body: { appendChild() {} } },
    window: { claude: { use: async (n) => ({ db, user, comments: {}, downloads: {}, room }[n] || null) } }, location: { href: 'https://claude.ai/artifact/x', hash: '' },
    fetch: async () => ({ ok: true, json: async () => pl }), navigator: {}, setTimeout, setInterval, clearInterval, console, innerWidth: 1440, innerHeight: 900, matchMedia: () => ({ matches: false }), requestAnimationFrame: (f) => setTimeout(f, 0), performance: { now: () => Date.now() },
  };
  let renderAll = null;
  try { renderAll = new Function(...Object.keys(g), js + '\n;return typeof renderAll === "function" ? renderAll : null;')(...Object.values(g)); } catch (e) { errors.push(e.stack); }
  await new Promise((r) => setTimeout(r, 400));
  const gear = !!els.toc && els.toc.innerHTML.includes('Configurações');
  const horas = els.horas && !els.horas.hidden && els.horas.innerHTML.length > 0;
  const ex = els.execucao || { innerHTML: '', hidden: true }; const exec = ex.hidden ? '' : ex.innerHTML;
  const quem = (els.quem || {}).innerHTML || '', cur = (els.cursores || {}).innerHTML || '';
  if (comSala) console.log(nome.padEnd(22), '| sala: avatares', !(els.quem || {}).hidden && quem.includes('no planejamento'), '| cursor do outro', cur.includes('class="cur"'));
  console.log(nome.padEnd(22), '| erros', errors.length, '| configurações', gear, '| horas', horas, '| execução', exec ? 'visível' : 'vazia', '| capa', !(els.hero || {}).innerHTML ? 'VAZIA' : els.hero.innerHTML.includes('Não foi possível') ? 'ERRO NA CARGA' : 'ok');
  if (errors.length) console.log(errors.join('\n'));
  return { errors, gear, horas, horasHtml: (els.horas || {}).innerHTML || '', exec, quem, cur, ouvidos, els, clicar: (act) => clicar({ target: { id: '', closest: () => ({ dataset: { act } }) } }), titulo: g.document.title, capa: !!(els.hero || {}).innerHTML && !els.hero.innerHTML.includes('Não foi possível'), renderAll };
}

function confere(rotulo, cond, falhas) { if (!cond) { falhas.push(rotulo); console.log('  FALHOU:', rotulo); } }

(async () => {
  const falhas = [];
  const r = [await perfil('dono', { id: 'u1', isOwner: true, canEdit: true }, true), await perfil('editor', { id: 'u2', isOwner: false, canEdit: true }, true),
    await perfil('cliente colaborador', { id: 'u3', isOwner: false, canEdit: false }, true), await perfil('leitor', { id: 'u4', isOwner: false, canEdit: false }, false)];
  const s = await perfil('sala (room)', { id: 'u1', isOwner: true, canEdit: true }, true, { comSala: true });
  confere('sala: sem erros, avatares e cursor do outro', !s.errors.length && s.capa && s.quem.includes('no planejamento') && s.cur.includes('class="cur"'), falhas);
  confere('título do artefato segue o padrão', /^Planejamento .+ · .+/.test(s.titulo || ''), falhas);
  confere('perfis básicos', r.every((x) => !x.errors.length && x.capa) && r[0].gear && r[1].gear && !r[2].gear && !r[3].gear && r[0].horas && !r[2].horas, falhas);
  const pub = { 'config/exibicao': { horasPublicas: true, horasResumo: { total: 95, semFase: 0, porFase: { [plano.fases[0].id]: 95 }, at: '2026-10-10T12:00:00Z' } } };
  const hp = await perfil('colaborador horas públicas', { id: 'u3', isOwner: false, canEdit: false }, true, { docsExtra: pub });
  confere('horas públicas: colaborador vê o resumo, sem configurações', !hp.errors.length && hp.horas && !hp.gear, falhas);
  // Horas: ativas e de execução separadas, quebra por pessoa só com mais de uma pessoa, legado igual ao que era.
  const f1 = plano.fases[0].id, dono = { id: 'u1', isOwner: true, canEdit: true };
  const h2 = await perfil('horas: duas pessoas', dono, true, { extra: { horas: [{ data: '2026-10-10', minutos: 95, fase: f1, pessoa: 'Pessoa A' }, { data: '2026-10-10', minutos: 120, fase: f1, pessoa: 'Pessoa A', tipo: 'execucao' }, { data: '2026-10-11', minutos: 60, fase: f1, pessoa: 'Pessoa B', tipo: 'execucao' }] } });
  confere('horas: blocos ativas e execução, quebra por pessoa na execução', !h2.errors.length && h2.horasHtml.includes('data-tipo="ativa"') && h2.horasHtml.includes('data-tipo="execucao"') && h2.horasHtml.includes('Por pessoa') && h2.horasHtml.includes('Pessoa B'), falhas);
  const h1 = await perfil('horas: uma pessoa', dono, true, { extra: { horas: [{ data: '2026-10-10', minutos: 95, fase: f1, pessoa: 'Pessoa A' }, { data: '2026-10-10', minutos: 120, fase: f1, pessoa: 'Pessoa A', tipo: 'execucao' }] } });
  confere('horas: com uma pessoa, sem quebra por pessoa', !h1.errors.length && h1.horasHtml.includes('data-tipo="execucao"') && !h1.horasHtml.includes('Por pessoa'), falhas);
  // Tabela por sessão: os documentos ativa e -exec de uma sessão viram UMA linha, com o id inteiro copiável e os tokens.
  const sid = '0123abcd-0000-4000-8000-000000000001', tk = { entrada: 1, saida: 2, cacheCriacao: 3, cacheLeitura: 2500000, total: 2500006 };
  const hs = await perfil('horas: por sessão', dono, true, { extra: { horas: [{ data: '2026-10-10', minutos: 30, fase: f1, pessoa: 'Pessoa A', sessao: sid }, { data: '2026-10-10', minutos: 120, fase: f1, pessoa: 'Pessoa A', sessao: sid, tipo: 'execucao', tokens: tk, transcript: `~/.claude/projects/x/${sid}.jsonl` }] } });
  const linhas = (hs.horasHtml.match(/data-act="copiar-sessao"/g) || []).length;
  confere('horas: uma linha por sessão, id copiável, caminho do transcript e tokens', !hs.errors.length && linhas === 1 && hs.horasHtml.includes(`data-s="${sid}"`) && hs.horasHtml.includes(`/x/${sid}.jsonl`) && hs.horasHtml.includes('2,5 mi'), falhas);
  const legado = JSON.parse(JSON.stringify(plano)); for (const f of legado.fases) delete f.horasAtivasPrevistas;
  const hl = await perfil('horas: plano legado', dono, true, { pl: legado });
  confere('horas: plano sem os campos novos segue com um bloco só', !hl.errors.length && hl.horas && !hl.horasHtml.includes('data-tipo='), falhas);
  if (!(plano.conjuntos || []).length) confere('plano sem conjuntos: seção de execução vazia ou oculta', r.every((x) => !x.exec), falhas);

  if (iFix >= 0 || !(plano.specs || []).length) {
    const { plano: pf, cols } = fixtureSpecs(); const o = { pl: pf, extra: cols };
    const d = await perfil('specs: dono', { id: 'u1', isOwner: true, canEdit: true }, true, o);
    const c = await perfil('specs: colaborador', { id: 'u3', isOwner: false, canEdit: false }, true, o);
    const f = await perfil('specs: formato cliente', { id: 'u1', isOwner: true, canEdit: true }, true, { ...o, docsExtra: { 'config/exibicao': { modo: 'cliente' } } });
    confere('specs: sem erros', [d, c, f].every((x) => !x.errors.length && x.capa), falhas);
    const tem = (x, ...fr) => fr.every((t) => x.exec.includes(t));
    confere('interno: C01, Copiar prompt e a branch', tem(d, 'C01', 'Copiar prompt', 'feature/c01-s01-a-20261010'), falhas);
    confere('interno: status derivados (concluído, em implementação, bloqueado com motivo)', tem(d, 'Concluído', 'Em andamento · Em implementação', 'Bloqueado', 'Aguardando a revisão do C02'), falhas);
    confere('interno: resposta parcial mantém a trava', tem(d, 'Espera 1 pendência') && tem(d, 'data-id="p-1"'), falhas);
    confere('interno: validação aprovada no commit atual', tem(d, 'Validado no simulador'), falhas);
    confere('interno: validação de outro commit fica desatualizada', tem(d, 'Validação desatualizada'), falhas);
    confere('interno: spec alterado depois do início', tem(d, 'Spec alterado depois do início'), falhas);
    confere('interno: doc do banco fora do plano é ignorado', !d.exec.includes('C09') && !d.exec.includes('orfao'), falhas);
    confere('formato cliente: status sem prompt nem branch', tem(f, 'C01', 'Concluído') && !f.exec.includes('Copiar prompt') && !f.exec.includes('feature/'), falhas);
    confere('colaborador: status sem prompt nem branch', tem(c, 'C01', 'Bloqueado') && !c.exec.includes('Copiar prompt') && !c.exec.includes('feature/'), falhas);
    // Locks ao vivo (espelho do Maestro): banco legado sem espelho nem config/orquestracao, espelho com lock, espelho parado.
    confere('locks ao vivo: banco sem espelho nem config mostra Sem execução ainda.', tem(d, 'Locks ao vivo · espelho do Maestro', 'Sem execução ainda.'), falhas);
    const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
    const espelho = (at, locks) => ({ locks, specs: {}, ritmo: { checkpointMin: null, lockMin: null, amostras: 0 }, at });
    const comEspelho = (at, locks) => ({ pl: pf, extra: { ...cols, execucao: cols.execucao.map((x) => (x.id === 'C02' ? { ...x, espelho: espelho(at, locks) } : x)) },
      docsExtra: { 'config/orquestracao': { limiares: { calado: 15, lockOrfao: 20, fonte: 'padrao', at: iso(60) } } } });
    const lv = comEspelho(iso(1), { 'migration 20261023_auditoria': { spec: 'C02-S01', desde: iso(4), estado: 'GRANTED-NOT-RELEASED' } });
    const ld = await perfil('locks ao vivo: dono', { id: 'u1', isOwner: true, canEdit: true }, true, lv);
    const le = await perfil('locks ao vivo: editor', { id: 'u2', isOwner: false, canEdit: true }, true, lv);
    const lc = await perfil('locks ao vivo: colaborador', { id: 'u3', isOwner: false, canEdit: false }, true, lv);
    const ll = await perfil('locks ao vivo: leitor', { id: 'u4', isOwner: false, canEdit: false }, false, lv);
    const lf = await perfil('locks ao vivo: formato cliente', { id: 'u1', isOwner: true, canEdit: true }, true, { ...lv, docsExtra: { ...lv.docsExtra, 'config/exibicao': { modo: 'cliente' } } });
    const linhaLock = (x) => /<b>20261023_auditoria<\/b><span class="ref">C02-S01<\/span><span class="tnum">4 min<\/span>/.test(x.exec);
    confere('locks ao vivo: dono e editor veem o card com a linha do lock', [ld, le].every((x) => !x.errors.length && tem(x, 'Locks ao vivo · espelho do Maestro · há 1 min') && linhaLock(x)), falhas);
    confere('locks ao vivo: ausente para colaborador, leitor e formato cliente', [lc, ll, lf].every((x) => !x.errors.length && !x.exec.includes('Locks ao vivo')), falhas);
    const lo = await perfil('locks ao vivo: órfão', { id: 'u1', isOwner: true, canEdit: true }, true, comEspelho(iso(1), { 'deploy fnA': { spec: 'C02-S01', desde: iso(25), estado: 'UNGRANTED' } }));
    confere('locks ao vivo: lock além do limiar aparece como órfão', tem(lo, 'lv-linha orf', '25 min sem RELEASE'), falhas);
    const lp = await perfil('locks ao vivo: parado', { id: 'u1', isOwner: true, canEdit: true }, true, comEspelho(iso(18), {}));
    confere('locks ao vivo: espelho parado', tem(lp, 'espelho parado há 18 min: a máquina que orquestra pode estar desligada', 'Nenhum lock aberto.'), falhas);
    // 9 conjuntos e 30 locks: renderAll() abaixo de 50 ms (o menor de 3 tempos, para uma rodada lenta não decidir).
    const p9 = JSON.parse(JSON.stringify(pf)), c9 = JSON.parse(JSON.stringify(cols));
    for (let i = 4; i <= 9; i++) { const id = `C0${i}`; p9.conjuntos.push({ ...p9.conjuntos[2], id, ordem: i, specs: [] }); p9.fases[1].conjuntos.push(id); }
    c9.execucao = p9.conjuntos.map((cj, i) => ({ id: cj.id, iniciadoEm: iso(60), espelho: espelho(iso(1), Object.fromEntries(Array.from({ length: i < 3 ? 4 : 3 }, (_, j) => [`file src/${cj.id}-${j}.ts`, { spec: `${cj.id}-S01`, desde: iso(j + 1), estado: 'UNGRANTED' }]))) }));
    const r9 = await perfil('locks ao vivo: 9 conjuntos, 30 locks', { id: 'u1', isOwner: true, canEdit: true }, true, { pl: p9, extra: c9 });
    const tempos = r9.renderAll ? [0, 1, 2].map(() => { const t0 = Date.now(); r9.renderAll(); return Date.now() - t0; }) : [Infinity];
    console.log('locks ao vivo: renderAll ms', tempos.join(', '));
    confere('locks ao vivo: 30 linhas e renderAll abaixo de 50 ms com 9 conjuntos', !r9.errors.length && (r9.exec.match(/class="lv-linha/g) || []).length === 30 && Math.min(...tempos) < 50, falhas);
    // Auditoria (C03-S01): 63 documentos, a página lê os 50 mais recentes e mostra 20; só dono e editor.
    const dd = (n) => String(n).padStart(2, '0'), hm = (iso) => { const t = new Date(iso); return `${dd(t.getDate())}/${dd(t.getMonth() + 1)} ${dd(t.getHours())}:${dd(t.getMinutes())}`; };
    const docsAud = Array.from({ length: 63 }, (_, i) => ({ id: `a${i}`, acao: i % 2 ? 'RELEASE' : 'GO', alvo: `C01-S${dd(i)}`, motivo: `motivo ${i}`, regra: 'step-05 §5.3', at: new Date(Date.UTC(2026, 9, 23, 18, 0) - i * 60000).toISOString() }));
    const linhaAud = (d) => `${hm(d.at)} ${d.acao} · ${d.alvo} · ${d.motivo} · regra ${d.regra}`;
    const ROT = 'Auditoria · cada diretiva com motivo e regra';
    const ad = await perfil('auditoria: dono', { id: 'u1', isOwner: true, canEdit: true }, true, { ...o, extra: { ...cols, auditoria: docsAud } });
    const ae = await perfil('auditoria: editor', { id: 'u2', isOwner: false, canEdit: true }, true, { ...o, extra: { ...cols, auditoria: docsAud } });
    const aOK = (x) => !x.errors.length && x.exec.includes(ROT) && docsAud.slice(0, 20).every((d) => x.exec.includes(`>${esc(linhaAud(d))}<`)) && !x.exec.includes(`>${esc(linhaAud(docsAud[20]))}<`) && (x.exec.match(/aud-linha"/g) || []).length === 20;
    confere('auditoria: dono e editor veem o rótulo e as 20 linhas mais recentes', aOK(ad) && aOK(ae), falhas);
    confere("auditoria: um listener orderBy('at','desc').limit(50)", [ad, ae].every((x) => x.ouvidos.includes("auditoria.orderBy('at','desc').limit(50)")), falhas);
    const abrir = () => { ad.clicar('auditoria-todas'); return ad.els['modal-panel'].innerHTML; };
    confere('auditoria: botão "ver as 50 mais recentes" abre modal() com as 50 linhas', ad.exec.includes('data-act="auditoria-todas"') && ad.exec.includes('ver as 50 mais recentes') && (() => { const m = abrir(); return (m.match(/aud-linha"/g) || []).length === 50 && m.includes(esc(linhaAud(docsAud[49]))) && !m.includes(esc(linhaAud(docsAud[50]))); })(), falhas);
    const az = await perfil('auditoria: dono, 0 documentos', { id: 'u1', isOwner: true, canEdit: true }, true, o);
    confere('auditoria: sem documentos mostra nenhuma ação ainda, sem botão', az.exec.includes(ROT) && az.exec.includes('nenhuma ação ainda') && !az.exec.includes('auditoria-todas'), falhas);
    const ac = await perfil('auditoria: colaborador', { id: 'u3', isOwner: false, canEdit: false }, true, { ...o, extra: { ...cols, auditoria: docsAud } });
    const al = await perfil('auditoria: leitor', { id: 'u4', isOwner: false, canEdit: false }, false, { ...o, extra: { ...cols, auditoria: docsAud } });
    confere('auditoria: colaborador e leitor sem bloco e sem listener', [ac, al].every((x) => !x.errors.length && !x.exec.includes('Auditoria') && !x.exec.includes('aud-linha') && !x.ouvidos.some((n) => n.startsWith('auditoria'))), falhas);
    if (saida) {
      fs.mkdirSync(path.join(saida, 'sims'), { recursive: true });
      fs.writeFileSync(path.join(saida, 'index.html'), html);
      fs.writeFileSync(path.join(saida, 'plano.json'), JSON.stringify(pf, null, 2));
      fs.writeFileSync(path.join(saida, 'sims/exemplo.html'), '<!doctype html><meta charset="utf-8"><script>const state = { screen: "a" };</script><p>Simulador de exemplo</p>');
      for (const s of pf.specs) { fs.mkdirSync(path.join(saida, s.espelho), { recursive: true }); fs.writeFileSync(path.join(saida, s.espelho, 'spec.md'), SPEC_TXT); }
      console.log('planejamento de exemplo gravado em', path.resolve(saida));
    }
  }
  console.log(falhas.length ? 'FALHOU' : 'ok'); process.exit(falhas.length ? 1 : 0);
})();
