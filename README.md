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
- 所有資料即時雲端同步，手機新增、電腦馬上看得到

## 尚未包含（下一階段）

- **Telegram 自動推播**：目前「跟進提醒」只會在你打開系統時顯示。如果要做到「不用開系統，Telegram 自動主動通知」，需要加一個 Firebase Cloud Function 搭配排程器，這部分等你確認核心功能穩定好用後，我們再加上去（需要升級 Firebase 方案為 Blaze，但用量極低，實際費用接近 0）。
- 客戶重複比對、多人協作、跟 leshan-realestate 串接：目前刻意不做，等未來真的需要再擴充。

## 本機開發（選用，若你想在自己電腦上先測試再上傳 GitHub）

```
npm install
npm start
```
