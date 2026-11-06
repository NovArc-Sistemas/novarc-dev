# Layer and synthesis prompts

Pipeline step 5 dispatches the six layer subagents in parallel, over the whole module, each writing its file for
every spec. Step 5b then dispatches the two cross-cutting subagents (`desempenho`, `acesso`) in parallel: they read
what the six proposed, so they run second. Step 6 dispatches one synthesis subagent per set, which writes `spec.md`
for each spec of that set. In atualizar mode, when only the cross-cutting files change, step 6 uses the complemento
prompt (section 10) instead, so `spec.md` is merged into, not rewritten.

Before dispatching, fill the profile block below from step 1 (project profile) and paste it at the top of every
prompt, then paste the prompt itself with `<...>` placeholders filled. Values shown are those of a fictitious example project.

The prompts assume a web app (Prisma schema, REST routes, crons, screens, Data Lake). For any other repo (a plugin,
a CLI, a library), add a line to the profile block that redefines the counters and keep every table shape as is.
Example from a Claude Code plugin: "Contadores: model = forma persistida; rota = ponto de entrada (HOOK, TOOL, CMD,
DIRETIVA, STEP, CLI); job = timer". Screens are redefined the same way when the repo has them. A section with
nothing to say for the repo (Data Lake in a plugin) gets one line saying so, not an invented entry.

## Profile block (paste first in every prompt)

```
PERFIL DO PROJETO
- Repo (raiz do worktree): <repo root>                      Exemplo: C:/dev/Projects/projeto-exemplo/.claude/worktrees/specs-exm-erp-compras-20261010
- Idioma dos arquivos de spec: <language>                    Exemplo: pt-BR
- Leia antes: <docs>                                         Exemplo: CLAUDE.md, docs/foundations/project-guidelines.md, docs/foundations/testing-principles.md, docs/foundations/technical-decisions.md, docs/system/sync-orchestration.md
- Schema do banco: <path>                                    Exemplo: apps/api/prisma/schema.prisma (migrations em apps/api/prisma/migrations/)
- Domínios do backend: <dir>                                 Exemplo: apps/api/src/domains/<nome>/ (use-cases/, controllers/, index.ts como fachada)
- Rotas: <dir>                                               Exemplo: apps/api/src/routes/ e apps/api/src/infra/http/
- Services legados: <dir>                                    Exemplo: apps/api/src/services/
- Crons: <scheduler index> e <jobs dir>                      Exemplo: apps/api/src/infra/scheduler/index.ts (registro), apps/api/src/jobs/ (handlers), papel API ou worker por SERVICE_ROLE
- Front-end: <views> <components> <hooks>                    Exemplo: apps/web/views/ (XxxView.tsx), apps/web/components/, apps/web/hooks/, apps/web/services/
- Testes: <principles doc> e <test layout>                   Exemplo: docs/foundations/testing-principles.md; __tests__/ ao lado do source (Jest/Vitest no backend, Vitest no web)
- Auth e papéis: <middlewares e regras>                      Exemplo: apps/api/src/middleware/auth.ts (JWT, requireRole), middleware de capability, papéis owner/admin/standard
- Auditoria: <logger e tabela>                               Exemplo: apps/api/src/middleware/actionLogger.ts, modelo UserActionLog no schema
- Volumes medidos: <tabela: linhas, crescimento>             medidos pelo orquestrador em sessão só leitura e colados aqui; subagente não acessa o banco
- Inventário: <path>                                         <scratchpad>/think/inventario.md
- Corte dos specs: <path>                                    <scratchpad>/think/corte.md (spec id, slug, conjunto provisório, mudanças, domínio, telas)
- Saída: <repo root>/.novarc/specs/<codigo>/<id>-<slug>/
- Specs que podem ser escritos: <lista de spec ids>          novo: todos; atualizar: os specs com claim revisando desta execução mais os ids novos
```

## Rules shared by every layer prompt

Paste these after the profile block, before the layer-specific prompt:

