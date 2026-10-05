import Link from "next/link";
import { permanentRedirect } from "next/navigation";
import { publicAppIdByAlias } from "@/lib/catalogue";
import { searchOf } from "@/lib/rules";
import { requireRegistration } from "@/lib/session";

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
  return (
    <>
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
