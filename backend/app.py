import json
import math
import os
import random
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


load_dotenv()


def env(*keys: str) -> str:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value.strip()
    return ""


def env_list(*keys: str) -> list[str]:
    raw = env(*keys)
    if not raw:
        return []
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


FINNHUB_API_KEY = env("FINNHUB_API_KEY")
GNEWS_API_KEY = env("GNEWS_API_KEY", "VITE_GNEWS_API_KEY")
HF_API_TOKEN = env("HF_API_TOKEN", "VITE_HF_API_TOKEN")
GROQ_API_KEY = env("GROQ_API_KEY")
GROQ_MODEL = env("GROQ_MODEL") or "llama-3.3-70b-versatile"
FINBERT_MODEL  = "./backend/lora-finbert"
FINGPT_MODEL   = "./backend/fingpt-lora"        # Fine-tuned FinGPT adapter (LoRA + RLHF)
FINGPT_BASE    = "Qwen/Qwen1.5-0.5B"           # Base model for FinGPT adapter
DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
BACKEND_CORS_ORIGINS = env_list("BACKEND_CORS_ORIGINS", "CORS_ORIGINS") or DEFAULT_CORS_ORIGINS

POSITIVE_WORDS = [
    "surge",
    "rally",
    "beat",
    "growth",
    "strong",
    "bullish",
    "gain",
    "upgrade",
    "record",
    "optimistic",
]

NEGATIVE_WORDS = [
    "drop",
    "decline",
    "miss",
    "weak",
    "bearish",
    "selloff",
    "downgrade",
    "risk",
    "warning",
    "loss",
]

ANALYSIS_POSITIVE_WORDS = [
    "surge",
    "rises",
    "rise",
    "rose",
    "gain",
    "gained",
    "rally",
    "rallied",
    "soars",
    "soar",
    "jumps",
    "jump",
    "boosts",
    "boost",
    "record",
    "high",
    "growth",
    "grows",
    "bull",
    "bullish",
    "recover",
    "rebound",
    "optimism",
    "strong",
    "outperform",
    "beats",
    "beat",
    "profitable",
]

ANALYSIS_NEGATIVE_WORDS = [
    "fall",
    "falls",
    "fell",
    "drop",
    "drops",
    "dropped",
    "decline",
    "declined",
    "crash",
    "crashes",
    "crashed",
    "slump",
    "slumps",
    "plunge",
    "plunges",
    "bear",
    "bearish",
    "recession",
    "fear",
    "sell-off",
    "loss",
    "losses",
    "weak",
    "underperform",
    "miss",
    "missed",
    "warning",
    "risk",
    "cut",
]

ANALYSIS_COMMODITY_MAP: dict[str, dict[str, list[str]]] = {
    "Gold": {"keywords": ["gold", "bullion", "precious metal", "xau"]},
    "Silver": {"keywords": ["silver", "xag"]},
    "Oil": {"keywords": ["oil", "crude", "petroleum", "opec", "brent", "wti"]},
    "Natural Gas": {"keywords": ["natural gas", "lng", "gas price"]},
    "Crypto": {"keywords": ["bitcoin", "btc", "ethereum", "eth", "crypto", "digital asset"]},
    "Wheat": {"keywords": ["wheat", "grain", "corn", "soybean"]},
    "Copper": {"keywords": ["copper", "industrial metal"]},
    "Real Estate": {"keywords": ["real estate", "housing", "property", "reit", "mortgage"]},
    "Bonds": {"keywords": ["bond", "bonds", "treasury", "yield", "fixed income"]},
}

ANALYSIS_SECTOR_MAP: dict[str, dict[str, list[str]]] = {
    "Information Technology": {
        "keywords": ["tech", "technology", "software", "semiconductor", "chip", "ai", "cloud", "nasdaq", "apple", "google", "microsoft", "meta", "nvidia"]
    },
    "Energy": {
        "keywords": ["energy", "oil", "gas", "petroleum", "solar", "wind", "exxon", "opec", "crude"]
    },
    "Financials": {
        "keywords": ["bank", "banking", "financial", "insurance", "fed", "federal reserve", "interest rate", "credit", "jpmorgan", "goldman"]
    },
    "Crypto / Digital Assets": {
        "keywords": ["bitcoin", "crypto", "ethereum", "blockchain", "defi", "coinbase", "binance"]
    },
    "Commodities": {
        "keywords": ["commodity", "commodities", "gold", "silver", "copper", "wheat", "corn", "raw material"]
    },
    "Real Estate": {
        "keywords": ["real estate", "housing", "property", "mortgage", "reit", "construction"]
    },
    "Consumer / Retail": {
        "keywords": ["retail", "consumer", "spending", "amazon", "walmart", "ecommerce", "sales"]
    },
    "Healthcare / Pharma": {
        "keywords": ["health", "pharma", "drug", "fda", "biotech", "vaccine", "hospital"]
    },
}

POPULAR_STOCKS = [
    {"symbol": "AAPL", "name": "Apple Inc", "exchange": "US"},
    {"symbol": "MSFT", "name": "Microsoft Corp", "exchange": "US"},
    {"symbol": "NVDA", "name": "NVIDIA Corp", "exchange": "US"},
    {"symbol": "AMZN", "name": "Amazon.com Inc", "exchange": "US"},
    {"symbol": "GOOGL", "name": "Alphabet Inc", "exchange": "US"},
    {"symbol": "META", "name": "Meta Platforms Inc", "exchange": "US"},
    {"symbol": "TSLA", "name": "Tesla Inc", "exchange": "US"},
    {"symbol": "NFLX", "name": "Netflix Inc", "exchange": "US"},
    {"symbol": "JPM", "name": "JPMorgan Chase & Co", "exchange": "US"},
    {"symbol": "V", "name": "Visa Inc", "exchange": "US"},
    {"symbol": "WMT", "name": "Walmart Inc", "exchange": "US"},
    {"symbol": "XOM", "name": "Exxon Mobil Corp", "exchange": "US"},
    {"symbol": "BRK.B", "name": "Berkshire Hathaway Inc", "exchange": "US"},
    {"symbol": "TCS.NS", "name": "Tata Consultancy Services", "exchange": "NSE"},
    {"symbol": "RELIANCE.NS", "name": "Reliance Industries", "exchange": "NSE"},
    {"symbol": "INFY.NS", "name": "Infosys Ltd", "exchange": "NSE"},
    {"symbol": "HDFCBANK.NS", "name": "HDFC Bank", "exchange": "NSE"},
    {"symbol": "SBIN.NS", "name": "State Bank of India", "exchange": "NSE"},
]

TRENDING_BULL_RUN_CANDIDATES = [
    {"symbol": "NVDA", "name": "NVIDIA Corp"},
    {"symbol": "MSFT", "name": "Microsoft Corp"},
    {"symbol": "AAPL", "name": "Apple Inc"},
    {"symbol": "AMZN", "name": "Amazon.com Inc"},
    {"symbol": "META", "name": "Meta Platforms Inc"},
    {"symbol": "GOOGL", "name": "Alphabet Inc"},
]

TRENDING_BULL_RUN_CACHE: dict[str, Any] = {
    "expiresAt": datetime(1970, 1, 1, tzinfo=timezone.utc),
    "items": [],
}

PORTFOLIO_RISK_PROFILES: dict[str, dict[str, Any]] = {
    "Low": {
        "allocationBase": {"Stocks": 20.0, "Bonds": 60.0, "Gold": 15.0, "Cash": 5.0},
        "allocationTilt": {"Stocks": 4.0, "Bonds": -3.0, "Gold": -1.0, "Cash": 0.0},
        "allocationRanges": {"Stocks": (10.0, 30.0), "Bonds": (50.0, 70.0), "Gold": (10.0, 20.0), "Cash": (5.0, 10.0)},
        "expectedReturnRange": (6.0, 10.0),
        "defaultExpectedReturn": 8.0,
        "explanation": (
            "This low-risk portfolio prioritizes stability with a bond-heavy allocation, a meaningful gold hedge, "
            "and a liquidity reserve while keeping a modest equity sleeve for long-term growth."
        ),
    },
    "Medium": {
        "allocationBase": {"Stocks": 50.0, "Bonds": 35.0, "Gold": 10.0, "Cash": 5.0},
        "allocationTilt": {"Stocks": 5.0, "Bonds": -4.0, "Gold": -1.0, "Cash": 0.0},
        "allocationRanges": {"Stocks": (40.0, 60.0), "Bonds": (30.0, 50.0), "Gold": (5.0, 15.0), "Cash": (5.0, 10.0)},
        "expectedReturnRange": (10.0, 15.0),
        "defaultExpectedReturn": 12.0,
        "explanation": (
            "This medium-risk portfolio balances growth and stability by pairing a diversified equity core with bonds, "
            "gold, and cash to manage drawdowns and preserve flexibility."
        ),
    },
    "High": {
        "allocationBase": {"Stocks": 70.0, "Bonds": 20.0, "Gold": 7.0, "Cash": 3.0},
        "allocationTilt": {"Stocks": 6.0, "Bonds": -4.0, "Gold": -1.0, "Cash": -1.0},
        "allocationRanges": {"Stocks": (60.0, 80.0), "Bonds": (10.0, 30.0), "Gold": (5.0, 10.0), "Cash": (0.0, 5.0)},
        "expectedReturnRange": (15.0, 20.0),
        "defaultExpectedReturn": 17.0,
        "explanation": (
            "This high-risk portfolio focuses on growth through equities while keeping smaller allocations to bonds, "
            "gold, and cash for diversification, downside cushioning, and liquidity."
        ),
    },
}

ASSET_ALLOCATION_PRINCIPLE = (
    "Asset allocation balances risk and return by adjusting exposure to stocks for growth and bonds for stability, "
    "while gold hedges shocks and cash preserves liquidity."
)


class StockSentimentRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=15)
    windowDays: int = Field(default=180, ge=7, le=1460)


class StockChatRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=15)
    question: str = Field(min_length=1, max_length=1000)
    context: dict[str, Any] | None = None


class PortfolioHolding(BaseModel):
    symbol: str = Field(min_length=1, max_length=15)
    shares: float = Field(gt=0, le=1_000_000)
    avgBuyPrice: float = Field(ge=0)
    assetType: str | None = None
    sector: str | None = None


class PortfolioAnalyzeRequest(BaseModel):
    holdings: list[PortfolioHolding] = Field(default_factory=list, max_length=60)
    amount: float = Field(default=50_000, ge=1_000, le=1_000_000_000)
    riskLevel: str = Field(default="Medium", min_length=3, max_length=20)
    years: int = Field(default=10, ge=1, le=40)
    expectedReturn: float = Field(default=12.0, ge=0.1, le=100.0)


class PortfolioChatRequest(BaseModel):
    holdings: list[PortfolioHolding] = Field(default_factory=list, max_length=60)
    question: str = Field(min_length=1, max_length=1200)
    analysis: dict[str, Any] | None = None


class LeaderNewsAnalysisRequest(BaseModel):
    articles: list[dict[str, Any]] = Field(default_factory=list, max_length=100)


class FinoraChatMessage(BaseModel):
    role: str = Field(min_length=1, max_length=20)
    content: str = Field(min_length=1, max_length=4000)


class FinoraChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[FinoraChatMessage] = Field(default_factory=list, max_length=30)


