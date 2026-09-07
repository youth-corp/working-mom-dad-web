"use client";

import { ArrowUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app/app-header";
import {
  AssistantBubble,
  AssistantMessage,
  EmptyState,
  LoadingBubble,
  StreamingBubble,
  UserBubble,
} from "@/components/chat/message-bubbles";
import { useChatTypewriter } from "@/hooks/use-chat-typewriter";
import { track } from "@/lib/analytics";
import { useScreenPerformance } from "@/hooks/use-screen-performance";
import { loadChat, streamChatMessage } from "@/lib/api";
import {
  assistantHasRenderableContent,
  INITIAL_VISIBLE_MESSAGES,
  QUICK_REPLIES,
  type ChatMessage as ChatMessageDto,
  type ChatMessageCard,
} from "@/lib/chat-data";

// React Compiler가 컴포넌트 본문 안의 Date.now() 호출을 impure render hazard로 잡아서
// 모듈 스코프 헬퍼로 분리. analytics latency 측정 전용.
function nowMs(): number {
  return Date.now();
}

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [historySource, setHistorySource] = useState<
    "pending" | "api" | "error"
  >("pending");
  useScreenPerformance("/chat", historySource);
  // 콜드 진입 시 접어둔 과거 메시지 (한 번 펼치면 비워짐)
  const hiddenHistoryRef = useRef<ChatMessageDto[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const suppressScrollRef = useRef(false);
  const idRef = useRef(0);
  // onDone에서 받은 최종 메시지 데이터 — 타자기 애니메이션 완료 시 커밋에 사용
  const pendingDoneRef = useRef<{
    messageId: string;
    cards: ChatMessageCard[];
    sources: ChatMessageDto["sources"];
  } | null>(null);
  const sentAtRef = useRef(0);
  const pendingContentRef = useRef("");

  const onTurnComplete = useCallback(() => {
    const done = pendingDoneRef.current;
    pendingDoneRef.current = null;
    // 서버 최종 본문이 비었거나 누출뿐이고 카드도 없으면 빈 말풍선이 되므로 커밋하지 않는다.
    if (
      done &&
      assistantHasRenderableContent(pendingContentRef.current, done.cards)
    ) {
      setMessages((prev) => [
        ...prev,
        {
          id: done.messageId,
          role: "assistant",
          content: pendingContentRef.current,
          sentAt: new Date().toISOString(),
          cards: done.cards,
          sources: done.sources,
        },
      ]);
    }
    setBusy(false);
  }, []);

  const typewriter = useChatTypewriter(onTurnComplete);

  useEffect(() => {
    track({ type: "chat_open" });
    let active = true;
    void loadChat().then((state) => {
      if (!active) return;
      setHistorySource(state.source === "api" ? "api" : "error");
      // 과거에 빈/누출뿐인 채로 저장된 어시스턴트 메시지는 빈 말풍선이 되므로 걸러낸다.
      const incoming = state.data.messages.filter(
        (m) =>
          m.role !== "assistant" ||
          assistantHasRenderableContent(m.content, m.cards),
      );
      // 콜드 진입 — 최근 N개만 노출, 나머지는 접어둠 (스크롤 점프 최소화)
      if (incoming.length > INITIAL_VISIBLE_MESSAGES) {
        hiddenHistoryRef.current = incoming.slice(
          0,
          incoming.length - INITIAL_VISIBLE_MESSAGES,
        );
        setHiddenCount(hiddenHistoryRef.current.length);
        setMessages(incoming.slice(-INITIAL_VISIBLE_MESSAGES));
      } else {
        setMessages(incoming);
      }
      if (state.source === "empty" && state.message) {
        setErrorBanner(state.message);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (suppressScrollRef.current) {
      suppressScrollRef.current = false;
      return;
    }
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typewriter.live]);

  const revealHistory = () => {
    suppressScrollRef.current = true; // 과거를 위로 펼칠 때는 바닥으로 점프 X
    setMessages((prev) => [...hiddenHistoryRef.current, ...prev]);
    hiddenHistoryRef.current = [];
    setHiddenCount(0);
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;

    const optimisticUserId = `local-u-${++idRef.current}`;

    setMessages((prev) => [
      ...prev,
      {
        id: optimisticUserId,
        role: "user",
        content: text,
        sentAt: new Date().toISOString(),
        cards: [],
        sources: [],
      },
    ]);
    setInput("");
    setBusy(true);
    setErrorBanner(null);
    typewriter.begin();
    pendingContentRef.current = "";
    track({ type: "chat_message_send", length: text.length });

    sentAtRef.current = nowMs();
    let firstTokenLogged = false;

    await streamChatMessage(text, {
      onToken: (chunk) => {
        if (!firstTokenLogged) {
          firstTokenLogged = true;
          track({
            type: "chat_response_first_token",
            latencyMs: nowMs() - sentAtRef.current,
          });
        }
        pendingContentRef.current += chunk;
        typewriter.pushToken(chunk);
      },
      onDone: (payload) => {
        track({
          type: "chat_response_complete",
          latencyMs: nowMs() - sentAtRef.current,
          cardCount: payload.cards.length,
          sourceCount: payload.sources.length,
        });
        // 서버 최종 본문으로 동기화 (스트림 청크 합과 동일하지만 안전하게)
        pendingContentRef.current = payload.content;
        pendingDoneRef.current = {
          messageId: payload.messageId,
          cards: payload.cards,
          sources: payload.sources,
        };
        typewriter.end();
      },
      onError: (message) => {
        track({ type: "chat_response_error", reason: message });
        typewriter.cancel();
        pendingDoneRef.current = null;
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUserId));
        setErrorBanner(message);
        setBusy(false);
      },
    });
  };

  const isEmpty =
    messages.length === 0 && !typewriter.live && hiddenCount === 0;

  // 진행 중인 assistant 턴 — 노출 끝난 단락 + (타이핑 | 단락 사이 점)
  const live = typewriter.live;
  const showLiveDots =
    !!live &&
    (live.phase === "loading" ||
      live.phase === "interlude" ||
      (live.phase === "typing" && live.typingText.length === 0));
  const liveBubbles = live ? (
    <>
      {live.committedParas.map((para, i) => (
        <AssistantBubble key={`live-${i}`} content={para} cards={[]} />
      ))}
      {showLiveDots ? (
        <LoadingBubble />
      ) : (
        <StreamingBubble text={live.typingText} />
      )}
    </>
  ) : null;

  return (
    <div className="flex h-dvh flex-col bg-gray-20">
      <AppHeader title="Ai 챗봇" onBack={() => router.back()} />

      <p className="shrink-0 px-5 py-3 text-center text-[13px] font-medium leading-[1.4] tracking-[0.2522px] text-[#667080]">
        사용자의 행동 데이터와 패턴을 기반으로 대화합니다.
      </p>

      {errorBanner ? (
        <div className="shrink-0 px-5 pb-2">
          <p className="rounded-xl bg-error-50 px-4 py-2 text-xs leading-5 text-error-600">
            {errorBanner}
          </p>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        aria-live="polite"
      >
        {isEmpty ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col">
            {hiddenCount > 0 ? (
              <div className="flex justify-center px-5 py-3">
                <button
                  type="button"
                  onClick={revealHistory}
                  className="rounded-full bg-gray-50 px-4 py-2 text-xs font-medium leading-[1.4] text-gray-600"
                >
                  이전 대화 {hiddenCount}개 더보기
                </button>
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <UserBubble key={m.id} content={m.content} />
              ) : (
                <AssistantMessage
                  key={m.id}
                  content={m.content}
                  cards={m.cards}
                  sources={m.sources}
                />
              ),
            )}

            {liveBubbles}
          </div>
        )}
      </div>

      <div className="shrink-0 overflow-x-auto px-5 pt-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-1.5">
          {QUICK_REPLIES.map((label) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              onClick={() => {
                track({ type: "chat_quick_reply_use", label });
                void send(label);
              }}
              className="shrink-0 whitespace-nowrap rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium leading-[1.4] text-gray-700 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="flex items-center justify-between gap-2 rounded-[48px] bg-white px-5 py-3.5 shadow-[0px_4px_24px_0px_rgba(0,0,0,0.04),0px_4px_24px_0px_rgba(0,0,0,0.04)]"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="궁금한 점을 입력해주세요."
            disabled={busy}
            className="flex-1 bg-transparent text-sm leading-[1.4] text-gray-800 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="전송"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:bg-gray-300"
          >
            <ArrowUp className="size-5" strokeWidth={2.5} />
          </button>
        </form>
      </div>
    </div>
  );
}
