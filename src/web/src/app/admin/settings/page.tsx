import { adminAppLimitSetting, requireAdmin } from "@/lib/admin";
import { Breadcrumbs } from "../../Breadcrumbs";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  await requireAdmin();
  const appLimit = await adminAppLimitSetting();
  return (
    <>
      <Breadcrumbs items={[{ label: "Admin", href: "/admin" }, { label: "Settings" }]} />
      <h1 className="h3 mb-3">Settings</h1>
      <div className="card mb-4">
        <div className="card-body">
          <SettingsForm
            appLimit={appLimit?.value ?? ""}
            appLimitHelp={appLimit?.description ?? ""}
          />
        </div>
      </div>
    </>
  );
}
