import { parseAppId } from "@/lib/apps";
import { liveReleases, publicApp } from "@/lib/catalogue";
import { releaseFileName } from "@/lib/rules";
import { readRelease, releasePath } from "@/lib/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const id = parseAppId((await params).slug);
  const app = id ? await publicApp(id) : null;
  const latest = id && app ? (await liveReleases(id))[0] : undefined;
  if (!id || !app?.username || !latest) {
    return new Response(null, { status: 404 });
  }
  const data = await readRelease(releasePath(app.username, id, latest.serial));
  if (!data) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${releaseFileName(id, latest.serial)}"`,
      "Content-Length": String(data.length),
    },
  });
}
