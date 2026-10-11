/** Unusable responses after a single completed HTTP dispatch; no network or paid service. */
export const unusableFittingResponses = [
  { name: "malformed JSON", response: () => new Response("{") },
  { name: "missing image", response: () => new Response("{}") },
  {
    name: "invalid base64",
    response: () =>
      new Response(JSON.stringify({ data: [{ b64_json: "%invalid%" }] })),
  },
  { name: "empty body", response: () => new Response(null) },
  {
    name: "oversized body",
    response: () => new Response(new Uint8Array(24 * 1024 * 1024 + 1)),
  },
  {
    name: "interrupted successful body",
    response: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("fixture interrupted body"));
          },
        }),
      ),
  },
  {
    name: "rejected HTTP with failed body cleanup",
    response: () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("fixture cleanup failure"));
          },
        }),
        { status: 400 },
      ),
  },
] as const;
