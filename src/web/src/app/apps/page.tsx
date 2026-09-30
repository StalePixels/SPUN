import { parsePage, parseQuery } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";
import { Catalogue } from "../Catalogue";

// The apps category has its own page because the app pages share its folder.
export default async function AppsCategory({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  await requireRegistration();
  const { page, q } = await searchParams;
  return <Catalogue slug="apps" page={parsePage(page)} query={parseQuery(q)} />;
}