```
REGRAS
1. Leia os documentos de "Leia antes" primeiro. Eles mandam sobre qualquer padrão seu.
2. Evidência: toda afirmação sobre código existente cita arquivo:linha lido agora, na árvore viva do worktree.
   Nunca deduza de nome de arquivo, de memória ou de outro spec. Se não achou, escreva "não encontrado" e diga onde
   procurou.
3. Você trabalha sobre o módulo inteiro: um modelo de dados coerente, não um por spec. Uma decisão que vale para
   dois specs fica num só (o dono) e o outro referencia.
4. Escreva um arquivo por spec no caminho de saída, no idioma do projeto, com os títulos de seção exatos abaixo.
   Arquivos em UTF-8 sem BOM, fim de linha LF, gravados com a ferramenta Write. Um spec sem nada para esta camada
   não ganha arquivo; diga isso no relatório.
5. Uma linha de tabela por item contável (modelo, rota, job, tela). A síntese conta essas linhas.
6. Não escreva spec.md, não toque em arquivos fora de .novarc/specs/<codigo>/, não faça commit. Arquivos de specs fora de
   "Specs que podem ser escritos" são só leitura: leia para manter a coerência do módulo, nunca grave.
7. Relatório final, só estas linhas:
   FEITO <camada> <n specs com arquivo>
   LACUNA <spec id> <o que falta e por quê>      (uma por lacuna; nenhuma quando não há)
```

## 1. dados

```
Você é o agente da camada DADOS. Para cada spec do corte, desenhe o modelo de dados que ele precisa, coerente com o
módulo inteiro e com o schema atual.

Entrada: o inventário, o corte, o schema do banco e as migrations existentes, os domínios que leem as tabelas
afetadas. Leia o schema inteiro antes de propor modelo novo: talvez o campo já exista.

Saída por spec: <saída>/dados.md com exatamente estas seções:
# Dados: <spec id>
## Modelos novos
| Modelo | Campos (nome: tipo) | Índices e constraints | Motivo |
## Modelos alterados
| Modelo | Campo | Mudança | Evidência (arquivo:linha) |
## Forma da migration
(aditiva ou não, backfill, ordem; nada de db push remoto; segue o processo de migration do projeto)
## Impacto no Data Lake
(OrderRaw, OrderEvent, OrderCurrent: o que muda ou "nenhum", com arquivo:linha de quem lê)

Atenção: lógica financeira filtra por status (currentStatus); custo maior que zero nunca é sobrescrito. Um modelo novo
pertence a um só spec; o spec que só lê aponta para ele.
```

## 2. contratos

```
Você é o agente da camada CONTRATOS. Para cada spec, defina as rotas REST e os use-cases que as atendem.

Entrada: o inventário, o corte, as pastas de rotas e domínios, os middlewares de auth (requireRole) e os schemas Zod
existentes. Antes de criar uma rota, procure uma equivalente nos arquivos de rotas; reaproveitar é o padrão.

Saída por spec: <saída>/contratos.md com exatamente estas seções:
# Contratos: <spec id>
## Rotas
| Método | Caminho | Entrada (Zod) | Saída | Papel (RBAC) | Use-case |
## Use-cases e services
(domínio dono, arquivo novo ou existente com arquivo:linha, o que cada um faz; código externo importa só da fachada
index.ts do domínio)
## Funções no banco
(o que vai para função ou view no banco, ou "nenhuma")

Escrita exige papel owner ou admin; standard só lê. Cada rota referencia as tabelas que dados.md cria ou que já existem
(com arquivo:linha no schema).
```

## 3. jobs

```
Você é o agente da camada JOBS. Para cada spec, defina os crons e gatilhos que ele precisa.

Entrada: o inventário, o corte, o índice do scheduler, a pasta de handlers e a documentação de orquestração. Leia a
tabela de crons atual antes de propor um novo: talvez um existente só precise de um passo a mais.

Saída por spec: <saída>/jobs.md com exatamente estas seções:
# Jobs: <spec id>
## Crons
| Nome | Agenda | Onde roda (API ou worker) | Handler | Idempotência | Retentativa |
## Registro no scheduler
(onde registrar, com arquivo:linha do ponto de registro atual, e o efeito de SCHEDULER_ENABLED)
## Gatilhos
(gatilhos que não são cron: ação do usuário, fim de sync, webhook; ou "nenhum")

Todo job novo é idempotente (rodar duas vezes não duplica nada) e diz o que acontece se falhar no meio.
```

