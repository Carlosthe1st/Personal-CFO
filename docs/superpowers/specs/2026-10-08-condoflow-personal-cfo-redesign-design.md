# Personal CFO — redesenho com a linguagem CondoFlow

## Decisão e resultado esperado

O utilizador escolheu aplicar a primeira opção discutida: substituir a navegação lateral e o visual verde do Personal CFO pela estrutura horizontal e pela linguagem do `CondoFlow App.dc.html` em todas as páginas. O produto continua a chamar-se Personal CFO; conteúdo, dados, autenticação, permissões e operações financeiras não mudam. O resultado deve parecer uma única aplicação, não páginas antigas com uma camada de tinta nova.

## Referência e limites

As referências visuais são `CondoFlow App.dc.html` (estrutura da aplicação), `CondoFlow Sistema.dc.html` (primitivos visuais) e, só para a composição das páginas de acesso, `CondoFlow Site.dc.html`, todos em `/Users/carloseva/Downloads/condoflow-premium-landing-page/project/`. São protótipos, não código a importar. Não copiar nomes, números, preços, testemunhos nem recursos de condomínio. Preservar os valores reais do Personal CFO e os textos portugueses que descrevem funções existentes.

## Sistema visual

- Fundo areia `#F7F6F4`, superfícies brancas ou discretamente translúcidas, texto grafite `#17171A`, ação primária azul profundo `#1B3A6B`, azul suave `#EDF1F7` e cinzas quentes para texto secundário. Vermelho e outros estados semânticos continuam distinguíveis.
- Geist para texto e números; Geist Mono apenas para micro-rótulos e metadados. Hierarquia por tamanho, peso moderado e espaço, sem caixa-alta indiscriminada.
- Botões principais em cápsula, campos com foco visível, cartões de 16–24 px com borda fina e sombra curta, tabelas legíveis e badges de estado. Usar transparência e blur com parcimónia; a legibilidade prevalece sobre o efeito.
- Tokens e estilos partilhados em `src/app/globals.css`, aproveitando componentes já existentes em `src/components`. Não adicionar uma biblioteca de UI para reproduzir o protótipo.

## Navegação e composição

No desktop, o espaço autenticado tem uma barra superior fixa ou sticky com marca Personal CFO, seletor de organização, navegação horizontal das sete vistas existentes e conta/saída. Uma linha de contexto abaixo mostra organização e vista atual. A área principal ocupa a largura disponível, com largura máxima e espaçamento coerentes com o CondoFlow App. Não haverá barra lateral paralela nem links duplicados.

Em ecrãs estreitos, a barra conserva marca, organização e um botão de menu; o menu expansível apresenta todas as vistas autorizadas, com indicação da vista ativa, fecho por Escape e foco controlado. A navegação nunca depende só de scroll horizontal oculto. Papéis continuam a filtrar as mesmas vistas que hoje. Trocar de organização continua a voltar à visão geral e atualizar os dados da organização selecionada.

## Superfícies abrangidas

- `/login`, `/login/check-email`, `/auth/confirm` e estados de indisponibilidade/erro usam a mesma marca, tipografia, cores, controles e mensagens claras; o formulário de email e os redirecionamentos não mudam.
- `/contabilidade` aplica o novo shell a Visão geral, Movimentos, Falar com o CFO, Orçamentos, Diário, Relatórios e Administração. Painéis internos — fundos, recorrências, previsão, contas, extratos, comprovativos e membros — herdam os mesmos controles e espaçamento.
- `/` continua a encaminhar para `/contabilidade`, que envia visitantes não autenticados para `/login`. Não se cria uma landing page nem se replica a demonstração antiga que não está exposta nesta rota.
- Estados vazio, a carregar, erro, sucesso e permissões insuficientes pertencem ao mesmo sistema; nenhum mostra números fictícios como dados de produção.

## Estrutura de implementação

1. Definir tokens e primitivos de apresentação reutilizáveis, substituindo as regras antigas em vez de acumular overrides.
2. Reorganizar `AccountingWorkspace` para o cabeçalho horizontal e menu móvel, mantendo a lógica de `View`, organização, dados e permissões.
3. Adaptar as vistas e painéis existentes aos novos cartões, tabelas, formulários e densidade, sem alterar chamadas de API ou regras de domínio.
4. Adaptar as páginas de autenticação e os seus estados ao mesmo sistema.
5. Remover classes e regras visuais que deixarem de ter uso. Não transportar o HTML e os scripts do protótipo para o bundle.

## Verificação

- Testes de comportamento pelas interfaces públicas: navegação entre vistas e seleção de organização; filtragem por papel; abertura/fecho do menu móvel; formulário e estados de login. Definir e confirmar estes seams antes dos testes TDD.
- Executar testes existentes, typecheck, lint e build; não interpretar falhas pré-existentes como sucesso.
- Comparar visualmente desktop (1440 px) e telemóvel (390 px) com a referência CondoFlow em uma revisão agrupada, corrigir defeitos materiais e confirmar numa segunda passagem no máximo. Verificar teclado, foco, contraste, overflow, tabelas e formulários.
- Publicar na Vercel apenas depois de a versão local passar; confirmar HTTPS, redirecionamento para login e abertura autenticada. Não criar lançamentos financeiros fictícios em produção para testar o visual.

## Fora do âmbito

Novas funções financeiras, alterações à base de dados, migrações, sincronização bancária, preços, textos de marketing e dados inventados. O protótipo CondoFlow serve de autoridade visual, não de fonte de requisitos de produto.
