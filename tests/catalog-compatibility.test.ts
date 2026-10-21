import { expect, it, vi } from "vitest";
import { compatibleCatalogRead } from "../src/lib/editorial/catalog-compatibility";
it("reads new metadata without retry and falls back only for the missing additive field", async () => {
  const modern = vi.fn().mockResolvedValue({
    data: [{ name: "قسم", color: "#267E81" }],
    error: null,
  });
  expect(await compatibleCatalogRead("name,color", "color", modern)).toEqual([
    { name: "قسم", color: "#267E81" },
  ]);
  expect(modern).toHaveBeenCalledTimes(1);
  const legacy = vi
    .fn()
    .mockResolvedValueOnce({
      data: null,
      error: {
        code: "42703",
        message: "column categories.color does not exist",
      },
    })
    .mockResolvedValueOnce({ data: [{ name: "قسم" }], error: null });
  expect(await compatibleCatalogRead("name,color", "color", legacy)).toEqual([
    { name: "قسم" },
  ]);
  expect(legacy.mock.calls).toEqual([["name,color"], ["name"]]);
  const author = vi
    .fn()
    .mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST204", message: "Could not find specialty column" },
    })
    .mockResolvedValueOnce({ data: null, error: null });
  expect(
    await compatibleCatalogRead("id,specialty", "specialty", author),
  ).toBeNull();
  expect(author.mock.calls).toEqual([["id,specialty"], ["id"]]);
});
it("never suppresses authorization failures, unrelated missing columns or failed legacy queries", async () => {
  for (const error of [
    { code: "42501", message: "permission denied" },
    { code: "42703", message: "column missing_identity does not exist" },
  ]) {
    const read = vi.fn().mockResolvedValue({ data: null, error });
    await expect(
      compatibleCatalogRead("id,specialty", "specialty", read),
    ).rejects.toEqual(error);
    expect(read).toHaveBeenCalledTimes(1);
  }
  const unavailable = { code: "08006", message: "database unavailable" };
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      data: null,
      error: { code: "42703", message: "column specialty does not exist" },
    })
    .mockResolvedValueOnce({ data: null, error: unavailable });
  await expect(
    compatibleCatalogRead("id,specialty", "specialty", read),
  ).rejects.toEqual(unavailable);
});
