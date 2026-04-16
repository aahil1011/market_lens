import { askPortfolioQuestion, fetchPortfolioAnalysis } from "../services/portfolioApi.js";
import { fetchStockSuggestions } from "../services/stockApi.js";

const STORAGE_KEY = "marketlens.advisor.holdings.v3";

export function renderPortfolioAdvisorNotebookPage(container, user, options = {}) {
  let busy = false;
  let chatBusy = false;
  let currentPayload = null;
  let holdings = loadHoldings();
  let selectedWindow = "6M";
  let suggestions = [];
  let activeSuggestionIndex = -1;
  let suggestTimer = null;
  let selectedStock = null;

  container.innerHTML = /* html */ `
    <div class="portfolio-page portfolio-advisor-page">
      <div class="portfolio-bg">
        <div class="portfolio-bg-blob"></div>
        <div class="portfolio-bg-blob"></div>
      </div>
      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#advisor-logo-grad)"/>
            <path d="M10 28L16 20L21 24L30 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <defs>
              <linearGradient id="advisor-logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#f97316"/>
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
        <button class="news-back-link" id="advisor-back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Go To Dashboard
        </button>
        <section class="advisor-hero-card">
          <div class="advisor-hero-orb"></div>
          <div class="advisor-hero-copy">
            <div class="advisor-hero-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 17 7"/><polyline points="9 7 17 7 17 15"/></svg></div>
            <p class="portfolio-maker-kicker">Smart Advisor</p>
            <h1 class="portfolio-maker-title">Open smart portfolio advisor</h1>
            <p class="portfolio-maker-subtitle">Add every holding on the right, then generate the notebook-style analysis when your portfolio draft is ready.</p>
            <div class="advisor-hero-actions"><button id="advisor-run-btn" class="stock-analyze-btn" type="button">Generate Advisor Report</button></div>
          </div>
          <div class="advisor-hero-side">
            <div class="advisor-hero-stats" id="advisor-hero-stats"></div>
            <div class="advisor-hero-summary" id="advisor-hero-summary"></div>
            <div class="advisor-hero-counts" id="advisor-hero-counts"></div>
          </div>
        </section>
        <div class="stock-hint portfolio-maker-hint" id="advisor-hint"></div>
        <div class="advisor-workspace">
          <section class="advisor-main">
            <article class="stock-card advisor-table-card">
              <div class="portfolio-panel-head"><div><p class="portfolio-panel-kicker">Portfolio</p><h3 class="stock-card-title">Full Analysis Table</h3></div><span class="portfolio-panel-note">Click a ticker to open Stock Lab</span></div>
              <p class="stock-muted-text portfolio-panel-helper">Notebook output: prices, sentiment, decision, risk, category, and reason.</p>
              <div class="advisor-table-wrap" id="advisor-table-wrap"></div>
            </article>
            <div class="advisor-bottom-grid">
              <article class="stock-card advisor-chart-card">
                <div class="portfolio-panel-head"><div><p class="portfolio-panel-kicker">Graphs</p><h3 class="stock-card-title">Projection Horizons</h3></div><div class="advisor-window-tabs" id="advisor-window-tabs"><button type="button" class="advisor-window-btn" data-window="1M">1 Month</button><button type="button" class="advisor-window-btn active" data-window="6M">6 Months</button><button type="button" class="advisor-window-btn" data-window="1Y">1 Year</button></div></div>
                <p class="stock-muted-text portfolio-panel-helper">Select a horizon and generate that particular graph.</p>
                <div class="portfolio-panel-body" id="advisor-chart-body"></div>
              </article>
              <article class="stock-card advisor-chat-panel">
                <div class="portfolio-panel-head"><div><p class="portfolio-panel-kicker">Ask AI Chatbot</p><h3 class="stock-card-title">Portfolio Follow-Up</h3></div><span class="portfolio-panel-note">Groq chat</span></div>
                <p class="stock-muted-text portfolio-panel-helper">Ask why a holding is BuyMore, Hold, or Sell, or what to rebalance next.</p>
                <div class="stock-chat-log" id="advisor-chat-log"></div>
                <div class="stock-chat-controls"><input id="advisor-chat-input" class="stock-chat-input" type="text" placeholder="Ask about this portfolio..." disabled /><button id="advisor-chat-send-btn" class="stock-analyze-btn" type="button" disabled>Ask</button></div>
              </article>
            </div>
          </section>
          <aside class="stock-card advisor-add-card">
            <div class="portfolio-panel-head"><div><p class="portfolio-panel-kicker">Add Stocks To Portfolio</p><h3 class="stock-card-title">Portfolio Inputs</h3></div><span class="portfolio-panel-note">Manual draft</span></div>
            <div class="advisor-add-form">
              <div class="stock-search-wrap advisor-search-wrap"><input id="advisor-stock-search" class="stock-search-input advisor-stock-search" type="text" placeholder="Search..." autocomplete="off" /><div id="advisor-stock-suggestions" class="stock-suggestions"></div></div>
              <div class="advisor-selected-stock" id="advisor-selected-stock"><p class="stock-muted-text">Select a stock from the dropdown list of stocks.</p></div>
              <label class="portfolio-field"><span>Enter shares</span><input id="advisor-shares-input" type="number" min="0.0001" step="0.0001" placeholder="10" /></label>
              <label class="portfolio-field"><span>Enter Avg buy price</span><input id="advisor-buy-price-input" type="number" min="0.0001" step="0.01" placeholder="178.50" /></label>
              <label class="portfolio-field"><span>Type</span><select id="advisor-asset-type-input"><option value="Stock">Stock</option><option value="ETF (Index)">ETF (Index)</option><option value="Commodity (Gold)">Commodity (Gold)</option><option value="Commodity">Commodity</option></select></label>
              <label class="portfolio-field"><span>Sector / category</span><input id="advisor-sector-input" type="text" placeholder="Technology" /></label>
              <div class="advisor-add-actions">
                <button id="advisor-add-stock-btn" class="stock-analyze-btn advisor-add-btn" type="button">Add Holding</button>
                <button id="advisor-generate-btn" class="stock-ghost-btn advisor-generate-btn" type="button">Generate Advisor</button>
              </div>
              <p class="stock-muted-text advisor-add-note">Build the full portfolio first. Analysis only runs when you press Generate Advisor.</p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;

  const hintEl = document.getElementById("advisor-hint");
  const runBtn = document.getElementById("advisor-run-btn");
  const generateBtn = document.getElementById("advisor-generate-btn");
  const heroStatsEl = document.getElementById("advisor-hero-stats");
  const heroSummaryEl = document.getElementById("advisor-hero-summary");
  const heroCountsEl = document.getElementById("advisor-hero-counts");
  const tableWrap = document.getElementById("advisor-table-wrap");
  const chartTabs = document.getElementById("advisor-window-tabs");
  const chartBody = document.getElementById("advisor-chart-body");
  const chatLog = document.getElementById("advisor-chat-log");
  const chatInput = document.getElementById("advisor-chat-input");
  const chatSendBtn = document.getElementById("advisor-chat-send-btn");
  const searchInput = document.getElementById("advisor-stock-search");
  const suggestionsEl = document.getElementById("advisor-stock-suggestions");
  const selectedStockEl = document.getElementById("advisor-selected-stock");
  const sharesInput = document.getElementById("advisor-shares-input");
  const buyPriceInput = document.getElementById("advisor-buy-price-input");
  const assetTypeInput = document.getElementById("advisor-asset-type-input");
  const sectorInput = document.getElementById("advisor-sector-input");
  const addStockBtn = document.getElementById("advisor-add-stock-btn");

  document.getElementById("advisor-back-btn").addEventListener("click", () => { window.location.hash = ""; });
  runBtn.addEventListener("click", () => runAnalysis());
  generateBtn.addEventListener("click", () => runAnalysis());
  chartTabs.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-window]");
    if (!btn) return;
    selectedWindow = btn.dataset.window || "6M";
    setActiveWindow(selectedWindow);
    renderProjection();
  });
  chatSendBtn.addEventListener("click", () => sendQuestion());
  chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); sendQuestion(); }
  });
  searchInput.addEventListener("focus", () => queueSuggestions(searchInput.value));
  searchInput.addEventListener("input", () => {
    selectedStock = null;
    renderSelectedStock();
    updateAddButtonState();
    queueSuggestions(searchInput.value);
  });
  searchInput.addEventListener("blur", () => setTimeout(clearSuggestions, 100));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      if (!suggestions.length) return;
      event.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestions.length - 1);
      renderSuggestions();
      return;
    }
    if (event.key === "ArrowUp") {
      if (!suggestions.length) return;
      event.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      renderSuggestions();
      return;
    }
    if (event.key === "Escape") {
      clearSuggestions();
      return;
    }
    if (event.key === "Enter" && suggestions.length && activeSuggestionIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
    }
  });
  suggestionsEl.addEventListener("mousedown", (event) => {
    const row = event.target.closest("[data-symbol]");
    if (!row) return;
    event.preventDefault();
    const picked = suggestions.find((item) => item.symbol === row.dataset.symbol);
    if (picked) chooseSuggestion(picked);
  });
  suggestionsEl.addEventListener("mousemove", (event) => {
    const row = event.target.closest("[data-symbol]");
    if (!row) return;
    const index = suggestions.findIndex((item) => item.symbol === row.dataset.symbol);
    if (index < 0 || index === activeSuggestionIndex) return;
    activeSuggestionIndex = index;
    renderSuggestions();
  });
  [sharesInput, buyPriceInput, assetTypeInput, sectorInput].forEach((el) => {
    el.addEventListener("input", updateAddButtonState);
    el.addEventListener("change", updateAddButtonState);
  });
  addStockBtn.addEventListener("click", addHolding);
  tableWrap.addEventListener("click", (event) => {
    const tickerBtn = event.target.closest("[data-open-symbol]");
    if (tickerBtn) {
      openStockLab(tickerBtn.dataset.openSymbol);
      return;
    }
    const removeBtn = event.target.closest("[data-remove-symbol]");
    if (removeBtn) {
      const symbol = String(removeBtn.dataset.removeSymbol || "").toUpperCase();
      holdings = holdings.filter((item) => item.symbol !== symbol);
      saveHoldings(holdings);
      renderDraftState();
      showHint(symbol ? `${symbol} removed. Update the draft, then generate when you're ready.` : "Holding removed from the draft portfolio.", "info");
    }
  });

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
    runBtn.textContent = state ? "Generating..." : "Generate Advisor Report";
    generateBtn.disabled = state;
    generateBtn.textContent = state ? "Generating..." : "Generate Advisor";
  }

  function setChatBusy(state) {
    chatBusy = state;
    chatInput.disabled = !currentPayload;
    chatSendBtn.disabled = state || !currentPayload;
    chatSendBtn.textContent = state ? "Thinking..." : "Ask";
  }

  function updateAddButtonState() {
    const symbol = (selectedStock?.symbol || searchInput.value || "").trim();
    const shares = Number(sharesInput.value);
    const avgBuyPrice = Number(buyPriceInput.value);
    addStockBtn.disabled = !symbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgBuyPrice) || avgBuyPrice <= 0;
  }

  function renderSelectedStock() {
    const symbol = (selectedStock?.symbol || searchInput.value || "").trim().toUpperCase();
    if (!symbol) {
      selectedStockEl.innerHTML = `<p class="stock-muted-text">Select a stock from the dropdown list of stocks.</p>`;
      return;
    }
    const exchange = selectedStock?.exchange ? ` | ${selectedStock.exchange}` : "";
    selectedStockEl.innerHTML = `
      <div class="advisor-selected-main">${escapeHtml(symbol)}</div>
      <div class="advisor-selected-sub">${escapeHtml(selectedStock?.name || symbol)}${escapeHtml(exchange)}</div>
    `;
  }

  function queueSuggestions(query) {
    if (suggestTimer) clearTimeout(suggestTimer);
    suggestTimer = setTimeout(() => loadSuggestions(query), 220);
  }

  async function loadSuggestions(query) {
    const trimmed = String(query || "").trim();
    if (!trimmed) {
      clearSuggestions();
      return;
    }
    try {
      const rows = await fetchStockSuggestions(trimmed);
      suggestions = rows.slice(0, 12);
      activeSuggestionIndex = suggestions.length ? 0 : -1;
      renderSuggestions();
    } catch {
      clearSuggestions();
    }
  }

  function renderSuggestions() {
    if (!suggestions.length) {
      suggestionsEl.innerHTML = "";
      suggestionsEl.classList.remove("visible");
      return;
    }
    suggestionsEl.innerHTML = suggestions.map((item, index) => `
      <button type="button" class="stock-suggestion-item${index === activeSuggestionIndex ? " active" : ""}" data-symbol="${escapeHtml(item.symbol)}">
        <span class="stock-suggestion-main">${escapeHtml(item.symbol)}</span>
        <span class="stock-suggestion-sub">${escapeHtml(item.name || item.symbol)}${item.exchange ? ` | ${escapeHtml(item.exchange)}` : ""}</span>
      </button>
    `).join("");
    suggestionsEl.classList.add("visible");
  }

  function clearSuggestions() {
    suggestions = [];
    activeSuggestionIndex = -1;
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.remove("visible");
  }

  function chooseSuggestion(item) {
    selectedStock = item;
    searchInput.value = item.symbol;
    renderSelectedStock();
    updateAddButtonState();
    clearSuggestions();
    sharesInput.focus();
  }

  function resetAddForm() {
    selectedStock = null;
    searchInput.value = "";
    sharesInput.value = "";
    buyPriceInput.value = "";
    assetTypeInput.value = "Stock";
    sectorInput.value = "";
    renderSelectedStock();
    updateAddButtonState();
  }

  function addHolding() {
    const symbol = (selectedStock?.symbol || searchInput.value || "").trim().toUpperCase();
    const shares = Number(sharesInput.value);
    const avgBuyPrice = Number(buyPriceInput.value);
    const assetType = String(assetTypeInput.value || "Stock").trim();
    const sector = String(sectorInput.value || "").trim();
    if (!symbol || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(avgBuyPrice) || avgBuyPrice <= 0) {
      showHint("Pick a stock, shares, and average buy price before adding.", "info");
      return;
    }
    const next = { symbol, shares, avgBuyPrice, assetType, sector };
    const existingIndex = holdings.findIndex((item) => item.symbol === symbol);
    if (existingIndex >= 0) holdings[existingIndex] = next;
    else holdings = [next, ...holdings];
    saveHoldings(holdings);
    resetAddForm();
    renderDraftState();
    showHint(`${symbol} added. Keep building the portfolio, then press Generate Advisor when you're ready.`, "success");
  }

  function addChatBubble(role, message, modelLabel = "") {
    const row = document.createElement("div");
    row.className = `stock-chat-msg ${role}`;
    row.innerHTML = `<div class="stock-chat-text"></div>${modelLabel ? `<div class="stock-chat-model">${escapeHtml(modelLabel)}</div>` : ""}`;
    row.querySelector(".stock-chat-text").textContent = message;
    chatLog.appendChild(row);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
  function renderHero(payload) {
    const summary = payload?.summary || {};
    const counts = summary.decisionCounts || {};
    const pnlPct = Number(summary.pnlPct || 0);
    const pnlClass = pnlPct > 0 ? "up" : pnlPct < 0 ? "down" : "flat";

    let cvTooltip = "";
    const proj1Y = payload?.projections?.["1Y"];
    if (proj1Y && proj1Y.startValue > 0) {
      const gDiff = proj1Y.expectedGain - proj1Y.startValue;
      const gPct = (gDiff / proj1Y.startValue) * 100;
      const lDiff = proj1Y.startValue - proj1Y.expectedLoss;
      const lPct = (lDiff / proj1Y.startValue) * 100;
      
      cvTooltip = `
        <div class="cv-tooltip">
          <strong>1Y Expected Shortfall (CVaR)</strong>
          <div>Expected Gain: <span class="up">+${formatUsd(gDiff)} (+${gPct.toFixed(2)}%)</span></div>
          <div>Expected Loss: <span class="down">-${formatUsd(lDiff)} (-${lPct.toFixed(2)}%)</span></div>
          <p style="margin-top: 8px; font-size: 0.74rem; color: rgba(255,255,255,0.4); line-height: 1.4;">Conditional Value at Risk: Calculates the mathematical average of the best 10% and worst 10% of 320 simulated future paths for these exact tickers.</p>
        </div>
      `;
    }

    heroStatsEl.innerHTML = `
      <div class="portfolio-stat-card"><span>Total Invested</span><strong>${formatUsd(summary.totalInvested)}</strong></div>
      <div class="portfolio-stat-card cv-card-wrapper" style="position: relative;">
        <span>Current Value 
          <svg class="cv-info-icon" style="width: 13px; margin-left: 4px; vertical-align: text-top; opacity: 0.6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        </span>
        <strong>${formatUsd(summary.currentValue)}</strong>
        ${cvTooltip}
      </div>
      <div class="portfolio-stat-card"><span>Total P&amp;L</span><strong class="advisor-value-${pnlClass}">${formatUsd(summary.pnlUsd)} (${pnlPct.toFixed(2)}%)</strong></div>
      <div class="portfolio-stat-card"><span>Portfolio Score</span><strong>${summary.portfolioScore || "-"}/10</strong></div>
    `;
    heroSummaryEl.innerHTML = `
      <div class="advisor-summary-card">
        <div class="advisor-summary-row"><strong>Diversification</strong><span>${escapeHtml(summary.diversificationRating || "-")}</span></div>
        <div class="advisor-summary-row"><strong>Top Risk</strong><span>${escapeHtml(summary.topRisk || "-")}</span></div>
        <div class="advisor-summary-row"><strong>Top Opportunity</strong><span>${escapeHtml(summary.topOpportunity || "-")}</span></div>
      </div>
      <p class="portfolio-summary-text">${escapeHtml(summary.portfolioSummary || "Run the advisor to generate a notebook-style portfolio summary.")}</p>
    `;
    heroCountsEl.innerHTML = `
      <div class="advisor-count-pill buy">BuyMore ${Number(counts.BuyMore || 0)}</div>
      <div class="advisor-count-pill hold">Hold ${Number(counts.Hold || 0)}</div>
      <div class="advisor-count-pill sell">Sell ${Number(counts.Sell || 0)}</div>
    `;
  }

  function renderTable(payload) {
    const positions = Array.isArray(payload?.positions) ? payload.positions : [];
    if (!positions.length) {
      tableWrap.innerHTML = `<p class="portfolio-empty">Add stocks on the right to generate the advisor table.</p>`;
      return;
    }
    tableWrap.innerHTML = `
      <table class="advisor-table">
        <thead>
          <tr>
            <th>Ticker</th><th>Type</th><th>Sector</th><th>Buy Price</th><th>Current</th><th>Shares</th><th>Invested</th><th>Curr Value</th><th>P&amp;L %</th><th>Sentiment</th><th>Decision</th><th>Risk</th><th>Reason</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${positions.map((position) => {
            const sentiment = String(position?.advisor?.sentiment || position?.sentimentRaw?.label || "neutral").toLowerCase();
            const decision = String(position?.advisor?.decision || "Hold");
            const risk = String(position?.advisor?.risk || "Medium Risk");
            const riskClass = risk.toLowerCase().replace(/\s+/g, "-");
            return `
              <tr>
                <td><button type="button" class="advisor-ticker-btn" data-open-symbol="${escapeHtml(position.symbol)}">${escapeHtml(position.symbol)}</button></td>
                <td>${escapeHtml(position.assetType || "-")}</td>
                <td>${escapeHtml(position.sector || "-")}</td>
                <td>${formatUsd(position.avgBuyPrice)}</td>
                <td>${formatUsd(position.currentPrice)}</td>
                <td>${Number(position.shares || 0).toLocaleString()}</td>
                <td>${formatUsd(position.invested)}</td>
                <td>${formatUsd(position.currentValue)}</td>
                <td class="${Number(position.pnlPct || 0) >= 0 ? "advisor-pnl-up" : "advisor-pnl-down"}">${Number(position.pnlPct || 0).toFixed(2)}%</td>
                <td><span class="advisor-pill sentiment ${sentiment}">${capitalize(sentiment)}</span></td>
                <td><span class="advisor-pill decision ${decision.toLowerCase()}">${escapeHtml(decision)}</span></td>
                <td><span class="advisor-pill risk ${riskClass}">${escapeHtml(risk)}</span></td>
                <td class="advisor-reason-cell" title="${escapeHtml(position?.advisor?.reason || "-")}">${escapeHtml(position?.advisor?.reason || "-")}</td>
                <td><button type="button" class="advisor-row-remove" data-remove-symbol="${escapeHtml(position.symbol)}">Remove</button></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;
  }

  function renderDraftTable() {
    if (!holdings.length) {
      tableWrap.innerHTML = `<p class="portfolio-empty">Start by adding holdings on the right. Your draft table will appear here before you generate the advisor report.</p>`;
      return;
    }
    tableWrap.innerHTML = `
      <div class="advisor-draft-banner">
        <strong>Draft holdings</strong>
        <span>Add every stock first, then press Generate Advisor to run the notebook analysis.</span>
      </div>
      <table class="advisor-table advisor-draft-table">
        <thead>
          <tr>
            <th>Ticker</th><th>Type</th><th>Sector</th><th>Shares</th><th>Avg Buy</th><th>Cost Basis</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${holdings.map((item) => `
            <tr>
              <td><button type="button" class="advisor-ticker-btn" data-open-symbol="${escapeHtml(item.symbol)}">${escapeHtml(item.symbol)}</button></td>
              <td>${escapeHtml(item.assetType || "Stock")}</td>
              <td>${escapeHtml(item.sector || "-")}</td>
              <td>${Number(item.shares || 0).toLocaleString()}</td>
              <td>${formatUsd(item.avgBuyPrice)}</td>
              <td>${formatUsd(Number(item.shares || 0) * Number(item.avgBuyPrice || 0))}</td>
              <td><button type="button" class="advisor-row-remove" data-remove-symbol="${escapeHtml(item.symbol)}">Remove</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderDraftProjection() {
    const holdingCount = holdings.length;
    const totalInvested = holdings.reduce((sum, item) => sum + (Number(item.shares || 0) * Number(item.avgBuyPrice || 0)), 0);
    chartBody.innerHTML = holdingCount ? `
      <div class="advisor-draft-placeholder">
        <div class="portfolio-inline-note">Your draft is ready. Generate the advisor to unlock the 1 month, 6 month, and 1 year projection graphs for this portfolio.</div>
        <div class="advisor-projection-meta">
          <div class="portfolio-stat-card"><span>Selected Window</span><strong>${escapeHtml(selectedWindow)}</strong></div>
          <div class="portfolio-stat-card"><span>Draft Holdings</span><strong>${holdingCount}</strong></div>
          <div class="portfolio-stat-card"><span>Draft Cost Basis</span><strong>${formatUsd(totalInvested)}</strong></div>
        </div>
      </div>
    ` : `<p class="portfolio-empty">Add holdings first, then generate the advisor to see 1 month, 6 month, and 1 year projections.</p>`;
  }

  function renderProjection() {
    if (!currentPayload) {
      renderDraftProjection();
      return;
    }
    const projection = currentPayload?.projections?.[selectedWindow];
    if (!projection || !Array.isArray(projection.series) || !projection.series.length) {
      chartBody.innerHTML = `<p class="portfolio-empty">No ${selectedWindow} projection available.</p>`;
      return;
    }
    chartBody.innerHTML = buildProjectionSvg(projection, selectedWindow);
  }

  function seedChat(payload) {
    chatLog.innerHTML = "";
    if (!payload) {
      addChatBubble("assistant", "Run the smart advisor first, then ask follow-up questions about any holding or decision.");
      setChatBusy(false);
      return;
    }
    addChatBubble("assistant", "Portfolio analysis is ready. Ask why a stock is BuyMore, Hold, or Sell, or ask what to rebalance next.", `Model: ${payload?.models?.advisor || "Groq"}`);
    setChatBusy(false);
  }

  function setActiveWindow(windowKey) {
    chartTabs.querySelectorAll("[data-window]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.window === windowKey);
    });
  }

  function renderDraftState() {
    currentPayload = null;
    const holdingCount = holdings.length;
    const totalInvested = holdings.reduce((sum, item) => sum + (Number(item.shares || 0) * Number(item.avgBuyPrice || 0)), 0);
    const assetTypes = new Set(holdings.map((item) => String(item.assetType || "Stock"))).size;
    const sectors = new Set(holdings.map((item) => String(item.sector || "").trim()).filter(Boolean)).size;
    heroStatsEl.innerHTML = `
      <div class="portfolio-stat-card"><span>Draft Holdings</span><strong>${holdingCount}</strong></div>
      <div class="portfolio-stat-card"><span>Draft Cost Basis</span><strong>${holdingCount ? formatUsd(totalInvested) : "-"}</strong></div>
      <div class="portfolio-stat-card"><span>Asset Types</span><strong>${holdingCount ? assetTypes : "-"}</strong></div>
      <div class="portfolio-stat-card"><span>Status</span><strong>${holdingCount ? "Ready To Generate" : "Awaiting Inputs"}</strong></div>
    `;
    heroSummaryEl.innerHTML = `
      <div class="advisor-summary-card">
        <div class="advisor-summary-row"><strong>Mode</strong><span>Manual portfolio draft</span></div>
        <div class="advisor-summary-row"><strong>Next Step</strong><span>${holdingCount ? "Press Generate Advisor after you finish adding positions." : "Add your holdings from the top-right panel."}</span></div>
        <div class="advisor-summary-row"><strong>Coverage</strong><span>${holdingCount ? `${holdingCount} holdings across ${Math.max(sectors, 1)} sectors` : "No holdings added yet"}</span></div>
      </div>
      <p class="portfolio-summary-text">${holdingCount ? "Your holdings are saved as a draft. MarketLens will wait for your Generate action before running sentiment, decisions, and projection graphs." : "Build the portfolio on the right side first. Nothing is hardcoded now, and nothing runs until you decide to generate the advisor report."}</p>
    `;
    heroCountsEl.innerHTML = holdingCount ? `
      <div class="advisor-count-pill info">${holdingCount} Holdings Added</div>
      <div class="advisor-count-pill info">${assetTypes} Asset Types</div>
      <div class="advisor-count-pill buy">Generate When Ready</div>
    ` : `
      <div class="advisor-count-pill info">Manual Entry Only</div>
      <div class="advisor-count-pill hold">Add Holdings To Start</div>
    `;
    renderDraftTable();
    renderDraftProjection();
    seedChat(null);
  }

  function populate(payload) {
    currentPayload = payload;
    renderHero(payload);
    renderTable(payload);
    renderProjection();
    seedChat(payload);
    showHint("Smart advisor updated from your portfolio holdings.", "success");
  }

  async function runAnalysis() {
    if (busy) return;
    clearHint();
    if (!holdings.length) {
      renderDraftState();
      showHint("Add at least one stock to run the advisor.", "info");
      return;
    }
    setBusy(true);
    setChatBusy(true);
    try {
      const payload = await fetchPortfolioAnalysis(holdings);
      populate(payload);
    } catch (error) {
      renderDraftState();
      showHint(`Failed to run smart advisor: ${error.message}`, "error");
    } finally {
      setBusy(false);
      setChatBusy(false);
    }
  }

  async function sendQuestion() {
    if (chatBusy) return;
    if (!currentPayload) {
      showHint("Run the smart advisor first before asking questions.", "info");
      return;
    }
    const question = String(chatInput.value || "").trim();
    if (!question) return;
    chatInput.value = "";
    addChatBubble("user", question);
    setChatBusy(true);
    try {
      const response = await askPortfolioQuestion({ holdings, question, analysis: currentPayload });
      addChatBubble("assistant", response.answer || "No response.", `Model: ${response.model || currentPayload?.models?.advisor || "Groq"}`);
    } catch (error) {
      addChatBubble("assistant", `Error: ${error.message}`);
    } finally {
      setChatBusy(false);
    }
  }

  renderSelectedStock();
  updateAddButtonState();
  setActiveWindow(selectedWindow);
  if (String(options?.focus || "").toLowerCase() === "advisor") searchInput.focus();
  renderDraftState();
}
function loadHoldings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      symbol: String(item.symbol || "").toUpperCase(),
      shares: Number(item.shares || 0),
      avgBuyPrice: Number(item.avgBuyPrice || 0),
      assetType: String(item.assetType || "Stock"),
      sector: String(item.sector || ""),
    })).filter((item) => item.symbol && item.shares > 0 && item.avgBuyPrice > 0);
  } catch {
    return [];
  }
}

