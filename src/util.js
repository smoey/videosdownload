export const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
export const UA_MOBILE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

export class UserError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.status = status;
  }
}

/** 从分享文案里提取第一个链接，例如 “7.43 复制打开抖音… https://v.douyin.com/xxx/ ” */
export function extractUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s，。；！？一-鿿"'<>]+/);
  if (!m) throw new UserError("没有找到链接，请粘贴视频链接或分享文案", 400);
  return m[0].replace(/[.,)]+$/, "");
}

/** 跟随短链接跳转，返回最终地址（不下载正文） */
export async function resolveRedirects(url, { ua = UA_MOBILE, max = 6 } = {}) {
  let current = url;
  for (let i = 0; i < max; i++) {
    const res = await fetch(current, { method: "GET", redirect: "manual", headers: { "User-Agent": ua } });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, current).toString();
      continue;
    }
    return current;
  }
  return current;
}

export async function fetchText(url, headers = {}) {
  const res = await fetch(url, { headers: { "User-Agent": UA_DESKTOP, ...headers } });
  if (!res.ok) throw new UserError(`请求平台页面失败（HTTP ${res.status}）`, 502);
  return res.text();
}

export async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { "User-Agent": UA_DESKTOP, Accept: "application/json", ...(init.headers || {}) } });
  if (!res.ok) throw new UserError(`请求接口失败（HTTP ${res.status}）`, 502);
  return res.json();
}

/** 取出 HTML 里 `marker = {...}` 形式的 JSON（括号配对，能处理字符串里的花括号） */
export function extractJsonAfter(html, marker) {
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let quote = "";
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === quote) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      quote = c;
    } else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}

export function https(url) {
  if (!url) return url;
  if (url.startsWith("//")) return "https:" + url;
  return url.replace(/^http:\/\//, "https://");
}

export function safeName(s, fallback = "video") {
  const name = String(s || "")
    .replace(/[\\/:*?"<>|\r\n\t#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return name || fallback;
}
