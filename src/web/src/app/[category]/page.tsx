import { notFound, permanentRedirect } from "next/navigation";
import { liveCategory } from "@/lib/categories";
import { searchOf } from "@/lib/rules";

// Category pages were at /<slug> before the catalogue moved.
export default async function OldCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const category = await liveCategory((await params).category);
  if (!category) {
    notFound();
  }
  permanentRedirect(`/catalogue/${category.slug}${searchOf(await searchParams)}`);
}
