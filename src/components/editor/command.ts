import { adminRequest } from "@/lib/client/request";
export async function command(resource: string, body: unknown) {
  const result = await adminRequest<{ data: ReturnType<typeof JSON.parse> }>(
    `/api/v1/admin/${resource}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return result.data;
}
