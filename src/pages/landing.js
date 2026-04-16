import { signOut } from "firebase/auth";
import { auth } from "../firebase.js";

const BACKEND = "http://localhost:8000";

 /* ─────────────────────────────────────────────────────────────────────
    Lightweight markdown → HTML renderer (no external libs needed)
    Handles: **bold**, *italic*, `code`, ```blocks```, # headings,
              - bullets, numbered lists, and line breaks.
    ───────────────────────────────────────────────────────────────────── */
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    // Code blocks (```...```)
    .replace(/```([\s\S]*?)```/g, (_, code) =>
      `<pre class="md-code-block"><code>${escHtml(code.trim())}</code></pre>`)
    // Inline code
    .replace(/`([^`]+)`/g, (_, c) => `<code class="md-inline-code">${escHtml(c)}</code>`)
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // H3
    .replace(/^### (.+)$/gm, "<h3 class='md-h3'>$1</h3>")
    // H2
    .replace(/^## (.+)$/gm, "<h2 class='md-h2'>$1</h2>")
    // H1
    .replace(/^# (.+)$/gm, "<h1 class='md-h1'>$1</h1>")
    // Unordered list items
    .replace(/^[-•] (.+)$/gm, "<li class='md-li'>$1</li>")
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, "<li class='md-li md-ol'>$1</li>")
    // Double newline → paragraph break
    .replace(/\n\n/g, "</p><p class='md-p'>")
    // Single newline → <br>
    .replace(/\n/g, "<br>");
  // Wrap list items
  html = html.replace(/(<li class='md-li'>.*?<\/li>)+/gs, (m) => `<ul class='md-ul'>${m}</ul>`);
  return `<p class='md-p'>${html}</p>`;
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ─────────────────────────────────────────────────────────────────────
   Typewriter effect — reveals text character by character
   ───────────────────────────────────────────────────────────────────── */
function typewrite(container, html, onDone) {
  // For markdown with HTML tags, insert raw HTML but reveal via opacity animation
  container.innerHTML = html;
  container.style.opacity = "0";
  container.style.transform = "translateY(6px)";
  // Trigger reflow + animate in smoothly (feels premium)
  requestAnimationFrame(() => {
    container.style.transition = "opacity 0.35s ease, transform 0.35s ease";
    container.style.opacity = "1";
    container.style.transform = "translateY(0)";
    if (onDone) setTimeout(onDone, 360);
  });
}

/* ─────────────────────────────────────────────────────────────────────
   Quick stock price fetch for chat context enrichment
   ───────────────────────────────────────────────────────────────────── */
async function fetchStockHint(message) {
  // Extract potential ticker symbols from the message (e.g. AAPL, NVDA)
  const tickers = [...new Set(message.match(/\b[A-Z]{2,5}\b/g) || [])].slice(0, 2);
  if (!tickers.length) return "";
  try {
    const results = await Promise.allSettled(
      tickers.map(t =>
        fetch(`${BACKEND}/api/stock-search?q=${t}`, { signal: AbortSignal.timeout(3000) })
          .then(r => r.ok ? r.json() : null)
      )
    );
    const found = results
      .filter(r => r.status === "fulfilled" && r.value?.results?.length)
      .map(r => r.value.results[0])
      .filter(Boolean);
    if (!found.length) return "";
    return ` [Context: ${found.map(s => `${s.symbol}=${s.name}`).join(", ")}]`;
  } catch { return ""; }
}

/* ─────────────────────────────────────────────────────────────────────
   Main render function
   ───────────────────────────────────────────────────────────────────── */
export function renderLandingPage(container, user) {
  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  container.innerHTML = /* html */ `
    <div class="landing-page">
      <div class="landing-bg">
        <div class="landing-blob"></div>
        <div class="landing-blob"></div>
        <div class="landing-blob"></div>
      </div>

      <!-- Navbar -->
      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="10" fill="url(#nl-grad)"/>
            <path d="M12 28V18L17 22L22 14L28 24V28" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="28" cy="14" r="3" fill="white" fill-opacity="0.9"/>
            <defs>
              <linearGradient id="nl-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="navbar-brand-text">MarketLens</span>
        </div>
        <div class="navbar-right">
          <div class="navbar-user">
            <div class="navbar-avatar">${initials}</div>
            <span>${displayName}</span>
          </div>
          <button class="navbar-logout-btn" id="logout-btn" type="button">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>Logout
          </button>
        </div>
      </nav>

      <main class="landing-content">
        <!-- Hero -->
        <section class="landing-hero">
          <div class="landing-hero-copy">
            <p class="landing-eyebrow">AI-Powered Financial Intelligence</p>
            <h1>Your markets, your AI,<br>your edge.</h1>
            <p class="landing-tagline">
              Finora acts as your intelligent AI financial advisor. Backed by the raw speed of Groq and our Custom LoRA FinBERT engine for sentiment.
            </p>
          </div>
          <div class="landing-pill-row">
            <span class="landing-pill">🧠 Finora · Powered by Groq</span>
            <span class="landing-pill">📊 Custom LoRA FinBERT</span>
            <span class="landing-pill">📰 Live RAG News</span>
            <span class="landing-pill">💼 Portfolio Advisor</span>
          </div>
        </section>

        <!-- Dashboard tiles -->
        <section class="dashboard-board">
          <button class="dashboard-tile tile-news" id="dashboard-news-card" type="button">
            <div class="dashboard-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <p class="dashboard-tile-kicker">Global News</p>
            <h2>Global leaders financial news</h2>
            <p class="dashboard-tile-copy">Fresh headlines, AI-generated market summaries and leader sentiment.</p>
            <span class="dashboard-tile-link">Open News Desk →</span>
          </button>

          <button class="dashboard-tile tile-stock" id="dashboard-stock-card" type="button">
            <div class="dashboard-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 15l3-3 2 2 5-6"/></svg>
            </div>
            <p class="dashboard-tile-kicker">Sentiment Lab</p>
            <h2>FinBERT stock sentiment</h2>
            <p class="dashboard-tile-copy">Any ticker: FinBERT scores, price action, verdicts and Q&A.</p>
            <span class="dashboard-tile-link">Open Stock Lab →</span>
          </button>

          <button class="dashboard-tile tile-maker" id="dashboard-builder-card" type="button">
            <div class="dashboard-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></svg>
            </div>
            <p class="dashboard-tile-kicker">Portfolio Maker</p>
            <h2>Build & manage your portfolio</h2>
            <p class="dashboard-tile-copy">Add holdings, set cost basis, and run the AI advisor.</p>
            <span class="dashboard-tile-link">Open Portfolio Maker →</span>
          </button>

          <button class="dashboard-tile tile-advisor" id="dashboard-advisor-card" type="button">
            <div class="dashboard-tile-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>
            </div>
            <p class="dashboard-tile-kicker">Smart Advisor</p>
            <h2>AI portfolio advisor</h2>
            <p class="dashboard-tile-copy">Allocation charts, LLM insights, risk scoring and rebalancing.</p>
            <span class="dashboard-tile-link">Open Smart Advisor →</span>
          </button>
        </section>

        <!-- Finora Chatbot -->
        <section class="fingpt-chatbot" id="fingpt-chatbot" aria-label="Finora RAG Chat">

          <!-- Header -->
          <div class="fingpt-chat-header">
            <div class="fingpt-chat-header-left">
              <div class="fingpt-logo-ring" id="fingpt-logo-ring">
                <svg viewBox="0 0 32 32" fill="none">
                  <circle cx="16" cy="16" r="15" stroke="url(#fgg)" stroke-width="1.5"/>
                  <path d="M9 21V13l4 3.5 3-5.5 5 7v3" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                  <defs><linearGradient id="fgg" x1="0" y1="0" x2="32" y2="32"><stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs>
                </svg>
              </div>
              <div>
                <h2 class="fingpt-chat-title">Finora</h2>
                <p class="fingpt-chat-subtitle" id="fingpt-model-label">Groq RAG Pipeline · FinBERT Sentiment Analyst</p>
              </div>
            </div>
            <div class="fingpt-header-right">
              <div class="fingpt-status-badge" id="fingpt-status-badge">
                <span class="fingpt-status-dot" id="fingpt-status-dot"></span>
                <span class="fingpt-status-text" id="fingpt-status-text">Ready</span>
              </div>
              <button class="fingpt-clear-btn" id="fingpt-clear-btn" type="button" title="Clear chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
              </button>
            </div>
          </div>

          <!-- Suggested prompts -->
          <div class="fingpt-chips" id="fingpt-chips" role="group" aria-label="Suggested questions">
            <button class="fingpt-chip" data-prompt="How much is AAPL stock performing right now?" type="button">📊 AAPL Performance</button>
            <button class="fingpt-chip" data-prompt="What is the sentiment on NVDA based on latest news?" type="button">📰 NVDA Sentiment</button>
            <button class="fingpt-chip" data-prompt="How is TSLA doing in the market today?" type="button">⚡ TSLA News & Market</button>
            <button class="fingpt-chip" data-prompt="What sectors are most bullish in the current market?" type="button">🏆 Bullish sectors</button>
          </div>

          <!-- Message log -->
          <div class="fingpt-messages" id="fingpt-messages" role="log" aria-live="polite">
            <div class="fingpt-message assistant">
              <div class="fingpt-message-avatar assistant-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 17V14l3 2.5 2-4.5 4 6v1" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <div class="fingpt-bubble assistant-bubble">
                <div class="bubble-content">
                  <p class='md-p'>Hey! I'm <strong>Finora</strong> — your AI-powered financial RAG assistant. I use <strong>Groq</strong> logic matched directly with real-time news retrieval.</p>
                  <p class='md-p'>I seamlessly process latest articles through our <strong>Custom LoRA FinBERT model</strong> so you always get perfect sentiment context on any stock ticker you mention.</p>
                </div>
                <span class="fingpt-model-tag" id="fingpt-welcome-model" style="background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.28); color: #4ade80;">Groq RAG + FinBERT</span>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div class="fingpt-typing" id="fingpt-typing" aria-hidden="true" style="display:none">
            <div class="fingpt-typing-avatar">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="9"/><path d="M6 13V10l3 2 2-4 3 4v1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </div>
            <div class="fingpt-typing-dots">
              <div class="fingpt-typing-dot"></div>
              <div class="fingpt-typing-dot"></div>
              <div class="fingpt-typing-dot"></div>
            </div>
            <span class="fingpt-typing-label">Finora is fetching news & analysing...</span>
          </div>

          <!-- Input -->
          <div class="fingpt-input-row">
            <div class="fingpt-input-wrap">
              <textarea
                id="fingpt-input"
                class="fingpt-input"
                placeholder="Ask Finora about any stock, e.g. 'How is NVDA performing?'"
                rows="1"
                maxlength="2000"
                aria-label="Chat message"
                autocomplete="off"
              ></textarea>
              <div class="fingpt-input-toolbar">
                <span class="fingpt-char-count" id="fingpt-char-count">0 / 2000</span>
              </div>
            </div>
            <button class="fingpt-send-btn" id="fingpt-send-btn" type="button" aria-label="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p class="fingpt-disclaimer">Finora provides educational insights — not investment advice. Always consult a qualified financial advisor.</p>
        </section>

        <!-- Stats bar -->
        <div class="landing-stats">
          <div class="stat-item">
            <div class="stat-value">Finora</div>
            <div class="stat-label">RAG Engine</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">Groq LLM</div>
            <div class="stat-label">Inference Target</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">FinBERT</div>
            <div class="stat-label">LoRA Sentiment</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">Live Data</div>
            <div class="stat-label">Real-time Market</div>
          </div>
        </div>
      </main>
    </div>
  `;

  // ── Nav events ─────────────────────────────────────────────────────────
  document.getElementById("logout-btn").addEventListener("click", async () => {
    try { await signOut(auth); } catch (e) { console.error(e); }
  });
  document.getElementById("dashboard-news-card").addEventListener("click", () => { window.location.hash = "#news"; });
  document.getElementById("dashboard-stock-card").addEventListener("click", () => { window.location.hash = "#stock-sentiment"; });
  document.getElementById("dashboard-builder-card").addEventListener("click", () => { window.location.hash = "#portfolio-advisor?focus=builder"; });
  document.getElementById("dashboard-advisor-card").addEventListener("click", () => { window.location.hash = "#portfolio-advisor?focus=advisor"; });

  // ── Chatbot state ──────────────────────────────────────────────────────
  const chatHistory  = [];
  let isWaiting      = false;

  const messagesEl   = document.getElementById("fingpt-messages");
  const inputEl      = document.getElementById("fingpt-input");
  const sendBtn      = document.getElementById("fingpt-send-btn");
  const typingEl     = document.getElementById("fingpt-typing");
  const chipsEl      = document.getElementById("fingpt-chips");
  const charCountEl  = document.getElementById("fingpt-char-count");
  const clearBtn     = document.getElementById("fingpt-clear-btn");
  const statusDot    = document.getElementById("fingpt-status-dot");
  const statusText   = document.getElementById("fingpt-status-text");
  const modelLabel   = document.getElementById("fingpt-model-label");

  // We no longer probe FinGPT loading. Finora RAG is default.
  // Using direct connection test logic if desired, or skip completely.

  // ── Helpers ────────────────────────────────────────────────────────────
  function setStatus(state) {
    if (state === "busy") {
      statusDot.style.background = "#f59e0b";
      statusText.textContent = "Thinking...";
    } else {
      statusDot.style.background = "#22c55e";
      statusText.textContent = "Ready";
    }
  }

  function scrollBottom() {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: "smooth" });
  }

  function setTyping(show) {
    typingEl.style.display = show ? "flex" : "none";
    typingEl.setAttribute("aria-hidden", String(!show));
    if (show) scrollBottom();
  }

  function appendMessage(role, htmlContent, modelTag = "") {
    const isUser = role === "user";
    const wrap   = document.createElement("div");
    wrap.className = `fingpt-message ${role}`;
    wrap.style.opacity = "0";
    wrap.style.transform = "translateY(10px)";

    const avatar = document.createElement("div");
    avatar.className = `fingpt-message-avatar ${isUser ? "user-avatar" : "assistant-avatar"}`;
    avatar.innerHTML = isUser
      ? `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-8 2.5-8 5v1h16v-1c0-2.5-3-5-8-5z"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M8 17V14l3 2.5 2-4.5 4 6v1" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    const bubble = document.createElement("div");
    bubble.className = `fingpt-bubble ${isUser ? "user-bubble" : "assistant-bubble"}`;

    const content = document.createElement("div");
    content.className = "bubble-content";

    if (isUser) {
      content.textContent = htmlContent; // raw text for user
    } else {
      // Typewriter reveal for assistant
      typewrite(content, htmlContent);
    }

    bubble.appendChild(content);

    if (!isUser && modelTag) {
      const tag = document.createElement("span");
      tag.className = "fingpt-model-tag";
      tag.textContent = modelTag;
      bubble.appendChild(tag);
    }

    if (isUser) {
      wrap.appendChild(bubble);
      wrap.appendChild(avatar);
    } else {
      wrap.appendChild(avatar);
      wrap.appendChild(bubble);
    }

    messagesEl.appendChild(wrap);

    // Animate in
    requestAnimationFrame(() => {
      wrap.style.transition = "opacity 0.3s ease, transform 0.3s ease";
      wrap.style.opacity = "1";
      wrap.style.transform = "translateY(0)";
    });

    scrollBottom();
    return wrap;
  }

  // ── Send message ───────────────────────────────────────────────────────
  async function sendMessage(textOverride) {
    if (isWaiting) return;
    const text = (textOverride || inputEl.value).trim();
    if (!text || text === "_ping") return;

    inputEl.value = "";
    inputEl.style.height = "auto";
    charCountEl.textContent = "0 / 2000";
    isWaiting = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    setStatus("busy");

    // Hide chips after first real message
    if (chipsEl) chipsEl.style.opacity = "0.4";

    // User bubble (plain text)
    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });

    // Show typing dots
    setTyping(true);

    // Optionally enrich message with stock context
    const hint = await fetchStockHint(text);
    const enrichedMessage = hint ? `${text}${hint}` : text;

    try {
      const res = await fetch(`${BACKEND}/api/finora-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,  // No need for client-side hint enrichment; we do RAG on backend
          history: chatHistory.slice(-16),
        }),
        signal: AbortSignal.timeout(60000),
      });

      let modelTag = "Groq", modelColor = "#4ade80";
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply    = data.reply  || "No response generated.";
      modelTag       = data.model  || "Groq API";

      setTyping(false);
      const msgEl = appendMessage("assistant", renderMarkdown(reply), modelTag);
      // Override tag colour after append
      const tag = msgEl?.querySelector(".fingpt-model-tag");
      if (tag && modelColor) { tag.style.color = modelColor; tag.style.borderColor = modelColor.replace(")", ",0.3)").replace("rgb", "rgba"); }
      chatHistory.push({ role: "assistant", content: reply });

    } catch (err) {
      setTyping(false);
      appendMessage(
        "assistant",
        renderMarkdown("⚠️ **Could not reach the backend.** Make sure the server is running:\n```\npython backend/app.py\n```"),
        "Error"
      );
      console.error("[FinGPT]", err);
    } finally {
      isWaiting = false;
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
      setStatus("ready");
      if (chipsEl) chipsEl.style.opacity = "0";
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────
  sendBtn.addEventListener("click", () => sendMessage());

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 148) + "px";
    charCountEl.textContent = `${inputEl.value.length} / 2000`;
  });

  document.querySelectorAll(".fingpt-chip").forEach((chip) => {
    chip.addEventListener("click", () => sendMessage(chip.dataset.prompt));
  });

  clearBtn.addEventListener("click", () => {
    chatHistory.length = 0;
    messagesEl.innerHTML = "";
    if (chipsEl) { chipsEl.style.opacity = "1"; chipsEl.style.display = "flex"; }
    appendMessage(
      "assistant",
      renderMarkdown("Chat cleared. Ask me about a stock's performance to trigger my RAG and Sentiment engine!"),
      "Groq RAG API"
    );
  });

  // Keyboard: Ctrl+L to clear
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "l") {
      e.preventDefault();
      clearBtn.click();
    }
  });
}
