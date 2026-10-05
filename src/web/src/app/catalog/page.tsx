import { permanentRedirect } from "next/navigation";
import { searchOf } from "@/lib/rules";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(`/catalogue${searchOf(await searchParams)}`);
}
