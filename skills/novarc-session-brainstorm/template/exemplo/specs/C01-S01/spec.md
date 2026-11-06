# C01-S01 Cobertura de estoque por SKU

| Campo | Valor |
|---|---|
| Conjunto | C01 (Base de cobertura) |
| Fase | f1 (Base de cobertura) |
| Domínio | compras |
| Telas | painel |

## Contexto

O comprador decide o que repor olhando estoque e vendas em telas separadas. Este spec traz para o painel de compras
quantos dias o estoque de cada SKU ainda cobre, com a data do último cálculo e um filtro para o que está em risco.

## Requisitos

- R1. O sistema deve calcular a cobertura em dias de cada SKU a partir da venda média dos últimos 30 dias.
- R2. Quando o comprador clicar em "Recalcular", o sistema deve recalcular a cobertura de todos os SKUs ativos e
  mostrar a data do cálculo.
- R3. Se o SKU não tiver venda nos últimos 30 dias, então o sistema deve mostrar "sem giro" em vez de uma cobertura
  infinita.
- R4. Quando o filtro "Em risco" estiver ligado, o sistema deve listar só os SKUs com cobertura menor que o lead time
  do fornecedor.

## Critérios de aceite

- A1 (prova R1, R3). Dado o SKU EXM-0042 com 300 unidades em estoque e 90 vendidas nos últimos 30 dias, quando o
  painel abre, então a linha de EXM-0042 mostra "100 dias". Dado o SKU EXM-0077 sem venda em 30 dias, então a linha
  mostra "sem giro".
- A2 (prova R2). Dado o cálculo de ontem, quando o comprador clica em "Recalcular", então a data do cálculo passa a
  ser a de hoje.
- A3 (prova R4). Dado o SKU EXM-0105 com cobertura de 9 dias e fornecedor com lead time de 15 dias, quando o filtro
  "Em risco" é ligado, então EXM-0105 aparece e EXM-0042 não.

## Mudanças cobertas

m-cob-coluna, m-cob-semgiro, m-cob-recalcular, m-cob-risco.
