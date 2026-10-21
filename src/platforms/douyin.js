import { UA_MOBILE, UserError, extractJsonAfter, fetchText, https, resolveRedirects } from "../util.js";
import { parseViaTikwm } from "./tikwm.js";

export const douyin = {
  name: "抖音",
  hosts: ["douyin.com", "iesdouyin.com"],
  async parse(url) {
    const id = await awemeId(url);
    try {
      return await parseSharePage(id);
    } catch (e) {
      // 官方分享页解析失败时，退回第三方接口
      try {
        return await parseViaTikwm(`https://www.douyin.com/video/${id}`, "douyin", "抖音");
      } catch {
        throw e;
      }
    }
  },
};

async function awemeId(url) {
  let u = url;
  if (/v\.douyin\.com/.test(u)) u = await resolveRedirects(u);
  const m =
    u.match(/(?:video|note|slides)\/(\d{8,})/) || u.match(/[?&](?:modal_id|aweme_id|item_ids)=(\d{8,})/);
  if (!m) throw new UserError("没能从链接里识别出抖音作品 ID");
  return m[1];
}

async function parseSharePage(id) {
  const html = await fetchText(`https://www.iesdouyin.com/share/video/${id}/`, {
    "User-Agent": UA_MOBILE,
    Referer: "https://www.douyin.com/",
  });
  const raw = extractJsonAfter(html, "window._ROUTER_DATA");
  if (!raw) throw new UserError("抖音页面结构变了，暂时无法解析");
  const loader = JSON.parse(raw).loaderData || {};
  const item = Object.values(loader).map((v) => v?.videoInfoRes?.item_list?.[0]).find(Boolean);
  if (!item) throw new UserError("作品不存在、已删除或仅自己可见");
  return fromItem(item);
}

export function fromItem(item) {
  const media = [];
  const images = item.images || [];
  if (images.length) {
    images.forEach((img, i) => {
      const url = img.url_list?.find((u) => !/\.webp/.test(u)) || img.url_list?.[0];
      if (url) media.push({ kind: "image", url: https(url), label: `图片 ${i + 1}`, ext: "jpg" });
    });
  } else {
    const play = item.video?.play_addr?.url_list?.[0];
    if (!play) throw new UserError("没有找到视频地址");
    // playwm 是带水印地址，换成 play 就是无水印
    const clean = https(play).replace("/playwm/", "/play/");
    media.push({ kind: "video", url: clean.replace(/ratio=\w+/, "ratio=1080p"), label: "无水印 1080p", ext: "mp4" });
    media.push({ kind: "video", url: clean, label: "无水印 默认画质", ext: "mp4" });
  }
  const music = item.music?.play_url?.url_list?.[0] || item.music?.play_url?.uri;
  if (music && /^https?:/.test(music)) media.push({ kind: "audio", url: https(music), label: "背景音乐", ext: "mp3" });
  return {
    platform: "douyin",
    platform_name: "抖音",
    title: item.desc || "抖音作品",
    author: item.author?.nickname,
    cover: https(item.video?.cover?.url_list?.[0] || images[0]?.url_list?.[0]),
    media,
  };
}
