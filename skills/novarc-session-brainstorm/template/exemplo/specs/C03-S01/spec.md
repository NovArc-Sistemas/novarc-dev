# C03-S01 Sugestão de compra

| Campo | Valor |
|---|---|
| Conjunto | C03 (Sugestão e pedido) |
| Fase | f2 (Sugestão e pedido) |
| Domínio | compras |
| Telas | sugestao |

## Contexto

Com a cobertura e o lead time em mãos, o sistema sugere quanto comprar de cada SKU. O comprador revisa, ajusta com
um motivo e só então gera o pedido: nada é comprado sozinho.

## Requisitos

- R1. O sistema deve sugerir a quantidade de compra de cada SKU em risco para cobrir o lead time mais 30 dias de
  venda média.
- R2. Quando o comprador alterar a quantidade sugerida, o sistema deve exigir um motivo e guardar a sugestão
  original ao lado.

## Critérios de aceite

- A1 (prova R1). Dado o SKU EXM-0105 com venda média de 4 unidades por dia, 36 em estoque e lead time de 15 dias,
  quando a sugestão é calculada, então a quantidade sugerida é 144.
- A2 (prova R2). Dada a sugestão de 144 unidades, quando o comprador muda para 120 sem motivo, então o sistema não
  salva e pede o motivo.

## Mudanças cobertas

m-sug-tabela, m-sug-ajuste.
