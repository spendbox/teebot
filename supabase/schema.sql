-- Teebot database. Paste this whole file into Supabase > SQL Editor and press Run.
-- Safe to run more than once.

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  mode text not null default 'paper' check (mode in ('paper', 'live')),
  risk_profile text not null default 'cautious',
  symbols text[] not null default '{BTCUSDT,ETHUSDT,SOLUSDT}',
  paper_start_balance double precision not null default 100,
  peak_equity double precision,
  day_start_equity double precision,
  day_start_date date,
  daily_halt_date date,
  kill_switch boolean not null default false,
  kill_reason text,
  telegram_chat_id text,
  lock_until timestamptz,
  last_tick_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists positions (
  id bigserial primary key,
  mode text not null,
  symbol text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  qty double precision not null,
  entry_price double precision not null,
  cost double precision not null,
  stop_price double precision not null,
  highest_price double precision not null,
  stop_order_id text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  exit_price double precision,
  proceeds double precision,
  pnl double precision,
  exit_reason text,
  signal jsonb
);
create index if not exists positions_open_idx on positions (mode, status);

create table if not exists signals (
  symbol text primary key,
  updated_at timestamptz not null default now(),
  regime text,
  action text,
  reason text,
  price double precision,
  combined double precision,
  threshold double precision,
  confirmations int,
  scores jsonb,
  weights jsonb
);

create table if not exists events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  level text not null,
  message text not null
);

create table if not exists equity_snapshots (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  mode text not null,
  equity double precision not null
);
create index if not exists equity_snapshots_idx on equity_snapshots (mode, created_at);

-- AI reviewer (same as upgrade-ai.sql)

alter table settings add column if not exists ai_enabled boolean not null default false;
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


-- Breakout day-trader (same as upgrade-breakout.sql)

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

-- The breakout strategy doesn't use the AI reviewer.
update settings set ai_enabled = false where id = 1;

-- Lock every table: only the server (which holds the secret key) can read or write.
alter table settings enable row level security;
alter table positions enable row level security;
alter table signals enable row level security;
alter table events enable row level security;
alter table equity_snapshots enable row level security;
alter table ai_reviews enable row level security;
alter table day_plans enable row level security;
