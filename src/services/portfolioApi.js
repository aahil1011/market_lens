function parseErrorMessage(data, fallback) {
  if (typeof data?.detail === "string") return data.detail;
  if (typeof data?.error === "string") return data.error;
  return fallback;
}

export async function fetchPortfolioAnalysis(input) {
  const payload = Array.isArray(input) ? { holdings: input } : input;
  const res = await fetch("/api/portfolio-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to analyze portfolio (${res.status})`));
  }
  return data;
}

export async function askPortfolioQuestion({ holdings, question, analysis }) {
  const res = await fetch("/api/portfolio-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdings, question, analysis }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(parseErrorMessage(data, `Failed to get portfolio chat response (${res.status})`));
  }
  return data;
}
