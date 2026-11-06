# C02-S01 Lead time no cadastro do fornecedor

| Campo | Valor |
|---|---|
| Conjunto | C02 (Lead time do fornecedor) |
| Fase | f1 (Base de cobertura) |
| Domínio | compras |
| Telas | fornecedores |

## Contexto

A cobertura só diz se um SKU está em risco quando é comparada com o tempo que o fornecedor leva para entregar. O
cadastro de fornecedores ganha esse campo, com um padrão para quem ainda não tem o valor preenchido.

## Requisitos

- R1. O sistema deve guardar o lead time, em dias corridos, no cadastro de cada fornecedor.
- R2. Se o fornecedor não tiver lead time preenchido, então o sistema deve usar o lead time padrão de compras e
  indicar isso na tela.

## Critérios de aceite

- A1 (prova R1). Dado o fornecedor "Distribuidora Modelo" com lead time de 15 dias, quando o cadastro abre, então o
  campo mostra 15.
- A2 (prova R2). Dado um fornecedor sem lead time, quando o cadastro abre, então o campo mostra o padrão com o selo
  "padrão".

## Mudanças cobertas

m-forn-leadtime.
