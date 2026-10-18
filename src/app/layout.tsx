import { FloatingAssistant } from "@/components/ai/launcher";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/noto-naskh-arabic/700.css";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Header } from "@/components/header";
import { publicAdvertisements } from "@/lib/control/advertisements";
import { Advertisements } from "@/components/control/advertisements";
import { publicConfiguration } from "@/lib/control/settings-service";
import { publicMenus } from "@/lib/control/navigation";
import { PublicMenuTree } from "@/components/control/public-menu";
import { homeData, publicSettings } from "@/lib/content";
import { siteUrl, databaseConfigured } from "@/lib/env";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, configuration, menus, advertisements] = await Promise.all([
    homeData(),
    publicConfiguration(),
    publicMenus(),
    publicAdvertisements(),
  ]);
  const identity = configuration.identity;
  let socials: { label: string; url: string }[] = [];
  if (databaseConfigured()) {
    try {
      const settings = await publicSettings();
      const value = settings.find((s) => s.key === "social_links")?.value;
      if (Array.isArray(value))
        socials = value.filter(
          (v): v is { label: string; url: string } =>
            typeof v?.label === "string" &&
            typeof v?.url === "string" &&
            v.url.startsWith("https://"),
        );
    } catch {}
  }
  if (identity.socials.length) socials = identity.socials;
  const variables = {
    "--navy": identity.palette.navy,
    "--gold": identity.palette.gold,
    "--ivory": identity.palette.ivory,
    "--teal": identity.palette.teal,
    "--burgundy": identity.palette.burgundy,
    "--brand-background": identity.palette.ivory,
    "--brand-foreground": identity.palette.navy,
    ...Object.fromEntries(
      Object.entries(identity.dark_palette).map(([k, v]) => ["--dark-" + k, v]),
    ),
  } as React.CSSProperties;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        style={{
          ...variables,
          fontFamily: `"${identity.font}", Tahoma, Arial, sans-serif`,
        }}
      >
        <a className="skip" href="#main">
          انتقل إلى المحتوى
        </a>
        <Header
          categories={data.categories}
          menus={menus}
          name={identity.name}
          description={identity.description}
          logo={identity.logo_asset_id}
          defaultTheme={identity.default_theme}
        />
        <main id="main" className="wrap">
          <Advertisements items={advertisements} placement="top" />
          {children}
        </main>
        <footer className="footer">
          <div className="wrap">
            <Advertisements items={advertisements} placement="footer" />
            <div className="footer-top">
              <div>
                <Link href="/" className="brand">
                  {identity.name}
                </Link>
                <p>{identity.description}</p>
              </div>
              <nav className="footer-links" aria-label="روابط التذييل">
                {menus.some((m) => m.location === "footer") ? (
                  <PublicMenuTree
                    items={menus.filter((m) => m.location === "footer")}
                  />
                ) : (
                  data.categories.map((c) => (
                    <Link key={c.id} href={"/categories/" + c.slug}>
                      {c.name}
                    </Link>
                  ))
                )}
                <Link href="/about">حول ما يسطرون</Link>
                <Link href="/privacy">سياسة الخصوصية</Link>
                {socials.map((s) => (
                  <a key={s.url} href={s.url} rel="noopener noreferrer">
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
            <p className="copyright">{identity.footer}</p>
          </div>
        </footer>
        {process.env.AI_ENABLED === "true" && <FloatingAssistant />}
      </body>
    </html>
  );
}
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { identity, seo } = await publicConfiguration();
  return {
    metadataBase: siteUrl(),
    title: {
      default: identity.name + " | " + identity.description,
      template: "%s | " + seo.title_suffix,
    },
    description: seo.description,
    icons: identity.favicon_asset_id
      ? { icon: "/api/v1/media/" + identity.favicon_asset_id }
      : undefined,
    openGraph: {
      locale: "ar_YE",
      type: "website",
      siteName: identity.name,
      ...(identity.og_asset_id
        ? {
            images: [
              {
                url:
                  "/api/v1/media/" + identity.og_asset_id + "?variant=social",
              },
            ],
          }
        : {}),
    },
    twitter: { card: "summary_large_image" },
  };
}
