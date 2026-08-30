# 案件控台（leshan-crm）

劉昭佑客戶管理與案件追蹤系統。React + Firebase，手機／電腦即時雲端同步。

## 建置步驟（第一次設定）

### 1. 建立 Firebase 專案
1. 前往 https://console.firebase.google.com 建立新專案（例如 `leshan-crm`）
2. 左側選單「Build → Firestore Database」→ 建立資料庫 → 選「正式環境模式」→ 位置選 `asia-east1`（台灣近）
3. 左側選單「Build → Authentication」→ 開始使用 → 登入方式選「電子郵件/密碼」→ 啟用
4. 在 Authentication 的「使用者」頁籤，手動新增一組你自己要用的帳號密碼（這是你登入系統用的帳號，跟 Google 帳號無關）
5. 左側選單「專案設定」（齒輪圖示）→ 一般 → 往下捲到「你的應用程式」→ 點網頁圖示 `</>` 新增網頁應用程式 → 取名（例如 crm-web）→ 註冊後會看到一段 `firebaseConfig`

### 2. 填入 Firebase 設定
打開 `src/firebase.js`，把剛剛複製的 `firebaseConfig` 內容整個貼上取代原本的 `YOUR_API_KEY` 等佔位值。

### 3. 部署 Firestore 安全規則
在 Firebase 主控台的 Firestore Database → 規則頁籤，把 `firestore.rules` 的內容貼上並發布。
（這條規則的意思是：只有登入過的帳號才能讀寫資料，避免資料外流。）

### 4. 建立 GitHub Repo
1. 到 GitHub 新增一個 repo，例如 `leshan-crm`
2. 把這整個資料夾的檔案上傳（可以用 GitHub 網頁的「Add file → Upload files」，跟你 leshan-realestate 的做法一樣）

### 5. 用 Vercel 部署
1. 到 Vercel 用 GitHub 帳號登入，選擇剛剛建立的 `leshan-crm` repo → Import
2. Build Command 設定為：
   ```
   CI=false DISABLE_ESLINT_PLUGIN=true react-scripts build
   ```
3. Output Directory 保持預設 `build`
4. 部署完成後會拿到一個網址，例如 `leshan-crm.vercel.app`

之後每次你在 GitHub 網頁編輯器修改檔案並儲存，Vercel 會自動重新部署，約 1 分鐘生效——跟你現在維護 leshan-realestate 的方式完全一樣。

## 系統功能（目前版本）

- **總覽**：待跟進客戶數、進行中案件數、近 14 天關鍵日期一覽
- **客戶**：新增/編輯客戶、標記買方／賣方、一鍵「記錄今日跟進」
- **案件**：看板式管理，狀態標籤自由輸入（不強制固定流程），可關聯客戶與物件、設定關鍵日期（委託到期、簽約日等）
- **設定**：可調整「幾天未聯絡算需要跟進」的天數門檻
- **LINE 對話分析**：匯入 LINE `.txt` 後於瀏覽器本機解析；買方模式抽取客需並配對物件，屋主模式整理委售動機、價格、時程與異議，同事模式整理內部訴求、阻礙、時限與處理優先程度
- 所有資料即時雲端同步，手機新增、電腦馬上看得到

### LINE 對話分析的資料處理

- 文字解析與評分都在瀏覽器本機完成，不會送到外部 AI 服務。
- 只有使用者按下「建立客需」後，抽取出的結構化欄位與分析摘要才會存入 Firestore `needs`。
- 自動配對直接使用既有 Matching Engine V2 與 `properties` 物件庫，不建立重複的物件資料。
- 屋主結果寫入既有 `contacts/{屋主}/listings`；同事訴求寫入 `topics` 商談管理，沿用現有權限與追蹤流程。
- 每份結果會提供白話解讀、分數原因、原始對話證據、尚缺資訊、建議追問，以及可直接複製傳送的 LINE 回覆。
- 重要對話可採省費用的「ChatGPT 手動深度分析」流程：把 LINE 檔交給 ChatGPT 分析，再將產生的 `leshan-crm.deep-analysis.v1` JSON 直接拖入本頁。CRM 只在本機驗證固定欄位，先預覽、選擇對應買方／屋主／同事，再由使用者確認寫入，不需串接付費 AI API。
- 深度分析可額外保存核心動機、情緒與信任變化、決策階段、決策者、隱藏顧慮、矛盾點、業務表現與 24 小時／3 天／7 天行動計畫；未知欄位會忽略，字串與陣列長度也有安全上限。
- 分析完成後才選擇歸檔對象：可連結現有買方／屋主；名單中沒有時，再選擇新增正式客戶或先列為觀察中。完整分析會保存在該客戶的「對話分析」歷史，不會覆蓋先前紀錄。
- 追蹤中或觀察中的屋主可在詳細頁右上直接按「轉為已委託」；確認後會改為正式客戶、補上委託起始日並同步至物件管理，不必再到編輯表單尋找狀態欄位。
- 對話分析採「案件優先」歸檔：屋主可直接選既有委託案件，買方可直接選既有客需，只併入分析而不新增第二位客戶或第二筆案件。LINE 暱稱與正式姓名不同時，可依案名、屋主／買方姓名判斷；誤建的屋主追蹤也可在詳細頁按「併入既有委託」修正。

