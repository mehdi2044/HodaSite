"use server";
// These authenticated CRM pages read uncached data. EngagementForm refreshes
// after the action result arrives; including an RSC refresh in this response
// can keep useActionState pending on the page render.
import { runAction } from "@/lib/action-result";
import {
  setPreference,
  requestPrivacy,
  transitionPrivacy,
  unsubscribeEmail,
} from "@/modules/crm";
export async function preferenceAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await setPreference({
      marketId: f.get("marketId"),
      channel: f.get("channel"),
      status: f.get("status"),
    });
  });
}
export async function requestAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await requestPrivacy({ marketId: f.get("marketId"), kind: f.get("kind") });
  });
}
export async function cancelRequestAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await transitionPrivacy(
      {
        id: f.get("id"),
        marketId: f.get("marketId"),
        version: Number(f.get("version")),
        status: "CANCELLED",
      },
      true,
    );
  });
}
export async function unsubscribeAction(_: unknown, f: FormData) {
  return runAction(async () => {
    await unsubscribeEmail(f.get("token"));
  });
}
