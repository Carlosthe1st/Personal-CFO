# Arquitetura e decisões

## Estrutura

Next.js 16 App Router, React 19, TypeScript estrito e Tailwind CSS 4. A página é um Server Component pequeno que entrega a experiência interativa a um Client Component. Componentes de apresentação, modelos de domínio, dados de demonstração, interpretação e persistência ficam em módulos separados.

`src/domain` define organizações, transações, documentos, mensagens e estados de revisão. `src/lib/interpret.ts` interpreta texto de forma determinística; não emite parecer fiscal. `src/lib/storage.ts` encapsula a persistência local, de modo que a futura substituição por uma API e PostgreSQL não altere a interface. `src/data/demo.ts` contém exclusivamente os dados iniciais de demonstração.

## ADR 001 — Persistência local para o protótipo

Escolha: `localStorage` com chave versionada, validação de dados carregados e separação por `organizationId`. Permite testar o fluxo completo imediatamente. Limitações: dados apenas neste dispositivo/navegador, sem autenticação, sincronização ou garantias de backup. Uma futura migração deve introduzir repositórios no servidor, autenticação e autorização por organização.

## ADR 002 — Drizzle para PostgreSQL futuro

Escolha: Drizzle quando o backend for introduzido. Os tipos atuais são independentes do ORM, preservando o domínio e permitindo mapear explicitamente tabelas, migrações e histórico de revisão. O ORM ainda não é instalado porque não existe base de dados neste MVP.

## ADR 003 — Sugestão separada de decisão

A interpretação local gera uma proposta com confiança e estado `suggested`; só um ato explícito do utilizador cria a transação. A classificação contabilística mantém `needs_review` até intervenção de pessoa autorizada. Nenhuma regra fiscal é inferida ou apresentada como certeza. A futura camada de conhecimento fiscal deve armazenar fonte, jurisdição e datas de vigência/verificação.

## Integrações futuras

Uma porta `AIProvider` descreve análise de transações, documentos e perguntas. As implementações futuras devem correr no servidor, com chaves em variáveis de ambiente. Documentos, voz e extratos entram através de adaptadores de origem e produzem propostas antes de qualquer confirmação.
