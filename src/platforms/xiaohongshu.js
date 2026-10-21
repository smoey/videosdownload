import { UserError, extractJsonAfter, fetchText, https, resolveRedirects } from "../util.js";

export const xiaohongshu = {
  name: "小红书",
  hosts: ["xiaohongshu.com", "xhslink.com"],
  async parse(url) {
    let u = url;
    if (/xhslink\.com/.test(u)) u = await resolveRedirects(u);
    const id = u.match(/(?:explore|discovery\/item|item)\/([0-9a-f]{24})/)?.[1];
    if (!id) throw new UserError("没能从链接里识别出小红书笔记 ID");
    // xsec_token 等参数要保留，否则网页会要求登录
    const q = new URL(u).search;
    const html = await fetchText(`https://www.xiaohongshu.com/explore/${id}${q}`, {
      Referer: "https://www.xiaohongshu.com/",
    });
    const raw = extractJsonAfter(html, "window.__INITIAL_STATE__");
    if (!raw) throw new UserError("小红书要求登录或页面结构变了，请使用 App 里“分享 → 复制链接”得到的完整链接");
    const state = JSON.parse(raw.replace(/:\s*undefined/g, ":null"));
    const map = state.note?.noteDetailMap || {};
    const note = map[id]?.note || Object.values(map).find((v) => v?.note?.noteId)?.note;
    if (!note || !note.noteId) throw new UserError("笔记不存在、已删除或需要登录才能查看");
    return fromNote(note);
  },
};

export function fromNote(note) {
  const media = [];
  if (note.type === "video") {
    const key = note.video?.consumer?.originVideoKey;
    if (key) media.push({ kind: "video", url: `https://sns-video-bd.xhscdn.com/${key}`, label: "原画（无水印）", ext: "mp4" });
    const streams = note.video?.media?.stream || {};
    for (const codec of ["h264", "h265", "av1"]) {
      for (const s of streams[codec] || []) {
        const url = s.masterUrl || s.backupUrls?.[0];
        if (!url) continue;
        const res = s.height ? `${s.height}p` : "";
        media.push({ kind: "video", url: https(url), label: `${codec.toUpperCase()} ${res}`.trim(), ext: "mp4" });
      }
    }
  } else {
    (note.imageList || []).forEach((img, i) => {
      const url = img.urlDefault || img.url || img.infoList?.find((x) => x.imageScene === "WB_DFT")?.url;
      if (url) media.push({ kind: "image", url: https(url), label: `图片 ${i + 1}`, ext: "jpg" });
      if (img.livePhoto && img.stream?.h264?.[0]?.masterUrl)
        media.push({ kind: "video", url: https(img.stream.h264[0].masterUrl), label: `实况 ${i + 1}`, ext: "mp4" });
    });
  }
  if (!media.length) throw new UserError("这篇笔记里没有找到可下载的内容");
  const cover = note.imageList?.[0]?.urlDefault || note.imageList?.[0]?.url;
  return {
    platform: "xiaohongshu",
    platform_name: "小红书",
    title: note.title || note.desc || "小红书笔记",
    author: note.user?.nickname || note.user?.nickName,
    cover: https(cover),
    media,
  };
}
