import { permanentRedirect } from "next/navigation";
import { searchOf } from "@/lib/rules";

export default async function CatalogCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  permanentRedirect(`/catalogue/${encodeURIComponent((await params).category)}${searchOf(await searchParams)}`);
}
