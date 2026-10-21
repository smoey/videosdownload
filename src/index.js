import { douyin } from "./platforms/douyin.js";
import { tiktok } from "./platforms/tiktok.js";
import { x } from "./platforms/x.js";
import { xiaohongshu } from "./platforms/xiaohongshu.js";
import { youtube } from "./platforms/youtube.js";
import { parseViaCobalt } from "./cobalt.js";
import { UserError, extractUrl } from "./util.js";

export const PLATFORMS = { douyin, xiaohongshu, youtube, x, tiktok };

const hostMatch = (host, domains) => domains.some((d) => host === d || host.endsWith("." + d));

export function detectPlatform(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new UserError("链接格式不对", 400);
  }
  for (const [key, p] of Object.entries(PLATFORMS)) if (hostMatch(host, p.hosts)) return key;
  throw new UserError("暂只支持抖音、小红书、YouTube、X 和 TikTok 的链接", 400);
}

export async function parse(text, env = {}) {
  const url = extractUrl(text);
  const key = detectPlatform(url);
  const p = PLATFORMS[key];
  try {
    return await p.parse(url);
  } catch (e) {
    if (env.COBALT_API_URL) {
      try {
        return await parseViaCobalt(url, env, key, p.name);
      } catch {
        // 兜底也失败时，报原始错误，更有参考价值
      }
    }
    throw e;
  }
}

/** 媒体中转只允许这些 CDN 域名，避免被当成任意网址的开放代理 */
const MEDIA_HOSTS = [
  { domains: ["douyinvod.com", "snssdk.com", "amemv.com", "zjcdn.com", "douyinpic.com", "douyincdn.com", "iesdouyin.com", "douyin.com", "bytecdn.cn", "byteimg.com", "pstatp.com"], referer: "https://www.douyin.com/", mobile: true },
  { domains: ["xhscdn.com", "xiaohongshu.com"], referer: "https://www.xiaohongshu.com/" },
  { domains: ["twimg.com"] },
  { domains: ["googlevideo.com", "ytimg.com", "ggpht.com"] },
  { domains: ["tikwm.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokv.com", "tiktokv.us", "tiktok.com", "ibyteimg.com", "muscdn.com"], referer: "https://www.tiktok.com/" },
];

export function mediaRule(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  return MEDIA_HOSTS.find((r) => hostMatch(host, r.domains)) || null;
}
