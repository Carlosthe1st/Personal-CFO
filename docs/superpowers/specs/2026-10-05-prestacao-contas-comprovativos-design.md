# Personal CFO — prestação de contas e comprovativos

Data: 2026-10-05

## Intenção e âmbito

Permitir que responsáveis de pequenas organizações expliquem entradas, saídas e saldos a outras pessoas da mesma organização, sem trabalho manual em folhas de cálculo. O utilizador aprovou exportações CSV/PDF e anexos de comprovativos já nesta entrega. Continuam EUR, as permissões por organização e a contabilidade de partidas dobradas existente. Isto não é faturação certificada nem substitui um contabilista.

## Escolha de desenho

Estender os relatórios e movimentos existentes. Uma alternativa seria criar um módulo de relatórios separado, mas duplicaria cálculos e arriscaria divergências. Guardar ficheiros na base PostgreSQL simplificaria as credenciais, mas aumentaria a base e os backups; usar armazenamento privado de objetos do projeto Supabase mantém binários fora do diário. Não adicionar OCR nem ligações bancárias.

## Fluxos e dados

O painel de relatórios mantém filtros por período e conta/categoria e oferece CSV e PDF. O mesmo serviço de consulta autorizado alimenta ecrã e exportações. O CSV contém linhas de movimentos e colunas explícitas para data, descrição, tipo, conta, categoria, valor em cêntimos/EUR e estado; depois da entrega de fundos, inclui também o fundo. O PDF apresenta identificação da organização, período, totais, categorias e aviso de valores não classificados. Exportações nunca omitem linhas silenciosamente: paginam/streamam ou recusam com limite explícito.

No histórico de movimentos, um editor/administrador/proprietário pode anexar PDF, JPEG ou PNG (até 5 MB por ficheiro, máximo de cinco por movimento) e ver os anexos. Um leitor pode consultar e descarregar, mas não alterar. O servidor valida sessão, pertença, movimento, tipo real, tamanho e número de anexos antes de aceitar; nomes enviados são apenas metadados, não caminhos. Cada objeto tem chave opaca e fica num bucket privado. Metadados em PostgreSQL registam organização, movimento, autor, nome, tipo, tamanho, hash e estado. O download passa por autorização no servidor, sem URL pública permanente. Desassociar um anexo exige papel de administrador/proprietário e regista evento; o objeto permanece recuperável até política de retenção ser definida. Correções/estornos não apagam anexos do movimento original e a cadeia de correção deve apresentá-los.

Se o armazenamento estiver indisponível, a app não anuncia upload concluído; o movimento e os lançamentos permanecem intactos. Falhas de exportação mostram erro, nunca um ficheiro parcial apresentado como completo. Segredos do armazenamento ficam apenas no servidor. A criação do bucket e das variáveis de ambiente precede a ativação do botão em produção.

## Aceitação e testes

1. Membro da organização A exporta apenas dados de A; URL alterada para B não revela dados nem comprovativos.
2. CSV e PDF do mesmo período concordam com os totais apresentados; linhas acima do limite não desaparecem sem aviso.
3. Upload válido pode ser descarregado por membro autorizado. Tipo inválido, ficheiro excessivo e movimento de outra organização são rejeitados.
4. Correção de movimento preserva o acesso ao comprovativo histórico; desassociação deixa rasto de auditoria.
5. Testes TDD de validação, autorização, exportação e interface, mais verificação de build e fluxo autenticado antes do deploy.

## Fora do âmbito

OCR, armazenamento público, partilha por link anónimo, faturação, conformidade fiscal automática e sincronização bancária.
