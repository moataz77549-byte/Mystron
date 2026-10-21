// Additive display metadata must not make existing public catalogs unavailable
// during a code-before-schema rollout. Never hide other database failures.
type CatalogError = { code?: string; message: string };
export async function compatibleCatalogRead<T>(
  fields: string,
  optionalColumn: "color" | "specialty",
  read: (
    fields: string,
  ) => PromiseLike<{ data: T; error: CatalogError | null }>,
): Promise<T> {
  let result = await read(fields);
  if (
    result.error &&
    ["42703", "PGRST204"].includes(result.error.code || "") &&
    result.error.message.includes(optionalColumn)
  ) {
    result = await read(
      fields
        .split(",")
        .filter((field) => field !== optionalColumn)
        .join(","),
    );
  }
  if (result.error) throw result.error;
  return result.data;
}
