import { notFound, permanentRedirect } from "next/navigation";
import { liveCategory } from "@/lib/categories";
import { searchOf } from "@/lib/rules";

// The apps category was at /apps before the catalogue moved; the app pages share this folder.
export default async function OldAppsCategory({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await liveCategory("apps"))) {
    notFound();
  }
  permanentRedirect(`/catalogue/apps${searchOf(await searchParams)}`);
}
