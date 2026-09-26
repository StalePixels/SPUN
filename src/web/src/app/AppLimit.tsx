import { appLimitText } from "@/lib/messages";

export function AppLimit({ limit }: { limit: number | null }) {
  return <>{appLimitText(limit)}</>;
}
