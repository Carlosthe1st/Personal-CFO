CREATE FUNCTION protect_journal_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE debit_total numeric; credit_total numeric; line_count integer;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status = 'posted' THEN
    RAISE EXCEPTION 'Posted entries are immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'posted' THEN
    IF TG_OP = 'INSERT' THEN RAISE EXCEPTION 'Post through a draft entry' USING ERRCODE = '23514'; END IF;
    SELECT count(*), coalesce(sum(amount_cents) FILTER (WHERE side='debit'),0), coalesce(sum(amount_cents) FILTER (WHERE side='credit'),0)
      INTO line_count,debit_total,credit_total FROM journal_lines WHERE organization_id=NEW.organization_id AND entry_id=NEW.id;
    IF line_count < 2 OR debit_total <= 0 OR debit_total <> credit_total OR debit_total > 9007199254740991 THEN
      RAISE EXCEPTION 'Unbalanced journal' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_entry_integrity BEFORE INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION protect_journal_entry();
--> statement-breakpoint
CREATE FUNCTION protect_journal_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE entry_status text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO entry_status FROM journal_entries WHERE organization_id=OLD.organization_id AND id=OLD.entry_id FOR UPDATE;
    IF entry_status='posted' THEN RAISE EXCEPTION 'Posted lines are immutable' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  SELECT status INTO entry_status FROM journal_entries WHERE organization_id=NEW.organization_id AND id=NEW.entry_id FOR UPDATE;
  IF entry_status='posted' THEN RAISE EXCEPTION 'Posted lines are immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER journal_line_integrity BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION protect_journal_line();
