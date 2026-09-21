export function formatMoney(amount: number, currency = "₦"): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${currency}${value.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString("en-NG");
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function toDateInput(date: Date): string {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

/**
 * A receipt number short enough to read down the phone: XP-260921-A14 is the
 * 14th sale of 21 September on till A. The till letter keeps two counters from
 * colliding when a shop runs more than one.
 */
export function buildReceiptNo(deviceId: string, sequence: number, date = new Date()): string {
  const stamp = [
    date.getFullYear().toString().slice(2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");

  // One stable letter per till, derived from its device id.
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let hash = 0;
  for (const char of deviceId) hash = (hash * 31 + char.charCodeAt(0)) % letters.length;
  const till = letters[hash];

  return `XP-${stamp}-${till}${String(sequence).padStart(2, "0")}`;
}


/**
 * A short code for a customer, derived from their id so every till that syncs
 * the same person shows the same code. Two customers called "Joy" are told
 * apart by XC-7F3AK2 against XC-K92DPR. The alphabet drops I, O, 0 and 1,
 * which are the characters people misread copying a code off a receipt.
 *
 * Six characters give about a billion codes: at a few thousand customers a
 * collision is vanishingly unlikely, where four characters would have made one
 * near-certain.
 */
export function customerCodeFor(id: string): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

  // Two independent hashes, so later characters do not trail off into a
  // repeated run once the first has been divided down.
  let left = 0x811c9dc5;
  let right = 0x01000193;
  for (const char of id) {
    const code = char.charCodeAt(0);
    left = Math.imul(left ^ code, 16777619) >>> 0;
    right = Math.imul(right + code, 2654435761) >>> 0;
  }

  let code = "";
  for (let position = 0; position < 6; position += 1) {
    const source = position % 2 === 0 ? left : right;
    code += alphabet[source % alphabet.length];
    if (position % 2 === 0) left = Math.floor(left / alphabet.length) || right;
    else right = Math.floor(right / alphabet.length) || left;
  }
  return `XC-${code}`;
}
