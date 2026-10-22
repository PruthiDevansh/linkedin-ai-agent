# Setup guide (all free)

Time needed: about 30–40 minutes, one time only.
You will create 5 free accounts/keys, put them in Vercel, and connect everything.

> Keep all keys secret. Never paste them in a post, chat or GitHub file.
> They go only in `.env.local` (your computer) and Vercel settings.

---

## Step 1: Make your secret passwords

The app needs 3 random passwords. Run this 3 times in a terminal and save each result:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

Use them for `ADMIN_SECRET`, `CRON_SECRET` and `TELEGRAM_WEBHOOK_SECRET`.

## Step 2: Gemini API key (the AI writer)

1. Open https://aistudio.google.com/apikey and log in with Google.
2. Click **Create API key** and copy it. This is `GEMINI_API_KEY`.

Free tier note: Google may use free-tier requests to improve its products. The agent only sends public news headlines, so that is fine.

**Test it now on your computer:**

1. Copy `.env.example` to a new file named `.env.local`.
2. Paste your key after `GEMINI_API_KEY=`.
3. Run:

```bash
npm run preview -- ai-models
```

You should see today's headlines and a written LinkedIn post. Nothing is posted.

## Step 3: Telegram bot (where you approve posts)

1. In Telegram, open **@BotFather** and send `/newbot`.
2. Choose a name and a username ending in `bot`.
3. Copy the token it gives you. This is `TELEGRAM_BOT_TOKEN`.
4. Leave `TELEGRAM_CHAT_ID` empty for now. The bot tells you your id in Step 7.

## Step 4: Upstash Redis (small free database)

1. Open https://console.upstash.com and sign up (GitHub login works).
2. Click **Create Database**, choose type **Redis**, pick the region closest to India (Mumbai if shown), and the **Free** plan.
3. Open the database, find the **REST API** section, and copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## Step 5: Put the code on GitHub and deploy on Vercel

1. The code lives in your GitHub repo `PruthiDevansh/linkedin-ai-agent`.
2. Open https://vercel.com and **sign up with GitHub** using your **PruthiDevansh** account. Choose the free **Hobby** plan.
3. Click **Add New → Project**, pick `linkedin-ai-agent`, and click **Import**.
4. Open **Environment Variables** and add everything you have so far:

| Name | Value |
|---|---|
| `GEMINI_API_KEY` | from Step 2 |
| `TELEGRAM_BOT_TOKEN` | from Step 3 |
| `TELEGRAM_WEBHOOK_SECRET` | from Step 1 |
| `UPSTASH_REDIS_REST_URL` | from Step 4 |
| `UPSTASH_REDIS_REST_TOKEN` | from Step 4 |
| `ADMIN_SECRET` | from Step 1 |
| `CRON_SECRET` | from Step 1 |

5. Click **Deploy**. When it finishes, copy your site address, for example `https://linkedin-ai-agent-xyz.vercel.app`. Below it is called **YOUR-APP**.

## Step 6: LinkedIn developer app (permission to post)

LinkedIn needs a **Company Page** to create an app. A free page for your personal brand is fine.

1. If you don't have a page: on LinkedIn, click **For Business → Create a Company Page**. A simple name like "Devansh Builds" works.
2. Open https://www.linkedin.com/developers/apps and click **Create app**.
   - App name: `My Post Agent`
   - LinkedIn Page: the page from step 1
   - Upload any logo and accept the terms.
3. On the **Settings** tab, click **Verify** next to the page and follow the steps.
4. On the **Products** tab, click **Request access** for both:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**
5. On the **Auth** tab:
   - Copy the **Client ID** → `LINKEDIN_CLIENT_ID`
   - Copy the **Primary Client Secret** → `LINKEDIN_CLIENT_SECRET`
   - Under **Authorized redirect URLs**, add `YOUR-APP/api/linkedin/callback`
     (example: `https://linkedin-ai-agent-xyz.vercel.app/api/linkedin/callback`)
6. In Vercel, add `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` under **Environment Variables**.

## Step 7: Connect Telegram

1. In your browser, open:
   `YOUR-APP/api/telegram/setup?key=YOUR_ADMIN_SECRET`
   You should see "Telegram bot connected".
2. In Telegram, open your bot and send `/start`. It replies with **your chat id**.
3. In Vercel, add `TELEGRAM_CHAT_ID` with that number.
4. In Vercel, go to **Deployments**, then on the latest one click **⋯ → Redeploy**. Settings only apply after a redeploy.

From now on, the bot answers **only you**.

## Step 8: Connect LinkedIn and test

1. In Telegram, send `/status`. It shows a **Connect** link. Open it and log in to LinkedIn.
2. You'll get "🔗 LinkedIn connected" in Telegram.
3. Send `/draft` to get a draft right now.
4. Tap **✏️ Edit** to change the text, **🔄 New draft** for another story, or **✅ Post to LinkedIn** to publish.

Done! 🎉 Every morning around **8:30 AM India time** you'll get a fresh draft.

---

## Good to know

- **LinkedIn login lasts about 60 days.** The bot warns you a week before; just tap the link again.
- **Check facts before posting.** Each draft shows its source link. AI can still make mistakes.
- **Cron timing:** on Vercel's free plan the daily job runs some time within the chosen hour.
- **Change the AI model:** set `GEMINI_MODEL` in Vercel, for example `gemini-flash-latest` (the default).
- **Something broke?** Errors are sent to you on Telegram. You can also look in Vercel → your project → **Logs**.

## Commands

| Command | What it does |
|---|---|
| `/draft` | Make a draft now on today's topic |
| `/draft fintech` | Make a draft on a topic: `dotnet`, `ai-models`, `ai-usecases`, `fintech`, `startups`, `career` |
| `/write your idea` | Turn your own short idea into an engaging post (or just send the idea as a message) |
| `/topics` | List topics |
| `/status` | LinkedIn connection status |
| `/help` | Help |
