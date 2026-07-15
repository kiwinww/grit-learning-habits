import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export async function hashPin(pin: string, salt = randomBytes(16).toString("hex")) {
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  return { salt, hash: derived.toString("hex") };
}

export async function verifyPin(pin: string, salt: string, expectedHash: string) {
  const derived = (await scrypt(pin, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export function newSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function backupChecksum(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