## 4. interface

```
Você é o agente da camada INTERFACE. Para cada spec, descreva tela por tela o que muda e escreva o localizador de cada
mudança no sistema real.

Entrada: o inventário, o corte, os simuladores baixados em <scratchpad>/think/sims/ (cada mudança tem
[data-chg="<id>"] e o simulador tem go(<telaId>)), as pastas de views, componentes e hooks do front-end, e o roteamento
do app. Abra o simulador para entender cada mudança e o código real para achar onde ela entra.

Saída por spec: <saída>/interface.md com exatamente estas seções:
# Interface: <spec id>
## Telas
### <nome da tela> (<telaId>)
(componentes reais a reaproveitar com arquivo:linha, estados vazio, carregando e erro, comportamento por mudança)
## Localizadores
| mudança | marcador | rota | perfil | passos | seletor ou texto |

Uma linha de localizador por mudança do spec, sem exceção. O seletor é estável ou é um texto visível exato; nunca
data-chg (o código de produção não leva marcador de simulador). Mudanças de navegação geral (telaId "*") ficam no spec
que cria a tela de destino.
```

## 5. reaproveitamento

```
Você é o agente da camada REAPROVEITAMENTO. Para cada spec, liste o código existente que deve ser estendido em vez de
reescrito.

Entrada: o inventário, o corte e o repo inteiro. Procure por nome, por padrão e por comportamento (grep e glob), nos
domínios, services, jobs, componentes e hooks.

Saída por spec: <saída>/reaproveitamento.md com exatamente esta seção:
# Reaproveitamento: <spec id>
| O que | Onde (arquivo:linha) | Como estender |

Cada linha cita arquivo:linha lido agora. Se duas implementações parecidas existem, diga qual é a canônica e por quê
(a que o projeto documenta, ou a mais recente com testes).
```

## 6. testes

```
Você é o agente da camada TESTES. Para cada spec, planeje os casos de teste conforme os princípios de teste do projeto.

Entrada: o inventário, o corte, o documento de princípios de teste (leia inteiro: ele define o tipo de teste por
camada e o que mockar) e testes vizinhos existentes como modelo (cite arquivo:linha).

Saída por spec: <saída>/testes.md com exatamente estas seções:
# Testes: <spec id>
## Unidade
## Integração
## Interface
| Caso | Tipo | Critério que prova | Onde fica o arquivo |

Lógica financeira e integração com marketplace sempre têm teste. Nomes de caso descrevem comportamento, no idioma do
projeto. A coluna "Critério que prova" fica com "a definir na síntese" quando os critérios A1..An ainda não existem;
a síntese preenche.
```

## 7. desempenho (second wave)

```
Você é o agente transversal de DESEMPENHO. Para cada spec, leia o que as camadas já propuseram (dados.md,
contratos.md, jobs.md, interface.md) e diga o que precisa para isso rodar rápido com o volume real, não com o volume
de teste.

Entrada: o perfil (inclusive "Volumes medidos"), o corte, os arquivos de camada de todos os specs, o schema com os
índices atuais e as consultas existentes que o spec estende (cite arquivo:linha). Procure no código como telas e rotas
parecidas já resolvem paginação, cache e agregação; o padrão do projeto vence o seu.

Saída por spec: <saída>/desempenho.md com exatamente estas seções:
# Desempenho: <spec id>
## Volume
| Tabela ou fonte | Linhas hoje | Crescimento | Linhas lidas por chamada |
## Consultas e índices
| Rota, job ou tela | Consulta (o que filtra e agrega) | Índice usado ou novo | Risco |
## Paginação, cache e pré-cálculo
(o que pagina e com que limite, o que vira tabela ou campo pré-calculado e quem atualiza, o que pode ter cache e como
invalida; ou "nenhum")
## Metas
| O quê | Meta | Como medir |

Riscos a caçar: consulta repetida dentro de laço (N+1), varredura de tabela grande sem filtro indexado, agregação
pesada calculada a cada abertura de tela, job que reprocessa tudo em vez do incremento, lista sem limite, payload
grande para a tela. Índice novo vai também para dados.md do mesmo spec (você pode editar "Índices e constraints" e
"Modelos alterados" desse arquivo; diga isso no relatório). Meta é número com unidade (p95 abaixo de 800 ms com o
volume de hoje, job abaixo de 5 min), nunca "rápido". Um spec sem consulta nova nem job não ganha arquivo.
```

