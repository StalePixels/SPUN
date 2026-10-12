import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { parseAppId } from "@/lib/apps";
import { appView } from "@/lib/catalogue";
import { liveFeature } from "@/lib/featured";
import { FEATURED, parsePage, parseQuery } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";
import { Catalogue } from "../../Catalogue";
import { AppPage } from "./AppPage";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const view = await appView((await params).slug);
  if (!view) {
    return {};
  }
  const { app, screenshots } = view;
  const title = `${app.title} - SPUN`;
  const description = app.description ?? undefined;
  const main = screenshots.find((shot) => shot.slot === 1);
  return {
    title,
    description,
    openGraph: { title, description, images: [main?.url ?? "/placeholder.png"] },
    twitter: { card: "summary", title, description },
  };
}

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
