# Template de planejamento NOVARC

Guia para o agente que cria ou atualiza um planejamento a partir deste template. A página (`index.html`) é uma
casca fixa: tudo que muda de um projeto para outro está em `plano.json` e nos simuladores em `sims/`.

A fonte é a pasta `template/` da skill `novarc-session-brainstorm`, no repositório novarc-skills: a casca e, em
`exemplo/`, um planejamento fictício completo (`EXM-ERP-COMPRAS`) que acende todas as seções da página.
O template publicado (https://claude.ai/artifact/Q3UMRWUdB25AXzDRBFGRLf) é uma vitrine montada a partir dela com
`ferramentas/montar-exemplo.js`: nunca edite a vitrine à mão. Arquivos de um planejamento publicado: `index.html`,
`plano.json`, `plano.schema.json`, `TEMPLATE.md`, `entrevista-pendencias.md`, `ferramentas/*.js`, `sims/*.html` e,
quando há specs, o espelho `specs/<id>/*.md`.

## O que a página faz

- Capa, status e aprovação (rascunho, aprovação interna, reunião com o cliente, aprovação do cliente, ajustes,
  aprovado, em execução), com parecer obrigatório para "ajustes" e "aprovado".
- Simuladores em destaque. Dentro de cada um (a bancada), ao lado do simulador: mudanças da tela, todas as mudanças
  com filtros, decisões, pendências (com resposta), mensagens (quando o plano tem), vídeos e o detalhe da mudança com
  notas de lógica e prova.
- Superfícies: um simulador pode mostrar várias partes do sistema ao mesmo tempo (o site do cliente, o painel do
  operador, o WhatsApp e o e-mail de quem recebe). A aba Tela lista as mudanças de cada superfície visível.
- Versão por fase: com a Fase N escolhida, o simulador esconde o que só nasce depois. Com `hoje`, a versão Hoje
  mostra o sistema antes do plano, inclusive o que era diferente (o e-mail antigo, o texto que mudou).
- Ticket (quando o plano tem `tickets[]`): o seletor ao lado da versão por fase leva ao simulador e à tela da
  primeira mudança do ticket, abre a aba Ticket no painel (tipo, severidade, decisão, o texto original, o que a
  investigação achou, a solução e as mudanças que o entregam) e deixa no simulador só essas mudanças, pelo mesmo
  mecanismo da versão por fase (visível = fase E ticket). Ticket sem mudança não filtra nada e o cartão diz "Ainda
  sem implementação: decisão pendente". Plano sem tickets: o seletor não aparece. Cada ticket pertence ao simulador das mudanças que o entregam (ou ao do campo `sim`, obrigatório para ticket ainda sem mudança num plano com mais de um simulador): o seletor só lista os tickets do simulador aberto, e um ticket não vaza para os outros.
- Revisão (quando o plano tem `revisoes[]`): na lista de mudanças da bancada, o filtro Revisão mostra só as
  mudanças que entraram ou mudaram numa rodada de revisão conjunta (uma reunião, um lote de feedback), para revisar
  cada rodada com o cliente. O mesmo filtro apaga, no simulador, os marcadores das mudanças de fora da rodada (o
  conteúdo continua na tela). Plano sem revisoes: o filtro não aparece.
- Mensagens: o catálogo das comunicações (WhatsApp, e-mail, SMS, push, aviso no sistema), com gatilho, destinatário,
  quem envia e se já existe, muda ou é nova, cada uma com prévia dentro do simulador.
- Fases e prazos, specs e execução por conjunto (ou pacotes de repasse quando o cliente desenvolve), biblioteca de
  documentos, dívida técnica, horas ativas (só interno) e histórico.
- Specs e execução: resumo, mapa de dependências por fase, conjuntos agrupados por fase com trilho de etapas e a
  tabela de specs (etapa, situação, pendências que seguram, Ver spec). O spec abre formatado a partir do espelho.
- Biblioteca: os specs de `plano.json` entram sozinhos (não registre spec na coleção `documentos`, ele apareceria
  duas vezes); planos, revisões e reuniões entram pelo banco.

## Criar um planejamento novo (duplicar)

1. Leia este arquivo, `plano.schema.json` e o exemplo em `exemplo/`, na pasta `template/` da skill. Não edite o
   `index.html`: ele é igual em todo planejamento. Melhoria na casca chega com versões novas do plugin,
   não para uma cópia.
2. Monte numa pasta local: `index.html` (cópia sem mudança), `plano.json` novo e `sims/<id>.html`.
3. Escreva o `plano.json` seguindo o schema. Regras:
   - `schema: "novarc-planejamento/1"`, sem `template` (só o exemplo do template leva `template: true`, que mostra a faixa
     de template na capa; tire ao partir dele).
   - `fluxo` definido de uma vez: quem aprova e quem desenvolve não se trocam pela página.
   - Toda mudança tem `id` igual ao `data-chg` do simulador, `telaId`, `fase`, `porque` em linguagem de negócio e
     ao menos uma prova em `refs` (arquivo:linha, documento, consulta, reunião).
   - Ligações nos dois sentidos: `mudancas[].decisoes` espelha `decisoes[].mudancas`; o mesmo para pendências.
   - Pendência tem o que já se sabe (com fonte) e a pergunta exata, quem responde e a fase que segura.
   - Ids nunca mudam depois de publicados (notas, respostas e citações no banco apontam para eles). Mudança nova
     entra no fim da lista, para não renumerar os marcadores que o cliente já viu.
   - Trabalho sem tela (dívida técnica, segurança, limpeza de código) que o plano vai fazer é mudança com
     `tecnica: true` e `telaId: "*"`: entra nas fases e nos specs, aparece na bancada em "Trabalho técnico, sem
     tela" e não tem marcador. A dívida em `abertos[]` que ela resolve aponta para ela com `mudanca`; a seção Em
     aberto mostra a fase. Dívida que o plano não resolve fica em `abertos[]` sem `mudanca`.
   - Tickets de feedback do cliente triados no plano (opcional): `tickets[]` com `id` (o da origem), `titulo`,
     `tipo` (`bug` ou `improvement`), `severidade` (texto ou null), `data` (DD/MM/AAAA), `origem` (caminho da
     página), `descricao` (o texto original, sem reescrever), `achado`, `solucao`, `decisao` (`entra`, `fora`,
     `decidir`) e `mudancas` (ids das mudanças que o entregam; a primeira é para onde a bancada leva). O validador
     cobra ids únicos e mudanças existentes, e avisa ticket `entra` sem mudança.
   - Revisões conjuntas (opcional): `revisoes[]` com `id`, `titulo`, `data` (DD/MM/AAAA), `versao` e `resumo`; cada
     mudança que entrou ou mudou na rodada leva o id em `mudancas[].revisoes`. O validador cobra ids únicos, revisão
     citada que existe e avisa rodada sem mudança.
4. Construa o simulador seguindo o contrato abaixo.
5. Verifique (seção Verificação). Só publique com tudo verde.
6. Publique um artefato NOVO (sem `url`): `file_path` = o `index.html`, `files` = `plano.json`, `plano.schema.json`,
   `TEMPLATE.md`, `entrevista-pendencias.md`, `ferramentas/*.js` e `sims/*.html`, `icon: "plan"`, `title` no padrão
   abaixo e exatamente estas capacidades:

   ```json
   {
     "db": { "rules": [
       { "path": "config", "write": "admin" },
       { "path": "fases", "write": "admin" },
       { "path": "horas", "read": "admin", "write": "admin" },
       { "path": "auditoria", "read": "admin", "write": "admin" },
       { "path": "execucao", "write": "admin" },
       { "path": "specs", "write": "admin" }
     ] },
     "user": { "scopes": ["profile"] },
     "comments": { "composer_only": true },
     "downloads": true,
     "room": {}
   }
   ```

   **Nome do artefato:** `Planejamento <projeto.cliente> · <projeto.nomeCurto>`, de 2 a 5 palavras no total, por
   exemplo `Planejamento Brinkanto · Financeiro OMNI`. Preencha `projeto.nomeCurto` no `plano.json` (sem ele, a
   página usa `projeto.nome`, que é o título da capa e costuma ser longo). A casca não tem `<title>`: o nome do
   artefato vem do `title` do publish, e a aba do navegador é montada pela página com a mesma regra. Passe o mesmo
   `title` em toda republicação. A vitrine do template se chama `Planejamento NOVARC · Template`.

   `room` mostra quem está no planejamento (avatares no topo e na bancada), o cursor de cada pessoa e, na bancada,
   quem está vendo a mesma mudança. Nada disso é gravado.

   Em toda republicação que passa `capabilities`, passe o objeto inteiro: omitido, o artefato mantém o antigo; um
   objeto parcial revoga o que ficou de fora. O escopo `email` do `user` é
   recusado nesta conta: não tente.
7. Diga a quem conduz para compartilhar pelo menu Compartilhar (a página e o agente não conseguem):
   `projetos@novarcsistemas.com` como Editor; o cliente como Colaborador (aprova, responde e comenta) por convite
   de e-mail, nunca por link aberto (link aberto dá só leitura e derruba o nível de Editor de fora da organização).

## Atualizar um planejamento existente

Edite só o `plano.json` (e o simulador, se for o caso) e republique com `url` do planejamento, passando `files`
com o que mudou. O banco (status, respostas, notas, documentos, vídeos, horas) fica intacto. Para dados do banco,
use `ArtifactData`, nunca o `plano.json`.

## Contrato do simulador

Um arquivo HTML completo por simulador (`<!doctype html>`, charset, viewport e estilos próprios), fiel à interface
real do sistema do cliente: tokens, componentes, ícones e textos copiados do repositório, dados com cara de reais.
As regras de fidelidade são obrigatórias e estão em `referencias/simulador-fiel.md` (na skill): toda tela tocada
refeita 1:1 a partir dos componentes reais (com arquivo:linha em `simuladores[].fonte`), o chrome do app sempre
presente com o logo real copiado do repositório, regras de campo compiladas do código do cliente, inventário da
tela real antes de desenhar, simulador mobile dentro de uma moldura de celular. Simulador simplificado é bug.

Obrigatório, porque a bancada depende disso:

| Item | Por quê |
|---|---|
| `const state = { screen: '<tela>', ... }` global, com `state.screen` = id da tela atual | a bancada lê a tela (mesma origem) para listar as mudanças dela |
| `function go(id, opts)` global que navega e re-renderiza | a versão por fase volta para uma tela que existe |
| `function abrirMudanca(id)` global, opcional, que leva o simulador até onde a mudança aparece: escolhe o item de uma tela de detalhe (um pedido, um recebimento), troca o perfil simulado e abre o modal se for o caso | o seletor de ticket e o "Ir até o marcador" da bancada chamam o gancho; o `checar-simulador.js` também, para achar os marcadores de detalhe e de modal. Sem ele, mudança de tela de detalhe abre a tela sem item e o marcador não aparece |
| todo elemento de uma mudança com `data-chg="<id>" data-n="<n>" data-t="<TIPO>"` | marcador numerado, clique abre o detalhe, versão por fase esconde |
| toda navegação com `data-go="<tela>"` | versão por fase tira links para telas futuras |
| `#app` com a classe `mk` e o checkbox `#tgl-markers` ("Marcações") alternando `mk` | liga e desliga os marcadores |
| CSS dos marcadores sob `.mk [data-chg]` (contorno tracejado) e `.mk [data-chg]::after` (selo com `attr(data-n)`, `pointer-events: none`) | a versão por fase só tira o marcador das alterações futuras |
| faixa de protótipo no topo com o logo NOVARC e "dados de exemplo, não são números reais" | deixa claro que não é o sistema |
| sem painel de planejamento próprio | mudanças, decisões e pendências moram só na bancada. Se o simulador veio de uma versão com painel, esconda `#btn-panel, #panel` e anule o `padding-right` que ele aplica no `#main`, senão sobra uma faixa vazia à direita |
| perfis simulados (`data-papel`) quando o fluxo tem papéis diferentes, num seletor "Ver como" na faixa de protótipo, ao lado de Marcações, nunca no cabeçalho das telas | mostra a visão de cada pessoa; o seletor é da ferramenta, não do sistema, e precisa estar em todas as telas, inclusive as que se abrem por dentro de outra |
| `data-chg` em todo elemento da mudança, inclusive repetições fora da tela dela (um botão que também aparece na barra do topo) | uma cópia sem marcador parece que já existia no sistema |
| em toda tela: `data-chrome="logo"` no `<img>`/`<svg>` do logo real do cliente, `data-chrome="nav"` no menu real, `data-chrome="header-actions"` nos ícones fixos do cabeçalho (notificações, avatar e o que o app real mostrar) | `checar-simulador.js` reprova a tela sem algum deles: tela sem o chrome do app não é a tela real |

Mudança que é um contêiner com itens de fases anteriores (ex.: uma seção inteira do menu) leva `oculta: false` no
`plano.json`: na versão por fase ela perde o marcador mas não some. `simuladores[].telas[].fase` é a fase em que a
tela passa a existir; tela que já existe no sistema hoje leva `existe: true` e nunca sai do menu numa versão anterior.

### Quando o fluxo atravessa várias partes do sistema

Opcional, para quando a mudança só se entende vendo dois lados ao mesmo tempo: o cliente aceita no site e o operador
vê na lista; o sistema dispara um e-mail e quem recebe abre. Um simulador só, com estado compartilhado, mostra as
partes lado a lado. O exemplo do template faz isso com o ERP e o e-mail do fornecedor.

| Item | Por quê |
|---|---|
| `simuladores[].superficies` no `plano.json` (id e nome de cada parte) e `superficie` em toda tela | a bancada agrupa as mudanças por parte do sistema |
| `state.telas = { <superfície>: <tela> }` só com as superfícies visíveis agora; `state.screen` segue sendo a tela da superfície principal | a aba Tela lista as mudanças de tudo o que está na frente de quem olha |
| ids de tela únicos no simulador inteiro, e `go(id)` mostra a superfície da tela pedida | a bancada leva até um marcador de qualquer superfície |
| a raiz de cada superfície com `data-superficie="<id>"` | o checador sabe em que tela está cada marcador |
| controles de cenário na faixa de protótipo (mostrar ou esconder uma superfície, avançar o relógio, recomeçar, escolher o exemplo) | são da ferramenta, não do sistema, como o "Ver como" |

### Versão Hoje

Com `simuladores[].hoje: true`, a bancada ganha a versão Hoje antes da F1: nada do plano aparece e a bancada chama
`window.versaoSimulador('hoje')` no simulador (e de novo com o id da fase ou `'all'` a cada troca). O simulador guarda
a versão no estado e desenha o que era diferente antes: o e-mail no formato antigo, o texto que o plano muda. Mudança
ALTERADO só fica fiel na versão Hoje se o simulador desenhar o antes; sem isso, ela aparece no formato novo, só sem
marcador.

### Mensagens

O catálogo `mensagens` do `plano.json` lista o que o sistema manda e para quem: canal (`whatsapp`, `email`, `sms`,
`push`, `sistema`), gatilho, destinatário, remetente (`automatico`, `agente`, `equipe`, `pessoa`) e origem (`existe`
hoje igual, `alterada` pelo plano ou `nova`), ligada às mudanças que a criam ou alteram. A bancada mostra a aba
Mensagens e o detalhe da mudança lista as mensagens dela. Contrato: `go(<tela>, { mensagem: <id> })` mostra a prévia
dessa mensagem com dados de exemplo, mesmo antes de o fluxo dispará-la, e a raiz da prévia leva `data-msg="<id>"`.
Uma mensagem alterada mostra o formato antigo na versão Hoje.

## Banco do artefato

| Caminho | O que guarda | Quem escreve |
|---|---|---|
| `plano/estado` | status atual, parecer, quem e quando | Colaborador para cima |
| `historico` | cada mudança de status | Colaborador para cima |
| `pendencias/{id}` | `{resposta, situacao: respondida ou parcial, falta, by, at, origem, enviada}`; `falta` diz o que ainda falta numa resposta parcial; `origem: "entrevista"` quando veio de `entrevista-pendencias.md`; `enviada: {by, at}` marcada pelo Maestro (painel da orquestradora, "marcar como enviada ao cliente"): só esse campo, nunca `resposta`/`situacao`/`falta`, e uma resposta salva pela página (que grava o documento inteiro) a apaga | Colaborador para cima |
| `notas` | `{mudanca, tipo: logica, prova, regra ou duvida, texto, ref, by, at, origem}` | Colaborador para cima; agentes com `origem: "agente"` |
| `documentos` | `{tipo: spec, plano, revisao, reuniao, pesquisa ou outro, camada, titulo, ref, fase, resumo, by, at, origem}` | idem |
| `videos` | `{titulo, url, sim, fase, descricao, by, at}` | idem |
| `fases/{id}` | ajuste de prazo, executor e horas previstas | Editor |
| `config/exibicao` | formato (cliente, interno, dev) e seções visíveis | Editor |
| `horas` | `{data, minutos, tipo, fase, pessoa, branch, sessao, transcript, resumo}`, mais `tokens` (`{entrada, saida, cacheCriacao, cacheLeitura, total}`) no de execução. `tipo` é `ativa` (padrão; documento sem tipo é ativa) ou `execucao`. Um documento por sessão, dia e tipo: `<sessao8>-<data>` para ativa, `<sessao8>-<data>-exec` para execução. `sessao` é o id inteiro da sessão do Claude Code e `transcript` o caminho do jsonl (`~/.claude/projects/<pasta>/<id>.jsonl`); a página junta os documentos de uma sessão numa linha, com ativas, execução e tokens lado a lado e o id copiável. `tokens` e `transcript` são opcionais (documento sem eles mostra `-`). Minutos e tokens medidos por `scripts/horas-ativas.mjs` da skill a partir do log da sessão (`--execucao` para execução e tokens, subagentes incluídos; cada resposta da API conta uma vez). Horas ativas contam só o que a pessoa digitou, inclusive no meio do turno; mensagens entre sessões, notificações e lembretes do app nunca contam. Execução conta para a pessoa dona da sessão que a gerou; depois de uma passagem, para quem assumiu. Leitura só Editor | Editor |
| `execucao/{conjunto}` | `{sessao, iniciadoEm, bloqueios, espelho}` (detalhe em Specs e execução); `espelho` = `{locks, specs, ritmo, at}`, o espelho do ledger em disco, gravado só pelo mod da sessão do conjunto | Editor (`write: admin`) |
| `config/continuo` | `{runId, modo, modoBy, modoAt, autorizacao: {by, at, escopo, teto, continuoHabilitado} \| null}`; escrito pela sessão orquestradora (o agente na liberação, o mod no modo) | Editor (`write: admin`) |
| `config/orquestracao` | execução em andamento: `{runId, sessao, iniciadaEm, slots, limiares, proposta, at}`; escrito só pelo mod da sessão orquestradora | Editor (`write: admin`) |
| `specs/{spec}` | `{etapa, branch, headSha, pr, revisao, reserva, revisando, removido, validacao, desvios, pendings, bloqueios}` | Editor (`write: admin`) |
| `auditoria` | `{acao, alvo, motivo, regra, linha, antes, depois, estado, runId, sessao, papel, by, at, origem}`; cada ação automática do Maestro e do orquestrador (diretiva, bloqueio de guarda, RELEASE repassado) com o motivo e a regra que a permitiu. Só acrescenta (só `estado` é atualizado); sem segredo, prompt nem saída de comando. A página lê as 50 mais recentes e mostra 20 em "Specs e execução", só para dono e Editor | Editor (`read: admin`, `write: admin`) |

A área interna (Configurações e horas) aparece para o dono e para Editores; a trava real são as regras acima.
O cliente, como Colaborador, lê o andamento da execução mas não muda.

## Specs e execução (session-plan)

Campos opcionais do `plano.json`: planejamento sem `specs` continua válido e a página se comporta como antes. Quando
`specs` existe, o validador liga as invariantes abaixo. Quem escreve estes campos é só a `novarc-session-plan`; à
mão, nunca.

| Campo | O que é |
|---|---|
| `conjuntos[]` | Cada conjunto (`C01`, `C02`...) é uma sessão de desenvolvimento com um ou mais specs, numerada na ordem de implementação: `fase`, `ordem`, `specs`, `dependeDe` (conjuntos que precisam estar mergeados antes), `paraleloCom` (permissão para rodar junto, nunca com um conjunto da própria cadeia de dependência), `estimativaHoras` e `prompt` (pronto para colar, em pt-BR) |
| `specs[]` | Cada spec (`C01-S01`) entrega um grupo de mudanças: `conjunto`, `titulo`, `slug` (único no plano), `mudancas`, `bloqueadoPor` (pendências abertas que o seguram), `arquivos` (`repo`: pasta no repositório do cliente; `commit`: procedência; `itens`: `{nome, sha256}`, sempre com `spec.md`) e `espelho` (`specs/C01-S01/`) |
| `mudancas[].spec` | O spec que entrega a mudança. Espelho de `specs[].mudancas`. Obrigatório em toda mudança de uma fase que já tem conjunto; numa fase ainda sem conjunto (plano cortado por partes, uma session-plan por vez) fica vazio e o validador só avisa |
| `fases[].conjuntos` | Os conjuntos da fase. Todo conjunto aparece em exatamente uma fase, a mesma de `conjuntos[].fase` |
| `execucao` | `branchPrefixo` (convenção de branch do cliente), `ramoDocs` (`direct-main` ou `docs-pr`: como os specs chegam ao repositório) e `orquestrador` (nome da sessão orquestradora); `perfil` opcional, o perfil de execução do projeto (`hostGit`, `mergePath`, `formato`, `gate`, `migracao`, `deploys`, `merge`, `teto`, mais `stack`, `base`, `janelaDeploy`, `fontes`, `geradoEm`): só tipos, comandos e sim/não, nunca segredo; campo ausente = parar e perguntar |

Regras que o validador cobra: mudança e spec ligados nos dois sentidos, spec e conjunto também; todo spec com ao
menos uma mudança; grafo de dependência sem ciclo; a fase de uma mudança é a fase do conjunto do seu spec, e a fase
de uma tela é a da primeira mudança nela; `espelho` no formato `specs/C00-S00/`, nomes de arquivo `[a-z0-9-].md`,
sha256 com 64 hexadecimais; `slug` único.

**Fonte e espelho.** O spec mora no repositório do cliente (`arquivos.repo`); a pasta `specs/` do artefato é só o
espelho para leitura, publicado pela session-plan com o mesmo conteúdo e o mesmo hash. Nunca edite o espelho: o
validador e a página acusam "espelho desatualizado" quando o hash não bate. Com `--repo`, o validador também acusa
"fonte mudou depois da publicação" quando o arquivo no repositório não bate com o hash registrado.
Um `arquivos.repo` guardado como `ai/specs/...` continua valendo: o validador lê primeiro em `.novarc/specs/...`
e, se o arquivo não estiver lá, no caminho guardado.

**Mesmo nome de propósito.** A coleção `specs` do banco e a pasta `specs/` publicada usam os mesmos ids: o documento
`specs/C01-S01` do banco guarda a execução do spec cujo espelho está em `specs/C01-S01/`. Um é estado, o outro é texto.

### Documentos do banco

`execucao/{conjunto}` guarda só `{sessao, iniciadoEm, bloqueios, espelho}`. Etapa, branches, PRs, validação e status
do conjunto são calculados na leitura a partir dos documentos dos seus specs; nada agregado é gravado. `espelho` não é
agregado: é a cópia do ledger em disco (locks abertos com dono e hora, o último checkpoint de cada spec sem saída de
comando, o ritmo medido), reescrita inteira pelo mod no máximo uma vez por minuto, e a página mostra os locks dele em
"Locks ao vivo" para dono e editor.

`specs/{spec}`:

| Campo | O que guarda |
|---|---|
| `etapa` | `null` até começar; depois, em ordem: `iniciado` < `plano-aprovado` < `implementando` < `branch-publicada` < `pr-aberto` < `merge`. Só avança: quem grava confere que a etapa guardada é anterior |
| `branch`, `headSha`, `pr` | Branch do spec (`<branchPrefixo><id em minúsculas>-<slug>-<AAAAMMDD>`), o último commit publicado e o link do PR |
| `revisao` | sha256 do `spec.md` que começou a ser construído. Spec iniciado não muda de conteúdo sob o mesmo id: mudança de escopo vira spec novo |
| `reserva`, `revisando` | `{sessao, at}` da sessão do conjunto que reservou o spec e `{at}` da session-plan que está revisando. Os dois nunca ficam juntos (ver abaixo) |
| `removido` | `true` quando o id saiu do plano; o documento fica e a página ignora |
| `validacao` | `{resultado: aprovado ou reprovado, sha, marcadoresOk, falhas: [{mudanca, n, motivo}]}`. Vale só enquanto `sha` = `headSha` |
| `desvios`, `pendings` | `[{requisito, oQueMudou, porque}]` e `[texto]`, gravados no fechamento |
| `bloqueios` | `{ "<causa>": {motivo, at} }`, com causa `pendencia:<id>`, `escalacao:<n>`, `hold` ou `parada:<tipo>` (`gate-vermelho`, `conflito-merge`, `colisao-superficie`, `pendencia-cliente`, `codex-travado`, `falha-deploy`). Mesmo campo em `execucao/{conjunto}` |

O status não é gravado: a página e o mod calculam. Com qualquer chave em `bloqueios`, bloqueado; senão, com todo spec
em `merge`, concluído; senão, com alguma etapa, em andamento; senão, não iniciado. "Validado no simulador" aparece
quando todo spec do conjunto tem `validacao.resultado` aprovado no `headSha` atual; "Spec alterado depois do início"
quando o `spec.md` publicado não bate com `revisao`.

### Quem escreve o quê

Toda escrita de agente é presa à versão lida (`if_version`) e usa `update` só dos campos do próprio escritor, nunca
`set` sobre o documento inteiro. Em conflito de versão, relê e tenta de novo (até 3 vezes). Bloqueios são gravados e
limpos chave a chave (`{"bloqueios": {"hold": {"__delete__": true}}}`), e só quem gravou a chave a limpa, depois de
conferir que a causa acabou.

| Quem | Escreve |
|---|---|
| Sessão do conjunto (a sessão principal da novarc-session-build e o mod carregado nela; a novarc-session-end é a mesma sessão) | `execucao/{seu conjunto}` inteiro (o campo `espelho`, só o mod; uma sessão de spec nunca o grava); dos seus specs: `etapa`, `branch`, `headSha`, `pr`, `revisao`, `reserva`, `desvios`, `pendings`, `bloqueios`; `auditoria` (só acrescenta) |
| Sessão de spec | `auditoria` (só acrescenta); os campos da fase de build do próprio `specs/{id}` (`plano-aprovado`, `implementando`, `branch-publicada`, `headSha`), do seu READY até a sessão do conjunto gravar `NOTE DONE-ACEITO`, e de novo depois de um `NOTE REABERTO` |
| Forks da sessão do conjunto | nada: o que fazem chega à sessão do conjunto pelo ledger (`PUSHED`, `CODEX APPROVED`, `DONE`) |
| Orquestrador | `specs/{id}.validacao` e, pelo mod, `config/orquestracao` (slots `verify`/`producao`, limiares, proposta medida) e `config/continuo` (o agente grava a liberação, o mod grava o modo). Nunca `execucao/*`: para segurar ou liberar um conjunto, manda `HOLD` ou `LIBERA` à sessão do conjunto, que grava; `auditoria` (só acrescenta) |
| novarc-session-plan | cria os documentos que faltam; `revisando` e `removido` |
| Entrevista com o cliente (`entrevista-pendencias.md`) | `pendencias/{id}` e `notas` |

A posse de `specs/{id}` muda por fase e nunca é dividida: a sessão do conjunto grava a carga (`reserva`, `revisao`,
`iniciado`) e o fechamento (`pr-aberto`, `merge`); a sessão de spec grava a fase de build do seu READY até a sessão do
conjunto escrever `NOTE DONE-ACEITO <slug da spec> <headSha>` no `ledger.md` do conjunto, e de novo depois de um
`NOTE REABERTO <slug da spec> <motivo>`. O mod `novarc` segue a mesma regra: grava só na sessão dona; nas outras não
grava e encaminha a prova (`MARCO` do orquestrador para a sessão do conjunto, `NOTE MARCO` da sessão de spec depois do
DONE aceito) ou mostra um aviso.

**Criação.** Ao publicar, a session-plan lista `execucao` e `specs` e cria só os ids que ainda não existem, num
`ArtifactData batch` de `set` sem `if_version` (`execucao/{C}` = `{sessao: null, iniciadoEm: null, bloqueios: {}}`,
`specs/{id}` = `{etapa: null, bloqueios: {}}`). Documento existente nunca é reescrito por ela. Quem encontra um
documento faltando cria do mesmo jeito; o `set` sem `if_version` é recusado se o documento já existe, então o segundo
criador relê e segue com o `update` preso à versão.

**Reserva (exclusão mútua).** Os dois lados seguem o mesmo laço em cada documento de spec: lê; se a marca do outro
lado está lá (`revisando` para a sessão do conjunto; `reserva` ou etapa não nula para a session-plan), para; senão,
grava a própria marca com `update` preso à versão que acabou de ler; em conflito, relê e reavalia do começo. A sessão
do conjunto grava `{reserva, revisao}` antes de ler os arquivos do spec e depois confere que o hash bate com a
`revisao`. A session-plan que encontra o spec reservado ou iniciado não reescreve os arquivos: o escopo novo vira um
id novo.

O formato cliente é apresentação, não sigilo: `plano.json` e as coleções são legíveis por qualquer pessoa que abre o
artefato, e esconder prompts, branches e PRs nesse formato é só para clareza, então nada confidencial vai para
prompts ou coleções.

## Regras de produto (decididas pela NOVARC)

- Só o modo claro da identidade NOVARC (Sora, IBM Plex Mono, navy `#04122E`, signal `#0A6CFF`). Sem travessão,
  sem emoji, pt-BR, frases em caixa normal.
- Conceito visual: o plano como prancha técnica de engenharia. Título entre os colchetes do logo, seções numeradas
  (`01 /`), linhas finas no lugar de caixas, status como linha com marcos, rodapé como carimbo de prancha
  (cliente, projeto, código, revisão, responsável, aprovação, desenvolvimento, situação).
- Movimento: cada bloco se desenha uma vez ao entrar na tela (`html.anim` + `.in`), nunca em loop, e some por
  completo para quem pede menos movimento no sistema. A capa revela no carregamento, sem depender do observador de
  rolagem (ele não dispara em aba oculta).
- O cartão do simulador mostra o próprio simulador ao vivo, reduzido e em perspectiva. Por isso a seção de
  simuladores é montada uma vez e só as partes de dados são atualizadas: refazer a seção recarregaria a prévia.
- Dentro do simulador, "Ocultar painel" recolhe a lateral de planejamento; o menu do sistema simulado nunca é
  escondido.
- Mudanças, decisões, pendências e vídeos ficam só dentro do simulador; a página mostra o projeto.
- Vídeo é sempre ligado a um simulador (Loom, Drive, Fathom), cadastrado por link.
- Quem aprova e quem desenvolve são fixos no `plano.json`.
- Sem onboarding guiado em trilhas: foi feito e recusado.
- Simulador fiel à interface real, nunca um mock genérico.
- Prazo e horas são de sessões do Claude, não de pessoas: quem implementa é o Claude, conduzido por um operador que
  aprova o plano, revisa o PR e valida. `conjuntos[].estimativaHoras` é a soma, por spec, de 1,25 h fixas (contexto,
  plano, aprovação, verificação, PR) mais 0,2 h por tarefa estimada, arredondada para cima em meia hora;
  `fases[].horasPrevistas` é a soma dos conjuntos da fase. As datas saem de 6 h de sessão por dia útil, conjuntos em
  sequência (só `paraleloCom` sobrepõe), mais 1 dia útil de validação no fim de cada fase, e supõem que cada pendência
  é respondida antes de o conjunto dela começar. O cálculo está em `novarc-session-plan/scripts/medir-specs.js`
  (`--inicio AAAA-MM-DD` imprime as datas); a calibração é revista com as horas reais registradas na coleção `horas`.
- Duas horas, cada uma com o seu previsto. Horas de execução (`fases[].horasPrevistas`, soma de
  `conjuntos[].estimativaHoras`): o trabalho do Claude, regra acima. Horas ativas (`fases[].horasAtivasPrevistas`,
  opcional): a atenção de quem conduz. Regra aprovada pela NOVARC em 17/10/2026 como ponto de partida: 0,5 h por
  spec da fase (aprovar o plano, revisar o PR) mais 1 h por fase (validar no navegador, deploy), arredondado para cima
  em meia hora; `medir-specs.js` imprime `horasAtivasPrevistas` por fase e a regra é recalibrada com as horas reais
  da coleção `horas`. Com as ativas no plano (ou horas de execução registradas), a seção de horas mostra dois blocos
  lado a lado, previsto x real por fase, com total e desvio; a capa e o cartão da fase mostram o par previsto. Plano
  sem os campos novos segue com o bloco único de antes.
- Previsto em jogo: o total previsto e o desvio dos blocos contam só as fases com specs nos conjuntos ou com horas
  registradas; o previsto do plano inteiro aparece numa linha à parte, e uma fase sem specs ainda aparece esmaecida,
  sem barra. Horas sem fase (planejamento, orquestração) entram no real, mas ficam fora do desvio. Cada barra é o real
  dividido pelo previsto da PRÓPRIA fase (cheia = 100%); o que passa do previsto fica vermelho depois de uma marca no
  ponto do previsto, com o percentual ao lado.
- Mais de uma pessoa: o real aparece por pessoa dentro de cada bloco e de cada fase. O previsto por pessoa só existe
  quando o plano atribui `fases[].responsavel` (ativas) ou `conjuntos[].responsavel` (execução; sem ele vale o da
  fase); sem atribuição, o previsto fica só no total. Com uma pessoa só, a quebra não aparece.
- Fases por simulador (`exibicao.fasesPorSimulador: true`, opcional): cada simulador vira uma fase e as fases do plano
  viram slices dela, na ordem do plano (Fase 1 · Slice 2, curto F1.S2). Cada fase do plano precisa ter mudanças de um
  simulador só (o validador recusa a mistura); fase nova entra sozinha como o próximo slice do seu simulador.
- Horas para quem é de fora: a coleção `horas` é só de Editor. Em Configurações, um editor pode publicar um resumo
  (total e por fase) em `config/exibicao.horasResumo` com `horasPublicas: true`; colaboradores e leitores veem esse
  resumo, nunca o detalhe por sessão e pessoa. A visita de um editor mantém o resumo em dia.

## Verificação

Antes de publicar, nesta ordem:

1. `node ferramentas/validar-plano.js <pasta> [--db <snapshot>] [--repo <repositório do cliente>]`: ids,
   ligações nos dois sentidos, fases, telas, números de marcador, arquivos dos simuladores e, com specs, conjuntos,
   specs e espelho. `--db` lê um snapshot do banco (`ArtifactData` com `out_dir`, um arquivo por documento em
   `<colecao>/<id>.json`) para avisar spec destravado e acusar spec alterado depois do início; `--repo` compara a
   fonte no repositório com os hashes registrados. Erro bloqueia.
2. `node ferramentas/verificar-pagina.js <pasta>`: a página roda sem erro em quatro perfis e a área interna só
   aparece para dono e editor.
3. Sirva a pasta com `node ferramentas/servir.js <pasta>` (ele declara UTF-8; o `index.html` é um fragmento e, num
   servidor que não declara a codificação, os acentos da casca aparecem quebrados), abra `sims/<id>.html` e execute
   `ferramentas/checar-simulador.js` na página: contrato do simulador, mudanças sem `data-chg`, ids fora do plano,
   telas sem link e `chrome_faltando` (telas sem logo, menu ou ações do cabeçalho marcados); com superfícies,
   `state.telas` e a raiz de cada uma; com `hoje`, `versaoSimulador()`; com mensagens, a prévia de cada uma
   (`mensagens_sem_previa` vazio). `falhou: true` bloqueia. Mudanças que só aparecem em modal ou depois de uma ação:
   confira à mão. Depois compare cada tela com o inventário da tela real (`referencias/simulador-fiel.md`): diferença
   é bug. Para rodar pela ferramenta de JavaScript do navegador:
   `await (0, eval)(await (await fetch('../ferramentas/checar-simulador.js')).text())`.
4. Abra `index.html` pelo mesmo servidor (a página publicada não carrega no navegador do Claude, que pede login),
   abra a bancada e confira: lista da tela muda ao navegar, clique no marcador abre o detalhe, F1 esconde o futuro,
   sem faixa vazia à direita, lateral sem corte. Com `tickets[]`: escolha cada ticket e confira a aba Ticket, a tela
   para onde o simulador foi e que só as mudanças dele ficaram; "Todos os tickets" volta ao normal. Com superfícies:
   a aba Tela agrupa por superfície. Com `hoje`: a versão Hoje esconde o plano e o simulador desenha o antes. Com
   mensagens: a aba Mensagens abre cada prévia.
5. Com specs: abra `index.html` com a pasta de fixture de `verificar-pagina.js --fixture-specs` (um conjunto em cada
   status) e confira a faixa de conjuntos, um conjunto em cada status, o modal do spec com o espelho e o formato
   cliente sem prompts, branches e PRs.
