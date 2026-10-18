import Link from "next/link";
import type { PublicMenu } from "@/lib/control/navigation";
export function PublicMenuTree({
  items,
  parent = null,
  depth = 0,
}: {
  items: PublicMenu[];
  parent?: string | null;
  depth?: number;
}) {
  if (depth > 3) return null;
  return (
    <ul className="public-menu-list">
      {items
        .filter((i) => i.parent_id === parent)
        .map((i) => (
          <li key={i.id}>
            <Link
              href={i.href}
              rel={
                i.href.startsWith("https:") ? "noopener noreferrer" : undefined
              }
            >
              {i.label}
            </Link>
            {items.some((c) => c.parent_id === i.id) && (
              <PublicMenuTree items={items} parent={i.id} depth={depth + 1} />
            )}
          </li>
        ))}
    </ul>
  );
}
