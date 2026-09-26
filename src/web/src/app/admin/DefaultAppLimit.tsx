import Link from "next/link";
import { AppLimit } from "../AppLimit";

export function DefaultAppLimit({ limit }: { limit: number | null }) {
  return (
    <Link href="/admin/settings">
      <AppLimit limit={limit} />
    </Link>
  );
}
