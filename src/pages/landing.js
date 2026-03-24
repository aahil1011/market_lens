import { signOut } from "firebase/auth";
import { auth } from "../firebase.js";

/**
 * Render the Landing page into the given container.
 */
export function renderLandingPage(container, user) {
  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  container.innerHTML = /* html */ `
    <div class="landing-page">
      <div class="landing-bg">
        <div class="landing-blob"></div>
        <div class="landing-blob"></div>
        <div class="landing-blob"></div>
      </div>

      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#nav-logo-grad)"/>
            <path d="M12 28V18L17 22L22 14L28 24V28" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="28" cy="14" r="3" fill="white" fill-opacity="0.9"/>
            <defs>
              <linearGradient id="nav-logo-grad" x1="0" y1="0" x2="40" y2="40">
                <stop stop-color="#6366f1"/>
                <stop offset="1" stop-color="#a855f7"/>
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
            </svg>
            Logout
          </button>
        </div>
      </nav>

      <main class="landing-content">
        <section class="landing-hero">
          <div class="landing-hero-copy">
            <p class="landing-eyebrow">Notebook-Inspired Market Workspace</p>
            <h1>Build portfolios, inspect sentiment, and question every trade in one place.</h1>
            <p class="landing-tagline">
              Your sketch now maps to a single dashboard: global leader news, stock sentiment, portfolio maker, and a smart advisor with a right-side chatbot.
            </p>
          </div>

          <div class="landing-pill-row">
            <span class="landing-pill">LLM outputs are labeled</span>
            <span class="landing-pill">Charts beside the summary</span>
            <span class="landing-pill">Portfolio chat on the right</span>
          </div>
        </section>

        <section class="dashboard-shell">
          <div class="dashboard-board">
            <button class="dashboard-tile tile-news" id="dashboard-news-card" type="button">
              <div class="dashboard-tile-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <p class="dashboard-tile-kicker">Global News</p>
              <h2>View global leaders financial news</h2>
              <p class="dashboard-tile-copy">
                Track leaders, read fresh headlines, and generate a market summary from the news stream.
              </p>
              <span class="dashboard-tile-link">Open News Desk</span>
            </button>

            <button class="dashboard-tile tile-stock" id="dashboard-stock-card" type="button">
              <div class="dashboard-tile-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <path d="M7 15l3-3 2 2 5-6"/>
                </svg>
              </div>
              <p class="dashboard-tile-kicker">Sentiment Lab</p>
              <h2>View stock sentiments</h2>
              <p class="dashboard-tile-copy">
                Search any ticker and get FinBERT sentiment, price action, verdict, source links, and Q&A.
              </p>
              <span class="dashboard-tile-link">Open Stock Lab</span>
            </button>

            <button class="dashboard-tile tile-maker" id="dashboard-builder-card" type="button">
              <div class="dashboard-tile-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="4" width="18" height="16" rx="2"/>
                  <line x1="8" y1="8" x2="16" y2="8"/>
                  <line x1="8" y1="12" x2="16" y2="12"/>
                  <line x1="8" y1="16" x2="13" y2="16"/>
                </svg>
              </div>
              <p class="dashboard-tile-kicker">Portfolio Maker</p>
              <h2>Build your portfolio maker workspace</h2>
              <p class="dashboard-tile-copy">
                Add holdings, set cost basis, and manage the portfolio builder before running the advisor.
              </p>
              <span class="dashboard-tile-link">Open Portfolio Maker</span>
            </button>

            <button class="dashboard-tile tile-advisor" id="dashboard-advisor-card" type="button">
              <div class="dashboard-tile-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 17 9 11 13 15 21 7"/>
                  <polyline points="14 7 21 7 21 14"/>
                </svg>
              </div>
              <p class="dashboard-tile-kicker">Smart Advisor</p>
              <h2>Open smart portfolio advisor</h2>
              <p class="dashboard-tile-copy">
                Jump straight into the advisor summary, summary charts, notebook-style insights, and right-side chatbot.
              </p>
              <span class="dashboard-tile-link">Open Smart Advisor</span>
            </button>
          </div>

          <aside class="dashboard-rail">
            <div class="dashboard-rail-panel">
              <p class="dashboard-rail-label">Right-Side Copilot</p>
              <h3>Your portfolio maker now opens as a guided workspace.</h3>
              <p class="dashboard-rail-copy">
                The smart advisor route opens the portfolio page with the AI summary in focus, while the portfolio maker route lands you on the builder form and holdings list.
              </p>

              <div class="dashboard-chat-preview">
                <div class="dashboard-chat-bubble user">Should I rebalance this portfolio?</div>
                <div class="dashboard-chat-bubble assistant">
                  Open Smart Portfolio Advisor to see the summary graphs, LLM guidance, and the chat panel on the right.
                </div>
              </div>

              <div class="dashboard-rail-actions">
                <button class="dashboard-rail-btn" id="dashboard-rail-builder" type="button">Go To Portfolio Maker</button>
                <button class="dashboard-rail-btn ghost" id="dashboard-rail-advisor" type="button">Go To Smart Advisor</button>
              </div>

              <div class="dashboard-rail-meta">
                <div class="dashboard-meta-card">
                  <span>AI Routing</span>
                  <strong>Builder + Advisor</strong>
                </div>
                <div class="dashboard-meta-card">
                  <span>Summary Visuals</span>
                  <strong>Allocation + Decisions</strong>
                </div>
                <div class="dashboard-meta-card">
                  <span>Chat Position</span>
                  <strong>Right Sidebar</strong>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <div class="landing-stats">
          <div class="stat-item">
            <div class="stat-value">FinBERT</div>
            <div class="stat-label">Sentiment Engine</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">Groq LLM</div>
            <div class="stat-label">Advisor Responses</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">Live Charts</div>
            <div class="stat-label">Summary Graphs</div>
          </div>
        </div>
      </main>
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  });

  const newsCard = document.getElementById("dashboard-news-card");
  const stockCard = document.getElementById("dashboard-stock-card");
  const builderCard = document.getElementById("dashboard-builder-card");
  const advisorCard = document.getElementById("dashboard-advisor-card");
  const railBuilderBtn = document.getElementById("dashboard-rail-builder");
  const railAdvisorBtn = document.getElementById("dashboard-rail-advisor");

  newsCard.addEventListener("click", () => {
    window.location.hash = "#news";
  });

  stockCard.addEventListener("click", () => {
    window.location.hash = "#stock-sentiment";
  });

  builderCard.addEventListener("click", () => {
    window.location.hash = "#portfolio-advisor?focus=builder";
  });

  advisorCard.addEventListener("click", () => {
    window.location.hash = "#portfolio-advisor?focus=advisor";
  });

  railBuilderBtn.addEventListener("click", () => {
    window.location.hash = "#portfolio-advisor?focus=builder";
  });

  railAdvisorBtn.addEventListener("click", () => {
    window.location.hash = "#portfolio-advisor?focus=advisor";
  });

  [newsCard, stockCard, builderCard, advisorCard].forEach((element) => {
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        element.click();
      }
    });
  });
}
