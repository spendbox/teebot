# Teebot: Bitcoin breakout day-trader

Teebot trades **Bitcoin futures on Bybit** by itself, using the **confidence breakout** strategy. It was chosen after testing many ideas on real Bitcoin prices from 2017 to 2026.

> **Please read:** no bot can guarantee profit. This one loses on some days and in some years. Start in practice mode, and only trade money you can afford to lose.

## How it trades (in plain words)

Every minute, the bot:

1. **Checks for an uptrend.** If Bitcoin closed below its 20-day average yesterday, it does nothing today.
2. **Sets today's breakout level:** today's opening price + 70% of yesterday's high-to-low range.
3. **Buys the moment Bitcoin breaks above that level,** if the setup scores well enough.
4. **Scores the setup out of 7:**
   - a strong uptrend (8.6%+ above the 20-day average)
   - above the 100-day average
   - the 50-day average is rising
   - yesterday was an up day
   - it's a weekday
   - yesterday was calmer than usual
   - the breakout comes before 12:00 UTC
5. **Sets leverage by score** (Balanced): **5 → 2×, 6 → 4×, 7 → 5×. It skips 4 or less.**
6. **Checks volume:** when the breakout hour ends, if trading volume was under 1.5× a normal hour, it sells straight away.
7. **Protects the trade:** a **5% emergency stop** sits on Bybit itself, and it **sells before midnight UTC**. It never holds overnight.

## Tested results (Bitcoin, fees + slippage + funding included)

The rules were learned on 2017–2020 and then tested on **2021–2026, which they had never seen**:

| | 2021–2026 (unseen) |
|---|---|
| Average per year | about **+38%** |
| Trades per year | about **21** |
| Trades won | about 48% (the wins are bigger than the losses) |
| Longest losing streak | 5 |
| Worst dip from a high | −37% |
| Profitable years | 5 of 6 (2025: −9%) |

Try it yourself on the **Backtest** page, which uses Bybit's own prices.

## Safety rules

| Rule | Setting |
|---|---|
| Emergency stop | −5% on every trade, placed on Bybit |
| Overnight holding | **never**: sells by 23:57 UTC |
| Leverage | 2× to 5×, only for high-scoring setups (Safer profile: at most 3×) |
| Trades per day | at most 1 |
| Safety shutdown | balance down 50% from its peak → closes everything and stops |
| Withdrawals | **impossible**: the API key only gets trading permission |

**Account size:** Bybit's smallest Bitcoin futures order is 0.001 BTC (about $100 with Bitcoin at $100k). **Use at least $100**, or 2× trades may be too small to place. With small accounts, orders round *down* to 0.001 BTC steps, so actual leverage can be a little lower than planned.

---

## Setup guide (no coding needed)

Takes about 30-45 minutes. You need free accounts on **Supabase**, **Vercel**, **Bybit** and **Telegram**.

### Step 1: Database (Supabase)

