import { parseAppId } from "@/lib/apps";
import { parsePage, parseQuery } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";
import { Catalogue } from "../../Catalogue";
import { AppPage } from "./AppPage";

// An app id and a category slug never have the same form (checkCategorySlug).
export default async function CatalogueEntry({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  await requireRegistration();
  const { slug } = await params;
  if (parseAppId(slug)) {
    return <AppPage id={slug} />;
  }
  const { page, q } = await searchParams;
  return <Catalogue slug={slug} page={parsePage(page)} query={parseQuery(q)} />;
}
