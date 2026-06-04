-- Добавление колонки reactions в таблицу messages для хранения реакций в формате JSONB
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}'::jsonb;