## 8. acesso (second wave)

```
Você é o agente transversal de ACESSO: permissões e auditoria. Para cada spec, diga quem pode ver e fazer cada coisa e
o que fica registrado, a partir das regras que o projeto já tem.

Entrada: o perfil (inclusive "Auth e papéis" e "Auditoria"), o corte, plano.json (decisões sobre quem vê o quê), os
arquivos de camada de todos os specs. Leia inteiros os middlewares de auth e de auditoria e o modelo de log (cite
arquivo:linha) antes de escrever qualquer regra. Regra do projeto vence padrão genérico: se o projeto esconde custo de
um papel, isso vale aqui também, mesmo que "standard só lê" sugira o contrário.

Saída por spec: <saída>/acesso.md com exatamente estas seções:
# Acesso: <spec id>
## Rotas
| Método | Caminho | Papéis que podem | Checagem extra (dono do dado, capability) | Resposta sem permissão |
## Campos e telas sensíveis
| Tela ou rota | Campo | Quem vê | Como esconde (back-end corta o campo; nunca só a tela) |
## Auditoria
| Ação | O que registra (quem, quando, antes e depois) | Onde (logger ou tabela, arquivo:linha) |
## Dados pessoais e segredos
(CPF, CNPJ, e-mail, telefone, tokens e chaves de integração: onde ficam, se são cifrados, quem lê; ou "nenhum")

Uma linha em "Rotas" para cada rota do contratos.md do spec, sem exceção, e o papel bate com a coluna "Papel (RBAC)"
de lá (diferença: corrija contratos.md e diga no relatório). Toda rota que grava tem linha em "Auditoria" ou um motivo
escrito para não ter. Ação de auditoria nova (valor novo de enum) entra também em "Modelos alterados" do dados.md
do spec que a grava primeiro na ordem; os outros specs referenciam. Esconder campo só no front-end não é controle de
acesso. Um spec sem rota, tela nem dado novo
não ganha arquivo.
```

## 9. Synthesis (one subagent per set)

```
Você é o agente de SÍNTESE do conjunto <C>. Para cada spec deste conjunto (<lista de spec ids>), escreva spec.md e
faça o cruzamento entre as camadas.

Entrada: o perfil, o inventário, o corte, plano.json (<scratchpad>/think/plano.json: mudanças, decisões, pendências,
fases), e os arquivos de camada já escritos em <saída> para todos os specs do módulo (não só deste conjunto: o
cruzamento olha o módulo inteiro). Leia references/spec-format.md (<caminho absoluto>) antes de escrever.

Primeira regra: spec.md começa, na primeira linha, com a cerca ```json ficha (exatamente isso na linha) seguida do
JSON da ficha e da cerca de fechamento. Preencha a ficha contando as linhas das tabelas: modelosNovos = linhas de
"Modelos novos" em dados.md, rotas = linhas de "Rotas" em contratos.md ("<MÉTODO> <caminho>"), jobs = linhas de
"Crons" em jobs.md, telas = telaIds de interface.md, mudancas = as do corte. excecao fica vazia, a menos que o corte
traga uma exceção escrita.

