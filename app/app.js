// Luna for the web: the same study room as the Mac and iPad app, in a browser.
// Everything is stored in this browser only (localStorage).
import { startSky, sky } from "./sky.js";
import { MODES, TOOLS, PROVIDERS, provider, loadAI, saveAI, cleanKey, detectProvider, maskKey,
  autoChain, generate, testProvider, systemPrompt, toolInstruction } from "./ai.js";

const root = document.getElementById("root");
const tutors = await fetch("tutors.json").then((r) => r.json());
const SERIES = ["Evangelion", "JoJo's Bizarre Adventure", "Other anime"];
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ------------------------------------------------------------------ state

const STORE = "luna.state";
const S = Object.assign({ name: "", tutorId: "frieren", mode: "learn", sessions: [], activeId: null,
  focus: { days: [], moonsDate: "", moons: 0 } }, read(STORE));
let AI = loadAI();
function read(k) { try { return JSON.parse(localStorage.getItem(k) || "{}"); } catch { return {}; } }
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} }
const tutor = (id = S.tutorId) => tutors.find((t) => t.id === id) || tutors[0];
const first = (t) => t.name.split(" ")[0];
const glyph = (t) => [...t.kanji.split("・")[0]][0];
const session = () => S.sessions.find((s) => s.id === S.activeId);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const ago = (ts) => { const s = (Date.now() - ts) / 1000; return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };

function setAccent() {
  const t = tutor();
  document.documentElement.style.setProperty("--accent", t.accentHex);
  document.documentElement.style.setProperty("--glow", MODES[S.mode].glow);
  sky.setAccent(t.accentHex);
}

// ------------------------------------------------------------------ bits

const portrait = (t) => `<img class="pic" src="portraits/${t.id}.jpg" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.remove()">`;
const avatar = (t, size = 28) => `<span class="avatar" style="--a:${t.accentHex};--size:${size}px">${esc(glyph(t))}${portrait(t)}</span>`;
const art = (t, style = "") => `<div class="art" style="--a:${t.accentHex};${style}"><div class="rays"></div><div class="ring"></div><span class="glyph">${esc(glyph(t))}</span>${portrait(t)}<div class="shade"></div><span class="glare"></span></div>`;
const mark = (size = 26) => `<span class="mark" style="width:${size}px;height:${size}px;border-radius:${size * 0.28}px"><i></i></span>`;
const moonPhase = (p, size = 40) => `<span class="moon-phase" style="--m:${size}px;--p:${Math.max(0, Math.min(1, p))}"></span>`;
const twinkle = (x, y, s = 14, c = "var(--moon)", d = 0) => `<span class="twinkle" style="left:${x};top:${y};--s:${s}px;--c:${c};--d:${d}s"></span>`;
function reveal(text, size, delay = 0, cls = "grad-text") {
  let i = 0;
  return `<span class="reveal ${cls}" aria-label="${esc(text.replace(/\n/g, " "))}">${text.split("\n").map((line) =>
    `<span class="line">${line.split(" ").map((w) => `<span class="w" style="--d:${(delay + i++ * 0.06).toFixed(2)}s">${esc(w)}</span>`).join(" ")}</span>`).join("")}</span>`;
}

// Markdown with LaTeX. Raw HTML from the model is shown as text, never run.
function renderMD(src) {
  if (!window.marked) return `<p>${esc(src)}</p>`;
  const math = [];
  const hold = (tex, display) => { math.push({ tex, display }); return `@@M${math.length - 1}@@`; };
  let text = src.replace(/\$\$([\s\S]+?)\$\$/g, (_, t) => hold(t, true)).replace(/\\\[([\s\S]+?)\\\]/g, (_, t) => hold(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t) => hold(t, false)).replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_, p, t) => p + hold(t, false));
  let html = marked.parse(text, { breaks: true, gfm: true });
  return html.replace(/@@M(\d+)@@/g, (_, i) => {
    const m = math[+i];
    try { return window.katex ? katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false }) : esc(m.tex); }
    catch { return esc(m.tex); }
  });
}
function setupMarked() {
  if (!window.marked || setupMarked.done) return;
  setupMarked.done = true;
  marked.use({ renderer: {
    html(token) { return esc(typeof token === "string" ? token : token.text); },
    link(href, title, text) {
      const h = typeof href === "object" ? href.href : href, t = typeof href === "object" ? href.text : text;
      return /^https?:/i.test(h || "") ? `<a href="${esc(h)}" target="_blank" rel="noopener">${t}</a>` : t;
    },
  } });
}

// ------------------------------------------------------------------ router

const routes = ["home", "tutors", "study"];
let route = "";
function go(next) { if (location.hash !== `#/${next}`) { sky.warp(); location.hash = `#/${next}`; } else render(); }
addEventListener("hashchange", render);

function render() {
  setupMarked();
  setAccent();
  let r = location.hash.replace("#/", "") || "home";
  if (!S.name) r = "welcome";
  else if (!routes.includes(r)) r = "home";
  const changed = r !== route; route = r;
  sky.intensity = r === "study" ? 0.7 : 1;
  const screen = { welcome: welcomeView, home: homeView, tutors: tutorsView, study: studyView }[r]();
  root.innerHTML = (r === "welcome" ? topbar(true) : topbar()) + `<main class="screen" ${changed ? "" : 'style="animation:none"'}>${screen}</main>`;
  placeSlider();
  after[r]?.();
  runTypewriters();
}
const after = {};

function topbar(bare = false) {
  const t = tutor();
  return `<header class="topbar">
    <button class="brand" data-go="home">${mark()}<span>Luna</span></button>
    ${bare ? "" : `<nav class="nav"><span class="slider"></span>${routes.map((n) => `<button data-go="${n}" class="${route === n ? "on" : ""}">${n[0].toUpperCase() + n.slice(1)}</button>`).join("")}</nav>`}
    <span class="spacer"></span>
    <span id="focus-chip"></span>
    ${bare ? "" : `<button class="tutor-chip glass" data-go="tutors">${avatar(t, 24)}<span style="text-align:left;font-size:12.5px">${esc(first(t))}<small>${esc(t.series)}</small></span></button>`}
    <button class="icon-btn" data-act="settings" aria-label="Settings">⚙︎</button>
  </header>`;
}
function placeSlider() {
  const nav = root.querySelector(".nav"), on = nav?.querySelector("button.on"), s = nav?.querySelector(".slider");
  if (!on || !s) { if (s) s.style.width = "0"; return; }
  s.style.left = on.offsetLeft + "px"; s.style.width = on.offsetWidth + "px";
}

// ------------------------------------------------------------------ welcome

