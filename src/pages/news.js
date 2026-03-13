import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../firebase.js";
import { LEADERS } from "../config.js";
import {
  fetchLeaderNews,
  generateFinancialAnalysis,
} from "../services/api.js";

/**
 * Render the Financial News page.
 * @param {HTMLElement} container
 * @param {import('firebase/auth').User} user
 */
export function renderNewsPage(container, user) {
  // State
  let followedLeaders = []; // [{name, articles:[]}]
  let dropdownIndex = -1;

  container.innerHTML = /* html */ `
    <div class="news-page">
      <div class="news-bg">
        <div class="news-bg-blob"></div>
        <div class="news-bg-blob"></div>
      </div>

      <!-- Reuse navbar from landing -->
      <nav class="landing-navbar" role="navigation">
        <div class="navbar-brand">
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="10" fill="url(#news-logo-grad)"/>
            <path d="M12 28V18L17 22L22 14L28 24V28" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="28" cy="14" r="3" fill="white" fill-opacity="0.9"/>
            <defs>
              <linearGradient id="news-logo-grad" x1="0" y1="0" x2="40" y2="40">
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

      <div class="news-content">
        <!-- Back link -->
        <button class="news-back-link" id="back-to-dashboard" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Go To Dashboard
        </button>

        <h1 class="news-page-title">Global Leaders Financial News</h1>
        <p class="news-page-subtitle">Search, follow, and get AI-powered insights from world leaders.</p>

        <!-- Search Section -->
        <div class="search-section">
          <div class="search-bar">
            <div class="search-input-wrapper">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/>
                <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input type="text" class="search-input" id="leader-search" placeholder="Search leader... (e.g. Elon Musk, Warren Buffett)" autocomplete="off" />
              <div class="search-dropdown" id="search-dropdown"></div>
            </div>
            <button class="follow-btn" id="follow-btn" type="button" disabled>Follow</button>
          </div>
          <div class="search-info" id="search-info">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <span id="search-info-text"></span>
          </div>
        </div>

        <!-- Followed Leaders -->
        <div class="leaders-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            Followed Leaders
          </div>
          <div id="leaders-grid" class="leaders-grid">
            <div class="leaders-empty" id="leaders-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <line x1="19" y1="10" x2="19" y2="16"/>
                <line x1="16" y1="13" x2="22" y2="13"/>
              </svg>
              <p>No leaders followed yet. Search and follow leaders above to see their financial news.</p>
            </div>
          </div>
        </div>

        <!-- BART RAG Summary -->
        <div class="summary-section">
          <div class="section-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            BART RAG Summary
          </div>
          <button class="summary-generate-btn" id="generate-summary-btn" type="button" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            Generate AI Summary
          </button>

          <div class="summary-card" id="summary-card">
            <div class="summary-card-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
              </svg>
              <h3>AI-Powered Financial Analysis</h3>
              <span id="summary-source-badge" style="margin-left:auto; font-size:0.72rem; padding:3px 10px; border-radius:999px; background:rgba(99,102,241,0.12); color:var(--accent-primary); font-weight:600;"></span>
            </div>
            <div class="summary-text" id="summary-text"></div>

            <div id="bullets-section" style="display:none; margin-bottom:20px;">
              <p class="commodities-title">📰 Key Headlines</p>
              <ul id="bullets-list" style="list-style:none; display:flex; flex-direction:column; gap:8px;"></ul>
            </div>

            <div id="commodities-section" style="display:none;">
              <p class="commodities-title">📊 Commodity Outlook</p>
              <div class="commodities-grid" id="commodities-grid"></div>
            </div>

            <div id="sectors-section" style="display:none; margin-top:20px;">
              <p class="commodities-title">🏦 Market Sectors</p>
              <div id="sectors-grid" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>

            <div id="market-nature-section" style="display:none; margin-top:20px;"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  // DOM refs
  const searchInput = document.getElementById("leader-search");
  const dropdown = document.getElementById("search-dropdown");
  const followBtn = document.getElementById("follow-btn");
  const searchInfoEl = document.getElementById("search-info");
  const searchInfoText = document.getElementById("search-info-text");
  const leadersGrid = document.getElementById("leaders-grid");
  const leadersEmpty = document.getElementById("leaders-empty");
  const generateBtn = document.getElementById("generate-summary-btn");
  const summaryCard = document.getElementById("summary-card");
  const summaryText = document.getElementById("summary-text");
  const summarySourceBadge = document.getElementById("summary-source-badge");
  const bulletsSection = document.getElementById("bullets-section");
  const bulletsList = document.getElementById("bullets-list");
  const commoditiesSection = document.getElementById("commodities-section");
  const commoditiesGrid = document.getElementById("commodities-grid");
  const sectorsSection = document.getElementById("sectors-section");
  const sectorsGrid = document.getElementById("sectors-grid");
  const marketNatureSection = document.getElementById("market-nature-section");

  let selectedLeader = "";

  // ---- Back to dashboard ----
  document.getElementById("back-to-dashboard").addEventListener("click", () => {
    window.location.hash = "";
  });

  // ---- Search autocomplete ----
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    selectedLeader = "";
    followBtn.disabled = true;
    dropdownIndex = -1;

    if (!query) {
      hideDropdown();
      return;
    }

    const matches = LEADERS.filter((l) =>
      l.toLowerCase().includes(query)
    );

    if (matches.length === 0) {
      dropdown.innerHTML = `
        <div class="search-dropdown-item" style="color: var(--text-muted); cursor:default;">
          No leaders found matching "${searchInput.value.trim()}"
        </div>`;
      showDropdown();
      return;
    }

    dropdown.innerHTML = matches
      .map((name) => {
        const idx = name.toLowerCase().indexOf(query);
        const before = name.slice(0, idx);
        const match = name.slice(idx, idx + query.length);
        const after = name.slice(idx + query.length);
        return `
          <div class="search-dropdown-item" data-name="${name}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <span>${before}<span class="highlight">${match}</span>${after}</span>
          </div>`;
      })
      .join("");

    showDropdown();

    // Click on item
    dropdown.querySelectorAll(".search-dropdown-item[data-name]").forEach((item) => {
      item.addEventListener("click", () => {
        selectLeader(item.dataset.name);
      });
    });
  });

  // Keyboard nav
  searchInput.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".search-dropdown-item[data-name]");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      dropdownIndex = Math.min(dropdownIndex + 1, items.length - 1);
      updateDropdownActive(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      dropdownIndex = Math.max(dropdownIndex - 1, 0);
      updateDropdownActive(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (dropdownIndex >= 0 && items[dropdownIndex]) {
        selectLeader(items[dropdownIndex].dataset.name);
      } else if (selectedLeader) {
        followBtn.click();
      }
    } else if (e.key === "Escape") {
      hideDropdown();
    }
  });

  function updateDropdownActive(items) {
    items.forEach((item, i) =>
      item.classList.toggle("active", i === dropdownIndex)
    );
  }

  function selectLeader(name) {
    selectedLeader = name;
    searchInput.value = name;
    followBtn.disabled = false;
    hideDropdown();
  }

  function showDropdown() {
    dropdown.classList.add("visible");
  }

  function hideDropdown() {
    dropdown.classList.remove("visible");
    dropdownIndex = -1;
  }

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-input-wrapper")) {
      hideDropdown();
    }
  });

  // ---- Follow button ----
  followBtn.addEventListener("click", async () => {
    if (!selectedLeader) {
      showInfo("Please select a leader from the dropdown first.", "info");
      return;
    }

    if (followedLeaders.some((l) => l.name === selectedLeader)) {
      showInfo(`${selectedLeader} is already in your followed list.`, "info");
      return;
    }

    const name = selectedLeader;
    showInfo(`Following ${name} and fetching latest news...`, "info");

    // Save to Firestore
    try {
      const userRef = doc(db, "users", auth.currentUser.uid, "followedLeaders", name);
      await setDoc(userRef, { name, followedAt: new Date().toISOString() });
    } catch (err) {
      console.error("Firestore save failed:", err);
    }

    // Add to local state with loading
    const leader = { name, articles: [], loading: true };
    followedLeaders.push(leader);
    renderLeaders();
    updateGenerateBtn();

    // Fetch news
    try {
      leader.articles = await fetchLeaderNews(name);
    } catch (err) {
      leader.error = err.message;
    }
    leader.loading = false;
    renderLeaders();

    // Reset
    searchInput.value = "";
    selectedLeader = "";
    followBtn.disabled = true;
    showInfo(`✓ Now following ${name}!`, "success");
    setTimeout(() => hideInfo(), 3000);
  });

  // ---- Show/hide info toast ----
  function showInfo(msg, type = "info") {
    searchInfoText.textContent = msg;
    searchInfoEl.className = `search-info visible ${type}`;
  }

  function hideInfo() {
    searchInfoEl.classList.remove("visible");
  }

  // ---- Render followed leaders ----
  function renderLeaders() {
    if (followedLeaders.length === 0) {
      leadersGrid.innerHTML = "";
      leadersGrid.appendChild(leadersEmpty);
      leadersEmpty.style.display = "";
      return;
    }

    leadersEmpty.style.display = "none";
    // Keep the empty el but hide it
    const cards = followedLeaders
      .map(
        (leader, idx) => `
      <div class="leader-card" style="animation-delay: ${idx * 0.08}s">
        <div class="leader-card-header">
          <div class="leader-card-name">
            <div class="leader-avatar">${leader.name
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)}</div>
            <div>
              <h3>${leader.name}</h3>
              <span>Latest financial news from X / Web</span>
            </div>
          </div>
          <button class="leader-unfollow-btn" data-unfollow="${leader.name}" type="button">Unfollow</button>
        </div>
        <div class="leader-news-list">
          ${
            leader.loading
              ? `<div class="news-loading"><div class="mini-spinner"></div> Fetching news for ${leader.name}…</div>`
              : leader.error
              ? `<div class="news-loading" style="color: var(--error);">⚠ ${leader.error}</div>`
              : leader.articles.length === 0
              ? `<div class="news-loading" style="color: var(--text-muted);">No recent financial news found.</div>`
              : leader.articles
                  .slice(0, 5)
                  .map(
                    (a) => `
                <a href="${a.url}" target="_blank" rel="noopener" class="news-item">
                  <img class="news-item-img" src="${a.image || ""}" alt="" loading="lazy" onerror="this.style.display='none'" />
                  <div class="news-item-content">
                    <div class="news-item-title">${a.title}</div>
                    <div class="news-item-meta">
                      <span>${a.source?.name || "News"}</span>
                      <span>•</span>
                      <span>${formatDate(a.publishedAt)}</span>
                    </div>
                  </div>
                </a>
              `
                  )
                  .join("")
          }
        </div>
      </div>
    `
      )
      .join("");

    leadersGrid.innerHTML = cards;

    // Unfollow handlers
    leadersGrid.querySelectorAll("[data-unfollow]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const name = btn.dataset.unfollow;
        followedLeaders = followedLeaders.filter((l) => l.name !== name);
        renderLeaders();
        updateGenerateBtn();

        // Remove from Firestore
        try {
          await deleteDoc(
            doc(db, "users", auth.currentUser.uid, "followedLeaders", name)
          );
        } catch (err) {
          console.error("Firestore delete failed:", err);
        }
      });
    });
  }

  // ---- Generate summary ----
  function updateGenerateBtn() {
    const hasArticles = followedLeaders.some((l) => l.articles?.length > 0);
    generateBtn.disabled = !hasArticles;
  }

  generateBtn.addEventListener("click", async () => {
    const allArticles = followedLeaders.flatMap((l) => l.articles || []);
    if (!allArticles.length) return;

    generateBtn.disabled = true;
    generateBtn.innerHTML = `<span class="spinner"></span> Generating Summary…`;

    try {
      const analysis = await generateFinancialAnalysis(allArticles);

      // Source badge
      summarySourceBadge.textContent =
        analysis.summarySource === "bart" ? "⚡ BART Model" : "📝 Local Analysis";

      // Summary text
      summaryText.textContent = analysis.summary;

      // Key headlines bullets
      if (analysis.bullets && analysis.bullets.length > 0) {
        bulletsSection.style.display = "block";
        bulletsList.innerHTML = analysis.bullets
          .map((b) => `
            <li style="display:flex;gap:8px;align-items:flex-start;color:var(--text-secondary);font-size:0.85rem;line-height:1.5;">
              <span style="color:var(--accent-primary);font-size:1rem;flex-shrink:0;">•</span>
              <span>${b}</span>
            </li>`)
          .join("");
      } else {
        bulletsSection.style.display = "none";
      }

      // Commodities — with Rising/Falling label and reasons
      if (analysis.commodities.length > 0) {
        commoditiesSection.style.display = "block";
        commoditiesGrid.innerHTML = analysis.commodities
          .map((c) => {
            const arrowUp = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><polyline points="18 15 12 9 6 15"/></svg>`;
            const arrowDown = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><polyline points="6 9 12 15 18 9"/></svg>`;
            const dash = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
            const icon = c.direction === "up" ? arrowUp : c.direction === "down" ? arrowDown : dash;
            const reasonHtml = c.reasons.length
              ? `<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);line-height:1.5;">
                  ${c.reasons.map(r => `<div>• ${r}</div>`).join("")}
                </div>`
              : "";
            return `
              <div style="
                background: var(--bg-glass);
                border: 1px solid var(--border-subtle);
                border-radius: var(--radius-md);
                padding: 12px 16px;
                min-width: 200px;
                flex: 1;
              ">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                  <span class="commodity-tag ${c.direction}" style="padding:4px 10px;font-size:0.78rem;">${icon} ${c.name}</span>
                  <span style="font-size:0.8rem;font-weight:600;color:${c.direction==='up'?'#6ee7b7':c.direction==='down'?'#fca5a5':'#fcd34d'}">${c.label}</span>
                </div>
                ${reasonHtml}
              </div>`;
          })
          .join("");
        // Make commodity grid a flex wrap
        commoditiesGrid.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;";
      } else {
        commoditiesSection.style.display = "none";
      }

      // Sector breakdown
      if (analysis.sectors && analysis.sectors.length > 0) {
        sectorsSection.style.display = "block";
        sectorsGrid.innerHTML = analysis.sectors
          .map((s) => {
            const sEmoji = s.nature === "bullish" ? "🐂" : s.nature === "bearish" ? "🐻" : "⚖️";
            const sColor = s.nature === "bullish" ? "#6ee7b7" : s.nature === "bearish" ? "#fca5a5" : "#fcd34d";
            const sBg = s.nature === "bullish" ? "rgba(16,185,129,0.08)" : s.nature === "bearish" ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)";
            const sBorder = s.nature === "bullish" ? "rgba(16,185,129,0.2)" : s.nature === "bearish" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)";
            const reasonHtml = s.reasons.length
              ? `<div style="margin-top:8px;font-size:0.75rem;color:var(--text-muted);line-height:1.5;">
                  ${s.reasons.map(r => `<div>• ${r}</div>`).join("")}
                </div>`
              : "";
            return `
              <div style="
                background:${sBg};
                border:1px solid ${sBorder};
                border-radius:var(--radius-md);
                padding:14px 18px;
              ">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:1.2rem">${sEmoji}</span>
                  <span style="font-weight:600;color:var(--text-primary);font-size:0.9rem;">${s.name}</span>
                  <span style="margin-left:auto;font-size:0.78rem;font-weight:700;color:${sColor};text-transform:capitalize;">${s.nature}</span>
                </div>
                ${reasonHtml}
              </div>`;
          })
          .join("");
      } else {
        sectorsSection.style.display = "none";
      }

      // Overall market nature + reasons
      const natureEmoji = analysis.marketNature === "bullish" ? "🐂" : analysis.marketNature === "bearish" ? "🐻" : "⚖️";
      const natureLabel = analysis.marketNature.charAt(0).toUpperCase() + analysis.marketNature.slice(1);
      const reasonsHtml = analysis.marketReasons.length
        ? `<div style="margin-top:12px;font-size:0.82rem;color:var(--text-muted);line-height:1.6;">
            <div style="font-size:0.78rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:6px;">Driven by</div>
            ${analysis.marketReasons.map(r => `<div style="display:flex;gap:8px;"><span style="color:var(--accent-primary);">→</span><span>${r}</span></div>`).join("")}
          </div>`
        : "";
      marketNatureSection.style.display = "block";
      marketNatureSection.innerHTML = `
        <p class="commodities-title">📈 Overall Market Sentiment</p>
        <div class="market-nature ${analysis.marketNature}">
          <span style="font-size:1.4rem">${natureEmoji}</span>
          <div>
            <div>Overall market sentiment is <strong>${natureLabel}</strong></div>
            ${reasonsHtml}
          </div>
        </div>
      `;

      summaryCard.classList.add("visible");
    } catch (err) {
      summaryText.textContent = `Error: ${err.message}`;
      summaryCard.classList.add("visible");
      bulletsSection.style.display = "none";
      commoditiesSection.style.display = "none";
      sectorsSection.style.display = "none";
      marketNatureSection.style.display = "none";
    }

    generateBtn.disabled = false;
    generateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
      Generate AI Summary
    `;
  });

  // ---- Load followed leaders from Firestore on init ----
  async function loadFollowedLeaders() {
    try {
      const snap = await getDocs(
        collection(db, "users", auth.currentUser.uid, "followedLeaders")
      );
      const names = [];
      snap.forEach((d) => names.push(d.data().name));

      if (names.length === 0) {
        renderLeaders();
        return;
      }

      // Initialize leaders with loading state
      followedLeaders = names.map((name) => ({
        name,
        articles: [],
        loading: true,
      }));
      renderLeaders();

      // Fetch news for all leaders in parallel
      await Promise.all(
        followedLeaders.map(async (leader) => {
          try {
            leader.articles = await fetchLeaderNews(leader.name);
          } catch (err) {
            leader.error = err.message;
          }
          leader.loading = false;
        })
      );

      renderLeaders();
      updateGenerateBtn();
    } catch (err) {
      console.error("Failed to load followed leaders:", err);
      renderLeaders();
    }
  }

  loadFollowedLeaders();
}

// ---- Helpers ----
function getDisplayName(user) {
  return user.displayName || user.email?.split("@")[0] || "User";
}

function getInitials(user) {
  const name = getDisplayName(user);
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffH = Math.floor(diffMs / 3600000);

    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    if (diffH < 48) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}
