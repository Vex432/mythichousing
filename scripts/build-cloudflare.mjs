/*
 * Copy only public website files into dist/.
 * Never publish integrations/, .git/, or backend source as static assets.
 * Cloudflare reads functions/ separately from the project root.
 */
import { cp, mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";
const out = "dist";
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const item of ["index.html", "success.html", "assets", "robots.txt", "sitemap.xml", "favicon.ico", "favicon.svg"]) {
  try { await access(item); }
  catch { continue; }
  await cp(item, join(out, item), { recursive: true });
  console.log("Pages asset:", item);
}
