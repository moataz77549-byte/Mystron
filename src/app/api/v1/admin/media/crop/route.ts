import { NextRequest, NextResponse } from "next/server";
import { cropSchema, mediaBytes, storeImage } from "@/lib/media";
import { sameOrigin } from "@/lib/origin";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  try {
    const { source_id, ...crop } = cropSchema.parse(await req.json());
    const source = await mediaBytes(source_id, "original", true);
    return NextResponse.json({
      data: await storeImage(source.bytes, "نسخة مقصوصة", crop),
    });
  } catch (e) {
    return failure(e instanceof Error ? e.message : "CROP_FAILED", 400);
  }
}
