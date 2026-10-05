import { publicAppIdByName } from "@/lib/catalogue";

// Temporary: an alias can move to another app.
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const id = await publicAppIdByName((await params).name);
  if (!id) {
    return new Response(null, { status: 404 });
  }
  return new Response(null, { status: 307, headers: { Location: `/catalogue/${id}` } });
}
