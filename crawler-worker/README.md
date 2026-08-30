# Leshan Market Crawler Worker

這是 CRM 之外的獨立 FastAPI／Crawl4AI worker。Chromium 不在 Vercel Serverless 內執行；worker 必須部署到 Railway、Render 或 VPS，且只接受 CRM Vercel API 帶入的內部 token。

## 本機啟動

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
crawl4ai-setup
cp .env.example .env
uvicorn app.main:app --reload --port 8080
```

測試：

```bash
pip install pytest
pytest -q
```

正式環境請設定 `.env.example` 列出的 Secret。OAuth scope 使用 `https://www.googleapis.com/auth/drive.file`；程式不建立公開分享權限，CRM 圖片一律透過已登入驗證的 `/api/market/image` 串流。
