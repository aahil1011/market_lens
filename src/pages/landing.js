import { signOut } from "firebase/auth";
import { auth } from "../firebase.js";

/**
 * Render the Landing page into the given container.
 */
export function renderLandingPage(container, user) {
  const displayName = user.displayName || user.email?.split("@")[0] || "User";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
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
        <div class="landing-greeting">
          <h1>Hello, <span>${displayName}</span></h1>
        </div>
        <p class="landing-tagline">Stay ahead with real-time insights from world financial markets.</p>

        <div class="hero-actions">
          <div class="hero-banner">
            <div class="hero-banner-card" id="hero-banner-news-card" tabindex="0" role="button" aria-label="View Global Leaders Financial News">
              <div class="hero-corner-accent"></div>
              <div class="hero-banner-inner">
                <div class="hero-icons-row">
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="2" y1="12" x2="22" y2="12"/>
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                    </svg>
                  </div>
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
                      <polyline points="16 7 22 7 22 13"/>
                    </svg>
                  </div>
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
                      <line x1="10" y1="6" x2="18" y2="6"/>
                      <line x1="10" y1="10" x2="18" y2="10"/>
                      <line x1="10" y1="14" x2="14" y2="14"/>
                    </svg>
                  </div>
                </div>

                <h2 class="hero-banner-title">View Global Leaders<br/>Financial News</h2>
                <p class="hero-banner-desc">
                  Access curated financial insights, breaking market news, and analysis from top global leaders.
                </p>

                <div class="hero-banner-cta">
                  Explore Now
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div class="hero-banner">
            <div class="hero-banner-card" id="hero-banner-stock-card" tabindex="0" role="button" aria-label="View Stock Sentiments">
              <div class="hero-corner-accent"></div>
              <div class="hero-banner-inner">
                <div class="hero-icons-row">
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="3"/>
                      <path d="M7 15l3-3 2 2 5-6"/>
                    </svg>
                  </div>
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 1v22"/>
                      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                    </svg>
                  </div>
                  <div class="hero-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  </div>
                </div>

                <h2 class="hero-banner-title">View Stock<br/>Sentiments</h2>
                <p class="hero-banner-desc">
                  Search any stock, see sentiment trend, confidence, chart, AI reasoning, and final verdict.
                </p>

                <div class="hero-banner-cta">
                  Open Sentiment
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="landing-stats">
          <div class="stat-item">
            <div class="stat-value">50+</div>
            <div class="stat-label">Global Leaders</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">24/7</div>
            <div class="stat-label">Live Updates</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">100K+</div>
            <div class="stat-label">Articles</div>
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

  const newsCard = document.getElementById("hero-banner-news-card");
  const stockCard = document.getElementById("hero-banner-stock-card");

  newsCard.addEventListener("click", () => {
    window.location.hash = "#news";
  });

  stockCard.addEventListener("click", () => {
    window.location.hash = "#stock-sentiment";
  });

  newsCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      newsCard.click();
    }
  });

  stockCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      stockCard.click();
    }
  });
}
