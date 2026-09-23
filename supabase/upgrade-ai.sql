-- Adds the AI trade reviewer. Paste into Supabase > SQL Editor and press Run.
-- Safe to run more than once.

alter table settings add column if not exists ai_enabled boolean not null default true;
alter table settings add column if not exists ai_daily_limit int not null default 4;
alter table settings add column if not exists ai_calls_date date;
alter table settings add column if not exists ai_calls_today int not null default 0;

create table if not exists ai_reviews (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  mode text not null,
  symbol text not null,
  candle_time bigint not null,
  price double precision not null,
  approve boolean,
  confidence double precision,
  reasoning text,
  key_risks jsonb,
  stop_price double precision,
  size_multiplier double precision,
  cost_usd double precision,
  error text,
  price_24h double precision
);
create index if not exists ai_reviews_lookup_idx on ai_reviews (symbol, candle_time, mode);
create index if not exists ai_reviews_created_idx on ai_reviews (created_at);

alter table ai_reviews enable row level security;
