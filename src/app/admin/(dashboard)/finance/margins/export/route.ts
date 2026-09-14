import { ZodError } from "zod";
import { getTranslations, getLocale } from "next-intl/server";
import { marginReport } from "@/modules/finance/margins";
import { financeWorkbook, tableCsv } from "@/modules/finance/xlsx";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const q = new URL(request.url).searchParams;
    if (
      [...q.keys()].some((k) => q.getAll(k).length !== 1) ||
      !["csv", "xlsx"].includes(q.get("format") ?? "csv")
    )
      return new Response(null, { status: 400, headers });
    const report = await marginReport(
      Object.fromEntries(
        ["from", "to", "marketId"].map((k) => [k, q.get(k) ?? undefined]),
      ),
      q.get("dimension") ?? "order",
    );
    const t = await getTranslations("financeOps"),
      locale = await getLocale();
    const columns = [
      "key",
      "revenueTry",
      "revenueUsd",
      "costTry",
      "costUsd",
      "expenseTry",
      "expenseUsd",
      "grossTry",
      "grossUsd",
      "contributionTry",
      "contributionUsd",
      "marginPercent",
    ] as const;
    const rows = [
      columns.map((k) => t(k)),
      ...report.rows.map((r) => columns.map((k) => String(r[k] ?? ""))),
    ];
    const xlsx = q.get("format") === "xlsx";
    return new Response(
      xlsx
        ? new Uint8Array(financeWorkbook(rows, locale === "fa"))
        : tableCsv(rows),
      {
        headers: {
          ...headers,
          "Content-Type": xlsx
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="margins.${xlsx ? "xlsx" : "csv"}"`,
        },
      },
    );
  } catch (e) {
    if (e instanceof UnauthorizedError)
      return new Response(null, { status: 401, headers });
    if (e instanceof ForbiddenError)
      return new Response(null, { status: 403, headers });
    if (
      e instanceof ZodError ||
      (e instanceof Error &&
        ["INVALID_REPORT_PERIOD", "EXPORT_TOO_LARGE"].includes(e.message))
    )
      return new Response(null, { status: 400, headers });
    throw e;
  }
}
