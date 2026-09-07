export type PerformanceFields = Record<string, string | number | boolean>;
export type EmitPerformance = (name: string, fields: PerformanceFields) => void;
export type DataSource = "pending" | "api" | "cache" | "demo" | "error";

/** Only static allowlisted segments leave the device. Never IDs or query strings. */
const safeSegments = new Set([
  "home",
  "me",
  "mission",
  "missions",
  "current",
  "executions",
  "start",
  "pause",
  "resume",
  "complete",
  "feedback",
  "restart",
  "roadmap",
  "milestones",
  "completion",
  "chat",
  "messages",
  "stream",
  "weekly-report",
  "weekly-reports",
  "reports",
  "unviewed",
  "viewed",
  "notifications",
  "read",
  "read-all",
  "mood",
  "children",
  "auth",
  "session-ready",
  "mobile-entry",
  "onboarding",
  "intro",
  "timer",
]);
export function safeRoute(value: string): string {
  try {
    const path = new URL(value, "https://local.invalid").pathname;
    return path
      .split("/")
      .map((part) => (part === "" || safeSegments.has(part) ? part : ":id"))
      .join("/");
  } catch {
    return "__unknown__";
  }
}

/** One navigation, with distinct first-content and successful freshness milestones. */
export class ScreenTiming {
  private first = false;
  private fresh = false;
  private ended = false;
  constructor(
    readonly route: string,
    readonly started: number,
    readonly id: string,
    private emit: EmitPerformance,
    readonly trigger: "document" | "tab" | "mount",
  ) {}
  data(source: DataSource, now: number, visible: boolean) {
    if (this.ended || source === "pending") return;
    const fields = {
      route: this.route,
      journey_id: this.id,
      duration_ms: Math.max(0, now - this.started),
      trigger: this.trigger,
      visible,
    };
    if (source === "error" || source === "demo") {
      this.emit("screen_outcome", { ...fields, outcome: source });
      this.ended = true;
      return;
    }
    if (!this.first) {
      this.first = true;
      this.emit("screen_first_data", { ...fields, source });
    }
    if (source === "api" && !this.fresh) {
      this.fresh = true;
      this.ended = true;
      this.emit("screen_fresh_data", { ...fields, source });
    }
  }
  abandon(now: number) {
    if (this.ended) return;
    this.ended = true;
    this.emit("screen_outcome", {
      route: this.route,
      journey_id: this.id,
      duration_ms: Math.max(0, now - this.started),
      trigger: this.trigger,
      outcome: "abandoned",
    });
  }
}
