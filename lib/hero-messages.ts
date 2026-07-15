import { AppError } from "@/lib/errors";
import type { HeroMessage } from "@/lib/contracts";

export const DEFAULT_HERO_MESSAGES: HeroMessage[] = [
  { title: "今天也有自己的节奏", subtitle: "先完成眼前这一件。" },
  { title: "把今天的小目标拿下吧", subtitle: "一步一步来，就很了不起。" },
  { title: "准备好开始了吗？", subtitle: "完成任务，收好今天的星币。" }
];

export function parseHeroMessages(value: string | null | undefined): HeroMessage[] {
  if (!value) return DEFAULT_HERO_MESSAGES;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return DEFAULT_HERO_MESSAGES;
    const messages = parsed.filter((item): item is HeroMessage =>
      Boolean(item && typeof item.title === "string" && typeof item.subtitle === "string")
    );
    return messages.length ? messages.slice(0, 8) : DEFAULT_HERO_MESSAGES;
  } catch {
    return DEFAULT_HERO_MESSAGES;
  }
}

export function serializeHeroMessages(value: unknown): string {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
    throw new AppError("INVALID_HERO_MESSAGES", "首页文案需要保留 1 至 8 组。", 400);
  }
  const messages = value.map((item) => {
    if (!item || typeof item !== "object") throw new AppError("INVALID_HERO_MESSAGES", "首页文案格式不正确。", 400);
    const title = String((item as Record<string, unknown>).title ?? "").trim();
    const subtitle = String((item as Record<string, unknown>).subtitle ?? "").trim();
    if (!title || title.length > 36 || subtitle.length > 60) {
      throw new AppError("INVALID_HERO_MESSAGES", "标题需要 1–36 字，副标题最多 60 字。", 400);
    }
    return { title, subtitle };
  });
  return JSON.stringify(messages);
}

export function personalizeHeroMessage(message: HeroMessage, nickname: string): HeroMessage {
  return { ...message, title: message.title.replaceAll("{nickname}", nickname) };
}
