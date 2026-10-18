import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicApi } from "@/lib/api";
import { post } from "@/lib/content";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const result = await publicApi(request, async () => ({
    data: await post((await params).slug),
  }));
  if (result.status === 200) {
    const body = await result.clone().json();
    if (!body.data)
      return NextResponse.json(
        { error: { code: "NOT_FOUND" } },
        { status: 404 },
      );
  }
  return result;
}
