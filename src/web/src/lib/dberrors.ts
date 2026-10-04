// Drizzle wraps the driver's error, so the MariaDB code is on the cause.
export function isDuplicateEntry(err: unknown): boolean {
  return (err as { cause?: { code?: unknown } } | null)?.cause?.code === "ER_DUP_ENTRY";
}
