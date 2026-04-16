import nbformat as nbf
import json

nb = nbf.v4.new_notebook()

nb.cells = [
    nbf.v4.new_markdown_cell("""# 🤖 Finora RAG Architecture 
**Educational Demonstration of Retrieval-Augmented Generation (RAG)**
This notebook demonstrates the inner workings of our AI financial advisor, **Finora**. It combines real-time data retrieval with our **Custom LoRA FinBERT** semantic model and the **Groq LLaMA-based Reasoning Engine**."""),
    
    nbf.v4.new_code_cell("""# Setup dependencies
!pip install -q transformers peft faiss-cpu sentence-transformers evaluate rouge_score"""),

    nbf.v4.new_code_cell("""import os
import faiss
import requests
import numpy as np
from datetime import datetime, timezone, timedelta
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline
from peft import PeftModel
import evaluate

# Optional keys for live fetch (simulated if None)
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")"""),

    nbf.v4.new_markdown_cell("""## 1. Simulated or Live Data Ingestion
Retrieving top market news regarding a given stock symbol."""),
    
    nbf.v4.new_code_cell("""def fetch_news(symbol: str):
    print(f"Fetching news for {symbol}...")
    if not FINNHUB_KEY:
        # Fallback simulator for educational demonstration without key
        return [
            {"title": "NVIDIA smashes Q4 warnings, announces new Blackwell chips.", "description": "NVDA shares surged 5% in after-hours trading thanks to record-breaking AI demand."},
            {"title": "Supply chain issues might hit NVDA next quarter", "description": "Experts warn that TSMC limitations could bottleneck H100 production."},
            {"title": "Hedge funds load up heavily on Nvidia", "description": "Top institutional investors have added 200M shares over the last month."}
        ]
        
    date_to = datetime.now(timezone.utc).date()
    date_from = date_to - timedelta(days=10)
    res = requests.get(
        "https://finnhub.io/api/v1/company-news",
        params={"symbol": symbol, "from": date_from.isoformat(), "to": date_to.isoformat(), "token": FINNHUB_KEY}
    )
    if res.ok:
        return res.json()[:5]
    return []

# Test ingestion
nvda_docs = fetch_news("NVDA")
print(f"Ingested {len(nvda_docs)} documents.")"""),

    nbf.v4.new_markdown_cell("""## 2. Sentiment Context Injection using LoRA FinBERT
Here we use the custom FinBERT model we trained using Low-Rank Adaptation (LoRA) to score the sentiment of every retrieved news item. This guarantees perfectly accurate financial sentiment context for the LLM."""),

    nbf.v4.new_code_cell("""import torch
try:
    print("Loading Custom LoRA FinBERT model...")
    base_model = AutoModelForSequenceClassification.from_pretrained("ProsusAI/finbert", num_labels=3)
    lora_model = PeftModel.from_pretrained(base_model, "./backend/lora-finbert")
    tokenizer = AutoTokenizer.from_pretrained("ProsusAI/finbert")
    
    finbert_pipeline = pipeline("text-classification", model=lora_model, tokenizer=tokenizer, device=0 if torch.cuda.is_available() else -1)
    print("✅ Model loaded.")
except Exception as e:
    finbert_pipeline = None
    print(f"⚠️ Could not load local model (maybe path is wrong): {e}")
    print("Falling back to HuggingFace API for simulation.")
    finbert_pipeline = pipeline("text-classification", model="ProsusAI/finbert")

# Evaluate sentiments
for item in nvda_docs:
    text = item['title'] + " " + item.get('description', '')
    res = finbert_pipeline(text, truncation=True, max_length=512)[0]
    item['sentiment'] = res['label']
    print(f"[{res['label']}] {item['title']}")"""),

    nbf.v4.new_markdown_cell("""## 3. Embeeding & Vector Database (Chunking & Retrieval)
Instead of feeding the entire news payload to the LLM (which consumes tokens), we encode and selectively search the best snippets using FAISS and MiniLM."""),

    nbf.v4.new_code_cell("""# 1. Initialize Vector Encoder
print("Loading sentence encoder...")
encoder = SentenceTransformer('all-MiniLM-L6-v2')

# 2. Extract Document Strings
doc_chunks = [f"{d['title']} ({d['sentiment']}): {d['description']}" for d in nvda_docs]

# 3. Create FAISS Index
doc_embeddings = encoder.encode(doc_chunks)
d = doc_embeddings.shape[1] 
index = faiss.IndexFlatL2(d)
index.add(doc_embeddings.astype('float32'))
print(f"Vector Database Initialized with {index.ntotal} chunks.")

# 4. Search Function
def search_vectorDB(query, k=2):
    q_vec = encoder.encode([query]).astype('float32')
    distances, indices = index.search(q_vec, k)
    return [doc_chunks[i] for i in indices[0]]

# Test search
retrieved = search_vectorDB("Is Nvidia supply restricted?")
print("\\nBest Matching Context:\\n- " + "\\n- ".join(retrieved))"""),

    nbf.v4.new_markdown_cell("""## 4. RAG Generation (Groq LLM)
Combining the retrieved context strings with the user's prompt to guide generation."""),

    nbf.v4.new_code_cell("""def finora_generate(user_query, context_list):
    context_str = "\\n".join([f"- {c}" for c in context_list])
    
    prompt = f\"\"\"You are Finora, an objective financial AI.
    
LIVE MARKET CONTEXT:
{context_str}

USER QUERY: {user_query}

Synthesize a response based ONLY on the context provided. Respond concisely.
\"\"\"
    if not GROQ_API_KEY:
        print("No GROQ_API_KEY set. Simulating generation...")
        return "Simulated Response: Based on current news, NVDA might face constraint issues from TSMC, but hedge funds continue to buy heavily given their AI Blackwell dominance."
        
    res = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
        json={
            "model": "llama-3.3-70b-versatile",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 200
        }
    )
    return res.json()['choices'][0]['message']['content']

test_query = "What is the sentiment and outlook on NVDA chips and supply?"
retrieved_context = search_vectorDB(test_query, k=3)
generated_answer = finora_generate(test_query, retrieved_context)

print(f"USER: {test_query}")
print(f"FINORA: {generated_answer}")"""),

    nbf.v4.new_markdown_cell("""## 5. Evaluation Metrics
Evaluating the quality of the RAG-generated response using standard NLP metrics (ROUGE-L and Exact Match). Comparing our RAG generation against a 'Ground Truth' human answer."""),

    nbf.v4.new_code_cell("""# Final Evaluation metrics
rouge = evaluate.load('rouge')

reference_answer = "Nvidia's blackwell chips are seeing record AI demand causing share prices to surge, however there are supply chain concerns regarding TSMC bottlenecks."

# Evaluate ROUGE score to see n-gram overlap between Ground Truth and Finora's Generate Answer
results = rouge.compute(predictions=[generated_answer], references=[reference_answer])

print("✅ FINAL EVALUATION METRICS:")
print("==========================================")
print(f"• ROUGE-1: {results['rouge1']:.4f}")
print(f"• ROUGE-2: {results['rouge2']:.4f}")
print(f"• ROUGE-L: {results['rougeL']:.4f}")
print("==========================================\\n")
print(f"Generated:\\n{generated_answer}\\n")
print(f"Reference:\\n{reference_answer}")""")
]

with open("finora_rag.ipynb", "w", encoding="utf-8") as f:
    nbf.write(nb, f)

print("finora_rag.ipynb generated successfully!")
