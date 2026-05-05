import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function getRole(session: { user?: { role?: string } } | null): string | undefined {
  return session?.user?.role;
}

function norm(s: string | null | undefined): string {
  try {
    return (s ?? "").normalize("NFKC").trim();
  } catch {
    return (s ?? "").trim();
  }
}

const DEFAULT_TARGET_STORE = "東中野";

/**
 * スタッフのみ。Discord 通知まわりの診断。
 * POST { "type": "pingWebhook" } … Webhook にテスト文を1件送る
 * POST { "type": "checkCast", "castId": "cuid…" } または { "castLoginId": "test001" } … 通知条件を返す
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = getRole(session);
  if (role !== "admin" && role !== "employee") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { type?: string; castId?: string; castLoginId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const targetStoreName =
    norm(process.env.DISCORD_SHIFT_SUBMIT_STORE_NAME) || DEFAULT_TARGET_STORE;
  const webhookUrl = norm(process.env.DISCORD_SHIFT_SUBMIT_WEBHOOK_URL);

  if (body.type === "pingWebhook") {
    if (!webhookUrl) {
      return NextResponse.json({
        ok: false,
        error: "DISCORD_SHIFT_SUBMIT_WEBHOOK_URL がこのサーバーで空です。Railway の Variables が shift-management サービスに付いているか確認してください。",
      });
    }
    const now = new Date().toISOString();
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "【テスト】Webhook 疎通",
            description: `シフト管理アプリからの送信テストです。\n時刻: ${now}`,
            color: 0x5865f2,
            timestamp: now,
            footer: { text: "Discord 左の色付きバーが見えれば embed 経路は正常です" },
          },
        ],
      }),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: `Discord がエラーを返しました (${res.status})`,
          detail: text.slice(0, 300),
        },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      message: "Discord にテストメッセージを送信しました。チャンネルを確認してください。",
    });
  }

  if (body.type === "checkCast") {
    const castLoginId =
      typeof body.castLoginId === "string" ? body.castLoginId.trim() : "";
    const castIdRaw = typeof body.castId === "string" ? body.castId.trim() : "";

    let resolvedUserId: string | null = null;
    if (castLoginId) {
      const u = await prisma.user.findFirst({
        where: {
          castLoginId: { equals: castLoginId, mode: "insensitive" },
        },
        select: { id: true },
      });
      resolvedUserId = u?.id ?? null;
    } else if (castIdRaw) {
      const byId = await prisma.user.findUnique({
        where: { id: castIdRaw },
        select: { id: true },
      });
      if (byId) {
        resolvedUserId = byId.id;
      } else {
        const u = await prisma.user.findFirst({
          where: {
            role: "cast",
            castLoginId: { equals: castIdRaw, mode: "insensitive" },
          },
          select: { id: true },
        });
        resolvedUserId = u?.id ?? null;
      }
    }

    if (!resolvedUserId) {
      return NextResponse.json({
        error: "ユーザーが見つかりません。cuid の castId か castLoginId（例: test001）を指定してください。",
        hint: '{ "type": "checkCast", "castLoginId": "test001" }',
      }, { status: 404 });
    }

    const reasons: string[] = [];
    if (!webhookUrl) {
      reasons.push("環境変数 DISCORD_SHIFT_SUBMIT_WEBHOOK_URL が空（サーバーに未設定）");
    }

    const cast = await prisma.user.findUnique({
      where: { id: resolvedUserId },
      select: {
        id: true,
        name: true,
        castLoginId: true,
        role: true,
        isTrialGuest: true,
        store: { select: { name: true } },
      },
    });

    if (!cast) {
      reasons.push("内部エラー: ID解決後にユーザーが見つかりません");
    } else {
      if (cast.isTrialGuest) reasons.push("体入アカウントのため通知対象外です");
      if (cast.role !== "cast") {
        reasons.push(`role が cast ではありません（現在: ${cast.role}）`);
      }
      const home = norm(cast.store?.name);
      if (!home) {
        reasons.push("所属店舗が未設定です（管理画面でキャストの所属を東中野に設定）");
      } else if (home !== norm(targetStoreName)) {
        reasons.push(
          `所属「${home}」は通知対象店「${targetStoreName}」と一致しません。DISCORD_SHIFT_SUBMIT_STORE_NAME で合わせるか、所属を確認してください。`,
        );
      }
    }

    const wouldNotify = reasons.length === 0;
    return NextResponse.json({
      resolvedUserId,
      webhookConfigured: Boolean(webhookUrl),
      targetStoreName,
      wouldNotify,
      reasons: wouldNotify ? [] : reasons,
      cast: cast
        ? {
            id: cast.id,
            name: cast.name,
            castLoginId: cast.castLoginId,
            role: cast.role,
            isTrialGuest: cast.isTrialGuest,
            homeStore: cast.store?.name ?? null,
          }
        : null,
    });
  }

  return NextResponse.json(
    { error: "Unknown type。type は pingWebhook か checkCast" },
    { status: 400 },
  );
}
