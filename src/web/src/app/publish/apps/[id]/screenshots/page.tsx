import { AppTabs, loadOwnApp } from "../AppTabs";
import { ScreenshotSlots } from "../ScreenshotSlots";

export default async function ScreenshotsPage({ params }: { params: Promise<{ id: string }> }) {
  const { app } = await loadOwnApp(params);
  return (
    <>
      <AppTabs app={app} active="screenshots" />
      <ScreenshotSlots appId={app.id} screenshots={app.screenshots} />
    </>
  );
}
