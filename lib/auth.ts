import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { hashToken, newSessionToken, verifyPin } from "@/lib/security";

export const PARENT_COOKIE = "family_parent_session";
const SESSION_MINUTES = 30;

export async function loginParent(pin: string) {
  const family = await prisma.familySetting.findUnique({ where: { id: 1 } });
  if (!family) throw new AppError("NOT_INITIALIZED", "请先完成家庭初始化。", 409);
  const now = new Date();
  if (family.pinLockedUntil && family.pinLockedUntil > now) {
    throw new AppError("PIN_LOCKED", "尝试次数过多，请五分钟后再试。", 429);
  }

  const valid = /^\d{4,6}$/.test(pin) && (await verifyPin(pin, family.parentPinSalt, family.parentPinHash));
  if (!valid) {
    const attempts = family.failedPinAttempts + 1;
    await prisma.familySetting.update({
      where: { id: 1 },
      data: {
        failedPinAttempts: attempts >= 5 ? 0 : attempts,
        pinLockedUntil: attempts >= 5 ? new Date(now.getTime() + 5 * 60_000) : null
      }
    });
    throw new AppError("INVALID_PIN", attempts >= 5 ? "PIN 错误，已暂时锁定五分钟。" : "家长 PIN 不正确。", 401);
  }

  const token = newSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000);
  await prisma.$transaction([
    prisma.familySetting.update({ where: { id: 1 }, data: { failedPinAttempts: 0, pinLockedUntil: null } }),
    prisma.parentSession.create({ data: { tokenHash: hashToken(token), expiresAt } })
  ]);
  const store = await cookies();
  store.set(PARENT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function requireParent({ touch = true }: { touch?: boolean } = {}) {
  const store = await cookies();
  const token = store.get(PARENT_COOKIE)?.value;
  if (!token) throw new AppError("PARENT_AUTH_REQUIRED", "请先输入家长 PIN。", 401);
  const session = await prisma.parentSession.findUnique({ where: { tokenHash: hashToken(token) } });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || session.lastSeenAt <= new Date(now.getTime() - SESSION_MINUTES * 60_000)) {
    store.delete(PARENT_COOKIE);
    throw new AppError("SESSION_EXPIRED", "家长会话已过期，请重新登录。", 401);
  }
  if (touch) {
    await prisma.parentSession.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_MINUTES * 60_000) }
    });
  }
  return session;
}

export async function logoutParent() {
  const store = await cookies();
  const token = store.get(PARENT_COOKIE)?.value;
  if (token) {
    await prisma.parentSession.updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } });
  }
  store.delete(PARENT_COOKIE);
}

export function checkSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (new URL(origin).host !== requestHost) throw new AppError("ORIGIN_MISMATCH", "请求来源校验失败。", 403);
}
