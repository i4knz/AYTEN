import { exportCustomersCsv } from "@/server/commerce/customers";
import { AppError } from "@/server/lib/errors";
import { getCurrentSession, getRequestMeta } from "@/server/web";

export async function GET(_req: Request, { params }: RouteContext<"/dashboard/[storeId]/customers/export">) {
  const session = await getCurrentSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { storeId } = await params;
  try {
    const csv = await exportCustomersCsv(session.user.id, storeId, await getRequestMeta());
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    if (err instanceof AppError) return new Response(err.message, { status: err.code === "forbidden" ? 403 : 404 });
    throw err;
  }
}
