import { savedAppRows } from "@/lib/catalogue";
import { requirePublisher } from "@/lib/session";
import { CatalogueRows } from "../../Catalogue";
import { MeMenu } from "../MeMenu";

export default async function MyApps() {
  const user = await requirePublisher();
  const rows = await savedAppRows(user.id);
  return (
    <>
      <MeMenu active="apps" />
      <h1 className="h3 mb-3" data-testid="my-heading">My Apps</h1>
      {rows.length === 0 ? (
        <p className="text-body-secondary mb-4" data-testid="my-empty">
          No saved apps.
        </p>
      ) : (
        <CatalogueRows rows={rows} />
      )}
    </>
  );
}
