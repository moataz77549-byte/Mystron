import { NextRequest, NextResponse } from "next/server";
import { storeImage, MAX_IMAGE_BYTES } from "@/lib/media";
import { sameOrigin } from "@/lib/origin";
import { authorizedUser } from "@/lib/auth";
import { failure } from "@/lib/api";
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  if (!(await authorizedUser())) return failure("UNAUTHORIZED", 401);
  if (Number(req.headers.get("content-length") || 0) > MAX_IMAGE_BYTES + 65536)
    return failure("PAYLOAD_TOO_LARGE", 413);
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > MAX_IMAGE_BYTES)
      return failure("INVALID_FILE", 400);
    const data = await storeImage(
      Buffer.from(await file.arrayBuffer()),
      file.name,
    );
    return NextResponse.json({ data });
  } catch (e) {
    return failure(e instanceof Error ? e.message : "UPLOAD_FAILED", 400);
  }
}
