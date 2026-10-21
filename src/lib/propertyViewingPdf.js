import { renderPropertySummaryPng } from "./propertySummaryCanvas";

const A4 = [595.28, 841.89];
const PAGE_MARGIN = 24;
const MAX_TOTAL_BYTES = 120 * 1024 * 1024;

function dateMillis(year, month, day) {
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? timestamp : 0;
}

function dateFromFileName(name) {
  const text = String(name || "");
  const dates = [];
  for (const match of text.matchAll(/(?:^|\D)((?:20\d{2})[./-]?[01]\d[./-]?[0-3]\d|\d{2}[01]\d[0-3]\d)(?=\D|$)/g)) {
    const digits = match[1].replace(/\D/g, "");
    const year = digits.length === 8 ? Number(digits.slice(0, 4)) : Number(digits.slice(0, 2)) < 80
      ? 2000 + Number(digits.slice(0, 2)) : 1900 + Number(digits.slice(0, 2));
    dates.push(dateMillis(year, Number(digits.slice(-4, -2)), Number(digits.slice(-2))));
  }
  for (const match of text.matchAll(/(?:^|\D)(\d{3})[./-](\d{1,2})[./-](\d{1,2})(?=\D|$)/g)) {
    dates.push(dateMillis(1911 + Number(match[1]), Number(match[2]), Number(match[3])));
  }
  return Math.max(0, ...dates);
}

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  if (typeof value === "number") return value < 1e11 ? value * 1000 : value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function storageUploadMillis(url) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const match = path.match(/\/sheets\/(\d{13})_/);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

export function getPropertySheetPlan(properties) {
  return properties.map((property) => {
    const rawFiles = Array.isArray(property.sheetFiles) && property.sheetFiles.length > 0
      ? property.sheetFiles
      : property.sheetFileUrl
        ? [{ url: property.sheetFileUrl, name: property.sheetFileName, type: property.sheetFileType }]
        : [];
    const rankedFiles = rawFiles.map((file, index) => {
      const entry = typeof file === "string" ? { url: file } : (file || {});
      const normalized = {
        url: typeof entry.url === "string" ? entry.url.trim() : "",
        name: String(entry.name || `資料表 ${index + 1}`),
        type: String(entry.type || ""),
      };
      return {
        file: normalized,
        index,
        date: dateFromFileName(normalized.name) || timestampMillis(entry.uploadedAt || entry.createdAt) || storageUploadMillis(normalized.url),
        uploadedAt: timestampMillis(entry.uploadedAt || entry.createdAt) || storageUploadMillis(normalized.url),
      };
    });
    const latest = rankedFiles.reduce((best, candidate) => {
      if (!best || candidate.date > best.date) return candidate;
      if (candidate.date === best.date && candidate.uploadedAt > best.uploadedAt) return candidate;
      if (candidate.date === best.date && candidate.uploadedAt === best.uploadedAt && candidate.index > best.index) return candidate;
      return best;
    }, null);
    const files = latest ? [latest.file] : [];
    return {
      id: property.id,
      title: property.title || property.listingNo || "未命名物件",
      listingNo: property.listingNo || "",
      files,
      skippedCount: Math.max(0, rawFiles.length - files.length),
      missing: files.length === 0,
      invalid: files.some((file) => !file.url),
    };
  });
}

async function loadFileFromUrl(url) {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`檔案下載失敗（${response.status}）`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "",
  };
}

function detectFileType(file, bytes, contentType) {
  const mime = `${file.type} ${contentType}`.toLowerCase();
  const name = file.name.toLowerCase();
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (mime.includes("application/pdf") || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("image/png") || name.endsWith(".png")) return "png";
  if (mime.includes("image/jpeg") || /\.jpe?g$/.test(name)) return "jpg";
  if (mime.includes("image/") || /\.(webp|gif|heic|heif|tiff?)$/.test(name)) return "other-image";
  return "unsupported";
}

