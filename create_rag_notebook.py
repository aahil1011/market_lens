import nbformat as nbf

nb = nbf.v4.new_notebook()

text_1 = """\
# Finora Retrieval-Augmented Generation (RAG) Engine
This notebook demonstrates the end-to-end RAG pipeline used by MarketLens.
We cover Data Fetching, Vector Encoding & Semantic Ranking, LLM Generation, and Faithfulness Evaluation.
"""

code_1 = """\
import os
import requests
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

print("Environment loaded!")
"""

text_2 = """\
## 1. User Query & Goal Mapping
We initialize the system with a sample user query asking about a specific stock.
"""

code_2 = """\
symbol = "AAPL"
user_query = f"What is the recent market performance and news sentiment for {symbol} today?"
print(f"Target Symbol: {symbol}")
print(f"Query: {user_query}")
"""

text_3 = """\
## 2. Retrieval (Data Fetching)
In standard RAG, this might be a Vector Database. For Finora, we dynamically pull context from real-time financial APIs.
"""

code_3 = """\
def fetch_finnhub_news(sym):
    import datetime
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    past = (datetime.datetime.now() - datetime.timedelta(days=7)).strftime('%Y-%m-%d')
    url = f"https://finnhub.io/api/v1/company-news?symbol={sym}&from={past}&to={today}&token={FINNHUB_API_KEY}"
    try:
        res = requests.get(url).json()
        return [n for n in res if n.get('headline')][:15] if isinstance(res, list) else []
    except Exception as e:
        print(f"Error fetching: {e}")
        return []

raw_news = fetch_finnhub_news(symbol)
news_documents = [news['headline'] + " - " + news.get('summary', '') for news in raw_news]

print(f"Fetched {len(news_documents)} raw news articles.")
for idx, doc in enumerate(news_documents[:3]):
    print(f"Doc {idx+1}: {doc[:100]}...")
"""

text_4 = """\
## 3. Encoding and Ranking (Semantic Search)
We need to find the specific articles that answer the `user_query` best. We will use `sentence-transformers` for encoding, and `scikit-learn` to rank by Cosine Similarity.
"""

code_4 = """\
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Load Small Encoder
encoder = SentenceTransformer('all-MiniLM-L6-v2')

# Encode Query and Documents
query_embedding = encoder.encode([user_query])
doc_embeddings = encoder.encode(news_documents)

# Calculate Cosine Similarities
similarities = cosine_similarity(query_embedding, doc_embeddings)[0]

# Rank top 5 documents
ranked_indices = similarities.argsort()[::-1][:5]
top_k_documents = [news_documents[i] for i in ranked_indices]

print("\\nTop Ranked Context:")
for rank, idx in enumerate(ranked_indices):
    print(f"Rank {rank+1} (Score: {similarities[idx]:.3f}) -> {news_documents[idx][:100]}...")
"""

text_5 = """\
## 4. Generation (Augmentation & LLM)
We inject the curated context into the prompt and use the Groq API to synthesize a response.
"""

code_5 = """\
context_block = "\\n\\n[LIVE MARKET CONTEXT]\\n" + "\\n".join([f"• {doc}" for doc in top_k_documents])
final_prompt = user_query + context_block

messages = [
    {"role": "system", "content": "You are Finora. Use the [LIVE MARKET CONTEXT] to answer the user's query precisely."},
    {"role": "user", "content": final_prompt}
]

headers = {
    "Authorization": f"Bearer {GROQ_API_KEY}",
    "Content-Type": "application/json"
}
payload = {
    "model": GROQ_MODEL,
    "temperature": 0.3,
    "messages": messages
}

try:
    response = requests.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=payload).json()
    generated_answer = response['choices'][0]['message']['content']
    print("\\n### Finora Response ###\\n")
    print(generated_answer)
except Exception as e:
    print(f"Generation failed: {e}")
    generated_answer = ""
"""

text_6 = """\
## 5. Evaluation Metrics
We use ROUGE (Recall-Oriented Understudy for Gisting Evaluation) to quantify the faithfulness/extraction overlap of our LLM's response against the base retrieved context.
"""

code_6 = """\
from rouge_score import rouge_scorer

if generated_answer:
    scorer = rouge_scorer.RougeScorer(['rouge1', 'rougeL'], use_stemmer=True)
    
    combined_context = " ".join(top_k_documents)
    # Target: We evaluate if the generated answer overlaps with the known truth (the context)
    scores = scorer.score(combined_context, generated_answer)
    
    print("--- ROUGE Faithfulness Metrics ---\\n")
    print(f"ROUGE-1 (Unigram Overlap): Precision: {scores['rouge1'].precision:.3f}, Recall: {scores['rouge1'].recall:.3f}, F1: {scores['rouge1'].fmeasure:.3f}")
    print(f"ROUGE-L (Longest Seq): Precision: {scores['rougeL'].precision:.3f}, Recall: {scores['rougeL'].recall:.3f}, F1: {scores['rougeL'].fmeasure:.3f}")
    print("\\nInterpretation: High precision means the generated answer heavily utilizes exactly what was in the context (High Faithfulness, low hallucination).")
else:
    print("No generated answer to evaluate.")
"""

nb['cells'] = [
    nbf.v4.new_markdown_cell(text_1),
    nbf.v4.new_code_cell(code_1),
    nbf.v4.new_markdown_cell(text_2),
    nbf.v4.new_code_cell(code_2),
    nbf.v4.new_markdown_cell(text_3),
    nbf.v4.new_code_cell(code_3),
    nbf.v4.new_markdown_cell(text_4),
    nbf.v4.new_code_cell(code_4),
    nbf.v4.new_markdown_cell(text_5),
    nbf.v4.new_code_cell(code_5),
    nbf.v4.new_markdown_cell(text_6),
    nbf.v4.new_code_cell(code_6)
]

with open('finora_rag_engine.ipynb', 'w') as f:
    nbf.write(nb, f)

print("Notebook 'finora_rag_engine.ipynb' created successfully!")
