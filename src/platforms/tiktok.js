import { UserError, resolveRedirects } from "../util.js";
import { parseViaTikwm } from "./tikwm.js";

export const tiktok = {
  name: "TikTok",
  hosts: ["tiktok.com"],
  async parse(url) {
    let u = url;
    if (/\/\/(vm|vt)\.tiktok\.com|tiktok\.com\/t\//.test(u)) u = await resolveRedirects(u);
    if (!/\/(video|photo)\/\d+/.test(u)) throw new UserError("没能从链接里识别出 TikTok 作品");
    // TikTok 的视频地址绑定了页面 cookie，直接解析后浏览器也拿不到，所以用 tikwm 接口
    return parseViaTikwm(u.split("?")[0], "tiktok", "TikTok");
  },
};
