"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Moon, Sun, Menu, X, Search } from "lucide-react";
import { PublicMenuTree } from "@/components/control/public-menu";
import type { PublicMenu } from "@/lib/control/navigation";
import type { Category } from "@/lib/content";
export function Header({
  categories,
  menus = [],
  name = "ما يسطرون",
  description = "مساحة للمعرفة والحكاية",
  logo = null,
  defaultTheme = "system",
}: {
  categories: Category[];
  menus?: PublicMenu[];
  name?: string;
  description?: string;
  logo?: string | null;
  defaultTheme?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const d =
      saved === "dark" ||
      (!saved &&
        (defaultTheme === "dark" ||
          (defaultTheme === "system" &&
            matchMedia("(prefers-color-scheme: dark)").matches)));
    document.documentElement.classList.toggle("dark", d);
  }, [defaultTheme]);
  function toggle() {
    const d = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", d);
    setDark(d);
    localStorage.setItem("theme", d ? "dark" : "light");
  }
  const links = (
    <>
      <Link href="/" onClick={() => setOpen(false)}>
        الرئيسية
      </Link>
      {categories.map((c) => (
        <Link
          key={c.id}
          href={"/categories/" + c.slug}
          onClick={() => setOpen(false)}
        >
          {c.name}
        </Link>
      ))}
      <Link href="/about" onClick={() => setOpen(false)}>
        حول ما يسطرون
      </Link>
    </>
  );
  return (
    <header className="masthead">
      <div className="wrap header-top">
        <Link href="/" className="brand" aria-label="ما يسطرون — الرئيسية">
          {logo && (
            <Image
              src={`/api/v1/media/${logo}?variant=thumbnail`}
              width={48}
              height={48}
              alt=""
            />
          )}
          {name}
          <small>MAYSTROON</small>
        </Link>
        <span className="edition">
          {description}
          <br />
          اليمن · تعز · ٢٠٢٦
        </span>
        <div className="tools">
          <Link href="/search" className="icon-button" aria-label="البحث">
            <Search size={19} />
          </Link>
          <button
            className="icon-button"
            onClick={toggle}
            aria-label="تبديل الوضع الفاتح والداكن"
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
          <button
            className="icon-button mobile-menu-button"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={19} /> : <Menu size={19} />}
          </button>
        </div>
      </div>
      <nav className="wrap desktop-nav" aria-label="القائمة الرئيسية">
        {menus.some((m) => m.location === "header") ? (
          <PublicMenuTree
            items={menus.filter((m) => m.location === "header")}
          />
        ) : (
          links
        )}
      </nav>
      {menus.some((m) => m.location === "secondary") && (
        <nav className="wrap secondary-nav" aria-label="القائمة الثانوية">
          <PublicMenuTree
            items={menus.filter((m) => m.location === "secondary")}
          />
        </nav>
      )}
      {open && (
        <nav
          id="mobile-navigation"
          className="mobile-nav"
          aria-label="قائمة الهاتف"
        >
          {menus.some((m) => m.location === "mobile") ? (
            <PublicMenuTree
              items={menus.filter((m) => m.location === "mobile")}
            />
          ) : menus.some((m) => m.location === "header") ? (
            <PublicMenuTree
              items={menus.filter((m) => m.location === "header")}
            />
          ) : (
            links
          )}
        </nav>
      )}
    </header>
  );
}
