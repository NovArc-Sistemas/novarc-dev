# C03-S02 Pedido de compra a partir da sugestão

| Campo | Valor |
|---|---|
| Conjunto | C03 (Sugestão e pedido) |
| Fase | f2 (Sugestão e pedido) |
| Domínio | compras |
| Telas | sugestao, pedido |

## Contexto

A sugestão revisada vira um pedido por fornecedor, que segue o fluxo de status que o ERP já usa para pedidos. Pedidos
acima de um valor de alçada precisam de aprovação do gestor; esse valor ainda está em aberto.

## Requisitos

- R1. Quando o comprador clicar em "Gerar pedido", o sistema deve criar um pedido de compra por fornecedor com os
  SKUs selecionados.
- R2. O sistema deve mostrar o pedido no fluxo de status já existente (rascunho, enviado, confirmado, recebido).
- R3. Enquanto o pedido estiver acima do valor de alçada, o sistema deve exigir a aprovação de um gestor antes do
  envio.

## Critérios de aceite

- A1 (prova R1). Dados três SKUs de dois fornecedores selecionados, quando o comprador gera o pedido, então dois
  pedidos são criados, um por fornecedor.
- A2 (prova R2). Dado um pedido novo, quando ele abre, então o status mostrado é "rascunho".
- A3 (prova R3). Dado um pedido acima da alçada, quando o comprador tenta enviar, então o botão fica bloqueado com
  "aguardando aprovação do gestor".

## Mudanças cobertas

m-sug-gerar, m-ped-status, m-ped-aprovacao.

## Bloqueio

R3 depende da pendência p-alcada (valor da alçada).
