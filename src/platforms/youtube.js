import { UserError } from "../util.js";

// YouTube 网页端需要签名解密和 PO Token，Worker 里做不了；这里用 Android VR 客户端接口，
// 它多数情况下直接给出可下载地址。YouTube 经常调整策略，失败时可配置 COBALT_API_URL 兜底。
const CLIENTS = [
  {
    name: "ANDROID_VR",
    id: "28",
    version: "1.62.27",
    ua: "com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
    extra: { deviceMake: "Oculus", deviceModel: "Quest 3", androidSdkVersion: 32, osName: "Android", osVersion: "12L" },
  },
  {
    name: "IOS",
    id: "5",
    version: "20.10.4",
    ua: "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
    extra: { deviceMake: "Apple", deviceModel: "iPhone16,2", osName: "iPhone", osVersion: "18.3.2.22D82" },
  },
];

export const youtube = {
  name: "YouTube",
  hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  async parse(url) {
    const id = videoId(url);
    let lastReason = "";
    for (const c of CLIENTS) {
      const data = await player(id, c).catch((e) => ({ playabilityStatus: { reason: e.message } }));
      const status = data.playabilityStatus?.status;
      if (status === "OK" && data.streamingData) {
        const out = fromPlayer(data);
        if (out.media.length) return out;
      }
      lastReason = data.playabilityStatus?.reason || status || lastReason;
    }
    throw new UserError(
      `YouTube 拒绝了请求${lastReason ? `（${lastReason}）` : ""}。YouTube 对云服务器限制很严，可在 Cloudflare 里配置 COBALT_API_URL 作为备用解析`
    );
  },
};

export function videoId(url) {
  const u = new URL(url);
  const id =
    u.searchParams.get("v") ||
    (u.hostname.endsWith("youtu.be") ? u.pathname.slice(1) : null) ||
    u.pathname.match(/\/(?:shorts|live|embed|v)\/([\w-]{11})/)?.[1];
  if (!id || !/^[\w-]{11}$/.test(id.slice(0, 11))) throw new UserError("没能从链接里识别出 YouTube 视频 ID");
  return id.slice(0, 11);
}

async function player(videoId, c) {
  const res = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": c.ua,
      "X-YouTube-Client-Name": c.id,
      "X-YouTube-Client-Version": c.version,
      Origin: "https://www.youtube.com",
    },
    body: JSON.stringify({
      context: { client: { clientName: c.name, clientVersion: c.version, hl: "zh-CN", gl: "US", ...c.extra } },
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function fromPlayer(data) {
  const sd = data.streamingData || {};
  const media = [];
  const muxed = (sd.formats || []).filter((f) => f.url).sort((a, b) => (b.height || 0) - (a.height || 0));
  for (const f of muxed) media.push({ kind: "video", url: f.url, label: `视频+声音 ${f.qualityLabel || f.height + "p"}`, ext: "mp4" });

  const adaptive = (sd.adaptiveFormats || []).filter((f) => f.url);
  const bestByHeight = new Map();
  for (const f of adaptive) {
    if (!f.mimeType?.startsWith("video/mp4") || !f.height) continue;
    const prev = bestByHeight.get(f.height);
    if (!prev || (f.bitrate || 0) > (prev.bitrate || 0)) bestByHeight.set(f.height, f);
  }
  [...bestByHeight.values()]
    .sort((a, b) => b.height - a.height)
    .filter((f) => !muxed.some((m) => m.height === f.height))
    .slice(0, 5)
    .forEach((f) => media.push({ kind: "video", url: f.url, label: `仅画面 ${f.qualityLabel || f.height + "p"}（无声音）`, ext: "mp4" }));

  const audio = adaptive
    .filter((f) => f.mimeType?.startsWith("audio/mp4"))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
  if (audio) media.push({ kind: "audio", url: audio.url, label: "仅音频 m4a", ext: "m4a" });

  const v = data.videoDetails || {};
  const thumbs = v.thumbnail?.thumbnails || [];
  return {
    platform: "youtube",
    platform_name: "YouTube",
    title: v.title || "YouTube 视频",
    author: v.author,
    duration: Number(v.lengthSeconds) || undefined,
    cover: thumbs[thumbs.length - 1]?.url || (v.videoId ? `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg` : undefined),
    media,
  };
}
