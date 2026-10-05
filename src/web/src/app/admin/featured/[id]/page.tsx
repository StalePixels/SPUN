import { notFound } from "next/navigation";
import { adminGetFeature, requireAdmin } from "@/lib/admin";
import { liveFeature } from "@/lib/featured";
import { parseFeatureId } from "@/lib/rules";
import { Breadcrumbs } from "../../../Breadcrumbs";
import { saveAdminFeature } from "../../actions";
import { AppState, FeatureStateBadge, featureState } from "../Badges";
import { FeatureForm } from "../FeatureForm";
import { DeleteFeature } from "./DeleteFeature";
import { UnpublishFeature } from "./UnpublishFeature";

export default async function FeaturePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = parseFeatureId((await params).id);
  const feature = id ? await adminGetFeature(id) : undefined;
  if (!feature) {
    notFound();
  }
  const liveId = (await liveFeature())?.id ?? null;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Admin", href: "/admin" },
          { label: "Featured", href: "/admin/featured" },
          { label: feature.title },
        ]}
      />
      <h1 className="h3 mb-3">
        {feature.title} <code className="fs-6 ms-1">{feature.appId}</code> <AppState appPublic={feature.appPublic} />
      </h1>
      <p>
        {feature.publishAt ? (
          <FeatureStateBadge state={featureState(feature, liveId, new Date())} />
        ) : (
          <span className="badge text-bg-light border" data-testid="feature-state" data-state="draft">
            <i className="bi bi-pencil me-1" />
            Draft
          </span>
        )}
      </p>
      <div className="card mb-4">
        <div className="card-body">
          <FeatureForm
            save={saveAdminFeature.bind(null, feature.id)}
            article={feature.article}
            publishAt={feature.publishAt?.toISOString() ?? null}
            published={feature.published}
          />
        </div>
      </div>
      <div className="card border-danger mb-4">
        <div className="card-header text-danger border-danger">
          <i className="bi bi-exclamation-triangle me-1" />
          {feature.published ? "Unpublish or delete" : "Delete"}
        </div>
        <div className="card-body">
          {feature.published && (
            <div className="mb-3">
              <p>An unpublished feature keeps its publish time, so publishing it again puts it back in its place.</p>
              <UnpublishFeature id={feature.id} />
            </div>
          )}
          <DeleteFeature id={feature.id} title={feature.title} />
        </div>
      </div>
    </>
  );
}
