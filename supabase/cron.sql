-- Makes Supabase wake the bot every 5 minutes.
-- Before running: replace YOUR-APP with your Vercel address and
-- YOUR_CRON_SECRET with the CRON_SECRET you set in Vercel.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('teebot-tick') where exists (select 1 from cron.job where jobname = 'teebot-tick');

select cron.schedule(
  'teebot-tick',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-APP.vercel.app/api/tick',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_CRON_SECRET"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
