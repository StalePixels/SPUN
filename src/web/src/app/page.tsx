import { parsePage, parseQuery } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";
import { Catalogue } from "./Catalogue";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}) {
  await requireRegistration();
  const { page, q } = await searchParams;
  return <Catalogue slug={null} page={parsePage(page)} query={parseQuery(q)} />;
}
