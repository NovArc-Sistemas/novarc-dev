// Confere um simulador contra o plano.json, rodando DENTRO da página do simulador (servida pela pasta do planejamento).
// Uso por agente: sirva a pasta (node ferramentas/servir.js <pasta>), abra sims/<arquivo>.html no navegador e execute
// este arquivo inteiro no console (ou pela ferramenta de JavaScript do navegador). Devolve um relatório em JSON.
// O que confere: o contrato do simulador (state.screen, go(), #tgl-markers, #app; com superfícies, state.telas e
// data-superficie; com versão Hoje, versaoSimulador(); com mensagens, a prévia de cada uma) e se cada mudança do plano
// tem um elemento data-chg em alguma tela e cada tela é alcançável. Mudanças que só aparecem dentro de um modal ou
// depois de uma ação são listadas como "nao_encontradas": confira essas à mão. Telas de detalhe que dependem de um item
// escolhido (pedido, NF, envio) costumam aparecer em "telas_com_erro" ao abrir sem contexto; isso é esperado.
// Chrome sempre presente (referencias/simulador-fiel.md): toda tela precisa mostrar o logo real (<img> ou <svg> com
// data-chrome="logo"), o menu (data-chrome="nav") e as ações fixas do cabeçalho (data-chrome="header-actions").
// Tela sem algum deles entra em "chrome_faltando", e isso é falha: o simulador não está fiel ao app real.
(async () => {
  const plano = await (await fetch('../plano.json', { cache: 'reload' })).json();
  const arquivo = location.pathname.split('/').slice(-2).join('/');
  const sim = plano.simuladores.find((s) => s.arquivo === arquivo) || plano.simuladores[0];
  const sups = Array.isArray(sim.superficies) ? sim.superficies : [];
  const espera = () => new Promise((r) => setTimeout(r, 200));
  // Telas visíveis agora: state.telas (superfície -> tela) quando há superfícies; senão só state.screen.
  const visiveis = () => (sups.length && state.telas && typeof state.telas === 'object' ? state.telas : { '': state.screen });
  const contrato = {
    'state.screen': typeof state === 'object' && typeof state.screen === 'string',
    'go()': typeof go === 'function',
    '#app': !!document.getElementById('app'),
    '#tgl-markers': !!document.getElementById('tgl-markers'),
    'sem painel próprio visível': !document.getElementById('panel') || getComputedStyle(document.getElementById('panel')).display === 'none',
  };
  if (sups.length) contrato['state.telas'] = typeof state === 'object' && !!state.telas && typeof state.telas === 'object';
  if (sim.hoje) contrato['versaoSimulador()'] = typeof window.versaoSimulador === 'function';
  // Em qual tela um elemento está: com superfícies, a tela atual da superfície que o contém.
  const telaDe = (el, telaPedida) => { if (!sups.length) return telaPedida; const box = el.closest('[data-superficie]'); return box ? visiveis()[box.dataset.superficie] || null : null; };
  const CHROME = ['logo', 'nav', 'header-actions'];
  const visivel = (el) => !!el && el.getClientRects().length > 0;
  const logoOk = (el) => visivel(el) && (/^(img|svg)$/i.test(el.tagName) || !!el.querySelector('img,svg'));
  const vistos = {}, telasOk = [], telasErro = [], semSuperficie = new Set(), raizes = new Set(), chromeFaltando = [];
  for (const t of sim.telas.filter((x) => x.id !== '*')) {
    try { go(t.id); await espera(); (Object.values(visiveis()).includes(t.id) ? telasOk : telasErro).push(t.id); } catch (e) { telasErro.push(`${t.id} (${e.message})`); continue; }
    for (const box of document.querySelectorAll('[data-superficie]')) raizes.add(box.dataset.superficie);
    for (const el of document.querySelectorAll('[data-chg]')) { const tela = telaDe(el, t.id); if (!tela) { semSuperficie.add(el.dataset.chg); continue; } (vistos[el.dataset.chg] = vistos[el.dataset.chg] || new Set()).add(tela); }
    const falta = CHROME.filter((k) => { const el = document.querySelector('[data-chrome="' + k + '"]'); return k === 'logo' ? !logoOk(el) : !visivel(el); });
    if (falta.length) chromeFaltando.push({ tela: t.id, falta });
  }
  // Gancho opcional abrirMudanca(id): o próprio simulador abre o item, o perfil ou o modal das mudanças que não
  // aparecem só navegando pelas telas (detalhe de pedido, modal). Sem o gancho, elas ficam em nao_encontradas.
  const gancho = typeof abrirMudanca === 'function';
  if (gancho) for (const m of plano.mudancas.filter((x) => x.sim === sim.id && !x.tecnica && !vistos[x.id])) {
    try { abrirMudanca(m.id); await new Promise((r) => setTimeout(r, 250)); if (document.querySelector('[data-chg="' + m.id + '"]')) (vistos[m.id] = vistos[m.id] || new Set()).add(m.telaId === '*' ? state.screen : m.telaId); } catch (e) {}
  }
  const doSim = plano.mudancas.filter((m) => m.sim === sim.id);
  // Trabalho técnico (tecnica: true) não tem tela nem marcador: fica fora da conferência.
  const naoEncontradas = doSim.filter((m) => !m.tecnica && !vistos[m.id]).map((m) => `${m.id} (${m.tela})`);
  const foraDoPlano = Object.keys(vistos).filter((id) => !doSim.some((m) => m.id === id));
  const telaDiferente = doSim.filter((m) => vistos[m.id] && m.telaId !== '*' && !vistos[m.id].has(m.telaId)).map((m) => `${m.id}: plano diz ${m.telaId}, achado em ${[...vistos[m.id]].join(', ')}`);
  const r = { simulador: sim.id, gancho, contrato, telas_ok: telasOk.length, telas_com_erro: telasErro, mudancas: doSim.filter((m) => !m.tecnica).length, achadas: doSim.filter((m) => !m.tecnica).length - naoEncontradas.length, tecnicas_sem_marcador: doSim.filter((m) => m.tecnica).length,
    nao_encontradas: naoEncontradas, data_chg_fora_do_plano: foraDoPlano, tela_diferente: telaDiferente, chrome_faltando: chromeFaltando,
    falhou: !Object.values(contrato).every(Boolean) || chromeFaltando.length > 0 || foraDoPlano.length > 0 };
  if (sups.length) {
    r.superficies_sem_raiz = sups.filter((s) => !raizes.has(s.id)).map((s) => s.id);
    r.data_chg_fora_de_superficie = [...semSuperficie];
  }
  // Mensagens: go(tela, { mensagem }) precisa mostrar a prévia, com data-msg="<id>" na raiz da mensagem.
  const msgs = (plano.mensagens || []).filter((x) => x.sim === sim.id);
  if (msgs.length) {
    r.mensagens = msgs.length; r.mensagens_sem_previa = [];
    for (const x of msgs) { try { go(x.tela, { mensagem: x.id }); await espera(); if (!document.querySelector(`[data-msg="${x.id}"]`)) r.mensagens_sem_previa.push(x.id); } catch (e) { r.mensagens_sem_previa.push(`${x.id} (${e.message})`); } }
  }
  if (sim.hoje && typeof window.versaoSimulador === 'function') {
    try { window.versaoSimulador('hoje'); await espera(); window.versaoSimulador('all'); r.versao_hoje = 'ok'; } catch (e) { r.versao_hoje = `erro: ${e.message}`; }
  }
  console.log(r); return JSON.stringify(r);
})();
