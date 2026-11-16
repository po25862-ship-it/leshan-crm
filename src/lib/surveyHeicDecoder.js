// Keep this decoder in a separate, lazy-loaded chunk. The photo stays in the browser.
export async function decodeSurveyHeic(file, { signal } = {}) {
  const { heicTo } = await import("heic-to/csp");
  if (signal?.aborted) { const error = new Error("已取消照片處理。"); error.name = "AbortError"; throw error; }
  return typeof createImageBitmap === "function"
    ? heicTo({ blob: file, type: "bitmap" })
    : heicTo({ blob: file, type: "image/jpeg", quality: .86 });
}
