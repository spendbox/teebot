-- Adds the early warning. Paste into Supabase > SQL Editor and press Run.
-- Safe to run more than once.

alter table settings add column if not exists run_start_at timestamptz;
alter table settings add column if not exists run_start_equity double precision;
alter table settings add column if not exists warning_action text not null default 'pause';
alter table settings add column if not exists warning_at timestamptz;
alter table settings add column if not exists warning_reason text;
