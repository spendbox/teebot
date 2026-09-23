-- Adds the Ethereum day-trader. Paste into Supabase > SQL Editor and press Run.
-- Safe to run more than once. It starts in practice mode.

alter table settings add column if not exists eth_mode text not null default 'paper';
alter table settings add column if not exists eth_share double precision not null default 0.5;
alter table settings add column if not exists eth_paper_start_balance double precision not null default 100;
alter table settings add column if not exists eth_peak_equity double precision;
alter table settings add column if not exists eth_last_error text;

create table if not exists eth_day_plans (
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
alter table eth_day_plans enable row level security;
