"use client";
import { useState } from "react";
export function ViewsChart({
  days,
}: {
  days: { day: string; views: number }[];
}) {
  const [selected, setSelected] = useState("");
  const max = Math.max(1, ...days.map((d) => Number(d.views)));
  if (!days.length) return <p>لا توجد مشاهدات مسجلة في هذه الفترة.</p>;
  return (
    <section className="control-card">
      <h2>المشاهدات اليومية</h2>
      <div
        className="analytics-chart"
        role="group"
        aria-label="مشاهدات مسجلة حسب اليوم"
      >
        {days.map((d) => (
          <button
            key={d.day}
            style={{ height: Math.max(2, (Number(d.views) / max) * 180) }}
            aria-label={`${d.day}: ${d.views} مشاهدة`}
            title={`${d.day}: ${d.views}`}
            onFocus={() => setSelected(`${d.day}: ${d.views} مشاهدة`)}
            onMouseEnter={() => setSelected(`${d.day}: ${d.views} مشاهدة`)}
            onClick={() => setSelected(`${d.day}: ${d.views} مشاهدة`)}
          />
        ))}
      </div>
      <p className="chart-summary" aria-live="polite">
        {selected || "اختر يوماً أو انتقل إليه بلوحة المفاتيح."}
      </p>
      <details>
        <summary>عرض البيانات كجدول</summary>
        <table>
          <thead>
            <tr>
              <th>اليوم UTC</th>
              <th>المشاهدات</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td>{d.views}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
