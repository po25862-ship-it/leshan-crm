import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { writeBatch, doc, collection, addDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../firebase";
import { useCollection } from "../hooks/useCollection";
import { updateReadCache } from "../hooks/firestoreReadCache";
import { todayStr, formatDate } from "../lib/dates";
import { withAgid, withoutAgid } from "../lib/url";
import PropertyHistory from "./PropertyHistory";
import PropertyShare from "./PropertyShare";
import BuyerRecipientPicker from "./BuyerRecipientPicker";
import PropertyViewingPdf from "./PropertyViewingPdf";
import PropertyPdfLibrary from "./PropertyPdfLibrary";
import { usePropertyPdfLibrary } from "../hooks/usePropertyPdfLibrary";
import { PROPERTY_CATEGORIES as CATEGORIES, PROPERTY_STORES as STORES } from "../lib/propertyConstants";
import { TAIWAN_REGIONS, TAIWAN_CITIES, normalizeRegionText } from "../lib/taiwanRegions";
import { parseFloor, isTopFloor } from "../lib/floor";
import { parseAge } from "../lib/age";
import { usePersonalAgid } from "../hooks/usePersonalAgid";
import { useIsMobile } from "../hooks/useIsMobile";
import { X } from "lucide-react";
import { useAuth } from "../AuthContext";
import { useNeedsCollection } from "../hooks/useNeedsCollection";
import ReverseMatchesPanel from "./ReverseMatchesPanel";
import MarketIntelligence from "./MarketIntelligence";
import a7Communities from "../lib/a7-communities.json";
import { matchesPropertyKeyword } from "../lib/propertyKeywordSearch";
import { PROPERTY_SORT_OPTIONS, sortProperties } from "../lib/propertySort";
import { displayPropertyAgent } from "../lib/propertyAgent";
import { getPropertyParkingNumber } from "../lib/propertyParkingNumber";
import { matchesWebsiteFilter } from "../lib/propertyWebsite";
import { validateFloorplanFiles } from "../lib/floorplanUpload";
import { getPropertyManagementFee, formatPropertyManagementFee, managementFeeImportFields } from "../lib/propertyManagementFee";
import floorplanAddress from "../lib/floorplanAddress";
import commonArea from "../lib/propertyCommonArea";
import { formatPropertyAreaWithoutParking } from "../lib/propertyAreaWithoutParking";
import { useMarketReference, loadMarketReference } from "../hooks/useMarketReference";
import { usePriorityReferenceCache } from "../hooks/usePriorityReferenceCache";
import { PRIORITY_FILTERS, buildPriorityAssessments, countPriorityGroups, matchesPriorityFilter, priorityActionLabel, refreshPriorityReferences } from "../lib/propertyPriorityWorklist";
import { matchesUnitPrice, formatUnitPrice, propertyUnitPrice, resolvePropertyParkingPrice, formatPropertyParkingPrice } from "../lib/propertyUnitPrice";
import "./PropertyDetailWorkspace.css";
import "./PropertySearchFilters.css";
import { matchesPropertyBusinessArea, propertyBusinessAreaOptions } from "../lib/propertyBusinessArea";
import PropertyMarketReference, { PropertyPriorityBadge } from "./PropertyMarketReference";

const { floorplanAddressKey, mergeFloorplanFiles, indexRememberedFloorplans } = floorplanAddress;
const { companyCommonAreaFields, EXCLUDING_PARKING } = commonArea;

const STATUS_LABELS = { active: "在售", onHold: "暫時不賣", sold: "已售出" };
const STATUS_ORDER = ["active", "onHold", "sold"];
const A7_COMMUNITY_NAMES = a7Communities.map((community) => community.name);
// 解析「房/廳/衛」格式的格局字串，例如 "4+1/2/4" 會取每段開頭的數字
function parseLayout(layout) {
  if (!layout) return { rooms: null, living: null, bath: null };
  const parts = String(layout).split("/").map((s) => s.trim());
  const parseNum = (s) => {
    if (!s) return null;
    const m = s.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  };
  return { rooms: parseNum(parts[0]), living: parseNum(parts[1]), bath: parseNum(parts[2]) };
}

// mode: "eq" 精確等於 / "gte" 以上（大於等於）
function matchNum(value, filterVal, mode) {
  if (filterVal === "" || filterVal === null || filterVal === undefined) return true;
  if (value === null) return false;
  const f = Number(filterVal);
  return mode === "eq" ? value === f : value >= f;
}

function matchRange(value, min, max) {
  if (min === "" && max === "") return true;
  if (value === "" || value === null || value === undefined || !Number.isFinite(Number(value))) return false;
  const number = Number(value);
  if (min !== "" && number < Number(min)) return false;
  if (max !== "" && number > Number(max)) return false;
  return true;
}

function propertyHasParking(property) {
  if (String(property.parkingDescription || "").trim() === "無") return false;
  return Number(property.parkingCount || 0) > 0 || Number(property.parkingPing || 0) > 0
    || Boolean(String(property.parkingNumber || "").trim()) || Boolean(String(property.parkingDescription || "").trim());
}

const emptyForm = {
  store: STORES[3],
  listingNo: "",
  title: "",
  communityName: "",
  area: "",
  address: "",
  landPing: "",
  titlePing: "",
  mainBuildingPing: "",
  auxiliaryBuildingPing: "",
  commonAreaPing: "",
  parkingPing: "",
  parkingNumber: "",
  parkingDescription: "",
  parkingPrice: "",
  viewingStatus: "unknown",
  viewingConfirmedAt: "",
  floor: "",
  orientation: "",
  age: "",
  layout: "",
  parkingCount: "",
  totalPrice: "",
  managementFee: "",
  occupancy: "",
  laneWidth: "",
  agentInfo: "",
  websiteUrl: "",
  notes: "",
  category: CATEGORIES[0],
  status: "active",
  statusChangedAt: todayStr(),
  lastPriceChange: null,
  sheetFiles: [],
  floorplanFiles: [],
  floorplanAddressFiles: [],
  customFields: [],
};

function DetailValue({ label, value, accent = false }) {
  const shown = value === "" || value === null || value === undefined ? "—" : value;
  return (
    <div style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: accent ? 19 : 14, color: accent ? "var(--accent)" : "var(--text)", fontWeight: accent ? 800 : 600, overflowWrap: "anywhere" }}>{shown}</div>
    </div>
  );
}

function formatScanTime(value) {
  if (!value) return "—";
  const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date);
}

function FloorplanSharingPanel({ source, file, properties, busy, onApply, onClose }) {
  const [keyword, setKeyword] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const search = keyword.trim().toLowerCase();
  const matches = properties.filter((item) => item.id !== source.id && (
    !search || [item.title, item.listingNo, item.address, item.communityName]
      .some((value) => String(value || "").toLowerCase().includes(search))
  ));
  const visible = matches.slice(0, 50);
  const sourceHasDoorplate = Boolean(floorplanAddressKey(source.address));

  const toggle = (id) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div id="floorplan-sharing-panel" style={{ marginTop: 14, padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "#FAFAF8" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 13 }}>套用「{file.name || "格局圖"}」到其他案件</strong>
        <button type="button" className="btn ghost" onClick={onClose}>關閉</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        {sourceHasDoorplate
          ? `目前門牌：${source.address}。以後完整門牌相同的物件會自動顯示這張圖。`
          : "目前物件沒有完整門牌；可套用到其他案件，但本件需補上完整地址後才能記住門牌。"}
      </div>
      <input
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder="搜尋其他案件：案名、委託編號或地址"
        aria-label="搜尋要套用格局圖的案件"
        style={{ width: "100%", padding: "9px 10px", border: "1px solid var(--border)", borderRadius: 7, boxSizing: "border-box", marginBottom: 9 }}
      />
      <div style={{ maxHeight: 250, overflowY: "auto", display: "grid", gap: 5 }}>
        {visible.map((item) => (
          <label key={item.id} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "8px 9px", borderRadius: 7, background: "#fff", cursor: "pointer" }}>
            <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggle(item.id)} disabled={busy} style={{ marginTop: 2 }} />
            <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.5 }}>
              <strong>{item.title || "未命名物件"}</strong>・{item.listingNo || "無編號"}<br />
              <span style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>{item.address || "尚無地址"}</span>
              {!floorplanAddressKey(item.address) && <span style={{ color: "#A05B1F" }}>（只套用本件，不記住門牌）</span>}
            </span>
          </label>
        ))}
        {visible.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)", padding: 8 }}>找不到其他案件</div>}
      </div>
      {matches.length > visible.length && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>先顯示 50 筆，請輸入案名或編號縮小範圍。</div>}
      <div style={{ display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button type="button" className="btn" disabled={busy || (selectedIds.size === 0 && !sourceHasDoorplate)} onClick={() => onApply([...selectedIds])}>
          {busy ? "套用中…" : selectedIds.size ? `套用到 ${selectedIds.size} 個案件` : "記住此門牌"}
        </button>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>已選 {selectedIds.size} 筆；原有格局圖不會被覆蓋</span>
      </div>
    </div>
  );
}

