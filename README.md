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

Este MVP não envia dados a terceiros. A persistência usa `localStorage`, por organização, e não tem conta, sincronização ou backup. Usa dados fictícios para avaliar a experiência. As categorias sugeridas são heurísticas locais; não são decisões fiscais ou contabilísticas. Documentos e voz são pontos de entrada futuros. Mantém segredos apenas em variáveis do servidor, nunca em `NEXT_PUBLIC_`.

O próximo passo técnico é introduzir autenticação e PostgreSQL com Drizzle, seguindo [a decisão de arquitetura](docs/architecture.md).