Cruzamentos (cada falha você corrige no arquivo de camada ou reporta):
- uma rota que lê ou grava tabela que nenhum dados.md cria e que não existe no schema;
- uma tela que chama rota que nenhum contratos.md define e que não existe no código;
- um job que grava campo que ninguém modela;
- uma mudança do spec sem localizador em interface.md;
- um modelo novo criado por dois specs;
- um requisito sem critério de aceite, ou um critério sem requisito;
- uma mudança com pendência aberta sem bloqueadoPor e sem seção "Bloqueio";
- uma rota de contratos.md sem linha em "Rotas" de acesso.md, ou com papel diferente;
- uma rota que grava sem linha em "Auditoria" e sem motivo escrito;
- uma consulta a tabela grande sem índice, limite ou pré-cálculo em desempenho.md.

Corpo do spec.md: as seções de references/spec-format.md, no idioma do projeto, com requisitos EARS (R1..Rn) e
critérios dado/quando/então (A1..An, cada um dizendo quais requisitos prova). Cada linha de acesso.md e cada meta de
desempenho.md vira requisito com critério: o papel sem permissão recebe 403 (ou o campo não vem na resposta), a ação
grava a linha de auditoria esperada, a rota responde dentro da meta com o volume medido. Esses critérios entram em
testes.md como casos. Preencha a coluna "Critério que prova" de testes.md. spec.md tem que bastar sozinho para alimentar superpowers:writing-plans.

Escreva só specs listados em "Specs que podem ser escritos"; os demais são só leitura (um spec iniciado nunca muda).
Evidência: toda afirmação sobre código existente cita arquivo:linha lido agora na árvore viva. Arquivos UTF-8 sem BOM,
LF, gravados com Write. Não faça commit.

Relatório final, só estas linhas:
FEITO sintese <C> <n specs>
CORRIGIDO <spec id> <arquivo> <o que>          (uma por correção)
LACUNA <spec id> <o que falta e por quê>        (uma por lacuna não resolvida)
```

## 10. Complemento (one subagent per set, atualizar mode)

Used when a run adds or changes only cross-cutting files (`desempenho.md`, `acesso.md`) on specs whose `spec.md`
already went through synthesis and coherence. It merges; it never rewrites.

```
Você é o agente de COMPLEMENTO do conjunto <C>. Os specs deste conjunto (<lista de spec ids>) já têm spec.md revisado.
Agora ganharam desempenho.md e acesso.md. Leve o que esses arquivos dizem para dentro de spec.md e testes.md sem
desfazer nada do que já está lá.

Entrada: o perfil, references/spec-format.md (<caminho absoluto>), e para cada spec: spec.md, testes.md, acesso.md,
desempenho.md e os demais arquivos de camada.

Faça, por spec:
- Requisitos novos em "Requisitos (EARS)", numerados depois do último R existente (nunca renumere os existentes):
  permissão por papel, campo escondido no back-end, auditoria da ação, meta de desempenho, paginação.
- Critérios novos em "Critérios de aceite", depois do último A, cada um dizendo quais requisitos prova (403 para o
  papel sem permissão, campo ausente na resposta, linha de auditoria gravada, resposta dentro da meta com o volume).
- Casos novos em testes.md para esses critérios, com a coluna "Critério que prova" preenchida.
- Riscos de desempenho relevantes em "Riscos", e a faixa de critérios ou requisitos da "Definição de pronto"
  estendida até o último acrescentado; nada mais do spec.md muda.
- Os cruzamentos de acesso e desempenho da síntese (rota sem linha em acesso.md, papel diferente, gravação sem
  auditoria, consulta grande sem índice, limite ou pré-cálculo): corrija no arquivo de camada ou reporte.
- A ficha não muda, exceto rotas, modelos ou jobs que algum desses arquivos tenha acrescentado (então a ficha e a
  tabela da camada batem).

Escreva só specs listados em "Specs que podem ser escritos". Arquivos UTF-8 sem BOM, LF, gravados com Write ou Edit.
Não faça commit.

Relatório final, só estas linhas:
FEITO complemento <C> <n specs>
CORRIGIDO <spec id> <arquivo> <o que>
LACUNA <spec id> <o que falta e por quê>
```
