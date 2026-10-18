"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { MessageCircle, X } from "lucide-react";
const Assistant = dynamic(() => import("./assistant"), {
  loading: () => <p role="status">جارٍ فتح المساعد…</p>,
  ssr: false,
});
export function FloatingAssistant() {
  const [open, setOpen] = useState(false),
    [context, setContext] = useState<{
      postId?: string;
      initialAction?: "summary";
    }>({});
  const pathname = usePathname(),
    close = useRef<HTMLButtonElement>(null),
    launch = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function show(event: Event) {
      const detail = (event as CustomEvent).detail;
      if (
        typeof detail?.post_id === "string" &&
        /^[a-f0-9-]{36}$/.test(detail.post_id)
      ) {
        setContext({ postId: detail.post_id, initialAction: "summary" });
        setOpen(true);
      }
    }
    addEventListener("maystroon:assistant", show);
    return () => removeEventListener("maystroon:assistant", show);
  }, []);
  useEffect(() => {
    if (open) close.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        launch.current?.focus();
      }
    }
    if (open) addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open]);
  if (pathname.startsWith("/admin") || pathname === "/assistant") return null;
  return (
    <>
      <button
        ref={launch}
        className="ai-launch"
        aria-expanded={open}
        aria-controls="ai-panel"
        aria-label="فتح مساعد ما يسطرون"
        onClick={() => {
          setContext({});
          setOpen(true);
        }}
      >
        <MessageCircle size={22} />
        <span>مساعد ما يسطرون</span>
      </button>
      {open && (
        <aside id="ai-panel" className="ai-panel" aria-label="نافذة المساعد">
          <button
            ref={close}
            className="icon-button ai-close"
            aria-label="إغلاق المساعد"
            onClick={() => {
              setOpen(false);
              launch.current?.focus();
            }}
          >
            <X size={20} />
          </button>
          <Assistant key={context.postId || "general"} {...context} />
        </aside>
      )}
    </>
  );
}
export function SummaryLauncher({ postId }: { postId: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        dispatchEvent(
          new CustomEvent("maystroon:assistant", {
            detail: { post_id: postId },
          }),
        )
      }
    >
      تلخيص بالذكاء الاصطناعي
    </button>
  );
}
