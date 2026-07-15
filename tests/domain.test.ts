import { describe, expect, it } from "vitest";
import { addDays, businessDate, isStableHabit, longestStreak, sumLedger, utcForFamilyDate, weekBounds } from "../lib/domain";
import { hashPin, verifyPin, backupChecksum } from "../lib/security";

describe("family date rules", () => {
  it("uses the configured timezone across midnight", () => {
    expect(businessDate(new Date("2026-07-13T15:59:59Z"), "Asia/Hong_Kong")).toBe("2026-07-13");
    expect(businessDate(new Date("2026-07-13T16:00:00Z"), "Asia/Hong_Kong")).toBe("2026-07-14");
  });

  it("defines Monday through Sunday as one week", () => {
    expect(weekBounds("2026-07-12")).toEqual({ start: "2026-07-06", end: "2026-07-12" });
    expect(weekBounds("2026-07-13")).toEqual({ start: "2026-07-13", end: "2026-07-19" });
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("converts a family calendar boundary to the correct UTC instant", () => {
    expect(utcForFamilyDate("2026-07-14", "Asia/Hong_Kong").toISOString()).toBe("2026-07-13T16:00:00.000Z");
    expect(utcForFamilyDate("2026-01-15", "America/New_York").toISOString()).toBe("2026-01-15T05:00:00.000Z");
  });
});

describe("habit and ledger rules", () => {
  it("calculates streaks without counting duplicate dates", () => {
    expect(longestStreak(["2026-07-10", "2026-07-11", "2026-07-11", "2026-07-13"])).toBe(2);
  });

  it("requires four stable weeks, three planned items, and 80 percent", () => {
    expect(isStableHabit(Array.from({ length: 4 }, () => ({ planned: 5, completed: 4 })))).toBe(true);
    expect(isStableHabit(Array.from({ length: 4 }, () => ({ planned: 2, completed: 2 })))).toBe(false);
    expect(isStableHabit(Array.from({ length: 3 }, () => ({ planned: 5, completed: 5 })))).toBe(false);
  });

  it("derives balance only from ledger entries", () => {
    expect(sumLedger([{ amount: 5 }, { amount: 3 }, { amount: -6 }, { amount: 6 }])).toBe(8);
  });
});

describe("security helpers", () => {
  it("hashes PINs with a salt and verifies them", async () => {
    const value = await hashPin("2468");
    expect(value.hash).not.toContain("2468");
    await expect(verifyPin("2468", value.salt, value.hash)).resolves.toBe(true);
    await expect(verifyPin("0000", value.salt, value.hash)).resolves.toBe(false);
  });

  it("produces stable backup checksums", () => {
    expect(backupChecksum({ a: 1 })).toBe(backupChecksum({ a: 1 }));
    expect(backupChecksum({ a: 1 })).not.toBe(backupChecksum({ a: 2 }));
  });
});
