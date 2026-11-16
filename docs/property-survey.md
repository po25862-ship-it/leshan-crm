# 雲端物調

CRM 的 `/#/property-survey` 使用既有 Firebase 登入。每位已開通的同仁各自儲存物調，API 以已驗證的帳號建立 Firestore 路徑，忽略客戶端指定的擁有人。按預覽與下載前先儲存，儲存失敗不繼續產出。每筆有 revision，其他裝置的舊草稿不能直接覆蓋更新。

Word 沿用核對過的 A4 範本，在瀏覽器以 OOXML 填欄位、插入照片，保持文字可編輯。預覽、PDF、JPG 使用同一個 A4 canvas，無須本機 Word、Python 或 LibreOffice。照片等比例縮小完整呈現；字數過長會拒絕輸出，避免截字。公開資產只包含空白範本、公司標誌及開源文楷字型，授權附在同目錄。

AI API 使用伺服器的 `PROPERTY_SURVEY_GEMINI_API_KEY`，不使用 `REACT_APP_` 前綴，也不傳給瀏覽器。原文及照片一律作資料擷取，不採納其中的指令。來源聯絡資訊不會取代使用者的門市與業務聯絡欄位。

首次搬移的本機案件以 `api/_data/property-survey-initial.private.json` 隨部署傳入，只有伺服器會讀取，檔案不受 Git 追蹤，不可放入 public 或前端 import。只有原主要管理者登入並呼叫列表時會匯入；以完成標記避免重複執行，不覆蓋已存在的雲端案件。後續可在物調頁上傳個別本機案件 JSON。

驗證：`node --test scripts/property-survey.test.cjs`；`CI=true npm test -- --watchAll=false --runInBand --testPathPattern=PropertySurvey`；`npm run build`。
