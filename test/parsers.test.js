import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { detectPlatform, mediaRule, parse } from "../src/index.js";
import { extractJsonAfter, extractUrl } from "../src/util.js";
import { fromItem } from "../src/platforms/douyin.js";
import { fromNote } from "../src/platforms/xiaohongshu.js";
import { fromPlayer, videoId } from "../src/platforms/youtube.js";

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

/** 按地址前缀返回假响应 */
function mockFetch(routes) {
  globalThis.fetch = async (url, init = {}) => {
    const key = Object.keys(routes).find((k) => String(url).startsWith(k));
    if (!key) throw new Error("unexpected fetch " + url);
    const r = routes[key];
    if (r.redirect) return new Response(null, { status: 302, headers: { location: r.redirect } });
    const body = typeof r === "string" ? r : JSON.stringify(r);
    return new Response(body, { status: 200 });
  };
}

test("从分享文案提取链接", () => {
  assert.equal(extractUrl("7.43 复制打开抖音，看看【xx】 https://v.douyin.com/iAbCdEf/ k@B.Gv 08/21"), "https://v.douyin.com/iAbCdEf/");
  assert.equal(extractUrl("看看这篇笔记http://xhslink.com/a/AbC123，复制本条信息"), "http://xhslink.com/a/AbC123");
  assert.throws(() => extractUrl("没有链接"));
});

test("识别平台", () => {
  assert.equal(detectPlatform("https://v.douyin.com/x/"), "douyin");
  assert.equal(detectPlatform("https://www.xiaohongshu.com/explore/abc"), "xiaohongshu");
  assert.equal(detectPlatform("https://youtu.be/abc"), "youtube");
  assert.equal(detectPlatform("https://m.youtube.com/watch?v=1"), "youtube");
  assert.equal(detectPlatform("https://x.com/a/status/1"), "x");
  assert.equal(detectPlatform("https://vt.tiktok.com/ZS/"), "tiktok");
  assert.throws(() => detectPlatform("https://bilibili.com/video/1"));
  assert.throws(() => detectPlatform("https://evilx.com/a/status/1"));
});

test("媒体中转白名单", () => {
  assert.ok(mediaRule("https://v26-web.douyinvod.com/a.mp4"));
  assert.equal(mediaRule("https://sns-video-bd.xhscdn.com/x").referer, "https://www.xiaohongshu.com/");
  assert.ok(mediaRule("https://rr1---sn-abc.googlevideo.com/videoplayback?x"));
  assert.equal(mediaRule("https://example.com/a.mp4"), null);
  assert.equal(mediaRule("https://twimg.com.evil.com/a.mp4"), null);
  assert.equal(mediaRule("file:///etc/passwd"), null);
});

test("JSON 提取能处理字符串里的花括号和 undefined", () => {
  const html = `<script>window.__INITIAL_STATE__={"a":"}{","b":{"c":undefined}}</script>`;
  const raw = extractJsonAfter(html, "window.__INITIAL_STATE__");
  assert.equal(raw, `{"a":"}{","b":{"c":undefined}}`);
});

test("抖音：短链接 + 分享页解析，去水印", async () => {
  const item = {
    desc: "测试视频 #话题",
    author: { nickname: "作者" },
    video: { play_addr: { url_list: ["https://aweme.snssdk.com/aweme/v1/playwm/?video_id=v0abc&ratio=720p&line=0"] }, cover: { url_list: ["https://p3.douyinpic.com/c.jpeg"] } },
    music: { play_url: { url_list: ["https://sf3.douyinvod.com/m.mp3"] } },
  };
  const html = `<script>window._ROUTER_DATA = ${JSON.stringify({ loaderData: { "video_(id)/page": { videoInfoRes: { item_list: [item] } } } })}</script>`;
  mockFetch({
    "https://v.douyin.com/": { redirect: "https://www.iesdouyin.com/share/video/7387656442236661030/?region=CN" },
    "https://www.iesdouyin.com/share/video/7387656442236661030/?region": "",
    "https://www.iesdouyin.com/share/video/7387656442236661030/": html,
  });
  const r = await parse("复制打开抖音 https://v.douyin.com/iAbC/ 看看");
  assert.equal(r.platform, "douyin");
  assert.equal(r.author, "作者");
  assert.match(r.media[0].url, /\/play\/\?video_id=v0abc&ratio=1080p/);
  assert.ok(!r.media.some((m) => m.url.includes("playwm")));
  assert.equal(r.media.at(-1).kind, "audio");
});

