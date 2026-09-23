# Teebot: a cautious crypto trading bot

Teebot trades Bitcoin, Ethereum and Solana on **Bybit spot** by itself. It checks the market every 5 minutes, only buys when several independent strategies agree, and puts a stop-loss on every trade.

> **Please read:** no bot can guarantee profit. Teebot is built to **protect your money first**. It stays in cash (USDT) when the market is falling or too wild. It is normal for it to go days without trading. Start in practice mode.

## How it decides

1. **Reads the market.** Every 5 minutes it downloads hourly prices from Bybit and labels each coin: *trending up*, *trending down*, *moving sideways* or *too wild*.
2. **Asks three strategies:**
   - **Trend follower:** rides steady upward moves.
   - **Range trader:** buys sharp dips when the price is moving sideways.
   - **Breakout catcher:** buys when the price breaks above its recent high on strong volume.
3. **Trusts whatever has been working.** Each strategy is scored on how it did over the last ~8 days, after fees. Strategies that were losing get no say. If none are working, the bot waits.
4. **Checks the mood.** When the free *Fear & Greed index* shows extreme greed, the bot needs a stronger signal before it buys.
5. **Buys only when:** the market isn't falling or wild, the combined signal is strong enough, and at least 2 strategies agree.

## Safety rules (Cautious)

| Rule | Setting |
|---|---|
| Most it can lose on one trade | about 1% of your balance |
| Most money in one coin | 35% |
| Trades open at once | 2 |
| Stop-loss | on every trade, placed **on Bybit itself**, so it works even if the bot is offline |
| Locking in profit | stop moves up to break-even, then follows the price up |
| Bad day | down 3% → no new trades until tomorrow |
| Safety shutdown | down 15% from its peak → sells everything, switches off, messages you |
| Borrowed money (leverage) | **never** |
| Withdrawals | **impossible**: the Bybit key only gets trade permission |

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

### Step 3: Make it run every 5 minutes

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

### Step 5: Practise for 2 to 4 weeks

1. Dashboard → **Switch on**. It starts with **$20 of practice money** and real prices.
2. Try the **Backtest** page to see how the rules would have done over the past months.
3. Messages marked `[PRACTICE]` are practice trades.

### Step 6: Real money (only when you're happy)

**Get USDT onto Bybit using naira:**
- **Easiest:** Bybit app → **Buy Crypto → P2P** → choose **NGN**, and buy USDT from a seller with a high completion rate, paying by bank transfer. Only release payment details inside Bybit's P2P chat, and never trade outside the platform.
- **Alternative:** buy USDT with naira on a Nigerian exchange (e.g. Quidax or Busha), then withdraw it to your Bybit USDT deposit address. Choose a cheap network such as TRC20 or BEP20, and use **the same network on both sides**.
- Make sure the USDT is in your **Unified Trading** account (Bybit → Assets → Transfer).

**Create a trade-only API key:**
1. Bybit → profile → **API** → **Create New Key** → **System-generated**.
2. Choose **Read-Write**, and tick only **Unified Trading → Spot → Trade**. **Do NOT tick Withdraw or Transfer.**
3. IP restriction: choose **No IP restriction**, because Vercel's address changes. Bybit makes these keys **expire after 3 months**, so create a new one when that happens (the bot will message you with an error).
4. In Vercel add `BYBIT_API_KEY` and `BYBIT_API_SECRET`, then **Redeploy**.
5. Dashboard → **Settings → Test Bybit connection**. It should show your balance.
6. **Settings → Money mode** → type `LIVE` → **Switch to real money** → Dashboard → **Switch on**.

**After you deposit or withdraw,** press *"I deposited or withdrew - restart balance tracking"* in Settings. Otherwise a withdrawal looks like a loss.

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
