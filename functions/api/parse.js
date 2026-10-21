import { parse } from "../../src/index.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "请求格式不对" }, 400);
  }
  try {
    return json(await parse(body.url || body.text, env));
  } catch (e) {
    const status = e.status || 500;
    return json({ error: status === 500 ? `解析出错：${e.message}` : e.message }, status);
  }
}
