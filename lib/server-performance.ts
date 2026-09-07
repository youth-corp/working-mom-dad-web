/** Server-only operational logs: no cookies, tokens, IDs or response bodies. */
export async function measureServer<T>(
  name: string,
  run: (
    record: (requestId: string | null, status: number) => void,
  ) => Promise<T>,
): Promise<T> {
  if (process.env.PERFORMANCE_ENABLED !== "true") return run(() => {});
  const started = performance.now();
  let requestId: string | null = null;
  let status: number | null = null;
  let ok = false;
  try {
    const result = await run((id, responseStatus) => {
      requestId = id;
      status = responseStatus;
    });
    ok = status === null || status < 400;
    return result;
  } finally {
    try {
      console.info(
        JSON.stringify({
          event: "web_server_performance",
          schema_version: 1,
          name,
          duration_ms: performance.now() - started,
          ok,
          status,
          request_id: requestId,
          web_release:
            process.env.NEXT_PUBLIC_PERFORMANCE_RELEASE ||
            process.env.VERCEL_GIT_COMMIT_SHA ||
            "unknown",
          environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
        }),
      );
    } catch {
      /* Never affect authentication when the log sink fails. */
    }
  }
}