1. Go to [supabase.com](https://supabase.com) → **New project**. Pick any name, a strong database password, and the region **closest to you** (e.g. *West EU*).
2. When it's ready, open **SQL Editor** (left menu) → **New query**.
3. Open [`supabase/schema.sql`](supabase/schema.sql) in this repository, copy **everything**, paste it into the editor, and press **Run**. You should see "Success".
4. Go to **Project Settings → API** (or **API Keys**) and keep this tab open. You need:
   - the **Project URL**
   - the **secret** key (called `service_role` on older projects). **Never share this key.**

### Step 2: Website and bot (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project** → import **teebot**.
2. Before pressing Deploy, open **Environment Variables** and add these (name on the left, value on the right):

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | the Project URL from Step 1 |
   | `SUPABASE_SECRET_KEY` | the secret key from Step 1 |
   | `DASHBOARD_PASSWORD` | a password you'll use to log in |
   | `CRON_SECRET` | any long random text, e.g. 30 random letters and numbers |

3. Press **Deploy**. When it finishes you get an address like `https://teebot-abc.vercel.app`. Open it and log in with your dashboard password.

### Step 3: Make it run every minute

1. Back in Supabase → **SQL Editor** → **New query**.
2. Copy [`supabase/cron.sql`](supabase/cron.sql). Before running, replace:
   - `https://YOUR-APP.vercel.app` with your Vercel address
   - `YOUR_CRON_SECRET` with the `CRON_SECRET` you chose
3. Press **Run**.

### Step 4: Telegram alerts

1. In Telegram, message **@BotFather** → send `/newbot` → follow the prompts. It gives you a **token**.
2. In Vercel → your project → **Settings → Environment Variables**, add `TELEGRAM_BOT_TOKEN` = that token. Then go to **Deployments** → ⋯ on the latest → **Redeploy**.
3. Open your new bot in Telegram and send it "hi".
4. In your Teebot dashboard → **Settings → Connect Telegram**. You'll get a test message.

### Step 4a: Breakout upgrade (only if you set Teebot up before the breakout strategy)

1. Supabase → **SQL Editor** → **New query** → paste all of [`supabase/upgrade-breakout.sql`](supabase/upgrade-breakout.sql) → **Run**.
2. Run [`supabase/cron.sql`](supabase/cron.sql) again (with your address and secret filled in). It now runs every minute.
3. Dashboard → **Settings → Practice account** → reset to **$100**.

### Step 4b: AI reviewer (Classic strategy only, optional)

Before every buy, Teebot can ask **Claude Opus 5.5** for a second opinion. The AI sees the price charts, indicators, market mood and the bot's recent results. It can say no, tighten the stop-loss, or make the trade smaller. It can never make a trade riskier.

1. Supabase → **SQL Editor** → **New query** → paste all of [`supabase/upgrade-ai.sql`](supabase/upgrade-ai.sql) → **Run**. (Skip this if you set up Supabase after this file was added. It's already in `schema.sql`.)
2. Go to [console.anthropic.com](https://console.anthropic.com) → sign up → **Billing**: add a small amount of credit (e.g. $5) → **API Keys** → **Create Key**.
3. In Vercel add `ANTHROPIC_API_KEY` = that key, then **Redeploy**.
4. Dashboard: the pill at the top should say **AI reviewer on**.

**Cost:** each review is about 3-8 US cents. The AI is only asked when the rules already want to buy, at most once per coin per hour, and never more than the daily limit (default 4, change it in Settings). In a quiet week that's a few cents. With a $20 account, keep the limit low: AI costs come out of your profit.

### Step 5: Practise for 1 to 3 months

1. Dashboard → **Switch on**. It trades **practice money** ($100 recommended; set it in Settings) on live Bybit prices. It only trades about twice a month, so give it time.
2. Try the **Backtest** page to see how the rules would have done over the past months.
3. Messages marked `[PRACTICE]` are practice trades.

### Step 6: Real money (only when you're happy)

**Get USDT onto Bybit using naira:**
- **Easiest:** Bybit app → **Buy Crypto → P2P** → choose **NGN**, and buy USDT from a seller with a high completion rate, paying by bank transfer. Only release payment details inside Bybit's P2P chat, and never trade outside the platform.
- **Alternative:** buy USDT with naira on a Nigerian exchange (e.g. Quidax or Busha), then withdraw it to your Bybit USDT deposit address. Choose a cheap network such as TRC20 or BEP20, and use **the same network on both sides**.
- Make sure the USDT is in your **Unified Trading** account (Bybit → Assets → Transfer).

**Switch on futures trading:** in the Bybit app, open **Derivatives → USDT Perpetual**. If Bybit asks you to pass a short quiz or accept terms, complete them. Keep your USDT in the **Unified Trading** account.

**Create a trade-only API key:**
1. Bybit → profile → **API** → **Create New Key** → **System-generated**.
2. Choose **Read-Write**, and tick only **Unified Trading → Contract → Orders and Positions** (plus **Spot → Trade** if you might use the Classic strategy). **Do NOT tick Withdraw or Transfer.**
3. IP restriction: choose **No IP restriction**, because Vercel's address changes. Bybit makes these keys **expire after 3 months**, so create a new one when that happens (the bot will message you with an error).
4. In Vercel add `BYBIT_API_KEY` and `BYBIT_API_SECRET`, then **Redeploy**.
5. Dashboard → **Settings → Test Bybit connection**. It should show your balance and "Futures access: OK".
6. **Settings → Money mode** → type `LIVE` → **Switch to real money** → Dashboard → **Switch on**.

**After you deposit or withdraw,** press *"I deposited or withdrew - restart balance tracking"* in Settings. Otherwise a withdrawal looks like a loss.

### Early warning (catches a strategy that has stopped working)

Run [`supabase/upgrade-warning.sql`](supabase/upgrade-warning.sql) once: Supabase → **SQL Editor** → **New query** → paste → **Run**. (Skip this if you set up Supabase after this file was added. It's already in `schema.sql`.)

The bot remembers your balance when a run starts (when you switch to real money, reset practice, or restart the warning clock). It warns you if the balance falls:

| Time since start | Warning if down |
|---|---|
| First 2 months | 15% |
| Months 2–4 | 20% |
| After that | 30% |

In 20,000 simulated runs of the tested trades, a working bot fell this far only about 1–2 times in 100.
When it triggers you get a Telegram message and a red banner, and (by default) **new trades pause**. Any open trade still finishes normally.
Review it, then press **"I've reviewed it - clear the warning and resume"** in Settings. You can switch it to "only alert me" there.

### Ethereum day-trader (runs next to Bitcoin)

Run [`supabase/upgrade-eth.sql`](supabase/upgrade-eth.sql) once: Supabase → **SQL Editor** → **New query** → paste → **Run**.
(Skip this if you set up Supabase after this file was added. It's already in `schema.sql`.)

It starts in **practice mode** with its own pretend $100 (change it in **Settings → Ethereum day-trader**).
It uses the same **Start/Stop** switch as the Bitcoin bot and appears on the dashboard as **Today · Ethereum**.

How it trades:
- Only on days after Ethereum closed **above its 20-day average**.
- Buys when Ethereum rises to **today's open + 0.8 × yesterday's high-low range**.
- Scores the setup out of 4: **Bitcoin is breaking out too**, **before 12:00 UTC**, **Ethereum below its 100-day average**, **50-day average not rising** (Ethereum's best moves come early in a recovery).
- Score 2 → 1x, 3 → 2x, 4 → 3x. 0-1 → skip.
- Emergency stop **1 × yesterday's range below the buy, kept between 3% and 8%** (placed on Bybit with real money).
- Always sold by **23:57 UTC**. At most one Ethereum trade a day.
- If its money falls 50% from its peak it closes its trade and switches itself off.

Tested (2022-2026, never used while building): about **+38%/yr, worst dip 15%, no losing year**, ~19 trades a year.
Realistic expectation: **+15% to +35% a year**. Details: [`docs/research/ethereum-day-trader.md`](docs/research/ethereum-day-trader.md).

**Real money later:** Settings → Ethereum day-trader → type `LIVE` → **Use real money for Ethereum**.
Choose what share of the Bybit balance it may use (25/50/75%, default 50%). When both bots use real money,
Bitcoin uses the rest. Your API key needs the same **Contract → Orders and Positions** permission (nothing new).

### If something goes wrong

- **"Bybit refused the connection from this server's location":** Bybit blocks some countries, such as the USA. This project runs from Frankfurt (`fra1`). In GitHub, edit [`vercel.json`](vercel.json) and change `fra1` to another region such as `dub1` (Dublin) or `cpt1` (Cape Town). Commit, and Vercel redeploys automatically.
- **Dashboard shows no data:** press **Run now**. If Step 3 was done correctly, "Last check" updates every 5 minutes.
- **You want to stop everything:** Dashboard → **Switch off**. Open trades keep their stop-loss on Bybit. To close a trade immediately, sell it in the Bybit app.

---

## For developers

- Next.js 16 app on Vercel; Supabase Postgres (service-role access only, RLS on with no policies); `pg_cron` + `pg_net` call `POST /api/tick` every 5 minutes.
- `src/lib/engine/`: pure strategy, regime, adaptive-weight, risk and backtest code, shared by the live bot and the backtester.
- `src/lib/bot.ts`: one tick (stop management → decision → entries), guarded by a DB lock.
- `src/lib/broker/`: `paper` (simulated fills with fees and slippage) and `live` (Bybit v5 spot, exchange-side stop orders).
- `npm test` runs the engine tests; `npm run build` builds the app.
