import { z } from "zod";
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const asset = z.uuid().nullable();
export const identitySchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(500),
    footer: z.string().max(500),
    logo_asset_id: asset,
    favicon_asset_id: asset,
    og_asset_id: asset,
    palette: z
      .object({
        navy: color,
        gold: color,
        ivory: color,
        teal: color,
        burgundy: color,
      })
      .strict(),
    dark_palette: z
      .object({
        background: color,
        foreground: color,
        surface: color,
        muted: color,
        border: color,
      })
      .strict(),
    font: z.enum(["IBM Plex Sans Arabic", "Noto Naskh Arabic"]),
    default_theme: z.enum(["system", "light", "dark"]),
    socials: z
      .array(
        z
          .object({
            label: z.string().min(1).max(50),
            url: z.url().refine((v) => /^https:\/\//i.test(v)),
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export const homeSection = z
  .object({
    id: z.uuid(),
    type: z.enum([
      "hero",
      "featured",
      "latest",
      "popular",
      "category",
      "manual",
    ]),
    title: z.string().max(100),
    description: z.string().max(500).optional(),
    enabled: z.boolean(),
    hide_empty: z.boolean(),
    limit: z.number().int().min(1).max(24),
    category_id: asset.optional(),
    post_ids: z.array(z.uuid()).max(24).optional(),
  })
  .strict();
export const homeSchema = z
  .object({ sections: z.array(homeSection).max(20) })
  .strict();
export const publishingSchema = z
  .object({
    default_comments: z.boolean(),
    comments_close_days: z.number().int().min(0).max(3650),
    timezone: z.literal("Asia/Aden"),
    default_visibility: z.enum(["public", "private"]),
    view_retention_days: z.literal(30),
  })
  .strict();
export const commentsSchema = z
  .object({
    enabled: z.boolean(),
    pre_moderation: z.boolean(),
    replies: z.boolean(),
    max_depth: z.number().int().min(0).max(3),
    limit: z.number().int().min(1).max(30),
    window_seconds: z.number().int().min(60).max(3600),
    blocked_words: z.array(z.string().min(1).max(80)).max(100),
    blocked_emails: z.array(z.email()).max(100),
  })
  .strict();
export const seoSchema = z
  .object({
    title_suffix: z.string().max(80),
    description: z.string().max(500),
  })
  .strict();
export const securitySchema = z
  .object({
    session_max_age_minutes: z.number().int().min(5).max(10080),
    event_retention_days: z.number().int().min(30).max(365),
    audit_retention_days: z.number().int().min(90).max(3650),
  })
  .strict();
export const maintenanceSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().min(1).max(500),
    until: z.iso.datetime().nullable(),
  })
  .strict();
export const mediaPolicySchema = z
  .object({
    max_upload_bytes: z.number().int().min(262144).max(5242880),
    allow_gif: z.boolean(),
    webp_quality: z.number().int().min(40).max(95),
  })
  .strict();
export const settingSchemas = {
  media: mediaPolicySchema,
  identity: identitySchema,
  home: homeSchema,
  publishing: publishingSchema,
  comments: commentsSchema,
  seo: seoSchema,
  security: securitySchema,
  maintenance: maintenanceSchema,
};
export type SettingKey = keyof typeof settingSchemas;
export const settingDefaults = {
  media: { max_upload_bytes: 5242880, allow_gif: true, webp_quality: 82 },
  identity: {
    name: "ما يسطرون",
    description: "مساحة للمعرفة والحكاية",
    footer: "© معتز العلقمي — اليمن، تعز — 2026م.",
    logo_asset_id: null,
    favicon_asset_id: null,
    og_asset_id: null,
    palette: {
      navy: "#111D31",
      gold: "#D5A96A",
      ivory: "#F7F3EB",
      teal: "#267E81",
      burgundy: "#8F4D52",
    },
    dark_palette: {
      background: "#101926",
      foreground: "#F7F3EB",
      surface: "#172437",
      muted: "#BDC6D1",
      border: "#354255",
    },
    font: "IBM Plex Sans Arabic",
    default_theme: "system",
    socials: [],
  },
  home: {
    sections: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        type: "hero",
        title: "لكلّ فكرةٍ سطر، ولكلّ سطرٍ أفق.",
        description:
          "في ما يسطرون نقرأ العالم من زوايا متعددة، ونمنح المعرفة والحكاية مساحة تستحقها.",
        enabled: true,
        hide_empty: false,
        limit: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        type: "featured",
        title: "اختيار التحرير",
        enabled: true,
        hide_empty: true,
        limit: 1,
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        type: "latest",
        title: "أحدث ما سُطّر",
        enabled: true,
        hide_empty: false,
        limit: 12,
      },
      {
        id: "00000000-0000-4000-8000-000000000004",
        type: "popular",
        title: "الأكثر قراءة هذا الأسبوع",
        enabled: true,
        hide_empty: true,
        limit: 3,
      },
    ],
  },
  publishing: {
    default_comments: true,
    comments_close_days: 30,
    timezone: "Asia/Aden",
    default_visibility: "public",
    view_retention_days: 30,
  },
  comments: {
    enabled: true,
    pre_moderation: true,
    replies: true,
    max_depth: 3,
    limit: 5,
    window_seconds: 60,
    blocked_words: [],
    blocked_emails: [],
  },
  seo: {
    title_suffix: "ما يسطرون",
    description: "مساحة عربية للمعرفة والثقافة والحياة.",
  },
  security: {
    session_max_age_minutes: 480,
    event_retention_days: 90,
    audit_retention_days: 365,
  },
  maintenance: {
    enabled: false,
    message: "نُجري صيانة مؤقتة للمنصة. نعود إليكم قريباً.",
    until: null,
  },
} as const;
export function parseSetting(key: SettingKey, value: unknown) {
  return settingSchemas[key].parse(value);
}
