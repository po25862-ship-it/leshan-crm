# Leshan Market Crawler Worker

這是 CRM 之外的 Crawl4AI 工作程式。正式免費方案由 `.github/workflows/market-crawl.yml` 派送到這台 Mac 的 `leshan-market` self-hosted runner。台灣房屋會封鎖 GitHub 雲端機房 IP，因此 runner 只在需要時以 `run.sh --once` 啟動，完成一個工作後自動停止，不需要常駐主機。

## GitHub Actions

`app.job` 會執行完整流程：抓取台灣房屋、下載與去重、上傳私人 Drive、將 `drive_file_id` 寫回 Firestore。所需值全部來自 GitHub Actions secrets，不寫入 repo 或 log。Runner 使用 `self-hosted`、`macOS`、`ARM64`、`leshan-market` 標籤，且不應在啟動期間執行不受信任的 PR workflow。

## 本機除錯（選用）

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

OAuth scope 使用 `https://www.googleapis.com/auth/drive.file`；程式不建立公開分享權限，CRM 圖片一律透過已登入驗證的 `/api/market/image` 串流。FastAPI `app.main` 與 Dockerfile 保留作本機除錯或未來自架，但免費正式流程不會部署它們。
