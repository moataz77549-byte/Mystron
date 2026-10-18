import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { privilegedDatabase, publicDatabase } from "@/lib/supabase";
import { sameOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/rate-limit";
import { pinSchema } from "@/lib/validation";
import { hashPin, verifyPin } from "@/lib/pin";
import { failure } from "@/lib/api";
const input = z
  .object({
    action: z.enum(["save", "verify"]).default("save"),
    pin: pinSchema,
    password: z.string().min(1).max(128).optional(),
    ttl_seconds: z.number().int().min(60).max(900).default(600),
    required: z.boolean().default(true),
  })
  .strict();
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return failure("INVALID_ORIGIN", 403);
  let stage = "identity";
  try {
    const identity = await requirePermission("security.manage");
    if (!(await rateLimit("pin:" + identity.user.id, 10, 900)))
      return failure("RATE_LIMITED", 429);
    const b = input.parse(await req.json());
    const server = privilegedDatabase();
    const state = await server.rpc("security_pin_state", {
      p_user_id: identity.user.id,
    });
    if (state.error) throw state.error;
    if (
      state.data?.locked_until &&
      new Date(state.data.locked_until) > new Date()
    )
      return failure("PIN_LOCKED", 429);
    let strong = false;
    stage = "reauthentication";
    if (b.password) {
      const reauth = await publicDatabase().auth.signInWithPassword({
        email: identity.user.email!,
        password: b.password,
      });
      if (reauth.error || reauth.data.user?.id !== identity.user.id) {
        await server.rpc("security_pin_attempt", {
          p_user_id: identity.user.id,
          p_success: false,
        });
        return failure("REAUTHENTICATION_REQUIRED", 401);
      }
      // If MFA is enrolled, a password alone may not lower its assurance requirement.
      const factors =
        identity.user.factors?.filter((f) => f.status === "verified") || [];
      if (factors.length) {
        const assurance =
          await identity.db.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error || assurance.data?.currentLevel !== "aal2")
          return failure("MFA_REQUIRED", 403);
      }
      strong = true;
      // A separate reauthentication session is not retained.
      await publicDatabase()
        .auth.admin.signOut(reauth.data.session?.access_token || "", "local")
        .catch(() => undefined);
    }
    stage = "save-or-verify";
    if (b.action === "save") {
      if (!strong) return failure("REAUTHENTICATION_REQUIRED", 401);
      const saved = await server.rpc("security_save_pin", {
        p_user_id: identity.user.id,
        p_hash: hashPin(b.pin),
        p_ttl: b.ttl_seconds,
        p_required: b.required,
      });
      if (saved.error) throw saved.error;
    } else {
      const correct = !!state.data?.hash && verifyPin(b.pin, state.data.hash);
      const attempt = await server.rpc("security_pin_attempt", {
        p_user_id: identity.user.id,
        p_success: correct,
      });
      if (attempt.error) throw attempt.error;
      if (!correct || attempt.data !== true) return failure("INVALID_PIN", 403);
    }
    stage = "claims";
    const claims = await identity.db.auth.getClaims();
    if (claims.error) throw claims.error;
    const sid = z.uuid().parse(claims.data?.claims.session_id);
    const proof = randomBytes(32).toString("base64url");
    stage = "proof";
    const created = await server.rpc("security_create_proof", {
      p_user_id: identity.user.id,
      p_session_id: sid,
      p_proof_hash: createHash("sha256").update(proof).digest("hex"),
      p_strong: strong,
    });
    if (created.error) throw created.error;
    (await cookies()).set("maystroon-proof", proof, {
      httpOnly: true,
      secure: req.nextUrl.protocol === "https:",
      sameSite: "strict",
      maxAge: created.data,
      path: "/",
    });
    return NextResponse.json(
      { data: { verified: true, expires_in: created.data, strong } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("PIN_OPERATION_FAILED", {
      stage,
      type: e instanceof Error ? e.name : "DATABASE_ERROR",
    });
    const code = e instanceof Error ? e.message : "";
    return failure(
      e instanceof z.ZodError
        ? "INVALID_INPUT"
        : code === "UNAUTHORIZED"
          ? "UNAUTHORIZED"
          : code === "FORBIDDEN"
            ? "FORBIDDEN"
            : "SERVICE_UNAVAILABLE",
      e instanceof z.ZodError
        ? 400
        : code === "UNAUTHORIZED"
          ? 401
          : code === "FORBIDDEN"
            ? 403
            : 503,
    );
  }
}
