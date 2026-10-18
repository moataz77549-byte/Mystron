import { NextRequest } from "next/server";
import { mediaBytes } from "@/lib/media";
import { failure } from "@/lib/api";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { bytes, mime } = await mediaBytes(
      (await params).id,
      req.nextUrl.searchParams.get("variant") || "original",
      true,
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return failure("MEDIA_UNAVAILABLE", 404);
  }
}