# ─────────────────────────────────────────────────────────────────────────────
# Finora RAG Engine (Groq + FinBERT + Live Retrieval)
# ─────────────────────────────────────────────────────────────────────────────
def fetch_google_finance_quote(symbol: str) -> str:
    try:
        import urllib.request, re
        exchanges = ["NASDAQ", "NYSE", "INDEXNSE", "INDEXBOM"]
        for exch in exchanges:
            try:
                url = f"https://www.google.com/finance/quote/{symbol}:{exch}"
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                html = urllib.request.urlopen(req, timeout=5).read().decode('utf-8')
                match = re.search(r'data-last-price="([^"]+)"', html)
                if match: return match.group(1)
            except Exception:
                continue
    except Exception:
        pass
    return ""


class FinoraRAGEngine:
    """Manages the Retrieval-Augmented Generation pipeline using Groq and FinBERT."""

    SYSTEM_PROMPT = (
        "You are Finora, an expert AI financial context assistant powered by Groq. "
        "You provide precise, objective answers about stock performance, news, and market trends. "
        "When provided with live '[LIVE MARKET CONTEXT]', you must synthesize your answer heavily based on that information, explicitly mentioning the FinBERT sentiment analysis. "
        "If you do not find specific live data for an asset the user asked about, answer generally using your knowledge but explicitly state you don't have its live data. "
        "IMPORTANT: Be very concise (under 150 words). Use emojis and bullet points to make your response friendly and visually appealing. "
        "Avoid giving definitive buy/sell advice."
    )

    def chat(
        self,
        message: str,
        history: list[dict],
    ) -> dict[str, Any]:
        """Generate a RAG reply using Groq and FinBERT Context."""
        message = norm(message)

        # Build Context Block via RAG
        context_block = ""
        context_lines = []
        try:
            import re
            
            # Global Sector Sentiments
            market_news = fetch_market_news_headlines(limit=6)
            if market_news:
                leader_analysis = build_leader_news_analysis(market_news)
                sectors = leader_analysis.get("sectors", [])
                if sectors:
                    context_lines.append("Live Global Sector Sentiments:")
                    for s in sectors:
                        context_lines.append(f"• {s.get('name')}: {s.get('nature')}")
            
            # Map of common aliases to popular standard tickers
            text_upper = message.upper()
            popular_aliases = {"NIFTY": "NIFTY_50", "BANKNIFTY": "NIFTY_BANK", "APPLE": "AAPL", "MICROSOFT": "MSFT", "GOOGLE": "GOOGL", "AMAZON": "AMZN", "TESLA": "TSLA", "NVIDIA": "NVDA"}
            detected_symbols = []
            for alias, sym in popular_aliases.items():
                if alias in text_upper:
                    detected_symbols.append(sym)

            # Extract standard stock tickers (e.g. AAPL, NVDA) combining regex and basic manual mapping
            tickers = list(dict.fromkeys(re.findall(r"\b[A-Z]{2,6}\b", message) + detected_symbols))
            
            if tickers:
                symbol = tickers[0]
                print(f"[Finora] Detected ticker '{symbol}'. Triggering RAG Retrieval...")
                
                # Fetch live data
                q_price = fetch_google_finance_quote(symbol)
                if not q_price and not symbol.startswith("NIFTY"):
                    q_data = fetch_finnhub_quote(symbol)
                    q_price = str(q_data.get('c', '')) if q_data else ""
                
                news = fetch_finnhub_news(symbol) or fetch_gnews_news(symbol)
                news = dedupe_news_items(news, limit=4)
                
                if q_price:
                    context_lines.append(f"\nGoogle Finance Live Price for {symbol}: ${q_price}")
                
                if news:
                    # Score news with Custom LoRA FinBERT
                    texts = [f"{n.get('title')} {n.get('description', '')}" for n in news]
                    scored = FINBERT.score_texts(texts)
                    
                    context_lines.append(f"\nRecent News & FinBERT Sentiments for {symbol}:")
                    for doc, score_res in zip(news, scored):
                        lbl = score_res.get("label", "Neutral")
                        context_lines.append(f"• {doc['title']} (FinBERT Sentiment: {lbl})")
                
            if context_lines:
                context_block = f"\n\n[LIVE MARKET CONTEXT]\n" + "\n".join(context_lines)
                print(f"[Finora] RAG Context built successfully.")
        except Exception as exc:
            print(f"[Finora] RAG processing error: {exc}")

        prompt = message + context_block

        # ── Groq LLM Generation ─────────────────────────────────────
        if GROQ_API_KEY:
            try:
                messages: list[dict[str, str]] = [
                    {"role": "system", "content": self.SYSTEM_PROMPT}
                ]
                for turn in history[-8:]:
                    messages.append({
                        "role": turn.get("role", "user"),
                        "content": norm(turn.get("content", "")),
                    })
                messages.append({"role": "user", "content": prompt})

                resp = post_json(
                    "https://api.groq.com/openai/v1/chat/completions",
                    {
                        "Authorization": f"Bearer {GROQ_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    {
                        "model": GROQ_MODEL,
                        "temperature": 0.3,
                        "max_tokens": 800,
                        "messages": messages,
                    },
                    timeout=45,
                )
                reply = (((resp or {}).get("choices") or [{}])[0]).get("message", {}).get("content", "")
                if reply:
                    return {"reply": norm(reply), "model": f"Groq RAG API ({GROQ_MODEL})"}
            except Exception as exc:
                print(f"[Finora] Groq generation error: {exc}")

        return {
            "reply": "I'm currently offline or missing the GROQ_API_KEY.",
            "model": "unavailable",
        }


FINORA = FinoraRAGEngine()


app = FastAPI(title="MarketLens Stock Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def iso_from_unix(ts: int | float | None) -> str:
    if ts is None:
        return datetime.now(timezone.utc).isoformat()
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def parse_date(value: str) -> datetime:
    if not value:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def fetch_json(url: str, params: dict[str, Any], timeout: int = 15) -> Any:
    try:
        resp = requests.get(url, params=params, timeout=timeout)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


def post_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int = 30) -> Any:
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=timeout)
        if resp.status_code != 200:
            return None
        return resp.json()
    except Exception:
        return None


class FinBertEngine:
    def __init__(self) -> None:
        self.pipeline = None
        self.model_name = FINBERT_MODEL
        self.loaded = False
        self.fallback = False

    def _load(self) -> None:
        if self.loaded:
            return
        self.loaded = True
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline  # type: ignore
            from peft import PeftModel  # type: ignore
            import torch  # type: ignore

            device = 0 if torch.cuda.is_available() else -1
            adapter_path = self.model_name  # ./backend/lora-finbert

            # Load base FinBERT model, then apply LoRA adapter on top
            base_model = AutoModelForSequenceClassification.from_pretrained(
                "ProsusAI/finbert", num_labels=3
            )
            model = PeftModel.from_pretrained(base_model, adapter_path)
            model = model.merge_and_unload()  # Merge LoRA weights into base for faster inference
            tokenizer = AutoTokenizer.from_pretrained(adapter_path)

            self.pipeline = pipeline(
                task="text-classification",
                model=model,
                tokenizer=tokenizer,
                top_k=None,
                device=device,
                truncation=True,
                max_length=512,
            )
            self.model_name = f"Custom LoRA FinBERT ({adapter_path})"
        except Exception as e:
            print(f"[FinBertEngine] Failed to load custom model: {e}")
            self.pipeline = None
            self.fallback = True
            self.model_name = "Lexical fallback (FinBERT unavailable)"

    def score_texts(self, texts: list[str]) -> list[dict[str, Any]]:
        self._load()
        cleaned = [norm(t)[:512] for t in texts if norm(t)]
        if not cleaned:
            return []

        if self.pipeline is not None:
            scored: list[dict[str, Any]] = []
            for i in range(0, len(cleaned), 24):
                batch = cleaned[i : i + 24]
                for text, result in zip(batch, self.pipeline(batch)):  # type: ignore[misc]
                    prob = {r["label"].lower(): float(r["score"]) for r in result}
                    pos = prob.get("positive", 0.0)
                    neg = prob.get("negative", 0.0)
                    neu = prob.get("neutral", 0.0)
                    score = pos - neg
                    dominant = "positive" if score > 0.08 else "negative" if score < -0.08 else "neutral"
                    scored.append(
                        {
                            "text": text,
                            "positive": round(pos, 4),
                            "negative": round(neg, 4),
                            "neutral": round(neu, 4),
                            "score": round(score, 4),
                            "dominant": dominant,
                        }
                    )
            return scored

        scored = []
        for text in cleaned:
            lower = text.lower()
            pos_hits = sum(1 for w in POSITIVE_WORDS if w in lower)
            neg_hits = sum(1 for w in NEGATIVE_WORDS if w in lower)
            total = pos_hits + neg_hits
            if total == 0:
                pos = 0.22
                neg = 0.22
                neu = 0.56
            else:
                pos = (pos_hits + 0.5) / (total + 1.5)
                neg = (neg_hits + 0.5) / (total + 1.5)
                neu = max(0.0, 1.0 - pos - neg)
            score = pos - neg
            dominant = "positive" if score > 0.08 else "negative" if score < -0.08 else "neutral"
            scored.append(
                {
                    "text": text,
                    "positive": round(pos, 4),
                    "negative": round(neg, 4),
                    "neutral": round(neu, 4),
                    "score": round(score, 4),
                    "dominant": dominant,
                }
            )
        return scored


FINBERT = FinBertEngine()


def aggregate_sentiment(items: list[dict[str, Any]]) -> dict[str, Any]:
    if not items:
        return {"score": 0.0, "label": "neutral", "confidence": 50}
    avg = sum(item["score"] for item in items) / len(items)
    label = "positive" if avg > 0.08 else "negative" if avg < -0.08 else "neutral"
    confidence = int(min(95, max(35, 50 + abs(avg) * 100 + min(len(items), 20))))
    return {"score": round(avg, 4), "label": label, "confidence": confidence}


def fetch_finnhub_quote(symbol: str) -> dict[str, Any]:
    if not FINNHUB_API_KEY:
        return {}
    data = fetch_json(
        "https://finnhub.io/api/v1/quote",
        {"symbol": symbol, "token": FINNHUB_API_KEY},
    )
    if not isinstance(data, dict):
        return {}
    return data


def fetch_finnhub_metrics(symbol: str) -> dict[str, Any]:
    if not FINNHUB_API_KEY:
        return {}
    data = fetch_json(
        "https://finnhub.io/api/v1/stock/metric",
        {"symbol": symbol, "metric": "all", "token": FINNHUB_API_KEY},
    )
    if not isinstance(data, dict):
        return {}
    return data.get("metric") or {}


def fetch_finnhub_candles(symbol: str, days: int = 180) -> dict[str, Any]:
    if not FINNHUB_API_KEY:
        return {}
    now = int(datetime.now(timezone.utc).timestamp())
    frm = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    resolution = "60" if days <= 14 else "D"
    data = fetch_json(
        "https://finnhub.io/api/v1/stock/candle",
        {"symbol": symbol, "resolution": resolution, "from": frm, "to": now, "token": FINNHUB_API_KEY},
    )
    if not isinstance(data, dict):
        return {}
    if data.get("s") != "ok":
        return {}
    return data


