import { NextRequest } from "next/server";
import { engagement } from "@/lib/engagement";
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return engagement(req, (await params).id, "reports");
}
