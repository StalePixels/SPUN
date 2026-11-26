import { redirect } from "next/navigation";
import { appScreenshots } from "@/lib/screenshots";
import { ScreenshotSlots } from "../../../../publish/apps/[id]/ScreenshotSlots";
import { clearAdminScreenshot, uploadAdminScreenshot } from "../../../actions";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";

export default async function AdminScreenshotsPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  if (app.deletedAt) {
    redirect(`/admin/apps/${app.id}`);
  }
  const screenshots = await appScreenshots(app.id);
  return (
    <>
      <AdminAppTabs app={app} active="screenshots" />
      <ScreenshotSlots
        appId={app.id}
        screenshots={screenshots}
        upload={(slot) => uploadAdminScreenshot.bind(null, app.id, slot)}
        clear={(slot) => clearAdminScreenshot.bind(null, app.id, slot)}
      />
    </>
  );
}