test("抖音：图文作品", () => {
  const r = fromItem({ desc: "图集", images: [{ url_list: ["https://p.douyinpic.com/1.webp", "https://p.douyinpic.com/1.jpeg"] }, { url_list: ["https://p.douyinpic.com/2.jpeg"] }] });
  assert.deepEqual(r.media.map((m) => m.url), ["https://p.douyinpic.com/1.jpeg", "https://p.douyinpic.com/2.jpeg"]);
});

test("小红书：视频笔记", async () => {
  const note = {
    noteId: "66b1c9a4000000001e01b8a6",
    type: "video",
    title: "标题",
    user: { nickname: "博主" },
    imageList: [{ urlDefault: "http://sns-webpic-qc.xhscdn.com/cover" }],
    video: { consumer: { originVideoKey: "pre_post/abc" }, media: { stream: { h264: [{ masterUrl: "http://sns-video-bd.xhscdn.com/stream/1.mp4", height: 1080 }], h265: [] } } },
  };
  const state = `{"note":{"noteDetailMap":{"66b1c9a4000000001e01b8a6":{"comments":undefined,"note":${JSON.stringify(note)}}}}}`;
  mockFetch({ "https://www.xiaohongshu.com/explore/66b1c9a4000000001e01b8a6": `<script>window.__INITIAL_STATE__=${state}</script>` });
  const r = await parse("https://www.xiaohongshu.com/discovery/item/66b1c9a4000000001e01b8a6?xsec_token=T");
  assert.equal(r.title, "标题");
  assert.equal(r.media[0].url, "https://sns-video-bd.xhscdn.com/pre_post/abc");
  assert.equal(r.media[1].label, "H264 1080p");
  assert.equal(r.cover, "https://sns-webpic-qc.xhscdn.com/cover");
});

test("小红书：图文笔记", () => {
  const r = fromNote({ noteId: "a", type: "normal", desc: "d", imageList: [{ urlDefault: "https://x.xhscdn.com/1" }, { urlDefault: "https://x.xhscdn.com/2" }] });
  assert.equal(r.media.length, 2);
  assert.equal(r.title, "d");
});

test("X：fxtwitter 视频按码率排序", async () => {
  mockFetch({
    "https://api.fxtwitter.com/status/123": {
      tweet: {
        text: "hello",
        author: { name: "NASA" },
        media: { all: [{ type: "video", url: "https://video.twimg.com/a/vid/1280x720/hi.mp4", thumbnail_url: "https://pbs.twimg.com/t.jpg", variants: [
          { content_type: "video/mp4", bitrate: 832000, url: "https://video.twimg.com/a/vid/640x360/lo.mp4" },
          { content_type: "application/x-mpegURL", url: "https://video.twimg.com/a.m3u8" },
          { content_type: "video/mp4", bitrate: 2176000, url: "https://video.twimg.com/a/vid/1280x720/hi.mp4" },
        ] }, { type: "photo", url: "https://pbs.twimg.com/media/Abc.jpg" }] },
      },
    },
  });
  const r = await parse("https://x.com/NASA/status/123?s=20");
  assert.equal(r.media[0].label, "视频 1 · 1280x720");
  assert.equal(r.media.length, 3);
  assert.equal(r.media[2].url, "https://pbs.twimg.com/media/Abc?format=jpg&name=orig");
});

test("X：fxtwitter 失败时用 vxtwitter", async () => {
  mockFetch({
    "https://api.fxtwitter.com/": { code: 404, message: "NOT_FOUND" },
    "https://api.vxtwitter.com/Twitter/status/9": { text: "t", user_name: "u", media_extended: [{ type: "video", url: "https://video.twimg.com/v.mp4" }] },
  });
  const r = await parse("https://twitter.com/u/status/9");
  assert.equal(r.media[0].url, "https://video.twimg.com/v.mp4");
});

