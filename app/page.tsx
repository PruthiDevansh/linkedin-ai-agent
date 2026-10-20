import { CATEGORIES, CATEGORY_IDS } from "../src/lib/topics";

const steps = [
  ["Find", "Every morning it reads tech, AI, fintech and startup news, and checks what is getting attention on Hacker News and Google Trends."],
  ["Write", "Gemini picks the story most likely to get engagement and writes a short LinkedIn post in my voice, using only facts from the source."],
  ["Approve", "The draft arrives on Telegram with buttons: Post, Edit, New draft or Skip. Nothing goes out without my tap."],
  ["Post", "On approval it publishes through the official LinkedIn API and sends back the link."],
];

const stack = ["Next.js on Vercel (free)", "Vercel Cron", "Google Gemini API", "Telegram Bot API", "LinkedIn Posts API", "Upstash Redis"];

export default function Home() {
  return (
    <main className="wrap">
      <style>{css}</style>
      <p className="eyebrow">Side project by Devansh</p>
      <h1>An AI agent that runs my LinkedIn, with me in control</h1>
      <p className="lead">
        It finds what is trending today, drafts a post, and waits for my approval on Telegram before publishing.
        Built with free tools only.
      </p>

      <h2>How it works</h2>
      <ol className="steps">
        {steps.map(([title, text]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{text}</span>
          </li>
        ))}
      </ol>

      <h2>What it posts about</h2>
      <ul className="tags">
        {CATEGORY_IDS.map((id) => (
          <li key={id}>{CATEGORIES[id].label}</li>
        ))}
      </ul>

      <h2>Built with</h2>
      <ul className="tags">
        {stack.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <p className="foot">
        <a href="https://github.com/PruthiDevansh/linkedin-ai-agent">Source code on GitHub</a>
      </p>
    </main>
  );
}

const css = `
:root { --bg:#fbfbfa; --fg:#1c1c1a; --muted:#5f5f5a; --line:#e4e4df; --accent:#0a66c2; --chip:#eef3f8; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#141413; --fg:#ecece8; --muted:#a3a39c; --line:#2c2c29; --accent:#70b5f9; --chip:#1d2733; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
.wrap { max-width:44rem; margin:0 auto; padding:3.5rem 1rem 4rem; }
.eyebrow { color:var(--accent); font-weight:600; font-size:.85rem; letter-spacing:.04em; text-transform:uppercase; margin:0 0 .5rem; }
h1 { font-size:clamp(1.7rem, 5vw, 2.4rem); line-height:1.2; margin:0 0 1rem; text-wrap:balance; }
.lead { color:var(--muted); font-size:1.1rem; margin:0 0 2.5rem; }
h2 { font-size:1.05rem; margin:2.5rem 0 1rem; }
.steps { list-style:none; padding:0; margin:0; counter-reset:s; border-top:1px solid var(--line); }
.steps li { counter-increment:s; display:grid; grid-template-columns:2rem 6rem 1fr; gap:.75rem; padding:1rem 0; border-bottom:1px solid var(--line); }
.steps li::before { content:counter(s); color:var(--muted); font-variant-numeric:tabular-nums; }
.steps span { color:var(--muted); }
@media (max-width:520px) { .steps li { grid-template-columns:2rem 1fr; } .steps span { grid-column:2; } }
.tags { list-style:none; padding:0; margin:0; display:flex; flex-wrap:wrap; gap:.5rem; }
.tags li { background:var(--chip); padding:.3rem .75rem; border-radius:999px; font-size:.9rem; }
.foot { margin-top:3rem; }
a { color:var(--accent); }
`;
