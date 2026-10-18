import { NextRequest } from "next/server";
import { publicApi, failure } from "@/lib/api";
import { publicAuthor } from "@/lib/public-catalog";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const r = await publicApi(req, async () => ({
    data: await publicAuthor((await params).slug),
  }));
  if (r.status === 200 && !(await r.clone().json()).data)
    return failure("NOT_FOUND", 404);
  return r;
}
