"use server";
import { previewSegment } from "@/modules/crm";
import { ZodError } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/modules/access";
export async function segmentPreviewAction(
  marketId: string,
  definition: unknown,
  page: number,
) {
  try {
    return {
      ok: true as const,
      ...(await previewSegment(marketId, definition, page)),
    };
  } catch (e) {
    if (
      e instanceof ZodError ||
      e instanceof ForbiddenError ||
      e instanceof UnauthorizedError
    )
      return { ok: false as const };
    throw e;
  }
}
