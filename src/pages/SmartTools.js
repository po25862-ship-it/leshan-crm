import React, { useMemo, useState } from "react";
import { ExternalLink, MapPinned, Route, Cloud, HardDriveUpload, Sparkles, Copy, Download } from "lucide-react";
import { useCollection } from "../hooks/useCollection";
import { useSharedCollection } from "../hooks/useSharedCollection";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import { useAuth } from "../AuthContext";
import { useGoogleAuth } from "../GoogleAuthContext";
import { buildDirectionsUrl, buildMapSearchUrl } from "../lib/googleMaps";
import { askGemini, getGeminiApiKey, saveGeminiApiKey } from "../lib/gemini";

const AI_TASKS = {
  summary: "請把以下房仲工作紀錄整理成：重點、客戶需求、待確認問題、下一步。使用繁體中文，內容精簡且不得自行捏造資料：",
  followup: "請依下列資料寫一則自然、有禮、不造成壓力的客戶追蹤訊息。使用繁體中文，適合貼到 LINE，不要加入資料中沒有的承諾：",
  ad: "請依下列物件資料產生房屋廣告文案。使用繁體中文，包含吸睛標題、5 個真實賣點、簡短行動呼籲；不得捏造資料或使用保證獲利字眼：",
};

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SmartTools() {
  const { user } = useAuth();
  const { items: properties } = useCollection("properties", "createdAt");
  const { items: contacts } = useSharedCollection("contacts", "name", user.uid);
  const { items: rentals } = useSharedCollection("rentals", "createdAt", user.uid);
  const { items: topics } = useSharedCollection("topics", "createdAt", user.uid);
  const { items: needs } = useNeedsCollection(user.uid);
  const { isConnected, email, connect, uploadToDrive } = useGoogleAuth();
  const [selectedIds, setSelectedIds] = useState([]);
  const [mapKeyword, setMapKeyword] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveResult, setDriveResult] = useState(null);
  const [apiKey, setApiKey] = useState(() => getGeminiApiKey());
  const [aiInput, setAiInput] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [aiBusy, setAiBusy] = useState(false);

  const mappableAll = useMemo(() => properties.filter((p) => p.address && (p.status || "active") === "active"), [properties]);
  const mappable = useMemo(() => {
    const key = mapKeyword.trim().toLowerCase();
    if (!key) return mappableAll;
    return mappableAll.filter((p) => `${p.title || ""} ${p.address || ""}`.toLowerCase().includes(key));
  }, [mappableAll, mapKeyword]);
  const selectedProperties = selectedIds.map((id) => mappableAll.find((p) => p.id === id)).filter(Boolean);
  const routeUrl = buildDirectionsUrl(selectedProperties.map((p) => p.address));
  const counts = { properties: properties.length, contacts: contacts.length, rentals: rentals.length, topics: topics.length, needs: needs.length };

  const toggleStop = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 8 ? prev : [...prev, id]);
  };

  const makeBackup = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.email || user.uid,
      collections: { properties, contacts, rentals, topics, needs },
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  };

  const backupName = () => `樂善CRM備份-${new Date().toISOString().slice(0, 10)}.json`;

  const uploadBackup = async () => {
    if (!isConnected) return connect();
    setDriveBusy(true);
    setDriveResult(null);
    try {
      const result = await uploadToDrive(makeBackup(), backupName());
      setDriveResult(result);
    } catch (err) {
      alert(err.message);
    } finally {
      setDriveBusy(false);
    }
  };

  const uploadFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isConnected) {
      alert("請先連結 Google 帳號，再選擇檔案");
      connect();
      return;
    }
    setDriveBusy(true);
    try {
      setDriveResult(await uploadToDrive(file));
    } catch (err) {
      alert(err.message);
    } finally {
      setDriveBusy(false);
    }
  };

  const runAi = async (task) => {
    const key = apiKey.trim();
    if (!key) return alert("請先輸入 Gemini API Key");
    if (!aiInput.trim()) return alert("請先貼上要整理的內容");
    saveGeminiApiKey(key);
    setAiBusy(true);
    setAiOutput("");
    try {
      setAiOutput(await askGemini({ apiKey: key, prompt: `${AI_TASKS[task]}\n\n${aiInput.trim()}` }));
    } catch (err) {
      alert(`AI 處理失敗：${err.message}`);
    } finally {
      setAiBusy(false);
    }
  };

  const copyAi = async () => {
    await navigator.clipboard.writeText(aiOutput);
    alert("AI 結果已複製");
  };

  return (
    <main>
      <div className="section-title">智慧工具</div>
      <div className="smart-tools-grid">
        <section className="panel smart-tool-card smart-tool-wide">
          <div className="smart-tool-heading"><MapPinned size={20} /><div><h3>Google Maps 帶看路線</h3><p>依選取順序安排多間物件，最多 8 個地點。</p></div></div>
          <div className="form-field route-search"><label>搜尋在售物件</label><input value={mapKeyword} onChange={(e) => setMapKeyword(e.target.value)} placeholder="輸入案名或地址" /></div>
          <div className="route-list">
            {mappable.length === 0 && <div className="empty-state">物件尚未填寫地址</div>}
            {mappable.map((property) => {
              const order = selectedIds.indexOf(property.id);
              return <div className="route-row" key={property.id}>
                <button className={`route-order ${order >= 0 ? "selected" : ""}`} onClick={() => toggleStop(property.id)}>{order >= 0 ? order + 1 : "+"}</button>
                <div><strong>{property.title}</strong><span>{property.address}</span></div>
                <a href={buildMapSearchUrl(property.address)} target="_blank" rel="noreferrer" aria-label={`查看 ${property.title} 地圖`}><ExternalLink size={16} /></a>
              </div>;
            })}
          </div>
          <div className="smart-tool-actions">
            <a className={`btn ${routeUrl ? "" : "disabled"}`} href={routeUrl || undefined} target="_blank" rel="noreferrer"><Route size={15} /> 開啟帶看路線</a>
            <button className="btn ghost" onClick={() => setSelectedIds([])}>清除</button>
          </div>
        </section>

        <section className="panel smart-tool-card">
          <div className="smart-tool-heading"><Cloud size={20} /><div><h3>Firebase 雲端同步</h3><p>登入、資料庫與檔案儲存已啟用。</p></div></div>
          <div className="health-list">
            <span><b>帳號</b>{user.email || "已登入"}</span>
            <span><b>物件</b>{counts.properties} 筆</span>
            <span><b>客戶</b>{counts.contacts} 筆</span>
            <span><b>出租／商談／客需</b>{counts.rentals + counts.topics + counts.needs} 筆</span>
          </div>
          <button className="btn ghost" onClick={() => downloadBlob(makeBackup(), backupName())}><Download size={15} /> 下載本機備份</button>
        </section>

        <section className="panel smart-tool-card">
          <div className="smart-tool-heading"><HardDriveUpload size={20} /><div><h3>Google Drive</h3><p>每位同事備份到自己的 Drive。</p></div></div>
          <div className="connection-state">{isConnected ? `已連結：${email || "Google 帳號"}` : "尚未連結 Google 帳號"}</div>
          <div className="smart-tool-actions vertical">
            <button className="btn" onClick={uploadBackup} disabled={driveBusy}>{driveBusy ? "上傳中…" : isConnected ? "備份 CRM 到 Drive" : "連結 Google 帳號"}</button>
            <label className={`btn ghost ${driveBusy ? "disabled" : ""}`}>上傳附件到 Drive<input type="file" hidden onChange={uploadFile} disabled={driveBusy} /></label>
          </div>
          {driveResult && <a className="drive-result" href={`https://drive.google.com/open?id=${driveResult.id}`} target="_blank" rel="noreferrer">已上傳「{driveResult.name}」<ExternalLink size={14} /></a>}
        </section>

        <section className="panel smart-tool-card smart-tool-wide">
          <div className="smart-tool-heading"><Sparkles size={20} /><div><h3>AI 房仲助理</h3><p>整理紀錄、產生追蹤訊息與物件文案；結果送出前請自行確認。</p></div></div>
          <div className="form-field"><label>我的 Gemini API Key（只保存在這台裝置）</label><input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="從 Google AI Studio 取得" autoComplete="off" /></div>
          <div className="form-field"><label>工作內容／客戶紀錄／物件資料</label><textarea rows="7" value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="貼上內容，AI 不會自動讀取整個 CRM，也不會自動發送訊息。" /></div>
          <div className="smart-tool-actions"><button className="btn" onClick={() => runAi("summary")} disabled={aiBusy}>整理重點</button><button className="btn ghost" onClick={() => runAi("followup")} disabled={aiBusy}>產生追蹤訊息</button><button className="btn ghost" onClick={() => runAi("ad")} disabled={aiBusy}>產生物件文案</button></div>
          {aiBusy && <div className="ai-output">AI 整理中…</div>}
          {aiOutput && <div className="ai-output"><button className="btn ghost ai-copy" onClick={copyAi}><Copy size={14} /> 複製</button><pre>{aiOutput}</pre></div>}
        </section>
      </div>
    </main>
  );
}
