import { GNEWS_API_KEY, HF_API_TOKEN } from "../config.js";

/**
 * Fetch latest financial news for a leader via GNews API.
 */
export async function fetchLeaderNews(leaderName) {
  const query = encodeURIComponent(`${leaderName} finance OR economy OR market`);
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=5&sortby=publishedAt&token=${GNEWS_API_KEY}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.errors?.[0] || `GNews API error (${res.status})`);
    }
    const data = await res.json();
    return data.articles || [];
  } catch (err) {
    console.error(`Failed to fetch news for ${leaderName}:`, err);
    throw err;
  }
}

/**
 * Extractive summarization (local fallback):
 * Score sentences by financial keyword density, pick top 4.
 */
function extractiveSummarize(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.length > 40 && s.length < 300);

  if (sentences.length === 0) return text.slice(0, 500);

  const keywords = [
    "market", "economy", "stock", "trade", "invest", "growth", "inflation",
    "dollar", "rate", "bank", "fund", "revenue", "profit", "loss", "policy",
    "federal", "treasury", "crypto", "recession", "bull", "bear", "gdp",
    "finance", "fiscal", "tariff", "debt", "equity", "index", "nasdaq",
  ];

  return sentences
    .map((s) => ({
      s,
      score: keywords.reduce((acc, kw) => acc + (s.toLowerCase().includes(kw) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((x) => x.s)
    .join(" ");
}

/**
 * Try HF BART (CORS-compatible), fall back to local extraction.
 */
async function summarizeWithBART(text) {
  const truncated = text.slice(0, 3500);
  const endpoints = [
    "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn",
    "https://api-inference.huggingface.co/models/facebook/bart-large-cnn",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: truncated,
          parameters: { max_length: 220, min_length: 60, do_sample: false },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data[0]?.summary_text) {
        return { text: data[0].summary_text, source: "bart" };
      }
    } catch {
      continue;
    }
  }

  return { text: extractiveSummarize(text), source: "local" };
}

// ─── Dictionaries ────────────────────────────────────────────────────────────

const POSITIVE_WORDS = [
  "surge", "rises", "rise", "rose", "gain", "gained", "rally", "rallied",
  "soars", "soar", "jumps", "jump", "boosts", "boost", "record", "high",
  "growth", "grows", "bull", "bullish", "recover", "rebound", "optimism",
  "strong", "outperform", "beats", "beat", "profitable",
];

const NEGATIVE_WORDS = [
  "fall", "falls", "fell", "drop", "drops", "dropped", "decline", "declined",
  "crash", "crashes", "crashed", "slump", "slumps", "plunge", "plunges",
  "bear", "bearish", "recession", "fear", "sell-off", "loss", "losses",
  "weak", "underperform", "miss", "missed", "warning", "risk", "cut",
];

const COMMODITY_MAP = {
  Gold:          { keywords: ["gold", "bullion", "precious metal", "xau"] },
  Silver:        { keywords: ["silver", "xag"] },
  Oil:           { keywords: ["oil", "crude", "petroleum", "opec", "brent", "wti"] },
  "Natural Gas": { keywords: ["natural gas", "lng", "gas price"] },
  Crypto:        { keywords: ["bitcoin", "btc", "ethereum", "eth", "crypto", "digital asset"] },
  Wheat:         { keywords: ["wheat", "grain", "corn", "soybean"] },
  Copper:        { keywords: ["copper", "industrial metal"] },
  "Real Estate": { keywords: ["real estate", "housing", "property", "reit", "mortgage"] },
  Bonds:         { keywords: ["bond", "bonds", "treasury", "yield", "fixed income"] },
};

// Sectors for market nature breakdown
const SECTOR_MAP = {
  "Information Technology": {
    keywords: ["tech", "technology", "software", "semiconductor", "chip", "ai", "cloud", "nasdaq", "apple", "google", "microsoft", "meta", "nvidia"],
  },
  "Energy": {
    keywords: ["energy", "oil", "gas", "petroleum", "solar", "wind", "exxon", "opec", "crude"],
  },
  "Financials": {
    keywords: ["bank", "banking", "financial", "insurance", "fed", "federal reserve", "interest rate", "credit", "jpmorgan", "goldman"],
  },
  "Crypto / Digital Assets": {
    keywords: ["bitcoin", "crypto", "ethereum", "blockchain", "defi", "coinbase", "binance"],
  },
  "Commodities": {
    keywords: ["commodity", "commodities", "gold", "silver", "copper", "wheat", "corn", "raw material"],
  },
  "Real Estate": {
    keywords: ["real estate", "housing", "property", "mortgage", "reit", "construction"],
  },
  "Consumer / Retail": {
    keywords: ["retail", "consumer", "spending", "amazon", "walmart", "ecommerce", "sales"],
  },
  "Healthcare / Pharma": {
    keywords: ["health", "pharma", "drug", "fda", "biotech", "vaccine", "hospital"],
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countWords(text, words) {
  const lower = text.toLowerCase();
  return words.filter((w) => lower.includes(w)).length;
}

/**
 * Find articles that contain a keyword and return their titles as reasons.
 */
function findReasons(articles, keywords, sentimentWords, maxReasons = 3) {
  const reasons = [];
  for (const article of articles) {
    const text = `${article.title} ${article.description || ""}`.toLowerCase();
    const hasKeyword = keywords.some((kw) => text.includes(kw));
    const hasSentiment = sentimentWords.some((w) => text.includes(w));
    if (hasKeyword || hasSentiment) {
      reasons.push(article.title);
      if (reasons.length >= maxReasons) break;
    }
  }
  return reasons;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Generate comprehensive financial analysis from articles.
 */
export async function generateFinancialAnalysis(allArticles) {
  if (!allArticles.length) {
    return {
      summary: "No articles available. Follow some leaders to get started.",
      summarySource: "none",
      bullets: [],
      commodities: [],
      sectors: [],
      marketNature: "neutral",
      marketReasons: [],
    };
  }

  const combinedText = allArticles.map((a) => `${a.title}. ${a.description || ""}`).join(" ");
  const lowerText = combinedText.toLowerCase();

  // 1. Summary
  const { text: summary, source: summarySource } = await summarizeWithBART(combinedText);

  // 2. Top headlines
  const bullets = allArticles.slice(0, 5).map((a) => a.title).filter(Boolean);

  // 3. Commodities — direction + label + reasons
  const commodities = [];
  for (const [name, { keywords }] of Object.entries(COMMODITY_MAP)) {
    if (!keywords.some((kw) => lowerText.includes(kw))) continue;

    // Score sentiment in sentences that contain this commodity
    const relevantSentences = combinedText
      .split(/(?<=[.?!])\s+/)
      .filter((s) => keywords.some((kw) => s.toLowerCase().includes(kw)));

    const relevantText = relevantSentences.join(" ").toLowerCase();
    const pos = countWords(relevantText, POSITIVE_WORDS);
    const neg = countWords(relevantText, NEGATIVE_WORDS);

    const direction = pos > neg ? "up" : pos < neg ? "down" : "neutral";
    const label =
      direction === "up" ? "Rising" :
      direction === "down" ? "Falling" : "Stable";

    // Pick 1-2 reasons from article titles
    const reasons = findReasons(allArticles, keywords,
      direction === "up" ? POSITIVE_WORDS : NEGATIVE_WORDS, 2);

    commodities.push({ name, direction, label, reasons });
  }

  // 4. Sector breakdown
  const sectors = [];
  for (const [sectorName, { keywords }] of Object.entries(SECTOR_MAP)) {
    if (!keywords.some((kw) => lowerText.includes(kw))) continue;

    const relevantSentences = combinedText
      .split(/(?<=[.?!])\s+/)
      .filter((s) => keywords.some((kw) => s.toLowerCase().includes(kw)));

    const relevantText = relevantSentences.join(" ").toLowerCase();
    const pos = countWords(relevantText, POSITIVE_WORDS);
    const neg = countWords(relevantText, NEGATIVE_WORDS);

    const nature = pos > neg ? "bullish" : pos < neg ? "bearish" : "neutral";
    const reasons = findReasons(allArticles, keywords,
      nature === "bullish" ? POSITIVE_WORDS : NEGATIVE_WORDS, 2);

    sectors.push({ name: sectorName, nature, reasons });
  }

  // 5. Overall market nature
  const overallPos = countWords(lowerText, POSITIVE_WORDS);
  const overallNeg = countWords(lowerText, NEGATIVE_WORDS);
  const marketNature = overallPos > overallNeg ? "bullish" : overallNeg > overallPos ? "bearish" : "neutral";

  // Reasons for overall market nature
  const marketReasons = findReasons(
    allArticles,
    [], // no keyword filter — all articles contribute
    marketNature === "bullish" ? POSITIVE_WORDS : NEGATIVE_WORDS,
    3
  );

  return {
    summary,
    summarySource,
    bullets,
    commodities,
    sectors,
    marketNature,
    marketReasons,
  };
}
