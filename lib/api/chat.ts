import { ApiError, BASE_URL, authHeaders, openApiClient } from "./client";
import type { ChatLoadState } from "./types";
import { EMPTY_CHAT_RESPONSE, type ChatStreamEvent } from "../chat-data";

export const loadChat = async (): Promise<ChatLoadState> => {
  const headers = await authHeaders();

  if (!headers.Authorization) {
    return {
      data: EMPTY_CHAT_RESPONSE,
      source: "empty",
      message: "로그인 세션이 연결되면 이전 대화를 불러옵니다.",
    };
  }

  try {
    const { data, error, response } = await openApiClient.GET("/me/chat", {
      headers,
    });
    if (error || !data) {
      throw new ApiError((response as Response).status, error ?? {});
    }
    return { data, source: "api" };
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `이전 대화를 불러오지 못했어요. (${error.status})`
        : "대화 서버에 연결할 수 없어요.";
    return {
      data: EMPTY_CHAT_RESPONSE,
      source: "empty",
      message,
    };
  }
};

/**
 * SSE 스트리밍 — POST /me/chat/messages/stream.
 * EventSource는 GET만 지원하므로 fetch + ReadableStream 직접 파싱.
 * 콜백으로 token/done/error를 흘려보낸다.
 */
export const streamChatMessage = async (
  content: string,
  callbacks: {
    onToken: (text: string) => void;
    onDone: (event: Extract<ChatStreamEvent, { type: "done" }>["data"]) => void;
    onError: (message: string, status: number | null) => void;
  },
  signal?: AbortSignal,
): Promise<void> => {
  const headers = await authHeaders();
  if (!headers.Authorization) {
    callbacks.onError("로그인 세션이 연결되어야 메시지를 보낼 수 있어요.", 401);
    return;
  }

  let response: Response;
  try {
    response = await measuredFetch(`${BASE_URL}/me/chat/messages/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...headers,
      },
      body: JSON.stringify({ content }),
      signal,
    });
  } catch {
    callbacks.onError("대화 서버에 연결할 수 없어요.", null);
    return;
  }

  if (!response.ok || !response.body) {
    callbacks.onError(
      `메시지 전송에 실패했어요. (${response.status})`,
      response.status,
    );
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 이벤트는 \n\n로 구분
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const raw of events) {
        const parsed = parseSseEvent(raw);
        if (!parsed) continue;
        if (parsed.type === "token") {
          callbacks.onToken((parsed.data as { text: string }).text);
        } else if (parsed.type === "done") {
          callbacks.onDone(
            parsed.data as Extract<ChatStreamEvent, { type: "done" }>["data"],
          );
        } else if (parsed.type === "error") {
          callbacks.onError(
            (parsed.data as { message: string }).message,
            response.status,
          );
        }
      }
    }
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") return;
    callbacks.onError("스트림이 끊겼어요. 다시 시도해 주세요.", null);
  }
};

function parseSseEvent(raw: string): { type: string; data: unknown } | null {
  let type = "message";
  let data = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event: ")) {
      type = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      // 동일 이벤트에 data 라인이 여러 개일 수도 있으나 우리 서버는 한 줄.
      data = line.slice(6);
    }
  }
  if (!data) return null;
  try {
    return { type, data: JSON.parse(data) };
  } catch {
    return null;
  }
}

export const deleteChat = async (): Promise<{ ok: boolean }> => {
  const headers = await authHeaders();
  if (!headers.Authorization) return { ok: false };
  try {
    const { response } = await openApiClient.DELETE("/me/chat", { headers });
    return { ok: response.ok };
  } catch {
    return { ok: false };
  }
};
import { measuredFetch } from "../performance";
