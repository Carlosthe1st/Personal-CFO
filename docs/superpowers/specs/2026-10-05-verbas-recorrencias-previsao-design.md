# Personal CFO — verbas por projeto, recorrências e previsão

Data: 2026-10-05

## Intenção e âmbito

Ajudar um administrador a saber quanto há disponível para cada projeto/ministério, antecipar compromissos e reduzir o registo repetitivo. O utilizador escolheu ampliar a app existente, sem reconstruir o diário. Valores continuam em EUR; nenhuma recorrência lança dinheiro automaticamente. Esta entrega depende da prestação de contas apenas para exportar os novos filtros, não para calcular saldos.

## Escolha de desenho

Adicionar uma dimensão de gestão (`fundo/projeto`) opcional aos movimentos e um plano mensal por fundo, mantendo o diário contabilístico e o orçamento anual geral como fontes distintas: o fundo classifica o uso do dinheiro, não cria uma segunda conta bancária nem altera o saldo. A alternativa de um livro de fundos independente duplicaria saldos; a alternativa de quatro organizações separadas impediria uma visão consolidada. Ambos ficam fora do âmbito.

## Fundos e orçamentos

Proprietário/administrador cria, renomeia e arquiva fundos da própria organização. Um movimento pode ter um fundo; movimentos antigos ficam “Sem fundo” até serem classificados. Editor pode escolher fundo ao lançar/corrigir; o servidor valida pertença à mesma organização. A correção preserva o histórico do fundo anterior. A vista por fundo mostra entradas, despesas e resultado acumulado de gestão derivados dos movimentos confirmados e estornos, nunca um segundo saldo bancário editável. O administrador define verba por fundo/mês; o total de verbas de fundos e o orçamento geral são mostrados lado a lado para avisar, não bloquear, divergências. Não se distribui dinheiro automaticamente entre fundos; revisões e transferências manuais ficam auditadas. Uma transferência não pode retirar mais que a alocação de origem; para aumentar a verba, o administrador usa revisão explícita.

## Recorrências e previsão

Proprietário/administrador configura uma regra de receita/despesa com conta financeira, categoria, fundo opcional, valor, descrição, frequência semanal ou mensal, início e fim opcional. Na recorrência mensal, o dia 29–31 ajusta-se ao último dia de meses mais curtos. A app mostra ocorrências devidas como propostas. Editor ou superior confirma cada uma; a confirmação usa o serviço de movimentos existente com chave idempotente, gerando o diário uma vez. Pode adiar/ignorar uma ocorrência sem criar movimento, com histórico. Não há cron, cobrança nem lançamento automático. Alterar uma regra afeta apenas ocorrências futuras.

A previsão de caixa de 90 dias começa no saldo confirmado atual e acrescenta/subtrai apenas ocorrências futuras ativas das regras, por data. Mostra saldo projetado, menor saldo e pressupostos; não trata a projeção como saldo real nem como garantia de receita. Quando uma ocorrência é confirmada, sai do futuro e entra no realizado, sem dupla contagem. A ordem técnica é recorrências antes do cálculo da previsão, embora a interface possa apresentar ambas no mesmo painel.

## Segurança, erros e aceitação

Todas as consultas e mutações são isoladas por organização no servidor. Cêntimos inteiros, datas válidas e limite de horizonte evitam overflow ou geração infinita; transações atómicas e chaves idempotentes evitam duplicados. Uma regra inválida ou uma conta/fundo arquivado não produz lançamento. Indisponibilidade da base mostra erro, não um saldo zero enganoso.

1. Dois fundos da mesma organização apresentam realizado distinto, enquanto o saldo bancário consolidado não muda.
2. Uma transferência manual de verba entre fundos preserva total e histórico; sobrealocação é avisada.
3. Confirmar uma ocorrência duas vezes cria exatamente um movimento e um lançamento equilibrado.
4. Previsão soma ocorrências futuras uma vez; confirmação desloca valor de projetado para realizado sem alterar o total combinado.
5. Um membro de outra organização não vê nem altera fundos, regras ou previsões.
6. Testes TDD de orçamento, recorrência, previsão, autorização e interface; build e verificação autenticada antes do deploy.

## Fora do âmbito

Pagamentos automáticos, sincronização bancária, moedas além de EUR, IA preditiva, impostos, faturação, CRM de membros e gestão de eventos.
