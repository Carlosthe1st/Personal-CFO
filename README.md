# Personal CFO

Um CFO de bolso para pequenas empresas e organizações em Portugal. Este primeiro protótipo transforma texto simples em propostas de lançamentos, mostra uma visão financeira e guarda os registos no navegador.

## Começar

Requer Node.js 22.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). Os dados de demonstração aparecem na primeira visita. Os lançamentos confirmados ficam guardados neste navegador. Para recomeçar a demonstração, limpa os dados locais do site no browser.

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
