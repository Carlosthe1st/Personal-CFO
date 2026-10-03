UPDATE accounts SET kind = CASE code
  WHEN 'CAIXA' THEN 'cash' WHEN 'BANCO' THEN 'bank'
  WHEN 'DESPESA' THEN 'expense' WHEN 'RENDIMENTO' THEN 'income'
  ELSE 'other' END
WHERE kind='other' AND (
  (code='CAIXA' AND name='Caixa') OR (code='BANCO' AND name='Banco') OR
  (code='DESPESA' AND name='Despesas') OR (code='RENDIMENTO' AND name='Rendimentos')
);
