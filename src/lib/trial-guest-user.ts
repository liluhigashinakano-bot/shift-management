import crypto from "crypto";
import { hashSync } from "bcryptjs";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/** 体入1件につき1 User（一覧・ログイン対象外フラグ付き） */
export async function createTrialGuestUser(
  name: string,
  storeId: string,
  client: Prisma.TransactionClient = prisma,
) {
  const email = `trial-${crypto.randomUUID()}@trialguest.invalid`;
  const passwordHash = hashSync(crypto.randomUUID(), 10);
  return client.user.create({
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

/**
 * 体入がどの日にも載っていなければ、利用者の行も消す。
 *
 * 体入は 1 回の追加につき 1 人ぶん作られる。シフト表から消しても行が残ると、
 * 使わない利用者が溜まり続ける。
 */
export async function deleteTrialGuestIfUnused(
  castId: string,
  client: Prisma.TransactionClient = prisma,
): Promise<boolean> {
  const cast = await client.user.findUnique({
    where: { id: castId },
    select: { id: true, isTrialGuest: true },
  });
  if (!cast?.isTrialGuest) return false;

  const remaining = await client.shiftSlot.count({ where: { castId } });
  if (remaining > 0) return false;

  await client.shiftAdjustment.deleteMany({ where: { castId } });
  await client.shiftRequest.deleteMany({ where: { castId } });
  await client.user.delete({ where: { id: castId } });
  return true;
}
