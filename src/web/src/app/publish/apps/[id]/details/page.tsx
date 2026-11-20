import { liveCategories } from "@/lib/categories";
import { AppForm } from "../../../../AppForm";
import { AppTabs, loadOwnApp } from "../AppTabs";

export default async function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { app } = await loadOwnApp(params);
  const categories = await liveCategories();
  return (
    <>
      <AppTabs app={app} active="details" />
      <AppForm app={app} categories={categories} selected={app.categories} />
    </>
  );
}
