import "./styles/global.css";
import "./styles/auth.css";
import "./styles/landing.css";
import "./styles/news.css";
import "./styles/stock.css";

import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase.js";
import { renderAuthPage } from "./pages/auth.js";
import { renderLandingPage } from "./pages/landing.js";
import { renderNewsPage } from "./pages/news.js";
import { renderStockPage } from "./pages/stock.js";

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

// Route based on hash
function route() {
  if (!currentUser) {
    renderAuthPage(app);
    return;
  }

  const hash = window.location.hash;
  if (hash === "#news") {
    renderNewsPage(app, currentUser);
  } else if (hash === "#stock-sentiment") {
    renderStockPage(app, currentUser);
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
