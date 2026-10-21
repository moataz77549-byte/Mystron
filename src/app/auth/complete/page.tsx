"use client";
import { useEffect, useRef, useState } from "react";
export default function Complete() {
  const ran = useRef(false);
  const [message, setMessage] = useState("جارٍ التحقق من الجلسة…");
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const hash = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, "", "/auth/complete");
    void (async () => {
      try {
        if (!hash.get("access_token")) throw Error();
        const r = await fetch("/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: hash.get("access_token"),
            refresh_token: hash.get("refresh_token"),
          }),
        });
        if (!r.ok) throw Error();
        location.replace(
          hash.get("type") === "recovery" ? "/auth/reset" : "/admin",
        );
      } catch {
        setMessage("الرابط غير صالح أو منتهٍ. اطلب رابط دخول جديداً.");
      }
    })();
  }, []);
  return (
    <section>
      <h1>التحقق من الدخول</h1>
      <p role="status">{message}</p>
      <a href="/admin/login">صفحة الدخول</a>
    </section>
  );
}
