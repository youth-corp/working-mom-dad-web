import createClient from "openapi-fetch";
import { measuredFetch } from "../performance";
import type { paths } from "../generated/api-types";
import { createSupabaseBrowserClient } from "../supabase/client";

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";
export const openApiClient = createClient<paths>({
  baseUrl: BASE_URL,
  fetch: measuredFetch,
});

/**
 * Supabase 브라우저 세션에서 access_token을 꺼내 Authorization 헤더 구성.
 * 서버 컴포넌트/SSR에서는 호출하지 말 것 — 별도 server helper가 필요.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};
  const supabase = createSupabaseBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function request<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, headers, ...rest } = init ?? {};
  const auth = await authHeaders();
  const res = await measuredFetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...auth,
      ...(headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`API ${status}`);
  }
}
