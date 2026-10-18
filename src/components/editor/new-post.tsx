"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { command } from "./command";
export default function NewPost() {
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const p = await command("posts", {
            patch: {
              title,
              slug: `draft-${crypto.randomUUID()}`,
              content_json: { type: "doc", content: [{ type: "paragraph" }] },
            },
          });
          router.push(`/admin/posts/${p.id}/edit`);
        } catch (e) {
          setError(String(e));
          setBusy(false);
        }
      }}
    >
      <h1>تدوينة جديدة</h1>
      <label>
        عنوان المسودة
        <input
          required
          maxLength={300}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <button disabled={busy}>
        {busy ? "جارٍ الإنشاء…" : "إنشاء وفتح المحرر"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