test("TikTok：短链接 + tikwm", async () => {
  let posted;
  mockFetch({ "https://vt.tiktok.com/": { redirect: "https://www.tiktok.com/@a/video/7300000000000000000?is_from_webapp=1" }, "https://www.tiktok.com/": "" });
  const mocked = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith("https://www.tikwm.com/api/")) {
      posted = String(init.body);
      return new Response(JSON.stringify({ code: 0, data: { title: "tt", author: { nickname: "n" }, play: "/video/media/play/1.mp4", hdplay: "https://www.tikwm.com/video/media/hdplay/1.mp4", music: "https://sf16.tiktokcdn.com/m.mp3", cover: "/c.jpg" } }));
    }
    return mocked(url, init);
  };
  const r = await parse("https://vt.tiktok.com/ZSabc/");
  assert.match(posted, /video%2F7300000000000000000&hd=1$/);
  assert.equal(r.media[0].label, "无水印 高清");
  assert.equal(r.media[1].url, "https://www.tikwm.com/video/media/play/1.mp4");
  assert.equal(r.cover, "https://www.tikwm.com/c.jpg");
});

test("YouTube：视频 ID 和格式整理", () => {
  assert.equal(videoId("https://www.youtube.com/watch?v=jNQXAC9IVRw&t=1"), "jNQXAC9IVRw");
  assert.equal(videoId("https://youtu.be/jNQXAC9IVRw?si=x"), "jNQXAC9IVRw");
  assert.equal(videoId("https://www.youtube.com/shorts/jNQXAC9IVRw"), "jNQXAC9IVRw");
  const r = fromPlayer({
    videoDetails: { videoId: "jNQXAC9IVRw", title: "Me at the zoo", author: "jawed", lengthSeconds: "19" },
    streamingData: {
      formats: [{ url: "https://r.googlevideo.com/18", height: 360, qualityLabel: "360p" }],
      adaptiveFormats: [
        { url: "https://r.googlevideo.com/137", mimeType: 'video/mp4; codecs="avc1"', height: 1080, bitrate: 4e6, qualityLabel: "1080p" },
        { url: "https://r.googlevideo.com/134", mimeType: 'video/mp4; codecs="avc1"', height: 360, bitrate: 3e5 },
        { signatureCipher: "s=x", mimeType: 'video/mp4; codecs="avc1"', height: 720 },
        { url: "https://r.googlevideo.com/140", mimeType: 'audio/mp4; codecs="mp4a"', bitrate: 128000 },
      ],
    },
  });
  assert.deepEqual(r.media.map((m) => m.label), ["视频+声音 360p", "仅画面 1080p（无声音）", "仅音频 m4a"]);
  assert.equal(r.duration, 19);
});

test("YouTube：被拒绝时给出说明", async () => {
  mockFetch({ "https://www.youtube.com/youtubei/": { playabilityStatus: { status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" } } });
  await assert.rejects(parse("https://youtu.be/jNQXAC9IVRw"), /not a bot.*COBALT_API_URL/);
});

test("媒体中转：带 Referer、跟随跳转、透传 Range、设置文件名", async () => {
  const { onRequestGet } = await import("../functions/api/media.js");
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), headers: init.headers });
    if (String(url).includes("snssdk.com")) return new Response(null, { status: 302, headers: { location: "https://v26.douyinvod.com/f.mp4" } });
    return new Response("data", { status: 206, headers: { "Content-Type": "video/mp4", "Content-Range": "bytes 0-3/4", "Set-Cookie": "a=b" } });
  };
  const req = new Request("https://site/api/media?u=" + encodeURIComponent("https://aweme.snssdk.com/aweme/v1/play/?video_id=1") + "&n=" + encodeURIComponent("我的视频") + "&e=mp4", { headers: { Range: "bytes=0-" } });
  const res = await onRequestGet({ request: req });
  assert.equal(res.status, 206);
  assert.equal(seen[1].url, "https://v26.douyinvod.com/f.mp4");
  assert.equal(seen[1].headers.Referer, "https://www.douyin.com/");
  assert.equal(seen[1].headers.Range, "bytes=0-");
  assert.match(res.headers.get("Content-Disposition"), /filename\*=UTF-8''%E6%88%91%E7%9A%84%E8%A7%86%E9%A2%91\.mp4/);
  assert.equal(res.headers.get("Set-Cookie"), null);
});

test("媒体中转：跳转到白名单外的地址会被拒绝", async () => {
  const { onRequestGet } = await import("../functions/api/media.js");
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } });
  const res = await onRequestGet({ request: new Request("https://site/api/media?u=" + encodeURIComponent("https://video.twimg.com/a.mp4")) });
  assert.equal(res.status, 403);
});
