// Tutoring prompts, providers and the streaming client for the web version.
// Ported from Prompt.swift, Providers.swift and AIService.swift. Keys are kept
// in this browser only (localStorage) and sent only to the provider they're for.

export const MODES = {
  learn: { title: "Learn", kanji: "学", glow: "#7FD3FF", blurb: "Guided explanation, one step at a time.",
    rules: `MODE: Learn.
- Explain one step at a time, then pause for the student.
- Use a short worked example before generalising.
- After each major step, ask one checking question.` },
  practice: { title: "Practice", kanji: "練", glow: "#F6B6CF", blurb: "Questions with feedback after each try.",
    rules: `MODE: Practice.
- Give one question at a time. Do not reveal its answer in the same message.
- When the student answers, say whether it is right, explain why, then offer the next question.
- If they are stuck twice, give a smaller hint — never the answer.
- Track a running score silently: "Question 3 of 5" style.` },
  test: { title: "Test", kanji: "試", glow: "#F3E3BC", blurb: "No hints until you submit your answers.",
    rules: `MODE: Test.
- Ask questions one at a time and give no hints, no confirmation, and no corrections.
- Do not reveal whether an answer is right until the student explicitly submits the test.
- When they ask for a hint, remind them kindly that this is test mode and offer to switch modes.
- When they submit, mark each answer, give a total, and name the two weakest areas.` },
};

export const TOOLS = {
  explain: { title: "Explain", icon: "≡", prompt: "Explain this again as simply as you can.",
    instruction: "The student asked for a fresh explanation. Start from the simplest version, define every term, use one everyday analogy, then one short example. Do not repeat your previous wording." },
  quiz: { title: "Quiz me", icon: "?", prompt: "Quiz me on this.",
    instruction: "Create five questions on this topic, easiest to hardest, numbered 1–5. Do not include answers. End by telling the student to answer all five, then you will mark them." },
  check: { title: "Check work", icon: "✓", prompt: "Check my work and tell me where I went wrong.",
    instruction: "Review the student's work. Find the earliest incorrect step, quote it, explain why it breaks, and let them retry that step before continuing. Do not simply give the final answer." },
  example: { title: "Example", icon: "◇", prompt: "Show me a worked example.",
    instruction: "Give one complete worked example, step by step, labelling why each step is allowed. Then ask the student to try a similar one alone." },
  simpler: { title: "Simpler", icon: "↓", prompt: "Explain that in simpler words.",
    instruction: "Restate the last explanation at a lower level: shorter sentences, no jargon, one tiny example. Then ask a single check question." },
  cards: { title: "Flashcards", icon: "▤", prompt: "Make me flashcards for this.",
    instruction: "Produce eight flashcards as numbered Q/A pairs (Q: … / A: …) covering the key facts and one common mistake. Keep each answer to one or two lines." },
  summarize: { title: "Summarise", icon: "∑", prompt: "Summarise what we covered and what I should review.",
    instruction: "Summarise the session in five bullets: what was covered, what the student can now do, what is still shaky, one formula or definition to memorise, and the next two actions." },
  plan: { title: "Study plan", icon: "☰", prompt: "Make me a short study plan for this topic.",
    instruction: "Propose a three-session study plan for this topic. For each session give a goal, a 20-minute activity, and a short self-check. Keep it realistic for one week." },
};

export function systemPrompt(tutor, mode, studentName, topic) {
  const m = MODES[mode];
  return `You are ${tutor.name} from ${tutor.series}, acting as a study tutor inside Luna, a private study room in the student's browser.
The student's name is ${studentName}. Use it occasionally, never in every message.

YOUR TEACHING PERSONALITY
${tutor.personality}
${tutor.approach}
Write in that voice, but keep it light: personality colours the delivery, never the mathematics.

HOW YOU TEACH
- Diagnose first: in one short sentence, name what the student seems to understand and what is missing.
- One idea per step. Never bundle three new rules into one paragraph.
- Use retrieval: ask the student to recall or predict something before you tell them.
- Concrete before abstract: an example, then the general rule, then the name of the rule.
- When they are wrong, quote the exact step that broke, explain why, and let them retry it.
- Adapt the explanation instead of repeating it louder. If they are lost, change the analogy.
- Build exam technique: units, signs, showing work, checking the answer, and what markers look for.
- Praise specifically ("you isolated x correctly"), never generically.
- Never invent a formula, definition, date, or result. If unsure, say so and reason from what is known.
- Do not dump a full solution to a practice problem up front.

VOICE
- Calm, direct, and interested in the student's thinking.
- Short paragraphs. No filler, no "as an AI", no emoji.
- End every reply with exactly one concrete question or next action.

${m.rules}

OUTPUT FORMAT
- Markdown is rendered: **bold** for key terms, numbered or bulleted steps.
- Display mathematics on its own line between $$ delimiters. Inline math between $ delimiters.
- Use LaTeX: \\frac{}{} for fractions, ^{} for exponents, \\sqrt{} for roots, \\pi, \\theta, \\le, \\ge, \\ne, \\pm.
- Never wrap a whole paragraph in math delimiters.
- Aim for 120–220 words unless the student asks for depth or a plan.

CURRENT CONTEXT
Mode: ${m.title}. ${topic ? `Topic: ${topic}.` : "No topic given yet — ask what they are studying."}

Begin by meeting the student where they are. Do not introduce yourself with a paragraph about your series.`;
}

