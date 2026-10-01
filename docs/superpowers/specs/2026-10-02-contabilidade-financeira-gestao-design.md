# Personal CFO — contabilidade financeira e de gestão

Data: 2026-10-02

## Intenção e resultado esperado

Evoluir o protótipo Personal CFO para uma aplicação utilizável com dados financeiros reais de várias organizações. Uma pessoa sem formação contabilística deve poder registar movimentos num formulário simples; um responsável com conhecimentos contabilísticos deve poder rever o lançamento de partidas dobradas correspondente. O sistema deve permitir planear uma verba anual por mês e categoria, acompanhar o realizado e corrigir qualquer registo sem perder o histórico. A primeira entrega não pretende substituir aconselhamento contabilístico nem garantir conformidade fiscal ou legal.

O utilizador aprovou: várias organizações isoladas; EUR; contabilidade financeira e de gestão, sem faturação, salários ou obrigações fiscais; PostgreSQL, contas de utilizador, permissões e backups para dados reais; correções de lançamentos confirmados por estorno e substituição; orçamento livremente ajustável e transferências manuais com histórico.

## Âmbito da primeira entrega

- Organizações com exercício configurável, plano de contas próprio, utilizadores e permissões por organização.
- Contas de caixa e banco, saldos de abertura, diário de lançamentos equilibrados e movimentos simples de entrada, saída e transferência. Um movimento confirmado gera um lançamento; propostas do chat só geram lançamentos após confirmação explícita.
- Correção e remoção lógica de movimentos, incluindo valor, data, descrição, categoria, organização e contas. Um lançamento confirmado nunca é sobrescrito ou apagado: a correção cria estorno e substituição, e a remoção cria estorno. Todos ficam consultáveis no histórico. Ao mudar de organização, a operação deve ter autorização nas duas organizações e produzir o rasto de saída/entrada correspondente.
- Conciliação manual de caixa/banco e importação CSV de extratos com pré-visualização, mapeamento de colunas, deteção de duplicados e confirmação. Não há ligação bancária automática.
- Balancete, balanço, demonstração de resultados e consulta do diário e razão por exercício/período, calculados apenas a partir de lançamentos confirmados. Saldos de abertura entram por lançamento equilibrado, não por um campo de saldo independente.
- Orçamento anual por organização e exercício, distribuído por mês e categoria; valores planeado, realizado e disponível; transferências manuais entre mês/categoria; variações da verba anual; histórico de alterações e alertas para défices e montantes por distribuir.
- Autenticação, gestão de membros, autorização no servidor, backups e recuperação testada antes de uso real.

Ficam fora do âmbito: faturação, salários, obrigações fiscais, submissões oficiais, moeda diferente de EUR, integração automática com bancos e migração automática do `localStorage` da demonstração. Os dados de demonstração permanecem separados da base real.

## Arquitetura e limites entre módulos

Manter a interface Next.js existente e introduzir serviços no servidor para identidade/permissões, diário, orçamentos, conciliação e relatórios. PostgreSQL é a fonte de verdade. O alojamento do PostgreSQL é uma decisão operacional separada do alojamento da app na Vercel; a aplicação usa ligação configurada por variável de ambiente e não depende de um fornecedor específico. Reaproveitar os modelos e componentes existentes onde fizer sentido, mas não usar `localStorage` como persistência dos dados reais.

O módulo de identidade autoriza cada operação por `organizationId` no servidor. O módulo de diário possui os lançamentos e expõe consultas de saldos; orçamento e relatórios consomem essas consultas, sem guardar um segundo saldo contabilístico editável. O módulo de orçamento possui planos e eventos de revisão, não altera lançamentos. A conciliação liga linhas de extrato a lançamentos, mas não confirma movimentos automaticamente. A interface de conversa existente continua a produzir apenas propostas; a confirmação passa pelo mesmo serviço de criação de lançamentos que o formulário.

Permissões por organização: proprietário gere membros e organização; administrador gere plano de contas, orçamentos, conciliação e lançamentos; editor cria e corrige movimentos/lançamentos; leitor só consulta. Uma pessoa pode pertencer a várias organizações. Todas as consultas e mutações verificam pertença e papel no servidor; filtrar apenas na interface não é suficiente.

## Modelo e invariantes

Entidades principais: `User`, `Organization`, `Membership`, `Account`, `JournalEntry`, `JournalLine`, `Transaction` (interface simples ligada ao lançamento), `BankAccount`, `StatementImport`, `StatementLine`, `Reconciliation`, `AnnualBudget`, `BudgetAllocation`, `BudgetEvent` e `AuditEvent`. A modelação física pode combinar entidades quando não perde estas responsabilidades. Todas as entidades organizacionais pertencem explicitamente a uma organização; índices e chaves externas preservam esse vínculo.

Montantes em EUR são guardados como valores decimais exatos ou cêntimos inteiros, nunca como `float` para somas. Cada lançamento confirmado tem data, descrição, autor, estado e pelo menos duas linhas cuja soma de débitos iguala a soma de créditos. Uma transação de caixa/banco deve corresponder a uma alteração da conta financeira e à contrapartida escolhida. Lançamentos em rascunho podem ser editados; confirmados são imutáveis. Estornos referenciam o original e invertem todas as suas linhas; uma substituição referencia a correção. Retirar um movimento dos resultados exige estorno, preservando histórico e rastreabilidade. Não se permite criar lançamentos desequilibrados nem apagar contas referenciadas por lançamentos; estas podem ser desativadas.

