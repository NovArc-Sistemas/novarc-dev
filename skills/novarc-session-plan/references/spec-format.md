# Spec format

Every spec lives in the client repo at `.novarc/specs/<codigo>/<id>-<slug>/` (for example
`.novarc/specs/EXM-ERP-COMPRAS/C01-S02-sop-cobertura/`). The files are written in the client project's documented
language (for example pt-BR). Headings keep the structure below in any language; the pt-BR headings shown here are the ones
to use for a pt-BR project.

All files: UTF-8 without BOM, LF line endings, file names matching `^[a-z0-9-]+\.md$`. Write them with the Write tool
or with Node, never with PowerShell redirection (it adds a BOM and CRLF, and the mirror hash then breaks).

## The nine files

| File | Required | Content |
|---|---|---|
| `spec.md` | always | header, ficha, context, scope, EARS requirements, G/W/T criteria, changes covered, dependencies, risks, done, test summary |
| `dados.md` | when the spec touches the data model | Prisma models, fields, indexes, constraints, migration shape, Data Lake impact |
| `contratos.md` | when the spec adds or changes routes or services | REST routes, Zod in/out, RBAC, services and use-cases, database functions |
| `jobs.md` | when the spec adds or changes crons or triggers | crons, scheduler registration, API vs worker, retries, idempotency |
| `interface.md` | when the spec touches a screen | screens, components to reuse, states, locator per change |
| `reaproveitamento.md` | when existing code is extended | code to reuse with `arquivo:linha` |
| `testes.md` | always when any other layer file exists | test cases by type, per the project's testing principles |
| `desempenho.md` | when the spec adds a query, a list, an aggregation or a job | measured volume, queries and indexes, pagination, cache and precomputation, numeric targets |
| `acesso.md` | when the spec adds a route, a screen or stored data | roles per route, sensitive fields cut in the back end, audit per write action, personal data and secrets |

A file with nothing to say is not created. `spec.md` must be enough on its own to seed `superpowers:writing-plans`;
the other files are its references.

## The ficha block

`spec.md` begins with this fenced block, first thing in the file, fence line exactly ```` ```json ficha ````
(nothing else on that line). `scripts/medir-specs.js` reads it with a regex; anything else on the fence line and the
spec fails as "sem bloco ficha".

| Field | Type | Meaning |
|---|---|---|
| `id` | string `C\d{2}-S\d{2}` | spec id |
| `conjunto` | string `C\d{2}` | set id |
| `dominio` | string | the one backend domain that owns the spec (`compras`, `inventory`, ...) |
| `telas` | string[] | primary screen ids (simulator `telaId`), at most 2 |
| `mudancas` | string[] | change ids covered, every one exactly once across all specs |
| `modelosNovos` | string[] | new Prisma models (one row each in `dados.md`) |
| `rotas` | string[] | `"<METHOD> <path>"`, one row each in `contratos.md` |
| `jobs` | string[] | cron or trigger names, one row each in `jobs.md` |
| `excecao` | string | written reason why the spec is allowed to fail the size check, or empty |

Example:

````md
```json ficha
{
  "id": "C01-S02",
  "conjunto": "C01",
  "dominio": "compras",
  "telas": ["sop-cobertura"],
  "mudancas": ["m-sop-01", "m-sop-02", "m-sop-03", "m-sop-04", "m-sop-05", "m-sop-06"],
  "modelosNovos": ["CoberturaSku"],
  "rotas": ["GET /api/compras/cobertura", "POST /api/compras/cobertura/recalcular"],
  "jobs": ["recalcularCoberturaDiaria"],
  "excecao": ""
}
```
````

## spec.md skeleton (pt-BR headings)

````md
```json ficha
{ ... }
```

# C01-S02 Cobertura de estoque por SKU

| Campo | Valor |
|---|---|
| Artefato | https://claude.ai/artifact/<id> |
| Versão do plano | v0.4 |
| Spec | C01-S02 |
| Conjunto | C01 (Base de compras) |
| Status | pronto para construir / bloqueado por p-xx |

## Contexto e objetivo
## Escopo
## Fora do escopo
## Requisitos (EARS)
R1. ...
## Critérios de aceite (dado / quando / então)
A1 (prova R1, R3). Dado ... quando ... então ...
## Mudanças cobertas
| Mudança | Marcador | Tela | Bancada |
|---|---|---|---|
| m-sop-01 | 1 | sop-cobertura | <link do artefato>#m-m-sop-01 |
## Dependências
## Riscos
## Definição de pronto
## Plano de testes (resumo)
## Exceção de tamanho
(only when `excecao` is non-empty: the same reason, expanded)
````

## EARS requirements

One requirement per line, numbered R1..Rn, each testable on its own. Requirements cover access and performance, not
only behavior: every row of `acesso.md` and every target of `desempenho.md` becomes a requirement with a criterion
(the role without permission gets 403 or the field is absent from the response; the write records the expected
audit row; the route answers within the target at the measured volume). The five patterns, with examples from a fictitious project:

| Pattern | Shape | Example (pt-BR) |
|---|---|---|
| Ubiquitous | O sistema deve ... | R1. O sistema deve calcular a cobertura em dias de cada SKU a partir da venda média dos últimos 30 dias. |
| Event | Quando <gatilho>, o sistema deve ... | R2. Quando o operador clicar em "Recalcular", o sistema deve recalcular a cobertura de todos os SKUs ativos e mostrar a data do cálculo. |
| State | Enquanto <estado>, o sistema deve ... | R3. Enquanto um pedido de compra estiver em aberto para o SKU, o sistema deve somar a quantidade pedida ao estoque projetado. |
| Unwanted | Se <condição indesejada>, então o sistema deve ... | R4. Se o SKU não tiver venda nos últimos 30 dias, então o sistema deve mostrar "sem giro" em vez de uma cobertura infinita. |
| Optional | Onde <recurso presente>, o sistema deve ... | R5. Onde o SKU tiver estoque no armazém do Mercado Livre Full, o sistema deve mostrar esse estoque separado do estoque próprio. |

## Given/When/Then acceptance criteria

- Each criterion names the requirements it proves: `A2 (prova R2)`. Every requirement is proved by at least one
  criterion.
- One behavior per criterion. Two "então" about different behaviors means two criteria.
- Data is concrete: SKU codes, quantities, dates, roles. "Dado um SKU qualquer" is not a criterion.

Example: `A1 (prova R1, R4). Dado o SKU EXM-0042 com 300 unidades em estoque e 90 vendidas nos últimos 30 dias, quando
a tela de cobertura abre, então a linha de EXM-0042 mostra "100 dias". Dado o SKU EXM-0077 sem venda em 30 dias,
então a linha mostra "sem giro".`

The bench link is the artifact url plus `#m-<change id>` (the page opens the bench on that change).

