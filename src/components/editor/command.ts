export async function command(resource: string, body: unknown) {
  const r = await fetch(`/api/v1/admin/${resource}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.code || "REQUEST_FAILED");
  return j.data;
}
