"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/validation";
import type { z } from "zod";
export function LoginForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });
  const [message, setMessage] = useState("");
  return (
    <form
      className="form"
      onSubmit={handleSubmit(async (data) => {
        try {
          const r = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (r.ok) {
            router.push("/admin");
            router.refresh();
          } else
            setMessage(
              "تعذّر تسجيل الدخول. تحقق من بيانات الحساب وتأكيد البريد والصلاحية.",
            );
        } catch {
          setMessage("تعذّر الاتصال بالخدمة.");
        }
      })}
    >
      <label>
        البريد الإلكتروني
        <input
          {...register("email")}
          type="email"
          autoComplete="username"
          dir="ltr"
        />
      </label>
      {errors.email && <span className="form-error">أدخل بريداً صحيحاً</span>}
      <label>
        كلمة المرور
        <input
          {...register("password")}
          type="password"
          autoComplete="current-password"
          dir="ltr"
        />
      </label>
      {errors.password && (
        <span className="form-error">أدخل كلمة مرور صحيحة</span>
      )}
      <button className="button" disabled={isSubmitting}>
        {isSubmitting ? "جاري التحقق…" : "تسجيل الدخول"}
      </button>
      <p role="status">{message}</p>
    </form>
  );
}
