"use client";
import { useState } from "react";
import { command } from "./command";
export default function PublishingSettings({
  initial,
}: {
  initial: {
    default_comments: boolean;
    comments_close_days: number;
    default_visibility: string;
    timezone: string;
    view_retention_days: number;
  };
}) {
  const [value, setValue] = useState(initial);
  const [message, setMessage] = useState("");
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await command("publishing", { patch: value });
          setMessage("تم الحفظ");
        } catch (e) {
          setMessage(String(e));
        }
      }}
    >
      <h1>إعدادات النشر</h1>
      <label>
        <input
          type="checkbox"
          checked={value.default_comments}
          onChange={(e) =>
            setValue({ ...value, default_comments: e.target.checked })
          }
        />
        التعليقات افتراضياً
      </label>
      <label>
        إغلاق التعليقات بعد أيام (0 بدون إغلاق تلقائي)
        <input
          type="number"
          min="0"
          max="3650"
          value={value.comments_close_days}
          onChange={(e) =>
            setValue({ ...value, comments_close_days: Number(e.target.value) })
          }
        />
      </label>
      <label>
        الظهور الافتراضي
        <select
          value={value.default_visibility}
          onChange={(e) =>
            setValue({ ...value, default_visibility: e.target.value })
          }
        >
          <option value="public">عام</option>
          <option value="private">خاص</option>
        </select>
      </label>
      <p>التوقيت: Asia/Aden · مدة الاحتفاظ بمعرّفات المشاهدة: 30 يوماً.</p>
      <button>حفظ الإعدادات</button>
      <p role="status">{message}</p>
    </form>
  );
}
