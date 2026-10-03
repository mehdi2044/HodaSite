import { NextResponse } from "next/server";
import { exportPersonalData } from "@/modules/crm";
import { UnauthorizedError, ForbiddenError } from "@/modules/access";
import { ZodError } from "zod";
const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const data = await exportPersonalData(
      (await params).id,
      Number(new URL(request.url).searchParams.get("page") ?? 0),
    );
    return NextResponse.json(data, {
      headers: {
        ...privateHeaders,
        "Content-Disposition": 'attachment; filename="personal-data.json"',
      },
    });
  } catch (e) {
    if (
      e instanceof UnauthorizedError ||
      e instanceof ForbiddenError ||
      e instanceof ZodError
    )
      return new NextResponse(null, {
        status: e instanceof UnauthorizedError ? 401 : 404,
        headers: privateHeaders,
      });
    throw e;
  }
}
