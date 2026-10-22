# LinkedIn AI Agent

An AI agent that runs my LinkedIn, with me in control.

Every morning it:

1. **Finds** trending news on .NET/backend, new AI models, AI use cases, fintech, startups and careers (tech blogs, TechCrunch, Inc42, Finextra, Hacker News points, Google Trends India).
2. **Writes** a short LinkedIn post in my voice with Google Gemini, using only facts from the source.
3. **Asks me** on Telegram: ✅ Post · ✏️ Edit · 🔄 New draft · ❌ Skip.
4. **Posts** to LinkedIn through the official API only after I tap ✅.

Built only with free tools: Next.js on Vercel, Vercel Cron, Gemini API, Telegram Bot API, LinkedIn Posts API and Upstash Redis.

## Daily topics

| Day | Topic |
|---|---|
| Mon | .NET & backend |
| Tue | New AI models: best or not? |
| Wed | What's happening in fintech |
| Thu | Real AI use cases |
| Fri | Startups & fundraising |
| Sat, Sun | Career tips |

Send `/draft fintech` (or any topic) on Telegram for an extra post any day.

Have your own idea? Send `/write` plus a line or two (or just send the idea as a message, or tap **💡 Write from my idea** on any draft). The agent turns it into an engaging post, with the same approve/edit buttons.

## Run it

- Try it on your computer: `npm install`, then `npm run preview -- ai-models`
- Full setup and free deployment: see [SETUP.md](SETUP.md)

## Change it

- Your bio and writing style: `src/lib/profile.ts`
- Topics, news sources and weekly plan: `src/lib/topics.ts`
- Post rules (length, hook, hashtags): `src/lib/writer.ts`
- Posting time: `vercel.json` (the time is in UTC; `0 3 * * *` = 8:30 AM India time)
