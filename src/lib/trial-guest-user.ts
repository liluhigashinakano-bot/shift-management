import crypto from "crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";

/** 体入1件につき1 User（一覧・ログイン対象外フラグ付き） */
export async function createTrialGuestUser(name: string, storeId: string) {
  const email = `trial-${crypto.randomUUID()}@trialguest.invalid`;
  const passwordHash = hashSync(crypto.randomUUID(), 10);
  return prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role: "cast",
      storeId,
      isTrialGuest: true,
    },
    select: { id: true, name: true },
  });
}
