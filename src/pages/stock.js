import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { AreaSeries, HistogramSeries, createChart } from "lightweight-charts";
import { auth, db } from "../firebase.js";
import {
  askStockQuestion,
  fetchStockSentiment,
  fetchStockSuggestions,
  fetchTrendingBullRunStocks,
} from "../services/stockApi.js";

/**
 * Render stock sentiment page.
 * @param {HTMLElement} container
 * @param {import("firebase/auth").User} user
 * @param {{symbol?: string}} [options]
 */
export function renderStockPage(container, user, options = {}) {
  let currentSymbol = "";
  let currentPayload = null;
  let portfolio = [];
  let selectedWindowDays = 180;
  let chartApi = null;
  let areaSeries = null;
  let volumeSeries = null;
  let chartResizeObserver = null;
  let suggestions = [];
  let activeSuggestionIndex = -1;
  let suggestTimer = null;
  let analyzeRequestId = 0;
  let trendingBullRun = [];

  container.innerHTML = /* html */ `
    <div class="stock-page">
      <div class="stock-bg">
        <div class="stock-bg-blob"></div>
        <div class="stock-bg-blob"></div>
      </div>

      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#stock-logo-grad)"/>
            <path d="M10 28L16 20L21 24L30 12" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <defs>
              <linearGradient id="stock-logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#a855f7"/>
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

      <div class="stock-content">
        <button class="news-back-link" id="stock-back-btn" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Go To Dashboard
        </button>

        <div class="stock-search-row">
          <div class="stock-search-wrap">
            <input id="stock-search-input" class="stock-search-input" type="text" placeholder="Search for any stock (e.g. AAPL, TSLA, NVDA)" autocomplete="off" />
            <div id="stock-suggestions" class="stock-suggestions"></div>
          </div>
          <button id="stock-analyze-btn" class="stock-analyze-btn" type="button">Analyze</button>
        </div>

        <div class="stock-hint" id="stock-hint"></div>

        <div class="stock-grid">
          <section class="stock-left">
            <article class="stock-card">
              <h3 class="stock-card-title">Current Trend</h3>
              <p class="stock-trend-label" id="stock-trend-label">-</p>
              <p class="stock-trend-confidence" id="stock-trend-confidence">Confidence: -</p>
              <p class="stock-model-line" id="stock-trend-model">Sentiment Model: -</p>
            </article>

            <article class="stock-card">
              <h3 class="stock-card-title">Reason</h3>
              <p class="stock-body-text" id="stock-reason-text">Search a stock to get explanation.</p>
              <p class="stock-model-line" id="stock-reason-model">Reasoning Model: -</p>
            </article>

            <article class="stock-card">
              <h3 class="stock-card-title">News Summary</h3>
              <p class="stock-body-text" id="stock-news-summary">No news summary yet.</p>
              <div class="stock-links-list" id="stock-news-links"></div>
              <p class="stock-model-line" id="stock-news-model">Summary Model: -</p>
            </article>

            <article class="stock-card">
              <h3 class="stock-card-title">Final Verdict</h3>
              <p class="stock-verdict-action" id="stock-verdict-action">-</p>
              <p class="stock-trend-confidence" id="stock-verdict-confidence">Confidence: -</p>
              <p class="stock-body-text" id="stock-verdict-reason">No verdict yet.</p>
              <p class="stock-model-line" id="stock-verdict-model">Verdict Model: -</p>
            </article>
          </section>

          <section class="stock-center">
            <article class="stock-card">
              <div class="stock-chart-head">
                <h3 class="stock-card-title">Graph Of Current Stock</h3>
                <div class="stock-timeframe" id="stock-timeframe">
                  <button type="button" class="stock-time-btn" data-window="7">1W</button>
                  <button type="button" class="stock-time-btn" data-window="30">1M</button>
                  <button type="button" class="stock-time-btn active" data-window="180">6M</button>
                  <button type="button" class="stock-time-btn" data-window="365">1Y</button>
                </div>
              </div>
              <div class="stock-chart-wrap" id="stock-chart-wrap"></div>
              <div class="stock-chart-meta" id="stock-chart-meta"></div>
            </article>

            <article class="stock-card">
              <h3 class="stock-card-title">Live Metrics</h3>
              <div class="stock-metrics-grid" id="stock-metrics-grid"></div>
            </article>

            <article class="stock-card">
              <h3 class="stock-card-title">Models In Use</h3>
              <p class="stock-model-line" id="stock-models-sentiment">Sentiment: -</p>
              <p class="stock-model-line" id="stock-models-llm">LLM: -</p>
            </article>
          </section>

          <aside class="stock-right">
            <article class="stock-card stock-bullrun-card">
              <div class="stock-right-head stock-bullrun-head">
                <div>
                  <h3 class="stock-card-title">Trending Bull Run Stocks</h3>
                  <p class="stock-inline-note" id="stock-bullrun-meta">Loading 12M estimates...</p>
                </div>
              </div>
              <div class="stock-bullrun-list" id="stock-bullrun-list"></div>
            </article>

            <article class="stock-card">
              <div class="stock-right-head">
                <h3 class="stock-card-title">My Portfolio</h3>
                <button id="stock-add-portfolio-btn" class="stock-ghost-btn" type="button" disabled>Add Current</button>
              </div>
              <div class="stock-portfolio-list" id="stock-portfolio-list"></div>
            </article>

            <article class="stock-card stock-chat-card">
              <h3 class="stock-card-title">Ask Any Question</h3>
              <div class="stock-chat-log" id="stock-chat-log"></div>
              <div class="stock-chat-controls">
                <input id="stock-chat-input" class="stock-chat-input" type="text" placeholder="Ask about this stock..." />
                <button id="stock-chat-send-btn" class="stock-analyze-btn" type="button" disabled>Ask</button>
              </div>
            </article>
          </aside>
        </div>
      </div>
    </div>
  `;

  const backBtn = document.getElementById("stock-back-btn");
  const searchInput = document.getElementById("stock-search-input");
  const suggestionsEl = document.getElementById("stock-suggestions");
  const analyzeBtn = document.getElementById("stock-analyze-btn");
  const hintEl = document.getElementById("stock-hint");
  const addPortfolioBtn = document.getElementById("stock-add-portfolio-btn");
  const portfolioList = document.getElementById("stock-portfolio-list");
  const chatLog = document.getElementById("stock-chat-log");
  const chatInput = document.getElementById("stock-chat-input");
  const chatSendBtn = document.getElementById("stock-chat-send-btn");
  const timeframeWrap = document.getElementById("stock-timeframe");
  const chartMetaEl = document.getElementById("stock-chart-meta");
  const bullRunMetaEl = document.getElementById("stock-bullrun-meta");
  const bullRunListEl = document.getElementById("stock-bullrun-list");

  backBtn.addEventListener("click", () => {
    window.location.hash = "";
  });

  analyzeBtn.addEventListener("click", () => {
    runAnalyze();
  });

  searchInput.addEventListener("focus", () => {
    queueSuggestions(searchInput.value);
  });

  searchInput.addEventListener("input", () => {
    queueSuggestions(searchInput.value);
  });

  searchInput.addEventListener("blur", () => {
    setTimeout(() => {
      clearSuggestions();
    }, 100);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      if (!suggestions.length) return;
      e.preventDefault();
      activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, suggestions.length - 1);
      renderSuggestions();
      return;
    }

    if (e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0);
      renderSuggestions();
      return;
    }

    if (e.key === "Escape") {
      clearSuggestions();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length && activeSuggestionIndex >= 0) {
        const picked = suggestions[activeSuggestionIndex];
        chooseSuggestion(picked);
        return;
      }
      runAnalyze();
    }
  });

  suggestionsEl.addEventListener("mousedown", (e) => {
    const row = e.target.closest("[data-symbol]");
    if (!row) return;
    e.preventDefault();
    const picked = suggestions.find((item) => item.symbol === row.dataset.symbol);
    if (picked) chooseSuggestion(picked);
  });

  suggestionsEl.addEventListener("mousemove", (e) => {
    const row = e.target.closest("[data-symbol]");
    if (!row) return;
    const idx = suggestions.findIndex((item) => item.symbol === row.dataset.symbol);
    if (idx < 0 || idx === activeSuggestionIndex) return;
    activeSuggestionIndex = idx;
    renderSuggestions();
  });

  timeframeWrap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-window]");
    if (!btn) return;
    const windowDays = Number(btn.dataset.window || 180);
    if (!windowDays || Number.isNaN(windowDays)) return;
    selectedWindowDays = windowDays;
    setActiveTimeframe(selectedWindowDays);
    if (currentSymbol) {
      runAnalyze(currentSymbol);
    }
  });

  chatSendBtn.addEventListener("click", () => {
    sendQuestion();
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendQuestion();
  });

  addPortfolioBtn.addEventListener("click", async () => {
    if (!currentPayload?.symbol) return;
    try {
      const symbol = currentPayload.symbol;
      const row = {
        symbol,
        name: currentPayload.name || symbol,
        addedAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "users", auth.currentUser.uid, "portfolioStocks", symbol), row);
      portfolio = [row, ...portfolio.filter((item) => item.symbol !== symbol)];
      renderPortfolio();
      showHint(`${symbol} added to portfolio.`, "success");
    } catch (err) {
      showHint(`Failed to add to portfolio: ${err.message}`, "error");
    }
  });

  portfolioList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove-stock]");
    if (!btn) return;
    const symbol = btn.dataset.removeStock;
    try {
      await deleteDoc(doc(db, "users", auth.currentUser.uid, "portfolioStocks", symbol));
      portfolio = portfolio.filter((item) => item.symbol !== symbol);
      renderPortfolio();
      showHint(`${symbol} removed from portfolio.`, "info");
    } catch (err) {
      showHint(`Failed to remove ${symbol}: ${err.message}`, "error");
    }
  });

  function showHint(message, type = "info") {
    hintEl.textContent = message;
    hintEl.className = `stock-hint visible ${type}`;
  }

  function clearHint() {
    hintEl.className = "stock-hint";
    hintEl.textContent = "";
  }

  function setBusy(isBusy) {
    analyzeBtn.disabled = isBusy;
    analyzeBtn.textContent = isBusy ? "Analyzing..." : "Analyze";
  }

  function setChatBusy(isBusy) {
    chatSendBtn.disabled = isBusy || !currentSymbol;
  }

  function setActiveTimeframe(days) {
    timeframeWrap.querySelectorAll("[data-window]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.window) === Number(days));
    });
  }

  function queueSuggestions(query) {
    if (suggestTimer) {
      clearTimeout(suggestTimer);
      suggestTimer = null;
    }
    suggestTimer = setTimeout(() => {
      loadSuggestions(query);
    }, 220);
  }

  async function loadSuggestions(query) {
    try {
      const rows = await fetchStockSuggestions(String(query || "").trim());
      suggestions = rows.slice(0, 14);
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

    suggestionsEl.innerHTML = "";
    suggestions.forEach((item, idx) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "stock-suggestion-item";
      if (idx === activeSuggestionIndex) {
        row.classList.add("active");
      }
      row.dataset.symbol = item.symbol;

      const left = document.createElement("span");
      left.className = "stock-suggestion-main";
      left.textContent = item.symbol;

      const right = document.createElement("span");
      right.className = "stock-suggestion-sub";
      const name = item.name || item.symbol;
      const exchange = item.exchange ? ` | ${item.exchange}` : "";
      right.textContent = `${name}${exchange}`;

      row.appendChild(left);
      row.appendChild(right);
      suggestionsEl.appendChild(row);
    });

    suggestionsEl.classList.add("visible");
  }

  function clearSuggestions() {
    suggestions = [];
    activeSuggestionIndex = -1;
    suggestionsEl.innerHTML = "";
    suggestionsEl.classList.remove("visible");
  }

  function chooseSuggestion(item) {
    if (!item?.symbol) return;
    searchInput.value = item.symbol;
    clearSuggestions();
    runAnalyze(item.symbol);
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

  async function sendQuestion() {
    if (!currentPayload || !currentSymbol) {
      showHint("Analyze a stock first before asking questions.", "info");
      return;
    }
    const question = chatInput.value.trim();
    if (!question) return;

    chatInput.value = "";
    addChatBubble("user", question);
    setChatBusy(true);

    try {
      const response = await askStockQuestion({
        symbol: currentSymbol,
        question,
        context: {
          trend: currentPayload.trend,
          verdict: currentPayload.verdict,
          metrics: currentPayload.metrics,
          newsSummary: currentPayload.news?.summary,
        },
      });
      addChatBubble("assistant", response.answer || "No response.", `Model: ${response.model || "Groq"}`);
    } catch (err) {
      addChatBubble("assistant", `Error: ${err.message}`);
    } finally {
      setChatBusy(false);
    }
  }

  function renderPortfolio() {
    if (!portfolio.length) {
      portfolioList.innerHTML = `<p class="stock-muted-text">No stocks added yet.</p>`;
      return;
    }

    portfolioList.innerHTML = portfolio
      .map(
        (item) => `
          <div class="stock-portfolio-item">
            <div>
              <p class="stock-portfolio-symbol">${item.symbol}</p>
              <p class="stock-muted-text">${item.name || item.symbol}</p>
            </div>
            <button class="stock-ghost-btn" type="button" data-remove-stock="${item.symbol}">Remove</button>
          </div>
        `
      )
      .join("");
  }

  function getStockPageUrl(symbol) {
    return `${window.location.origin}/#stock-sentiment?symbol=${encodeURIComponent(symbol)}`;
  }

  function renderBullRunStocks() {
    if (!trendingBullRun.length) {
      bullRunListEl.innerHTML = `<p class="stock-muted-text">No bullish stock ideas available right now.</p>`;
      return;
    }

    bullRunListEl.innerHTML = trendingBullRun
      .map((item) => {
        const symbol = String(item.symbol || "").toUpperCase();
        const expectedReturn = Number(item.expectedReturnPct || 0);
        const change30d = Number(item.change30dPct || 0);
        const dayChange = Number(item.dayChangePct || 0);
        const bullScore = Number(item.bullScore || 0);
        const trendClass = expectedReturn >= 0 ? "up" : "down";
        const trendLabel = String(item.trendLabel || "watchlist");
        const momentumLabel = Math.abs(change30d) > 0.05 ? "30D" : "Today";
        const momentumValue = momentumLabel === "30D" ? change30d : dayChange;
        return `
          <a class="stock-bullrun-item" href="${getStockPageUrl(symbol)}" target="_blank" rel="noopener noreferrer">
            <div class="stock-bullrun-top">
              <div>
                <p class="stock-bullrun-symbol">${symbol}</p>
                <p class="stock-muted-text">${escapeHtml(item.name || symbol)}</p>
              </div>
              <div class="stock-bullrun-side">
                <span class="stock-bullrun-return ${trendClass}">+${expectedReturn.toFixed(1)}%</span>
                <small>Expected</small>
              </div>
            </div>
            <div class="stock-bullrun-stats">
              <span class="stock-bullrun-pill">${escapeHtml(capitalize(trendLabel))}</span>
              <span class="stock-bullrun-pill">${momentumLabel} ${momentumValue >= 0 ? "+" : ""}${momentumValue.toFixed(1)}%</span>
              <span class="stock-bullrun-pill">Score ${bullScore.toFixed(0)}</span>
            </div>
            <p class="stock-bullrun-reason">${escapeHtml(item.reason || "Positive momentum and sentiment inputs.")}</p>
          </a>
        `;
      })
      .join("");
  }

  async function loadBullRunStocks() {
    bullRunMetaEl.textContent = "Loading 12M estimates...";
    bullRunListEl.innerHTML = `<p class="stock-muted-text">Scanning for bullish momentum...</p>`;
    try {
      const payload = await fetchTrendingBullRunStocks(5);
      trendingBullRun = Array.isArray(payload.items) ? payload.items : [];
      bullRunMetaEl.textContent = `${payload.horizon || "12M estimate"} | Click a stock to open it in a new tab`;
      renderBullRunStocks();
    } catch (err) {
      trendingBullRun = [];
      bullRunMetaEl.textContent = "12M estimate | market scan unavailable";
      bullRunListEl.innerHTML = `<p class="stock-muted-text">Could not load bullish stock ideas: ${escapeHtml(err.message || "Unknown error")}.</p>`;
    }
  }

  function destroyChart() {
    if (chartResizeObserver) {
      chartResizeObserver.disconnect();
      chartResizeObserver = null;
    }
    if (chartApi) {
      chartApi.remove();
    }
    chartApi = null;
    areaSeries = null;
    volumeSeries = null;
  }

  function normalizeCandles(rawRows = []) {
    const rows = [];
    for (const row of rawRows) {
      const time = Number(row?.time);
      const open = Number(row?.open);
      const close = Number(row?.close);
      const volume = Number(row?.volume || 0);
      if (!Number.isFinite(time) || !Number.isFinite(open) || !Number.isFinite(close)) continue;
      rows.push({
        time: Math.floor(time),
        open,
        close,
        volume: Number.isFinite(volume) ? volume : 0,
      });
    }
    return rows;
  }

  function renderFallbackSparkline(chartWrap, candles) {
    const closes = candles.map((row) => row.close).filter((v) => Number.isFinite(v));
    if (closes.length < 2) {
      chartWrap.innerHTML = `<p class="stock-muted-text">Not enough price data for chart.</p>`;
      return;
    }

    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = Math.max(max - min, 1e-6);
    const width = 960;
    const height = 320;
    const padX = 24;
    const padY = 20;

    const points = closes
      .map((value, idx) => {
        const x = padX + (idx / (closes.length - 1)) * (width - padX * 2);
        const y = padY + (1 - (value - min) / span) * (height - padY * 2);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    chartWrap.innerHTML = `
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="stock-fallback-svg">
        <defs>
          <linearGradient id="stock-fallback-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="rgba(125,176,255,0.28)" />
            <stop offset="100%" stop-color="rgba(125,176,255,0.04)" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(17, 21, 56, 0.35)" />
        <polyline fill="none" stroke="#7db0ff" stroke-width="3" points="${points}" />
      </svg>
    `;
  }

  function ensureChart(chartWrap) {
    if (!chartWrap) return false;
    if (chartApi && areaSeries && volumeSeries) return true;

    destroyChart();
    chartWrap.innerHTML = `<div class="stock-tv-host" id="stock-tv-host"></div>`;
    const host = chartWrap.querySelector("#stock-tv-host");
    if (!host) return false;

    chartApi = createChart(host, {
      width: host.clientWidth || 800,
      height: 320,
      layout: {
        background: { color: "rgba(17, 21, 56, 0.55)" },
        textColor: "#b0b8d8",
        fontFamily: "Plus Jakarta Sans, sans-serif",
      },
      grid: {
        vertLines: { color: "rgba(99,102,241,0.12)" },
        horzLines: { color: "rgba(99,102,241,0.12)" },
      },
      rightPriceScale: {
        borderColor: "rgba(99,102,241,0.25)",
        scaleMargins: { top: 0.1, bottom: 0.28 },
      },
      timeScale: {
        borderColor: "rgba(99,102,241,0.25)",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        vertLine: { color: "rgba(99,102,241,0.25)" },
        horzLine: { color: "rgba(99,102,241,0.25)" },
      },
    });

    const areaOptions = {
      topColor: "rgba(125, 162, 255, 0.28)",
      bottomColor: "rgba(125, 162, 255, 0.04)",
      lineColor: "#7db0ff",
      lineWidth: 2.2,
      priceLineColor: "#7db0ff",
      lastValueVisible: true,
    };

    const volumeOptions = {
      color: "#6ee7b7",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    };

    if (typeof chartApi.addSeries === "function") {
      areaSeries = chartApi.addSeries(AreaSeries, areaOptions);
      volumeSeries = chartApi.addSeries(HistogramSeries, volumeOptions);
    } else {
      areaSeries = typeof chartApi.addAreaSeries === "function" ? chartApi.addAreaSeries(areaOptions) : null;
      volumeSeries = typeof chartApi.addHistogramSeries === "function" ? chartApi.addHistogramSeries(volumeOptions) : null;
    }

    if (volumeSeries?.priceScale) {
      volumeSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
      });
    }

    const resize = () => {
      if (!chartApi) return;
      const width = Math.max(host.clientWidth || 800, 320);
      chartApi.applyOptions({ width, height: 320 });
    };

    if (typeof ResizeObserver !== "undefined") {
      chartResizeObserver = new ResizeObserver(resize);
      chartResizeObserver.observe(host);
    }
    resize();

    return Boolean(chartApi && areaSeries && volumeSeries);
  }

  function renderChart(chart = {}) {
    const chartWrap = document.getElementById("stock-chart-wrap");
    if (!chartWrap) return;

    const candles = normalizeCandles(Array.isArray(chart.candles) ? chart.candles : []);
    if (candles.length < 2) {
      destroyChart();
      chartWrap.innerHTML = `<p class="stock-muted-text">Not enough price data for chart.</p>`;
      chartMetaEl.innerHTML = "";
      return;
    }

    let chartReady = false;
    try {
      chartReady = ensureChart(chartWrap);
    } catch {
      chartReady = false;
      destroyChart();
    }

    if (!chartReady) {
      renderFallbackSparkline(chartWrap, candles);
    } else {
      const areaData = candles.map((row) => ({
        time: row.time,
        value: row.close,
      }));
      const volumeData = candles.map((row) => ({
        time: row.time,
        value: row.volume,
        color: row.close >= row.open ? "rgba(110,231,183,0.7)" : "rgba(252,165,165,0.7)",
      }));

      try {
        areaSeries.setData(areaData);
        volumeSeries.setData(volumeData);
        chartApi.timeScale().fitContent();
      } catch {
        destroyChart();
        renderFallbackSparkline(chartWrap, candles);
      }
    }

    const first = Number(candles[0].close);
    const last = Number(candles[candles.length - 1].close);
    const change = first ? ((last - first) / first) * 100 : 0;
    const changeClass = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const startLabel = formatDateFromUnix(candles[0].time);
    const endLabel = formatDateFromUnix(candles[candles.length - 1].time);
    const periodLabel = `${chart.windowDays || selectedWindowDays}D`;

    chartMetaEl.innerHTML = `
      <span>${startLabel}</span>
      <span class="stock-chart-change ${changeClass}">${change.toFixed(2)}% (${periodLabel})</span>
      <span>${endLabel}</span>
    `;
  }

  function toMetricRows(metrics = {}) {
    return [
      ["Current Price", fmtCurrency(metrics.currentPrice)],
      ["Day High", fmtCurrency(metrics.dayHigh)],
      ["Day Low", fmtCurrency(metrics.dayLow)],
      ["Prev Close", fmtCurrency(metrics.prevClose)],
      ["52 Week High", fmtCurrency(metrics.week52High)],
      ["52 Week Low", fmtCurrency(metrics.week52Low)],
      ["P/E (TTM)", fmtNum(metrics.peTTM)],
      ["Beta", fmtNum(metrics.beta)],
      ["Market Cap", fmtLarge(metrics.marketCap)],
    ];
  }

  function populate(payload) {
    currentPayload = payload;
    currentSymbol = payload.symbol;
    addPortfolioBtn.disabled = false;
    chatSendBtn.disabled = false;

    const trendValue = String(payload.trend?.label ?? "neutral").toLowerCase();
    const trendLabel = document.getElementById("stock-trend-label");
    const trendClass =
      trendValue === "positive"
        ? "positive"
        : trendValue === "negative"
        ? "negative"
        : "neutral";
    trendLabel.className = `stock-trend-label ${trendClass}`;
    trendLabel.textContent = `${trendValue.toUpperCase()} (${payload.symbol})`;

    document.getElementById("stock-trend-confidence").textContent = `Confidence: ${payload.trend?.confidence || "-"}%`;
    document.getElementById("stock-trend-model").textContent = `Sentiment Model: ${payload.trend?.model || "-"}`;

    document.getElementById("stock-reason-text").textContent = payload.reason?.text || "No reason generated.";
    document.getElementById("stock-reason-model").textContent = `Reasoning Model: ${payload.reason?.model || "-"}`;

    document.getElementById("stock-news-summary").textContent = payload.news?.summary || "No summary.";
    document.getElementById("stock-news-model").textContent = `Summary Model: ${payload.news?.model || "-"}`;

    const links = payload.news?.items || [];
    const linksEl = document.getElementById("stock-news-links");
    linksEl.innerHTML = links.length
      ? links
          .map(
            (item) => `
              <a class="stock-link-item" href="${item.url}" target="_blank" rel="noopener">
                <span>${item.title}</span>
                <small>${item.source || "News"} | ${formatDate(item.publishedAt)}</small>
              </a>
            `
          )
          .join("")
      : `<p class="stock-muted-text">No source links found.</p>`;

    const actionValue = String(payload.verdict?.action ?? "-").toLowerCase();
    const action = actionValue.toUpperCase();
    const verdictActionEl = document.getElementById("stock-verdict-action");
    verdictActionEl.className = `stock-verdict-action ${actionValue}`;
    verdictActionEl.textContent = action;
    document.getElementById("stock-verdict-confidence").textContent = `Confidence: ${payload.verdict?.confidence || "-"}%`;
    document.getElementById("stock-verdict-reason").textContent = payload.verdict?.reason || "No verdict reason.";
    document.getElementById("stock-verdict-model").textContent = `Verdict Model: ${payload.verdict?.model || "-"}`;

    const metricsGrid = document.getElementById("stock-metrics-grid");
    metricsGrid.innerHTML = toMetricRows(payload.metrics)
      .map(
        ([label, value]) => `
          <div class="stock-metric-item">
            <span>${label}</span>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");

    document.getElementById("stock-models-sentiment").textContent = `Sentiment: ${payload.models?.sentiment || "-"}`;
    document.getElementById("stock-models-llm").textContent = `LLM: ${payload.models?.llm || "-"}`;

    renderChart(payload.chart || {});
    showHint(`Loaded ${payload.symbol} sentiment successfully.`, "success");
    addChatBubble("assistant", `I loaded ${payload.symbol}. Ask me anything about this stock.`, `Model: ${payload.models?.llm || "Groq"}`);
  }

  async function runAnalyze(forcedSymbol = "") {
    const symbol = (forcedSymbol || searchInput.value.trim()).toUpperCase();
    if (!symbol) {
      showHint("Enter a stock symbol first.", "info");
      return;
    }
    const requestId = ++analyzeRequestId;
    searchInput.value = symbol;
    clearSuggestions();
    clearHint();
    setBusy(true);
    try {
      const payload = await fetchStockSentiment(symbol, { windowDays: selectedWindowDays });
      if (requestId !== analyzeRequestId) return;
      populate(payload);
    } catch (err) {
      if (requestId !== analyzeRequestId) return;
      showHint(`Failed to analyze ${symbol}: ${err.message}`, "error");
    } finally {
      if (requestId === analyzeRequestId) {
        setBusy(false);
      }
    }
  }

  async function loadPortfolio() {
    try {
      const snap = await getDocs(collection(db, "users", auth.currentUser.uid, "portfolioStocks"));
      portfolio = [];
      snap.forEach((d) => portfolio.push(d.data()));
      portfolio.sort((a, b) => String(b.addedAt || "").localeCompare(String(a.addedAt || "")));
      renderPortfolio();
    } catch (err) {
      portfolio = [];
      renderPortfolio();
      showHint(`Could not load portfolio: ${err.message}`, "error");
    }
  }

  setActiveTimeframe(selectedWindowDays);
  loadBullRunStocks();
  loadPortfolio();

  const initialSymbol = String(options?.symbol || "").trim().toUpperCase();
  if (initialSymbol) {
    searchInput.value = initialSymbol;
    runAnalyze(initialSymbol);
  }
}

function getDisplayName(user) {
  return user.displayName || user.email?.split("@")[0] || "User";
}

function getInitials(user) {
  return getDisplayName(user)
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function fmtCurrency(value) {
  if (value === undefined || value === null || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtNum(value) {
  if (value === undefined || value === null || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtLarge(value) {
  if (value === undefined || value === null || value === "") return "-";
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  if (n >= 1000) return `${(n / 1000).toFixed(2)}B`;
  return `${n.toFixed(2)}M`;
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function formatDateFromUnix(unixTime) {
  try {
    const d = new Date(Number(unixTime) * 1000);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capitalize(value) {
  const text = String(value ?? "");
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
