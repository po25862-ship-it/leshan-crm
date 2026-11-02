import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../AuthContext';
import { EMPTY_OUTREACH, OUTREACH_STATUSES, outreachToday, shiftOutreachDay, normalizeOutreachAddress, duplicateOutreach, followLabel, outreachPrintProblems, outreachFromProperty, safeOutreachFilename, MAX_LIBRARY_BYTES, MAX_OUTREACH_SELECTION } from '../lib/outreachModel';
import { listOutreach, saveOutreach, saveOutreachSettings, outreachHistory, logOutreachBatch, saveOutreachSelection, uploadOutreachLetter, readOutreachLetter, archiveOutreachLetter, saveOutreachTextLetter, removeUnusedOutreachLetter } from '../lib/outreachRepository';
import { createOutreachLabels, createOutreachLetters, fillOutreachTemplate } from '../lib/outreachPdf';
import './OutreachLetters.css';
import { lookupOutreachPostal } from '../lib/outreachPostal';

const EMPTY_DATA = { records: [], letters: [], batches: [], settings: {} };
const POSTAL_URL = 'https://www.post.gov.tw/post/internet/SearchZone/index.jsp?ID=130107&list=1';
const formatBytes = n => `${(n / 1024 / 1024).toFixed(1)} MB`;
function PostalField({ address, zip, verifiedAddress, onChange }) {
  const [message, setMessage] = useState('');
  const currentAddress = useRef(address); currentAddress.current = address;
  const alive = useRef(true); useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const verified = !!zip && normalizeOutreachAddress(verifiedAddress) === normalizeOutreachAddress(address);
  const queryPostal = async signal => {
    const requested = address; setMessage('正在向郵局比對六碼…');
    try { const result = await lookupOutreachPostal(requested, signal); if (!alive.current || currentAddress.current !== requested || signal?.aborted) return; if (!result.zip) { setMessage('郵局未能唯一判定，請核對完整地址後重試，或手動填寫六碼。'); return; } onChange({ zip: result.zip, zipVerifiedAddress: requested }); setMessage(`已依郵局資料比對：${result.zip}`); }
    catch(e) { if (alive.current && currentAddress.current === requested && !signal?.aborted) setMessage(e.message || '查詢暫時無法連線，可手動核對六碼。'); }
  };
  useEffect(() => { if (verified || !/[號]/.test(address) || address.trim().length < 8) return; const controller = new AbortController(); const timer = setTimeout(() => queryPostal(controller.signal), 900); return () => { clearTimeout(timer); controller.abort(); }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [address, verified]);
  return <div className="ol-postal"><label>六碼郵遞區號<input inputMode="numeric" maxLength={6} value={zip || ''} onChange={e => onChange({ zip: e.target.value.replace(/\D/g, ''), zipVerifiedAddress: '' })} placeholder="例：333001" /></label><div className="ol-actions"><button type="button" className="btn ghost" onClick={() => queryPostal()}>重新查六碼</button><a href={POSTAL_URL} target="_blank" rel="noreferrer">郵局查詢</a><label className="ol-check"><input type="checkbox" checked={verified} disabled={!/^\d{6}$/.test(zip || '') || !address.trim()} onChange={e => onChange({ zipVerifiedAddress: e.target.checked ? address : '' })} />{verified ? '地址與六碼已確認' : '我已核對地址與六碼'}</label></div>{message && <p className="ol-muted" role="status">{message}</p>}<p className="ol-muted">輸入完整門牌後自動向中華郵政查詢；只取得中文地址與六碼。</p></div>;
}

export default function OutreachLetters() {
  const { user } = useAuth(), uid = user.uid;
  const [params, setParams] = useSearchParams();
  const [dataState, setDataState] = useState({ uid, data: EMPTY_DATA });
  const data = dataState.uid === uid ? dataState.data : EMPTY_DATA;
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [tab, setTab] = useState('records'), [draft, setDraft] = useState(null), [keyword, setKeyword] = useState(''), [filter, setFilter] = useState('active');
  const [selected, setSelected] = useState([]), [batchName, setBatchName] = useState(''), [batchId, setBatchId] = useState(''), [applyLetter, setApplyLetter] = useState('');
  const [history, setHistory] = useState(null), [logForm, setLogForm] = useState(null), [mode, setMode] = useState('both'), [start, setStart] = useState(1);
  const [result, setResult] = useState(null), [preview, setPreview] = useState(null), [sender, setSender] = useState(null), [textLetter, setTextLetter] = useState(null);
  const currentUid = useRef(uid); currentUid.current = uid;
  const resultUrls = useRef([]), previewUrl = useRef(''), formRef = useRef(null), generatedRef = useRef(null);
  const today = outreachToday();
  const refresh = useCallback(async () => { const value = await listOutreach(uid); if (currentUid.current === uid) setDataState({ uid, data: value }); return value; }, [uid]);
  useEffect(() => { let active = true; setLoading(true); setSelected([]); setDraft(null); setHistory(null); setLogForm(null); setSender(null); setTextLetter(null); setBatchName(''); setBatchId(''); setError(''); refresh().catch(e => { if (active) setError(e.message || '讀取失敗，請重新整理。'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [refresh]);
  useEffect(() => () => { resultUrls.current.forEach(URL.revokeObjectURL); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);
  const clearResult = useCallback(() => { resultUrls.current.forEach(URL.revokeObjectURL); resultUrls.current = []; setResult(null); }, []);
  useEffect(() => { clearResult(); setPreview(null); if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, [uid, clearResult]);
  const act = async operation => { if (busy) return; setBusy(true); setError(''); setNotice(''); try { await operation(); } catch (e) { if (currentUid.current === uid) setError(e.code === 'storage/unauthorized' || e.code === 'permission-denied' ? '無法讀取這份私人資料，請確認目前登入帳號。' : e.message || '操作失敗，請稍後再試。'); } finally { if (currentUid.current === uid) setBusy(false); } };
  const chosen = selected.map(id => data.records.find(r => r.id === id)).filter(Boolean);
  const visible = useMemo(() => data.records.filter(r => {
    const text = `${r.title} ${r.listingNo} ${r.recipient} ${r.address} ${r.notes}`.toLowerCase();
    if (!text.includes(keyword.toLowerCase().trim())) return false;
    if (filter === 'due') return r.followOn && r.followOn <= today && !['不再寄送', '暫停追蹤'].includes(r.status);
    if (filter === 'never') return !r.sentCount;
    if (filter === 'active') return !['不再寄送', '暫停追蹤', '退件待處理'].includes(r.status);
    if (filter === 'all') return true;
    return r.status === filter;
  }), [data.records, keyword, filter, today]);
  const hiddenSelected = chosen.filter(r => !visible.some(v => v.id === r.id)).length;
  const issues = chosen.map(r => ({ record: r, messages: outreachPrintProblems(r, data.letters, data.settings, mode) })).filter(i => i.messages.length);
  const usedBytes = data.letters.reduce((n,l) => n + l.size, 0);
  const changeSelection = ids => { if (busy) return; if (ids.length > MAX_OUTREACH_SELECTION) { setError('每批最多 200 筆，請縮小篩選範圍。'); return; } clearResult(); setSelected(ids); setBatchId(''); };
  const openDraft = value => { setTab('records'); setDraft({ ...value }); setHistory(null); requestAnimationFrame(() => formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })); };
  useEffect(() => {
    const propertyId = params.get('property'); if (!propertyId) return;
    let active = true;
    getDoc(doc(db, 'properties', propertyId)).then(snapshot => { if (active && currentUid.current === uid && snapshot.exists()) { const property = { ...snapshot.data(), id: snapshot.id }; setDraft({ ...outreachFromProperty(property), letterId: data.settings.defaultLetter || '' }); setNotice('已帶入物件資訊。請另外填屋主實際收件地址，避免寄錯。'); setParams({}, { replace: true }); } }).catch(() => { if (active) setError('無法讀取物件，仍可手動新增開發紀錄。'); });
    return () => { active = false; };
    // Read this once per property shortcut, without re-opening the editor on data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, uid]);
  const updateDraft = (key, value) => setDraft(d => ({ ...d, [key]: value, ...(key === 'address' ? { zipVerifiedAddress: '' } : {}) }));
  const submitDraft = e => { e.preventDefault(); act(async () => {
    if (duplicateOutreach(data.records, draft)) throw new Error('同一收件人與地址已有紀錄，請使用原案件追加寄信或追蹤。');
    const id = await saveOutreach(uid, draft); clearResult(); setDraft(null); await refresh(); setNotice('已儲存在你的私人帳號。'); setSelected(ids => ids.includes(id) ? ids : [...ids, id]);
  }); };
  const openPreview = letter => act(async () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    if (letter.type === 'text/plain') { setPreview({ id: letter.id, name: letter.name, text: fillOutreachTemplate(letter.text, chosen[0] || { recipient: '屋主先生／小姐', title: '案件名稱', address: '收件地址' }) }); return; }
    const blob = await readOutreachLetter(uid, letter); if (currentUid.current !== uid) return;
    const url = URL.createObjectURL(blob); previewUrl.current = url; setPreview({ id: letter.id, name: letter.name, url, type: letter.type });
  });
  const openLog = (records, type = '已寄出', inBatch = false) => { setLogForm({ inBatch, ids: records.map(r => r.id), type, day: today, followOn: shiftOutreachDay(today, 7), note: '' }); };
  const commitLog = e => { e.preventDefault(); act(async () => {
    const latest = await refresh(), records = logForm.ids.map(id => latest.records.find(r => r.id === id)).filter(Boolean);
    await logOutreachBatch(uid, records, { ...logForm, batchId, letters: latest.letters }); setLogForm(null); setHistory(null); await refresh(); setNotice(`已登記 ${records.length} 筆${logForm.type}紀錄。`);
  }); };
  const generate = () => act(async () => {
    if (!chosen.length) throw new Error('請先勾選案件。');
    clearResult(); const latest = await refresh(), records = selected.map(id => latest.records.find(r => r.id === id)).filter(Boolean);
    if (records.length !== selected.length) throw new Error('部分案件已不存在，請重新選擇。');
    const invalid = records.filter(r => outreachPrintProblems(r, latest.letters, latest.settings, mode).length);
    if (invalid.length) throw new Error(`有 ${invalid.length} 筆資料待補，請修正或按「本次略過待補案件」。`);
    const created = { records, mode, letters: latest.letters, manifest: [], letterPages: 0, labelPages: 0 };
    try {
      if (mode !== 'labels') { const merged = await createOutreachLetters(records, latest.letters, letter => readOutreachLetter(uid, letter)); created.letterPages = merged.pages; created.manifest = merged.manifest; created.letterUrl = URL.createObjectURL(new Blob([merged.bytes], { type: 'application/pdf' })); resultUrls.current.push(created.letterUrl); }
      if (mode !== 'letters') { const labels = await createOutreachLabels(records, latest.settings, { start, ...readCalibration(uid) }); created.labelPages = labels.pages; created.labelUrl = URL.createObjectURL(new Blob([labels.bytes], { type: 'application/pdf' })); resultUrls.current.push(created.labelUrl); }
      if (auth.currentUser?.uid !== uid) throw new Error('帳號已變更，請重新登入。');
      let historyWarning = '';
      try { await logOutreachBatch(uid, records, { type: '已產生', day: today, batchId, note: `${mode === 'both' ? '信件與標籤' : mode === 'labels' ? '標籤' : '信件'}；信件 ${created.letterPages} 頁，標籤 ${created.labelPages} 張A4`, letters: latest.letters }); await refresh(); } catch (e) { historyWarning = `檔案已製作，但歷程未寫入：${e.message}`; }
      setResult({ ...created, historyWarning }); requestAnimationFrame(() => generatedRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (e) { clearResult(); throw e; }
  });
  const recordPrinted = () => act(async () => {
    const latest = await refresh(), records = result.records.map(r => latest.records.find(x => x.id === r.id));
    if (records.some((r,i) => !r || ['recipient','address','zip','letterId'].some(key => r[key] !== result.records[i][key]))) throw new Error('這批案件資料已變更，請重新製作後再登記。');
    await logOutreachBatch(uid, records, { type: '已列印', day: today, note: `信件 ${result.letterPages} 頁；標籤 ${result.labelPages} 張A4`, batchId, letters: result.letters }); await refresh(); setNotice('已登記列印完成，尚未增加寄出次數。');
  });
  const upload = files => act(async () => { let letters = [...data.letters], count = 0, duplicate = 0; const failed = []; for (const file of files) { try { const result = await uploadOutreachLetter(uid, file, letters); if (result.duplicate) duplicate++; else { letters.unshift(result); count++; } } catch (e) { failed.push(`${file.name}：${e.message}`); } } await refresh(); setNotice(`新增 ${count} 份，略過相同內容 ${duplicate} 份。`); if (failed.length) setError(failed.join('；')); });
  const applyToSelected = () => act(async () => { if (!chosen.length || !applyLetter) throw new Error('請先選擇案件與開發信。'); for (const record of chosen) await saveOutreach(uid, { ...record, letterId: applyLetter }); clearResult(); await refresh(); setNotice('已套用到本次勾選案件。'); });
  const importRows = file => act(async () => {
    const XLSX = await import('xlsx'), workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' }), rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '', raw: false });
    if (rows.length > 200) throw new Error('每次匯入最多 200 筆，請分批匯入。');
    let imported = 0, skipped = 0; const failures = [], existing = [...data.records];
    for (const [index, row] of rows.entries()) {
      const draft = { ...EMPTY_OUTREACH, title: String(row['案件名稱'] || row['案名'] || ''), recipient: String(row['收件人'] || row['姓名'] || ''), address: String(row['收件地址'] || row['地址'] || ''), zip: String(row['郵遞區號'] || ''), listingNo: String(row['委託書編號'] || ''), url: String(row['案件網址'] || ''), notes: String(row['備註'] || ''), letterId: data.settings.defaultLetter || '' };
      if (duplicateOutreach(existing, draft)) { skipped++; continue; }
      try { const id = await saveOutreach(uid, draft); existing.push({ ...draft, id }); imported++; } catch (e) { failures.push(`第 ${index+2} 列：${e.message}`); }
    }
    await refresh(); setNotice(`已匯入 ${imported} 筆，略過重複 ${skipped} 筆。匯入的郵遞區號仍須核對。`); if (failures.length) setError(failures.join('；'));
  });
  const exportRows = () => act(async () => { const XLSX = await import('xlsx'), rows = data.records.map(r => ({ 案件名稱:r.title, 收件人:r.recipient, 收件地址:r.address, 郵遞區號:r.zip, 委託書編號:r.listingNo, 案件網址:r.url, 案件狀態:r.status, 最近寄出:r.lastSentOn, 寄出次數:r.sentCount, 下次追蹤:r.followOn, 備註:r.notes })), workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ 案件名稱:'',收件人:'',收件地址:'',郵遞區號:'',委託書編號:'',案件網址:'',備註:'' }]), '開發信'); XLSX.writeFile(workbook, `私人開發信名單_${today}.xlsx`); });
  const logPanel = logForm&&<section className="panel ol-log" aria-label="登記寄信與追蹤"><h2>登記 {logForm.ids.length} 筆紀錄</h2><form onSubmit={commitLog}><div className="ol-form-grid"><label>類型<select value={logForm.type} onChange={e=>setLogForm(f=>({...f,type:e.target.value}))}>{['已寄出','追蹤','退件'].map(t=><option key={t}>{t}</option>)}</select></label><Field label="實際日期" type="date" max={today} value={logForm.day} required onChange={day=>setLogForm(f=>({...f,day}))}/><Field label="下次追蹤" type="date" value={logForm.followOn} onChange={followOn=>setLogForm(f=>({...f,followOn}))}/><label className="ol-wide">追蹤內容／回覆<textarea value={logForm.note} maxLength={3000} onChange={e=>setLogForm(f=>({...f,note:e.target.value}))}/></label></div><p className="ol-muted">只有「已寄出」會增加寄信次數，同一天不重複登記。</p><div className="ol-save-bar"><button className="btn" disabled={busy}>儲存這批紀錄</button><button type="button" className="btn ghost" onClick={()=>setLogForm(null)}>取消</button></div></form></section>;
  const previewPanel = preview&&<section className="panel ol-preview"><div className="ol-heading"><h2>{preview.name}</h2><button className="btn ghost" onClick={()=>{setPreview(null);if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);}}>關閉預覽</button></div>{preview.text?<pre>{preview.text}</pre>:preview.type==='application/pdf'?<><a className="btn" href={preview.url} target="_blank" rel="noreferrer">開啟完整 PDF</a><iframe title="開發信內容預覽" src={preview.url}/></>:<img src={preview.url} alt="開發信原稿"/>}</section>;
  if (loading || dataState.uid !== uid) return <main className="outreach-page"><p role="status">載入你的私人開發信資料…</p></main>;
  return <main className="outreach-page">
    <header className="ol-heading"><div><h1>開發信</h1><p>我的私人工作區 · 其他同事無法讀取</p></div><div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={() => act(refresh)}>重新整理</button><button className="btn" disabled={busy} onClick={() => openDraft({ ...EMPTY_OUTREACH, letterId: data.settings.defaultLetter || '' })}>＋ 新增紀錄</button></div></header>
    <nav className="ol-tabs" aria-label="開發信功能">{[['records','寄送名單'],['letters','開發信檔案'],['settings','寄件設定']].map(([key,label]) => <button key={key} className={tab===key?'active':''} onClick={() => { setTab(key); if(key==='settings') setSender({ ...data.settings }); }}>{label}</button>)}</nav>
    {busy && <p role="status" className="ol-notice">處理中，請稍候…</p>}{error && <p role="alert" className="ol-error">{error}</p>}{notice && <p role="status" className="ol-notice">{notice}</p>}
    {tab==='records' && <>
      {draft && <section className="panel ol-editor" ref={formRef}><h2>{draft.id?'編輯收件資料':'新增開發紀錄'}</h2><form onSubmit={submitDraft}><div className="ol-form-grid">
        <Field label="案件名稱" value={draft.title} onChange={v=>updateDraft('title',v)} required maxLength={200}/><Field label="委託／自訂編號" value={draft.listingNo} onChange={v=>updateDraft('listingNo',v)}/>
        <Field label="案件網址" value={draft.url} onChange={v=>updateDraft('url',v)} type="url"/>
        <Field label="物件地址（與收件地址分開保存）" value={draft.propertyAddress} onChange={v=>updateDraft('propertyAddress',v)}/>
        <Field label="收件人" value={draft.recipient} onChange={v=>updateDraft('recipient',v)} required maxLength={100}/>
        <label>案件狀態<select value={draft.status} onChange={e=>updateDraft('status',e.target.value)}>{OUTREACH_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
        <div className="ol-wide"><Field label="實際收件地址" value={draft.address} onChange={v=>updateDraft('address',v)} required maxLength={500}/>{draft.propertyAddress && <button className="btn ghost" type="button" onClick={()=>{updateDraft('address',draft.propertyAddress);setNotice('已複製物件地址，請確認屋主確實在此收信。');}}>使用物件地址，再由我確認</button>}<PostalField address={draft.address} zip={draft.zip} verifiedAddress={draft.zipVerifiedAddress} onChange={patch=>setDraft(d=>({...d,...patch}))}/></div>
        <label>開發信<select value={draft.letterId} onChange={e=>updateDraft('letterId',e.target.value)}><option value="">尚未指定</option>{data.letters.filter(l=>!l.archived).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <Field label="下次追蹤" type="date" value={draft.followOn} onChange={v=>updateDraft('followOn',v)}/><label className="ol-wide">備註<textarea maxLength={3000} value={draft.notes} onChange={e=>updateDraft('notes',e.target.value)}/></label>
      </div><div className="ol-save-bar"><button type="submit" className="btn" disabled={busy}>儲存紀錄</button><button type="button" className="btn ghost" disabled={busy} onClick={()=>setDraft(null)}>取消</button></div></form></section>}
      <section className="panel ol-filters"><Field label="搜尋" value={keyword} onChange={setKeyword} placeholder="案名、地址、收件人、編號"/><label>顯示<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="active">可寄送案件</option><option value="all">全部紀錄</option><option value="due">今天／逾期要追蹤</option><option value="never">尚未寄出</option>{OUTREACH_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label><div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={()=>changeSelection([...new Set([...selected,...visible.map(r=>r.id)])])}>全選篩選結果 {visible.length} 筆</button><button className="btn ghost" onClick={()=>changeSelection([])}>清除勾選</button></div><details className="ol-wide"><summary>名單匯入／匯出</summary><p className="ol-muted">Excel 欄位：案件名稱、收件人、收件地址、郵遞區號、案件網址、委託書編號、備註。先匯出空白表即可當範例。</p><div className="ol-actions"><label className="btn ghost">匯入 Excel<input className="ol-file-input" type="file" accept=".xlsx,.xls,.csv" disabled={busy} onChange={e=>{if(e.target.files[0])importRows(e.target.files[0]);e.target.value='';}}/></label><button className="btn ghost" onClick={exportRows} disabled={busy}>匯出我的名單／空白表</button></div></details></section>
      <section className="panel ol-selection"><h2>本次名單 {chosen.length} 筆</h2>{hiddenSelected>0 && <p className="ol-warning">其中 {hiddenSelected} 筆不在目前篩選畫面，仍包含在本次名單，請展開確認。</p>}
        <div className="ol-form-grid"><Field label="批次名稱" value={batchName} onChange={setBatchName} placeholder="例如：A7屋主第一輪"/><label>讀取已存批次<select value={batchId} onChange={e=>{const b=data.batches.find(b=>b.id===e.target.value);clearResult();setBatchId(b?.id||'');setBatchName(b?.name||'');setSelected(b?.recordIds.filter(id=>data.records.some(r=>r.id===id))||[]);}}><option value="">選擇批次</option>{data.batches.map(b=><option value={b.id} key={b.id}>{b.name}（{b.recordIds.length}筆）</option>)}</select></label></div>
        <div className="ol-actions"><button className="btn ghost" disabled={busy||!chosen.length} onClick={()=>act(async()=>{const id=await saveOutreachSelection(uid,batchName,selected,batchId);setBatchId(id);await refresh();setNotice('已保存這批名單，下次可直接讀取。');})}>保存本次名單</button><button className="btn ghost" disabled={busy||!chosen.length} onClick={()=>openLog(chosen, '已寄出', true)}>整批登記寄出</button></div>
        <details className="ol-section"><summary>查看／調整全部 {chosen.length} 筆順序</summary><ol className="ol-selected-list">{chosen.map((r,i)=><li key={r.id}><span>{i+1}. {r.recipient} · {r.title}<small>{r.address} · 上次寄出：{r.lastSentOn||'尚未寄出'}</small></span><div className="ol-actions"><button aria-label={`上移${r.title}`} disabled={!i} onClick={()=>{const ids=[...selected];[ids[i-1],ids[i]]=[ids[i],ids[i-1]];changeSelection(ids);}}>↑</button><button aria-label={`下移${r.title}`} disabled={i===chosen.length-1} onClick={()=>{const ids=[...selected];[ids[i],ids[i+1]]=[ids[i+1],ids[i]];changeSelection(ids);}}>↓</button><button onClick={()=>changeSelection(selected.filter(id=>id!==r.id))}>移除</button></div></li>)}</ol></details>
        <div className="ol-batch-controls"><label>整批套用開發信<select value={applyLetter} onChange={e=>setApplyLetter(e.target.value)}><option value="">選擇開發信</option>{data.letters.filter(l=>!l.archived).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><button className="btn ghost" disabled={busy||!chosen.length||!applyLetter} onClick={applyToSelected}>套用勾選案件</button><button className="btn ghost" onClick={()=>setTab('letters')}>上傳／新增開發信</button></div>
        <details className="ol-section" open={!!chosen.length}><summary>製作列印檔</summary><div className="ol-form-grid"><label>列印內容<select value={mode} onChange={e=>{clearResult();setMode(e.target.value);}}><option value="both">開發信＋收件標籤</option><option value="letters">只印開發信</option><option value="labels">只印收件標籤</option></select></label>{mode!=='letters'&&<label>標籤從第幾格開始<select value={start} onChange={e=>{clearResult();setStart(Number(e.target.value));}}>{Array.from({length:8},(_,i)=><option key={i+1} value={i+1}>第 {i+1} 格</option>)}</select></label>}</div>
          {issues.length>0&&<div className="ol-warning"><strong>{issues.length} 筆需要確認</strong><ul>{issues.map(({record,messages})=><li key={record.id}><button className="ol-text-button" onClick={()=>openDraft(record)}>{record.title}：{messages.join('；')} → 修改</button></li>)}</ul><div className="ol-actions"><button className="btn ghost" onClick={()=>changeSelection(selected.filter(id=>!issues.some(i=>i.record.id===id)))}>本次略過待補案件</button><button className="btn ghost" onClick={()=>{setSender({...data.settings});setTab('settings');}}>寄件設定</button></div></div>}
          {chosen.some(r=>r.sentCount>0)&&<p className="ol-muted">部分案件曾寄過信，請在名單中確認最近寄出日期，避免重複寄送。</p>}
          <div className="ol-actions"><button className="btn" disabled={busy||!chosen.length||issues.length>0} onClick={generate}>製作整批 PDF</button><span className="ol-muted">信件與標籤同順序；A4 標籤一頁八張，105×74 mm。</span></div>
        </details>
        {result&&<section className="ol-result" ref={generatedRef}><h3>列印檔已完成</h3><p>{result.records.length} 位收件人 · 開發信 {result.letterPages} 頁 · 標籤 {result.labelPages} 張 A4</p><div className="ol-actions">{result.letterUrl&&<><a className="btn" href={result.letterUrl} target="_blank" rel="noreferrer">開啟／列印開發信</a><a className="btn ghost" href={result.letterUrl} download={`開發信_${safeOutreachFilename(batchName||today)}.pdf`}>下載開發信</a></>}{result.labelUrl&&<><a className="btn" href={result.labelUrl} target="_blank" rel="noreferrer">開啟／列印標籤</a><a className="btn ghost" href={result.labelUrl} download={`標籤_${safeOutreachFilename(batchName||today)}.pdf`}>下載標籤</a></>}</div><p className="ol-muted">先印信件，再換貼紙。標籤選 A4、100% 實際大小；取消列印不會標記為已寄出。</p>{result.manifest.length>0&&<details><summary>每位收件人對應的信件頁碼</summary><ol>{result.manifest.map(r=><li key={r.id}>{r.recipient} · 第 {r.firstPage}–{r.lastPage} 頁 · {r.letterName}</li>)}</ol></details>}{result.historyWarning&&<p className="ol-warning">{result.historyWarning}</p>}<div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={recordPrinted}>確認這批已列印</button><button className="btn ghost" disabled={busy} onClick={()=>openLog(result.records, '已寄出', true)}>這批已實際寄出</button></div></section>}
        {logForm?.inBatch && logPanel}
      </section>
      <p className="ol-muted">找到 {visible.length} 筆紀錄</p><div className="ol-records">{visible.map(r=><article className="panel ol-record" key={r.id}><div className="ol-record-head"><label className="ol-record-choice"><input type="checkbox" checked={selected.includes(r.id)} onChange={e=>changeSelection(e.target.checked?[...selected,r.id]:selected.filter(id=>id!==r.id))}/><span><strong>{r.title}</strong><small>{r.listingNo} · {r.recipient}</small></span></label><span className="tag">{r.status}</span></div><p>{r.zip||'六碼待確認'}　{r.address}</p><p className="ol-muted">{followLabel(r,today)} · 寄出 {r.sentCount||0} 次 · 最近寄出 {r.lastSentOn||'尚未寄出'}</p><p className="ol-muted">開發信：{data.letters.find(l=>l.id===r.letterId)?.name||'尚未指定'}</p><div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={()=>openDraft(r)}>編輯收件資料</button><button className="btn ghost" disabled={busy} onClick={()=>act(async()=>setHistory({record:r,events:await outreachHistory(uid,r.id)}))}>寄信與追蹤歷程</button><button className="btn ghost" disabled={busy} onClick={()=>openLog([r],'追蹤')}>新增追蹤</button>{r.url&&<a className="btn ghost" href={r.url} target="_blank" rel="noreferrer">案件網址</a>}</div>{logForm&&!logForm.inBatch&&logForm.ids[0]===r.id&&logPanel}{history?.record.id===r.id&&<div className="ol-history"><button className="ol-text-button" onClick={()=>setHistory(null)}>收起歷程</button>{history.events.length?history.events.map(event=><div key={event.id}><strong>{event.day} · {event.type}</strong><p>{event.letterName} {event.note}</p><small>{event.recipient} · {event.address}{event.followOn?` · 下次追蹤 ${event.followOn}`:''}</small></div>):<p>尚無寄信或追蹤紀錄。</p>}</div>}</article>)}</div>{!visible.length&&<section className="panel">目前沒有符合的紀錄，可新增或調整篩選條件。</section>}
    </>}
    {tab==='letters'&&<section className="panel"><h2>我的開發信檔案</h2><p>只有你的帳號可讀取。PDF／JPG／PNG 可重複套用；原稿內的姓名不會自動修改。</p><p className="ol-muted">已使用 {formatBytes(usedBytes)}／{formatBytes(MAX_LIBRARY_BYTES)}，每份限 5MB。同內容不重複儲存。</p><div className="ol-actions"><label className="btn">上傳開發信<input className="ol-file-input" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple disabled={busy} onChange={e=>{upload(Array.from(e.target.files));e.target.value='';}}/></label><button className="btn ghost" disabled={busy} onClick={()=>setTextLetter({name:'',text:'{{姓名}} 您好：\n\n我是台灣房屋的服務同仁，近期持續關注附近社區的成交與買方需求。\n\n若您有出售、出租或了解行情的想法，歡迎與我聯繫。\n\n聯絡方式：請填你的姓名與電話'})}>新增可套姓名的文字範本</button></div>
      {textLetter&&<form className="ol-section" onSubmit={e=>{e.preventDefault();act(async()=>{await saveOutreachTextLetter(uid,textLetter.name,textLetter.text);await refresh();setTextLetter(null);setNotice('已保存新版本，不會覆蓋舊版寄信紀錄。');});}}><Field label="範本名稱" value={textLetter.name} onChange={name=>setTextLetter(v=>({...v,name}))} required maxLength={200}/><label>內容<textarea className="ol-letter-text" maxLength={6000} value={textLetter.text} onChange={e=>setTextLetter(v=>({...v,text:e.target.value}))}/></label><p className="ol-muted">可使用 {'{{姓名}}、{{案名}}、{{地址}}、{{物件地址}}'}，製作時逐位帶入。上傳原稿仍照原內容列印。</p><div className="ol-actions"><button className="btn" disabled={busy}>儲存範本新版本</button><button className="btn ghost" type="button" onClick={()=>setTextLetter(null)}>取消</button></div></form>}
      <div className="ol-file-list">{data.letters.map(letter=><article key={letter.id}><div><strong>{letter.name}</strong><p className="ol-muted">{letter.type==='text/plain'?'可套姓名的文字範本':`${letter.pages} 頁 · ${formatBytes(letter.size)}`} · {new Date(letter.createdAt).toLocaleDateString('zh-TW')} {letter.archived?'· 已停用':''}{data.settings.defaultLetter===letter.id?' · 新案件預設':''}</p></div><div className="ol-actions"><button className="btn ghost" disabled={busy} onClick={()=>openPreview(letter)}>預覽內容</button>{letter.type==='text/plain'&&<button className="btn ghost" onClick={()=>setTextLetter({name:`${letter.name} 新版`,text:letter.text})}>修改成新版本</button>}{!letter.archived&&<button className="btn ghost" disabled={busy} onClick={()=>act(async()=>{await saveOutreachSettings(uid,{...data.settings,defaultLetter:letter.id});await refresh();setNotice('之後新增案件會預設使用這份開發信。');})}>設為新案件預設</button>}<button className="btn ghost" disabled={busy} onClick={()=>act(async()=>{await archiveOutreachLetter(uid,letter,!letter.archived);if(!letter.archived&&data.settings.defaultLetter===letter.id)await saveOutreachSettings(uid,{...data.settings,defaultLetter:''});clearResult();await refresh();})}>{letter.archived?'恢復使用':'停用此版'}</button>{!letter.usedInHistory&&!data.records.some(r=>r.letterId===letter.id)&&<button className="btn ghost" disabled={busy} onClick={()=>{if(window.confirm('確定刪除這份尚未使用的開發信？刪除後需重新上傳。'))act(async()=>{await removeUnusedOutreachLetter(uid,letter,data.records);if(data.settings.defaultLetter===letter.id)await saveOutreachSettings(uid,{...data.settings,defaultLetter:''});await refresh();setNotice('已刪除未使用檔案並釋放空間。');});}}>刪除未使用檔案</button>}</div>{preview?.id===letter.id&&previewPanel}</article>)}</div><p className="ol-muted">已有歷程的版本只可停用，保留當時原稿；尚未使用的檔案可刪除以釋放空間。</p></section>}
    {tab==='settings'&&<section className="panel"><h2>固定寄件資料</h2><p>只印寄件地址與郵遞區號，每張標籤共用。</p><form onSubmit={e=>{e.preventDefault();act(async()=>{if(!sender.senderAddress||!/^\d{6}$/.test(sender.senderZip||'')||normalizeOutreachAddress(sender.senderZipVerifiedAddress)!==normalizeOutreachAddress(sender.senderAddress))throw new Error('請先核對寄件地址與六碼郵遞區號。');await saveOutreachSettings(uid,sender);clearResult();await refresh();setNotice('已儲存你的固定寄件資料。');setTab('records');});}}><Field label="固定寄件地址" value={sender?.senderAddress||''} onChange={senderAddress=>setSender(s=>({...s,senderAddress,senderZipVerifiedAddress:''}))} required maxLength={500}/><PostalField address={sender?.senderAddress||''} zip={sender?.senderZip||''} verifiedAddress={sender?.senderZipVerifiedAddress||''} onChange={patch=>setSender(s=>({...s,senderZip:patch.zip??s?.senderZip,senderZipVerifiedAddress:patch.zipVerifiedAddress??s?.senderZipVerifiedAddress}))}/><div className="ol-actions ol-section"><button className="btn" disabled={busy}>儲存寄件設定</button></div></form><Calibration uid={uid} onChange={clearResult}/></section>}
    <p className="ol-footer">開發信資料僅本人可讀寫。<Link to="/properties">回物件管理</Link></p>
  </main>;
}
function Field({label,value,onChange,...props}) { return <label>{label}<input value={value||''} onChange={e=>onChange(e.target.value)} {...props}/></label>; }
const calibrationKey=uid=>`leshan-outreach-calibration-v1:${uid}`;
export function readCalibration(uid) { try { const value=JSON.parse(localStorage.getItem(calibrationKey(uid))||'{}'); return { offsetX:Math.max(-4,Math.min(4,Number(value.offsetX)||0)),offsetY:Math.max(-4,Math.min(4,Number(value.offsetY)||0)) }; } catch { return {offsetX:0,offsetY:0}; } }
function Calibration({uid,onChange}) { const [value,setValue]=useState(()=>readCalibration(uid));return <details className="ol-section"><summary>這台裝置的列印位置校正</summary><p className="ol-muted">先用普通紙試印，再與貼紙對齊。正值為向右／向下，僅儲存在這台裝置。</p><div className="ol-form-grid">{[['offsetX','左右位移（mm）'],['offsetY','上下位移（mm）']].map(([key,label])=><Field key={key} label={label} type="number" min="-4" max="4" step="0.5" value={value[key]} onChange={v=>setValue(s=>({...s,[key]:v}))}/>)}</div><button className="btn ghost" onClick={()=>{const next={offsetX:Math.max(-4,Math.min(4,Number(value.offsetX)||0)),offsetY:Math.max(-4,Math.min(4,Number(value.offsetY)||0))};localStorage.setItem(calibrationKey(uid),JSON.stringify(next));setValue(next);onChange();}}>記住校正位置</button></details>; }
