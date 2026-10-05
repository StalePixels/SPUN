import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { publicAppIdByAlias } from "@/lib/catalogue";
import { liveFeature } from "@/lib/featured";
import { searchOf } from "@/lib/rules";
import { mainScreenshots } from "@/lib/screenshots";
import { requireRegistration } from "@/lib/session";
import { Screenshot } from "./Screenshot";

// The catalogue was here before it moved: its old URLs had a search or a page.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.q !== undefined || params.page !== undefined) {
    permanentRedirect(`/catalogue${searchOf(params)}`);
  }
  await requireRegistration();
  const spun = await publicAppIdByAlias("spun");
  const feature = await liveFeature();
  const shot = feature ? (await mainScreenshots([feature.appId])).get(feature.appId) : undefined;
  return (
    <>
      {feature && (
        <div className="row g-4 align-items-center mb-4" data-testid="hero">
          <div className="col-md-6">
            {shot ? (
              <Screenshot
                url={shot.url}
                width={shot.width}
                scale={2}
                alt={`${feature.title}, main screenshot`}
                testId="hero-screenshot"
              />
            ) : (
              <Screenshot url="/placeholder.png" width={320} scale={2} alt="SPUN" testId="hero-placeholder" />
            )}
          </div>
          <div className="col-md-6">
            <h2 data-testid="hero-title">{feature.title}</h2>
            <div data-testid="hero-article" dangerouslySetInnerHTML={{ __html: feature.articleHtml }} />
            <Link href="/catalogue/featured" className="btn btn-primary" data-testid="hero-link">
              <i className="bi bi-arrow-right me-1" />
              View the app
            </Link>
          </div>
        </div>
      )}
      {spun && (
        <div className="card mb-4" data-testid="get-spun">
          <div className="card-body">
            <a href={`/catalogue/${spun}/download`} className="btn btn-primary mb-2" data-testid="get-spun-download" download>
              <i className="bi bi-download me-1" />
              Download the SPUN zip
            </a>
            <p className="mb-0" data-testid="get-spun-nbnget">
              On the Next, you can also run <code>.nbnget /dot/spun : ../spun get spun</code>. It downloads the SPUN
              dot command from the NBN CDN into the current directory, then runs it to install SPUN with SPUN.
            </p>
          </div>
        </div>
      )}
      <p>
        <Link href="/catalogue" className="btn btn-primary" data-testid="home-catalogue">
          <i className="bi bi-grid me-1" />
          Browse the catalogue
        </Link>
      </p>
    </>
  );
}
