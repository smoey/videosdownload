import { mediaRule } from "../../src/index.js";
import { UA_DESKTOP, UA_MOBILE, safeName } from "../../src/util.js";

/**
 * 媒体中转：GET /api/media?u=<地址>&n=<文件名>&e=<扩展名>[&inline=1]
 * 作用：带上平台要求的 Referer、绕开浏览器跨域限制，并让浏览器以文件名直接保存。
 */
export async function onRequestGet({ request }) {
  const params = new URL(request.url).searchParams;
  let target = params.get("u");
  if (!target || !mediaRule(target)) return new Response("不允许的地址", { status: 403 });

  const range = request.headers.get("Range");
  let upstream;
  for (let hop = 0; hop < 6; hop++) {
    const rule = mediaRule(target);
    if (!rule) return new Response("跳转到了不允许的地址", { status: 403 });
    const headers = { "User-Agent": rule.mobile ? UA_MOBILE : UA_DESKTOP, Accept: "*/*" };
    if (rule.referer) headers.Referer = rule.referer;
    if (range) headers.Range = range;
    upstream = await fetch(target, { headers, redirect: "manual" });
    const loc = upstream.headers.get("location");
    if (upstream.status >= 300 && upstream.status < 400 && loc) {
      target = new URL(loc, target).toString();
      continue;
    }
    break;
  }
  if (!upstream.ok) return new Response(`源站返回 HTTP ${upstream.status}，链接可能已过期，请重新解析`, { status: 502 });

  const out = new Headers();
  for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Last-Modified", "ETag"]) {
    const v = upstream.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", "private, max-age=600");
  if (params.get("inline") !== "1") {
    const ext = /^[a-z0-9]{2,4}$/i.test(params.get("e") || "") ? params.get("e") : "mp4";
    const name = `${safeName(params.get("n"), "download")}.${ext}`;
    const ascii = name.replace(/[^\x20-\x7e]/g, "_");
    out.set("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
