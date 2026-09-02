import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import authConfig from "./config";

const login = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Adapter is unused by the JWT strategy today; kept for the Phase 04
  // customer magic-link / OAuth flow, which writes Account/Session rows.
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (raw) => {
        const parsed = login.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (
          !user?.isActive ||
          !(await bcrypt.compare(parsed.data.password, user.passwordHash))
        )
          return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
