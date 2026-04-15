import "./styles/global.css";
import "./styles/auth.css";
import "./styles/landing.css";
import "./styles/news.css";
import "./styles/stock.css";
import "./styles/portfolio.css";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { renderAuthPage } from "./pages/auth.js";
import { renderLandingPage } from "./pages/landing.js";
import { renderNewsPage } from "./pages/news.js";
import { renderStockPage } from "./pages/stock.js";
import { renderPortfolioPage } from "./pages/portfolio.js";

const app = document.getElementById("app");

// Loading screen while Firebase resolves auth state
app.innerHTML = `
  <div style="
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-primary);
  ">
    <div style="text-align: center;">
      <div style="
        width: 40px; height: 40px;
        border: 3px solid rgba(99,102,241,.2);
        border-top-color: #6366f1;
        border-radius: 50%;
        animation: spin .6s linear infinite;
        margin: 0 auto 16px;
      "></div>
      <p style="color: var(--text-secondary); font-size: .9rem;">Loading MarketLens…</p>
    </div>
  </div>
`;

let currentUser = null;

function parseHashState() {
  const hash = window.location.hash || "";
  const [route = "", query = ""] = hash.split("?");
  return {
    route,
    params: new URLSearchParams(query),
  };
}

// Route based on hash
function route() {
  if (!currentUser) {
    renderAuthPage(app);
    return;
  }

  const { route: hashRoute, params } = parseHashState();
  if (hashRoute === "#news") {
    renderNewsPage(app, currentUser);
  } else if (hashRoute === "#stock-sentiment") {
    renderStockPage(app, currentUser, { symbol: params.get("symbol") || "" });
  } else if (hashRoute === "#portfolio-advisor") {
    renderPortfolioPage(app, currentUser, {
      focus: params.get("focus") || "",
    });
  } else {
    renderLandingPage(app, currentUser);
  }
}

// Listen to auth state
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  route();
});

// Listen to hash changes for SPA navigation
window.addEventListener("hashchange", () => {
  if (currentUser) {
    route();
  }
});

// --- Theme Toggle Implementation ---
function initTheme() {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme) {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }

  const toggleBtn = document.createElement("button");
  toggleBtn.innerHTML = "🌓";
  toggleBtn.style.position = "fixed";
  toggleBtn.style.bottom = "20px";
  toggleBtn.style.right = "20px";
  toggleBtn.style.zIndex = "9999";
  toggleBtn.style.width = "48px";
  toggleBtn.style.height = "48px";
  toggleBtn.style.borderRadius = "var(--radius-full)";
  toggleBtn.style.background = "var(--bg-card)";
  toggleBtn.style.color = "var(--text-primary)";
  toggleBtn.style.border = "1px solid var(--border-subtle)";
  toggleBtn.style.boxShadow = "var(--shadow-lg)";
  toggleBtn.style.display = "flex";
  toggleBtn.style.alignItems = "center";
  toggleBtn.style.justifyContent = "center";
  toggleBtn.style.fontSize = "24px";
  toggleBtn.style.cursor = "pointer";
  toggleBtn.title = "Toggle Light/Dark Mode";

  toggleBtn.addEventListener("mouseenter", () => {
    toggleBtn.style.background = "var(--bg-glass-hover)";
  });
  toggleBtn.addEventListener("mouseleave", () => {
    toggleBtn.style.background = "var(--bg-card)";
  });

  toggleBtn.addEventListener("click", () => {
    let currentTheme = document.documentElement.getAttribute("data-theme");
    let newTheme = currentTheme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
  });

  document.body.appendChild(toggleBtn);
}
initTheme();
