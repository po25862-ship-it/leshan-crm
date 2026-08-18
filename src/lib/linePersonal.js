// 8876 專給個人 LINE；8765 保留給既有的 FB 自動分享工具。
export const LINE_PERSONAL_TOOL_URL = "http://127.0.0.1:8876";

export function openLinePersonalTool() {
  window.open(LINE_PERSONAL_TOOL_URL, "_blank", "noopener,noreferrer");
}
