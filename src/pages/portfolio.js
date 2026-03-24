import { askPortfolioQuestion, fetchPortfolioAnalysis } from "../services/portfolioApi.js";
import { renderPortfolioAdvisorNotebookPage } from "./portfolioAdvisorView.js";

const PIE_COLORS = ["#7dd3fc", "#f59e0b", "#34d399", "#c084fc"];

/**
 * Render portfolio page.
 * @param {HTMLElement} container
 * @param {import("firebase/auth").User} user
 * @param {{focus?: string}} [options]
 */
export function renderPortfolioPage(container, user, options = {}) {
  const focus = String(options?.focus || "").toLowerCase();
  if (focus === "advisor") {
    renderPortfolioAdvisorNotebookPage(container, user, options);
    return;
  }
  renderPortfolioBuilderPage(container, user, options);
}

/**
 * Render portfolio maker page.
 * @param {HTMLElement} container
 * @param {import("firebase/auth").User} user
 * @param {{focus?: string}} [options]
 */
function renderPortfolioBuilderPage(container, user, options = {}) {
  let busy = false;
  let chatBusy = false;
  let currentPayload = null;

  container.innerHTML = /* html */ `
    <div class="portfolio-page portfolio-maker-page">
      <div class="portfolio-bg">
        <div class="portfolio-bg-blob"></div>
        <div class="portfolio-bg-blob"></div>
      </div>

      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#portfolio-logo-grad)"/>
            <path d="M10 28L16 20L21 24L30 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <defs>
              <linearGradient id="portfolio-logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="navbar-brand-text">MarketLens</span>
        </div>
        <div class="navbar-right">
          <div class="navbar-user">
            <div class="navbar-avatar">${getInitials(user)}</div>
            <span>${getDisplayName(user)}</span>
          </div>
        </div>
      </nav>

      <div class="portfolio-content">
        <button class="news-back-link" id="portfolio-back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Go To Dashboard
        </button>

        <section class="stock-card portfolio-maker-toolbar">
          <div class="portfolio-toolbar-copy">
            <p class="portfolio-maker-kicker">Portfolio Maker</p>
            <h1 class="portfolio-maker-title">Build a market-informed scenario in the same MarketLens workspace.</h1>
            <p class="portfolio-maker-subtitle">
              Pull live market headlines, FinBERT sentiment, allocation guidance, projected growth, and advisor follow-up chat into one dark dashboard.
            </p>
          </div>

          <div class="portfolio-toolbar-form">
            <div class="portfolio-form-grid">
              <label class="portfolio-field">
                <span>Investment amount</span>
                <input id="portfolio-amount-input" type="number" min="1000" step="1000" value="50000" />
              </label>
              <label class="portfolio-field">
                <span>Risk level</span>
                <select id="portfolio-risk-input">
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label class="portfolio-field">
                <span>Years</span>
                <input id="portfolio-years-input" type="number" min="1" max="40" step="1" value="10" />
              </label>
              <label class="portfolio-field">
                <span>Expected return p.a.</span>
                <input id="portfolio-return-input" type="number" min="0.1" max="100" step="0.1" value="10" />
              </label>
            </div>

            <div class="portfolio-form-actions">
              <button id="portfolio-run-btn" class="stock-analyze-btn" type="button">Generate Portfolio</button>
              <button id="portfolio-open-stock-btn" class="stock-ghost-btn" type="button">Open Stock Sentiment</button>
            </div>
          </div>
        </section>

        <div class="stock-hint portfolio-maker-hint" id="portfolio-maker-hint"></div>

        <div class="portfolio-grid">
          <section class="portfolio-column portfolio-column-left">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Scenario Snapshot</p>
                  <h3 class="stock-card-title">Current Inputs</h3>
                </div>
                <span class="portfolio-panel-note">Scenario mode</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The numbers driving the generated portfolio view.</p>
              <div class="portfolio-panel-body" id="maker-snapshot-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 1</p>
                  <h3 class="stock-card-title">Market News Headlines</h3>
                </div>
                <span class="portfolio-panel-note">Top 5 headlines</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Live market context feeding the scenario.</p>
              <div class="portfolio-panel-body" id="maker-news-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 2</p>
                  <h3 class="stock-card-title">Sentiment Scores</h3>
                </div>
                <span class="portfolio-panel-note" id="maker-sentiment-model">FinBERT</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Negative, neutral, and positive market probabilities.</p>
              <div class="portfolio-panel-body" id="maker-sentiment-body"></div>
            </article>
          </section>

          <section class="portfolio-column portfolio-column-center">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 4</p>
                  <h3 class="stock-card-title">Asset Allocation</h3>
                </div>
                <span class="portfolio-panel-note">Allocation visual</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">A compact donut view that matches the rest of MarketLens.</p>
              <div class="portfolio-panel-body" id="maker-pie-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 5</p>
                  <h3 class="stock-card-title">Investment Growth</h3>
                </div>
                <span class="portfolio-panel-note">Expected return projection</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Projected value across the selected time horizon.</p>
              <div class="portfolio-panel-body" id="maker-growth-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 6</p>
                  <h3 class="stock-card-title">Portfolio Explanation Summary</h3>
                </div>
                <span class="portfolio-panel-note" id="maker-summary-model">LLM summary</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Narrative explanation of mood, risk, allocation, insight, and advice.</p>
              <div class="portfolio-panel-body" id="maker-summary-body"></div>
            </article>
          </section>

          <aside class="portfolio-column portfolio-column-right">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Step 3</p>
                  <h3 class="stock-card-title">Allocation in INR</h3>
                </div>
                <span class="portfolio-panel-note">Scenario split</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The generated amount distributed across Stocks, Bonds, Gold, and Cash.</p>
              <div class="portfolio-panel-body" id="maker-allocation-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Models In Use</p>
                  <h3 class="stock-card-title">Pipeline</h3>
                </div>
                <span class="portfolio-panel-note">Transparent stack</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The models and engines powering this scenario.</p>
              <div class="portfolio-panel-body" id="maker-models-body"></div>
            </article>

            <article class="stock-card portfolio-panel stock-chat-card portfolio-chat-card">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Advisor Chat</p>
                  <h3 class="stock-card-title">Ask Portfolio Advisor</h3>
                </div>
                <span class="portfolio-panel-note">Right-side chatbot</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Ask why the mix changed, what to adjust, or how risk affects the projection.</p>
              <div class="stock-chat-log" id="portfolio-chat-log"></div>
              <div class="stock-chat-controls">
                <input id="portfolio-chat-input" class="stock-chat-input" type="text" placeholder="Ask about this scenario..." disabled />
                <button id="portfolio-chat-send-btn" class="stock-analyze-btn" type="button" disabled>Ask</button>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  `;

  const hintEl = document.getElementById("portfolio-maker-hint");
  const amountInput = document.getElementById("portfolio-amount-input");
  const riskInput = document.getElementById("portfolio-risk-input");
  const yearsInput = document.getElementById("portfolio-years-input");
  const returnInput = document.getElementById("portfolio-return-input");
  const runBtn = document.getElementById("portfolio-run-btn");
  const openStockBtn = document.getElementById("portfolio-open-stock-btn");
  const snapshotBody = document.getElementById("maker-snapshot-body");
  const newsBody = document.getElementById("maker-news-body");
  const sentimentBody = document.getElementById("maker-sentiment-body");
  const pieBody = document.getElementById("maker-pie-body");
  const growthBody = document.getElementById("maker-growth-body");
  const summaryBody = document.getElementById("maker-summary-body");
  const allocationBody = document.getElementById("maker-allocation-body");
  const modelsBody = document.getElementById("maker-models-body");
  const sentimentModelEl = document.getElementById("maker-sentiment-model");
  const summaryModelEl = document.getElementById("maker-summary-model");
  const chatLog = document.getElementById("portfolio-chat-log");
  const chatInput = document.getElementById("portfolio-chat-input");
  const chatSendBtn = document.getElementById("portfolio-chat-send-btn");

  document.getElementById("portfolio-back-btn").addEventListener("click", () => {
    window.location.hash = "";
  });

  openStockBtn.addEventListener("click", () => {
    window.location.hash = "#stock-sentiment";
  });

  runBtn.addEventListener("click", () => {
    runAnalysis();
  });

  chatSendBtn.addEventListener("click", () => {
    sendQuestion();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendQuestion();
    }
  });

  if (String(options?.focus || "").toLowerCase() === "builder") {
    amountInput.focus();
  }

  function showHint(message, type = "info") {
    hintEl.textContent = message;
    hintEl.className = `stock-hint portfolio-maker-hint visible ${type}`;
  }

  function clearHint() {
    hintEl.textContent = "";
    hintEl.className = "stock-hint portfolio-maker-hint";
  }

  function setBusy(state) {
    busy = state;
    runBtn.disabled = state;
    runBtn.textContent = state ? "Generating..." : "Generate Portfolio";
  }

  function setChatBusy(state) {
    chatBusy = state;
    chatInput.disabled = !currentPayload;
    chatSendBtn.disabled = state || !currentPayload;
    chatSendBtn.textContent = state ? "Thinking..." : "Ask";
  }

  function readScenario() {
    const amount = Number(amountInput.value);
    const years = Number(yearsInput.value);
    const expectedReturn = Number(returnInput.value);

    return {
      holdings: [],
      amount: Number.isFinite(amount) ? Math.max(1000, amount) : 50000,
      riskLevel: String(riskInput.value || "Moderate"),
      years: Number.isFinite(years) ? Math.max(1, years) : 10,
      expectedReturn: Number.isFinite(expectedReturn) ? Math.max(0.1, expectedReturn) : 10,
    };
  }

  function addChatBubble(role, message, modelLabel = "") {
    const row = document.createElement("div");
    row.className = `stock-chat-msg ${role}`;

    const text = document.createElement("div");
    text.className = "stock-chat-text";
    text.textContent = message;
    row.appendChild(text);

    if (modelLabel) {
      const model = document.createElement("div");
      model.className = "stock-chat-model";
      model.textContent = modelLabel;
      row.appendChild(model);
    }

    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function resetChat(maker = {}) {
    chatLog.innerHTML = "";
    if (!currentPayload) {
      addChatBubble("assistant", "Generate a scenario first, then ask the advisor follow-up questions.");
      setChatBusy(false);
      return;
    }

    const inputs = maker?.inputs || readScenario();
    addChatBubble(
      "assistant",
      `Scenario ready for ${formatInr(inputs.amount)} at ${inputs.riskLevel} risk over ${inputs.years} years. Ask me what to change, why the allocation looks this way, or how the market mood affects the plan.`,
      `Model: ${maker?.summary?.model || currentPayload?.models?.advisor || "Groq"}`
    );
    setChatBusy(false);
  }

  function emptyState() {
    currentPayload = null;
    snapshotBody.innerHTML = `<p class="portfolio-empty">The current scenario inputs will appear here.</p>`;
    newsBody.innerHTML = `<p class="portfolio-empty">Generate the portfolio to load market headlines.</p>`;
    sentimentBody.innerHTML = `<p class="portfolio-empty">Sentiment probabilities will appear here.</p>`;
    pieBody.innerHTML = `<p class="portfolio-empty">Allocation visual will appear here.</p>`;
    growthBody.innerHTML = `<p class="portfolio-empty">Growth chart will appear here.</p>`;
    summaryBody.innerHTML = `<p class="portfolio-empty">The portfolio explanation will appear here.</p>`;
    allocationBody.innerHTML = `<p class="portfolio-empty">Allocation amounts in INR will appear here.</p>`;
    modelsBody.innerHTML = `<p class="portfolio-empty">Model details will appear here.</p>`;
    sentimentModelEl.textContent = "FinBERT";
    summaryModelEl.textContent = "LLM summary";
    resetChat();
  }

  function renderSnapshot(maker) {
    const inputs = maker?.inputs || readScenario();
    snapshotBody.innerHTML = `
      <div class="portfolio-snapshot-grid">
        <div class="portfolio-stat-card">
          <span>Amount</span>
          <strong>${formatInr(inputs.amount)}</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Risk</span>
          <strong>${escapeHtml(inputs.riskLevel || "Moderate")}</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Years</span>
          <strong>${Number(inputs.years || 0)}Y</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Expected Return</span>
          <strong>${Number(inputs.expectedReturn || 0).toFixed(1)}%</strong>
        </div>
      </div>
      <div class="portfolio-inline-note">
        Scenario mode lets you explore a portfolio plan before adding actual holdings.
      </div>
    `;
  }

  function renderNews(maker) {
    const headlines = Array.isArray(maker?.headlines) ? maker.headlines : [];
    if (!headlines.length) {
      newsBody.innerHTML = `<p class="portfolio-empty">No market headlines found.</p>`;
      return;
    }

    newsBody.innerHTML = headlines
      .map(
        (item) => `
          <div class="portfolio-news-row">
            <div>
              <strong>${escapeHtml(item.title || "Headline")}</strong>
              <small>${escapeHtml(item.description || "No extra description available.")}</small>
            </div>
            <span>${escapeHtml(item.source || "News")}</span>
          </div>
        `
      )
      .join("");
  }

  function renderSentiment(maker) {
    const scores = maker?.sentimentScores || {};
    const rows = [
      ["negative", Number(scores.negative || 0)],
      ["neutral", Number(scores.neutral || 0)],
      ["positive", Number(scores.positive || 0)],
    ];

    sentimentModelEl.textContent = maker?.models?.sentiment || "FinBERT";
    sentimentBody.innerHTML = rows
      .map(
        ([label, value]) => `
          <div class="portfolio-score-row">
            <div class="portfolio-score-head">
              <span>${capitalize(label)}</span>
              <strong>${value.toFixed(4)}</strong>
            </div>
            <div class="portfolio-score-track">
              <div class="portfolio-score-fill ${label}" style="width:${Math.max(8, Math.min(100, value * 100))}%"></div>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderAllocation(maker) {
    const percentages = maker?.allocation?.percentages || {};
    const amounts = maker?.allocation?.amounts || {};
    const entries = Object.keys(percentages);
    if (!entries.length) {
      allocationBody.innerHTML = `<p class="portfolio-empty">No allocation available.</p>`;
      return;
    }

    allocationBody.innerHTML = entries
      .map(
        (label) => `
          <div class="portfolio-allocation-row">
            <div>
              <strong>${escapeHtml(label)}</strong>
              <small>${formatInr(amounts[label])}</small>
            </div>
            <span>${Number(percentages[label] || 0).toFixed(1)}%</span>
          </div>
        `
      )
      .join("");
  }

  function renderPieChart(maker) {
    const percentages = maker?.allocation?.percentages || {};
    const entries = Object.entries(percentages);
    if (!entries.length) {
      pieBody.innerHTML = `<p class="portfolio-empty">No allocation visual available.</p>`;
      return;
    }

    let offset = 0;
    const gradient = entries
      .map(([_, value], index) => {
        const start = offset;
        offset += Number(value || 0);
        return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${offset}%`;
      })
      .join(", ");

    pieBody.innerHTML = `
      <div class="portfolio-pie-wrap">
        <div class="portfolio-pie-chart" style="background: conic-gradient(${gradient})">
          <div class="portfolio-pie-hole">
            <strong>${escapeHtml(maker?.inputs?.riskLevel || "Moderate")}</strong>
            <span>Risk</span>
          </div>
        </div>

        <div class="portfolio-pie-legend">
          ${entries
            .map(
              ([label, value], index) => `
                <div class="portfolio-legend-row">
                  <span class="portfolio-legend-dot" style="background:${PIE_COLORS[index % PIE_COLORS.length]}"></span>
                  <span>${escapeHtml(label)}</span>
                  <strong>${Number(value || 0).toFixed(1)}%</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderGrowthChart(maker) {
    const series = Array.isArray(maker?.growth?.series) ? maker.growth.series : [];
    if (series.length < 2) {
      growthBody.innerHTML = `<p class="portfolio-empty">No growth chart available.</p>`;
      return;
    }

    growthBody.innerHTML = buildGrowthSvg(series, maker?.growth?.finalValue || 0);
  }

  function renderSummary(maker) {
    const summary = maker?.summary || {};
    const percentages = maker?.allocation?.percentages || {};
    const allocationText = Object.entries(percentages)
      .map(([label, value]) => `${label}: ${Number(value || 0).toFixed(1)}%`)
      .join(", ");

    summaryModelEl.textContent = summary.model || maker?.models?.llm || "Fallback";
    summaryBody.innerHTML = `
      <div class="portfolio-summary-card">
        <div class="portfolio-summary-row">
          <strong>Market Sentiment</strong>
          <span>${capitalize(summary.marketMood || maker?.sentimentScores?.marketMood || "neutral")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Risk Level</strong>
          <span>${escapeHtml(maker?.inputs?.riskLevel || "Moderate")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Allocation</strong>
          <span>${escapeHtml(allocationText || "-")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Insight</strong>
          <span>${escapeHtml(summary.insight || "No insight generated.")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Advice</strong>
          <span>${escapeHtml(summary.advice || "No advice generated.")}</span>
        </div>
      </div>
      <p class="portfolio-summary-text">${escapeHtml(summary.summaryText || "No summary generated.")}</p>
    `;
  }

  function renderModels(maker, payload) {
    modelsBody.innerHTML = `
      <div class="portfolio-model-row">
        <strong>Sentiment</strong>
        <span>${escapeHtml(maker?.models?.sentiment || payload?.models?.sentiment || "FinBERT")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>LLM Summary</strong>
        <span>${escapeHtml(maker?.summary?.model || maker?.models?.llm || payload?.models?.advisor || "Fallback")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>Advisor Chat</strong>
        <span>${escapeHtml(payload?.models?.advisor || maker?.models?.llm || "Groq")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>Projection</strong>
        <span>${escapeHtml(payload?.models?.projection || "Expected Return Projection")}</span>
      </div>
    `;
  }

  function populate(payload) {
    currentPayload = payload;
    const maker = payload?.maker || {};
    renderSnapshot(maker);
    renderNews(maker);
    renderSentiment(maker);
    renderAllocation(maker);
    renderPieChart(maker);
    renderGrowthChart(maker);
    renderSummary(maker);
    renderModels(maker, payload);
    resetChat(maker);
    showHint("Portfolio scenario generated. The advisor chat is ready on the right.", "success");
  }

  async function runAnalysis() {
    if (busy) return;
    clearHint();
    setBusy(true);
    setChatBusy(true);
    currentPayload = null;
    try {
      const payload = await fetchPortfolioAnalysis(readScenario());
      populate(payload);
    } catch (error) {
      currentPayload = null;
      resetChat();
      showHint(`Failed to generate portfolio: ${error.message}`, "error");
    } finally {
      setBusy(false);
      setChatBusy(false);
    }
  }

  async function sendQuestion() {
    if (chatBusy) return;
    if (!currentPayload) {
      showHint("Generate a portfolio scenario before asking questions.", "info");
      return;
    }

    const question = String(chatInput.value || "").trim();
    if (!question) return;

    chatInput.value = "";
    addChatBubble("user", question);
    setChatBusy(true);

    try {
      const response = await askPortfolioQuestion({
        holdings: currentPayload?.positions || [],
        question,
        analysis: currentPayload,
      });
      addChatBubble("assistant", response.answer || "No response.", `Model: ${response.model || currentPayload?.models?.advisor || "Groq"}`);
    } catch (error) {
      addChatBubble("assistant", `Error: ${error.message}`);
    } finally {
      setChatBusy(false);
    }
  }

  emptyState();
  runAnalysis();
}