export function toolInstruction(toolId, topic) {
  const t = TOOLS[toolId];
  return `STUDY TOOL: ${t.title}.
${topic ? `Topic in focus: ${topic}.` : "Use the conversation so far."}
${t.instruction}
Follow this tool request for this reply, while keeping your teaching voice and formatting rules.`;
}

// ---------------------------------------------------------------- providers

export const PROVIDERS = [
  { id: "auto", name: "Auto", icon: "✦", note: "Nothing to set up. Uses Gemini or Groq if you've connected them, otherwise the free cloud.", special: "auto" },
  { id: "free", name: "Free cloud", icon: "☁", baseURL: "https://text.pollinations.ai/openai", model: "openai-fast", models: ["openai-fast"],
    note: "Pollinations' free service. No account; about one reply every 45 seconds." },
  { id: "gemini", name: "Gemini", icon: "◆", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.8-flash",
    models: ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"], keyPrefix: "AIza", keyPage: "https://aistudio.google.com/apikey",
    note: "Free tier with your Google account. Fast and generous." },
  { id: "groq", name: "Groq", icon: "»", baseURL: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile", "qwen/qwen3.8-27b"], keyPrefix: "gsk_", keyPage: "https://console.groq.com/keys",
    note: "Free tier, very fast." },
  { id: "openrouter", name: "OpenRouter", icon: "⋔", baseURL: "https://openrouter.ai/api/v1", model: "google/gemma-4-31b-it:free",
    models: ["google/gemma-4-31b-it:free", "openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "google/gemini-3.8-flash"],
    keyPrefix: "sk-or-", keyPage: "https://openrouter.ai/keys", note: "One key, many models. :free models cost nothing." },
  { id: "openai", name: "OpenAI", icon: "◎", baseURL: "https://api.openai.com/v1", model: "gpt-6-luna",
    models: ["gpt-6-luna", "gpt-6.1-terra", "gpt-6.1-sol"], keyPage: "https://platform.openai.com/api-keys", note: "Keys start with sk-." },
  { id: "anthropic", name: "Claude", icon: "✧", baseURL: "https://api.anthropic.com/v1", model: "claude-haiku-5-5",
    models: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"], keyPrefix: "sk-ant-", keyPage: "https://console.anthropic.com/settings/keys",
    note: "Uses Anthropic's OpenAI-compatible endpoint.", extraHeaders: { "anthropic-dangerous-direct-browser-access": "true" } },
  { id: "custom", name: "Custom", icon: "⚙", baseURL: "", model: "", models: [], note: "Any OpenAI-compatible endpoint that allows browser requests." },
];
export const provider = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

const KEY = "luna.ai";
export function loadAI() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  return { active: s.active || "auto", keys: s.keys || {}, models: s.models || {}, urls: s.urls || {} };
}
export function saveAI(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

export function cleanKey(raw) {
  let k = (raw || "").trim();
  if (k.toLowerCase().startsWith("bearer ")) k = k.slice(7);
  return k.replace(/^["'`]+|["'`]+$/g, "").replace(/\s+/g, "");
}
export const detectProvider = (key) => PROVIDERS.find((p) => p.keyPrefix && cleanKey(key).startsWith(p.keyPrefix));
export const maskKey = (k) => (k.length > 8 ? `${k.slice(0, k.startsWith("sk-") ? 6 : 4)}…${k.slice(-4)}` : "•".repeat(k.length));

function configFor(id, state) {
  const p = provider(id);
  return { p, key: state.keys[id] || "", model: state.models[id] || p.model, baseURL: state.urls[id] || p.baseURL };
}

export function autoChain(state) {
  const chain = [];
  for (const id of ["gemini", "groq", "openrouter"]) if (state.keys[id]) chain.push(id);
  chain.push("free");
  return chain;
}

// ---------------------------------------------------------------- streaming

class AIError extends Error { constructor(msg, code = 0) { super(msg); this.code = code; } }
const resting = {};
const noStream = new Set();

export function trimmed(messages, budget = 24000) {
  if (messages.length <= 3 || messages[0].role !== "system") return messages;
  const kept = []; let total = 0;
  for (const m of messages.slice(1).reverse()) {
    const cost = m.content.length + 32;
    if (total + cost > budget && kept.length) break;
    kept.unshift(m); total += cost;
  }
  return [messages[0], ...kept];
}

async function request(cfg, messages, onDelta, signal, stream) {
  const url = cfg.baseURL.replace(/\/+$/, "").replace(/\/(chat\/completions|models)$/, "") + "/chat/completions";
  const headers = { "Content-Type": "application/json", ...(cfg.p.extraHeaders || {}) };
  if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
  let res;
  try {
    res = await fetch(url, { method: "POST", headers, signal,
      body: JSON.stringify({ model: cfg.model, messages: trimmed(messages), stream, temperature: 0.45 }) });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new AIError(`Couldn't reach ${cfg.p.name}. Check your connection.`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const lower = text.toLowerCase();
    if (res.status === 401 || res.status === 403 || (res.status === 400 && lower.includes("api key")))
      throw new AIError(`${cfg.p.name} rejected the key. Open Settings and check it.`, 401);
    if (res.status === 402 && lower.includes("free_limit"))
      throw new AIError("The free cloud allows about one reply every 45 seconds. Wait a moment, or connect Gemini free with Google in Settings.", 402);
    if (res.status === 429) throw new AIError(`${cfg.p.name} is rate limiting. Try again in a moment.`, 429);
    throw new AIError(`${cfg.p.name} error ${res.status}. ${text.slice(0, 200)}`, res.status);
  }
  const type = res.headers.get("content-type") || "";
  if (!stream || type.includes("application/json")) {
    const data = await res.json().catch(() => ({}));
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new AIError("The tutor returned nothing.", -1);
    onDelta(text);
    return;
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", got = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") {
        if (!got) throw new AIError("The tutor returned nothing.", -1);
        return;
      }
      let obj; try { obj = JSON.parse(payload); } catch { continue; }
      if (obj.error) throw new AIError(obj.error.message || "Provider error");
      const c = obj.choices?.[0];
      const text = c?.delta?.content ?? c?.message?.content;
      if (text) { got = true; onDelta(text); }
    }
  }
  if (!got) throw new AIError("The tutor returned nothing.", -1);
}

async function listModels(cfg) {
  try {
    const url = cfg.baseURL.replace(/\/+$/, "") + "/models";
    const headers = { ...(cfg.p.extraHeaders || {}) };
    if (cfg.key) headers.Authorization = `Bearer ${cfg.key}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data || data.models || []).map((m) => (m.id || m.name || "").replace(/^models\//, "")).filter(Boolean);
  } catch { return null; }
}

function chooseModel(list, p) {
  const set = new Set(list);
  const s = (p.models || []).find((m) => set.has(m));
  if (s) return s;
  const bad = ["image", "vision", "embed", "tts", "audio", "whisper", "guard", "transcribe", "realtime", "moderation", "coder"];
  const usable = list.filter((id) => !bad.some((b) => id.toLowerCase().includes(b)));
  for (const w of ["flash", "luna", "haiku", "mini", "fast", "instant", "lite"]) {
    const m = usable.find((id) => id.toLowerCase().includes(w)); if (m) return m;
  }
  return usable[0] || list[0];
}

/** One turn on one provider, repairing a retired model or a no-streaming model. */
async function runOne(id, state, messages, onDelta, signal, onState) {
  let cfg = configFor(id, state);
  for (let attempt = 0; attempt < 3; attempt++) {
    let produced = false;
    const pair = `${id}|${cfg.model}`;
    try {
      await request(cfg, messages, (t) => { produced = true; onDelta(t); }, signal, !noStream.has(pair));
      return cfg.p.name;
    } catch (e) {
      if (e.name === "AbortError" || produced) throw e;
      const msg = (e.message || "").toLowerCase();
      if (!noStream.has(pair) && (msg.includes("stream") || e.code === -1)) { noStream.add(pair); continue; }
      if (e.code === 404 || ((e.code === 400 || e.code === 422) && msg.includes("model"))) {
        const list = await listModels(cfg);
        const better = list && chooseModel(list, cfg.p);
        if (better && better !== cfg.model) {
          state.models[id] = better; onState?.(state);
          cfg = { ...cfg, model: better };
          continue;
        }
      }
      throw e;
    }
  }
  throw new AIError(`${cfg.p.name} couldn't answer.`);
}

/** Runs a turn on the active provider; Auto falls through its chain. Returns the engine name. */
export async function generate(state, messages, onDelta, signal, onState) {
  if (state.active !== "auto") return runOne(state.active, state, messages, onDelta, signal, onState);
  const now = Date.now();
  const chain = autoChain(state);
  const ready = chain.filter((id) => (resting[id] || 0) <= now);
  let last;
  for (const id of ready.length ? ready : chain) {
    let produced = false;
    try {
      const name = await runOne(id, state, messages, (t) => { produced = true; onDelta(t); }, signal, onState);
      delete resting[id];
      return name;
    } catch (e) {
      if (e.name === "AbortError" || produced) throw e;
      last = e;
      resting[id] = Date.now() + (id === "free" ? 45000 : 600000);
    }
  }
  throw last || new AIError("No AI is available right now.");
}

/** Checks a provider setup with a one-word prompt. */
export async function testProvider(state, id) {
  const started = performance.now();
  let reply = "";
  const name = await (id === "auto" ? generate({ ...state, active: "auto" }, msgs(), (t) => (reply += t))
    : runOne(id, state, msgs(), (t) => (reply += t)));
  const models = id !== "auto" && id !== "free" ? await listModels(configFor(id, state)) : null;
  return { name, ms: Math.round(performance.now() - started), models };
  function msgs() { return [{ role: "system", content: "Answer with exactly one word." }, { role: "user", content: "Say OK." }]; }
}
