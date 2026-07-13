export const DEFAULT_TIMEZONE = "Asia/Hong_Kong";

type DateParts = { year: number; month: number; day: number };

function partsInTimezone(value: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function businessDate(value = new Date(), timezone = DEFAULT_TIMEZONE) {
  const { year, month, day } = partsInTimezone(value, timezone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function utcForFamilyDate(dateKey: string, timezone = DEFAULT_TIMEZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(localAsUtc));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const representedAsUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
  return new Date(localAsUtc - (representedAsUtc - localAsUtc));
}

export function addDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function weekdayForDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekBounds(dateKey: string) {
  const day = weekdayForDateKey(dateKey);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = addDays(dateKey, mondayOffset);
  return { start, end: addDays(start, 6) };
}

export function formatFamilyDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function sumLedger(items: Array<{ amount: number }>) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

export function longestStreak(dateKeys: string[]) {
  const unique = [...new Set(dateKeys)].sort();
  let longest = 0;
  let current = 0;
  let previous = "";
  for (const date of unique) {
    current = previous && addDays(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

export function isStableHabit(weekly: Array<{ planned: number; completed: number }>) {
  if (weekly.length < 4) return false;
  return weekly.slice(-4).every(({ planned, completed }) => planned >= 3 && completed / planned >= 0.8);
}

export function clampInt(value: unknown, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}
