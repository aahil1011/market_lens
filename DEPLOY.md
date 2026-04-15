# MarketLens Deployment

This app has two deploy targets:

- Frontend: Firebase Hosting
- Backend: Google Cloud Run

## 1. Prerequisites

- Firebase project: `marketlens-e347c`
- Firebase CLI installed and logged in
- Google Cloud project upgraded to Blaze before deploying the backend
- Google Cloud CLI (`gcloud`) installed for the Cloud Run deploy

## 2. Deploy the FastAPI backend

Deploy the `backend/` folder to Cloud Run and set these runtime variables:

- `FINNHUB_API_KEY`
- `GNEWS_API_KEY`
- `HF_API_TOKEN`
- `GROQ_API_KEY`
- `GROQ_MODEL`
- `BACKEND_CORS_ORIGINS=https://marketlens-e347c.web.app,https://marketlens-e347c.firebaseapp.com`

Example PowerShell flow:

```powershell
gcloud auth login
gcloud config set project marketlens-e347c
@"
FINNHUB_API_KEY=your_finnhub_key
GNEWS_API_KEY=your_gnews_key
HF_API_TOKEN=your_huggingface_token
GROQ_API_KEY=your_groq_key
GROQ_MODEL=llama-3.3-70b-versatile
BACKEND_CORS_ORIGINS=https://marketlens-e347c.web.app,https://marketlens-e347c.firebaseapp.com
"@ | Set-Content backend\cloudrun.env

gcloud run deploy marketlens-api `
  --source backend `
  --region us-central1 `
  --allow-unauthenticated `
  --env-vars-file backend\cloudrun.env
```

After the service is created, copy the Cloud Run service URL.

The `--env-vars-file` form avoids escaping problems with the comma-separated CORS origin list.

## 3. Deploy the Firebase frontend

Firebase Hosting rewrites `/api/*` to Cloud Run, so the frontend can deploy without a separate API origin:

```powershell
firebase deploy --only hosting
```

The site will be published to:

```text
https://marketlens-e347c.web.app
```

## 4. Optional follow-up

If you prefer a separate API origin later, remove the Hosting rewrite and set `VITE_API_BASE_URL` at build time instead.
