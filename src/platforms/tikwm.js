import { UserError, fetchJson, https } from "../util.js";

/** 第三方接口 tikwm.com：支持 TikTok 和抖音，免费额度约每秒 1 次 */
export async function parseViaTikwm(url, platform, platformName) {
  const body = new URLSearchParams({ url, hd: "1" });
  const res = await fetchJson("https://www.tikwm.com/api/", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (res.code !== 0 || !res.data) throw new UserError(`解析失败：${res.msg || "接口没有返回数据"}`);
  const d = res.data;
  const abs = (u) => (u ? https(u.startsWith("/") ? "https://www.tikwm.com" + u : u) : u);
  const media = [];
  if (d.images?.length) {
    d.images.forEach((u, i) => media.push({ kind: "image", url: abs(u), label: `图片 ${i + 1}`, ext: "jpg" }));
  } else {
    if (d.hdplay) media.push({ kind: "video", url: abs(d.hdplay), label: "无水印 高清", ext: "mp4" });
    if (d.play) media.push({ kind: "video", url: abs(d.play), label: "无水印", ext: "mp4" });
    if (d.wmplay) media.push({ kind: "video", url: abs(d.wmplay), label: "带水印", ext: "mp4" });
  }
  if (d.music) media.push({ kind: "audio", url: abs(d.music), label: "背景音乐", ext: "mp3" });
  if (!media.length) throw new UserError("没有找到可下载的内容");
  return {
    platform,
    platform_name: platformName,
    title: d.title || `${platformName}作品`,
    author: d.author?.nickname,
    cover: abs(d.origin_cover || d.cover),
    media,
  };
}
