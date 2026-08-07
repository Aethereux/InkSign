const ORDINALS = ["Signs first", "Signs second", "Signs third", "Signs fourth", "Signs fifth"];
const SHORT = ["1st", "2nd", "3rd", "4th", "5th"];

export const ordinal = (i: number) => ORDINALS[i] ?? `Signs ${i + 1}th`;
export const short = (i: number) => SHORT[i] ?? `${i + 1}th`;

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v: string) => EMAIL.test(v.trim());

export const humanSize = (bytes: number) =>
  bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Relative time, re-rendered on a 1s tick. The absolute value goes in a title attribute. */
export function relative(at: string | null, now: number): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - new Date(at).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return m === 1 ? "1 minute ago" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return h === 1 ? "1 hour ago" : `${h} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const absolute = (at: string) =>
  `${new Date(at).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} · ${at}`;

/** The API returns relative URLs so it stays correct on any host. */
export const absoluteUrl = (path: string) => `${location.origin}${path}`;