function renderPortfolioAdvisorPage(container, user, options = {}) {
  let busy = false;
  let chatBusy = false;
  let currentPayload = null;

  container.innerHTML = /* html */ `
    <div class="portfolio-page portfolio-advisor-page">
      <div class="portfolio-bg">
        <div class="portfolio-bg-blob"></div>
        <div class="portfolio-bg-blob"></div>
      </div>

      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#portfolio-advisor-logo-grad)"/>
            <path d="M10 28L16 20L21 24L30 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <defs>
              <linearGradient id="portfolio-advisor-logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="navbar-brand-text">MarketLens</span>
        </div>
        <div class="navbar-right">
          <div class="navbar-user">
            <div class="navbar-avatar">${getInitials(user)}</div>
            <span>${getDisplayName(user)}</span>
          </div>
        </div>
      </nav>

      <div class="portfolio-content">
        <button class="news-back-link" id="portfolio-advisor-back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Go To Dashboard
        </button>

        <section class="stock-card portfolio-maker-toolbar portfolio-advisor-toolbar">
          <div class="portfolio-toolbar-copy">
            <p class="portfolio-maker-kicker">Smart Portfolio Advisor</p>
            <h1 class="portfolio-maker-title">Keep the advisor summary, charts, and right-side copilot in focus.</h1>
            <p class="portfolio-maker-subtitle">
              This route stays on the advisor experience: AI explanation, summary visuals, notebook takeaways, and the portfolio chat panel on the right.
            </p>
          </div>

          <div class="portfolio-toolbar-form">
            <div class="portfolio-form-grid">
              <label class="portfolio-field">
                <span>Investment amount</span>
                <input id="advisor-amount-input" type="number" min="1000" step="1000" value="50000" />
              </label>
              <label class="portfolio-field">
                <span>Risk level</span>
                <select id="advisor-risk-input">
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                  <option value="Low">Low</option>
                </select>
              </label>
              <label class="portfolio-field">
                <span>Years</span>
                <input id="advisor-years-input" type="number" min="1" max="40" step="1" value="10" />
              </label>
              <label class="portfolio-field">
                <span>Expected return p.a.</span>
                <input id="advisor-return-input" type="number" min="0.1" max="100" step="0.1" value="10" />
              </label>
            </div>

            <div class="portfolio-form-actions">
              <button id="portfolio-advisor-run-btn" class="stock-analyze-btn" type="button">Refresh Advisor</button>
              <button id="portfolio-open-builder-btn" class="stock-ghost-btn" type="button">Open Portfolio Maker</button>
            </div>
          </div>
        </section>

        <div class="stock-hint portfolio-maker-hint" id="portfolio-advisor-hint"></div>

        <div class="portfolio-grid portfolio-advisor-grid">
          <section class="portfolio-column portfolio-column-left">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Advisor Summary</p>
                  <h3 class="stock-card-title">LLM Guidance</h3>
                </div>
                <span class="portfolio-panel-note" id="advisor-summary-model">LLM summary</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The restored advisor-first view keeps the explanation at the top.</p>
              <div class="portfolio-panel-body" id="advisor-summary-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Sentiment Snapshot</p>
                  <h3 class="stock-card-title">Market Mood</h3>
                </div>
                <span class="portfolio-panel-note" id="advisor-sentiment-model">FinBERT</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">FinBERT scores used for the allocation and narrative guidance.</p>
              <div class="portfolio-panel-body" id="advisor-sentiment-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Notebook Snapshot</p>
                  <h3 class="stock-card-title">Key Takeaways</h3>
                </div>
                <span class="portfolio-panel-note">Summary notes</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Compact notebook-style takeaways without switching back to the builder.</p>
              <div class="portfolio-panel-body" id="advisor-notes-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Models In Use</p>
                  <h3 class="stock-card-title">Pipeline</h3>
                </div>
                <span class="portfolio-panel-note">Transparent stack</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The engines currently powering the advisor output.</p>
              <div class="portfolio-panel-body" id="advisor-models-body"></div>
            </article>
          </section>

          <section class="portfolio-column portfolio-column-center">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Summary Visual</p>
                  <h3 class="stock-card-title">Allocation Outlook</h3>
                </div>
                <span class="portfolio-panel-note">Donut chart</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The advisor allocation view that was previously in this route.</p>
              <div class="portfolio-panel-body" id="advisor-pie-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Summary Visual</p>
                  <h3 class="stock-card-title">Decision Mix</h3>
                </div>
                <span class="portfolio-panel-note">Advisor actions</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Buy / hold / sell counts show up here when analyzing saved holdings.</p>
              <div class="portfolio-panel-body" id="advisor-decision-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Summary Visual</p>
                  <h3 class="stock-card-title">Investment Growth</h3>
                </div>
                <span class="portfolio-panel-note">Projection chart</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Projected portfolio value across the selected horizon.</p>
              <div class="portfolio-panel-body" id="advisor-growth-body"></div>
            </article>
          </section>

          <aside class="portfolio-column portfolio-column-right">
            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Scenario Snapshot</p>
                  <h3 class="stock-card-title">Inputs And Allocation</h3>
                </div>
                <span class="portfolio-panel-note">Current scenario</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Your amount, risk, years, return, and generated INR split.</p>
              <div class="portfolio-panel-body" id="advisor-snapshot-body"></div>
            </article>

            <article class="stock-card portfolio-panel">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Market Context</p>
                  <h3 class="stock-card-title">Headlines</h3>
                </div>
                <span class="portfolio-panel-note">Top 5 headlines</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">The news context behind the current recommendation.</p>
              <div class="portfolio-panel-body" id="advisor-news-body"></div>
            </article>

            <article class="stock-card portfolio-panel stock-chat-card portfolio-chat-card">
              <div class="portfolio-panel-head">
                <div>
                  <p class="portfolio-panel-kicker">Right-Side Copilot</p>
                  <h3 class="stock-card-title">Ask Portfolio Advisor</h3>
                </div>
                <span class="portfolio-panel-note">Chatbot</span>
              </div>
              <p class="stock-muted-text portfolio-panel-helper">Ask follow-up questions about risk, allocation, or what to change next.</p>
              <div class="stock-chat-log" id="advisor-chat-log"></div>
              <div class="stock-chat-controls">
                <input id="advisor-chat-input" class="stock-chat-input" type="text" placeholder="Ask about this portfolio..." disabled />
                <button id="advisor-chat-send-btn" class="stock-analyze-btn" type="button" disabled>Ask</button>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  `;

  const hintEl = document.getElementById("portfolio-advisor-hint");
  const amountInput = document.getElementById("advisor-amount-input");
  const riskInput = document.getElementById("advisor-risk-input");
  const yearsInput = document.getElementById("advisor-years-input");
  const returnInput = document.getElementById("advisor-return-input");
  const runBtn = document.getElementById("portfolio-advisor-run-btn");
  const summaryBody = document.getElementById("advisor-summary-body");
  const summaryModelEl = document.getElementById("advisor-summary-model");
  const sentimentBody = document.getElementById("advisor-sentiment-body");
  const sentimentModelEl = document.getElementById("advisor-sentiment-model");
  const notesBody = document.getElementById("advisor-notes-body");
  const modelsBody = document.getElementById("advisor-models-body");
  const pieBody = document.getElementById("advisor-pie-body");
  const decisionBody = document.getElementById("advisor-decision-body");
  const growthBody = document.getElementById("advisor-growth-body");
  const snapshotBody = document.getElementById("advisor-snapshot-body");
  const newsBody = document.getElementById("advisor-news-body");
  const chatLog = document.getElementById("advisor-chat-log");
  const chatInput = document.getElementById("advisor-chat-input");
  const chatSendBtn = document.getElementById("advisor-chat-send-btn");

  document.getElementById("portfolio-advisor-back-btn").addEventListener("click", () => {
    window.location.hash = "";
  });

  document.getElementById("portfolio-open-builder-btn").addEventListener("click", () => {
    window.location.hash = "#portfolio-advisor?focus=builder";
  });

  runBtn.addEventListener("click", () => {
    runAnalysis();
  });

  chatSendBtn.addEventListener("click", () => {
    sendQuestion();
  });

  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendQuestion();
    }
  });

  if (String(options?.focus || "").toLowerCase() === "advisor") {
    amountInput.focus();
  }

  function showHint(message, type = "info") {
    hintEl.textContent = message;
    hintEl.className = `stock-hint portfolio-maker-hint visible ${type}`;
  }

  function clearHint() {
    hintEl.textContent = "";
    hintEl.className = "stock-hint portfolio-maker-hint";
  }

  function setBusy(state) {
    busy = state;
    runBtn.disabled = state;
    runBtn.textContent = state ? "Refreshing..." : "Refresh Advisor";
  }

  function setChatBusy(state) {
    chatBusy = state;
    chatInput.disabled = !currentPayload;
    chatSendBtn.disabled = state || !currentPayload;
    chatSendBtn.textContent = state ? "Thinking..." : "Ask";
  }

  function readScenario() {
    const amount = Number(amountInput.value);
    const years = Number(yearsInput.value);
    const expectedReturn = Number(returnInput.value);

    return {
      holdings: [],
      amount: Number.isFinite(amount) ? Math.max(1000, amount) : 50000,
      riskLevel: String(riskInput.value || "Moderate"),
      years: Number.isFinite(years) ? Math.max(1, years) : 10,
      expectedReturn: Number.isFinite(expectedReturn) ? Math.max(0.1, expectedReturn) : 10,
    };
  }

  function addChatBubble(role, message, modelLabel = "") {
    const row = document.createElement("div");
    row.className = `stock-chat-msg ${role}`;

    const text = document.createElement("div");
    text.className = "stock-chat-text";
    text.textContent = message;
    row.appendChild(text);

    if (modelLabel) {
      const model = document.createElement("div");
      model.className = "stock-chat-model";
      model.textContent = modelLabel;
      row.appendChild(model);
    }

    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function resetChat(maker = {}) {
    chatLog.innerHTML = "";
    if (!currentPayload) {
      addChatBubble("assistant", "The advisor chat becomes active as soon as this route has a scenario to review.");
      setChatBusy(false);
      return;
    }

    const inputs = maker?.inputs || readScenario();
    addChatBubble(
      "assistant",
      `Advisor ready for ${formatInr(inputs.amount)} with ${inputs.riskLevel} risk over ${inputs.years} years. Ask why the summary looks this way or what you should adjust next.`,
      `Model: ${maker?.summary?.model || currentPayload?.models?.advisor || "Groq"}`
    );
    setChatBusy(false);
  }

  function emptyState() {
    currentPayload = null;
    summaryBody.innerHTML = `<p class="portfolio-empty">Advisor guidance will appear here.</p>`;
    sentimentBody.innerHTML = `<p class="portfolio-empty">Sentiment scores will appear here.</p>`;
    notesBody.innerHTML = `<p class="portfolio-empty">Notebook takeaways will appear here.</p>`;
    modelsBody.innerHTML = `<p class="portfolio-empty">Model details will appear here.</p>`;
    pieBody.innerHTML = `<p class="portfolio-empty">Allocation chart will appear here.</p>`;
    decisionBody.innerHTML = `<p class="portfolio-empty">Decision mix will appear here.</p>`;
    growthBody.innerHTML = `<p class="portfolio-empty">Growth projection will appear here.</p>`;
    snapshotBody.innerHTML = `<p class="portfolio-empty">Scenario details will appear here.</p>`;
    newsBody.innerHTML = `<p class="portfolio-empty">Headlines will appear here.</p>`;
    sentimentModelEl.textContent = "FinBERT";
    summaryModelEl.textContent = "LLM summary";
    resetChat();
  }

  function renderSummary(maker, payload) {
    const summary = maker?.summary || {};
    const portfolioSummary = payload?.summary || {};
    const marketMood = summary.marketMood || maker?.sentimentScores?.marketMood || "neutral";
    summaryModelEl.textContent = summary.model || maker?.models?.llm || payload?.models?.advisor || "Fallback";
    summaryBody.innerHTML = `
      <div class="portfolio-summary-card">
        <div class="portfolio-summary-row">
          <strong>Market Sentiment</strong>
          <span>${capitalize(marketMood)}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Risk Level</strong>
          <span>${escapeHtml(maker?.inputs?.riskLevel || "Moderate")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Portfolio Score</strong>
          <span>${Number(portfolioSummary.portfolioScore || 0) || "-"}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Top Risk</strong>
          <span>${escapeHtml(portfolioSummary.topRisk || "No risk note available.")}</span>
        </div>
        <div class="portfolio-summary-row">
          <strong>Opportunity</strong>
          <span>${escapeHtml(portfolioSummary.topOpportunity || summary.advice || "No opportunity note available.")}</span>
        </div>
      </div>
      <p class="portfolio-summary-text">${escapeHtml(summary.summaryText || portfolioSummary.portfolioSummary || "No summary generated.")}</p>
    `;
  }

  function renderSentiment(maker) {
    const scores = maker?.sentimentScores || {};
    const rows = [
      ["negative", Number(scores.negative || 0)],
      ["neutral", Number(scores.neutral || 0)],
      ["positive", Number(scores.positive || 0)],
    ];

    sentimentModelEl.textContent = maker?.models?.sentiment || "FinBERT";
    sentimentBody.innerHTML = rows
      .map(
        ([label, value]) => `
          <div class="portfolio-score-row">
            <div class="portfolio-score-head">
              <span>${capitalize(label)}</span>
              <strong>${value.toFixed(4)}</strong>
            </div>
            <div class="portfolio-score-track">
              <div class="portfolio-score-fill ${label}" style="width:${Math.max(8, Math.min(100, value * 100))}%"></div>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderNotes(maker) {
    const summary = maker?.summary || {};
    const headlines = Array.isArray(maker?.headlines) ? maker.headlines.slice(0, 3) : [];

    notesBody.innerHTML = `
      <div class="portfolio-inline-note">
        ${escapeHtml(summary.insight || "The advisor insight will appear here after analysis runs.")}
      </div>
      <div class="portfolio-inline-note">
        ${escapeHtml(summary.advice || "The advisor advice will appear here after analysis runs.")}
      </div>
      ${headlines
        .map(
          (item) => `
            <div class="portfolio-news-row portfolio-note-row">
              <div>
                <strong>${escapeHtml(item.title || "Headline")}</strong>
                <small>${escapeHtml(item.source || "News")}</small>
              </div>
            </div>
          `
        )
        .join("")}
    `;
  }

  function renderModels(maker, payload) {
    modelsBody.innerHTML = `
      <div class="portfolio-model-row">
        <strong>Sentiment</strong>
        <span>${escapeHtml(maker?.models?.sentiment || payload?.models?.sentiment || "FinBERT")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>LLM Summary</strong>
        <span>${escapeHtml(maker?.summary?.model || maker?.models?.llm || payload?.models?.advisor || "Fallback")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>Advisor Chat</strong>
        <span>${escapeHtml(payload?.models?.advisor || maker?.models?.llm || "Groq")}</span>
      </div>
      <div class="portfolio-model-row">
        <strong>Projection</strong>
        <span>${escapeHtml(payload?.models?.projection || "Expected Return Projection")}</span>
      </div>
    `;
  }

  function renderPieChart(maker) {
    const percentages = maker?.allocation?.percentages || {};
    const entries = Object.entries(percentages);
    if (!entries.length) {
      pieBody.innerHTML = `<p class="portfolio-empty">No allocation visual available.</p>`;
      return;
    }

    let offset = 0;
    const gradient = entries
      .map(([_, value], index) => {
        const start = offset;
        offset += Number(value || 0);
        return `${PIE_COLORS[index % PIE_COLORS.length]} ${start}% ${offset}%`;
      })
      .join(", ");

    pieBody.innerHTML = `
      <div class="portfolio-pie-wrap">
        <div class="portfolio-pie-chart" style="background: conic-gradient(${gradient})">
          <div class="portfolio-pie-hole">
            <strong>${escapeHtml(maker?.inputs?.riskLevel || "Moderate")}</strong>
            <span>Risk</span>
          </div>
        </div>

        <div class="portfolio-pie-legend">
          ${entries
            .map(
              ([label, value], index) => `
                <div class="portfolio-legend-row">
                  <span class="portfolio-legend-dot" style="background:${PIE_COLORS[index % PIE_COLORS.length]}"></span>
                  <span>${escapeHtml(label)}</span>
                  <strong>${Number(value || 0).toFixed(1)}%</strong>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderDecisionMix(payload) {
    const counts = payload?.summary?.decisionCounts || {};
    const rows = [
      ["Buy More", Number(counts.BuyMore || 0), "buy"],
      ["Hold", Number(counts.Hold || 0), "hold"],
      ["Sell", Number(counts.Sell || 0), "sell"],
    ];
    const total = rows.reduce((sum, [, value]) => sum + value, 0);

    decisionBody.innerHTML = `
      <div class="portfolio-decision-stack">
        ${rows
          .map(([label, value, tone]) => {
            const width = total > 0 ? (value / total) * 100 : 0;
            return `
              <div class="portfolio-decision-row">
                <div class="portfolio-decision-head">
                  <span>${label}</span>
                  <strong>${value}</strong>
                </div>
                <div class="portfolio-decision-track">
                  <div class="portfolio-decision-fill ${tone}" style="width:${Math.max(total > 0 ? width : 0, total > 0 && value > 0 ? 8 : 0)}%"></div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
      <p class="portfolio-decision-note">
        ${
          total > 0
            ? "These counts come from holding-level advisor decisions."
            : "Scenario mode does not have saved holdings yet, so decision counts stay empty until you analyze real portfolio positions."
        }
      </p>
    `;
  }

  function renderGrowthChart(maker) {
    const series = Array.isArray(maker?.growth?.series) ? maker.growth.series : [];
    if (series.length < 2) {
      growthBody.innerHTML = `<p class="portfolio-empty">No growth chart available.</p>`;
      return;
    }

    growthBody.innerHTML = buildGrowthSvg(series, maker?.growth?.finalValue || 0);
  }

  function renderSnapshot(maker) {
    const inputs = maker?.inputs || readScenario();
    const amounts = maker?.allocation?.amounts || {};
    const entries = Object.entries(amounts);

    snapshotBody.innerHTML = `
      <div class="portfolio-snapshot-grid">
        <div class="portfolio-stat-card">
          <span>Amount</span>
          <strong>${formatInr(inputs.amount)}</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Risk</span>
          <strong>${escapeHtml(inputs.riskLevel || "Moderate")}</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Years</span>
          <strong>${Number(inputs.years || 0)}Y</strong>
        </div>
        <div class="portfolio-stat-card">
          <span>Expected Return</span>
          <strong>${Number(inputs.expectedReturn || 0).toFixed(1)}%</strong>
        </div>
      </div>
      ${entries
        .map(
          ([label, value]) => `
            <div class="portfolio-allocation-row">
              <div>
                <strong>${escapeHtml(label)}</strong>
                <small>Current scenario allocation</small>
              </div>
              <span>${formatInr(value)}</span>
            </div>
          `
        )
        .join("")}
    `;
  }

  function renderNews(maker) {
    const headlines = Array.isArray(maker?.headlines) ? maker.headlines : [];
    if (!headlines.length) {
      newsBody.innerHTML = `<p class="portfolio-empty">No market headlines found.</p>`;
      return;
    }

    newsBody.innerHTML = headlines
      .map(
        (item) => `
          <div class="portfolio-news-row">
            <div>
              <strong>${escapeHtml(item.title || "Headline")}</strong>
              <small>${escapeHtml(item.description || item.source || "No extra description available.")}</small>
            </div>
            <span>${escapeHtml(item.source || "News")}</span>
          </div>
        `
      )
      .join("");
  }

  function populate(payload) {
    currentPayload = payload;
    const maker = payload?.maker || {};
    renderSummary(maker, payload);
    renderSentiment(maker);
    renderNotes(maker);
    renderModels(maker, payload);
    renderPieChart(maker);
    renderDecisionMix(payload);
    renderGrowthChart(maker);
    renderSnapshot(maker);
    renderNews(maker);
    resetChat(maker);
    showHint("Smart advisor restored for this route. Builder stays separate.", "success");
  }

  async function runAnalysis() {
    if (busy) return;
    clearHint();
    setBusy(true);
    setChatBusy(true);
    currentPayload = null;
    try {
      const payload = await fetchPortfolioAnalysis(readScenario());
      populate(payload);
    } catch (error) {
      currentPayload = null;
      resetChat();
      showHint(`Failed to load advisor: ${error.message}`, "error");
    } finally {
      setBusy(false);
      setChatBusy(false);
    }
  }

  async function sendQuestion() {
    if (chatBusy) return;
    if (!currentPayload) {
      showHint("Load the advisor first before asking questions.", "info");
      return;
    }

    const question = String(chatInput.value || "").trim();
    if (!question) return;

    chatInput.value = "";
    addChatBubble("user", question);
    setChatBusy(true);

    try {
      const response = await askPortfolioQuestion({
        holdings: currentPayload?.positions || [],
        question,
        analysis: currentPayload,
      });
      addChatBubble("assistant", response.answer || "No response.", `Model: ${response.model || currentPayload?.models?.advisor || "Groq"}`);
    } catch (error) {
      addChatBubble("assistant", `Error: ${error.message}`);
    } finally {
      setChatBusy(false);
    }
  }

  emptyState();
  runAnalysis();
}

function getDisplayName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "User";
}

function getInitials(user) {
  return getDisplayName(user)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatInr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function buildGrowthSvg(series, finalValue) {
  const width = 620;
  const height = 260;
  const padLeft = 34;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 36;
  const values = series.map((point) => Number(point.value || 0));
  const years = series.map((point) => Number(point.year || 0));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const xSpan = Math.max(years[years.length - 1] - years[0], 1);
  const labelStep = Math.max(1, Math.ceil(series.length / 8));

  const points = series.map((point) => {
    const year = Number(point.year || 0);
    const value = Number(point.value || 0);
    const x = padLeft + ((year - years[0]) / xSpan) * (width - padLeft - padRight);
    const y = padTop + (1 - (value - min) / span) * (height - padTop - padBottom);
    return { x, y, year, value };
  });

  const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const area = `${padLeft},${height - padBottom} ${line} ${points[points.length - 1].x.toFixed(2)},${height - padBottom}`;

  return `
    <div class="portfolio-growth-card">
      <svg viewBox="0 0 ${width} ${height}" class="portfolio-growth-svg" preserveAspectRatio="none">
        <defs>
          <linearGradient id="portfolio-growth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#34d399" stop-opacity="0.34"/>
            <stop offset="100%" stop-color="#34d399" stop-opacity="0.04"/>
          </linearGradient>
        </defs>
        <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="portfolio-axis"/>
        <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="portfolio-axis"/>
        <polygon points="${area}" fill="url(#portfolio-growth-fill)"></polygon>
        <polyline points="${line}" fill="none" stroke="#34d399" stroke-width="3"></polyline>
        ${points
          .map(
            (point, index) => `
              <circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.4" fill="#34d399"></circle>
              ${
                index === 0 || index === points.length - 1 || index % labelStep === 0
                  ? `<text x="${point.x.toFixed(2)}" y="${height - 12}" text-anchor="middle" class="portfolio-axis-label">${point.year}Y</text>`
                  : ""
              }
            `
          )
          .join("")}
      </svg>
      <div class="portfolio-growth-meta">
        <span>Final Value</span>
        <strong>${formatInr(finalValue)}</strong>
      </div>
    </div>
  `;
}

function capitalize(value) {
  const text = String(value || "");
  return text ? text[0].toUpperCase() + text.slice(1) : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
