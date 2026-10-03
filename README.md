# Personal CFO

Um CFO de bolso para pequenas empresas e organizações em Portugal. Este primeiro protótipo transforma texto simples em propostas de lançamentos, mostra uma visão financeira e guarda os registos no navegador.

## Começar

Requer Node.js 22.

```bash
npm ci
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Os dados de demonstração aparecem na primeira visita. Os lançamentos confirmados ficam guardados neste navegador. Para recomeçar a demonstração, limpa os dados locais do site no browser.

## Preparar uma demonstração em produção

Não são necessárias variáveis de ambiente, base de dados nem chave de IA para este MVP. A interpretação é local. `.env.example` documenta apenas integrações futuras, ainda não implementadas.

Num serviço que suporte Node.js 22, usa `npm ci` para instalar, `npm run build` para compilar e `npm start` para iniciar. O servidor utiliza `PORT` quando definido pelo serviço; o valor local por omissão é 3000. Publica com HTTPS para disponibilizar as APIs do navegador usadas pela demonstração. A escolha da plataforma continua em aberto.

Para verificar a versão de produção localmente:

```bash
npm ci
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

Em [http://127.0.0.1:3000](http://127.0.0.1:3000), confirma um lançamento com cêntimos, recarrega e verifica o valor; muda de organização; pesquisa movimentos; marca um item como visto; testa o menu numa janela estreita. Usa um perfil de navegador com dados fictícios. Em caso de falha de gravação, o lançamento não é adicionado e a proposta permite tentar novamente. Dados locais ilegíveis são preservados e a gravação fica bloqueada até serem recuperados ou removidos conscientemente nas ferramentas do navegador.

O armazenamento pertence à origem (protocolo, domínio e porta): os registos de localhost não acompanham o novo domínio. As organizações filtram a mesma coleção local; não existe isolamento de segurança entre utilizadores. Este deployment serve apenas demonstrações com dados fictícios.

## Stack

Next.js 16 (App Router), React 19, TypeScript estrito, Tailwind CSS 4, Lucide, ESLint, Prettier e Vitest.

## Scripts

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run format:check
```

## Estrutura

- `src/app`: rotas, layout e estilos globais.
- `src/components`: shell, dashboard, conversa e elementos partilhados.
- `src/domain`: entidades e estados do negócio.
- `src/lib`: cálculo financeiro, interpretação de texto, datas, persistência e interface de IA futura.
- `src/data`: dados de demonstração separados da UI.
- `tests`: testes unitários do comportamento central.
- `docs`: produto, arquitetura, plano e roadmap.

## Segurança e limites

## Fundação contabilística (desenvolvimento)

`/` continua a demonstração local. A base PostgreSQL da contabilidade é independente; não há migração automática de `localStorage`. Usa apenas dados fictícios enquanto autenticação, integração, backups/restauro e revisão de segurança não estiverem aprovados.

Configura `DATABASE_URL` apenas no servidor. Gera alterações com `npm run db:generate` e aplica migrações explicitamente com `npm run db:migrate`; o build nunca migra a base. Faz backup e testa a reposição antes de aplicar migrações fora de desenvolvimento. Não há rollback destrutivo automático.

O projeto Supabase de desenvolvimento `Personal CFO` (`josqvkfgcbogggefimfd`, `eu-west-1`) é separado do Ebenezer Finance. As quatro migrações em `drizzle/` foram aplicadas e registadas no histórico Drizzle. As dez tabelas têm RLS ativa e não concedem acesso a `anon` nem `authenticated`; a app usa PostgreSQL diretamente, não a Data API nem chaves públicas. A ligação Vercel–Supabase e o email estão configurados como segredos de produção; não colocar credenciais no repositório.

Para o deploy na Vercel, configura como segredos de servidor `DATABASE_URL` (Transaction pooler Supabase, porta 6543, com `sslmode=verify-full`), `AUTH_SECRET` (aleatório, 32+ caracteres), `AUTH_URL` (URL HTTPS pública), `AUTH_TRUST_HOST=true`, `EMAIL_SERVER` (SMTP com TLS) e `EMAIL_FROM` (domínio verificado). Não uses `NEXT_PUBLIC_` nestas variáveis. O cliente usa `node-postgres` sem pipelining e exige TLS verificado fora do localhost. O certificado público da CA do pooler Supabase está em `src/db/supabase-ca.ts` e deve ser atualizado se o fornecedor o rodar. O build não aplica migrações. Antes de ativar dados reais: limitar abuso de login, configurar backups externos e testar restauro; o plano Free não fornece backup automático.

Testes PostgreSQL exigem `DATABASE_URL_TEST` numa base descartável local cujo nome termine em `_test`. O helper usa exclusivamente essa variável, aplica migrações e limpa tabelas entre testes. Sem a variável, a integração é assinalada como ignorada, não verificada. Nunca forneças credenciais de produção ao processo de testes.

O login de desenvolvimento utiliza Auth.js com sessões PostgreSQL e ligação de acesso por email. Requer `AUTH_SECRET` aleatório com pelo menos 32 caracteres, `AUTH_URL`, `EMAIL_SERVER` e `EMAIL_FROM`. `AUTH_TRUST_HOST=true` só deve ser ativado atrás de um alojamento/proxy que valide o Host. Não são criadas memberships automaticamente ao iniciar sessão: criar uma organização atribui o papel de proprietário, na mesma transação que as contas iniciais. As contas iniciais são exemplos genéricos editáveis, sem pretensão de plano fiscal oficial.

Nodemailer está fixado em 10.0.13, corrigindo as advisories conhecidas ([release upstream](https://github.com/nodemailer/nodemailer/releases/tag/v10.0.13)). Auth.js beta.32 ainda declara peers 7/8; existe um override explícito, validado pelo smoke real de magic link SMTP e sessão. `npm audit` não reporta vulnerabilidades de produção nesta instalação; persistem quatro moderadas na cadeia de desenvolvimento Drizzle Kit/esbuild. Não executar `npm audit fix --force` sem rever incompatibilidades.

`/contabilidade` permite criar organizações, confirmar um lançamento com um débito/crédito equilibrados e consultar o diário. Proprietário/admin podem adicionar utilizadores que já iniciaram sessão e alterar papéis através do formulário Membros; admin não promove nem altera outros admins, e ninguém altera o proprietário. Convites por email, remoção/transferência de propriedade, edição do plano de contas e lançamentos com mais linhas na UI ficam para plano seguinte. A API de diário já aceita várias linhas.

Verificação local: testes PostgreSQL abrangem isolamento, autorização, valores inválidos, atomicidade, repetição concorrente e imutabilidade; UI cobre leitor, criação, repetição após 503 e membros. O build funciona sem configuração: `/` responde 200, contabilidade informa indisponibilidade e API responde 503. Com configuração, anónimo recebe redirect 307 e API 401. Para repetir os smoke HTTP/SMTP, inicia `npm start` em loopback com base descartável e `EMAIL_SERVER=smtp://127.0.0.1:25252`, depois executa `ACCOUNTING_TEST_BASE_URL=http://127.0.0.1:PORT npm test -- tests/accounting-http.test.ts tests/auth-smoke.test.ts`; o teste SMTP abre um catcher local e usa email fictício, não fornecedor externo.

A demonstração e a fundação contabilística estão publicadas na Vercel, com domínio, SMTP e PostgreSQL ligados. O uso com dados reais continua bloqueado até haver limites anti-abuso de login, backups externos, restauro testado e revisão de segurança.

```bash
DATABASE_URL_TEST=postgres://user:password@127.0.0.1:5432/personal_cfo_test npm test
```

Este MVP não envia dados a terceiros. A persistência usa `localStorage`, por organização, e não tem conta, sincronização ou backup. Usa dados fictícios para avaliar a experiência. As categorias sugeridas são heurísticas locais; não são decisões fiscais ou contabilísticas. Documentos e voz são pontos de entrada futuros. Mantém segredos apenas em variáveis do servidor, nunca em `NEXT_PUBLIC_`.

O próximo plano deve integrar movimentos simples e correções nesta fundação, seguindo [a decisão de arquitetura](docs/architecture.md).