function welcomeView() {
  const roster = [tutor("frieren"), tutor("giorno"), tutor("senku")];
  return `<div class="scroll"><div class="welcome">
    <div>
      <div class="row rise" style="--d:.1s;gap:10px"><span class="twinkle" style="position:relative;--s:10px"></span><span class="eyebrow">Luna</span><span class="faint" style="font-size:11px">月の勉強部屋</span></div>
      <h1>${reveal("A study room\nunder the moon,\nwith someone in it.", 54, 0.2)}</h1>
      <p class="muted rise" style="--d:.75s;max-width:460px;line-height:1.7;font-size:15px">Twenty-four tutors, each with their own way of explaining things. Pick the one who fits how you think, and work through a problem properly — one step at a time.</p>
      <div class="rise" style="--d:.9s;margin-top:26px">
        <div class="eyebrow" style="margin-bottom:8px">What should we call you?</div>
        <label class="field glass"><input id="name" placeholder="Your name" autocomplete="given-name" maxlength="40"><span class="faint">↩</span></label>
      </div>
      <div class="row rise" style="--d:1s;margin-top:20px"><button class="btn primary" data-act="start">Get started →</button><span class="faint" style="font-size:12px">Works right away. No account, no key.</span></div>
      <p class="faint rise" style="--d:1.1s;font-size:11.5px;margin-top:16px">🔒 Everything stays in this browser.</p>
    </div>
    <div class="collage rise" style="--d:.4s">
      ${roster.map((t, i) => `<div class="card tilt float" data-tilt style="--a:${t.accentHex};transform:rotate(${(i - 1) * 7}deg) translateX(${(i - 1) * 52}%);z-index:${i === 1 ? 2 : 1};animation-delay:${i * 0.5}s;overflow:hidden">${art(t, "--glyph:96px;height:100%")}</div>`).join("")}
      ${twinkle("88%", "4%", 18)}${twinkle("6%", "70%", 12, "var(--sakura)", 0.9)}${twinkle("20%", "2%", 9, "var(--sky)", 1.4)}
    </div>
  </div></div>`;
}
after.welcome = () => {
  const input = root.querySelector("#name");
  input?.focus();
  input?.addEventListener("keydown", (e) => { if (e.key === "Enter") act.start(); });
};

// ------------------------------------------------------------------ home

const PROMPTS = ["Quiz me on fractions", "Explain slope-intercept form", "Check my homework step by step", "Make a five-question test"];
function greeting() { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; }

function homeView() {
  const t = tutor(), recent = S.sessions.filter((s) => s.messages.length).sort((a, b) => b.updated - a.updated);
  const cont = recent[0];
  const line = cont ? `We can pick up “${cont.title}” whenever you are ready.` : t.greeting;
  return `<div class="scroll"><div class="page">
    <section class="hero">
      <div class="watermark float" aria-hidden="true">${esc(t.kanji.split("・")[0])}</div>
      <div style="position:relative">
        <div class="row rise" style="gap:9px"><span class="avatar" style="--a:${t.accentHex};--size:6px"></span><span class="eyebrow">Your tutor</span><span class="faint" style="font-size:11.5px">— ${esc(t.series)}</span></div>
        <h1>${reveal(`${greeting()},\n${S.name}.`, 52, 0.12)}</h1>
        <div class="rise" style="--d:.3s;margin-top:16px;font-weight:600;font-size:14px">${esc(t.name)} <span class="faint" style="font-weight:400;font-size:11px">${esc(t.kanji)}</span></div>
        <div class="row rise" style="--d:.38s;margin-top:24px">
          <button class="btn primary" data-act="study-tutor">Start studying →</button>
          ${cont ? `<button class="btn quiet" data-open="${cont.id}">Continue session</button>` : ""}
          <button class="btn ghost" data-go="tutors">Switch tutor</button>
        </div>
        ${cont ? `<button class="item glass tilt rise" data-tilt data-open="${cont.id}" style="--d:.46s;margin-top:18px;max-width:390px">
          <span class="avatar" style="--a:${t.accentHex};--size:28px">↪</span>
          <span style="flex:1;min-width:0"><span style="font-size:12px;font-weight:600;display:block">Pick up where you stopped</span><span class="muted" style="font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cont.title)}</span></span>
          <span class="eyebrow">${MODES[cont.mode].title}</span><span class="glare"></span></button>` : ""}
      </div>
      <div class="portrait rise" style="--d:.2s;--a:${t.accentHex}">
        <div class="glow"></div>
        <div class="tilt float" data-tilt style="position:absolute;inset:0;border-radius:22px">${art(t)}</div>
        <div class="dialogue glass"><b>${esc(first(t).toUpperCase())}</b><span data-type="${esc(line)}"></span><span class="caret">▼</span></div>
        ${twinkle("92%", "-3%", 16, "var(--moon)", 0.3)}${twinkle("4%", "12%", 10, t.accentHex, 1.1)}
      </div>
    </section>
    <section class="study-row">
      <div class="glass rise" style="--d:.42s" id="focus-card">${focusCard()}</div>
      <div class="glass week rise" style="--d:.5s">${weekCard()}</div>
    </section>
    <div class="section-title rise" style="--d:.55s"><h2>Recent topics</h2><span class="faint" style="font-size:12px">${recent.length} session${recent.length === 1 ? "" : "s"}</span></div>
    <div class="list">${recent.length ? recent.slice(0, 4).map((s, i) => { const st = tutor(s.tutorId); return `
      <button class="item glass rise" style="--d:${0.6 + i * 0.06}s" data-open="${s.id}">${avatar(st, 30)}
        <span style="flex:1;min-width:0"><span class="eyebrow" style="color:${st.accentHex}">${MODES[s.mode].title} · <span class="faint">${ago(s.updated)}</span></span>
        <span style="display:block;font-size:13.5px;font-weight:500;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title)}</span></span>
        <span class="faint" style="font-size:11px">${esc(st.name)} ↗</span></button>`; }).join("")
      : `<div class="glass item">Nothing studied yet. <button class="btn ghost" data-act="study-tutor">Start with ${esc(first(t))}</button></div>`}</div>
    <div class="section-title rise" style="--d:.7s"><h2>Quick practice</h2><span class="faint" style="font-size:12px">tap to start</span></div>
    <div class="grid2">${PROMPTS.map((p, i) => `<button class="starter glass tilt rise" data-tilt style="--d:${0.72 + i * 0.05}s" data-prompt="${esc(p)}"><span class="ico">0${i + 1}</span><span style="flex:1">${esc(p)}</span><span class="faint">↗</span><span class="glare"></span></button>`).join("")}</div>
    ${installTip()}
  </div></div>`;
}

function installTip() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return "";
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return `<div class="install-tip glass rise" style="--d:.9s;margin-top:30px">${mark(28)}<span>${ios
    ? "Add Luna to your home screen: tap <b>Share</b> → <b>Add to Home Screen</b>. It then opens full screen like an app."
    : "Install Luna as an app: use your browser's <b>Install</b> or <b>Add to Dock</b> option."}</span></div>`;
}

