# MarketLens Stock Backend

Notebook-inspired backend for stock sentiment:

- Sentiment model: `ProsusAI/finbert` (with lexical fallback)
- LLM model: `llama-3.3-70b-versatile` via Groq
- Data sources: Finnhub, GNews, StockTwits

## Run

```bash
pip install -r backend/requirements.txt
python backend/app.py
```

Optional for full FinBERT local inference:

```bash
pip install -r backend/requirements-finbert.txt
```

## Endpoints

- `GET /api/health`
- `POST /api/stock-sentiment`
- `GET /api/stock-search`
- `POST /api/stock-chat`
- `POST /api/portfolio-analyze`
- `POST /api/portfolio-chat`
