export function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function dateKeyToUtcDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function utcDateToKey(date: Date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function addDaysKey(dateKey: string, days: number) {
  const date = dateKeyToUtcDate(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcDateToKey(date);
}

export function startOfWeekKey(dateKey = todayKey()) {
  const date = dateKeyToUtcDate(dateKey);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return utcDateToKey(date);
}

export function weekRange(dateKey = todayKey()) {
  const weekStart = startOfWeekKey(dateKey);
  return {
    weekStart,
    weekEnd: addDaysKey(weekStart, 6),
    weekEndExclusive: addDaysKey(weekStart, 7)
  };
}

export function hongKongDateStart(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+08:00`);
}

export function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
