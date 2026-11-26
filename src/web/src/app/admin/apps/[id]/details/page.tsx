import { appCategoryList, liveCategories } from "@/lib/categories";
import { formatMinCore } from "@/lib/mincore";
import { AppForm } from "../../../../AppForm";
import { saveAdminApp } from "../../../actions";
import { AdminAppTabs, loadAdminApp } from "../AdminAppTabs";

export default async function AdminDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const app = await loadAdminApp(params);
  const categories = await liveCategories();
  const selected = (await appCategoryList(app.id)).map((category) => category.id);
  return (
    <>
      <AdminAppTabs app={app} active="details" />
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-pencil me-1" />
          App details
        </div>
        <div className="card-body">
          <AppForm
            app={{
              id: app.id,
              title: app.title,
              description: app.description,
              installDir: app.installDir,
              minCore: formatMinCore(app.minCore),
              visibility: app.visibility,
            }}
            categories={categories}
            selected={selected}
            save={saveAdminApp.bind(null, app.id)}
          />
        </div>
      </div>
    </>
  );
}
