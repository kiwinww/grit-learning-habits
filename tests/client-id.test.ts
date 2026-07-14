import { describe, expect, it } from "vitest";
import { createIdempotencyKey, type ClientCryptoSource } from "@/lib/client-id";

describe("createIdempotencyKey", () => {
  it("uses randomUUID when the browser supports it", () => {
    expect(createIdempotencyKey({ randomUUID: () => "native-uuid" })).toBe("native-uuid");
  });

  it("uses getRandomValues when randomUUID is unavailable", () => {
    const source: ClientCryptoSource = {
      getRandomValues(values) {
        values.fill(10);
        return values;
      }
    };

    expect(createIdempotencyKey(source)).toBe(`client-${"0a".repeat(16)}`);
  });

  it("falls back when the crypto object is missing or unusable", () => {
    const first = createIdempotencyKey({});
    const second = createIdempotencyKey({ randomUUID: () => { throw new Error("unsupported"); } });

    expect(first).toMatch(/^client-/);
    expect(second).toMatch(/^client-/);
    expect(second).not.toBe(first);
  });
});
