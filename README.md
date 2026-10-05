# Daily Fit

A closet that tells you what to wear. Photograph your clothes on the site, it learns your style, and once a day it sends one notification: the look for the weather where you are, and anything you wore that still needs a wash-or-keep call.

## What it does

- Upload photos on the web (stored in Supabase)
- Catalogs each piece (type, color, warmth) and builds a sticky style from the closet
- Pulls today's forecast from Open-Meteo
- Picks a look from clothes that are actually clean
- **Wearing this** on Today is the real event. It stamps the pieces as worn, offers wash or still good on each, and feeds taste
- Rotates inside what you like: the exact stack sits out about a week, yesterday's top sits out a day, trousers can return with a different top
- Sends one Home Screen notification at the hour set in Account. Before 4pm it dresses today. From 4pm it dresses tomorrow and asks what from today is dirty
- Nothing leaves the closet on a timer. Pieces go to the wash when you say so and come back when you mark them clean

## Your stack

- **Vercel** — the Next.js app and morning cron
- **Supabase** — Postgres (`daily-fit` project) + private `closet` storage bucket
- **Twilio** — sign-in codes only (Verify)
- **Web Push** — the daily look, via VAPID keys and the service worker in `public/sw.js`
- **OpenAI** — photo catalog + outfit picks

## Local setup

```bash
cd ~/Developer/daily-fit
cp .env.example .env
```

Fill in `.env`:

1. **Supabase → Project Settings → Database** — copy the pooled connection string into `DATABASE_URL` (replace `[PASSWORD]`).
2. **Supabase → Project Settings → API** — copy `URL` and `service_role` key into `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
3. **OpenAI** — `OPENAI_API_KEY`
4. **Twilio** — account SID, auth token, and a Verify service SID
5. **Web Push** — a VAPID key pair (`npx web-push generate-vapid-keys`)

```bash
npx prisma generate
npm run dev
```

Open [http://localhost:3000/sign-in](http://localhost:3000/sign-in). Enter your phone. Twilio texts a code.

## Deploy to Vercel

```bash
git init   # if needed
git add -A && git commit -m "Daily Fit product"
vercel
```

Set the same env vars on Vercel. Set `APP_URL` to your production URL (e.g. `https://daily-fit.vercel.app`).

On iPhone, add the site to the Home Screen, open it from that icon, and allow notifications in Account.

The hourly cron at `/api/cron/morning` is already in `vercel.json`. Vercel sends `Authorization: Bearer CRON_SECRET`.

## Tests

```bash
npm test
```

Unit tests cover rotation, taste from wear, the notification text, and date math.

Schema changes: `prisma db push` hangs on Supabase's transaction pooler (port 6543). Run it against the session pooler instead, which is the same URL on port 5432 without `?pgbouncer=true`.

## Sign in

Your phone number is the account. The same closet follows you on laptop and phone once you sign in with a code.
