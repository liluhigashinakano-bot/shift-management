import crypto from "crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";

export const TRIAL_GUEST_NAME_MAX_LEN = 60;

/** 体入モーダル用。空・長すぎは例外。 */
export function parseTrialGuestName(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) throw new Error("EMPTY");
  if (s.length > TRIAL_GUEST_NAME_MAX_LEN) throw new Error("LONG");
  return s;
}

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
