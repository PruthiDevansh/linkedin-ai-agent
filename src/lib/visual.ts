// The image plan the AI writes alongside each post.

export type ImageKind = "card" | "flowchart" | "photo" | "none";

export type Visual = {
  suggested: "card" | "flowchart" | "none";
  title: string;
  points: string[]; // for the card
  steps: string[]; // for the flowchart
};

export const VISUAL_INSTRUCTIONS = [
  "Also plan one image for the post, in a field called visual:",
  '"visual": {"type": "card" | "flowchart" | "none", "title": string, "points": string[], "steps": string[]}',
  "- title: the core message in at most 8 words.",
  "- points: exactly 3 key takeaways, each at most 9 words.",
  "- steps: if the post explains a process, flow or sequence, 3 to 6 steps of at most 5 words each; otherwise [].",
  '- type: "flowchart" only when steps make sense, "card" for most posts, "none" only if an image would not help.',
].join("\n");

const words = (s: string, max: number) => s.trim().split(/\s+/).slice(0, max).join(" ");

// Clean up whatever the AI returned, so the image always renders well.
export function normalizeVisual(raw: unknown, fallbackTitle: string): Visual {
  const v = (raw ?? {}) as Partial<Record<keyof Visual | "type", unknown>>;
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string" && !!s.trim()) : []);

  const title = words(typeof v.title === "string" && v.title.trim() ? v.title : fallbackTitle, 10);
  const points = list(v.points).slice(0, 3).map((p) => words(p, 12));
  const steps = list(v.steps).slice(0, 6).map((s) => words(s, 6));

  let suggested: Visual["suggested"] = v.type === "flowchart" || v.type === "none" ? v.type : "card";
  if (suggested === "flowchart" && steps.length < 3) suggested = "card";
  if (suggested === "card" && points.length === 0) suggested = "none";
  return { suggested, title, points, steps };
}

// What 🖼 Change image switches to next.
export function nextImageKind(current: ImageKind, visual?: Visual): ImageKind {
  const hasFlow = (visual?.steps.length ?? 0) >= 3;
  const hasCard = (visual?.points.length ?? 0) > 0;
  const order: ImageKind[] = ["card", ...(hasFlow ? (["flowchart"] as ImageKind[]) : []), "none"];
  if (!hasCard) order.shift();
  const i = order.indexOf(current);
  return order[(i + 1) % order.length] ?? "none";
}