function saveHoldings(holdings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
}

function openStockLab(symbol) {
  const url = `${window.location.origin}${window.location.pathname}#stock-sentiment?symbol=${encodeURIComponent(symbol)}`;
  window.open(url, "_blank", "noopener");
}

function formatUsd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
}

function buildProjectionSvg(projection, label) {
  const series = projection.series || [];
  const width = 620;
  const height = 260;
  const padLeft = 42;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 36;
  const values = series.flatMap((point) => [Number(point.p10 || 0), Number(point.p90 || 0)]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const xSpan = Math.max(series.length - 1, 1);
  const mapPoint = (value, index) => {
    const x = padLeft + (index / xSpan) * (width - padLeft - padRight);
    const y = padTop + (1 - (value - min) / span) * (height - padTop - padBottom);
    return { x, y };
  };
  const startPoint = mapPoint(Number(projection.startValue || 0), 0);
  const meanPoints = series.map((point, index) => mapPoint(Number(point.mean || 0), index));
  const bandTop = series.map((point, index) => mapPoint(Number(point.p90 || 0), index));
  const bandBottom = [...series].reverse().map((point, reverseIndex) => {
    const index = series.length - 1 - reverseIndex;
    return mapPoint(Number(point.p10 || 0), index);
  });
  const meanLine = meanPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const bandPath = [...bandTop, ...bandBottom].map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  return `
    <div class="advisor-projection-shell">
      <svg viewBox="0 0 ${width} ${height}" class="portfolio-growth-svg" preserveAspectRatio="none">
        <defs><linearGradient id="advisor-band-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7c8bff" stop-opacity="0.28"/><stop offset="100%" stop-color="#7c8bff" stop-opacity="0.04"/></linearGradient></defs>
        <line x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}" class="portfolio-axis"/>
        <line x1="${padLeft}" y1="${height - padBottom}" x2="${width - padRight}" y2="${height - padBottom}" class="portfolio-axis"/>
        <line x1="${padLeft}" y1="${startPoint.y.toFixed(2)}" x2="${width - padRight}" y2="${startPoint.y.toFixed(2)}" class="advisor-start-line"/>
        <polygon points="${bandPath}" fill="url(#advisor-band-fill)"></polygon>
        <polyline points="${meanLine}" fill="none" stroke="#7c8bff" stroke-width="3"></polyline>
        <text x="${padLeft}" y="${height - 10}" class="portfolio-axis-label">0</text>
        <text x="${(width / 2).toFixed(2)}" y="${height - 10}" text-anchor="middle" class="portfolio-axis-label">${label}</text>
        <text x="${(width - padRight).toFixed(2)}" y="${height - 10}" text-anchor="end" class="portfolio-axis-label">End</text>
      </svg>
      <div class="advisor-projection-meta">
        <div class="portfolio-stat-card"><span>Expected Value</span><strong>${formatUsd(projection.finalMean)}</strong></div>
        <div class="portfolio-stat-card"><span>10th Percentile Confidence</span><strong>${formatUsd(projection.finalP10)}</strong></div>
        <div class="portfolio-stat-card"><span>90th Percentile Probability</span><strong>${formatUsd(projection.finalP90)}</strong></div>
      </div>
    </div>
  `;
}

function getDisplayName(user) {
  return user?.displayName || user?.email?.split("@")[0] || "User";
}

function getInitials(user) {
  return getDisplayName(user).split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
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