async function convertImageToPng(bytes, contentType) {
  if (typeof document === "undefined") throw new Error("這張圖片需要在瀏覽器中轉換");
  const sourceUrl = URL.createObjectURL(new Blob([bytes], { type: contentType || "image/*" }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("瀏覽器無法辨識這張圖片"));
      image.src = sourceUrl;
    });
    const maxDimension = 3200;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("圖片轉換失敗")), "image/png");
    });
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export async function mergePropertySheets(properties, loadFile = loadFileFromUrl, renderSummary = renderPropertySummaryPng) {
  const plan = getPropertySheetPlan(properties);
  if (plan.length === 0) throw new Error("請先勾選要列印的物件。");
  const unavailable = plan.filter((entry) => entry.invalid);
  if (unavailable.length > 0) {
    throw new Error(`以下物件的資料表連結不完整：${unavailable.map((entry) => entry.title).join("、")}。請先補上檔案，或取消勾選後再製作。`);
  }

  // Load only when the user asks for a PDF, keeping the regular property list lightweight.
  const { PDFDocument } = await import("pdf-lib");
  const merged = await PDFDocument.create();
  merged.setTitle("帶看物件資料表");
  let totalBytes = 0;
  let fileCount = 0;
  let summaryCount = 0;

  for (const [index, property] of plan.entries()) {
    if (property.missing) {
      try {
        const image = await merged.embedPng(await renderSummary(properties[index]));
        const page = merged.addPage(A4);
        page.drawImage(image, { x: 0, y: 0, width: A4[0], height: A4[1] });
        summaryCount += 1;
      } catch (error) {
        throw new Error(`「${property.title}」的系統摘要無法製作：${error.message || "未知錯誤"}`);
      }
      continue;
    }
    for (const file of property.files) {
      try {
        const loaded = await loadFile(file.url);
        const bytes = loaded instanceof Uint8Array ? loaded : new Uint8Array(loaded.bytes);
        const contentType = loaded.contentType || file.type;
        if (bytes.length === 0) throw new Error("檔案是空的");
        totalBytes += bytes.length;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error("選取檔案總量超過 120 MB，請分批製作");

        const type = detectFileType(file, bytes, contentType);
        if (type === "pdf") {
          const source = await PDFDocument.load(bytes);
          const form = source.getForm();
          if (form.getFields().length > 0) form.flatten();
          if (source.getPageCount() === 0) throw new Error("PDF 沒有頁面");
          const pages = await merged.copyPages(source, source.getPageIndices());
          pages.forEach((page) => merged.addPage(page));
        } else if (type === "png" || type === "jpg" || type === "other-image") {
          const imageBytes = type === "other-image" ? await convertImageToPng(bytes, contentType) : bytes;
          const image = type === "jpg" ? await merged.embedJpg(imageBytes) : await merged.embedPng(imageBytes);
          const pageSize = image.width > image.height ? [A4[1], A4[0]] : A4;
          const page = merged.addPage(pageSize);
          const fitted = image.scaleToFit(pageSize[0] - PAGE_MARGIN * 2, pageSize[1] - PAGE_MARGIN * 2);
          page.drawImage(image, {
            x: (pageSize[0] - fitted.width) / 2,
            y: (pageSize[1] - fitted.height) / 2,
            width: fitted.width,
            height: fitted.height,
          });
        } else {
          throw new Error("格式不支援；請使用 PDF、JPG 或 PNG，其他圖片需能在瀏覽器開啟");
        }
        fileCount += 1;
      } catch (error) {
        const reason = error instanceof TypeError && /fetch/i.test(error.message)
          ? "無法下載，請確認網路與檔案權限"
          : error.message || "讀取失敗";
        throw new Error(`「${property.title}」的「${file.name}」無法合併：${reason}`);
      }
    }
  }

  return { bytes: await merged.save(), pageCount: merged.getPageCount(), fileCount, summaryCount };
}
