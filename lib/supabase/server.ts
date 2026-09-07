import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { measureServer } from "../server-performance";

/**
 * 라우팅 분기에 필요한 me 최소 필드. 미온보딩 사용자는 name 등이 null이라
 * 클라이언트 응답용 `MeResponse`(types.ts)와 별도로 좁혀서 다룬다.
 */
export type ServerMe = {
  id: string;
  onboardedAt: string | null;
};

function getRequiredPublicApiBaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!value) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is required.");
  }
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component에서 set 불가 — proxy.ts가 갱신 담당
          }
        },
      },
    },
  );
}

/**
 * Server Component에서 도메인 `GET /me`를 호출.
 * 세션 없음 → null. 도메인 row 없음(미온보딩)도 `me.onboardedAt = null`로 응답된다.
 *
 * `cache: "no-store"`라 Next의 fetch 중복 제거가 걸리지 않는다. layout과 page가
 * 같은 렌더에서 각각 호출하면(예: `(main)/layout.tsx` + `(main)/page.tsx`)
 * Render API 왕복이 2번 발생하므로 React `cache()`로 요청 단위 중복을 제거한다.
 */
export const fetchServerMe = cache(
  async function fetchServerMe(): Promise<ServerMe | null> {
    const supabase = await createSupabaseServerClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    return measureServer("server_me", async (record) => {
      const res = await fetch(`${getRequiredPublicApiBaseUrl()}/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      record(res.headers.get("x-request-id"), res.status);
      if (!res.ok) return null;
      return (await res.json()) as ServerMe;
    });
  },
);
