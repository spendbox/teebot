-- Adds the Breakout day-trader. Paste into Supabase > SQL Editor and press Run.
-- Safe to run more than once.

alter table settings add column if not exists strategy text not null default 'breakout';
alter table settings add column if not exists breakout_profile text not null default 'balanced';

alter table positions add column if not exists strategy text not null default 'classic';
alter table positions add column if not exists leverage double precision;
alter table positions add column if not exists score int;
alter table positions add column if not exists entry_hour int;
alter table positions add column if not exists volume_checked boolean not null default false;

create table if not exists day_plans (
  day date not null,
  mode text not null,
  updated_at timestamptz not null default now(),
  status text not null,
  eligible boolean not null,
  open double precision,
  trigger double precision,
  price double precision,
  score int,
  leverage double precision,
  clues jsonb,
  note text,
  primary key (day, mode)
);
alter table day_plans enable row level security;

-- The breakout strategy doesn't use the AI reviewer.
update settings set ai_enabled = false where id = 1;
