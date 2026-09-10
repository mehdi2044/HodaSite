import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    adminSessionId?: string;
    sessionVersion?: number;
    enrollmentOnly?: boolean;
    user: { id: string } & DefaultSession["user"];
  }
}