Cada orçamento pertence a uma organização e exercício. A verba anual pode aumentar ou diminuir. Alocações por mês/categoria podem ser alteradas e transferidas manualmente; cada ação regista autor, instante, motivo opcional, origem/destino e valores antes/depois. O realizado deriva dos lançamentos de despesa confirmados, pela data e categoria contabilística aplicáveis, incluindo efeitos de estornos. A interface mostra `por distribuir = verba anual − soma das alocações` e `disponível = alocação − realizado`; valores negativos são avisos visíveis, não bloqueios. Campos monetários inválidos e alocações negativas são rejeitados, mas gastar acima do plano ou deixar o plano acima da verba anual é permitido e sinalizado. Transferências não podem retirar mais que a alocação de origem; para qualquer outra redistribuição, o utilizador pode editar diretamente as alocações e a verba anual.

## Fluxos de utilização

1. O proprietário cria a organização e convida membros. O administrador configura exercício, plano de contas e contas de banco/caixa. Saldos iniciais são lançamentos equilibrados.
2. O editor introduz um movimento ou confirma uma proposta do chat. Vê a contrapartida sugerida e pode ajustar as linhas no modo avançado. O servidor valida autorização, dados e equilíbrio, grava tudo numa transação de base de dados e só então confirma sucesso na interface.
3. Para corrigir um movimento confirmado, o editor vê o original, introduz os novos valores e confirma. O servidor grava o estorno e o substituto na mesma transação. Para eliminar, grava o estorno e marca o movimento como removido da vista corrente; o histórico continua acessível. Se uma operação falhar, nenhuma alteração parcial é exibida como concluída.
4. O administrador define a verba anual, distribui por meses/categorias e pode transferir montantes entre células. O painel mostra planeado, realizado, disponível, verba por distribuir, desvios e eventos de histórico. Alterar um movimento recalcula os valores dos períodos, categorias e organizações envolvidos.
5. O utilizador importa CSV com pré-visualização e resolve duplicados. Associa linhas a lançamentos e confirma a conciliação. Relatórios financeiros e de gestão podem ser filtrados por período; apresentam a origem dos valores e não misturam organizações.

## Segurança, erros e operação

Credenciais e segredos ficam apenas no servidor. Sessões exigem autenticação; cada rota, ação e consulta valida a organização e o papel. Entradas são validadas no servidor; importações têm limites de tamanho e formato. Escritas relacionadas usam transações atómicas e restrições da base de dados. O histórico regista utilizador, instante, ação, organização e referências/valores anteriores e novos relevantes. É um rasto de aplicação, não uma garantia contra alteração direta por administradores da base de dados.

Erros de autenticação, permissões, dados, conflito de edição ou indisponibilidade da base são distinguíveis na interface. Não se declara sucesso antes do commit. Evitar dupla submissão com identificadores de operação/idempotência nos fluxos críticos. Backups automáticos, retenção, controlo de acesso e pelo menos um ensaio de reposição são pré-requisitos de ativação com dados reais; os detalhes dependem do fornecedor de PostgreSQL escolhido. Definir estratégia de migração de esquema, ambiente de testes separado e procedimento de rollback antes do deploy. A versão pública atual continua demo até estes requisitos estarem verificados.

## Entrega e verificação

Executar em etapas sem publicar uma versão parcialmente segura como produção: (1) identidade, organizações, PostgreSQL e diário; (2) movimentos, chat e correções ligadas ao diário; (3) orçamentos e relatórios; (4) conciliação e preparação operacional. Cada etapa mantém o ambiente de demonstração separado. A integração na versão pública requer configuração de base, migrações, backup/restauro e testes de ponta a ponta.

Critérios de aceitação:

1. Um editor regista uma despesa de 180 € e o diário contém débito/crédito equilibrados; caixa/banco, balancete, resultados e orçamento refletem o valor uma única vez.
2. Uma correção de 180 € para 150 €, inclusive mudando mês/categoria/organização autorizada, preserva o original, estorna-o, cria substituto e atualiza todos os períodos/organizações afetados.
3. Remover um movimento confirmado retira o seu efeito dos saldos e orçamentos sem eliminar o histórico; um utilizador sem permissão não consegue fazê-lo por chamada direta à API.
4. A verba anual de 70 000 € pode ser aumentada ou diminuída, alocada a meses e categorias e transferida manualmente; cada mudança fica no histórico. Excesso de gasto e sobrealocação aparecem como avisos, sem impedir o registo.
5. Utilizadores da organização A não conseguem consultar nem alterar dados da B sem filiação adequada, mesmo manipulando identificadores nas chamadas ao servidor.
6. Importar o mesmo extrato duas vezes não cria movimentos duplicados sem aviso/confirmação; a conciliação é rastreável.
7. Falha numa gravação relacionada não deixa lançamentos, orçamento ou histórico parcialmente atualizados; uma cópia de segurança pode ser restaurada num ambiente de teste.

Testes: unidade para cálculos de diário, relatórios e orçamento; integração PostgreSQL para equilíbrio, estornos, autorização, transações e isolamento; testes de interface para registo, edição/remoção, orçamento, relatórios e CSV. Uma revisão de qualidade independente verifica segurança, integridade dos dados e a experiência do chat antes do deploy.
