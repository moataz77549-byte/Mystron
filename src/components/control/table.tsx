import Link from "next/link";
function CellValue({ value }: { value: unknown }) {
  if (typeof value === "object" && value !== null)
    return (
      <details>
        <summary>التفاصيل</summary>
        <pre dir="ltr">{JSON.stringify(value, null, 2)}</pre>
      </details>
    );
  return (
    <>
      {typeof value === "boolean"
        ? value
          ? "نعم"
          : "لا"
        : String(value ?? "—")}
    </>
  );
}
export function DataTable({
  rows,
  columns,
}: {
  rows: Record<string, unknown>[];
  columns: [string, string][];
}) {
  if (!rows.length) return <p className="status">لا توجد بيانات متاحة.</p>;
  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            {columns.map(([k, label]) => (
              <th key={k} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id || row.user_id || row.key || i)}>
              {columns.map(([key]) => (
                <td key={key}>
                  <CellValue value={row[key]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="data-records" aria-label="السجلات">
        {rows.map((row, i) => (
          <article
            className="data-record"
            key={String(row.id || row.user_id || row.key || i)}
            aria-label={`السجل ${i + 1}`}
          >
            <dl>
              {columns.map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    <CellValue value={row[key]} />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
export function Pagination({
  page,
  total,
  path,
  query = {},
}: {
  page: number;
  total: number;
  path: string;
  query?: Record<string, string>;
}) {
  return (
    <nav className="pagination" aria-label="ترقيم الصفحات">
      {page > 1 && (
        <Link
          href={
            path +
            "?" +
            new URLSearchParams({ ...query, page: String(page - 1) })
          }
        >
          السابق
        </Link>
      )}
      <span>
        الصفحة {page} · {total} سجل
      </span>
      {page * 25 < total && (
        <Link
          href={
            path +
            "?" +
            new URLSearchParams({ ...query, page: String(page + 1) })
          }
        >
          التالي
        </Link>
      )}
    </nav>
  );
}