def fetch_finnhub_news(symbol: str) -> list[dict[str, Any]]:
    if not FINNHUB_API_KEY:
        return []
    date_to = datetime.now(timezone.utc).date()
    date_from = date_to - timedelta(days=10)
    data = fetch_json(
        "https://finnhub.io/api/v1/company-news",
        {
            "symbol": symbol,
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
            "token": FINNHUB_API_KEY,
        },
    )
    if not isinstance(data, list):
        return []
    items = []
    for row in data[:10]:
        items.append(
            {
                "title": norm(row.get("headline", "")),
                "description": norm(row.get("summary", "")),
                "url": row.get("url", ""),
                "publishedAt": iso_from_unix(row.get("datetime")),
                "source": "Finnhub",
            }
        )
    return [i for i in items if i["title"]]


def fetch_gnews_news(symbol: str) -> list[dict[str, Any]]:
    if not GNEWS_API_KEY:
        return []
    data = fetch_json(
        "https://gnews.io/api/v4/search",
        {
            "q": f"{symbol} stock market",
            "lang": "en",
            "max": 10,
            "sortby": "publishedAt",
            "token": GNEWS_API_KEY,
        },
    )
    if not isinstance(data, dict):
        return []
    out = []
    for row in data.get("articles", []):
        out.append(
            {
                "title": norm(row.get("title", "")),
                "description": norm(row.get("description", "")),
                "url": row.get("url", ""),
                "publishedAt": row.get("publishedAt") or datetime.now(timezone.utc).isoformat(),
                "source": "GNews",
            }
        )
    return [i for i in out if i["title"]]


def fetch_leader_news(leader_name: str, limit: int = 5) -> list[dict[str, Any]]:
    if not GNEWS_API_KEY:
        return []
    safe_name = norm(leader_name)
    safe_limit = max(1, min(10, int(limit or 5)))
    payload = fetch_json(
        "https://gnews.io/api/v4/search",
        {
            "q": f"{safe_name} finance OR economy OR market",
            "lang": "en",
            "max": safe_limit,
            "sortby": "publishedAt",
            "token": GNEWS_API_KEY,
        },
        timeout=15,
    )
    if not isinstance(payload, dict):
        return []
    items: list[dict[str, Any]] = []
    for row in (payload.get("articles") or [])[:safe_limit]:
        title = norm(row.get("title", ""))
        if not title:
            continue
        items.append(
            {
                "title": title,
                "description": norm(row.get("description", "")),
                "url": norm(row.get("url", "")),
                "image": norm(row.get("image", "")),
                "publishedAt": row.get("publishedAt") or datetime.now(timezone.utc).isoformat(),
                "source": {
                    "name": norm(((row.get("source") or {}).get("name")) or "GNews"),
                },
            }
        )
    return items


def extractive_summarize(text: str) -> str:
    sentences = [
        sentence.strip()
        for sentence in re.split(r"(?<=[.?!])\s+", re.sub(r"\s+", " ", text or ""))
        if 40 < len(sentence.strip()) < 300
    ]
    if not sentences:
        return norm(text)[:500]

    keywords = [
        "market",
        "economy",
        "stock",
        "trade",
        "invest",
        "growth",
        "inflation",
        "dollar",
        "rate",
        "bank",
        "fund",
        "revenue",
        "profit",
        "loss",
        "policy",
        "federal",
        "treasury",
        "crypto",
        "recession",
        "bull",
        "bear",
        "gdp",
        "finance",
        "fiscal",
        "tariff",
        "debt",
        "equity",
        "index",
        "nasdaq",
    ]

    ranked = sorted(
        (
            {
                "sentence": sentence,
                "score": sum(1 for keyword in keywords if keyword in sentence.lower()),
            }
            for sentence in sentences
        ),
        key=lambda item: item["score"],
        reverse=True,
    )
    return " ".join(item["sentence"] for item in ranked[:4])


def summarize_with_bart(text: str) -> dict[str, str]:
    truncated = norm(text)[:3500]
    if not truncated:
        return {"text": "", "source": "none"}

    endpoints = [
        "https://router.huggingface.co/hf-inference/models/facebook/bart-large-cnn",
        "https://api-inference.huggingface.co/models/facebook/bart-large-cnn",
    ]

    if HF_API_TOKEN:
        headers = {
            "Authorization": f"Bearer {HF_API_TOKEN}",
            "Content-Type": "application/json",
        }
        payload = {
            "inputs": truncated,
            "parameters": {"max_length": 220, "min_length": 60, "do_sample": False},
        }
        for url in endpoints:
            data = post_json(url, headers, payload, timeout=10)
            if isinstance(data, list) and data and isinstance(data[0], dict):
                summary = norm(data[0].get("summary_text", ""))
                if summary:
                    return {"text": summary, "source": "bart"}

    fallback = extractive_summarize(truncated)
    return {"text": fallback, "source": "local" if fallback else "none"}


def count_keyword_hits(text: str, words: list[str]) -> int:
    lower_text = norm(text).lower()
    return sum(1 for word in words if word in lower_text)


def find_news_reasons(
    articles: list[dict[str, Any]],
    keywords: list[str],
    sentiment_words: list[str],
    max_reasons: int = 3,
) -> list[str]:
    reasons: list[str] = []
    for article in articles:
        title = norm(article.get("title", ""))
        if not title:
            continue
        text = norm(f'{article.get("title", "")} {article.get("description", "")}').lower()
        has_keyword = any(keyword in text for keyword in keywords)
        has_sentiment = any(word in text for word in sentiment_words)
        if has_keyword or has_sentiment:
            reasons.append(title)
            if len(reasons) >= max_reasons:
                break
    return reasons


def build_leader_news_analysis(articles: list[dict[str, Any]]) -> dict[str, Any]:
    cleaned_articles = [
        {
            "title": norm(article.get("title", "")),
            "description": norm(article.get("description", "")),
        }
        for article in (articles or [])[:100]
        if norm(article.get("title", ""))
    ]

    if not cleaned_articles:
        return {
            "summary": "No articles available. Follow some leaders to get started.",
            "summarySource": "none",
            "bullets": [],
            "commodities": [],
            "sectors": [],
            "marketNature": "neutral",
            "marketReasons": [],
        }

    combined_text = " ".join(
        f'{article.get("title", "")}. {article.get("description", "")}' for article in cleaned_articles
    ).strip()
    lower_text = combined_text.lower()
    summary = summarize_with_bart(combined_text)
    bullets = [article.get("title", "") for article in cleaned_articles[:5] if article.get("title")]

    commodities: list[dict[str, Any]] = []
    for name, config in ANALYSIS_COMMODITY_MAP.items():
        keywords = config.get("keywords") or []
        if not any(keyword in lower_text for keyword in keywords):
            continue
        relevant_sentences = [
            sentence
            for sentence in re.split(r"(?<=[.?!])\s+", combined_text)
            if any(keyword in sentence.lower() for keyword in keywords)
        ]
        relevant_text = " ".join(relevant_sentences).lower()
        positive_hits = count_keyword_hits(relevant_text, ANALYSIS_POSITIVE_WORDS)
        negative_hits = count_keyword_hits(relevant_text, ANALYSIS_NEGATIVE_WORDS)
        direction = "up" if positive_hits > negative_hits else "down" if negative_hits > positive_hits else "neutral"
        label = "Rising" if direction == "up" else "Falling" if direction == "down" else "Stable"
        reason_words = ANALYSIS_POSITIVE_WORDS if direction == "up" else ANALYSIS_NEGATIVE_WORDS
        commodities.append(
            {
                "name": name,
                "direction": direction,
                "label": label,
                "reasons": find_news_reasons(cleaned_articles, keywords, reason_words, max_reasons=2),
            }
        )

    sectors: list[dict[str, Any]] = []
    for name, config in ANALYSIS_SECTOR_MAP.items():
        keywords = config.get("keywords") or []
        if not any(keyword in lower_text for keyword in keywords):
            continue
        relevant_sentences = [
            sentence
            for sentence in re.split(r"(?<=[.?!])\s+", combined_text)
            if any(keyword in sentence.lower() for keyword in keywords)
        ]
        relevant_text = " ".join(relevant_sentences).lower()
        positive_hits = count_keyword_hits(relevant_text, ANALYSIS_POSITIVE_WORDS)
        negative_hits = count_keyword_hits(relevant_text, ANALYSIS_NEGATIVE_WORDS)
        nature = "bullish" if positive_hits > negative_hits else "bearish" if negative_hits > positive_hits else "neutral"
        reason_words = ANALYSIS_POSITIVE_WORDS if nature == "bullish" else ANALYSIS_NEGATIVE_WORDS
        sectors.append(
            {
                "name": name,
                "nature": nature,
                "reasons": find_news_reasons(cleaned_articles, keywords, reason_words, max_reasons=2),
            }
        )

    overall_positive = count_keyword_hits(lower_text, ANALYSIS_POSITIVE_WORDS)
    overall_negative = count_keyword_hits(lower_text, ANALYSIS_NEGATIVE_WORDS)
    market_nature = (
        "bullish" if overall_positive > overall_negative else "bearish" if overall_negative > overall_positive else "neutral"
    )
    market_reason_words = ANALYSIS_POSITIVE_WORDS if market_nature == "bullish" else ANALYSIS_NEGATIVE_WORDS

    return {
        "summary": summary.get("text", ""),
        "summarySource": summary.get("source", "none"),
        "bullets": bullets,
        "commodities": commodities,
        "sectors": sectors,
        "marketNature": market_nature,
        "marketReasons": find_news_reasons(cleaned_articles, [], market_reason_words, max_reasons=3),
    }


