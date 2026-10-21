import { UserError, fetchJson, https } from "../util.js";

export const x = {
  name: "X",
  hosts: ["x.com", "twitter.com", "fxtwitter.com", "vxtwitter.com", "fixupx.com"],
  async parse(url) {
    const m = url.match(/status(?:es)?\/(\d+)/);
    if (!m) throw new UserError("没能从链接里识别出推文 ID，请使用 x.com/用户名/status/数字 形式的链接");
    try {
      return await viaFxtwitter(m[1]);
    } catch (e) {
      try {
        return await viaVxtwitter(m[1]);
      } catch {
        throw e;
      }
    }
  },
};

function result(text, author, cover, media) {
  if (!media.length) throw new UserError("这条推文里没有视频或图片");
  return { platform: "x", platform_name: "X", title: text || "X 推文", author, cover, media };
}

async function viaFxtwitter(id) {
  const res = await fetchJson(`https://api.fxtwitter.com/status/${id}`);
  const t = res.tweet;
  if (!t) throw new UserError(res.message === "NOT_FOUND" ? "推文不存在或不公开" : "解析推文失败");
  const media = [];
  let cover;
  let n = 0;
  for (const item of t.media?.all || []) {
    n++;
    if (item.type === "photo") {
      media.push({ kind: "image", url: origPhoto(item.url), label: `图片 ${n}`, ext: "jpg" });
      cover ||= item.url;
    } else {
      cover ||= item.thumbnail_url;
      const variants = (item.variants || [])
        .filter((v) => v.content_type === "video/mp4" && v.url)
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
      if (!variants.length && item.url) variants.push({ url: item.url });
      for (const v of variants) {
        const res = v.url.match(/\/(\d+x\d+)\//)?.[1];
        media.push({ kind: "video", url: v.url, label: `${item.type === "gif" ? "GIF" : "视频"} ${n}${res ? " · " + res : ""}`, ext: "mp4" });
      }
    }
  }
  return result(t.text, t.author?.name, cover, media);
}

async function viaVxtwitter(id) {
  const t = await fetchJson(`https://api.vxtwitter.com/Twitter/status/${id}`);
  const media = (t.media_extended || []).map((item, i) => ({
    kind: item.type === "image" ? "image" : "video",
    url: item.type === "image" ? origPhoto(item.url) : item.url,
    label: `${item.type === "image" ? "图片" : "视频"} ${i + 1}`,
    ext: item.type === "image" ? "jpg" : "mp4",
  }));
  return result(t.text, t.user_name, t.media_extended?.[0]?.thumbnail_url, media);
}

function origPhoto(u) {
  const url = https(u);
  if (!/pbs\.twimg\.com\/media/.test(url)) return url;
  const base = url.split("?")[0].replace(/\.(jpg|png|webp)$/, "");
  const ext = url.match(/\.(png|webp)(?:\?|$)/)?.[1] || "jpg";
  return `${base}?format=${ext}&name=orig`;
}
