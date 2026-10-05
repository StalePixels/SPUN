"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function formatTime(iso: string, timeZone: "UTC" | undefined): string {
  const format = new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const parts = Object.fromEntries(format.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}${timeZone ? " UTC" : ""}`;
}

// The server does not know the browser's time zone, so it renders UTC until hydration.
export function LocalTime({ iso, testId }: { iso: string; testId?: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => formatTime(iso, undefined),
    () => formatTime(iso, "UTC"),
  );
  return (
    <time dateTime={iso} data-testid={testId}>
      {text}
    </time>
  );
}
