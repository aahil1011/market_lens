import { apiUrl } from "./http.js";

function parseErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

export async function fetchLeaderNews(leaderName) {
  const res = await fetch(apiUrl(`/api/leader-news?name=${encodeURIComponent(leaderName)}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to fetch leader news (${res.status})`));
  }
  return Array.isArray(data.articles) ? data.articles : [];
}

export async function generateFinancialAnalysis(allArticles) {
  const res = await fetch(apiUrl("/api/leader-news-analysis"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ articles: Array.isArray(allArticles) ? allArticles : [] }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to generate financial analysis (${res.status})`));
  }
  return data;
}
