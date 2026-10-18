"use client";
import { useEffect, useRef, useState } from "react";
export default function Invite() {
  const [message, setMessage] = useState("جارٍ التحقق من الدعوة…");
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const url = new URL(location.href);
    const token = url.searchParams.get("token");
    const hash = new URLSearchParams(url.hash.slice(1));
    history.replaceState(null, "", "/invite");
    void (async () => {
      try {
        if (hash.get("access_token")) {
          const r = await fetch("/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: hash.get("access_token"),
              refresh_token: hash.get("refresh_token"),
            }),
          });
          if (!r.ok) throw Error();
        }
        if (!token) throw Error();
        const r = await fetch("/api/v1/invitations/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!r.ok) throw Error();
        setMessage("تم قبول الدعوة. يمكنك فتح لوحة الإدارة.");
      } catch {
        setMessage(
          "تعذّر قبول الدعوة. يلزم رابط غير منتهٍ ومصادقة البريد المدعو. اطلب دعوة جديدة عند الحاجة.",
        );
      }
    })();
  }, []);
  return (
    <section className="section">
      <h1>دعوة إلى فريق ما يسطرون</h1>
      <p role="status">{message}</p>
      <a className="button" href="/admin">
        لوحة الإدارة
      </a>
    </section>
  );
}
