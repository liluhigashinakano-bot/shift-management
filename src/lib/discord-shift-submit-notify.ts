import { prisma } from "@/lib/db";
import { formatTimeSlot } from "@/lib/shift-utils";

const DEFAULT_TARGET_STORE = "東中野";

function halfLabel(half: string): string {
  if (half === "first") return "前半";
  if (half === "second") return "後半";
  return half;
}

function clipContent(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

/** 通知用: 5月20日 */
function formatJapaneseCalendarDay(date: Date): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 変更・削除通知用: 5/20 20:00〜25:30 */
function formatChangeContentLine(date: Date, startTime: number, endTime: number): string {
  const d = new Date(date);
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return `${md} ${formatTimeSlot(startTime)}〜${formatTimeSlot(endTime)}`;
}

type NotifyKind =
  | { kind: "create"; date: Date; startTime: number; endTime: number; notes?: string | null }
  | { kind: "update"; date: Date; startTime: number; endTime: number; notes?: string | null }
  | { kind: "delete"; date: Date; startTime: number; endTime: number }
  | { kind: "bulk"; entries: { date: Date; startTime: number; endTime: number }[] };

/** 店名比較用（全角/半角などを寄せてから trim） */
function norm(s: string | null | undefined): string {
  try {
    return (s ?? "").normalize("NFKC").trim();
  } catch {
    return (s ?? "").trim();
  }
}

function discordNotifyDebug(msg: string, extra?: Record<string, unknown>) {
  if (process.env.DISCORD_SHIFT_NOTIFY_DEBUG !== "1") return;
  console.log("[discord shift notify debug]", msg, extra ?? "");
}

/**
 * 所属店舗が対象（既定: 東中野）のキャストの希望が登録・更新されたとき、
 * DISCORD_SHIFT_SUBMIT_WEBHOOK_URL が設定されていれば Discord へ通知する。
 * 操作者がキャスト本人か管理者かは問わない（希望一覧の代理登録でも飛ばす）。
 * 失敗しても例外は投げない（本処理を壊さない）。
 */
export async function notifyCastShiftSubmitToDiscord(
  castId: string,
  periodId: string,
  detail: NotifyKind,
): Promise<void> {
  const webhookUrl = norm(process.env.DISCORD_SHIFT_SUBMIT_WEBHOOK_URL);
  if (!webhookUrl) {
    discordNotifyDebug("skip: DISCORD_SHIFT_SUBMIT_WEBHOOK_URL empty");
    return;
  }

  const targetStoreName =
    norm(process.env.DISCORD_SHIFT_SUBMIT_STORE_NAME) || DEFAULT_TARGET_STORE;

  try {
    const cast = await prisma.user.findUnique({
      where: { id: castId },
      select: {
        name: true,
        role: true,
        isTrialGuest: true,
        store: { select: { name: true } },
      },
    });
    if (!cast) {
      discordNotifyDebug("skip: cast not found", { castId });
      return;
    }
    if (cast.isTrialGuest) {
      discordNotifyDebug("skip: trial guest", { castId });
      return;
    }
    if (cast.role !== "cast") {
      discordNotifyDebug("skip: user is not role cast", { castId, role: cast.role });
      return;
    }
    const homeStore = norm(cast.store?.name);
    if (!homeStore || homeStore !== norm(targetStoreName)) {
      discordNotifyDebug("skip: home store mismatch", {
        castId,
        homeStore: homeStore || null,
        targetStoreName,
      });
      return;
    }

    const period = await prisma.shiftPeriod.findUnique({
      where: { id: periodId },
      select: {
        year: true,
        month: true,
        half: true,
        store: { select: { name: true } },
      },
    });
    if (!period) {
      discordNotifyDebug("skip: period not found", { periodId });
      return;
    }

    const periodLine = `${period.store.name} ${period.year}年${period.month}月${halfLabel(period.half)}`;

    let content: string;
    if (detail.kind === "bulk") {
      if (detail.entries.length === 0) return;
      const sorted = [...detail.entries].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      const n = sorted.length;
      const addLines = sorted.map((e) => formatShiftAddLine(e.date, e.startTime, e.endTime)).join("、");
      content = [
        "【シフト提出】",
        `キャスト名：${cast.name}（${targetStoreName}所属）が ${n}日分 の希望を登録しました。`,
        `提出先: ${periodLine}`,
        `追加内容：${addLines}`,
      ].join("\n");
    } else {
      if (detail.kind === "create") {
        const notes = detail.notes?.trim();
        const notesLine = notes ? `\n備考：${clipContent(notes, 300)}` : "";
        const addLine = formatShiftAddLine(detail.date, detail.startTime, detail.endTime);
        content = [
          "【シフト提出】",
          `キャスト名：${cast.name}（${targetStoreName}所属）が 1日分 の希望を登録しました。`,
          `提出先: ${periodLine}`,
          `追加内容：${addLine}`,
        ].join("\n");
        content += notesLine;
      } else if (detail.kind === "delete") {
        const changeLine = formatChangeContentLine(detail.date, detail.startTime, detail.endTime);
        content = [
          "【シフト希望変更】",
          `キャスト名：${cast.name}（${targetStoreName}所属）が希望を削除しました。`,
          `提出先: ${periodLine}`,
          `変更内容：${changeLine}`,
        ].join("\n");
      } else {
        const notes = detail.notes?.trim();
        const notesLine = notes ? `\n備考：${clipContent(notes, 300)}` : "";
        const changeLine = formatChangeContentLine(detail.date, detail.startTime, detail.endTime);
        content = [
          "【シフト希望変更】",
          `キャスト名：${cast.name}（${targetStoreName}所属）が希望を更新しました。`,
          `提出先: ${periodLine}`,
          `変更内容：${changeLine}`,
        ].join("\n");
        content += notesLine;
      }
    }

    content = clipContent(content, 1900);

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error(
        "[discord shift notify] webhook failed",
        res.status,
        t.slice(0, 500),
      );
      return;
    }
    console.info("[discord shift notify] sent", {
      castId,
      castName: cast.name,
      periodId,
      kind: detail.kind,
    });
    discordNotifyDebug("sent ok", { castName: cast.name, periodId });
  } catch (e) {
    console.error("[discord shift notify]", e);
  }
}
