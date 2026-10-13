# novarc-dev

Skills de desenvolvimento da [NOVARC Sistemas](https://www.novarcsistemas.com) para Claude Code. Elas levam um
conjunto de specs, escrito pela NOVARC no planejamento do seu projeto, até o merge: construção com revisão de plano,
verificação, PR, merge e o estado final de volta no artefato de planejamento.

> Este repositório é gerado automaticamente a partir do repositório interno da NOVARC a cada atualização. Não abra
> pull request aqui: ele seria sobrescrito na próxima publicação. Sugestões e problemas vão para o seu contato na NOVARC.

## O que vem no plugin

| Skill | Quando usar | O que faz |
|---|---|---|
| `novarc-session-build` | `/novarc-session-build conjunto <link> C01` | Constrói um conjunto de specs: plano revisado, implementação, testes e a branch publicada, registrando cada marco no artefato de planejamento. |
| `novarc-session-end` | `/novarc-session-end` | Fecha a branch (PR, merge, limpeza) e devolve ao artefato o estado final de cada spec: merge, PR, desvios e pendências. |
| `novarc-codex-review` | Chamada pelo build em todo plano; `/novarc-codex-review` à mão | Revisão adversarial do plano com o Codex, em modo só leitura, até ele aprovar. |

**Mod Maestro:** uma faixa acima do prompt mostra o estado do seu conjunto (`C02 · implementando · 1/2 specs`), e
`/maestro` abre o painel com todos os conjuntos. Depois de um `git push` ou `gh pr create` bem-sucedido, o marco
correspondente vai para o artefato sozinho.

## Como funciona com a NOVARC

```mermaid
flowchart LR
    A["NOVARC<br/>planeja e escreve os specs"] --> B["Você recebe o prompt<br/>do conjunto"]
    B --> C["novarc-session-build<br/>constrói o conjunto"]
    C --> D["novarc-session-end<br/>PR, merge e estado final"]
    E(("Artefato de<br/>planejamento")) -.-> C
    E -.-> D
```

1. A NOVARC publica o planejamento como um artefato no claude.ai e escreve os specs no seu repositório, em
   `ai/specs/<codigo>/`.
2. Para cada conjunto você recebe um prompt pronto. Cole numa sessão nova do Claude Code aberta no repositório.
3. Ao terminar, rode `/novarc-session-end`. Se o prompt trouxer a linha `Fechamento:` e uma sessão orquestradora da
   NOVARC estiver coordenando, o fechamento começa sozinho quando ela liberar.

**Acesso ao artefato.** O build grava os marcos no banco do artefato de planejamento, então o artefato precisa estar
compartilhado com a sua conta do claude.ai com permissão de edição. Peça à NOVARC. As regras do `CLAUDE.md` do seu
repositório sempre valem acima das skills: se ele exigir autorização para push, PR ou merge, as skills pedem.

## Instalação

**Antes de começar:** Claude Code 2.1.293 ou mais novo. Para a revisão de plano, o
[Codex CLI](https://github.com/openai/codex) instalado e autenticado numa conta com acesso ao modelo `gpt-6-sol`,
que a `novarc-codex-review` fixa em toda rodada. Sem ele, a revisão para e avisa; fale com a NOVARC antes de começar
o primeiro conjunto.

No prompt do Claude Code:

1. Adicione o marketplace:

   ```
   /plugin marketplace add NovArc-Sistemas/novarc-dev
   ```

2. Instale o plugin no escopo de usuário:

   ```
   /plugin install novarc@novarc-dev
   ```

3. Ligue a atualização automática: `/plugin` → **Marketplaces** → **novarc-dev** → **Enable auto-update**. Para
   marketplaces que não são da Anthropic, ela vem desligada.

4. Abra uma sessão nova, ou rode `/reload-plugins`. As skills aparecem como `novarc:novarc-session-build` e
   assim por diante, e o comando `/maestro` passa a existir.

## Atualizações

Cada publicação da NOVARC é uma versão nova: o `plugin.json` não fixa número de versão, então o Claude Code usa o
commit como versão. Com a atualização automática ligada, a versão nova chega sozinha e vale na sessão seguinte. Para
atualizar na hora: `/plugin` → Marketplaces → novarc-dev → Update, e depois `/reload-plugins`.

## Licença

MIT. Veja [LICENSE](LICENSE).
