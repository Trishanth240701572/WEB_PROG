export const TIMEZONE = "Asia/Kolkata";
// A local calendar key is never round-tripped through a browser-local Date.
export function addDays(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}
export function localToday(serverTime = new Date().toISOString()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(serverTime));
}
export function mondayFor(key) {
  const [y, m, d] = key.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return addDays(key, -(day === 0 ? 6 : day - 1));
}
export function formatDate(key, options = {}) {
  if (!key) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(`${key}T12:00:00Z`));
}
export function weekLabel(week) {
  return `${formatDate(week)} – ${formatDate(addDays(week, 4), { year: "numeric" })}`;
}
export function formatTime(iso) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
export function dateTime(iso) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}
export function labName(lab) {
  return lab === "lab-a"
    ? "Lab A"
    : lab === "lab-b"
      ? "Lab B"
      : "All laboratories";
}
export const hoursFor = (slot) =>
  (new Date(slot.endsAt) - new Date(slot.startsAt)) / 3600000;
export const statusLabel = (status) =>
  ({
    awaiting_colleague: "Awaiting colleague",
    awaiting_supervisor: "Awaiting supervisor",
    approved: "Approved",
    declined: "Declined",
    rejected: "Rejected",
    withdrawn: "Withdrawn",
    expired: "Expired",
    invalidated: "Invalidated",
    draft: "Draft",
    published: "Published",
  })[status] || status;
export const isPending = (status) =>
  ["awaiting_colleague", "awaiting_supervisor"].includes(status);
export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
