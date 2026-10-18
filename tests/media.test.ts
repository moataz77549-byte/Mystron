import { vi, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import sharp from "sharp";
import { imageMagic, processImage } from "@/lib/media";
it("decodes actual bytes and refuses spoofed executable content", async () => {
  expect(imageMagic(Buffer.from("<svg><script>bad</script></svg>"))).toBeNull();
  await expect(
    processImage(Buffer.from([255, 216, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
  ).rejects.toThrow();
  await expect(processImage(Buffer.alloc(6 * 1024 * 1024))).rejects.toThrow(
    "INVALID_IMAGE",
  );
});
it("creates optimized WebP derivatives and applies rotation/crop without changing source", async () => {
  const input = await sharp({
    create: { width: 800, height: 600, channels: 3, background: "#267E81" },
  })
    .png()
    .toBuffer();
  const saved = Buffer.from(input);
  const result = await processImage(input, {
    left: 0,
    top: 0,
    width: 600,
    height: 400,
    rotation: 90,
    output_width: 300,
    output_height: 200,
  });
  expect(result.width).toBe(300);
  expect(result.height).toBe(200);
  expect(result.mime).toBe("image/webp");
  expect(imageMagic(result.variants.social)).toBe("webp");
  expect((await sharp(result.variants.social).metadata()).width).toBe(1200);
  expect(input.equals(saved)).toBe(true);
  await expect(
    processImage(input, {
      left: 999,
      top: 0,
      width: 20,
      height: 20,
      rotation: 0,
      output_width: 100,
      output_height: 100,
    }),
  ).rejects.toThrow("INVALID_CROP");
});
it("preserves animated GIF and explicitly rejects cropping animation", async () => {
  const input = await sharp(
    Buffer.from([...Array(12).fill(255), ...Array(12).fill(0)]),
    { raw: { width: 2, height: 4, pageHeight: 2, channels: 3 } },
  )
    .gif({ delay: [100, 100], loop: 0 })
    .toBuffer();
  const r = await processImage(input);
  expect(r.animated).toBe(true);
  expect(r.original.equals(input)).toBe(true);
  await expect(
    processImage(input, {
      left: 0,
      top: 0,
      width: 2,
      height: 2,
      rotation: 0,
      output_width: 64,
      output_height: 64,
    }),
  ).rejects.toThrow("ANIMATED_CROP_UNSUPPORTED");
});
