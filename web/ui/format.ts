// Numbers and bytes in es-EC format (R39). Bytes use decimal units, as the Free limits do (5 GB = 5,000,000,000).
const numbers = new Intl.NumberFormat("es-EC");
const oneDecimal = new Intl.NumberFormat("es-EC", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export const NO_VALUE = "—";

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_VALUE : numbers.format(value);
}

export function formatBytes(value: number | null | undefined): string {
  if (value === null || value === undefined) return NO_VALUE;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  return `${unit === 0 ? numbers.format(scaled) : oneDecimal.format(scaled)} ${units[unit]}`;
}

export function formatPercent(value: number): string {
  return `${oneDecimal.format(value)} %`;
}

/** Stored days are UTC days named by date only, so they are shown as they are. */
export function formatDay(day: string): string {
  return shortDate.format(new Date(`${day}T00:00:00Z`));
}
