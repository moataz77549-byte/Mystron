/** Only an opaque hex color can reach public inline presentation styles. */
export function categoryAccent(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#267E81";
}