## 尚未包含（下一階段）

- **Telegram 自動推播**：目前「跟進提醒」只會在你打開系統時顯示。如果要做到「不用開系統，Telegram 自動主動通知」，需要加一個 Firebase Cloud Function 搭配排程器，這部分等你確認核心功能穩定好用後，我們再加上去（需要升級 Firebase 方案為 Blaze，但用量極低，實際費用接近 0）。
- 客戶重複比對、多人協作、跟 leshan-realestate 串接：目前刻意不做，等未來真的需要再擴充。

## 本機開發（選用，若你想在自己電腦上先測試再上傳 GitHub）

```
npm install
npm start
```

## Leshan Market Crawler（Sprint 1–4）

物件詳細頁已新增「市場競品／市場照片」。目前串接台灣房屋單一物件網址，流程為：

```text
CRM（Firebase 登入）
→ Vercel /api/market/crawl
→ 這台 Mac 的按需 GitHub Actions runner
→ Crawl4AI / Chromium
→ 下載、規則過濾、SHA256＋pHash 去重
→ 私有 Google Drive（drive.file scope）
→ drive_file_id 寫入 Firestore 物件子集合
→ /api/market/image 驗證登入後串流圖片
```

### 部署邊界

CRM 繼續部署於 Vercel。台灣房屋會封鎖 GitHub 雲端機房 IP，因此 `.github/workflows/market-crawl.yml` 限定使用這台 Mac 上標記為 `leshan-market` 的 self-hosted runner。Runner 不安裝成常駐服務；需要抓資料時才執行 `/Users/po25862/Documents/Codex/leshan-actions-runner/run-once.command`，完成一個工作後自動停止。不需要 Railway、Render 或 VPS。CRM 先寫入 queued 狀態，GitHub job 再更新 running／completed／failed，因此 Vercel 不需要等待爬蟲完成。

因 repo 是公開的，Runner 開啟時不要核准或執行陌生 PR 的 workflow。市場爬蟲只允許 `workflow_dispatch` 手動工作，並要求 `self-hosted`、`macOS`、`ARM64`、`leshan-market` 四個標籤。

Vercel 需設定：

```text
GITHUB_ACTIONS_TOKEN=只授權此repo Actions:write的fine-grained token
GITHUB_ACTIONS_REPOSITORY=po25862-ship-it/leshan-crm
MARKET_JOB_ENCRYPTION_KEY=32位元組隨機值的base64（GitHub需填相同值）
FIREBASE_SERVICE_ACCOUNT_JSON=Firebase服務帳號JSON（單行Secret）
GOOGLE_CLIENT_ID=Google OAuth client id
GOOGLE_CLIENT_SECRET=Google OAuth client secret
GOOGLE_REFRESH_TOKEN=Google OAuth refresh token
```

GitHub repo 的 Settings → Secrets and variables → Actions 需設定：

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_DRIVE_ROOT_FOLDER_ID（選填；未設定時第一次執行會自動建立私人資料夾）
FIREBASE_SERVICE_ACCOUNT_JSON
MARKET_JOB_ENCRYPTION_KEY
```

OAuth scope 使用 `drive.file`；若沒有設定 `GOOGLE_DRIVE_ROOT_FOLDER_ID`，第一個 crawl job 會由同一個 OAuth 應用程式在「我的雲端硬碟」自動建立 `Leshan Market Crawler` 私人資料夾。程式不會建立公開 permission，也不使用 Drive 公開分享網址。因 repo 是公開的，CRM 會以 AES-256-GCM 加密網址、Firestore 物件 ID 與 UID，Actions 介面和公開 log 只會看到密文。GitHub Actions secrets 與 Vercel Environment Variables 都不能提交到 repo。

部署 Firestore 規則：

```bash
firebase deploy --only firestore:rules
```

### DE02505039 測試

1. 雙擊 `/Users/po25862/Documents/Codex/leshan-actions-runner/run-once.command`，保持開啟的終端機視窗不動。
2. 登入已部署的 CRM。
3. 在「物件管理」新增或開啟對應 CRM 物件。
4. 在右側「市場競品／市場照片」貼入：
   `https://www.twhg.com.tw/buy/DE02505039?agid=06459`
5. 按「從網址匯入」。畫面會依序顯示排隊、掃描中與完成，通常需要數分鐘。Runner 完成這一個工作後會自動停止。
6. 完成後確認來源編號為 `DE02505039`、市場照片可顯示，且 Firestore 的 `marketPhotos` 只有 `drive_file_id`，沒有 OAuth secret 或公開 Drive URL。

執行狀態可在 GitHub repo 的 Actions → Leshan Market Crawl 查看；工作輸入只會顯示加密密文。正常使用不需要手動按 Run workflow，CRM 會自動 dispatch。

目前尚未完成 591、永慶、樂屋 Adapter，以及跨來源同戶辨識／競品分級；資料模型已保留 `source`、`sourcePropertyId`、`listingId` 與圖片雜湊，後續可在不改 UI 儲存邊界的情況下加入。
