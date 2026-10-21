import { UserError, fetchJson } from "./util.js";

/** 可选兜底：自建或第三方 cobalt 实例（https://github.com/imputnet/cobalt），通过环境变量 COBALT_API_URL 配置 */
export async function parseViaCobalt(url, env, platform, platformName) {
  const headers = { "Content-Type": "application/json" };
  if (env.COBALT_API_KEY) headers.Authorization = `Api-Key ${env.COBALT_API_KEY}`;
  const d = await fetchJson(env.COBALT_API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ url, videoQuality: "1080", filenameStyle: "basic" }),
  });
  const media = [];
  if (d.status === "tunnel" || d.status === "redirect") {
    media.push({ kind: "video", url: d.url, label: "最佳画质", ext: (d.filename || "").split(".").pop() || "mp4", direct: true });
  } else if (d.status === "picker") {
    (d.picker || []).forEach((p, i) =>
      media.push({ kind: p.type === "photo" ? "image" : "video", url: p.url, label: `${p.type === "photo" ? "图片" : "视频"} ${i + 1}`, ext: p.type === "photo" ? "jpg" : "mp4", direct: true })
    );
    if (d.audio) media.push({ kind: "audio", url: d.audio, label: "背景音乐", ext: "mp3", direct: true });
  } else {
    throw new UserError(`备用解析失败：${d.error?.code || d.status || "未知错误"}`);
  }
  return { platform, platform_name: platformName, title: d.filename || `${platformName}视频`, media };
}
