# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Responsáveis de pequenas organizações que precisam acompanhar movimentos, orçamentos e prestação de contas sem depender de uma interface contabilística difícil de usar.

## Product Purpose

O Personal CFO reúne a situação financeira de cada organização num espaço onde se podem registar, rever e analisar dados reais em euros.

## Operating Context

O acesso é por email. Depois de entrar, o utilizador escolhe a organização e trabalha nas vistas de visão geral, movimentos, conversa, orçamentos, diário, relatórios e administração, conforme o seu papel.

## Capabilities and Constraints

- Preservar autenticação, autorização por organização, dados persistidos em PostgreSQL e anexos privados.
- Preservar os fluxos e permissões atuais; esta tarefa altera apresentação e navegação, não regras contabilísticas.
- Nunca apresentar valores de demonstração como dados reais.
- A interface deve funcionar em desktop e telemóvel, em português, com valores em euros.

## Brand Commitments

Manter o nome Personal CFO e a linguagem clara em português. O utilizador escolheu o projeto CondoFlow como referência visual para todas as páginas, incluindo a estrutura de navegação horizontal da aplicação.

## Evidence on Hand

- Protótipos do próprio utilizador em `/Users/carloseva/Downloads/condoflow-premium-landing-page/project/`, sobretudo `CondoFlow App.dc.html` e `CondoFlow Sistema.dc.html`.
- Interface atual e funcionalidades no repositório Personal CFO. O conteúdo demonstrativo do CondoFlow não é conteúdo do Personal CFO.

## Product Principles

1. O estado financeiro real deve ser legível antes de qualquer ornamento.
2. Uma organização e uma tarefa de cada vez, com navegação consistente.
3. As ações e permissões existentes permanecem intactas durante o redesenho.
