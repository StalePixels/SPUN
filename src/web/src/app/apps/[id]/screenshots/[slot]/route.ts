import { parseAppId } from "@/lib/apps";
import { parseSlot } from "@/lib/rules";
import { readScreenshotPng } from "@/lib/storage";

// The stored PNG as is. The URL carries ?v=<updated_at>, so it can be cached for good.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; slot: string }> }) {
  const { id: rawId, slot: rawSlot } = await params;
  const id = parseAppId(rawId);
  const slot = parseSlot(rawSlot);
  const data = id && slot ? await readScreenshotPng(id, slot) : null;
  if (!data) {
    return new Response(null, { status: 404 });
  }
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