def fetch_stocktwits_posts(symbol: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    data = fetch_json(
        f"https://api.stocktwits.com/api/2/streams/symbol/{symbol}.json",
        {"limit": 20},
    )
    if not isinstance(data, dict):
        return [], {"bullish": 0, "bearish": 0, "total": 0, "tagScore": 0.0}

    bullish = 0
    bearish = 0
    posts = []
    for msg in (data.get("messages") or [])[:20]:
        text = norm(str(msg.get("body", "")))
        text = re.sub(r"\$[A-Z.]+", "", text)
        text = re.sub(r"http\S+", "", text).strip()
        if len(text) < 12:
            continue
        sentiment = (((msg.get("entities") or {}).get("sentiment") or {}).get("basic") or "").lower()
        if sentiment == "bullish":
            bullish += 1
        elif sentiment == "bearish":
            bearish += 1
        posts.append(
            {
                "title": text[:140],
                "description": text[:280],
                "url": f"https://stocktwits.com/message/{msg.get('id')}" if msg.get("id") else "",
                "publishedAt": msg.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "source": "StockTwits",
            }
        )
    total = len(posts)
    labeled = bullish + bearish
    tag_ratio = bullish / labeled if labeled else 0.5
    tag_score = round(tag_ratio * 2 - 1, 4)
    return posts, {"bullish": bullish, "bearish": bearish, "total": total, "tagScore": tag_score}


def search_stocks(query: str) -> list[dict[str, str]]:
    q = norm(query).upper()
    if not q:
        return POPULAR_STOCKS[:12]

    results: list[dict[str, str]] = []
    if FINNHUB_API_KEY:
        data = fetch_json(
            "https://finnhub.io/api/v1/search",
            {"q": q, "token": FINNHUB_API_KEY},
            timeout=12,
        )
        if isinstance(data, dict):
            for row in (data.get("result") or [])[:30]:
                symbol = norm(row.get("symbol", ""))
                if not symbol:
                    continue
                description = norm(row.get("description", ""))
                exchange = norm(row.get("mic", "") or row.get("displaySymbol", ""))
                type_name = norm(row.get("type", "")).lower()
                allowed_types = ["stock", "common", "adr", "etf", "etp", "fund", "crypto", "currency", "forex", "commodity", "dr"]
                if type_name and not any(t in type_name for t in allowed_types):
                    continue
                results.append(
                    {
                        "symbol": symbol,
                        "name": description or symbol,
                        "exchange": exchange or "-",
                    }
                )

    if not results:
        for item in POPULAR_STOCKS:
            if q in item["symbol"] or q in item["name"].upper():
                results.append(item)

    unique: dict[str, dict[str, str]] = {}
    for item in results:
        unique[item["symbol"]] = item
    ordered = sorted(unique.values(), key=lambda x: (0 if x["symbol"].startswith(q) else 1, x["symbol"]))
    return ordered[:20]


def run_groq_json(prompt: str) -> dict[str, Any]:
    if not GROQ_API_KEY:
        return {}
    payload = post_json(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        {
            "model": GROQ_MODEL,
            "temperature": 0.15,
            "max_tokens": 900,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=45,
    )
    if not isinstance(payload, dict):
        return {}
    raw = ((((payload.get("choices") or [{}])[0]).get("message") or {}).get("content") or "").strip()
    raw = re.sub(r"^```(?:json)?", "", raw, flags=re.IGNORECASE).strip()
    raw = re.sub(r"```$", "", raw).strip()
    try:
        return json.loads(raw)
    except Exception:
        return {}


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def infer_asset_type(symbol: str, explicit: str | None = None) -> str:
    if explicit:
        return norm(explicit)[:40] or "Stock"
    upper = symbol.upper()
    if upper in {"GLD", "SLV", "USO", "UNG", "XAUUSD", "XAGUSD"}:
        return "Commodity"
    if upper.endswith("USD") and len(upper) <= 8:
        return "Crypto"
    if upper in {"SPY", "QQQ", "DIA", "IWM", "VOO", "VTI"}:
        return "ETF"
    return "Stock"


def infer_sector(symbol: str, asset_type: str, explicit: str | None = None) -> str:
    if explicit:
        return norm(explicit)[:40] or "Unknown"
    if asset_type == "Commodity":
        return "Commodity"
    if asset_type == "Crypto":
        return "Digital Asset"
    if asset_type == "ETF":
        return "Index"
    upper = symbol.upper()
    if upper in {"JPM", "BAC", "WFC", "GS"}:
        return "Finance"
    if upper in {"XOM", "CVX", "SHEL", "BP"}:
        return "Energy"
    if upper in {"PFE", "JNJ", "MRK", "UNH"}:
        return "Healthcare"
    return "Technology" if upper in {"AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "META"} else "Unknown"


def safe_pct_change(values: list[float], lookback: int) -> float:
    if len(values) < lookback + 1:
        return 0.0
    old = values[-(lookback + 1)]
    new = values[-1]
    if not old:
        return 0.0
    return round(((new - old) / old) * 100, 2)


def annualized_volatility(values: list[float]) -> float:
    if len(values) < 3:
        return 25.0
    rets: list[float] = []
    for prev, curr in zip(values[:-1], values[1:]):
        if prev:
            rets.append((curr - prev) / prev)
    if len(rets) < 2:
        return 25.0
    mean = sum(rets) / len(rets)
    var = sum((x - mean) ** 2 for x in rets) / max(1, len(rets) - 1)
    vol = math.sqrt(var) * math.sqrt(252) * 100
    return round(max(0.0, min(220.0, vol)), 2)


def percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    arr = sorted(values)
    if len(arr) == 1:
        return float(arr[0])
    rank = (p / 100) * (len(arr) - 1)
    lo = int(math.floor(rank))
    hi = int(math.ceil(rank))
    if lo == hi:
        return float(arr[lo])
    frac = rank - lo
    return float(arr[lo] + (arr[hi] - arr[lo]) * frac)


def dedupe_news_items(items: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for item in items:
        key = (item.get("url") or item.get("title") or "").strip().lower()
        if key and key not in unique:
            unique[key] = item
    ordered = sorted(
        unique.values(),
        key=lambda row: parse_date(row.get("publishedAt", "")).timestamp(),
        reverse=True,
    )
    return ordered[:limit]


def score_bull_run_candidate(candidate: dict[str, str]) -> dict[str, Any] | None:
    symbol = norm(candidate.get("symbol")).upper()
    if not symbol:
        return None

    quote = {}
    if FINNHUB_API_KEY:
        raw_quote = fetch_json(
            "https://finnhub.io/api/v1/quote",
            {"symbol": symbol, "token": FINNHUB_API_KEY},
            timeout=6,
        )
        quote = raw_quote if isinstance(raw_quote, dict) else {}

    candles = {}
    if FINNHUB_API_KEY:
        now_ts = int(datetime.now(timezone.utc).timestamp())
        from_ts = int((datetime.now(timezone.utc) - timedelta(days=75)).timestamp())
        raw_candles = fetch_json(
            "https://finnhub.io/api/v1/stock/candle",
            {
                "symbol": symbol,
                "resolution": "D",
                "from": from_ts,
                "to": now_ts,
                "token": FINNHUB_API_KEY,
            },
            timeout=6,
        )
        if isinstance(raw_candles, dict) and raw_candles.get("s") == "ok":
            candles = raw_candles

    finnhub_news = []
    if FINNHUB_API_KEY:
        date_to = datetime.now(timezone.utc).date()
        date_from = date_to - timedelta(days=7)
        raw_news = fetch_json(
            "https://finnhub.io/api/v1/company-news",
            {
                "symbol": symbol,
                "from": date_from.isoformat(),
                "to": date_to.isoformat(),
                "token": FINNHUB_API_KEY,
            },
            timeout=6,
        )
        if isinstance(raw_news, list):
            for row in raw_news[:4]:
                finnhub_news.append(
                    {
                        "title": norm(row.get("headline", "")),
                        "description": norm(row.get("summary", "")),
                        "url": row.get("url", ""),
                        "publishedAt": iso_from_unix(row.get("datetime")),
                        "source": "Finnhub",
                    }
                )

    news_items = dedupe_news_items(finnhub_news, limit=6)
    sentiment_scores = FINBERT.score_texts(
        [f'{item.get("title", "")}. {item.get("description", "")}' for item in news_items]
    )
    sentiment = aggregate_sentiment(sentiment_scores)

    closes = [to_float(value, 0.0) for value in (candles.get("c") or []) if to_float(value, 0.0) > 0]
    change_30d = safe_pct_change(closes, 30)
    change_90d = safe_pct_change(closes, 90)
    day_change = 0.0
    current_price = to_float(quote.get("c"), 0.0)
    prev_close = to_float(quote.get("pc"), 0.0)
    if current_price > 0 and prev_close > 0:
        day_change = round(((current_price - prev_close) / prev_close) * 100, 2)
    elif closes:
        current_price = closes[-1]

    bull_score = 50.0
    bull_score += clamp(change_30d, -20.0, 25.0) * 1.2
    bull_score += clamp(change_90d, -25.0, 40.0) * 0.45
    bull_score += clamp(day_change, -6.0, 6.0) * 0.9
    bull_score += clamp(to_float(sentiment.get("score"), 0.0), -0.35, 0.35) * 42.0
    bull_score = round(clamp(bull_score, 0.0, 100.0), 1)

    expected_return_pct = 7.0
    expected_return_pct += max(change_30d, 0.0) * 0.42
    expected_return_pct += max(change_90d, 0.0) * 0.12
    expected_return_pct += max(to_float(sentiment.get("score"), 0.0), 0.0) * 14.0
    expected_return_pct = round(clamp(expected_return_pct, 6.0, 28.0), 1)

    if current_price <= 0 and not closes and not news_items:
        return None

    trend_label = "bullish" if bull_score >= 62 else "watchlist"
    reason_bits = []
    if change_30d > 0:
        reason_bits.append(f"30D momentum {change_30d:+.1f}%")
    if change_90d > 0:
        reason_bits.append(f"90D momentum {change_90d:+.1f}%")
    if sentiment.get("label") == "positive":
        reason_bits.append("positive news sentiment")
    if not reason_bits:
        reason_bits.append("mixed inputs but resilient price action")

    return {
        "symbol": symbol,
        "name": norm(candidate.get("name")) or symbol,
        "currentPrice": round(current_price, 2) if current_price > 0 else None,
        "change30dPct": round(change_30d, 2),
        "change90dPct": round(change_90d, 2),
        "dayChangePct": round(day_change, 2),
        "expectedReturnPct": expected_return_pct,
        "trendLabel": trend_label,
        "bullScore": bull_score,
        "reason": ", ".join(reason_bits[:3]),
    }


def fallback_trending_bull_run_stocks(limit: int = 5) -> list[dict[str, Any]]:
    fallback = [
        {"symbol": "NVDA", "name": "NVIDIA Corp", "currentPrice": None, "change30dPct": 12.5, "change90dPct": 26.2, "dayChangePct": 1.1, "expectedReturnPct": 22.0, "trendLabel": "bullish", "bullScore": 82.0, "reason": "AI-led momentum and strong growth narrative"},
        {"symbol": "MSFT", "name": "Microsoft Corp", "currentPrice": None, "change30dPct": 8.7, "change90dPct": 18.6, "dayChangePct": 0.8, "expectedReturnPct": 17.5, "trendLabel": "bullish", "bullScore": 76.0, "reason": "cloud and AI demand supporting trend strength"},
        {"symbol": "AMZN", "name": "Amazon.com Inc", "currentPrice": None, "change30dPct": 7.2, "change90dPct": 16.3, "dayChangePct": 0.6, "expectedReturnPct": 16.2, "trendLabel": "bullish", "bullScore": 72.0, "reason": "consumer resilience and margin expansion tailwinds"},
        {"symbol": "META", "name": "Meta Platforms Inc", "currentPrice": None, "change30dPct": 6.8, "change90dPct": 15.1, "dayChangePct": 0.4, "expectedReturnPct": 15.8, "trendLabel": "bullish", "bullScore": 70.0, "reason": "advertising recovery and AI platform leverage"},
        {"symbol": "GOOGL", "name": "Alphabet Inc", "currentPrice": None, "change30dPct": 5.9, "change90dPct": 13.4, "dayChangePct": 0.3, "expectedReturnPct": 14.9, "trendLabel": "watchlist", "bullScore": 67.0, "reason": "search resilience with improving growth expectations"},
    ]
    return fallback[:limit]


def get_trending_bull_run_stocks(limit: int = 5) -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    expires_at = TRENDING_BULL_RUN_CACHE.get("expiresAt")
    if isinstance(expires_at, datetime) and expires_at > now and TRENDING_BULL_RUN_CACHE.get("items"):
        return list(TRENDING_BULL_RUN_CACHE.get("items") or [])[:limit]

    items: list[dict[str, Any]] = []
    for candidate in TRENDING_BULL_RUN_CANDIDATES:
        try:
            row = score_bull_run_candidate(candidate)
        except Exception:
            row = None
        if row:
            items.append(row)

    if not items:
        items = fallback_trending_bull_run_stocks(limit=max(limit, 5))
    elif len(items) < limit:
        existing = {norm(item.get("symbol")).upper() for item in items}
        for fallback in fallback_trending_bull_run_stocks(limit=max(limit, 5)):
            symbol = norm(fallback.get("symbol")).upper()
            if symbol and symbol not in existing:
                items.append(fallback)
                existing.add(symbol)
            if len(items) >= limit:
                break

    items.sort(
        key=lambda row: (
            to_float(row.get("bullScore"), 0.0),
            to_float(row.get("expectedReturnPct"), 0.0),
            to_float(row.get("change30dPct"), 0.0),
        ),
        reverse=True,
    )
    top_items = items[:limit]
    TRENDING_BULL_RUN_CACHE["expiresAt"] = now + timedelta(minutes=10)
    TRENDING_BULL_RUN_CACHE["items"] = top_items
    return top_items


def normalize_decision(value: Any) -> str:
    text = norm(value).lower().replace(" ", "")
    if text in {"buymore", "buy", "accumulate", "add"}:
        return "BuyMore"
    if text in {"sell", "reduce", "exit"}:
        return "Sell"
    return "Hold"


def normalize_sentiment(value: Any) -> str:
    text = norm(value).lower()
    if text in {"positive", "bullish"}:
        return "positive"
    if text in {"negative", "bearish"}:
        return "negative"
    return "neutral"


def normalize_risk(value: Any) -> str:
    text = norm(value).lower()
    if "high" in text:
        return "High Risk"
    if "low" in text:
        return "Low Risk"
    return "Medium Risk"


def fallback_risk(volatility: float, beta: float, sentiment_label: str) -> str:
    if volatility > 50 or beta > 1.5 or sentiment_label == "negative":
        return "High Risk"
    if volatility < 25 and beta < 1.1 and sentiment_label != "negative":
        return "Low Risk"
    return "Medium Risk"


def fallback_decision(sentiment_label: str, volatility: float, pnl_pct: float, chg_30d_pct: float) -> str:
    if sentiment_label == "negative" and (volatility > 45 or pnl_pct < -12):
        return "Sell"
    if sentiment_label == "positive" and volatility < 35 and chg_30d_pct > 0:
        return "BuyMore"
    return "Hold"


def build_position_snapshot(holding: PortfolioHolding) -> dict[str, Any]:
    symbol = norm(holding.symbol).upper()
    quote = fetch_finnhub_quote(symbol)
    metric = fetch_finnhub_metrics(symbol)
    candles = fetch_finnhub_candles(symbol, days=365)

    close_values = [to_float(x, 0.0) for x in (candles.get("c") or []) if to_float(x, 0.0) > 0]
    time_values = [int(x) for x in (candles.get("t") or []) if to_float(x, 0.0) > 0]

    current_price = to_float(quote.get("c"), 0.0)
    if current_price <= 0:
        current_price = to_float(quote.get("pc"), 0.0)
    if current_price <= 0 and close_values:
        current_price = close_values[-1]
    if current_price <= 0:
        current_price = to_float(holding.avgBuyPrice, 0.0)

    chg_7d = safe_pct_change(close_values, 5)
    chg_30d = safe_pct_change(close_values, 21)
    chg_6m = safe_pct_change(close_values, 126)
    chg_1y = safe_pct_change(close_values, 252)

    vol = annualized_volatility(close_values)
    beta = to_float(metric.get("beta"), 1.1)
    pe_ttm = to_float(metric.get("peTTM"), 0.0)

    finnhub_news = fetch_finnhub_news(symbol)
    gnews = fetch_gnews_news(symbol)
    stocktwits, _social = fetch_stocktwits_posts(symbol)
    merged_news = finnhub_news + gnews + stocktwits

    dedupe: dict[str, dict[str, Any]] = {}
    for item in merged_news:
        key = (item.get("url") or item.get("title") or "").lower()
        if key and key not in dedupe:
            dedupe[key] = item
    news_items = sorted(
        dedupe.values(),
        key=lambda x: parse_date(x.get("publishedAt", "")).timestamp(),
        reverse=True,
    )[:10]

    texts = [f'{n.get("title","")}. {n.get("description","")}' for n in news_items if n.get("title")]
    scored = FINBERT.score_texts(texts)
    agg = aggregate_sentiment(scored)

    shares = to_float(holding.shares, 0.0)
    avg_buy = to_float(holding.avgBuyPrice, 0.0)
    invested = round(shares * avg_buy, 2)
    current_value = round(shares * current_price, 2)
    pnl_usd = round(current_value - invested, 2)
    pnl_pct = round((pnl_usd / invested) * 100, 2) if invested > 0 else 0.0

    asset_type = infer_asset_type(symbol, holding.assetType)
    sector = infer_sector(symbol, asset_type, holding.sector)

    candle_points: list[dict[str, Any]] = []
    for t, c in zip(time_values[-260:], close_values[-260:]):
        candle_points.append({"time": int(t), "value": round(float(c), 4)})

    return {
        "symbol": symbol,
        "name": metric.get("name") or symbol,
        "assetType": asset_type,
        "sector": sector,
        "shares": round(shares, 6),
        "avgBuyPrice": round(avg_buy, 4),
        "currentPrice": round(current_price, 4),
        "invested": invested,
        "currentValue": current_value,
        "pnlUsd": pnl_usd,
        "pnlPct": pnl_pct,
        "changes": {
            "d7": chg_7d,
            "d30": chg_30d,
            "d180": chg_6m,
            "d365": chg_1y,
        },
        "metrics": {
            "volatility": vol,
            "beta": round(beta, 3),
            "peTTM": round(pe_ttm, 3) if pe_ttm else 0.0,
            "week52High": to_float(metric.get("52WeekHigh"), 0.0),
            "week52Low": to_float(metric.get("52WeekLow"), 0.0),
            "analystRecommendation": norm(metric.get("recommendationKey") or "hold") or "hold",
        },
        "sentimentRaw": {
            "label": agg["label"],
            "score": agg["score"],
            "confidence": agg["confidence"],
            "texts": len(texts),
        },
        "newsItems": news_items[:6],
        "priceSeries": candle_points,
    }


def build_portfolio_prompt(positions: list[dict[str, Any]], total_invested: float, total_current: float, total_pnl_pct: float) -> str:
    lines: list[str] = []
    for pos in positions:
        lines.append(
            f'{pos["symbol"]} ({pos["assetType"]}, {pos["sector"]}): '
            f'bought @ ${pos["avgBuyPrice"]}, current ${pos["currentPrice"]}, '
            f'P&L {pos["pnlPct"]:+.2f}%, sentiment={pos["sentimentRaw"]["label"]} ({pos["sentimentRaw"]["score"]:+.3f}), '
            f'volatility={pos["metrics"]["volatility"]}%, beta={pos["metrics"]["beta"]}, '
            f'analyst={pos["metrics"]["analystRecommendation"]}, 7D={pos["changes"]["d7"]:+.2f}%, '
            f'1Y={pos["changes"]["d365"]:+.2f}%, PE={pos["metrics"]["peTTM"]}'
        )

    return f"""You are a senior portfolio manager.
Analyze this portfolio and return ONLY valid JSON.

PORTFOLIO SUMMARY:
- Total invested: ${total_invested:,.2f}
- Current value:  ${total_current:,.2f}
- Overall P&L:    {total_pnl_pct:+.2f}%
- Positions:      {len(positions)}

POSITIONS:
{chr(10).join(lines)}

Return JSON with this exact structure:
{{
  "positions": {{
    "TICKER": {{
      "sentiment": "positive|negative|neutral",
      "decision": "BuyMore|Hold|Sell",
      "risk": "Low Risk|Medium Risk|High Risk",
      "reason": "2-3 concise sentences with evidence"
    }}
  }},
  "portfolio_summary": "4 concise sentences",
  "portfolio_score": 1-10,
  "diversification_rating": "Poor|Fair|Good|Excellent",
  "top_risk": "1 sentence",
  "top_opportunity": "1 sentence"
}}

Decision policy:
- BuyMore: strong positive sentiment + favorable trend + manageable risk.
- Hold: mixed signals or moderate uncertainty.
- Sell: negative sentiment + weak trend and/or high risk.
- High Risk: volatility > 50% OR beta > 1.5 OR severe negative signals.
- Low Risk: volatility < 25% and stable profile.
"""


def run_portfolio_advisor_llm(positions: list[dict[str, Any]], total_invested: float, total_current: float, total_pnl_pct: float) -> dict[str, Any]:
    fallback_positions: dict[str, dict[str, Any]] = {}
    for pos in positions:
        sent = normalize_sentiment(pos["sentimentRaw"]["label"])
        risk = fallback_risk(pos["metrics"]["volatility"], pos["metrics"]["beta"], sent)
        decision = fallback_decision(sent, pos["metrics"]["volatility"], pos["pnlPct"], pos["changes"]["d30"])
        fallback_positions[pos["symbol"]] = {
            "sentiment": sent,
            "decision": decision,
            "risk": risk,
            "reason": (
                f'Sentiment is {sent} ({pos["sentimentRaw"]["score"]:+.3f}), '
                f'30D move is {pos["changes"]["d30"]:+.2f}%, and volatility is {pos["metrics"]["volatility"]:.1f}%.'
            ),
        }

    fallback = {
        "positions": fallback_positions,
        "portfolio_summary": "Portfolio guidance generated from FinBERT and market metrics fallback.",
        "portfolio_score": 5,
        "diversification_rating": "Fair",
        "top_risk": "Concentration and volatility risk should be monitored.",
        "top_opportunity": "Positions with positive sentiment and controlled volatility may allow incremental adds.",
    }

    if not GROQ_API_KEY:
        return fallback

    prompt = build_portfolio_prompt(positions, total_invested, total_current, total_pnl_pct)
    result = run_groq_json(prompt)
    if not isinstance(result, dict) or not isinstance(result.get("positions"), dict):
        return fallback

    merged_positions: dict[str, dict[str, Any]] = {}
    for pos in positions:
        symbol = pos["symbol"]
        ai = result.get("positions", {}).get(symbol, {})
        raw_sent = ai.get("sentiment", pos["sentimentRaw"]["label"])
        raw_decision = ai.get("decision", fallback_positions[symbol]["decision"])
        raw_risk = ai.get("risk", fallback_positions[symbol]["risk"])
        reason = norm(ai.get("reason")) or fallback_positions[symbol]["reason"]
        merged_positions[symbol] = {
            "sentiment": normalize_sentiment(raw_sent),
            "decision": normalize_decision(raw_decision),
            "risk": normalize_risk(raw_risk),
            "reason": reason,
        }

    out = {
        "positions": merged_positions,
        "portfolio_summary": norm(result.get("portfolio_summary")) or fallback["portfolio_summary"],
        "portfolio_score": int(to_float(result.get("portfolio_score"), 5)),
        "diversification_rating": norm(result.get("diversification_rating")) or "Fair",
        "top_risk": norm(result.get("top_risk")) or fallback["top_risk"],
        "top_opportunity": norm(result.get("top_opportunity")) or fallback["top_opportunity"],
    }
    out["portfolio_score"] = max(1, min(10, out["portfolio_score"]))
    return out


def project_portfolio(positions: list[dict[str, Any]], months: int, simulations: int = 320) -> dict[str, Any]:
    days = max(1, int(months * 21))
    start_val = sum(to_float(p["currentValue"], 0.0) for p in positions)
    if start_val <= 0:
        return {
            "months": months,
            "days": days,
            "startValue": 0.0,
            "finalMean": 0.0,
            "finalP10": 0.0,
            "finalP90": 0.0,
            "series": [{"day": i, "mean": 0.0, "p10": 0.0, "p25": 0.0, "p75": 0.0, "p90": 0.0} for i in range(days + 1)],
            "model": "Monte Carlo (Notebook-style)",
        }

    seed = 0
    for pos in positions:
        seed += sum(ord(ch) for ch in pos["symbol"])
    seed += int(start_val) % 100_000
    rng = random.Random(seed)

    ticker_params: list[dict[str, Any]] = []
    analyst_adj_map = {
        "strongbuy": 0.01,
        "buy": 0.005,
        "hold": 0.0,
        "sell": -0.005,
        "strongsell": -0.01,
    }

    for pos in positions:
        sentiment_score = to_float(pos.get("sentimentRaw", {}).get("score"), 0.0)
        analyst_rec = str(pos.get("metrics", {}).get("analystRecommendation", "hold")).lower().replace(" ", "")
        analyst_adj = analyst_adj_map.get(analyst_rec, 0.0)
        annual_drift = 0.07 + sentiment_score * 0.02 + analyst_adj
        daily_drift = annual_drift / 252

        vol_annual = to_float(pos.get("metrics", {}).get("volatility"), 25.0)
        vol_daily = max(0.005, min(vol_annual / 100 / math.sqrt(252), 0.05))

        ticker_params.append(
            {
                "symbol": pos["symbol"],
                "shares": to_float(pos.get("shares"), 0.0),
                "current": to_float(pos.get("currentPrice"), 0.0),
                "volDaily": vol_daily,
                "dailyDrift": daily_drift,
            }
        )

    all_paths: list[list[float]] = []
    for _sim in range(simulations):
        ticker_prices = {tp["symbol"]: tp["current"] for tp in ticker_params}
        path = [start_val]
        for _day in range(days):
            day_val = 0.0
            for tp in ticker_params:
                daily_ret = tp["dailyDrift"] + tp["volDaily"] * rng.gauss(0.0, 1.0)
                daily_ret = max(-0.15, min(0.15, daily_ret))
                ticker_prices[tp["symbol"]] *= 1 + daily_ret
                day_val += tp["shares"] * ticker_prices[tp["symbol"]]
            path.append(day_val)
        all_paths.append(path)

    series: list[dict[str, Any]] = []
    for day in range(days + 1):
        day_values = [path[day] for path in all_paths]
        mean_val = sum(day_values) / len(day_values)
        series.append(
            {
                "day": day,
                "mean": round(mean_val, 2),
                "p10": round(percentile(day_values, 10), 2),
                "p25": round(percentile(day_values, 25), 2),
                "p75": round(percentile(day_values, 75), 2),
                "p90": round(percentile(day_values, 90), 2),
            }
        )

    final_values = [path[-1] for path in all_paths]
    final_p10 = percentile(final_values, 10)
    final_p90 = percentile(final_values, 90)

    loss_paths = [v for v in final_values if v <= final_p10]
    gain_paths = [v for v in final_values if v >= final_p90]
    expected_loss_val = sum(loss_paths) / max(1, len(loss_paths))
    expected_gain_val = sum(gain_paths) / max(1, len(gain_paths))

    return {
        "months": months,
        "days": days,
        "startValue": round(start_val, 2),
        "finalMean": round(sum(final_values) / len(final_values), 2),
        "finalP10": round(final_p10, 2),
        "finalP90": round(final_p90, 2),
        "expectedLoss": round(expected_loss_val, 2),
        "expectedGain": round(expected_gain_val, 2),
        "series": series,
        "model": "Monte Carlo CVaR",
    }


def normalize_risk_level(value: str) -> str:
    text = norm(value).lower()
    if "high" in text:
        return "High"
    if "low" in text:
        return "Low"
    return "Medium"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def round_percentages_to_hundred(weights: dict[str, float]) -> dict[str, float]:
    raw_tenths = {key: max(0.0, float(value) * 10) for key, value in weights.items()}
    floored = {key: int(math.floor(value + 1e-9)) for key, value in raw_tenths.items()}
    remainder = max(0, 1000 - sum(floored.values()))
    ordering = sorted(
        raw_tenths.keys(),
        key=lambda key: (raw_tenths[key] - floored[key], raw_tenths[key]),
        reverse=True,
    )
    for key in ordering[:remainder]:
        floored[key] += 1
    return {key: round(floored[key] / 10, 1) for key in weights}


def round_amounts_to_total(amount: float, percentages: dict[str, float]) -> dict[str, float]:
    rounded_total = round(amount, 2)
    raw_cents = {key: rounded_total * (pct / 100) * 100 for key, pct in percentages.items()}
    floored = {key: int(math.floor(value + 1e-9)) for key, value in raw_cents.items()}
    remainder = max(0, int(round(rounded_total * 100)) - sum(floored.values()))
    ordering = sorted(
        raw_cents.keys(),
        key=lambda key: (raw_cents[key] - floored[key], raw_cents[key]),
        reverse=True,
    )
    for key in ordering[:remainder]:
        floored[key] += 1
    return {key: round(floored[key] / 100, 2) for key in percentages}


def sentiment_tilt_factor(sentiment_scores: dict[str, Any] | None = None) -> float:
    scores = sentiment_scores or {}
    positive = to_float(scores.get("positive"), 0.0)
    negative = to_float(scores.get("negative"), 0.0)
    return clamp((positive - negative) / 0.2, -1.0, 1.0)


def generatePortfolio(
    amount: float,
    riskLevel: str,
    years: int,
    sentiment_scores: dict[str, Any] | None = None,
    requested_return: float | None = None,
) -> dict[str, Any]:
    risk_level = normalize_risk_level(riskLevel)
    profile = PORTFOLIO_RISK_PROFILES[risk_level]
    tilt_factor = sentiment_tilt_factor(sentiment_scores)

    percentages_raw: dict[str, float] = {}
    for asset, base_value in (profile.get("allocationBase") or {}).items():
        tilt_points = to_float((profile.get("allocationTilt") or {}).get(asset), 0.0)
        min_alloc, max_alloc = (profile.get("allocationRanges") or {}).get(asset, (0.0, 100.0))
        adjusted = base_value + tilt_points * tilt_factor
        percentages_raw[asset] = clamp(adjusted, float(min_alloc), float(max_alloc))

    percentages = round_percentages_to_hundred(percentages_raw)
    amounts = round_amounts_to_total(amount, percentages)

    ret_min, ret_max = profile.get("expectedReturnRange") or (0.0, 100.0)
    default_return = to_float(profile.get("defaultExpectedReturn"), (ret_min + ret_max) / 2)
    expected_return = default_return if requested_return is None else clamp(to_float(requested_return, default_return), ret_min, ret_max)
    expected_return = round(expected_return, 1)

    sentiment_note = ""
    if tilt_factor >= 0.2:
        sentiment_note = " A constructive market backdrop slightly increases the equity sleeve while staying inside the selected risk band."
    elif tilt_factor <= -0.2:
        sentiment_note = " A cautious market backdrop slightly increases the defensive sleeve while staying inside the selected risk band."

    return_range = {"min": float(ret_min), "max": float(ret_max)}
    benchmark_ranges = {
        asset: {"min": float(bounds[0]), "max": float(bounds[1])}
        for asset, bounds in (profile.get("allocationRanges") or {}).items()
    }

    return {
        "risk_level": risk_level,
        "years": max(1, int(years)),
        "allocation_percentages": percentages,
        "allocation_amounts": amounts,
        "expected_return": expected_return,
        "expected_return_range": return_range,
        "benchmark_ranges": benchmark_ranges,
        "sentiment_tilt": round(tilt_factor, 3),
        "explanation": f'{profile.get("explanation")}{sentiment_note}',
        "principle": ASSET_ALLOCATION_PRINCIPLE,
    }


def fetch_market_news_headlines(limit: int = 5) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []

    if GNEWS_API_KEY:
        payload = fetch_json(
            "https://gnews.io/api/v4/search",
            {
                "q": "stock market OR equities OR financial markets",
                "lang": "en",
                "max": limit,
                "sortby": "publishedAt",
                "token": GNEWS_API_KEY,
            },
            timeout=15,
        )
        rows = (payload or {}).get("articles", []) if isinstance(payload, dict) else []
        for row in rows[:limit]:
            title = norm(row.get("title"))
            if not title:
                continue
            items.append(
                {
                    "title": title,
                    "description": norm(row.get("description")),
                    "url": norm(row.get("url")),
                    "source": norm(((row.get("source") or {}).get("name")) or "GNews"),
                }
            )

    if not items and FINNHUB_API_KEY:
        payload = fetch_json(
            "https://finnhub.io/api/v1/news",
            {
                "category": "general",
                "token": FINNHUB_API_KEY,
            },
            timeout=15,
        )
        rows = payload if isinstance(payload, list) else []
        for row in rows[:limit]:
            title = norm(row.get("headline"))
            if not title:
                continue
            items.append(
                {
                    "title": title,
                    "description": norm(row.get("summary")),
                    "url": norm(row.get("url")),
                    "source": norm(row.get("source")) or "Finnhub",
                }
            )

    if items:
        return items[:limit]

    fallback_titles = [
        "Global markets trade mixed as investors weigh macro data and rate expectations.",
        "Technology shares lead gains while defensive sectors remain steady.",
        "Treasury yields and central bank commentary keep traders cautious.",
        "Energy prices and commodity flows continue to shape inflation outlook.",
        "Analysts look for quality balance sheets as volatility remains elevated.",
    ]
    return [
        {
            "title": title,
            "description": "",
            "url": "",
            "source": "Fallback",
        }
        for title in fallback_titles[:limit]
    ]


def aggregate_market_sentiment_scores(news_items: list[dict[str, Any]]) -> dict[str, Any]:
    texts = [norm(f'{item.get("title", "")}. {item.get("description", "")}') for item in news_items]
    scored = FINBERT.score_texts([text for text in texts if text])
    if not scored:
        return {
            "negative": 0.2,
            "neutral": 0.6,
            "positive": 0.2,
            "marketMood": "neutral",
        }

    negative = sum(item.get("negative", 0.0) for item in scored) / len(scored)
    neutral = sum(item.get("neutral", 0.0) for item in scored) / len(scored)
    positive = sum(item.get("positive", 0.0) for item in scored) / len(scored)
    mood = "bullish" if positive > negative + 0.04 else "bearish" if negative > positive + 0.04 else "neutral"
    return {
        "negative": round(negative, 4),
        "neutral": round(neutral, 4),
        "positive": round(positive, 4),
        "marketMood": mood,
    }


def build_notebook_allocation(
    amount: float,
    risk_level: str,
    sentiment_scores: dict[str, Any],
    years: int,
    requested_return: float | None = None,
) -> dict[str, Any]:
    portfolio = generatePortfolio(
        amount,
        risk_level,
        years,
        sentiment_scores=sentiment_scores,
        requested_return=requested_return,
    )
    return {
        "percentages": portfolio["allocation_percentages"],
        "amounts": portfolio["allocation_amounts"],
        "expectedReturn": portfolio["expected_return"],
        "returnRange": portfolio["expected_return_range"],
        "benchmarkRanges": portfolio["benchmark_ranges"],
        "explanation": portfolio["explanation"],
        "principle": portfolio["principle"],
        "sentimentTilt": portfolio["sentiment_tilt"],
    }


def build_growth_projection(amount: float, years: int, expected_return: float) -> dict[str, Any]:
    annual_rate = max(0.0, expected_return) / 100
    series = []
    for year in range(0, max(1, years) + 1):
        value = round(amount * ((1 + annual_rate) ** year), 2)
        series.append({"year": year, "value": value})
    return {
        "years": years,
        "expectedReturn": round(expected_return, 2),
        "series": series,
        "finalValue": series[-1]["value"],
    }


def build_portfolio_maker_summary(
    news_items: list[dict[str, Any]],
    sentiment_scores: dict[str, Any],
    risk_level: str,
    years: int,
    expected_return: float,
    allocation: dict[str, Any],
) -> dict[str, Any]:
    mood = norm(sentiment_scores.get("marketMood")) or "neutral"
    allocation_text = ", ".join(
        f"{key}: {value:.1f}%"
        for key, value in (allocation.get("percentages") or {}).items()
    )
    portfolio_explanation = norm(allocation.get("explanation")) or (
        "The allocation uses benchmark risk bands so equity rises with risk while bonds, gold, and cash absorb volatility."
    )
    fallback = {
        "marketMood": mood,
        "riskLevel": risk_level,
        "insight": portfolio_explanation,
        "advice": (
            f"{ASSET_ALLOCATION_PRINCIPLE} Review the plan over the next {years} year{'s' if years != 1 else ''} "
            f"using an expected return benchmark of {expected_return:.1f}% p.a."
        ),
        "summaryText": (
            f"Market sentiment is {mood}. Risk level is {risk_level}. {portfolio_explanation} "
            f"Allocation mix: {allocation_text}. Expected return benchmark: {expected_return:.1f}% p.a."
        ),
        "model": "Fallback (No Groq key)",
    }

    if not GROQ_API_KEY:
        return fallback

    prompt = f"""You are a portfolio maker assistant.
Use the market headlines, sentiment, risk level, and allocation below.
The allocation and expected return are already benchmarked and must be treated as ground truth.
Return ONLY valid JSON with:
{{
  "marketMood": "bullish|bearish|neutral",
  "insight": "2 concise sentences",
  "advice": "1 concise sentence",
  "summaryText": "4 concise lines in plain English"
}}

Headlines: {json.dumps([item.get("title") for item in news_items], ensure_ascii=True)[:2500]}
Sentiment: {json.dumps(sentiment_scores, ensure_ascii=True)}
Risk level: {risk_level}
Years: {years}
Expected return: {expected_return:.2f}%
Allocation: {json.dumps(allocation, ensure_ascii=True)}
Explanation: {portfolio_explanation}
Principle: {ASSET_ALLOCATION_PRINCIPLE}
"""
    result = run_groq_json(prompt)
    if not isinstance(result, dict):
        return fallback

    return {
        "marketMood": norm(result.get("marketMood")) or fallback["marketMood"],
        "riskLevel": risk_level,
        "insight": norm(result.get("insight")) or fallback["insight"],
        "advice": norm(result.get("advice")) or fallback["advice"],
        "summaryText": norm(result.get("summaryText")) or fallback["summaryText"],
        "model": f"Groq ({GROQ_MODEL})",
    }


def build_portfolio_maker_payload(amount: float, risk_level: str, years: int, expected_return: float) -> dict[str, Any]:
    news_items = fetch_market_news_headlines(limit=5)
    sentiment_scores = aggregate_market_sentiment_scores(news_items)
    allocation = build_notebook_allocation(
        amount,
        risk_level,
        sentiment_scores,
        years=years,
        requested_return=expected_return,
    )
    expected_return = to_float(allocation.get("expectedReturn"), expected_return)
    growth = build_growth_projection(amount, years, expected_return)
    summary = build_portfolio_maker_summary(news_items, sentiment_scores, risk_level, years, expected_return, allocation)
    return {
        "inputs": {
            "amount": round(amount, 2),
            "riskLevel": risk_level,
            "years": years,
            "expectedReturn": round(expected_return, 2),
        },
        "headlines": news_items,
        "sentimentScores": sentiment_scores,
        "allocation": allocation,
        "growth": growth,
        "summary": summary,
        "models": {
            "sentiment": FINBERT.model_name,
            "llm": summary.get("model") or "Fallback (No Groq key)",
        },
    }


def run_portfolio_analysis(
    holdings: list[PortfolioHolding],
    amount: float = 50_000,
    risk_level: str = "Medium",
    years: int = 10,
    expected_return: float = 12.0,
) -> dict[str, Any]:
    amount = max(1_000.0, to_float(amount, 50_000.0))
    risk_level = normalize_risk_level(risk_level)
    years = max(1, int(to_float(years, 10)))
    expected_return = to_float(expected_return, PORTFOLIO_RISK_PROFILES[risk_level]["defaultExpectedReturn"])
    maker = build_portfolio_maker_payload(amount, risk_level, years, expected_return)

    snapshots = [build_position_snapshot(h) for h in holdings]
    snapshots = [row for row in snapshots if row.get("symbol")]
    if not snapshots:
        return {
            "positions": [],
            "summary": {
                "totalInvested": amount,
                "currentValue": amount,
                "pnlUsd": 0.0,
                "pnlPct": 0.0,
                "portfolioScore": 5,
                "diversificationRating": "Scenario Mode",
                "topRisk": f"Selected risk level: {risk_level}",
                "topOpportunity": "Use the stock sentiment page to inspect the stock sleeve before investing.",
                "portfolioSummary": maker["summary"]["summaryText"],
                "decisionCounts": {"BuyMore": 0, "Hold": 0, "Sell": 0},
            },
            "projections": {},
            "models": {
                "sentiment": FINBERT.model_name,
                "advisor": maker["models"]["llm"],
                "projection": "Expected Return Projection (Notebook-style)",
            },
            "maker": maker,
        }

    total_invested = round(sum(to_float(row.get("invested"), 0.0) for row in snapshots), 2)
    total_current = round(sum(to_float(row.get("currentValue"), 0.0) for row in snapshots), 2)
    total_pnl_usd = round(total_current - total_invested, 2)
    total_pnl_pct = round((total_pnl_usd / total_invested) * 100, 2) if total_invested > 0 else 0.0

    ai = run_portfolio_advisor_llm(snapshots, total_invested, total_current, total_pnl_pct)
    ai_positions = ai.get("positions", {}) if isinstance(ai.get("positions"), dict) else {}

    denominator = total_invested if total_invested > 0 else max(total_current, 1.0)
    for row in snapshots:
        row["weightPct"] = round((to_float(row["invested"], 0.0) / denominator) * 100, 2)
        ai_row = ai_positions.get(row["symbol"], {})
        decision = normalize_decision(ai_row.get("decision"))
        sentiment = normalize_sentiment(ai_row.get("sentiment", row["sentimentRaw"]["label"]))
        risk = normalize_risk(ai_row.get("risk"))
        reason = norm(ai_row.get("reason")) or (
            f'Sentiment is {sentiment} with score {row["sentimentRaw"]["score"]:+.3f}; '
            f'30D change is {row["changes"]["d30"]:+.2f}% and volatility is {row["metrics"]["volatility"]:.1f}%.'
        )
        row["advisor"] = {
            "decision": decision,
            "risk": risk,
            "sentiment": sentiment,
            "reason": reason,
            "model": f"Groq ({GROQ_MODEL})" if GROQ_API_KEY else "Fallback (No Groq key)",
        }

    decision_counts = {"BuyMore": 0, "Hold": 0, "Sell": 0}
    for row in snapshots:
        d = row["advisor"]["decision"]
        decision_counts[d] = decision_counts.get(d, 0) + 1

    projections = {
        "1M": project_portfolio(snapshots, 1),
        "6M": project_portfolio(snapshots, 6),
        "1Y": project_portfolio(snapshots, 12),
    }

    snapshots.sort(key=lambda x: to_float(x.get("invested"), 0.0), reverse=True)

    return {
        "positions": snapshots,
        "summary": {
            "totalInvested": total_invested,
            "currentValue": total_current,
            "pnlUsd": total_pnl_usd,
            "pnlPct": total_pnl_pct,
            "portfolioScore": int(to_float(ai.get("portfolio_score"), 5)),
            "diversificationRating": norm(ai.get("diversification_rating")) or "Fair",
            "topRisk": norm(ai.get("top_risk")) or "Concentration and volatility risk",
            "topOpportunity": norm(ai.get("top_opportunity")) or "Incremental adds on strongest risk-adjusted names",
            "portfolioSummary": norm(ai.get("portfolio_summary")) or "Portfolio analysis generated.",
            "decisionCounts": decision_counts,
        },
        "projections": projections,
        "models": {
            "sentiment": FINBERT.model_name,
            "advisor": f"Groq ({GROQ_MODEL})" if GROQ_API_KEY else "Fallback (No Groq key)",
            "projection": "Monte Carlo (Notebook-style)",
        },
        "maker": maker,
    }


def run_portfolio_chat(question: str, analysis: dict[str, Any], holdings: list[PortfolioHolding]) -> dict[str, Any]:
    maker = (analysis or {}).get("maker", {}) if isinstance(analysis, dict) else {}
    context = {
        "positions": [
            {
                "symbol": norm(h.symbol).upper(),
                "shares": h.shares,
                "avgBuyPrice": h.avgBuyPrice,
                "assetType": h.assetType,
                "sector": h.sector,
            }
            for h in holdings
        ],
        "summary": (analysis or {}).get("summary", {}),
        "maker": {
            "inputs": maker.get("inputs", {}),
            "sentimentScores": maker.get("sentimentScores", {}),
            "allocation": maker.get("allocation", {}),
            "summary": maker.get("summary", {}),
            "models": maker.get("models", {}),
        },
    }

    if not GROQ_API_KEY:
        return {
            "answer": "Groq API key is missing. Add GROQ_API_KEY to enable portfolio chatbot responses.",
            "model": "Fallback (No Groq key)",
        }

    prompt = f"""You are a portfolio advisor assistant.
Question: {norm(question)}
Portfolio context (JSON): {json.dumps(context, ensure_ascii=True)[:5000]}

Answer in practical plain English in 4-8 bullet points.
If this is a scenario without saved holdings, answer using the maker inputs, market mood, and allocation plan.
Mention model uncertainty and risk where relevant.
"""

    payload = post_json(
        "https://api.groq.com/openai/v1/chat/completions",
        {
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        {
            "model": GROQ_MODEL,
            "temperature": 0.2,
            "max_tokens": 700,
            "messages": [{"role": "user", "content": prompt}],
        },
        timeout=45,
    )

    answer = ""
    if isinstance(payload, dict):
        try:
            answer = (((payload.get("choices") or [{}])[0]).get("message") or {}).get("content") or ""
        except Exception:
            answer = ""
    answer = norm(answer)
    if not answer:
        answer = "I could not generate a portfolio answer right now. Please try again."
    return {"answer": answer, "model": f"Groq ({GROQ_MODEL})"}


def format_stock_payload(symbol: str, window_days: int = 180) -> dict[str, Any]:
    ticker = symbol.upper().strip()
    quote = fetch_finnhub_quote(ticker)
    metric = fetch_finnhub_metrics(ticker)
    candles = fetch_finnhub_candles(ticker, days=window_days)
    finnhub_news = fetch_finnhub_news(ticker)
    gnews = fetch_gnews_news(ticker)
    stocktwits, social_stats = fetch_stocktwits_posts(ticker)

    merged_news = finnhub_news + gnews + stocktwits
    dedupe = {}
    for item in merged_news:
        key = (item.get("url") or item.get("title") or "").lower()
        if key and key not in dedupe:
            dedupe[key] = item
    news_items = sorted(dedupe.values(), key=lambda x: parse_date(x.get("publishedAt", "")).timestamp(), reverse=True)[:12]

    texts = [f'{n.get("title","")}. {n.get("description","")}' for n in news_items]
    scores = FINBERT.score_texts(texts)
    agg = aggregate_sentiment(scores)

    prompt = f"""You are a senior stock sentiment analyst.
Symbol: {ticker}
Sentiment score (FinBERT): {agg["score"]:+.4f} ({agg["label"]}), confidence estimate: {agg["confidence"]}%
Social tags: bullish={social_stats["bullish"]}, bearish={social_stats["bearish"]}, tagScore={social_stats["tagScore"]:+.3f}
Price quote: current={quote.get("c")} open={quote.get("o")} high={quote.get("h")} low={quote.get("l")} prevClose={quote.get("pc")}
Key metrics: 52wHigh={metric.get("52WeekHigh")} 52wLow={metric.get("52WeekLow")} peTTM={metric.get("peTTM")} beta={metric.get("beta")}
Top headlines:
{chr(10).join([f'- {n.get("title","")} ({n.get("source","")})' for n in news_items[:8]])}

Return JSON only:
{{
  "trend": "positive|negative|neutral",
  "reason": "2-4 sentence explanation",
  "newsSummary": "summary of recent stock news",
  "verdict": "buy|hold|sell",
  "verdictReason": "why this verdict",
  "confidencePct": 0-100
}}
"""
    llm = run_groq_json(prompt)

    trend = str(llm.get("trend", agg["label"])).lower()
    if trend not in {"positive", "negative", "neutral"}:
        trend = agg["label"]

    verdict = str(llm.get("verdict", "hold")).lower()
    if verdict not in {"buy", "hold", "sell"}:
        verdict = "hold"

    try:
        llm_conf = int(llm.get("confidencePct", agg["confidence"]))
    except Exception:
        llm_conf = agg["confidence"]
    llm_conf = max(1, min(99, llm_conf))

    labels: list[str] = []
    prices: list[float] = []
    candle_points: list[dict[str, Any]] = []
    ts = candles.get("t") or []
    open_ = candles.get("o") or []
    high = candles.get("h") or []
    low = candles.get("l") or []
    close = candles.get("c") or []
    volume = candles.get("v") or [0] * len(close)
    for t, o, h, l, c, v in zip(ts, open_, high, low, close, volume):
        labels.append(datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%b %d"))
        prices.append(round(float(c), 2))
        candle_points.append(
            {
                "time": int(t),
                "open": round(float(o), 4),
                "high": round(float(h), 4),
                "low": round(float(l), 4),
                "close": round(float(c), 4),
                "volume": round(float(v), 2),
            }
        )

    if not prices:
        current = quote.get("c") or quote.get("pc") or quote.get("o")
        if current:
            current = float(current)
            point_count = max(48, min(window_days, 220))
            prices = []
            labels = []
            now_ts = int(datetime.now(timezone.utc).timestamp())
            candle_points = []
            for idx in range(point_count):
                ratio = idx / max(point_count - 1, 1)
                trend_component = (ratio - 0.45) * current * 0.14
                wave = math.sin(ratio * 9.5) * current * 0.025
                bump = math.exp(-((ratio - 0.78) ** 2) / 0.018) * current * 0.045
                close_val = round(current + trend_component + wave + bump, 2)
                prices.append(close_val)

                time_offset = (point_count - 1 - idx) * 86400
                t = now_ts - time_offset
                labels.append(datetime.fromtimestamp(int(t), tz=timezone.utc).strftime("%b %d"))

                prev = prices[idx - 1] if idx > 0 else close_val * 0.995
                open_val = round((prev + close_val) / 2, 2)
                high_val = round(max(open_val, close_val) * 1.01, 2)
                low_val = round(min(open_val, close_val) * 0.99, 2)
                volume_val = round(700000 + abs(math.sin(ratio * 8.2)) * 420000 + idx * 1100, 2)
                candle_points.append(
                    {
                        "time": t,
                        "open": open_val,
                        "high": high_val,
                        "low": low_val,
                        "close": close_val,
                        "volume": volume_val,
                    }
                )

    change_pct = 0.0
    if prices and prices[0]:
        change_pct = round(((prices[-1] - prices[0]) / prices[0]) * 100, 2)

    try:
        cur_val = float(quote.get("c") or metric.get("currentPrice") or prices[-1] or 0.0)
        pos = [{
            "symbol": ticker,
            "shares": 1.0,
            "currentValue": cur_val,
            "currentPrice": cur_val,
            "metrics": metric,
            "sentimentRaw": {"score": agg["score"]}
        }]
        proj1Y = project_portfolio(pos, 12, simulations=180)
        expected_gain_usd = round(proj1Y["expectedGain"] - proj1Y["startValue"], 2)
        expected_gain_pct = round((expected_gain_usd / max(1, proj1Y["startValue"])) * 100, 2)
    except Exception:
        expected_gain_usd = 0.0
        expected_gain_pct = 0.0

    return {
        "symbol": ticker,
        "name": metric.get("name") or ticker,
        "trend": {
            "label": trend,
            "score": agg["score"],
            "confidence": llm_conf,
            "model": FINBERT.model_name,
            "expectedGainPct": expected_gain_pct,
            "expectedGainUsd": expected_gain_usd
        },
        "reason": {
            "text": llm.get("reason")
            or f"FinBERT ({FINBERT.model_name}) indicates a {agg['label']} signal with score {agg['score']:+.3f}.",
            "model": f"Groq ({GROQ_MODEL})",
        },
        "news": {
            "summary": llm.get("newsSummary") or "Latest headlines indicate mixed signals. Review source links below.",
            "items": news_items[:8],
            "model": f"Groq ({GROQ_MODEL})",
        },
        "metrics": {
            "currentPrice": quote.get("c"),
            "dayHigh": quote.get("h"),
            "dayLow": quote.get("l"),
            "prevClose": quote.get("pc"),
            "week52High": metric.get("52WeekHigh"),
            "week52Low": metric.get("52WeekLow"),
            "peTTM": metric.get("peTTM"),
            "beta": metric.get("beta"),
            "marketCap": metric.get("marketCapitalization"),
        },
        "verdict": {
            "action": verdict,
            "reason": llm.get("verdictReason")
            or f"Based on sentiment and current price structure, the current stance is {verdict.upper()}.",
            "confidence": llm_conf,
            "model": f"Groq ({GROQ_MODEL})",
        },
        "chart": {
            "labels": labels,
            "prices": prices,
            "candles": candle_points,
            "windowDays": window_days,
            "interval": "60" if window_days <= 14 else "D",
            "changePct": change_pct,
        },
        "models": {
            "sentiment": FINBERT.model_name,
            "llm": GROQ_MODEL,
        },
        "social": social_stats,
    }


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "providers": {
            "finnhub": bool(FINNHUB_API_KEY),
            "gnews": bool(GNEWS_API_KEY),
            "huggingface": bool(HF_API_TOKEN),
            "groq": bool(GROQ_API_KEY),
        },
        "models": {
            "sentiment": FINBERT.model_name,
            "llm": GROQ_MODEL,
        },
    }


@app.post("/api/stock-sentiment")
def stock_sentiment(payload: StockSentimentRequest) -> dict[str, Any]:
    symbol = norm(payload.symbol).upper()
    if not symbol:
        raise HTTPException(status_code=400, detail="Stock symbol is required")
    return format_stock_payload(symbol, window_days=payload.windowDays)


@app.get("/api/leader-news")
def leader_news(name: str = "", limit: int = 5) -> dict[str, Any]:
    leader_name = norm(name)
    if not leader_name:
        raise HTTPException(status_code=400, detail="Leader name is required")
    if not GNEWS_API_KEY:
        raise HTTPException(status_code=503, detail="Leader news provider is not configured")
    safe_limit = max(1, min(10, int(limit or 5)))
    return {
        "leader": leader_name,
        "articles": fetch_leader_news(leader_name, limit=safe_limit),
    }


@app.post("/api/leader-news-analysis")
def leader_news_analysis(payload: LeaderNewsAnalysisRequest) -> dict[str, Any]:
    return build_leader_news_analysis(payload.articles)


@app.get("/api/stock-search")
def stock_search(q: str = "") -> dict[str, Any]:
    query = norm(q)
    return {
        "query": query,
        "results": search_stocks(query),
    }


@app.get("/api/trending-bull-run")
def trending_bull_run(limit: int = 5) -> dict[str, Any]:
    safe_limit = max(3, min(5, int(limit or 5)))
    items = get_trending_bull_run_stocks(limit=safe_limit)
    return {
        "items": items,
        "horizon": "12M estimate",
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "method": "Momentum + sentiment heuristic",
    }


@app.post("/api/portfolio-analyze")
def portfolio_analyze(payload: PortfolioAnalyzeRequest) -> dict[str, Any]:
    return run_portfolio_analysis(
        payload.holdings,
        amount=payload.amount,
        risk_level=payload.riskLevel,
        years=payload.years,
        expected_return=payload.expectedReturn,
    )


@app.post("/api/portfolio-chat")
def portfolio_chat(payload: PortfolioChatRequest) -> dict[str, Any]:
    question = norm(payload.question)
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")
    return run_portfolio_chat(question, payload.analysis or {}, payload.holdings)


@app.post("/api/stock-chat")
def stock_chat(payload: StockChatRequest) -> dict[str, Any]:
    symbol = norm(payload.symbol).upper()
    question = norm(payload.question)
    if not symbol or not question:
        raise HTTPException(status_code=400, detail="symbol and question are required")

    context = payload.context or {}
    context_text = json.dumps(context, ensure_ascii=True)[:3500]
    prompt = f"""You are a stock research assistant.
Stock symbol: {symbol}
Current context (JSON): {context_text}
User question: {question}

Answer in plain English, concise and practical. Mention uncertainty if data is limited.
"""
    llm = run_groq_json(prompt)
    answer = llm.get("answer") if isinstance(llm, dict) else None
    if not answer:
        # fallback non-JSON Groq call
        if GROQ_API_KEY:
            payload_json = post_json(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                {
                    "model": GROQ_MODEL,
                    "temperature": 0.2,
                    "max_tokens": 450,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=45,
            )
            try:
                answer = (((payload_json.get("choices") or [{}])[0]).get("message") or {}).get("content")
            except Exception:
                answer = None
    if not answer:
        answer = "I could not generate a model response right now. Please try again."
    return {"answer": norm(answer), "model": f"Groq ({GROQ_MODEL})"}


@app.post("/api/finora-chat")
def finora_chat(payload: FinoraChatRequest) -> dict[str, Any]:
    """Landing page Finora RAG chatbot endpoint.

    Uses Groq and dynamically fetches stock news, sending them to the
    FinBERT engine to append context before responding.
    """
    message = norm(payload.message)
    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    history = [
        {"role": norm(m.role), "content": norm(m.content)}
        for m in payload.history
        if norm(m.content)
    ]
    return FINORA.chat(message, history)


if __name__ == "__main__":
    import uvicorn

    host = env("BACKEND_HOST") or ("0.0.0.0" if env("K_SERVICE", "PORT") else "127.0.0.1")
    port = int(env("PORT", "BACKEND_PORT") or "8000")
    uvicorn.run(app, host=host, port=port, log_level="info")
