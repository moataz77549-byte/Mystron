import { NextResponse } from "next/server";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function maintenanceResponse(name: string, message: string) {
  return new NextResponse(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>صيانة مؤقتة | ${escape(name)}</title><style>:root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F3EB;color:#111D31;font-family:Tahoma,Arial,sans-serif;line-height:2}main{width:min(90%,720px);padding:3rem 1rem;border-block:1px solid #D5A96A}small{color:#267E81}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.5}p{font-size:1.2rem;overflow-wrap:anywhere}footer{font-size:.85rem;margin-top:3rem}@media(prefers-color-scheme:dark){body{background:#111D31;color:#F7F3EB}small{color:#D5A96A}}</style></head><body><main><small>${escape(name)} · نعتني بالتفاصيل</small><h1>نعود إليكم قريباً</h1><p>${escape(message)}</p><footer>© معتز العلقمي — اليمن، تعز — 2026م.</footer></main></body></html>`,
    {
      status: 503,
      headers: {
        "Content-Type": "text/html;charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "3600",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
