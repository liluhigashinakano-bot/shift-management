import assert from "node:assert/strict";
import {
  displaySlotForClockOut,
  findShiftRequestByDate,
  findShiftRequestByDayId,
  hideEndCastNameForWishEnd29,
  toUtcDateKey,
} from "./shift-utils";

function slotsForRange(castId: string, start: number, endExclusive: number) {
  const out: { timeSlot: number; castId: string }[] = [];
  for (let t = start; t < endExclusive; t += 0.5) {
    out.push({ timeSlot: t, castId });
  }
  return out;
}

// 25:00 終了 … 最後のスロット 24.5（24:30–25:00）→ 表示 25.0 行
{
  const day = slotsForRange("c1", 20, 25);
  assert.equal(displaySlotForClockOut(day, "c1"), 25);
}

// 25:30 終了 … 最後のスロット 25.0（25:00–25:30）→ 表示 25.5 行（:30）、25.0 行ではない
{
  const day = slotsForRange("c1", 20, 25.5);
  assert.equal(displaySlotForClockOut(day, "c1"), 25.5);
}

// 20:30 終了 … 最後 20.0 → 20.5 行
{
  const day = slotsForRange("c1", 20, 20.5);
  assert.equal(displaySlotForClockOut(day, "c1"), 20.5);
}

assert.equal(displaySlotForClockOut([], "x"), null);

// hideEndCastNameForWishEnd29: 希望29:00 かつ 実退勤も29:00 の場合のみ非表示
// 希望29:00、実退勤29:00 → 非表示（変更なし）
assert.equal(hideEndCastNameForWishEnd29(29, 29), true);
// 希望29:00、実退勤27:00（カット） → 表示（変更を示すため）
assert.equal(hideEndCastNameForWishEnd29(29, 27), false);
// 希望29:00、実退勤25:30（カット） → 表示
assert.equal(hideEndCastNameForWishEnd29(29, 25.5), false);
// 希望27:00、実退勤27:00 → 表示（そもそも29:00ルールの対象外）
assert.equal(hideEndCastNameForWishEnd29(27, 27), false);
// 希望25:00、実退勤29:00（延長） → 表示（希望が29:00ではない）
assert.equal(hideEndCastNameForWishEnd29(25, 29), false);

// ==========================================================================
// toUtcDateKey
// ==========================================================================
// Date オブジェクト（UTC 0:00）はそのまま YYYY-MM-DD に。
assert.equal(
  toUtcDateKey(new Date("2026-04-08T00:00:00.000Z")),
  "2026-04-08",
);
// ISO 文字列（UTC 0:00）→ 同じ
assert.equal(toUtcDateKey("2026-04-08T00:00:00.000Z"), "2026-04-08");
// 既に YYYY-MM-DD 形式
assert.equal(toUtcDateKey("2026-04-08"), "2026-04-08");
// JST 表現の ISO（"2026-04-08T15:00:00.000Z" は UTC で 4/8 だがアプリでは保存しない想定）→
// 関数仕様としてはそのまま UTC 暦日を返す
assert.equal(toUtcDateKey("2026-04-07T15:00:00.000Z"), "2026-04-07");

// ==========================================================================
// findShiftRequestByDayId — dayId 完全一致
// ==========================================================================
{
  const requests = [
    { castId: "kana", dayId: "day-1", startTime: 22, endTime: 29 },
    { castId: "kana", dayId: "day-10", startTime: 19, endTime: 25 },
    { castId: "yuno", dayId: "day-1", startTime: 20, endTime: 27 },
  ];

  // 同一キャスト・dayId 完全一致 → ヒット
  const found = findShiftRequestByDayId(requests, "kana", "day-1");
  assert.equal(found?.startTime, 22);
  assert.equal(found?.endTime, 29);

  // dayId が違う → 別レコードを返す（部分一致 "day-1" が "day-10" にもマッチするバグが無いこと）
  const found10 = findShiftRequestByDayId(requests, "kana", "day-10");
  assert.equal(found10?.startTime, 19);
  assert.equal(found10?.endTime, 25);

  // castId 不一致 → undefined
  assert.equal(findShiftRequestByDayId(requests, "rina", "day-1"), undefined);

  // dayId が存在しない → undefined
  assert.equal(findShiftRequestByDayId(requests, "kana", "day-99"), undefined);

  // requests 未提供（undefined）→ undefined
  assert.equal(findShiftRequestByDayId(undefined, "kana", "day-1"), undefined);

  // dayId が null のレコードは絶対にマッチしない
  const reqsWithNull = [{ castId: "kana", dayId: null }];
  assert.equal(findShiftRequestByDayId(reqsWithNull, "kana", "day-1"), undefined);
}

// ==========================================================================
// findShiftRequestByDate — UTC 日付キーで完全一致
// ==========================================================================
{
  const requests = [
    { castId: "kana", date: "2026-04-01T00:00:00.000Z", startTime: 22, endTime: 29 },
    { castId: "kana", date: "2026-04-10T00:00:00.000Z", startTime: 19, endTime: 25 },
    { castId: "kana", date: "2026-04-11T00:00:00.000Z", startTime: 20, endTime: 27 },
    { castId: "yuno", date: "2026-04-01T00:00:00.000Z", startTime: 20, endTime: 27 },
  ];

  // 4/1 を引いた時に 4/10 や 4/11 にひっかからない（旧 dayLabel.includes("4/1") バグの再発防止）
  const found1 = findShiftRequestByDate(requests, "kana", "2026-04-01");
  assert.equal(found1?.startTime, 22);
  assert.equal(found1?.endTime, 29);

  // 4/10 を引いた時に 4/1 が先にマッチしない（同じく部分一致バグ防止）
  const found10 = findShiftRequestByDate(requests, "kana", "2026-04-10");
  assert.equal(found10?.startTime, 19);
  assert.equal(found10?.endTime, 25);

  // 4/11 のレコードを 4/1 と取り違えないこと
  const found11 = findShiftRequestByDate(requests, "kana", "2026-04-11");
  assert.equal(found11?.startTime, 20);
  assert.equal(found11?.endTime, 27);

  // Date オブジェクトを渡してもキーは UTC 暦日として扱われる
  const foundByDate = findShiftRequestByDate(
    requests,
    "kana",
    new Date("2026-04-01T00:00:00.000Z"),
  );
  assert.equal(foundByDate?.startTime, 22);

  // castId が違う同日 → そのキャストのレコードを返す
  const yunoFound = findShiftRequestByDate(requests, "yuno", "2026-04-01");
  assert.equal(yunoFound?.startTime, 20);

  // どの日付にも該当無し → undefined
  assert.equal(
    findShiftRequestByDate(requests, "kana", "2026-04-30"),
    undefined,
  );

  // requests 未提供 → undefined
  assert.equal(findShiftRequestByDate(undefined, "kana", "2026-04-01"), undefined);
}

console.log(
  "shift-utils (displaySlotForClockOut + hideEndCastNameForWishEnd29 + date helpers): 30 patterns OK",
);