## Layer file skeletons (pt-BR headings)

Every row that counts toward the ficha has its own table row, so synthesis can count it.

`dados.md`:
```md
# Dados: C01-S02
## Modelos novos
| Modelo | Campos (nome: tipo) | Índices e constraints | Motivo |
## Modelos alterados
| Modelo | Campo | Mudança | Evidência (arquivo:linha) |
## Forma da migration
## Impacto no Data Lake
```

`contratos.md`:
```md
# Contratos: C01-S02
## Rotas
| Método | Caminho | Entrada (Zod) | Saída | Papel (RBAC) | Use-case |
## Use-cases e services
## Funções no banco
```

`jobs.md`:
```md
# Jobs: C01-S02
## Crons
| Nome | Agenda | Onde roda (API ou worker) | Handler | Idempotência | Retentativa |
## Registro no scheduler
## Gatilhos
```

`interface.md`:
```md
# Interface: C01-S02
## Telas
### <tela> (telaId)
Componentes reaproveitados, estados (vazio, carregando, erro), comportamento por mudança.
## Localizadores
| mudança | marcador | rota | perfil | passos | seletor ou texto |
```

`reaproveitamento.md`:
```md
# Reaproveitamento: C01-S02
| O que | Onde (arquivo:linha) | Como estender |
```

`testes.md`:
```md
# Testes: C01-S02
## Unidade
## Integração
## Interface
| Caso | Tipo | Critério que prova | Onde fica o arquivo |
```

`desempenho.md`:
```md
# Desempenho: C01-S02
## Volume
| Tabela ou fonte | Linhas hoje | Crescimento | Linhas lidas por chamada |
## Consultas e índices
| Rota, job ou tela | Consulta (o que filtra e agrega) | Índice usado ou novo | Risco |
## Paginação, cache e pré-cálculo
## Metas
| O quê | Meta | Como medir |
```

`acesso.md`:
```md
# Acesso: C01-S02
## Rotas
| Método | Caminho | Papéis que podem | Checagem extra (dono do dado, capability) | Resposta sem permissão |
## Campos e telas sensíveis
| Tela ou rota | Campo | Quem vê | Como esconde (back-end corta o campo; nunca só a tela) |
## Auditoria
| Ação | O que registra (quem, quando, antes e depois) | Onde (logger ou tabela, arquivo:linha) |
## Dados pessoais e segredos
```

## Locator format (`interface.md`)

One row per change of the spec, used by the orchestrator to find the change in the real app during visual validation:

`| mudança | marcador | rota | perfil | passos | seletor ou texto |`

- `rota`: the app route to open (`/compras/cobertura`).
- `perfil`: the role to log in as (`owner`, `admin`, `standard`).
- `passos`: the clicks to reach the state, separated by `>` (`aba "Cobertura" > filtro "Ativos"`).
- `seletor ou texto`: a stable selector or the exact visible text that proves the change is there. Never a
  `data-chg` attribute: production code does not carry simulator markers.

Example: `| m-sop-03 | 3 | /compras/cobertura | admin | aba "Cobertura" > ordenar por "Dias" | coluna com o título "Cobertura (dias)" |`

## Blocked specs

- A change held by an open pending question, or marked `EM DISCUSSÃO`, still gets a spec. Its plano.json entry has
  `bloqueadoPor: ["p-..."]` and the header status reads "bloqueado por p-xx".
- `spec.md` adds a section `## Bloqueio` naming each pending question, what is already known, what the answer changes in
  the spec, and who answers.
- The set ordering respects the block (a blocked spec does not sit in a set that others depend on unless that is
  unavoidable, and then the report says so), and the set prompt says the spec cannot be built until the answer exists.
- A pending question answered with `situacao: "parcial"` does not unlock (R1).