export default function Properties() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { agid } = usePersonalAgid();
  const { items, add, update, remove } = useCollection("properties", "createdAt");
  const floorplansByAddress = useMemo(() => indexRememberedFloorplans(items), [items]);
  const withKnownFloorplans = useCallback((item) => ({
    ...item,
    managementFee: getPropertyManagementFee(item),
    floorplanFiles: mergeFloorplanFiles(item.floorplanFiles, floorplansByAddress.get(floorplanAddressKey(item.address))),
  }), [floorplansByAddress]);
  const { items: linkedCases } = useCollection("cases", "createdAt");
  const { items: needs, update: updateNeed } = useNeedsCollection(user.uid);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");
  const [detailRowPosition, setDetailRowPosition] = useState(0);
  const [editFocus, setEditFocus] = useState("");
  const [savingProperty, setSavingProperty] = useState(false);
  const [propertySaveError, setPropertySaveError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [originalTotalPrice, setOriginalTotalPrice] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [unitPriceBasis, setUnitPriceBasis] = useState("gross");
  const [minUnitPrice, setMinUnitPrice] = useState("");
  const [maxUnitPrice, setMaxUnitPrice] = useState("");
  const { records: marketReferences, recordReference } = usePriorityReferenceCache(user.uid);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assessmentNow, setAssessmentNow] = useState(Date.now);
  const [priorityRefresh, setPriorityRefresh] = useState({ running: false, completed: 0, total: 0, message: "" });
  const priorityRun = useRef(0);
  const priorityUser = useRef(user);
  priorityUser.current = user;
  useEffect(() => {
    const timer = setInterval(() => setAssessmentNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setPriorityRefresh({ running: false, completed: 0, total: 0, message: "" });
    return () => { priorityRun.current++; };
  }, [user.uid]);
  const [minMainBuildingPing, setMinMainBuildingPing] = useState("");
  const [maxMainBuildingPing, setMaxMainBuildingPing] = useState("");
  const [minTitlePing, setMinTitlePing] = useState("");
  const [maxTitlePing, setMaxTitlePing] = useState("");
  const [minLandPing, setMinLandPing] = useState("");
  const [maxLandPing, setMaxLandPing] = useState("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [businessAreaFilter, setBusinessAreaFilter] = useState("");
  const businessAreaOptions = useMemo(() => propertyBusinessAreaOptions(items), [items]);
  const [cityFilter, setCityFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [parkingFilter, setParkingFilter] = useState("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [layoutKeyword, setLayoutKeyword] = useState("");
  const [floorFilter, setFloorFilter] = useState("");
  const [floorMode, setFloorMode] = useState("eq");
  const [topFloorOnly, setTopFloorOnly] = useState(false);
  const [roomFilter, setRoomFilter] = useState("");
  const [roomMode, setRoomMode] = useState("eq");
  const [livingFilter, setLivingFilter] = useState("");
  const [livingMode, setLivingMode] = useState("eq");
  const [bathFilter, setBathFilter] = useState("");
  const [bathMode, setBathMode] = useState("eq");
  const [activeCategory, setActiveCategory] = useState("全部");
  const [viewMode, setViewMode] = useState("active"); // active | onHold | sold
  const [sortBy, setSortBy] = useState("newest");
  const [importing, setImporting] = useState(false);
  const [importAnalysis, setImportAnalysis] = useState(null);
  const [importDecisions, setImportDecisions] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [showViewingPdf, setShowViewingPdf] = useState(false);
  const [pdfLoadVersion, setPdfLoadVersion] = useState(0);
  const pdfLibrary = usePropertyPdfLibrary(user.uid);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [sharingFloorplanFile, setSharingFloorplanFile] = useState(null);
  const [applyingFloorplan, setApplyingFloorplan] = useState(false);
  const marketReference = useMarketReference(form, Boolean(editingId && showForm && !editMode));
  const formParkingPrice = resolvePropertyParkingPrice(form);
  useEffect(() => {
    if (!editingId || !showForm || editMode) return;
    if (marketReference.data || marketReference.error) {
      recordReference({ ...form, id: editingId }, marketReference.data, marketReference.error);
    }
  }, [editingId, showForm, editMode, form, marketReference.data, marketReference.error, recordReference]);
  const priorities = useMemo(() => buildPriorityAssessments(items, marketReferences, needs, A7_COMMUNITY_NAMES, assessmentNow), [items, marketReferences, needs, assessmentNow]);

  const copyUrl = async (url) => {
    try {
      if (!agid) {
        alert("請先到「設定」填寫你的物件 AGID");
        return;
      }
      await navigator.clipboard.writeText(withAgid(url, agid));
      alert(`已複製網址（AGID：${agid}），可以直接貼給客人`);
    } catch {
      alert("複製失敗，請手動選取網址複製");
    }
  };

  const toggleSelect = (id) => {
    setShowViewingPdf(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const [uploadingSheet, setUploadingSheet] = useState(false);
  const [uploadingFloorplan, setUploadingFloorplan] = useState(false);

  useEffect(() => {
    if (selectedIds.size === 0) {
      setSelectedBuyerId("");
      setShowShare(false);
      setShowViewingPdf(false);
    }
  }, [selectedIds]);

  const openNew = () => {
    setSharingFloorplanFile(null);
    setDetailTab("overview");
    setPropertySaveError("");
    setForm(emptyForm);
    setEditingId(null);
    setOriginalTotalPrice(null);
    setEditMode(true);
    setShowForm(true);
  };

  const openEdit = (item) => {
    setSharingFloorplanFile(null);
    setDetailTab("overview");
    setPropertySaveError("");
    const rowPosition = displayedProperties.findIndex((property) => property.id === item.id);
    if (rowPosition >= 0) setDetailRowPosition(rowPosition);
    setForm({ ...emptyForm, ...withKnownFloorplans(item), parkingNumber: getPropertyParkingNumber(item), customFields: item.customFields || [] });
    setEditingId(item.id);
    setOriginalTotalPrice(item.totalPrice);
    setEditMode(false);
    setShowForm(true);
  };

  const openPropertyEditor = (fieldId = "") => {
    setPropertySaveError("");
    setEditFocus(typeof fieldId === "string" ? fieldId : "");
    setEditMode(true);
  };

  useEffect(() => {
    const workspace = document.getElementById("property-detail-workspace");
    if (workspace) workspace.scrollTop = 0;
  }, [editingId, editMode, detailTab, showForm]);

  useEffect(() => {
    if (!editMode || !showForm) return;
    const target = document.getElementById(editFocus || "property-edit-form");
    target?.scrollIntoView?.({ block: editFocus ? "center" : "start" });
    if (editFocus) target?.focus?.({ preventScroll: true });
  }, [editMode, showForm, editFocus]);

  const togglePropertyDetail = (item) => {
    if (showForm && editingId === item.id && !editMode) setShowForm(false);
    else openEdit(item);
  };

  // Keep the read-only detail view current when an attachment is added through LINE.
  useEffect(() => {
    if (!showForm || !editingId || editMode) return;
    const current = items.find((item) => item.id === editingId);
    if (current) setForm({ ...emptyForm, ...withKnownFloorplans(current), parkingNumber: getPropertyParkingNumber(current), customFields: current.customFields || [] });
  }, [items, showForm, editingId, editMode, withKnownFloorplans]);

  // 支援用網址直接開啟指定物件（?open=ID），讓其他頁面（例如客需的推薦物件）可以連結過來直接看到該筆物件
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId) {
      const found = items.find((p) => p.id === openId);
      if (found) {
        openEdit(found);
        setSearchParams({}, { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, searchParams]);

  const addCustomField = () => {
    setForm({ ...form, customFields: [...form.customFields, { label: "", value: "" }] });
  };
  const updateCustomField = (idx, key, val) => {
    const next = [...form.customFields];
    next[idx] = { ...next[idx], [key]: val };
    setForm({ ...form, customFields: next });
  };
  const removeCustomField = (idx) =>
    setForm({ ...form, customFields: form.customFields.filter((_, i) => i !== idx) });

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || savingProperty) return;
    setSavingProperty(true);
    setPropertySaveError("");
    try {

    const addressKey = floorplanAddressKey(form.address);
    const previousAddressKey = floorplanAddressKey(items.find((item) => item.id === editingId)?.address);
    const rememberedFiles = editingId && addressKey !== previousAddressKey
      ? floorplansByAddress.get(addressKey)
      : mergeFloorplanFiles(form.floorplanAddressFiles, floorplansByAddress.get(addressKey));
    const formToSave = {
      ...withKnownFloorplans(form),
      viewingConfirmedAt: form.viewingStatus === "available"
        ? (items.find((p) => p.id === editingId)?.viewingStatus === "available" && form.viewingConfirmedAt
          ? form.viewingConfirmedAt : new Date().toISOString()) : "",
      managementFee: String(form.managementFee ?? "").trim(),
      ...(!editingId || String(form.commonAreaPing) !== String(items.find((item) => item.id === editingId)?.commonAreaPing)
        ? { commonAreaBasis: EXCLUDING_PARKING } : {}),
      floorplanAddressFiles: mergeFloorplanFiles(rememberedFiles),
      websiteUrl: withoutAgid(form.websiteUrl), updatedAt: todayStr(),
    };

    if (editingId) {
      const priceChanged =
        form.totalPrice !== "" &&
        String(form.totalPrice) !== String(originalTotalPrice) &&
        originalTotalPrice !== null &&
        originalTotalPrice !== "";
      const updates = { ...formToSave };
      if (priceChanged) {
        updates.lastPriceChange = {
          oldPrice: originalTotalPrice,
          newPrice: form.totalPrice,
          date: todayStr(),
        };
      }
      await update(editingId, updates);
      if (priceChanged) {
        await addDoc(collection(db, `properties/${editingId}/priceLogs`), {
          oldPrice: originalTotalPrice,
          newPrice: form.totalPrice,
          date: todayStr(),
          createdAt: serverTimestamp(),
        });
      }
    } else {
      const ref2 = await add(formToSave);
      await addDoc(collection(db, `properties/${ref2.id}/statusLogs`), {
        status: form.status,
        date: todayStr(),
        createdAt: serverTimestamp(),
      });
    }
    if (editingId) { setEditMode(false); setDetailTab("overview"); }
    else setShowForm(false);
    } catch {
      setPropertySaveError("儲存失敗，請確認網路後再試一次。你輸入的內容仍保留在這裡。");
    } finally {
      setSavingProperty(false);
    }
  };

  const changeStatus = async (item, newStatus) => {
    const dateStr = todayStr();
    const updates = { status: newStatus, statusChangedAt: dateStr };
    let logNote = "";

    if (newStatus === "sold") {
      const input = window.prompt("這筆物件的成交金額是多少（萬）？不知道可以直接按「確定」留空。", item.soldPrice || "");
      if (input !== null && input.trim() !== "") {
        updates.soldPrice = input.trim();
        logNote = `成交金額：${input.trim()} 萬`;
      }
    }

    await update(item.id, updates);
    await addDoc(collection(db, `properties/${item.id}/statusLogs`), {
      status: newStatus,
      date: dateStr,
      note: logNote,
      createdAt: serverTimestamp(),
    });
    if (editingId === item.id) {
      setForm((f) => ({ ...f, ...updates }));
    }
  };

  const deleteForever = async (item) => {
    if (window.confirm(`確定要永久刪除「${item.title}」嗎？此動作無法復原。`)) {
      await remove(item.id);
    }
  };

  const handleSheetUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0 || !editingId) return;
    setUploadingSheet(true);
    try {
      const newFiles = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
        const storageRef = ref(storage, `properties/${editingId}/sheets/${Date.now()}_${safeName}`);
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);
        newFiles.push({ url, name: file.name, type: file.type, uploadedAt: new Date().toISOString() });
      }
      const nextFiles = [...(form.sheetFiles || []), ...newFiles];
      await update(editingId, { sheetFiles: nextFiles });
      setForm((f) => ({ ...f, sheetFiles: nextFiles }));
    } catch (err) {
      console.error(err);
      alert("上傳失敗，請確認 Firebase Storage 是否已啟用。");
    }
    setUploadingSheet(false);
  };

  const handleFloorplanUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const propertyId = editingId;
    if (files.length === 0 || !propertyId || uploadingFloorplan) return;
    const validationError = validateFloorplanFiles(files);
    if (validationError) {
      alert(validationError);
      return;
    }

    setUploadingFloorplan(true);
    try {
      const uploadedFiles = [];
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.\-\u4e00-\u9fff]/g, "_");
        const storageRef = ref(storage, `properties/${propertyId}/floorplans/${crypto.randomUUID()}_${safeName}`);
        await uploadBytes(storageRef, file, { contentType: file.type });
        const url = await getDownloadURL(storageRef);
        uploadedFiles.push({ url, name: file.name, type: file.type, uploadedAt: new Date().toISOString() });
      }
      const source = items.find((item) => item.id === propertyId) || form;
      const rememberAddress = Boolean(floorplanAddressKey(source.address));
      const updates = { floorplanFiles: arrayUnion(...uploadedFiles) };
      if (rememberAddress) updates.floorplanAddressFiles = arrayUnion(...uploadedFiles);
      const batch = writeBatch(db);
      batch.update(doc(db, "properties", propertyId), updates);
      await batch.commit();
      updateReadCache("collection::properties", (current) => current.map((item) => (
        item.id === propertyId
          ? {
            ...item,
            floorplanFiles: mergeFloorplanFiles(item.floorplanFiles, uploadedFiles),
            floorplanAddressFiles: rememberAddress
              ? mergeFloorplanFiles(item.floorplanAddressFiles, uploadedFiles)
              : item.floorplanAddressFiles,
          }
          : item
      )));
      setForm((current) => current.id === propertyId
        ? {
          ...current,
          floorplanFiles: mergeFloorplanFiles(current.floorplanFiles, uploadedFiles),
          floorplanAddressFiles: rememberAddress
            ? mergeFloorplanFiles(current.floorplanAddressFiles, uploadedFiles)
            : current.floorplanAddressFiles,
        }
        : current);
    } catch (error) {
      console.error("格局圖上傳失敗", error);
      alert("格局圖上傳失敗，請確認登入狀態或稍後重試。若仍失敗，請檢查 Firebase Storage 設定。");
    } finally {
      setUploadingFloorplan(false);
    }
  };

  const applyFloorplanToProperties = async (targetIds) => {
    const file = sharingFloorplanFile;
    const sourceId = editingId;
    if (!file || !sourceId || applyingFloorplan) return;
    const source = items.find((item) => item.id === sourceId) || form;
    const targets = targetIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    if (targets.length > 100) {
      alert("一次最多套用 100 個案件，請分批操作。");
      return;
    }

    const addressed = new Set();
    for (const item of [source, ...targets]) {
      const key = floorplanAddressKey(item.address);
      if (key) addressed.add(key);
    }
    if (addressed.size === 0 && targets.length === 0) {
      alert("請先補上完整門牌，或選擇要套用的其他案件。");
      return;
    }

    setApplyingFloorplan(true);
    try {
      const batch = writeBatch(db);
      const affectedIds = new Map();
      for (const item of [source, ...targets]) {
        const addToProperty = !(item.floorplanFiles || []).some((existing) => existing.url === file.url);
        const rememberAddress = Boolean(floorplanAddressKey(item.address))
          && !(item.floorplanAddressFiles || []).some((existing) => existing.url === file.url);
        if (!addToProperty && !rememberAddress) continue;
        const updates = {};
        if (addToProperty) updates.floorplanFiles = arrayUnion(file);
        if (rememberAddress) updates.floorplanAddressFiles = arrayUnion(file);
        batch.update(doc(db, "properties", item.id), updates);
        affectedIds.set(item.id, { addToProperty, rememberAddress });
      }
      if (affectedIds.size === 0) {
        setSharingFloorplanFile(null);
        alert("所選案件已經有這張格局圖，門牌也已記住。");
        return;
      }
      await batch.commit();

      updateReadCache("collection::properties", (current) => current.map((item) => {
        const changes = affectedIds.get(item.id);
        return changes ? {
          ...item,
          floorplanFiles: changes.addToProperty ? mergeFloorplanFiles(item.floorplanFiles, [file]) : item.floorplanFiles,
          floorplanAddressFiles: changes.rememberAddress ? mergeFloorplanFiles(item.floorplanAddressFiles, [file]) : item.floorplanAddressFiles,
        } : item;
      }));
      setForm((current) => current.id === sourceId
        ? {
          ...current,
          floorplanFiles: mergeFloorplanFiles(current.floorplanFiles, [file]),
          floorplanAddressFiles: floorplanAddressKey(source.address)
            ? mergeFloorplanFiles(current.floorplanAddressFiles, [file])
            : current.floorplanAddressFiles,
        }
        : current);
      setSharingFloorplanFile(null);
      alert(`已套用到 ${targets.length} 個其他案件；${addressed.size} 個完整門牌已記住。`);
    } catch (error) {
      console.error("套用格局圖失敗", error);
      alert("格局圖未能套用到其他案件，請稍後重試。");
    } finally {
      setApplyingFloorplan(false);
    }
  };

  const removeSheet = async (idx) => {
    if (!editingId) return;
    if (!window.confirm("確定要移除這份資料表嗎？")) return;
    const fileToRemove = (form.sheetFiles || [])[idx];
    try {
      if (fileToRemove) {
        const decoded = decodeURIComponent(fileToRemove.url.split("/o/")[1].split("?")[0]);
        await deleteObject(ref(storage, decoded));
      }
    } catch {
      // 檔案本體刪不掉也不擋
    }
    const nextFiles = (form.sheetFiles || []).filter((_, i) => i !== idx);
    await update(editingId, { sheetFiles: nextFiles });
    setForm((f) => ({ ...f, sheetFiles: nextFiles }));
  };

  // ---- 分類與狀態統計 ----
  const byStatus = (s) => items.filter((p) => (p.status || "active") === s);
  const activeItems = byStatus("active");
  const onHoldItems = byStatus("onHold");
  const soldItems = byStatus("sold");
  const pool = viewMode === "active" ? activeItems : viewMode === "onHold" ? onHoldItems : soldItems;

  const matchesPropertyFilters = (p, ignoreCategory = false, ignorePriority = false) => {
    if (!ignorePriority && !matchesPriorityFilter(priorities.get(p.id), priorityFilter)) return false;
    if (!ignoreCategory && activeCategory !== "全部" && (p.category || "未分類") !== activeCategory) return false;
    if (minPrice && Number(p.totalPrice || 0) < Number(minPrice)) return false;
    if (maxPrice && Number(p.totalPrice || 0) > Number(maxPrice)) return false;
    if (!matchesUnitPrice(p, minUnitPrice, maxUnitPrice, unitPriceBasis)) return false;
    if (!matchRange(p.mainBuildingPing, minMainBuildingPing, maxMainBuildingPing)) return false;
    if (!matchRange(p.titlePing, minTitlePing, maxTitlePing)) return false;
    if (!matchRange(p.landPing, minLandPing, maxLandPing)) return false;
    if (!matchRange(parseAge(p.age), minAge, maxAge)) return false;
    if (cityFilter && !normalizeRegionText(p.address).includes(normalizeRegionText(cityFilter))) return false;
    if (districtFilter && !normalizeRegionText(p.address).includes(normalizeRegionText(districtFilter))) return false;
    if (!matchesPropertyBusinessArea(p, businessAreaFilter)) return false;
    if (!matchesWebsiteFilter(p, websiteFilter)) return false;
    if (parkingFilter === "yes" && !propertyHasParking(p)) return false;
    if (parkingFilter === "no" && propertyHasParking(p)) return false;
    if (layoutKeyword.trim() && !String(p.layout || "").includes(layoutKeyword.trim())) return false;
    if (!matchNum(parseFloor(p.floor), floorFilter, floorMode)) return false;
    if (topFloorOnly && !isTopFloor(p.floor)) return false;
    const { rooms, living, bath } = parseLayout(p.layout);
    if (!matchNum(rooms, roomFilter, roomMode)) return false;
    if (!matchNum(living, livingFilter, livingMode)) return false;
    if (!matchNum(bath, bathFilter, bathMode)) return false;
    return matchesPropertyKeyword(p, keyword);
  };

  const priorityPool = pool.filter((p) => matchesPropertyFilters(p, false, true));
  const priorityCounts = countPriorityGroups(priorityPool, priorities);
  const priorityTargets = priorityPool.filter((p) => (p.status || "active") === "active" && priorities.has(p.id) && propertyUnitPrice(p, "net") !== null);

  const updatePriorityWorklist = async () => {
    if (priorityRefresh.running || !priorityTargets.length) return;
    const run = ++priorityRun.current;
    const targets = [...priorityTargets];
    const runUser = priorityUser.current;
    setPriorityRefresh({ running: true, completed: 0, total: targets.length, message: "" });
    const result = await refreshPriorityReferences(targets, {
      load: (property) => loadMarketReference(runUser, property, true),
      shouldStop: () => run !== priorityRun.current || priorityUser.current?.uid !== runUser.uid,
      onResult: recordReference,
      onProgress: (completed) => setPriorityRefresh((current) => ({ ...current, completed })),
    });
    if (run !== priorityRun.current) return;
    setAssessmentNow(Date.now());
    setPriorityRefresh({ running: false, completed: result.completed, total: targets.length, message: result.failed
      ? `已完成 ${result.completed} 筆，市場來源暫時無法連線，已停止檢查。尚未完成的案件未重新判斷，可稍後重試。`
      : `已完成 ${result.completed} 筆判斷；分類會依你目前的客需與物件資料更新。` });
  };
  const stopPriorityRefresh = () => {
    priorityRun.current++;
    setPriorityRefresh((current) => ({ ...current, running: false, message: `已停止；完成 ${current.completed} 筆，其餘可稍後繼續更新。` }));
  };

  const filtered = sortProperties(pool.filter((p) => matchesPropertyFilters(p)), sortBy, { unitPriceBasis });
  const displayedProperties = [...filtered];
  const openProperty = showForm && editingId && priorityFilter !== "all" && items.find((item) => item.id === editingId);
  const retainOpenProperty = openProperty && (openProperty.status || "active") === viewMode
    && matchesPropertyFilters(openProperty, false, true) && !filtered.some((item) => item.id === editingId);
  if (retainOpenProperty) displayedProperties.splice(Math.min(detailRowPosition, displayedProperties.length), 0, openProperty);
  const selectedProperties = Array.from(selectedIds, (id) => items.find((item) => item.id === id)).filter(Boolean);
  const categoryPool = pool.filter((p) => matchesPropertyFilters(p, true));
  const categoryCounts = {};
  categoryPool.forEach((p) => {
    const category = p.category || "未分類";
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });
  const statusCounts = {
    active: activeItems.filter((p) => matchesPropertyFilters(p)).length,
    onHold: onHoldItems.filter((p) => matchesPropertyFilters(p)).length,
    sold: soldItems.filter((p) => matchesPropertyFilters(p)).length,
  };

  const advancedFilterCount = [
    minMainBuildingPing, maxMainBuildingPing, minTitlePing, maxTitlePing,
    minLandPing, maxLandPing, minAge, maxAge, parkingFilter === "all" ? "" : parkingFilter,
    minUnitPrice, maxUnitPrice,
    unitPriceBasis === "net" ? "net" : "",
    floorFilter, livingFilter, bathFilter, layoutKeyword.trim(), topFloorOnly ? "top" : "",
  ].filter((value) => value !== "").length;

  // Starting another search closes browsing details, while leaving an unsaved edit intact.
  const closeBrowsingDetail = () => {
    if (!editMode) setShowForm(false);
  };

  const clearAllFilters = () => {
    closeBrowsingDetail();
    setKeyword("");
    setPriorityFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setMinUnitPrice("");
    setMaxUnitPrice("");
    setUnitPriceBasis("gross");
    setLayoutKeyword("");
    setFloorFilter("");
    setTopFloorOnly(false);
    setRoomFilter("");
    setLivingFilter("");
    setBathFilter("");
    setMinMainBuildingPing("");
    setMaxMainBuildingPing("");
    setMinTitlePing("");
    setMaxTitlePing("");
    setMinLandPing("");
    setMaxLandPing("");
    setMinAge("");
    setMaxAge("");
    setBusinessAreaFilter("");
    setCityFilter("");
    setDistrictFilter("");
    setFloorMode("eq");
    setRoomMode("eq");
    setLivingMode("eq");
    setBathMode("eq");
    setWebsiteFilter("all");
    setParkingFilter("all");
    setActiveCategory("全部");
  };

  // ---- 匯入 Excel（智慧更新：用委託書編號比對新增/更新，並標記消失的物件）----
  const analyzeImportFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      const rowsToImport = [];
      CATEGORIES.forEach((cat) => {
        if (!wb.SheetNames.includes(cat)) return;
        const ws = wb.Sheets[cat];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || !r[1]) continue;
          rowsToImport.push({
            store: String(r[0] || ""),
            listingNo: String(r[1] || ""),
            title: String(r[2] || ""),
            address: String(r[3] || ""),
            landPing: r[4] === "" ? "" : Number(r[4]) || r[4],
            titlePing: r[5] === "" ? "" : Number(r[5]) || r[5],
            floor: String(r[6] || ""),
            orientation: String(r[7] || ""),
            age: String(r[8] || ""),
            layout: String(r[9] || ""),
            parkingCount: r[10] === "" ? 0 : Number(r[10]) || 0,
            totalPrice: r[11] === "" ? "" : Number(r[11]) || r[11],
            occupancy: String(r[12] || ""),
            laneWidth: String(r[13] || ""),
            agentInfo: String(r[14] || ""),
            websiteUrl: withoutAgid(String(r[15] || "")),
            notes: String(r[17] || ""),
            ...managementFeeImportFields(rows[0], r),
            category: cat,
          });
        }
      });

      if (rowsToImport.length === 0) {
        alert("在這個檔案裡沒有找到符合格式的資料列，請確認分頁名稱與欄位順序跟範本一致。");
        return;
      }

      const existingByListingNo = {};
      items.forEach((p) => {
        if (p.listingNo) existingByListingNo[p.listingNo] = p;
      });

      const matchedIds = new Set();
      const clearRows = []; // { row, existing(可能undefined), relinked }
      const leftoverRows = [];

      // 第一輪：委託書編號比對 ＋ 嚴格交叉比對（案名/坪數/房型/總價都對得上）
      rowsToImport.forEach((row) => {
        if (!row.listingNo) return;
        let existing = existingByListingNo[row.listingNo];
        let relinked = false;

        if (!existing) {
          const candidate = items.find((p) => {
            if (!p.listingNo || matchedIds.has(p.id)) return false;
            if (existingByListingNo[row.listingNo]) return false;
            if (!row.title || (p.title || "").trim() !== row.title.trim()) return false;
            const pingDiff = Math.abs(Number(p.titlePing || 0) - Number(row.titlePing || 0));
            if (pingDiff > 0.3) return false;
            if (String(p.layout || "").trim() !== String(row.layout || "").trim()) return false;
            const oldPrice = Number(p.totalPrice || 0);
            const newPrice = Number(row.totalPrice || 0);
            if (oldPrice && newPrice && Math.abs(newPrice - oldPrice) / oldPrice > 0.1) return false;
            return true;
          });
          if (candidate) {
            existing = candidate;
            relinked = true;
          }
        }

        if (existing) {
          matchedIds.add(existing.id);
          clearRows.push({ row, existing, relinked });
        } else {
          leftoverRows.push(row);
        }
      });

      // 第二輪：剩下的行，只用「案名一樣」做寬鬆比對，抓出可能是同一間、但其他條件對不齊的
      const ambiguousPairs = [];
      const newRows = [];
      leftoverRows.forEach((row) => {
        const candidate = items.find(
          (p) => p.listingNo && !matchedIds.has(p.id) && row.title && (p.title || "").trim() === row.title.trim()
        );
        if (candidate) {
          matchedIds.add(candidate.id); // 先佔位，避免同一筆existing被兩個ambiguous row搶
          ambiguousPairs.push({ row, existing: candidate });
        } else {
          newRows.push(row);
        }
      });

      const missingCandidates = items.filter(
        (p) => p.listingNo && !matchedIds.has(p.id) && (p.status || "active") === "active"
      );

      setImportAnalysis({ clearRows, newRows, ambiguousPairs, missingCandidates });
      const initialDecisions = {};
      ambiguousPairs.forEach((_, idx) => (initialDecisions[idx] = "separate"));
      setImportDecisions(initialDecisions);

      if (ambiguousPairs.length === 0) {
        await commitImport({ clearRows, newRows, ambiguousPairs: [], missingCandidates }, {});
      }
    } catch (err) {
      console.error(err);
      alert("匯入失敗，請確認檔案格式是否跟範本一致。");
    }
  };

  const commitImport = async (analysis, decisions) => {
    const { clearRows, newRows, ambiguousPairs, missingCandidates } = analysis;
    const ops = [];
    let newCount = 0;
    let updateCount = 0;
    let priceChangedCount = 0;
    let relinkedCount = 0;
    const finalMatchedIds = new Set();

    const applyUpdate = (row, existing, relinked) => {
      finalMatchedIds.add(existing.id);
      const { address, notes, totalPrice, ...rest } = row;
      const updates = { ...rest, updatedAt: todayStr() };
      const priceChanged = totalPrice !== "" && String(totalPrice) !== String(existing.totalPrice);
      if (priceChanged) {
        updates.totalPrice = totalPrice;
        updates.lastPriceChange = { oldPrice: existing.totalPrice, newPrice: totalPrice, date: todayStr() };
        ops.push({
          ref: doc(collection(db, `properties/${existing.id}/priceLogs`)),
          data: { oldPrice: existing.totalPrice, newPrice: totalPrice, date: todayStr(), createdAt: serverTimestamp() },
          merge: false,
        });
        priceChangedCount++;
      }
      if (relinked) {
        ops.push({
          ref: doc(collection(db, `properties/${existing.id}/statusLogs`)),
          data: {
            status: existing.status || "active",
            date: todayStr(),
            note: `委託書編號由 ${existing.listingNo || "（無）"} 換成 ${row.listingNo}，判斷為同一物件`,
            createdAt: serverTimestamp(),
          },
          merge: false,
        });
        relinkedCount++;
      }
      ops.push({ ref: doc(db, "properties", existing.id), data: updates, merge: true });
      updateCount++;
    };

    const applyNew = (row) => {
      const newRef = doc(collection(db, "properties"));
      const knownFloorplans = floorplansByAddress.get(floorplanAddressKey(row.address)) || [];
      ops.push({
        ref: newRef,
        data: {
          ...row, status: "active", statusChangedAt: todayStr(), updatedAt: todayStr(),
          lastPriceChange: null, customFields: [],
          floorplanFiles: knownFloorplans, floorplanAddressFiles: knownFloorplans,
          createdAt: new Date(),
        },
        merge: false,
      });
      ops.push({
        ref: doc(collection(db, `properties/${newRef.id}/statusLogs`)),
        data: { status: "active", date: todayStr(), createdAt: serverTimestamp() },
        merge: false,
      });
      newCount++;
    };

    clearRows.forEach(({ row, existing, relinked }) => applyUpdate(row, existing, relinked));
    newRows.forEach((row) => applyNew(row));

    ambiguousPairs.forEach((pair, idx) => {
      if (decisions[idx] === "merge") {
        applyUpdate(pair.row, pair.existing, true);
      } else {
        applyNew(pair.row);
        // existing 沒被合併，維持在 missingCandidates 名單裡，等下會被標記暫時不賣
      }
    });

    const missing = missingCandidates.filter((p) => !finalMatchedIds.has(p.id));
    missing.forEach((p) => {
      ops.push({ ref: doc(db, "properties", p.id), data: { status: "onHold", statusChangedAt: todayStr() }, merge: true });
      ops.push({
        ref: doc(collection(db, `properties/${p.id}/statusLogs`)),
        data: { status: "onHold", date: todayStr(), note: "Excel 更新後未再出現，系統自動標記", createdAt: serverTimestamp() },
        merge: false,
      });
    });

    const confirmMsg =
      `這次匯入：\n新增 ${newCount} 筆\n更新 ${updateCount} 筆（其中 ${priceChangedCount} 筆總價異動、${relinkedCount} 筆換委託書編號）\n` +
      `${missing.length} 筆物件將自動標記為「暫時不賣」\n\n地址與備註不會被覆蓋。確定要繼續嗎？`;
    if (!window.confirm(confirmMsg)) return;

    setImporting(true);
    try {
      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        ops.slice(i, i + CHUNK).forEach((op) => {
          if (op.merge) batch.set(op.ref, op.data, { merge: true });
          else batch.set(op.ref, op.data);
        });
        await batch.commit();
      }
      alert(`匯入完成：新增 ${newCount} 筆、更新 ${updateCount} 筆（含 ${relinkedCount} 筆換委託書編號）、暫時不賣 ${missing.length} 筆。`);
    } catch (err) {
      console.error(err);
      alert("匯入失敗，請再試一次。");
    }
    setImporting(false);
    setImportAnalysis(null);
    setImportDecisions({});
  };

  // ---- 補充公司詳細資料表的完整地址與面積（只用委託書編號精確比對）----
  const importPropertyDetails = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    try {
      const payload = JSON.parse(await file.text());
      const records = Array.isArray(payload?.records) ? payload.records : [];
      if (records.length === 0) {
        alert("找不到可匯入的物件詳細資料，請確認檔案是否正確。");
        return;
      }

      const existingByListingNo = new Map();
      items.forEach((item) => {
        const listingNo = String(item.listingNo || "").trim();
        if (!listingNo) return;
        if (!existingByListingNo.has(listingNo)) existingByListingNo.set(listingNo, []);
        existingByListingNo.get(listingNo).push(item);
      });

      const ops = [];
      const matchedListingNos = new Set();
      let addressCount = 0;
      let buildingCount = 0;
      let parkingAreaCount = 0;

      records.forEach((record) => {
        const listingNo = String(record.listingNo || "").trim();
        const matches = existingByListingNo.get(listingNo) || [];
        if (!listingNo || matches.length === 0) return;
        matchedListingNos.add(listingNo);

        const updates = {
          detailSource: "台灣房屋詳細資料表 2026-08-18",
          detailUpdatedAt: todayStr(),
        };
        if (record.address) updates.address = String(record.address).trim();
        if (record.mainBuildingPing != null) updates.mainBuildingPing = Number(record.mainBuildingPing);
        if (record.auxiliaryBuildingPing != null) updates.auxiliaryBuildingPing = Number(record.auxiliaryBuildingPing);
        Object.assign(updates, companyCommonAreaFields(record));
        if (record.parkingPing != null) updates.parkingPing = Number(record.parkingPing);
        if (record.parkingDescription) updates.parkingDescription = String(record.parkingDescription).trim();
        if (record.managementFee !== null && record.managementFee !== undefined && String(record.managementFee).trim() !== "") updates.managementFee = String(record.managementFee).trim();

        matches.forEach((item) => {
          ops.push({ ref: doc(db, "properties", item.id), data: updates });
          if (updates.address) addressCount++;
          if (updates.mainBuildingPing != null) buildingCount++;
          if (updates.parkingPing != null) parkingAreaCount++;
        });
      });

      if (ops.length === 0) {
        alert("這份檔案的委託書編號都沒有在目前 CRM 找到，因此沒有更新任何資料。");
        return;
      }

      const unmatchedCount = records.length - matchedListingNos.size;
      const confirmed = window.confirm(
        `即將依委託書編號更新 ${matchedListingNos.size} 個物件（共 ${ops.length} 筆 CRM 紀錄）：\n` +
        `完整地址 ${addressCount} 筆\n建物面積 ${buildingCount} 筆\n車位坪數 ${parkingAreaCount} 筆\n` +
        `${unmatchedCount} 個委託編號在 CRM 找不到，將略過。\n\n不會新增、刪除或改變物件狀態。確定要繼續嗎？`
      );
      if (!confirmed) return;

      setImporting(true);
      const CHUNK = 450;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const batch = writeBatch(db);
        ops.slice(i, i + CHUNK).forEach((op) => batch.set(op.ref, op.data, { merge: true }));
        await batch.commit();
      }
      alert(`地址與面積補充完成：已更新 ${ops.length} 筆 CRM 紀錄。`);
    } catch (err) {
      console.error(err);
      alert("地址與面積匯入失敗，請確認檔案格式後再試一次。");
    } finally {
      setImporting(false);
    }
  };

  // ---- 匯出 Excel（維持原始檔案的分頁與欄位格式）----
  const handleExport = () => {
    const exportItems = items.filter((p) => (p.status || "active") === "active");

    const HEADER = [
      "店名", "委託書編號", "案名", "地址", "地坪", "權狀坪", "樓別", "座向",
      "屋齡", "格局", "車位", "總價(萬)", "空／自", "巷寬", "開發姓名",
      "官網點閱網址", "詳細資料表", "備註", "管理費",
    ];

    const wb = XLSX.utils.book_new();

    // 索引總覽（維持原始格式）
    const indexRows = [
      ["物件查詢總表 - 索引", null, null],
      [null, null, null],
      ["類別", "筆數", "涵蓋店別"],
    ];
    let total = 0;
    CATEGORIES.forEach((cat) => {
      const rowsInCat = exportItems.filter((p) => (p.category || "") === cat);
      const stores = [...new Set(rowsInCat.map((p) => p.store).filter(Boolean))];
      indexRows.push([cat, rowsInCat.length, stores.join("、")]);
      total += rowsInCat.length;
    });
    indexRows.push([null, null, null]);
    indexRows.push(["總計", total, null]);
    const indexSheet = XLSX.utils.aoa_to_sheet(indexRows);
    XLSX.utils.book_append_sheet(wb, indexSheet, "索引總覽");

    // 15 個分類分頁
    CATEGORIES.forEach((cat) => {
      const rowsInCat = exportItems.filter((p) => (p.category || "") === cat);
      const aoa = [HEADER];
      rowsInCat.forEach((p) => {
        aoa.push([
          p.store || "",
          p.listingNo || "",
          p.title || "",
          p.address || "",
          p.landPing ?? "",
          p.titlePing ?? "",
          p.floor || "",
          p.orientation || "",
          p.age || "",
          p.layout || "",
          p.parkingCount ?? "",
          p.totalPrice ?? "",
          p.occupancy || "",
          p.laneWidth || "",
          p.agentInfo || "",
          p.websiteUrl || "",
          "",
          p.notes || "",
          getPropertyManagementFee(p),
        ]);
      });
      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, sheet, cat);
    });

    XLSX.writeFile(wb, `物件總表_匯出_${todayStr()}.xlsx`);
  };

  const fieldStyle2 = { display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1fr 1fr", gap: 14 };
  const fieldStyle3 = { display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "1fr 1fr 1fr", gap: 14 };

  return (
    <main>
      <input
        id="property-floorplan-upload"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
        multiple
        onChange={handleFloorplanUpload}
        disabled={uploadingFloorplan}
        aria-label="選擇格局圖"
        style={{ display: "none" }}
      />
      <div className="top-actions properties-top-actions">
        <div className="section-title">
          物件（{filtered.length}）
        </div>
        <div className="properties-toolbar" style={{ display: "flex", gap: 10 }}>
          <button
            className={selectionMode ? "btn" : "btn ghost"}
            onClick={() => {
              setSelectionMode((value) => !value);
              setSelectedIds(new Set());
              setSelectedBuyerId("");
              setShowForm(false);
              setShowShare(false);
              setShowViewingPdf(false);
            }}
          >
            {selectionMode ? "結束勾選" : "勾選傳送"}
          </button>
          {!isMobile && (
            <button
              className="btn ghost"
              onClick={() => window.open("http://127.0.0.1:8877/", "leshan-property-sync")}
              title="開啟這台電腦上的物件同步工具"
            >
              立即同步
            </button>
          )}
          {!isMobile && <button className="btn ghost" onClick={handleExport}>匯出 Excel</button>}
          {!isMobile && (
            <label className="btn ghost" style={{ cursor: "pointer" }}>
              {importing ? "處理中…" : "匯入／更新 Excel"}
              <input type="file" accept=".xlsx,.xls" onChange={analyzeImportFile} style={{ display: "none" }} disabled={importing} />
            </label>
          )}
          {!isMobile && (
            <label className="btn ghost" style={{ cursor: "pointer" }}>
              {importing ? "處理中…" : "補上地址／面積"}
              <input type="file" accept=".json,application/json" onChange={importPropertyDetails} style={{ display: "none" }} disabled={importing} />
            </label>
          )}
          {isMobile && (
            <button className="btn ghost" onClick={() => setShowMobileTools((value) => !value)}>
              {showMobileTools ? "收起工具" : "更多工具"}
            </button>
          )}
          <button className="btn properties-add-btn" onClick={openNew}>
            ＋ 新增物件
          </button>
        </div>
      </div>

      {isMobile && showMobileTools && (
        <div className="panel properties-mobile-tools">
          <button className="btn ghost" onClick={handleExport}>匯出 Excel</button>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            {importing ? "處理中…" : "匯入／更新 Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={analyzeImportFile} style={{ display: "none" }} disabled={importing} />
          </label>
          <label className="btn ghost" style={{ cursor: "pointer" }}>
            {importing ? "處理中…" : "補上地址／面積"}
            <input type="file" accept=".json,application/json" onChange={importPropertyDetails} style={{ display: "none" }} disabled={importing} />
          </label>
        </div>
      )}

      <PropertyPdfLibrary
        key={user.uid}
        library={pdfLibrary}
        properties={items}
        selectedProperties={selectedProperties}
        buyerId={selectedBuyerId}
        onLoad={(savedProperties, savedBuyerId) => {
          setSelectedIds(new Set(savedProperties.map((property) => property.id)));
          setSelectedBuyerId(savedBuyerId);
          setSelectionMode(true);
          setShowShare(false);
          setShowForm(false);
          setPdfLoadVersion((value) => value + 1);
          setShowViewingPdf(true);
        }}
      />

      {selectedIds.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 13, color: "var(--accent)", fontWeight: 700 }}>已選 {selectedIds.size} 筆物件</span>
          <BuyerRecipientPicker value={selectedBuyerId} onChange={setSelectedBuyerId} />
          <button className="btn" onClick={() => { setShowShare(true); setShowViewingPdf(false); }}>分享給客人</button>
          <button className="btn ghost" onClick={() => { setShowViewingPdf((value) => !value); setShowShare(false); }}>合併帶看資料 PDF</button>
          <button className="btn ghost" onClick={() => { setSelectedIds(new Set()); setSelectedBuyerId(""); setShowShare(false); setShowViewingPdf(false); }}>清除選取</button>
        </div>
      )}

      {showViewingPdf && selectedProperties.length > 0 && (
        <PropertyViewingPdf
          key={`${Array.from(selectedIds).join("|")}:${pdfLoadVersion}`}
          properties={selectedProperties}
          buyerId={selectedBuyerId}
          onGenerated={pdfLibrary.saveGenerated}
          onClose={() => setShowViewingPdf(false)}
        />
      )}

      {showShare && (
        <PropertyShare
          properties={selectedProperties}
          selectedBuyerId={selectedBuyerId}
          onClose={() => setShowShare(false)}
        />
      )}

      {importAnalysis && importAnalysis.ambiguousPairs.length > 0 && (
        <div className="panel" style={{ marginBottom: 20, border: "1.5px solid var(--brass)" }}>
          <div className="section-title" style={{ fontSize: 15 }}>
            有 {importAnalysis.ambiguousPairs.length} 筆案名相同、但其他資料對不齊，請確認是不是同一間
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>
            預設是「當作不同物件」（比較安全，不會誤合併）。確認完按最下面「確認並匯入」才會真正寫入。
          </div>
          {importAnalysis.ambiguousPairs.map((pair, idx) => (
            <div key={idx} style={{ background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{pair.row.title}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ color: "var(--muted)", fontWeight: 700, marginBottom: 4 }}>資料庫裡現有的</div>
                  委託書編號：{pair.existing.listingNo || "—"}<br />
                  權狀坪：{pair.existing.titlePing || "—"}　格局：{pair.existing.layout || "—"}<br />
                  總價：{pair.existing.totalPrice || "—"} 萬
                </div>
                <div>
                  <div style={{ color: "var(--brass)", fontWeight: 700, marginBottom: 4 }}>Excel 這次的</div>
                  委託書編號：{pair.row.listingNo || "—"}<br />
                  權狀坪：{pair.row.titlePing || "—"}　格局：{pair.row.layout || "—"}<br />
                  總價：{pair.row.totalPrice || "—"} 萬
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={importDecisions[idx] === "merge" ? "btn" : "btn ghost"}
                  onClick={() => setImportDecisions({ ...importDecisions, [idx]: "merge" })}
                >
                  視為同一物件（合併）
                </button>
                <button
                  className={importDecisions[idx] === "separate" ? "btn" : "btn ghost"}
                  onClick={() => setImportDecisions({ ...importDecisions, [idx]: "separate" })}
                >
                  當作不同物件（分開）
                </button>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button className="btn" disabled={importing} onClick={() => commitImport(importAnalysis, importDecisions)}>
              {importing ? "匯入中…" : "確認並匯入"}
            </button>
            <button className="btn ghost" onClick={() => { setImportAnalysis(null); setImportDecisions({}); }}>
              取消這次匯入
            </button>
          </div>
        </div>
      )}

      {/* 狀態切換 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className={viewMode === "active" ? "btn" : "btn ghost"} onClick={() => { setViewMode("active"); setShowForm(false); }}>
          在售（{statusCounts.active}）
        </button>
        <button className={viewMode === "onHold" ? "btn" : "btn ghost"} onClick={() => { setViewMode("onHold"); setShowForm(false); }}>
          暫時不賣（{statusCounts.onHold}）
        </button>
        <button className={viewMode === "sold" ? "btn" : "btn ghost"} onClick={() => { setViewMode("sold"); setShowForm(false); }}>
          已售出（{statusCounts.sold}）
        </button>
      </div>

      {/* 分類篩選 */}
      <div className="property-category-filter" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        <button
          style={{
            cursor: "pointer", border: "none", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700,
            background: activeCategory === "全部" ? "var(--accent)" : "var(--accent-soft)",
            color: activeCategory === "全部" ? "#fff" : "var(--accent)",
          }}
          onClick={() => { setActiveCategory("全部"); setShowForm(false); }}
        >
          全部（{categoryPool.length}）
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            style={{
              cursor: "pointer", border: "none", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700,
              background: activeCategory === c ? "var(--accent)" : "var(--accent-soft)",
              color: activeCategory === c ? "#fff" : "var(--accent)",
            }}
            onClick={() => { setActiveCategory(c); setShowForm(false); }}
          >
            {c}（{categoryCounts[c] || 0}）
          </button>
        ))}
      </div>

      <section className="property-priority-worklist" aria-label="案件處理分類">
        <details className="property-priority-disclosure">
          <summary>
            <strong>案件處理</strong>
            {(priorityRefresh.running || priorityFilter !== "all") && <span className="property-priority-summary-context">
              {priorityRefresh.running ? `更新中 ${priorityRefresh.completed}／${priorityRefresh.total}` : `目前篩選：${PRIORITY_FILTERS.find((filter) => filter.value === priorityFilter)?.label}（${priorityCounts[priorityFilter]}）`}
            </span>}
          </summary>
          <div className="property-priority-disclosure-body">
        <div className="property-priority-worklist-heading">
          <div>
            <button type="button" className="btn ghost" onClick={updatePriorityWorklist} disabled={priorityRefresh.running || !priorityTargets.length}>
              {priorityRefresh.running ? `更新中 ${priorityRefresh.completed}／${priorityRefresh.total}` : "更新案件判斷"}
            </button>
            {priorityRefresh.running && <button type="button" className="btn ghost" onClick={stopPriorityRefresh}>停止檢查</button>}
          </div>
        </div>
        <div className="property-priority-filter-buttons" role="group" aria-label="案件處理篩選">
          {PRIORITY_FILTERS.map((filter) => <button key={filter.value} type="button" className={`property-priority-filter ${filter.value}`} aria-pressed={priorityFilter === filter.value} onClick={() => { setPriorityFilter(filter.value); setShowForm(false); }}>
            {filter.label}（{priorityCounts[filter.value]}）
          </button>)}
        </div>
        <p>範圍：A7／A8／A9 在售案件。可更新行情：{priorityTargets.length} 筆。</p>
        <details className="property-priority-method"><summary>分類與更新說明</summary><p>筆數會跟著搜尋條件改變。「先把資料補齊」會列出還需要補資料或再確認的案件，例如車位價格、成交參考或能不能帶看。「還沒查過附近成交」也包含需要重新查詢的案件；這裡查的是同社區、大小差不多的房子。查過的成交在目前裝置保留一天，系統會搭配目前的物件資料、客人需求與帶看確認，重新整理分類。</p></details>
        <div className="property-priority-progress" role="status">{priorityRefresh.running ? `正在檢查本次範圍 ${priorityRefresh.total} 筆，已完成 ${priorityRefresh.completed} 筆。` : priorityRefresh.message || "按「更新案件判斷」，一次檢查目前範圍，不用逐筆開啟。"}</div>
          </div>
        </details>
      </section>

      <section className="property-search-panel" aria-label="物件搜尋條件" onChangeCapture={closeBrowsingDetail}>
        <div className="property-search-heading">
          <div><strong>物件搜尋</strong><span role="status">找到 {filtered.length} 筆</span></div>
          <div className="property-search-actions">
            <button type="button" className={showAdvancedFilters || advancedFilterCount > 0 ? "btn" : "btn ghost"} aria-expanded={showAdvancedFilters} aria-controls="property-advanced-filters" onClick={() => setShowAdvancedFilters((value) => !value)}>
              {showAdvancedFilters ? "收起進階" : "進階篩選"}{advancedFilterCount > 0 ? `（${advancedFilterCount}）` : ""}
            </button>
            <button type="button" className="btn ghost" onClick={clearAllFilters}>清除條件</button>
          </div>
        </div>
        <div className="property-search-basic">
          <label className="property-search-field property-search-wide">關鍵字
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="輸入關鍵字，例如 a7；搜尋案名、商圈、社區、地址…" />
          </label>
          <label className="property-search-field">商圈／區域
            <select value={businessAreaFilter} onChange={(e) => setBusinessAreaFilter(e.target.value)}>
              <option value="">全部商圈／區域</option>
              <optgroup label="捷運生活圈">
                <option value="zone:A7">A7 全區</option><option value="zone:A8">A8 全區</option><option value="zone:A9">A9 全區</option>
              </optgroup>
              <optgroup label="物件現有商圈">{businessAreaOptions.map((area) => <option key={area.value} value={area.value}>{area.label}</option>)}</optgroup>
              <option value="missing">未填商圈／區域</option>
            </select>
          </label>
          <label className="property-search-field">縣市
            <select value={cityFilter} onChange={(e) => { setCityFilter(e.target.value); setDistrictFilter(""); }}>
              <option value="">全部縣市</option>
              {TAIWAN_CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label className="property-search-field">行政區
            <select value={districtFilter ? `${cityFilter}::${districtFilter}` : ""} onChange={(e) => {
              if (!e.target.value) { setDistrictFilter(""); return; }
              const [city, district] = e.target.value.split("::");
              setCityFilter(city); setDistrictFilter(district);
            }}>
              <option value="">全部行政區</option>
              {(cityFilter ? [cityFilter] : TAIWAN_CITIES).map((city) => <optgroup key={city} label={city}>
                {TAIWAN_REGIONS[city].map((district) => <option key={district} value={`${city}::${district}`}>{district}</option>)}
              </optgroup>)}
            </select>
          </label>
          <label className="property-search-field">官網
            <select aria-label="官網篩選" value={websiteFilter} onChange={(e) => setWebsiteFilter(e.target.value)}>
              <option value="all">全部</option><option value="published">有官網</option><option value="unpublished">沒官網</option>
            </select>
          </label>
          <div className="property-search-field property-search-wide"><span>總價（萬）</span>
            <div className="property-search-pair">
              <input aria-label="最低總價（萬）" type="number" min="0" inputMode="decimal" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="最低" />
              <span>～</span>
              <input aria-label="最高總價（萬）" type="number" min="0" inputMode="decimal" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="最高" />
            </div>
          </div>
          <div className="property-search-field property-search-wide"><span>房數</span>
            <div className="property-search-pair">
              <input aria-label="房數" type="number" min="0" inputMode="numeric" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} placeholder="不限" />
              <select aria-label="房數比較方式" value={roomMode} onChange={(e) => setRoomMode(e.target.value)}><option value="eq">房（剛好）</option><option value="gte">房以上</option></select>
            </div>
          </div>
          <label className="property-search-field property-search-wide" htmlFor="property-sort">排序方式
            <select id="property-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              {PROPERTY_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}{option.value.startsWith("unit-price") ? `（${unitPriceBasis === "net" ? "扣車位" : "含車簡算"}）` : ""}</option>)}
            </select>
          </label>
        </div>
        {showAdvancedFilters && <div id="property-advanced-filters" className="property-search-advanced">
          <div className="property-search-subheading">單價篩選</div>
          <div className="property-search-advanced-grid" aria-label="物件單價篩選">
            <label className="property-search-field">單價計算方式
              <select value={unitPriceBasis} onChange={(e) => setUnitPriceBasis(e.target.value)}><option value="gross">含車簡算單價</option><option value="net">扣車位單價</option></select>
            </label>
            <label className="property-search-field">最低單價（萬／坪）<input type="number" min="0" step="0.1" inputMode="decimal" value={minUnitPrice} onChange={(e) => setMinUnitPrice(e.target.value)} placeholder="不限" /></label>
            <label className="property-search-field">最高單價（萬／坪）<input type="number" min="0" step="0.1" inputMode="decimal" value={maxUnitPrice} onChange={(e) => setMaxUnitPrice(e.target.value)} placeholder="不限" /></label>
          </div>
          <p className="property-search-help">{unitPriceBasis === "net" ? "車位價格空白時，平面每個預設 180 萬、機械每個預設 150 萬；車位類型或坪數不齊的案件不列入。" : "含車簡算＝總價 ÷ 權狀坪數。沒有權狀坪數的案件不列入單價篩選。"}</p>
          <div className="property-search-subheading">坪數、屋齡與格局</div>
          <div className="property-search-advanced-grid">
            {[
              { label: "主建物坪數", min: minMainBuildingPing, setMin: setMinMainBuildingPing, max: maxMainBuildingPing, setMax: setMaxMainBuildingPing },
              { label: "權狀坪數", min: minTitlePing, setMin: setMinTitlePing, max: maxTitlePing, setMax: setMaxTitlePing },
              { label: "地坪", min: minLandPing, setMin: setMinLandPing, max: maxLandPing, setMax: setMaxLandPing },
              { label: "屋齡（年）", min: minAge, setMin: setMinAge, max: maxAge, setMax: setMaxAge },
            ].map((range) => <div key={range.label} className="property-search-field"><span>{range.label}</span>
              <div className="property-search-pair">
                <input aria-label={`最低${range.label}`} type="number" min="0" step="0.1" inputMode="decimal" value={range.min} onChange={(e) => range.setMin(e.target.value)} placeholder="最低" />
                <span>～</span>
                <input aria-label={`最高${range.label}`} type="number" min="0" step="0.1" inputMode="decimal" value={range.max} onChange={(e) => range.setMax(e.target.value)} placeholder="最高" />
              </div>
            </div>)}
            {[
              { label: "樓層", value: floorFilter, setValue: setFloorFilter, mode: floorMode, setMode: setFloorMode },
              { label: "廳數", value: livingFilter, setValue: setLivingFilter, mode: livingMode, setMode: setLivingMode },
              { label: "衛浴數", value: bathFilter, setValue: setBathFilter, mode: bathMode, setMode: setBathMode },
            ].map((field) => <div key={field.label} className="property-search-field"><span>{field.label}</span>
              <div className="property-search-pair">
                <input aria-label={field.label} type="number" min="0" inputMode="numeric" value={field.value} onChange={(e) => field.setValue(e.target.value)} placeholder="不限" />
                <select aria-label={`${field.label}比較方式`} value={field.mode} onChange={(e) => field.setMode(e.target.value)}><option value="eq">剛好</option><option value="gte">以上</option></select>
              </div>
            </div>)}
            <label className="property-search-field">車位
              <select value={parkingFilter} onChange={(e) => setParkingFilter(e.target.value)}><option value="all">全部</option><option value="yes">有車位</option><option value="no">無車位</option></select>
            </label>
            <label className="property-search-field property-search-wide">格局關鍵字
              <input value={layoutKeyword} onChange={(e) => setLayoutKeyword(e.target.value)} placeholder="例如挑高、開放式格局" />
            </label>
            <label className="property-search-top-floor"><input type="checkbox" checked={topFloorOnly} onChange={(e) => setTopFloorOnly(e.target.checked)} />只看頂樓</label>
          </div>
          <p className="property-search-help">坪數、屋齡等條件只會列出已填寫相關資料的物件。</p>
        </div>}
        {minUnitPrice !== "" && maxUnitPrice !== "" && Number(minUnitPrice) > Number(maxUnitPrice) && <p className="property-search-error" role="alert">最低單價不能大於最高單價，請調整範圍。</p>}
      </section>

      {showForm && (() => {
        const tabs = [["overview", "基本資料"], ["market", "行情公設"], ["files", "資料表／格局圖"], ["matches", "配對客需"], ["history", "歷程紀錄"]];
        const detail = (
        <section id="property-detail-workspace" className="property-detail-workspace" aria-label="物件資料工作區">
          <div className="panel property-detail-panel">
          {editingId && !editMode && <>
            <div className="property-detail-toolbar">
              <div className="property-detail-title-row">
                <div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 5 }}>{form.listingNo || "未填委託書編號"}・{form.store || "未填店名"}</div>
                  <div className="section-title" style={{ fontSize: 22, marginBottom: 6 }}>{form.title || "未命名物件"}</div>
                  <span className="tag">{form.category || "未分類"}</span>
                  <span className="tag" style={{ marginLeft: 6 }}>{STATUS_LABELS[form.status || "active"]}</span>
                </div>
                <div className="property-detail-actions">
                  {form.websiteUrl && form.websitePublished === true && <a href={withAgid(form.websiteUrl, agid)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>開啟網頁</a>}
                  {form.websiteUrl && form.websitePublished === true && <button type="button" className="btn ghost" onClick={() => copyUrl(form.websiteUrl)}>複製網址</button>}
                  {form.websiteUrl && form.websitePublished !== true && <span className="btn ghost" style={{ color: "#B42318", background: "#FEECEB" }}>× 官網未上架</span>}
                  <label htmlFor="property-floorplan-upload" onClick={() => setDetailTab("files")} className="btn ghost" style={{ cursor: uploadingFloorplan ? "wait" : "pointer" }}>
                    {uploadingFloorplan ? "格局圖上傳中…" : "＋ 上傳格局圖"}
                  </label>
                  <button type="button" className="btn" onClick={() => openPropertyEditor()}>編輯資料</button>
                  <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>關閉</button>
                </div>
              </div>
              <div className="property-detail-tabs" role="tablist" aria-label="物件資料分類">
                {tabs.map(([id, label], index) => <button key={id} type="button" role="tab" id={`property-tab-${id}`} aria-controls="property-tab-panel" aria-selected={detailTab === id} tabIndex={detailTab === id ? 0 : -1} onClick={() => setDetailTab(id)} onKeyDown={(event) => {
                  const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
                  if (next !== null) { event.preventDefault(); setDetailTab(tabs[next][0]); document.getElementById(`property-tab-${tabs[next][0]}`)?.focus(); }
                }}>{label}{id === "files" ? `（${(form.sheetFiles || []).length + (form.floorplanFiles || []).length}）` : ""}</button>)}
              </div>
            </div>
            <div className="property-detail-tab-content" id="property-tab-panel" role="tabpanel" aria-labelledby={`property-tab-${detailTab}`}>
              {detailTab === "overview" && <>
              <div className="property-key-stats">
                <DetailValue label="總價" value={form.totalPrice ? `${form.totalPrice} 萬` : "—"} accent />
                <DetailValue label="格局" value={form.layout} />
                <DetailValue label="權狀坪" value={form.titlePing ? `${form.titlePing} 坪` : "—"} />
                <DetailValue label="扣車面積" value={formatPropertyAreaWithoutParking(form)} />
                <DetailValue label="主建物" value={form.mainBuildingPing ? `${form.mainBuildingPing} 坪` : "—"} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
                <DetailValue label="社區名稱" value={form.communityName} />
                <DetailValue label="商圈／區域" value={form.area} />
                <DetailValue label="地址" value={form.address} />
                <DetailValue label="樓別／座向" value={[form.floor, form.orientation].filter(Boolean).join("・")} />
                <DetailValue label="屋齡" value={form.age} />
                <DetailValue label="空屋／自住" value={form.occupancy} />
                <DetailValue label="地坪" value={form.landPing ? `${form.landPing} 坪` : "—"} />
                <DetailValue label="附屬／公設／車位" value={[
                  form.auxiliaryBuildingPing && `附屬 ${form.auxiliaryBuildingPing} 坪`,
                  form.commonAreaPing !== "" && form.commonAreaPing != null && `公設 ${form.commonAreaPing} 坪`,
                  form.parkingPing && `車位 ${form.parkingPing} 坪`,
                ].filter(Boolean).join("・")} />
                <DetailValue label="車位編號" value={form.parkingNumber} />
                <DetailValue label="管理費" value={formatPropertyManagementFee(form) || "未提供"} />
                <DetailValue label="車位價格" value={formatPropertyParkingPrice(form)} />
                <DetailValue label="帶看確認" value={({ available: "已確認可帶看", appointment: "需先預約確認", unavailable: "目前無法帶看" })[form.viewingStatus] || "尚未確認"} />
              </div>
              {(form.notes || form.agentInfo) && (
                <div style={{ background: "var(--accent-soft)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, lineHeight: 1.65 }}>
                  {form.agentInfo && <div><strong>負責業務：</strong>{displayPropertyAgent(form.agentInfo)}</div>}
                  {form.notes && <div><strong>備註：</strong>{form.notes}</div>}
                </div>
              )}
              </>}
              {detailTab === "market" && <PropertyMarketReference property={{ ...form, id: editingId }} reference={marketReference.data} loading={marketReference.loading} error={marketReference.error} onRefresh={marketReference.refresh} needs={needs} onEdit={openPropertyEditor} />}
              {detailTab === "files" && <>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>物件資料表（{(form.sheetFiles || []).length}）</div>
                {(form.sheetFiles || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>尚未上傳資料表</div>
                ) : (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(form.sheetFiles || []).map((file, idx) => (
                      <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none" }}>📄 {file.name || `資料表 ${idx + 1}`}</a>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>格局圖（{(form.floorplanFiles || []).length}）</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 9 }}>
                  {floorplanAddressKey(form.address)
                    ? "上傳後會記住此完整門牌；也可選擇一張圖，套用到其他案件。"
                    : "地址尚未包含完整門牌；格局圖仍可上傳，但補齊地址後才能自動配對。"}
                </div>
                {(form.floorplanFiles || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>尚未上傳格局圖</div>
                ) : (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(form.floorplanFiles || []).map((file, idx) => (
                      <div key={file.url || idx} style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 180 }}>
                        <a href={file.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-flex", flexDirection: "column", gap: 6 }}>
                          <img src={file.url} alt={file.name || `格局圖 ${idx + 1}`} style={{ width: 150, maxHeight: 150, objectFit: "contain", borderRadius: 6 }} />
                          <span style={{ overflowWrap: "anywhere" }}>{file.name || `格局圖 ${idx + 1}`}</span>
                        </a>
                        <button type="button" className="btn ghost" onClick={() => setSharingFloorplanFile(file)} style={{ fontSize: 12 }}>套用到其他案件</button>
                      </div>
                    ))}
                  </div>
                )}
                {sharingFloorplanFile && (
                  <FloorplanSharingPanel
                    key={sharingFloorplanFile.url}
                    source={form}
                    file={sharingFloorplanFile}
                    properties={items}
                    busy={applyingFloorplan}
                    onApply={applyFloorplanToProperties}
                    onClose={() => setSharingFloorplanFile(null)}
                  />
                )}
              </div>
                <details className="property-optional-market"><summary>市場競品資料（選用）</summary><MarketIntelligence propertyId={editingId} defaultUrl={form.websiteUrl} /></details>
              </>}
              {detailTab === "matches" && <ReverseMatchesPanel property={{ ...form, id: editingId }} needs={needs} updateNeed={updateNeed} />}
              {detailTab === "history" && <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>案件掃描紀錄</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <DetailValue label="首次掃描出現" value={formatScanTime(form.firstSeenAt)} />
                  <DetailValue label="最近掃描出現" value={formatScanTime(form.lastSeenAt)} />
                  <DetailValue label="首次掃描未見" value={formatScanTime(form.firstMissingAt)} />
                  <DetailValue label="首次自動暫時關閉" value={formatScanTime(form.firstOnHoldAt)} />
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 7, lineHeight: 1.5 }}>
                  {form.firstSeenAtSource === "tracking-start" || form.firstMissingAtSource === "tracking-start"
                    ? "舊案件的首次歷史無法精確回溯；顯示的是新功能開始追蹤後，第一次確認的時間。"
                    : "第一次未見只作紀錄；連續兩次完整同步都未見，才會自動改為暫時不賣。空白代表尚無可靠紀錄。"}
                </div>
              </div>
                <PropertyHistory propertyId={editingId} createdAt={form.createdAt} updatedAt={form.updatedAt} />
                {linkedCases.filter((item) => item.propertyId === editingId).length > 0 && <div className="property-linked-cases"><h4>使用於成交案件</h4>{linkedCases.filter((item) => item.propertyId === editingId).map((item) => <div key={item.id}>{item.title}{item.contactName && `　客戶：${item.contactName}`}</div>)}</div>}
              </>}
            </div>
          </>}
          {(!editingId || editMode) && <div className="property-detail-toolbar property-edit-toolbar">
            <div><small>{editingId ? "編輯物件" : "新增物件"} · {form.listingNo || "尚未編號"}</small><strong>{form.title || "新物件"}</strong></div>
            <div className="property-detail-actions">
              <button className="btn" type="submit" form="property-edit-form" disabled={savingProperty}>{savingProperty ? "儲存中…" : editingId ? "儲存變更" : "新增物件"}</button>
              <button className="btn ghost" type="button" disabled={savingProperty} onClick={() => editingId ? openEdit(items.find((item) => item.id === editingId) || form) : setShowForm(false)}>{editingId ? "返回瀏覽" : "取消"}</button>
            </div>
            {propertySaveError && <div role="alert" className="property-save-error">{propertySaveError}</div>}
          </div>}
          <form id="property-edit-form" className="form-grid property-edit-fields" onSubmit={onSubmit} style={{ display: !editingId || editMode ? "grid" : "none" }}>
            <div style={fieldStyle3}>
              <div className="form-field">
                <label>店名</label>
                <select value={form.store} onChange={(e) => setForm({ ...form, store: e.target.value })}>
                  {STORES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>類別</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>狀態</label>
                {editingId ? (
                  <select value={form.status} onChange={(e) => changeStatus({ id: editingId, soldPrice: form.soldPrice }, e.target.value)}>
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                ) : (
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                )}
                {form.status === "sold" && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 11 }}>成交金額（萬）</label>
                    <input value={form.soldPrice || ""} onChange={(e) => setForm({ ...form, soldPrice: e.target.value })} placeholder="不知道可以留空" />
                  </div>
                )}
              </div>
            </div>

            <div style={fieldStyle2}>
              <div className="form-field">
                <label>委託書編號</label>
                <input value={form.listingNo} onChange={(e) => setForm({ ...form, listingNo: e.target.value })} />
              </div>
              <div className="form-field">
                <label>案名</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
              </div>
            </div>

            <div style={fieldStyle2}>
              <div className="form-field">
                <label>社區名稱</label>
                <input list="a7-community-options" value={form.communityName} onChange={(e) => setForm({ ...form, communityName: e.target.value })} placeholder="輸入或選擇社區名稱" />
                <datalist id="a7-community-options">
                  {A7_COMMUNITY_NAMES.map((name) => <option key={name} value={name} />)}
                </datalist>
              </div>
              <div className="form-field">
                <label>商圈／區域</label>
                <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="例如：A7、A8、林口" />
              </div>
            </div>

            <div className="form-field">
              <label>地址</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div style={fieldStyle3}>
              <div className="form-field">
                <label>地坪</label>
                <input value={form.landPing} onChange={(e) => setForm({ ...form, landPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="property-title-ping">權狀坪</label>
                <input id="property-title-ping" value={form.titlePing} onChange={(e) => setForm({ ...form, titlePing: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="property-area-without-parking">扣車面積（坪）</label>
                <input id="property-area-without-parking" readOnly value={formatPropertyAreaWithoutParking(form)} />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>自動計算：權狀坪 − 車位坪數</div>
              </div>
              <div className="form-field">
                <label>主建物（坪）</label>
                <input value={form.mainBuildingPing} onChange={(e) => setForm({ ...form, mainBuildingPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label>附屬建物（坪）</label>
                <input value={form.auxiliaryBuildingPing} onChange={(e) => setForm({ ...form, auxiliaryBuildingPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label>公設（不含車位，坪）</label>
                <input value={form.commonAreaPing} onChange={(e) => setForm({ ...form, commonAreaPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="property-parking-ping">車位（坪）</label>
                <input id="property-parking-ping" value={form.parkingPing} onChange={(e) => setForm({ ...form, parkingPing: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="property-parking-price">車位價格（萬）</label>
                <input id="property-parking-price" type="number" min="0" step="0.1" value={formParkingPrice.source === "preset" ? formParkingPrice.price : form.parkingPrice ?? ""} onChange={(e) => setForm({ ...form, parkingPrice: e.target.value })} placeholder="填寫全部車位的合計價格" aria-describedby="property-parking-price-help" />
                <small id="property-parking-price-help" style={{ color: "var(--muted)" }}>{formParkingPrice.source === "preset" ? `目前使用${formParkingPrice.kind}預設：每個 ${formParkingPrice.perSpace} 萬，${formParkingPrice.count} 個共 ${formParkingPrice.price} 萬。可直接修改。` : "已有價格優先；留空時，平面每個預設 180 萬、機械每個預設 150 萬，依車位數量合計。"}</small>
              </div>
              <div className="form-field">
                <label htmlFor="property-viewing-status">帶看確認</label>
                <select id="property-viewing-status" value={form.viewingStatus || "unknown"} onChange={(e) => setForm({ ...form, viewingStatus: e.target.value, viewingConfirmedAt: "" })}>
                  <option value="unknown">尚未確認</option><option value="available">已確認可帶看</option><option value="appointment">需先預約確認</option><option value="unavailable">目前無法帶看</option>
                </select>
                <small style={{ color: "var(--muted)" }}>選擇可帶看並儲存後記錄確認時間，30 天後需重新確認。</small>
                {form.viewingStatus === "available" && <button type="button" className="btn ghost" onClick={() => setForm({ ...form, viewingConfirmedAt: "" })}>重新確認可帶看（儲存後生效）</button>}
              </div>
              <div className="form-field">
                <label>樓別</label>
                <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="例如：5/5" />
              </div>
              <div className="form-field">
                <label>座向</label>
                <input value={form.orientation} onChange={(e) => setForm({ ...form, orientation: e.target.value })} placeholder="例如：坐北朝南" />
              </div>
              <div className="form-field">
                <label>屋齡</label>
                <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="例如：12年3個月" />
              </div>
              <div className="form-field">
                <label>格局</label>
                <input value={form.layout} onChange={(e) => setForm({ ...form, layout: e.target.value })} placeholder="房/廳/衛，例如：3/2/2" />
              </div>
              <div className="form-field">
                <label htmlFor="property-parking-count">車位（數量）</label>
                <input id="property-parking-count" value={form.parkingCount} onChange={(e) => setForm({ ...form, parkingCount: e.target.value })} />
              </div>
              <div className="form-field">
                <label>車位編號</label>
                <input value={form.parkingNumber || ""} onChange={(e) => setForm({ ...form, parkingNumber: e.target.value })} placeholder="例如：B2-123；多個請用頓號分隔" />
              </div>
              <div className="form-field">
                <label htmlFor="property-parking-description">車位說明</label>
                <input id="property-parking-description" value={form.parkingDescription} onChange={(e) => setForm({ ...form, parkingDescription: e.target.value })} />
              </div>
              <div className="form-field">
                <label htmlFor="property-total-price">總價（萬）</label>
                <input id="property-total-price" value={form.totalPrice} onChange={(e) => setForm({ ...form, totalPrice: e.target.value })} />
                {editingId && originalTotalPrice !== null && String(originalTotalPrice) !== String(form.totalPrice) && form.totalPrice !== "" && (
                  <div style={{ fontSize: 11, color: "var(--brass)", marginTop: 4 }}>
                    儲存後會記錄：{originalTotalPrice} 萬 → {form.totalPrice} 萬
                  </div>
                )}
              </div>
              <div className="form-field">
                <label htmlFor="property-management-fee">管理費</label>
                <input id="property-management-fee" value={form.managementFee ?? ""} onChange={(e) => setForm({ ...form, managementFee: e.target.value })} placeholder="例如：2000、60 元／坪／月、無管理費" />
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>單填數字以元／月顯示；也可填寫實際計費方式，未確認可留空。</div>
              </div>
              <div className="form-field">
                <label>空／自</label>
                <input value={form.occupancy} onChange={(e) => setForm({ ...form, occupancy: e.target.value })} placeholder="空屋／自住／出租中" />
              </div>
              <div className="form-field">
                <label>巷寬</label>
                <input value={form.laneWidth} onChange={(e) => setForm({ ...form, laneWidth: e.target.value })} />
              </div>
            </div>

            <div className="form-field">
              <label>開發姓名（含電話）</label>
              <input value={form.agentInfo} onChange={(e) => setForm({ ...form, agentInfo: e.target.value })} />
            </div>
            <div className="form-field">
              <label>官網點閱網址</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ flex: 1 }}
                  value={form.websiteUrl}
                  onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                />
                {form.websiteUrl && form.websitePublished === true && (
                  <a href={withAgid(form.websiteUrl, agid)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center" }}>
                    開啟網頁
                  </a>
                )}
                {form.websiteUrl && form.websitePublished === true && (
                  <button type="button" className="btn ghost" style={{ whiteSpace: "nowrap" }} onClick={() => copyUrl(form.websiteUrl)}>
                    複製網址
                  </button>
                )}
                {form.websiteUrl && form.websitePublished !== true && <span className="btn ghost" style={{ color: "#B42318", background: "#FEECEB", whiteSpace: "nowrap" }}>× 官網未上架</span>}
              </div>
            </div>
            <div className="form-field">
              <label>備註</label>
              <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="form-field">
              <label>物件資料表（PDF 或圖片，可一次選多頁，方便隨時查看、傳給客戶）</label>
              {!editingId && (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  請先儲存這筆物件，之後點進來編輯就可以上傳資料表了
                </div>
              )}
              {editingId && (
                <>
                  {(form.sheetFiles || []).map((f, idx) => (
                    <div key={idx} style={{ marginBottom: 10, background: "#FAFAF8", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
                      {f.type && f.type.startsWith("image/") ? (
                        <img src={f.url} alt={f.name} style={{ maxWidth: 200, borderRadius: 8, border: "1px solid var(--border)", display: "block", marginBottom: 8 }} />
                      ) : (
                        <div style={{ fontSize: 13, marginBottom: 8 }}>📄 {f.name}</div>
                      )}
                      <div style={{ display: "flex", gap: 8 }}>
                        <a href={f.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-block" }}>
                          開啟／下載
                        </a>
                        <button type="button" className="btn ghost" onClick={() => removeSheet(idx)}>
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                  <label className="btn ghost" style={{ cursor: "pointer", display: "inline-block" }}>
                    {uploadingSheet ? "上傳中…" : "新增檔案"}
                    <input type="file" accept=".pdf,image/*" multiple onChange={handleSheetUpload} style={{ display: "none" }} disabled={uploadingSheet} />
                  </label>
                </>
              )}
            </div>

            {editingId && (
              <div className="form-field">
                <label>格局圖</label>
                <label htmlFor="property-floorplan-upload" className="btn ghost" style={{ cursor: uploadingFloorplan ? "wait" : "pointer", width: "fit-content", marginBottom: 10 }}>
                  {uploadingFloorplan ? "格局圖上傳中…" : "＋ 上傳格局圖"}
                </label>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(form.floorplanFiles || []).map((file, idx) => (
                    <a key={idx} href={file.url} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-flex", flexDirection: "column", gap: 6, maxWidth: 180 }}>
                      <img src={file.url} alt={file.name || `格局圖 ${idx + 1}`} style={{ width: 150, maxHeight: 150, objectFit: "contain", borderRadius: 6 }} />
                      <span style={{ overflowWrap: "anywhere" }}>{file.name || `格局圖 ${idx + 1}`}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="form-field">
              <label>自訂欄位</label>
              {form.customFields.map((f, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input value={f.label} onChange={(e) => updateCustomField(idx, "label", e.target.value)} placeholder="欄位名稱" style={{ flex: 1 }} />
                  <input value={f.value} onChange={(e) => updateCustomField(idx, "value", e.target.value)} placeholder="內容" style={{ flex: 1 }} />
                  <button type="button" className="btn ghost" onClick={() => removeCustomField(idx)}>刪除</button>
                </div>
              ))}
              <button type="button" className="btn ghost" onClick={addCustomField}>＋ 新增自訂欄位</button>
            </div>

            {editingId && <details className="property-delete-section"><summary>進階操作</summary>
              <button className="btn danger" type="button" disabled={savingProperty} onClick={async () => { await deleteForever({ id: editingId, title: form.title }); setShowForm(false); }}>永久刪除</button>
            </details>}
          </form>
          </div>
        </section>
        );
        const target = editingId && displayedProperties.some((item) => item.id === editingId) &&
          typeof document !== "undefined" ? document.getElementById(`property-detail-${editingId}`) : null;
        return target ? createPortal(detail, target) : !editingId || editMode ? detail : null;
      })()}

      <div className="panel properties-list">
        {displayedProperties.length === 0 && (
          <div className="empty-state">
            <div className="big">{items.length === 0 ? "還沒有物件資料" : "找不到符合的物件"}</div>
            {items.length === 0 && "點右上角「＋ 新增物件」開始建檔，或用「匯入 Excel」批次匯入"}
          </div>
        )}
        {displayedProperties.map((p) => (
          <React.Fragment key={p.id}>
          <div className="list-row" onClick={() => selectionMode ? toggleSelect(p.id) : togglePropertyDetail(p)} style={{ cursor: "pointer", background: selectedIds.has(p.id) ? "var(--accent-soft)" : undefined }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(p.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(p.id)}
                  style={{ marginTop: 4, width: 18, height: 18, flexShrink: 0 }}
                />
              )}
              <div>
              <div className="name">
                {p.title} <span className="tag">{p.category}</span>
                <PropertyPriorityBadge assessment={priorities.get(p.id)} />
                {(p.sheetFiles || []).length > 0 && <span title="已上傳資料表"> 📄</span>}
              </div>
              <div className="meta">
                {p.communityName && <><strong>{p.communityName}</strong>　</>}
                {p.area && <>{p.area}　</>}
                {p.store}　{p.listingNo}　{p.address}
              </div>
              <div className="property-list-agent">
                <span>負責業務</span>
                <strong>{displayPropertyAgent(p.agentInfo)}</strong>
              </div>
              {retainOpenProperty && p.id === editingId && <div className="property-priority-progress">這筆案件的分類已更新；關閉資料後會從目前分類隱藏。</div>}
              {priorityFilter !== "all" && priorities.get(p.id) && <div className="property-priority-task">
                <strong>{priorities.get(p.id).reason}</strong>
                <span>{priorities.get(p.id).next}</span>
                <button type="button" className="btn ghost" onClick={(event) => {
                  event.stopPropagation();
                  openEdit(p);
                  const assessment = priorities.get(p.id);
                  if (assessment.code === "missing_unit") openPropertyEditor(assessment.missingFields?.[0]?.fieldId);
                  else setDetailTab("market");
                }}>{priorityActionLabel(priorities.get(p.id))}</button>
              </div>}
              <div className="meta">
                {Boolean(p.floor) && <>{p.floor}　</>}
                {Boolean(p.layout) && <>{p.layout}　</>}
                {Boolean(p.titlePing) && <>{p.titlePing} 坪　</>}
                {Boolean(p.occupancy) && <>{p.occupancy}</>}
              </div>
              {Boolean(p.totalPrice) && (
                <div className="property-list-price">
                  <span>總價</span><strong>{p.totalPrice}</strong><span>萬</span>
                </div>
              )}
              {formatUnitPrice(p, unitPriceBasis) !== "未提供" && <div className="meta">{unitPriceBasis === "net" ? "扣車位單價" : "含車簡算單價"}：{formatUnitPrice(p, unitPriceBasis)}</div>}
              {(p.mainBuildingPing != null || p.auxiliaryBuildingPing != null || p.commonAreaPing != null || p.parkingPing != null) && (
                <div className="meta">
                  {p.mainBuildingPing != null && <>主建 {p.mainBuildingPing} 坪　</>}
                  {p.auxiliaryBuildingPing != null && <>附屬 {p.auxiliaryBuildingPing} 坪　</>}
                  {p.commonAreaPing != null && <>公設 {p.commonAreaPing} 坪　</>}
                  {p.parkingPing != null && <>車位 {p.parkingPing} 坪</>}
                </div>
              )}
              {p.lastPriceChange && (
                <div className="meta" style={{ color: "var(--brass)" }}>
                  💰 已調整：{p.lastPriceChange.oldPrice} 萬 → {p.lastPriceChange.newPrice} 萬（{p.lastPriceChange.date}）
                </div>
              )}
              {p.status === "sold" && p.soldPrice && (
                <div className="meta" style={{ color: "var(--accent)", fontWeight: 700 }}>
                  🎉 成交金額：{p.soldPrice} 萬
                </div>
              )}
              {p.updatedAt && (
                <div className="meta" style={{ fontSize: 11 }}>最近更新：{formatDate(p.updatedAt)}</div>
              )}
            </div>
            </div>
            <div className="actions" onClick={(e) => e.stopPropagation()}>
              {p.websiteUrl && p.websitePublished === true && (
                <a href={withAgid(p.websiteUrl, agid)} target="_blank" rel="noreferrer" className="btn ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                  開啟網頁
                </a>
              )}
              {p.websitePublished !== true && !isMobile && (
                <span
                  role="img"
                  aria-label={`${p.title || "物件"} 官網目前未上架`}
                  title="公司後台「官網點閱」沒有超連結，目前未上官網"
                  style={{ color: "#B42318", background: "#FEECEB", border: "1px solid #F1B8B2", borderRadius: 8, padding: 8, display: "inline-flex" }}
                >
                  <X size={15} strokeWidth={2.5} aria-hidden="true" />
                </span>
              )}
              {p.websitePublished !== true && !isMobile && (
                <span className="tag" style={{ color: "#B42318", background: "#FEECEB" }}>官網未上架</span>
              )}
              {p.websitePublished !== true && isMobile && (
                <span className="btn ghost" style={{ color: "#B42318", background: "#FEECEB" }}>× 官網未上架</span>
              )}
              {p.websiteUrl && p.websitePublished === true && (
                <button className="btn ghost" onClick={() => copyUrl(p.websiteUrl)}>
                  複製網址
                </button>
              )}
              <select
                value={p.status || "active"}
                onChange={(e) => changeStatus(p, e.target.value)}
                style={{ padding: "8px 10px", fontSize: 12 }}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button className="btn ghost" onClick={() => selectionMode ? toggleSelect(p.id) : togglePropertyDetail(p)}>{selectionMode ? selectedIds.has(p.id) ? "取消勾選" : "勾選" : showForm && editingId === p.id ? "收起資料" : "查看資料"}</button>
            </div>
          </div>
          <div id={`property-detail-${p.id}`} className="property-inline-detail-host" />
          </React.Fragment>
        ))}
      </div>
    </main>
  );
}
