import { notFound } from "next/navigation";
import { ownAppView, parseAppId, type OwnAppView } from "@/lib/apps";
import { requirePublisher } from "@/lib/session";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { SectionMenu } from "../../../SectionMenu";

export type AppTab = "releases" | "depends" | "screenshots" | "details" | "delete";

export async function loadOwnApp(
  params: Promise<{ id: string }>,
): Promise<{ user: { id: string; username: string }; app: OwnAppView }> {
  const id = parseAppId((await params).id);
  if (!id) {
    notFound();
  }
  const user = await requirePublisher();
  const app = await ownAppView(user.id, id);
  if (!app) {
    notFound();
  }
  return { user, app };
}

export function AppTabs({ app, active }: { app: OwnAppView; active: AppTab }) {
  const base = `/publish/apps/${app.id}`;
  return (
    <>
      <Breadcrumbs items={[{ label: "Your apps", href: "/publish" }, { label: app.title }]} />
      <h1 className="h3 mb-4">
        {app.title} <code className="fs-6 ms-1">{app.id}</code>
      </h1>
      <SectionMenu
        id="app-tabs"
        item="app-tab"
        label="App"
        active={active}
        sections={[
          { href: base, key: "releases", label: "Releases" },
          { href: `${base}/depends`, key: "depends", label: "Dependencies" },
          { href: `${base}/screenshots`, key: "screenshots", label: "Screenshots" },
          { href: `${base}/details`, key: "details", label: "Details" },
          { href: `${base}/delete`, key: "delete", label: "Delete" },
        ]}
      />
    </>
  );
}
