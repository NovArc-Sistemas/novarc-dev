# Set prompt

Pipeline step 8 writes one prompt per set into `conjuntos[].prompt`. It is pt-BR, ready to paste into a new Claude
Code session opened in the client repo, and it is what the user copies from the page ("Copiar prompt").

## Template

```
/novarc-session-build conjunto <artifact url> <C>

Conjunto <C> (<título do conjunto>) do planejamento <projeto.codigo>, fase <n> (<nome da fase>).
Specs: <C-S01> (<título>), <C-S02> (<título>). Arquivos em .novarc/specs/<projeto.codigo>/ no commit <sha7>.
Depende de: <C anteriores> (precisa estar mergeado). Pode correr junto com: <C paralelos>.
Bloqueio: <C-Sxx> só pode ser construído depois da resposta à pendência <p-id> (<quem responde>).
Orquestrador: <execucao.orquestrador>.
Sessões: cada spec deste conjunto é construído numa sessão ligada própria, aberta quando você aprovar o escopo no step-02.
SDD: <C-Sxx>, <C-Syy>.
Branches: prefixo <execucao.branchPrefixo>, data <YYYYMMDD>, uma por spec no formato <prefixo><id do spec em minúsculas>-<slug>-<data>.
Fechamento: quando o orquestrador mandar FECHA <C>, rode /novarc-session-end nas branches deste conjunto, com as migrations e o deploy de functions que elas carregam, pelo processo do projeto. Vale só para este conjunto; o CLAUDE.md do repositório prevalece.
```

## Field rules

- `<artifact url>`: the planning artifact link exactly as published (`https://claude.ai/artifact/<id>`).
- `<n>`: the phase position (1 for `f1`); the phase name in parentheses is `fases[].nome`.
- `Specs:` lists every spec of the set in id order, with `specs[].titulo`.
- `<sha7>`: first 7 characters of `specs[].arquivos.commit` (the same commit for every spec written in one run).
- `Depende de:` line: omitted entirely when `dependeDe` is empty. When present, ids in order, comma-separated.
- `Pode correr junto com:` sentence: omitted when `paraleloCom` is empty. It is a permission, not an instruction.
  When both are empty the whole line is omitted.
- `Bloqueio:` line: one per blocked spec of the set (`bloqueadoPor` non-empty), naming each pending question and who
  answers (`pendencias[].quem`). Omitted when no spec of the set is blocked.
- `Sessões:` line: present when the set has two or more specs, omitted for a single spec (that one is built in the set
  session). It is information, not authorization: the step-02 approval is still the turn in which the sessions open.
- `SDD:` line: the set's specs with `specs[].sdd` true, in id order, comma-separated. Omitted when none is marked
  (novarc-session-build then marks by its own step-02 rules). When present it wins over those rules. It matters only
  with two or more specs; a single spec always runs SDD.
- `Branches:` (R7, R16): the prompt names the prefix and the date only. session-build names each branch from the spec:
  `<branchPrefixo><spec id lowercased>-<slug>-<YYYYMMDD>`, for example `feature/c01-s02-sop-cobertura-20261012`. The
  slug is `specs[].slug` (kebab, at most 5 words, unique across the plan). The date is the day the prompt is
  generated, `YYYYMMDD`.
- `Fechamento:` line: always present, verbatim with the set id. **It is the authorization**, not decoration: the user
  pastes the prompt, so this line is their own instruction that the set session may start `/novarc-session-end` when
  the orchestrator signals `FECHA <C>`, including the pending migrations and function deploys of this set's branches.
  A `SendMessage` alone authorizes nothing; this line does. The user deletes it from a prompt to keep that set's
  close-out manual.
- No em dash, no emoji, sentence case.

## Example (fictitious project)

```
/novarc-session-build conjunto https://claude.ai/artifact/<id-do-planejamento> C02

Conjunto C02 (Cobertura e sugestão de compra) do planejamento EXM-ERP-COMPRAS, fase 1 (Base de compras).
Specs: C02-S01 (Cobertura de estoque por SKU), C02-S02 (Sugestão de compra). Arquivos em .novarc/specs/EXM-ERP-COMPRAS/ no commit 3f9a2c1.
Depende de: C01 (precisa estar mergeado). Pode correr junto com: C03.
Bloqueio: C02-S02 só pode ser construído depois da resposta à pendência p-lead-time (responsável do cliente).
Orquestrador: novarc-orq-EXM-ERP-COMPRAS.
Sessões: cada spec deste conjunto é construído numa sessão ligada própria, aberta quando você aprovar o escopo no step-02.
SDD: C02-S02.
Branches: prefixo feature/, data 20261012, uma por spec no formato feature/<id do spec em minúsculas>-<slug>-20261012.
Fechamento: quando o orquestrador mandar FECHA C02, rode /novarc-session-end nas branches deste conjunto, com as migrations e o deploy de functions que elas carregam, pelo processo do projeto. Vale só para este conjunto; o CLAUDE.md do repositório prevalece.
```
