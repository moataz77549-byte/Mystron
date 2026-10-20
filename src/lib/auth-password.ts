import { z } from "zod";
export const recoverySchema = z.object({ email: z.email().max(254) }).strict();
export const passwordSchema = z
  .object({
    password: z.string().min(12).max(128),
    confirmation: z.string().min(12).max(128),
  })
  .strict()
  .refine((value) => value.password === value.confirmation, {
    path: ["confirmation"],
    message: "PASSWORD_MISMATCH",
  });
export function passwordFailure(error: { code?: string; status?: number }) {
  if (error.status === 429) return { code: "RATE_LIMITED", status: 429 };
  if (error.code === "weak_password")
    return { code: "WEAK_PASSWORD", status: 400 };
  if (error.code === "same_password")
    return { code: "SAME_PASSWORD", status: 400 };
  if (
    error.code === "reauthentication_needed" ||
    error.code === "reauthentication_not_valid"
  )
    return { code: "REAUTHENTICATION_REQUIRED", status: 401 };
  return { code: "PASSWORD_UPDATE_FAILED", status: 503 };
}
