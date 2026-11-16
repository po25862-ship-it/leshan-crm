import { decodeSurveyHeic } from "./surveyHeicDecoder";

export const SURVEY_PHOTO_TIMEOUT_MS = 20000;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const MAX_DATA_URL_LENGTH = 500000;
const TIMEOUT_MESSAGE = "照片處理逾時，請確認照片已下載到電腦，再重試或重新選擇照片。";
const READ_MESSAGE = "照片無法讀取，請重新選取，或先轉成 JPG／PNG 再加入。";

function cancelled() {
  const error = new Error("已取消照片處理。");
  error.name = "AbortError";
  return error;
}
function check(signal) { if (signal?.aborted) throw cancelled(); }

function bounded(work, signal, timeoutMs, onLate) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    const settle = (fn, value) => { if (finished) return; finished = true; cleanup(); fn(value); };
    const abort = () => settle(reject, cancelled());
    const timer = setTimeout(() => settle(reject, new Error(TIMEOUT_MESSAGE)), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    Promise.resolve(work).then(value => {
      if (finished) { onLate?.(value); return; }
      settle(resolve, value);
    }, error => settle(reject, error));
    if (signal?.aborted) abort();
  });
}

// A decoder which never fires either event must not leave the entire editor busy.
export function imageOf(url, { signal, timeoutMs = 12000 } = {}) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    let finished = false;
    const cleanup = () => { clearTimeout(timer); image.onload = null; image.onerror = null; signal?.removeEventListener("abort", abort); };
    const fail = error => {
      if (finished) return; finished = true; cleanup();
      image.src = ""; reject(error);
    };
    const abort = () => fail(cancelled());
    const timer = setTimeout(() => fail(new Error(TIMEOUT_MESSAGE)), timeoutMs);
    image.onload = () => {
      if (finished) return;
      if (!((image.naturalWidth || image.width) > 0 && (image.naturalHeight || image.height) > 0)) return fail(new Error(READ_MESSAGE));
      finished = true; cleanup(); resolve(image);
    };
    image.onerror = () => fail(new Error(READ_MESSAGE));
    image.decoding = "async";
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort(); else image.src = url;
  });
}

function validate(file) {
  if (!file || !(file.size > 0)) throw new Error("這張照片沒有可讀取的內容，請先將照片完整下載到電腦，再加入。");
  if (file.size > MAX_INPUT_BYTES) throw new Error("請選擇 15MB 以內的照片，較大的照片請先縮小。");
  const type = String(file.type || "").toLowerCase();
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif", "image/bmp", "image/avif", "image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"];
  const extension = /\.(jpe?g|png|webp|gif|bmp|avif|hei[cf])$/i.test(file.name || "");
  if (!allowed.includes(type) && !((!type || type === "application/octet-stream") && extension)) throw new Error("請選擇 JPG、PNG 或 WebP 照片；不支援資料夾、PDF 或網頁連結。");
}

function dataUrlOf(blob, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    let finished = false;
    const cleanup = () => { reader.onload = null; reader.onerror = null; reader.onabort = null; signal.removeEventListener("abort", abort); };
    const settle = (fn, value) => { if (finished) return; finished = true; cleanup(); fn(value); };
    const abort = () => { settle(reject, cancelled()); if (reader.readyState === 1) reader.abort(); };
    reader.onload = () => settle(resolve, reader.result);
    reader.onerror = () => settle(reject, new Error(READ_MESSAGE));
    reader.onabort = () => settle(reject, cancelled());
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort(); else reader.readAsDataURL(blob);
  });
}

export async function prepareSurveyPhoto(file, { signal, onStage } = {}) {
  validate(file); check(signal);
  const controller = new AbortController();
  let expired = false, objectUrl = "", image, canvas, source = file;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => { expired = true; controller.abort(); }, SURVEY_PHOTO_TIMEOUT_MS);
  try {
    onStage?.("正在讀取照片…");
    if (/image\/hei[cf]/i.test(file.type || "") || /\.hei[cf]$/i.test(file.name || "")) {
      onStage?.("正在轉換 HEIC 照片，第一次使用需要載入轉檔程式…");
      try {
        const decoded = await bounded(decodeSurveyHeic(file, { signal: controller.signal }), controller.signal, SURVEY_PHOTO_TIMEOUT_MS, late => late?.close?.());
        if (decoded instanceof Blob) source = decoded; else image = decoded;
      }
      catch (error) {
        if (controller.signal.aborted) throw cancelled();
        throw new Error("HEIC 照片轉換失敗，請重試；若仍無法轉換，請從相簿匯出成 JPG 後再加入。");
      }
    } else if (typeof createImageBitmap === "function") {
      try { image = await bounded(createImageBitmap(file), controller.signal, 6000, late => late?.close?.()); }
      catch (error) { if (controller.signal.aborted) throw error; }
    }
    if (!image) {
      objectUrl = URL.createObjectURL(source);
      try { image = await imageOf(objectUrl, { signal: controller.signal }); }
      catch (error) {
        if (!controller.signal.aborted && /hei[cf]/i.test(file.type || file.name || "")) throw new Error("這個瀏覽器無法讀取 HEIC 照片，請先轉成 JPG 或 PNG 再加入。");
        throw error;
      }
    }
    check(controller.signal);
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!(width > 0 && height > 0) || width * height > 100000000) throw new Error("照片尺寸過大或無法辨識，請先縮小照片後再加入。");
    canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context || typeof canvas.toBlob !== "function") throw new Error("目前瀏覽器無法處理這張照片，請重新選擇照片或更新瀏覽器。");
    let scale = Math.min(1, 1600 / width, 1600 / height);
    for (let attempt = 0; attempt < 7; attempt++) {
      check(controller.signal); onStage?.("正在縮小照片…");
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
      context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const quality = [.86, .72, .58][attempt % 3];
      const blob = await bounded(new Promise((resolve, reject) => {
        try { canvas.toBlob(value => value ? resolve(value) : reject(new Error("照片縮小失敗，請重新選擇照片。")), "image/jpeg", quality); }
        catch { reject(new Error("照片縮小失敗，請重新選擇照片。")); }
      }), controller.signal, SURVEY_PHOTO_TIMEOUT_MS);
      if (blob.size <= 374000) {
        onStage?.("正在準備照片預覽…");
        const result = await dataUrlOf(blob, controller.signal);
        check(controller.signal);
        if (typeof result === "string" && /^data:image\/(?:jpeg|png);base64,/.test(result) && result.length <= MAX_DATA_URL_LENGTH) return result;
      }
      if (attempt % 3 === 2) scale *= .75;
    }
    throw new Error("照片縮小後仍然太大，請先裁減照片或換一張照片。");
  } catch (error) {
    if (expired) throw new Error(TIMEOUT_MESSAGE);
    throw error;
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", abort);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (image?.close) image.close(); else if (image) image.src = "";
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
