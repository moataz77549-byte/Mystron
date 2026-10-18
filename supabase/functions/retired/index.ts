// Retired Fadhkur endpoints: no imports, no environment access, no external calls.
Deno.serve(
  () =>
    new Response(JSON.stringify({ error: { code: "FUNCTION_RETIRED" } }), {
      status: 410,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    }),
);
