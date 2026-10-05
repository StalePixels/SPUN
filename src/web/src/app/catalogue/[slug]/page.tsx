import { notFound, redirect } from "next/navigation";
import { parseAppId } from "@/lib/apps";
import { liveFeature } from "@/lib/featured";
import { FEATURED, parsePage, parseQuery } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";
import { Catalogue } from "../../Catalogue";
import { AppPage } from "./AppPage";

// An app id, featured and a category slug never clash (checkCategorySlug).
export default async function CatalogueEntry({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  await requireRegistration();
  const { slug } = await params;
  if (slug === FEATURED) {
    const feature = await liveFeature();
    if (!feature) {
      notFound();
    }
    redirect(`/catalogue/${feature.appId}`);
  }
  if (parseAppId(slug)) {
    return <AppPage id={slug} />;
  }
  const { page, q } = await searchParams;
  return <Catalogue slug={slug} page={parsePage(page)} query={parseQuery(q)} />;
}
