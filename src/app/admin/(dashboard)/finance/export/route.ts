import { ZodError } from "zod";
import { getTranslations } from "next-intl/server";
import { financeReport, reportCsv, csvColumns } from "@/modules/finance";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const q = new URL(request.url).searchParams;
    // Duplicate filters are rejected, never interpreted differently from the UI.
    const raw = Object.fromEntries(
      ["from", "to", "marketId"].map((k) => [
        k,
        q.getAll(k).length > 1 ? q.getAll(k) : (q.get(k) ?? undefined),
      ]),
    );
    const report = await financeReport(raw),
      t = await getTranslations("finance");
    return new Response(
      reportCsv(
        report.rows,
        report.markets,
        report.filter,
        csvColumns.map((k) => t(k)),
      ),
      {
        headers: {
          ...headers,
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="finance-report.csv"',
        },
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError)
      return new Response(null, { status: 401, headers });
    if (error instanceof ForbiddenError)
      return new Response(null, { status: 403, headers });
    if (
      error instanceof ZodError ||
      (error instanceof Error && error.message === "INVALID_REPORT_PERIOD")
    )
      return new Response(null, { status: 400, headers });
    throw error;
  }
}
