function parseErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

export async function fetchStockSentiment(symbol, options = {}) {
  const windowDays = Number(options.windowDays || 180);
  const res = await fetch("/api/stock-sentiment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, windowDays }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to fetch stock sentiment (${res.status})`));
  }
  return data;
}

export async function fetchStockSuggestions(query) {
  const q = String(query ?? "");
  const res = await fetch(`/api/stock-search?q=${encodeURIComponent(q)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to fetch stock suggestions (${res.status})`));
  }
  return Array.isArray(data.results) ? data.results : [];
}

export async function askStockQuestion({ symbol, question, context }) {
  const res = await fetch("/api/stock-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, question, context }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to get chat response (${res.status})`));
  }
  return data;
}
