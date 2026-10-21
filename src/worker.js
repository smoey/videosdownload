// Workers 部署入口（`wrangler deploy`）。Pages 部署走 functions/ 目录，两种方式共用同一套处理逻辑。
import { onRequestGet as media } from "../functions/api/media.js";
import { onRequestPost as parse } from "../functions/api/parse.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/parse") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return parse({ request, env, ctx });
    }
    if (pathname === "/api/media") {
      if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
      return media({ request, env, ctx });
    }
    return env.ASSETS.fetch(request);
  },
};
