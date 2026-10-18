"use client";
import { useState } from "react";
import Link from "next/link";
import type { AIAnswer } from "../../../packages/contracts/ai";
export function HybridSearch({ query }: { query: string }) {
  const [result, setResult] = useState<AIAnswer>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="control-card" aria-label="البحث الدلالي الاختياري">
      <p>
        البحث النصي يعمل مستقلاً. يمكنك طلب نتائج إضافية بالمقارنة الدلالية عند
        تفعيل الخدمة؛ يُرسل نص البحث إلى مزود Embeddings.
      </p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/v1/ai/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: query }),
            });
            const payload = await response.json();
            if (!response.ok) throw Error();
            setResult(payload.data);
          } catch {
            setError("البحث الدلالي غير متاح حالياً. استخدم النتائج النصية.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "جارٍ البحث…" : "البحث الدلالي الإضافي"}
      </button>
      {error && <p role="status">{error}</p>}
      {result && (
        <div aria-live="polite">
          <p>{result.answer}</p>
          <ul>
            {result.sources.map((source) => (
              <li key={source.post_id}>
                <Link href={source.url}>{source.title}</Link>
                <p>{source.quote}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
