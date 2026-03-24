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


FINNHUB_API_KEY = env("FINNHUB_API_KEY")
GNEWS_API_KEY = env("GNEWS_API_KEY", "VITE_GNEWS_API_KEY")
GROQ_API_KEY = env("GROQ_API_KEY")
GROQ_MODEL = env("GROQ_MODEL") or "llama-3.3-70b-versatile"
FINBERT_MODEL = "ProsusAI/finbert"

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
    riskLevel: str = Field(default="Moderate", min_length=3, max_length=20)
    years: int = Field(default=10, ge=1, le=40)
    expectedReturn: float = Field(default=10.0, ge=0.1, le=100.0)


class PortfolioChatRequest(BaseModel):
    holdings: list[PortfolioHolding] = Field(default_factory=list, max_length=60)
    question: str = Field(min_length=1, max_length=1200)
    analysis: dict[str, Any] | None = None


app = FastAPI(title="MarketLens Stock Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
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
            from transformers import pipeline  # type: ignore
            import torch  # type: ignore

            device = 0 if torch.cuda.is_available() else -1
            self.pipeline = pipeline(
                task="text-classification",
                model=self.model_name,
                top_k=None,
                device=device,
                truncation=True,
                max_length=512,
            )
        except Exception:
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
                type_name = norm(row.get("type", ""))
                if type_name and "stock" not in type_name.lower() and "common" not in type_name.lower() and "adr" not in type_name.lower():
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
    return {
        "months": months,
        "days": days,
        "startValue": round(start_val, 2),
        "finalMean": round(sum(final_values) / len(final_values), 2),
        "finalP10": round(percentile(final_values, 10), 2),
        "finalP90": round(percentile(final_values, 90), 2),
        "series": series,
        "model": "Monte Carlo (Notebook-style)",
    }


def normalize_risk_level(value: str) -> str:
    text = norm(value).lower()
    if "high" in text:
        return "High"
    if "low" in text:
        return "Low"
    return "Moderate"


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


def build_notebook_allocation(amount: float, risk_level: str, sentiment_scores: dict[str, Any]) -> dict[str, Any]:
    positive = to_float(sentiment_scores.get("positive"), 0.2)
    negative = to_float(sentiment_scores.get("negative"), 0.2)

    stock_weight = 0.4 + (positive - negative)
    bond_weight = 0.3 - (positive - negative) / 2
    gold_weight = 0.2
    cash_weight = 0.1

    if risk_level == "High":
        stock_weight += 0.2
        bond_weight -= 0.1
    elif risk_level == "Low":
        stock_weight -= 0.2
        bond_weight += 0.2

    raw_weights = {
        "Stocks": max(stock_weight, 0.05),
        "Bonds": max(bond_weight, 0.05),
        "Gold": max(gold_weight, 0.05),
        "Cash": max(cash_weight, 0.05),
    }
    total = sum(raw_weights.values()) or 1.0
    percentages = {key: round((value / total) * 100, 1) for key, value in raw_weights.items()}
    amounts = {key: round(amount * (percentages[key] / 100), 2) for key in raw_weights}
    return {
        "percentages": percentages,
        "amounts": amounts,
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
    fallback = {
        "marketMood": mood,
        "riskLevel": risk_level,
        "insight": f"Recent market headlines suggest a {mood} backdrop, so the allocation tilts according to the selected risk level.",
        "advice": f"Stay diversified and review the plan over the next {years} year{'s' if years != 1 else ''} at an expected return of {expected_return:.1f}% p.a.",
        "summaryText": (
            f"Market sentiment is {mood}. Risk level is {risk_level}. "
            f"Allocation mix: {allocation_text}. Diversify and stay invested for long-term growth."
        ),
        "model": "Fallback (No Groq key)",
    }

    if not GROQ_API_KEY:
        return fallback

    prompt = f"""You are a portfolio maker assistant.
Use the market headlines, sentiment, risk level, and allocation below.
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
    allocation = build_notebook_allocation(amount, risk_level, sentiment_scores)
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
    risk_level: str = "Moderate",
    years: int = 10,
    expected_return: float = 10.0,
) -> dict[str, Any]:
    amount = max(1_000.0, to_float(amount, 50_000.0))
    risk_level = normalize_risk_level(risk_level)
    years = max(1, int(to_float(years, 10)))
    expected_return = max(0.1, to_float(expected_return, 10.0))
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

    return {
        "symbol": ticker,
        "name": metric.get("name") or ticker,
        "trend": {
            "label": trend,
            "score": agg["score"],
            "confidence": llm_conf,
            "model": FINBERT.model_name,
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


@app.get("/api/stock-search")
def stock_search(q: str = "") -> dict[str, Any]:
    query = norm(q)
    return {
        "query": query,
        "results": search_stocks(query),
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


if __name__ == "__main__":
    import uvicorn

    host = env("BACKEND_HOST") or "127.0.0.1"
    port = int(env("BACKEND_PORT") or "8000")
    uvicorn.run(app, host=host, port=port, log_level="info")