// ------------------------------------------------------------------ focus timer + week

const FOCUS = { focus: { m: 25, t: "Focus" }, short: { m: 5, t: "Short rest" }, long: { m: 15, t: "Long rest" } };
const F = { kind: "focus", remaining: 25 * 60, end: null, timer: null };
const fTotal = () => FOCUS[F.kind].m * 60;
const fProgress = () => Math.max(0, Math.min(1, 1 - F.remaining / fTotal()));
const fClock = () => { const s = Math.ceil(F.remaining); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
const fStarted = () => F.end || F.remaining < fTotal();
const moonsToday = () => (S.focus.moonsDate === dayKey() ? S.focus.moons : 0);

function focusCard() {
  const p = fProgress(), C = 2 * Math.PI * 60;
  return `<div class="focus">
    <div class="ring"><svg viewBox="0 0 132 132"><circle cx="66" cy="66" r="60" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="6"/>
      <circle id="f-arc" cx="66" cy="66" r="60" fill="none" stroke="url(#fg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - p)}" style="transition:stroke-dashoffset .3s linear;filter:drop-shadow(0 0 6px var(--accent))"/>
      <defs><linearGradient id="fg"><stop offset="0" stop-color="var(--accent)"/><stop offset="1" stop-color="var(--moon)"/></linearGradient></defs></svg>
      <div class="center"><span id="f-moon" style="display:grid;place-items:center">${moonPhase(F.kind === "focus" ? p : 1, 40)}</span><span class="clock" id="f-clock">${fClock()}</span><span class="eyebrow" style="font-size:8px">${FOCUS[F.kind].t}</span></div></div>
    <div style="flex:1;min-width:0">
      <div class="row" style="gap:8px"><span class="eyebrow">Focus orbit</span><span class="faint" style="font-size:10px">集中</span></div>
      <div class="serif" style="font-size:21px;margin-top:8px">${F.end ? "Stay with it." : fStarted() ? "Paused." : "One orbit, one moon."}</div>
      <div class="muted" style="font-size:12px;margin-top:6px;line-height:1.5">25 minutes of focus fills the moon. Rest, then go again.</div>
      <div class="row" style="gap:5px;margin-top:12px">${Object.entries(FOCUS).map(([k, v]) => `<button class="pill ${F.kind === k ? "on" : ""}" data-focus-kind="${k}">${v.t}</button>`).join("")}</div>
      <div class="row" style="margin-top:12px"><button class="btn primary" data-act="focus-toggle">${F.end ? "❚❚ Pause" : fStarted() ? "▶ Resume" : "▶ Start focus"}</button>
        ${fStarted() ? `<button class="btn ghost" data-act="focus-reset">Reset</button>` : ""}
        <span class="spacer" style="flex:1"></span><span class="row" style="gap:4px" title="moons today">${Array.from({ length: Math.max(4, Math.min(8, moonsToday())) }, (_, i) => moonPhase(i < moonsToday() ? 1 : 0, 11)).join("")}<span class="faint" style="font-size:10px;margin-left:3px">today</span></span></div>
    </div></div>`;
}
function focusTick() {
  if (F.end) {
    F.remaining = Math.max(0, (F.end - Date.now()) / 1000);
    if (F.remaining <= 0) focusDone();
  }
  const p = fProgress(), C = 2 * Math.PI * 60;
  root.querySelector("#f-arc")?.setAttribute("stroke-dashoffset", C * (1 - p));
  const clock = root.querySelector("#f-clock"); if (clock) clock.textContent = fClock();
  const moon = root.querySelector("#f-moon .moon-phase"); if (moon) moon.style.setProperty("--p", F.kind === "focus" ? p : 1);
  const chip = root.querySelector("#focus-chip");
  if (chip) chip.innerHTML = fStarted() ? `<button class="focus-chip" data-go="home">${moonPhase(F.kind === "focus" ? p : 1, 14)}${fClock()}${F.end ? "" : " ❚❚"}</button>` : "";
}
function focusDone() {
  clearInterval(F.timer); F.end = null;
  if (F.kind === "focus") {
    if (S.focus.moonsDate !== dayKey()) { S.focus.moonsDate = dayKey(); S.focus.moons = 0; }
    S.focus.moons++; if (!S.focus.days.includes(dayKey())) S.focus.days.push(dayKey()); save();
    toast("🌕 A full moon. Take a short rest.");
  }
  F.kind = F.kind === "focus" ? (moonsToday() % 4 === 0 ? "long" : "short") : "focus";
  F.remaining = fTotal(); sky.warp(); refreshFocus();
}
function refreshFocus() { const c = root.querySelector("#focus-card"); if (c) c.innerHTML = focusCard(); focusTick(); }

function weekCard() {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const studied = new Set(S.focus.days);
  S.sessions.forEach((s) => { if (s.messages.length) { studied.add(dayKey(new Date(s.updated))); studied.add(dayKey(new Date(s.created))); } });
  const lit = days.map((d) => studied.has(dayKey(d)));
  const hs = [0.62, 0.3, 0.52, 0.18, 0.44, 0.24, 0.48];
  const pts = days.map((_, i) => [((i + 0.5) / 7) * 100, hs[i] * 86]);
  let streak = 0; const d = new Date(); if (!studied.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (studied.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const lines = pts.slice(1).map((p, i) => lit[i] && lit[i + 1] ? `<line x1="${pts[i][0]}%" y1="${pts[i][1]}" x2="${p[0]}%" y2="${p[1]}" stroke="var(--moon)" stroke-opacity=".7" stroke-width="1.2" stroke-dasharray="200" stroke-dashoffset="200" style="animation:draw 1.4s .5s ease forwards"/>` : "").join("");
  return `<div class="row" style="justify-content:space-between"><span class="row" style="gap:8px"><span class="eyebrow">This week</span><span class="faint" style="font-size:10px">星座</span></span>
    <span style="font-size:11.5px;font-weight:500;color:${streak ? "var(--moon)" : "var(--faint)"}">${streak ? `${streak}-day streak` : "Start a streak"}</span></div>
    <div style="position:relative;height:86px;margin-top:12px">
      <svg style="position:absolute;inset:0;margin:0"><style>@keyframes draw{to{stroke-dashoffset:0}}</style>${lines}${pts.map((p, i) => lit[i] ? ""
        : `<circle cx="${p[0]}%" cy="${p[1]}" r="2" fill="rgba(255,255,255,.2)"/>`).join("")}</svg>
      ${pts.map((p, i) => lit[i] ? `<span class="twinkle" style="left:calc(${p[0]}% - ${i === 6 ? 9 : 7}px);top:${p[1] - (i === 6 ? 9 : 7)}px;--s:${i === 6 ? 18 : 14}px;--d:${i * 0.2}s"></span>` : "").join("")}
    </div>
    <div class="days">${days.map((x, i) => `<span style="${i === 6 ? "color:var(--ink)" : ""}">${"SMTWTFS"[x.getDay()]}</span>`).join("")}</div>`;
}

// ------------------------------------------------------------------ tutors

let tQuery = "", tSeries = "All", tPreview = null;
function tutorsView() {
  return `<div class="tutors">
    <div class="scroll"><div class="page" style="max-width:none;padding-top:28px">
      <div class="row rise" style="gap:10px"><span class="eyebrow">The roster</span><span class="faint" style="font-size:11px">— 24 tutors · 3 collections</span></div>
      <h1 class="serif" style="font-size:42px;margin-top:10px">${reveal("Choose your guide", 42, 0.05)}</h1>
      <p class="muted rise" style="--d:.25s;font-size:14px;margin:4px 0 0">Each tutor teaches the same material in a different voice. Hover to meet them, tap to keep one.</p>
      <div class="row rise" style="--d:.3s;margin-top:20px;gap:12px">
        <label class="search glass">⌕<input id="tq" placeholder="Search by name, kanji, or series" value="${esc(tQuery)}"></label>
        <div class="row" style="gap:4px">${["All", ...SERIES].map((s) => `<button class="pill ${tSeries === s ? "on" : ""}" data-series="${esc(s)}">${esc(s)}</button>`).join("")}</div>
      </div>
      <div class="tutor-grid" id="tgrid">${tutorGrid()}</div>
      <p class="faint" style="font-size:11px;margin-top:30px">Tutors are fan-made study companions inspired by these characters; names belong to their rights holders.</p>
    </div></div>
    <aside class="preview" id="tprev">${previewPanel()}</aside>
  </div>`;
}
function tutorGrid() {
  const q = tQuery.trim().toLowerCase();
  const list = tutors.filter((t) => (tSeries === "All" || t.series === tSeries) &&
    (!q || [t.name, t.kanji, t.series, t.personality].some((v) => v.toLowerCase().includes(q))));
  if (!list.length) return `<p class="muted">No tutor matches “${esc(tQuery)}”.</p>`;
  return list.map((t, i) => `<button class="tcard tilt rise ${S.tutorId === t.id ? "aura" : ""}" data-tilt data-tutor="${t.id}" style="--a:${t.accentHex};--accent:${t.accentHex};--d:${(0.15 + Math.min(i, 16) * 0.035).toFixed(2)}s">
    ${art(t)}<span class="meta"><b>${esc(t.name)}</b><small>${esc(t.series)}</small></span>
    <span class="foot"><span class="avatar" style="--a:${t.accentHex};--size:5px"></span>${esc(t.kanji)}${S.tutorId === t.id ? '<span style="margin-left:auto;font-weight:700;letter-spacing:.08em">CURRENT</span>' : ""}</span></button>`).join("");
}
function previewPanel() {
  const t = tutor(tPreview || S.tutorId), chosen = t.id === S.tutorId;
  return `<div class="tilt ${chosen ? "aura" : ""}" data-tilt style="border-radius:18px;position:relative;--accent:${t.accentHex}">${art(t)}</div>
    <div class="row" style="justify-content:space-between;margin-top:6px"><h2 class="serif" style="font-size:24px">${esc(t.name)}</h2><span class="faint" style="font-size:11px">${esc(t.kanji)}</span></div>
    <div class="eyebrow" style="color:${t.accentHex}">${esc(t.series)}</div>
    <p class="muted" style="font-size:13px;line-height:1.6;margin:4px 0 0">${esc(t.personality)}</p>
    <p class="serif" style="font-style:italic;font-size:14px;line-height:1.6;margin:0;opacity:.85">${esc(t.approach)}</p>
    <p class="muted" style="font-size:12px;border-top:1px solid var(--line);padding-top:12px">“${esc(t.greeting)}”</p>
    <span style="flex:1"></span>
    <button class="btn primary" data-act="choose" data-id="${t.id}" style="justify-content:space-between">${chosen ? "Start studying" : `Choose ${esc(first(t))}`}<span>→</span></button>`;
}
after.tutors = () => {
  root.querySelector("#tq")?.addEventListener("input", (e) => { tQuery = e.target.value; root.querySelector("#tgrid").innerHTML = tutorGrid(); });
  root.querySelector("#tgrid")?.addEventListener("pointerover", (e) => {
    const c = e.target.closest("[data-tutor]"); if (!c || c.dataset.tutor === tPreview) return;
    tPreview = c.dataset.tutor; root.querySelector("#tprev").innerHTML = previewPanel();
  });
};

// ------------------------------------------------------------------ study

const STARTERS = {
  learn: [["💡", "Explain photosynthesis like I'm new to it"], ["ƒ", "Walk me through solving quadratics"], ["∿", "Why does a derivative measure slope?"], ["🌍", "What caused the First World War?"]],
  practice: [["÷", "Give me three fraction problems"], ["Aa", "Quiz me on French verbs, one at a time"], ["⚗", "Practice balancing chemical equations"], ["📈", "Drill me on slope from two points"]],
  test: [["☑", "Five-question algebra test"], ["⏱", "Timed quiz on the water cycle"], ["#", "Ten mixed arithmetic questions"], ["🧬", "Test me on cell biology basics"]],
};
let streaming = null, engine = "";

function studyView() {
  const s = session(), t = tutor(), m = MODES[S.mode], has = s && s.messages.length;
  const wide = innerWidth > 1100;
  return `<div class="study ${has && wide ? "with-stage" : ""}">
    ${rail()}
    <section class="chat">
      <div class="chat-head glass rise" style="--d:.05s">
        <div class="top"><span class="seal" style="--g:${m.glow}">${m.kanji}</span>
          <div style="flex:1;min-width:0"><div class="row" style="gap:7px"><span class="eyebrow" style="color:${m.glow}">Study room</span><span class="faint" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">— ${esc(has ? s.title : "No session yet")}</span></div>
          <div class="serif" style="font-size:21px">${m.title} mode</div></div>
          <span class="faint" style="font-size:11px" id="blurb">${m.blurb}</span></div>
        ${has ? `<div class="tools">${["explain", "quiz", "check", "example", "simpler", "cards", "summarize", "plan"].map((k, i) =>
          `<button class="pill rise" style="--d:${0.05 + i * 0.03}s" data-tool="${k}">${TOOLS[k].icon} ${TOOLS[k].title}</button>`).join("")}</div>` : ""}
      </div>
      ${has ? `<div class="messages" id="msgs"><div class="inner" id="msg-inner">${s.messages.map(messageHTML).join("")}</div></div>` : landing()}
      <div class="composer-wrap">
        <div class="composer glass"><span class="seal" style="--g:${m.glow};--s:26px;margin-bottom:6px">${m.kanji}</span>
          <textarea id="draft" rows="1" placeholder="Ask ${esc(first(t))} anything…"></textarea>
          <button class="send ${streaming ? "stop" : ""}" id="send" aria-label="${streaming ? "Stop" : "Send"}">${streaming ? "■" : "↑"}</button></div>
        <div class="hint"><span><b style="color:${m.glow};letter-spacing:.1em;font-size:9px">${m.title.toUpperCase()}</b> · ${S.mode === "test" ? "No hints until you submit" : "Enter to send · Shift+Enter for a new line"}</span><span>🔒 In this browser</span></div>
      </div>
    </section>
    ${has && wide ? stagePanel() : ""}
  </div>`;
}
function rail() {
  const idx = Object.keys(MODES).indexOf(S.mode);
  return `<nav class="rail glass rise" style="position:relative">
    <span class="mark" style="width:26px;height:26px;border-radius:8px;margin-bottom:8px"><i></i></span>
    <span class="indicator" style="top:${58 + idx * 64}px;--g:${MODES[S.mode].glow}"></span>
    ${Object.entries(MODES).map(([k, v]) => `<button class="mode ${S.mode === k ? "on" : ""}" style="--g:${v.glow}" data-mode="${k}" title="${v.blurb}"><span class="k">${v.kanji}</span><span class="t">${v.title}</span></button>`).join("")}
    <span style="width:40px;height:1px;background:var(--line);margin:6px 0"></span>
    <button class="small hide-sm" data-act="history"><span>↺</span>History</button>
    <button class="small" data-act="new"><span>✎</span>New</button>
    <span style="flex:1"></span>
    <button class="small hide-sm" data-go="home"><span>⌂</span>Home</button>
  </nav>`;
}
function landing() {
  const t = tutor(), m = MODES[S.mode];
  const resume = S.sessions.filter((s) => s.messages.length).sort((a, b) => b.updated - a.updated)[0];
  return `<div class="landing"><div class="inner">
    <div class="row rise" style="gap:16px">
      <div class="float" style="position:relative">${avatar(t, 64)}${twinkle("80%", "-10%", 12, t.accentHex)}</div>
      <div style="flex:1;min-width:0"><div class="row" style="gap:7px"><span class="eyebrow">Studying with</span><span class="faint" style="font-size:10px">${esc(t.kanji)}</span></div>
      <div class="serif" style="font-size:19px">${esc(t.name)}</div><div class="muted" style="font-size:12.5px;margin-top:3px" data-type="${esc(t.greeting)}"></div></div>
    </div>
    <h1 class="serif" style="font-size:clamp(28px,4vw,38px)">${reveal("Where should we start?", 38, 0.15)}</h1>
    <div class="grid2">${STARTERS[S.mode].map(([i, p], n) => `<button class="starter glass tilt rise" data-tilt style="--d:${0.3 + n * 0.06}s;--glow:${m.glow}" data-prompt="${esc(p)}"><span class="ico">${i}</span><span style="flex:1">${esc(p)}</span><span class="faint">↗</span><span class="glare"></span></button>`).join("")}</div>
    ${resume ? `<button class="item glass rise" style="--d:.5s" data-open="${resume.id}"><span class="avatar" style="--a:${t.accentHex};--size:28px">↺</span><span style="flex:1;min-width:0"><span class="eyebrow">Resume previous session</span><span style="display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(resume.title)}</span></span><span class="faint" style="font-size:11px">${ago(resume.updated)} ›</span></button>` : ""}
  </div></div>`;
}
function messageHTML(msg, i) {
  const t = tutor(session()?.tutorId);
  if (msg.role === "user") return `<div class="msg-user rise"><div class="bubble">${esc(msg.content)}</div><div class="when">You · ${new Date(msg.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div></div>`;
  const live = streaming && streaming.index === i;
  const rated = msg.rating != null ? ratedBadge(msg.rating) : "";
  return `<div class="msg-tutor rise" data-i="${i}">
    <span class="tab">${avatar(t, 22)}${esc(t.name)} <small>${new Date(msg.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small>${live ? '<span class="dots"><i></i><i></i><i></i></span>' : ""}</span>
    <div class="card glass"><div class="prose" id="${live ? "live" : ""}">${msg.content ? renderMD(msg.content) : live ? '<div class="shimmer"><i style="width:92%"></i><i style="width:78%"></i><i style="width:55%"></i></div>' : ""}</div>
    ${!live && msg.content ? (rated || `<div class="rate">Did that land? <button class="pill" data-rate="90" data-i="${i}">✓ Got it</button><button class="pill" data-rate="60" data-i="${i}">− Almost</button><button class="pill" data-rate="30" data-i="${i}">↺ Not yet</button><span style="flex:1"></span><button class="btn ghost" style="font-size:11px" data-copy="${i}">Copy</button></div>`) : ""}</div></div>`;
}
function ratedBadge(score) {
  const [t, c] = score >= 80 ? ["✓ Got it", "var(--good)"] : score >= 50 ? ["◐ Almost", "var(--moon)"] : ["↺ Not yet — worth another pass", "var(--sakura)"];
  return `<span class="rated" style="color:${c};background:color-mix(in srgb, ${c} 12%, transparent)">${t}</span>`;
}
function stagePanel() {
  const t = tutor(), s = session(), rated = s.messages.filter((m) => m.rating != null);
  const avg = rated.length ? Math.round(rated.reduce((a, m) => a + m.rating, 0) / rated.length) + "%" : "—";
  return `<aside class="stage glass rise" style="--d:.1s">
    <div class="tilt" data-tilt style="position:relative;border-radius:18px">${art(t)}
      <div class="plate"><div class="serif" style="font-size:18px">${esc(t.name)}</div><div style="font-size:9px;opacity:.8;display:flex;gap:6px;align-items:center">${esc(t.kanji)} <span class="avatar" style="--a:${streaming ? t.accentHex : "#9fe0c0"};--size:5px"></span> ${streaming ? "Writing…" : "Listening"}</div></div></div>
    <p class="muted" style="font-size:11.5px;line-height:1.5;margin:4px 6px">${esc(t.personality)}</p>
    <div class="stats"><div class="stat glass" style="--c:var(--sky)"><b>${s.messages.length}</b><small>MESSAGES</small></div><div class="stat glass" style="--c:var(--sakura)"><b>${rated.length}</b><small>RATED</small></div><div class="stat glass" style="--c:var(--moon)"><b>${avg}</b><small>LANDED</small></div></div>
    <div class="glass" style="padding:12px;border-radius:12px"><div class="eyebrow" style="font-size:8px">In this session</div><div style="font-size:12.5px;font-weight:500;margin-top:4px">${esc(s.title)}</div>
      ${engine ? `<div class="faint" style="font-size:10px;margin-top:6px">✦ Answering via ${esc(engine)}</div>` : ""}</div>
  </aside>`;
}
after.study = () => {
  const ta = root.querySelector("#draft");
  const grow = () => { ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px"; };
  ta?.addEventListener("input", grow);
  ta?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(ta.value); } });
  root.querySelector("#send")?.addEventListener("click", () => streaming ? stop() : send(ta.value));
  scrollDown(false);
  if (pending) { const p = pending; pending = null; send(p); }
};
let pending = null;
function scrollDown(smooth = true) { const m = root.querySelector("#msgs"); if (m) m.scrollTo({ top: m.scrollHeight, behavior: smooth && !reduce() ? "smooth" : "auto" }); }

function newSession(firstText) {
  const s = { id: uid(), tutorId: S.tutorId, mode: S.mode, title: firstText ? firstText.slice(0, 80) : "New session", messages: [], created: Date.now(), updated: Date.now() };
  S.sessions.unshift(s); S.sessions = S.sessions.slice(0, 60); S.activeId = s.id; save(); return s;
}

async function send(raw, toolId) {
  const text = (raw ?? "").trim();
  if ((!text && !toolId) || streaming) return;
  let s = session();
  if (!s || (s.messages.length === 0 && s.title === "New session")) s = s && !s.messages.length ? s : newSession(text);
  if (s.title === "New session" && text) s.title = text.slice(0, 80);
  s.mode = S.mode; s.tutorId = S.tutorId;
  s.messages.push({ role: "user", content: toolId ? TOOLS[toolId].prompt : text, ts: Date.now() });
  s.messages.push({ role: "assistant", content: "", ts: Date.now() });
  s.updated = Date.now(); save();
  const t = tutor(), topic = s.title === "New session" ? null : s.title;
  const msgs = [{ role: "system", content: systemPrompt(t, S.mode, S.name, topic) }];
  if (toolId) msgs.push({ role: "system", content: toolInstruction(toolId, topic) });
  s.messages.slice(0, -1).forEach((m) => m.content && msgs.push({ role: m.role, content: m.content }));
  const controller = new AbortController();
  streaming = { index: s.messages.length - 1, controller };
  render();
  const live = s.messages[s.messages.length - 1];
  let frame = 0;
  const paint = () => { frame = 0; const el = root.querySelector("#live"); if (el) { el.innerHTML = renderMD(live.content); scrollDown(false); } };
  try {
    engine = await generate(AI, msgs, (d) => { live.content += d; if (!frame) frame = requestAnimationFrame(paint); }, controller.signal, (st) => saveAI(st));
  } catch (e) {
    if (e.name !== "AbortError") {
      if (!live.content) s.messages.pop();
      toast(e.message || "Something went wrong.", true);
    }
  }
  streaming = null; s.updated = Date.now(); save(); render();
}
function stop() { streaming?.controller.abort(); }

// ------------------------------------------------------------------ settings

let sheet = null, sel = null, check = null, editingKey = false;
function openSheet(kind) { sheet = kind; sel = AI.active; check = null; editingKey = false; drawSheet(); }
function closeSheet() { sheet = null; document.querySelector(".sheet-back")?.remove(); }
function drawSheet() {
  document.querySelector(".sheet-back")?.remove();
  if (!sheet) return;
  const el = document.createElement("div");
  el.className = "sheet-back";
  el.innerHTML = `<div class="sheet glass" role="dialog" aria-modal="true">${sheet === "history" ? historyHTML() : settingsHTML()}</div>`;
  el.addEventListener("click", (e) => { if (e.target === el) closeSheet(); });
  document.body.appendChild(el);
  el.querySelector("#key")?.addEventListener("input", (e) => {
    const d = detectProvider(e.target.value), hint = el.querySelector("#detect");
    if (hint) hint.innerHTML = d && d.id !== sel ? `<button class="pill" data-pick="${d.id}" style="color:var(--moon)">✦ This looks like a ${d.name} key — switch to ${d.name}</button>` : "";
  });
}
function historyHTML() {
  const list = S.sessions.filter((s) => s.messages.length).sort((a, b) => b.updated - a.updated);
  return `<div class="row" style="justify-content:space-between"><h2 class="serif" style="font-size:24px">Study history</h2><button class="btn quiet" data-act="close">Done</button></div>
    <div class="list" style="margin-top:16px">${list.length ? list.map((s) => { const t = tutor(s.tutorId); return `<button class="item glass" data-open="${s.id}">${avatar(t, 30)}<span style="flex:1;min-width:0"><span style="display:block;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(s.title)}</span><span class="faint" style="font-size:11px">${MODES[s.mode].title} · ${s.messages.length} messages · ${ago(s.updated)}</span></span></button>`; }).join("") : '<p class="muted">No sessions yet.</p>'}</div>`;
}
function settingsHTML() {
  const p = provider(sel), key = AI.keys[sel] || "", using = provider(AI.active);
  const chain = autoChain(AI);
  const status = check ? `<div class="status ${check.state}">${check.state === "busy" ? "◌" : check.state === "ok" ? "✓" : "⚠"} ${esc(check.text)}</div>` : "";
  let detail = "";
  if (p.special === "auto") {
    const steps = [["gemini", "Gemini"], ["groq", "Groq"], ["openrouter", "OpenRouter"], ["free", "Free cloud"]];
    detail = `<div class="glass" style="padding:12px;border-radius:12px;display:grid;gap:8px"><div class="eyebrow" style="font-size:8px">Tries in this order</div>
      ${steps.map(([id, n], i) => { const ready = id === "free" || chain.includes(id); return `<div class="row" style="justify-content:space-between;font-size:12.5px;${ready ? "" : "opacity:.55"}"><span class="row" style="gap:9px"><span class="tag">${i + 1}</span>${provider(id).icon} ${n}</span>
        ${ready ? `<span style="color:var(--good);font-size:10.5px">● ${id === "free" ? "free" : "connected"}</span>` : `<button class="pill" style="font-size:10.5px" data-pick="${id}">${id === "gemini" ? "connect with Google" : "add a key"}</button>`}</div>`; }).join("")}
      <div class="faint" style="font-size:11px">${esc(p.note)}</div></div>`;
  } else if (p.id === "free") {
    detail = `<div class="faint" style="font-size:12px">${esc(p.note)}</div>`;
  } else if (p.id === "gemini" && !key) {
    detail = `<div class="google"><div class="row" style="gap:11px"><span class="gmark"></span><div><div style="font-weight:600;font-size:13px">Connect Gemini with your Google account</div><div class="faint" style="font-size:11px">Free tier · no card · the key stays in this browser</div></div></div>
      <ol class="muted" style="font-size:12.5px;margin:0;padding-left:18px;line-height:1.8"><li>Sign in to Google AI Studio</li><li>Click “Create API key”, then copy it</li><li>Come back and tap <b>Paste key</b></li></ol>
      <div class="row"><a class="btn primary" href="${p.keyPage}" target="_blank" rel="noopener"><span class="gmark" style="width:14px;height:14px"></span> Continue with Google</a><button class="btn quiet" data-act="paste-gemini">📋 Paste key</button></div>
      <div class="input"><span>🔑</span><input id="key" placeholder="…or paste it here (AIza…)" autocomplete="off" spellcheck="false"></div></div>`;
  } else {
    detail = `<div class="row" style="justify-content:space-between"><b style="font-size:13px">API key</b>${p.keyPage ? `<a href="${p.keyPage}" target="_blank" rel="noopener" style="color:var(--sky);font-size:12px">Get a key ↗</a>` : ""}</div>
      ${key && !editingKey ? `<div class="input"><span>🔑</span><span style="flex:1;font-family:ui-monospace,Menlo,monospace;font-size:13px">${esc(maskKey(key))}</span><button class="btn ghost" data-act="replace-key">Replace</button><button class="btn ghost" data-act="remove-key">Remove</button></div>`
        : `<div class="input"><span>🔑</span><input id="key" placeholder="${p.keyPrefix ? p.keyPrefix + "…" : "API key"}" autocomplete="off" spellcheck="false"><button class="btn ghost" data-act="paste">Paste</button></div>`}
      <div id="detect"></div>
      ${p.id === "custom" ? `<div class="input"><span>🌐</span><input id="url" placeholder="https://…/v1" value="${esc(AI.urls.custom || "")}"></div>` : ""}
      <div class="faint" style="font-size:11px">${esc(p.note)}</div>`;
  }
  const modelRow = p.special ? "" : `<div class="row" style="justify-content:space-between"><b style="font-size:13px">Model</b><div class="input" style="width:min(300px,100%)"><input id="model" list="models" value="${esc(AI.models[p.id] || p.model || "")}" placeholder="model-name"><datalist id="models">${(check?.models || p.models || []).map((m) => `<option value="${esc(m)}">`).join("")}</datalist></div></div>`;
  return `<div class="row" style="justify-content:space-between"><div><h2 class="serif" style="font-size:28px">Settings</h2><div class="muted" style="font-size:12px">Saved in this browser only</div></div><button class="btn quiet" data-act="close">Done</button></div>
    <div class="glass" style="padding:16px;margin-top:18px;border-radius:16px;display:grid;gap:12px">
      <div class="row" style="justify-content:space-between"><span class="eyebrow">AI provider</span><span style="font-size:11px;color:var(--good)">● Using ${esc(using.name)}</span></div>
      <button class="auto-card ${sel === "auto" ? "on aura" : ""}" data-pick="auto" style="position:relative;--accent:var(--moon)"><span class="avatar" style="--a:#3b3570;--size:40px">✦</span><span style="flex:1"><span class="row" style="gap:7px"><b>Auto</b><span class="tag">RECOMMENDED</span></span><span class="muted" style="font-size:12px;display:block;margin-top:2px">Free, nothing to set up. Uses the best option you've connected.</span></span>${AI.active === "auto" ? '<span style="color:var(--good);font-size:11px">● In use</span>' : ""}</button>
      <div class="row" style="gap:10px"><span style="flex:1;height:1px;background:var(--line)"></span><span class="eyebrow" style="font-size:8px">Or pick one yourself</span><span style="flex:1;height:1px;background:var(--line)"></span></div>
      <div class="prov-grid">${PROVIDERS.filter((x) => !x.special).map((x) => `<button class="prov ${sel === x.id ? "on" : ""}" data-pick="${x.id}"><span class="i">${x.icon}</span>${esc(x.name)}${AI.keys[x.id] ? '<span class="dot"></span>' : ""}</button>`).join("")}</div>
      ${detail}${modelRow}
      <div class="row"><button class="btn primary" data-act="use">${AI.active === sel ? "Save" : `Use ${esc(p.name)}`}</button><button class="btn quiet" data-act="test">${check?.state === "busy" ? "Testing…" : "Test it"}</button></div>
      ${status}
    </div>
    <div class="glass" style="padding:16px;margin-top:14px;border-radius:16px;display:grid;gap:10px">
      <span class="eyebrow">You</span>
      <div class="row" style="justify-content:space-between"><b style="font-size:13px">Your name</b><div class="input" style="width:220px"><input id="sname" value="${esc(S.name)}" style="font-family:var(--sans)"></div></div>
      <div class="row" style="justify-content:space-between"><span class="muted" style="font-size:12px">${S.sessions.length} sessions in this browser</span><button class="btn ghost" data-act="reset">Reset everything</button></div>
    </div>
    <p class="faint" style="font-size:10.5px;line-height:1.6;margin-top:14px">Keys and conversations are stored only in this browser and sent only to the AI provider you pick. Luna has no server.</p>`;
}
function readSheetInputs() {
  const k = document.querySelector("#key")?.value, m = document.querySelector("#model")?.value, u = document.querySelector("#url")?.value, n = document.querySelector("#sname")?.value;
  if (k && cleanKey(k)) { AI.keys[sel] = cleanKey(k); editingKey = false; }
  if (m != null) AI.models[sel] = m.trim() || provider(sel).model;
  if (u != null) AI.urls.custom = u.trim();
  if (n != null && n.trim()) S.name = n.trim().slice(0, 40);
  saveAI(AI); save();
}
async function runTest() {
  readSheetInputs();
  check = { state: "busy", text: `Checking ${provider(sel).name}…` }; drawSheet();
  try {
    const r = await testProvider(AI, sel);
    let models = r.models;
    check = { state: "ok", text: `${r.name} works · ${r.ms} ms${models ? ` · ${models.length} models` : ""}`, models };
    if (models && models.length && !models.includes(AI.models[sel] || provider(sel).model)) {
      AI.models[sel] = (provider(sel).models || []).find((m) => models.includes(m)) || models[0]; saveAI(AI);
      check.text += ` · switched to ${AI.models[sel]}`;
    }
  } catch (e) { check = { state: "bad", text: e.message || "Test failed." }; }
  if (sheet === "settings") drawSheet();
}

// ------------------------------------------------------------------ actions

function toast(text, bad = false) {
  document.querySelector(".toast")?.remove();
  const t = document.createElement("div");
  t.className = "toast glass"; t.style.color = bad ? "var(--warn)" : "var(--ink)"; t.textContent = text;
  document.body.appendChild(t); setTimeout(() => t.remove(), bad ? 6000 : 3500);
}

const act = {
  start() { const n = root.querySelector("#name")?.value.trim(); if (!n) return root.querySelector("#name")?.focus(); S.name = n.slice(0, 40); save(); go("tutors"); },
  "study-tutor"() { const s = S.sessions.find((x) => x.tutorId === S.tutorId && x.messages.length); S.activeId = s ? s.id : null; save(); go("study"); },
  choose(el) { S.tutorId = el.dataset.id; tPreview = null; const s = S.sessions.find((x) => x.tutorId === S.tutorId && x.messages.length); S.activeId = s?.id || null; save(); go("study"); },
  settings() { openSheet("settings"); }, history() { openSheet("history"); }, close() { closeSheet(); },
  new() { if (streaming) return; S.activeId = null; save(); sky.warp(); render(); },
  "focus-toggle"() {
    if (F.end) { F.remaining = Math.max(0, (F.end - Date.now()) / 1000); F.end = null; clearInterval(F.timer); }
    else { F.end = Date.now() + F.remaining * 1000; clearInterval(F.timer); F.timer = setInterval(focusTick, 250); }
    refreshFocus();
  },
  "focus-reset"() { clearInterval(F.timer); F.end = null; F.remaining = fTotal(); refreshFocus(); },
  use() { readSheetInputs(); AI.active = sel; saveAI(AI); toast(`Luna now uses ${provider(sel).name}.`); drawSheet(); runTest(); },
  test() { runTest(); },
  async paste() { try { const t = await navigator.clipboard.readText(); const i = document.querySelector("#key"); if (i) { i.value = t; i.dispatchEvent(new Event("input")); } } catch { toast("Paste the key into the field instead.", true); } },
  async "paste-gemini"() {
    let t = ""; try { t = await navigator.clipboard.readText(); } catch {}
    t = cleanKey(t || document.querySelector("#key")?.value || "");
    if (!t.startsWith("AIza") || t.length < 30) return toast("That doesn't look like a Gemini key. They start with “AIza”.", true);
    AI.keys.gemini = t; saveAI(AI); toast(AI.active === "auto" ? "Gemini connected. Auto will use it." : "Gemini connected."); sel = "gemini"; drawSheet(); runTest();
  },
  "replace-key"() { editingKey = true; drawSheet(); document.querySelector("#key")?.focus(); },
  "remove-key"() { delete AI.keys[sel]; saveAI(AI); editingKey = true; check = null; drawSheet(); },
  reset() { if (!confirm("Delete your name, sessions, progress and saved keys from this browser?")) return; localStorage.removeItem(STORE); localStorage.removeItem("luna.ai"); location.hash = ""; location.reload(); },
};

document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go],[data-act],[data-open],[data-prompt],[data-tutor],[data-series],[data-mode],[data-tool],[data-rate],[data-copy],[data-focus-kind],[data-pick]");
  if (!el) return;
  const d = el.dataset;
  if (d.go) { closeSheet(); go(d.go); }
  else if (d.act) act[d.act]?.(el);
  else if (d.open) { S.activeId = d.open; const s = session(); if (s) { S.tutorId = s.tutorId; S.mode = s.mode; } save(); closeSheet(); go("study"); }
  else if (d.prompt) { if (route !== "study") { S.activeId = null; pending = d.prompt; save(); go("study"); } else send(d.prompt); }
  else if (d.tutor) { S.tutorId = d.tutor; tPreview = null; save(); setAccent(); root.querySelector("#tgrid").innerHTML = tutorGrid(); root.querySelector("#tprev").innerHTML = previewPanel(); }
  else if (d.series) { tSeries = d.series; root.querySelectorAll("[data-series]").forEach((b) => b.classList.toggle("on", b.dataset.series === tSeries)); root.querySelector("#tgrid").innerHTML = tutorGrid(); }
  else if (d.mode) { if (S.mode !== d.mode) { S.mode = d.mode; save(); render(); } }
  else if (d.tool) send("", d.tool);
  else if (d.rate) { const s = session(), m = s?.messages[+d.i]; if (m) { m.rating = +d.rate; save(); el.closest(".rate").outerHTML = ratedBadge(m.rating); } }
  else if (d.copy) { const m = session()?.messages[+d.copy]; if (m) navigator.clipboard?.writeText(m.content).then(() => toast("Copied.")); }
  else if (d.focusKind) { if (!F.end) { F.kind = d.focusKind; F.remaining = fTotal(); refreshFocus(); } }
  else if (d.pick) { readSheetInputs(); sel = d.pick; check = null; editingKey = !AI.keys[sel]; if (sheet !== "settings") openSheet("settings"); else drawSheet(); }
});
addEventListener("keydown", (e) => { if (e.key === "Escape" && sheet) closeSheet(); });

// Card tilt toward the pointer, with a glare that follows it.
document.addEventListener("pointermove", (e) => {
  if (reduce() || e.pointerType === "touch") return;
  const el = e.target.closest("[data-tilt]");
  document.querySelectorAll("[data-tilt].tilting").forEach((x) => { if (x !== el) { x.classList.remove("tilting"); x.style.transform = ""; } });
  if (!el) return;
  const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 - 1, y = (e.clientY - r.top) / r.height * 2 - 1;
  el.classList.add("tilting");
  el.style.transform = `perspective(700px) rotateX(${-y * 7}deg) rotateY(${x * 7}deg) scale(1.025)`;
  el.style.setProperty("--gx", `${(x + 1) * 50}%`); el.style.setProperty("--gy", `${(y + 1) * 50}%`);
}, { passive: true });

// Dialogue text types itself out.
function runTypewriters() {
  root.querySelectorAll("[data-type]").forEach((el) => {
    const text = el.dataset.type; if (reduce()) { el.textContent = text; return; }
    let i = 0; el.textContent = "";
    const step = () => { if (!el.isConnected) return; el.textContent = text.slice(0, ++i); if (i < text.length) setTimeout(step, 20); };
    setTimeout(step, 350);
  });
}

// ------------------------------------------------------------------ launch

function launch() {
  if (reduce() || sessionStorage.getItem("luna.launched")) return;
  sessionStorage.setItem("luna.launched", "1");
  const el = document.createElement("div");
  el.className = "launch";
  el.innerHTML = `<div style="display:grid;justify-items:center"><div class="emblem"><span class="impact"></span><span class="orbit a"></span><span class="orbit b"></span><span class="ripple"></span>${mark(108).replace('class="mark"', 'class="mark"')}</div>
    <h1 class="grad-text">${[..."Luna"].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("")}</h1>
    <div class="sub"><div>月の勉強部屋</div><div>STUDY UNDER THE SAME MOON</div></div></div>`;
  document.body.appendChild(el);
  sky.warp();
  const leave = () => { if (el.classList.contains("leave")) return; sky.warp(); el.classList.add("leave"); setTimeout(() => el.remove(), 750); };
  el.addEventListener("click", leave);
  setTimeout(leave, 3000);
}

// ------------------------------------------------------------------ boot

startSky(document.getElementById("sky"));
launch();
render();
addEventListener("resize", () => { placeSlider(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
