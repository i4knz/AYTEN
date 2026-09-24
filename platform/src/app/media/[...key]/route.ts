import { getStorage, isValidKey } from "@/server/storage";

// Serves uploaded media for the local storage driver. Keys are random UUIDs
// and objects are never overwritten, so responses are cached forever.
export async function GET(_req: Request, { params }: RouteContext<"/media/[...key]">) {
  const key = (await params).key.join("/");
  if (!isValidKey(key)) return new Response("Not Found", { status: 404 });
  const object = await getStorage().get(key);
  if (!object) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
