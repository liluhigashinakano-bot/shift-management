-- Railway staging Postgres 用ダミーデータ
-- 使い方:
-- 1. Railway の staging 環境で Postgres > Database > Query を開く
-- 2. この SQL を丸ごと貼り付けて実行する
-- 3. https://shift-management-staging.up.railway.app/dashboard を再読み込みする
--
-- ログイン:
--   管理者 ID: admin@shift.local / PASS: admin123
--   社員   ID: yoshida, navi, nishiyama / PASS: staff123
--   キャスト ID: りりむ, かのん, ゆの など / PASS: cast123

BEGIN;

-- 店舗
INSERT INTO "Store" ("id", "name", "createdAt")
SELECT 'store_' || md5(v.name), v.name, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('東中野'),
    ('新中野'),
    ('方南町'),
    ('板橋本町'),
    ('目白'),
    ('中村橋'),
    ('久我山')
) AS v(name)
ON CONFLICT ("name") DO UPDATE
SET "name" = EXCLUDED."name";

-- 管理者
INSERT INTO "User" (
  "id", "name", "email", "passwordHash", "role",
  "accessAllStores", "editAllStores", "isTrialGuest", "createdAt"
)
VALUES (
  'admin_shift_local',
  '管理者',
  'admin@shift.local',
  '$2b$10$0hCNeFHyC40zE7b8OHjiOuA9Co/YkMguir7G6cBQlO5ktLq/50FSe',
  'admin',
  true,
  true,
  false,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'admin',
  "accessAllStores" = true,
  "editAllStores" = true,
  "isTrialGuest" = false;

-- 社員
WITH staff_src(name, login_id, email, store_name) AS (
  VALUES
    ('吉田', 'yoshida', 'yoshida@shift.local', '東中野'),
    ('ナビ', 'navi', 'navi@shift.local', '東中野'),
    ('西山', 'nishiyama', 'nishiyama@shift.local', '新中野')
)
INSERT INTO "User" (
  "id", "name", "email", "staffLoginId", "passwordHash", "role",
  "storeId", "accessAllStores", "editAllStores", "isTrialGuest", "createdAt"
)
SELECT
  'staff_' || s.login_id,
  s.name,
  s.email,
  s.login_id,
  '$2b$10$m.JrHzmeB9arlzAsbkWh0.d8iAbVuLYhm72RQQK7SaCz5BCr.Sygy',
  'employee',
  st."id",
  false,
  false,
  false,
  CURRENT_TIMESTAMP
FROM staff_src s
JOIN "Store" st ON st."name" = s.store_name
ON CONFLICT ("email") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "staffLoginId" = EXCLUDED."staffLoginId",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'employee',
  "storeId" = EXCLUDED."storeId",
  "accessAllStores" = false,
  "editAllStores" = false,
  "isTrialGuest" = false;

-- 社員の店舗編集権限
INSERT INTO "UserStoreAssignment" ("userId", "storeId", "canEdit")
SELECT u."id", u."storeId", true
FROM "User" u
WHERE u."staffLoginId" IN ('yoshida', 'navi', 'nishiyama')
  AND u."storeId" IS NOT NULL
ON CONFLICT ("userId", "storeId") DO UPDATE
SET "canEdit" = true;

-- キャスト
WITH cast_src(name, store_name, rate) AS (
  VALUES
    ('りりむ', '東中野', 2000),
    ('かのん', '東中野', 1800),
    ('ゆの', '東中野', 1800),
    ('まい', '東中野', 1700),
    ('みな', '東中野', 1700),
    ('すずな', '東中野', 1800),
    ('ひな', '東中野', 1700),
    ('りく', '東中野', 1700),
    ('ハニ', '東中野', 1700),
    ('いけ', '新中野', 1800),
    ('あき', '新中野', 1700),
    ('ちひろ', '新中野', 1700),
    ('さな', '方南町', 1700),
    ('まゆ', '方南町', 1800),
    ('吉田', '板橋本町', 1900),
    ('山田', '目白', 1800)
)
INSERT INTO "User" (
  "id", "name", "email", "castLoginId", "passwordHash", "role",
  "hourlyRate", "storeId", "accessAllStores", "editAllStores", "isTrialGuest", "createdAt"
)
SELECT
  'cast_' || md5(c.name || ':' || c.store_name),
  c.name,
  c.name || '@cast.local',
  c.name,
  '$2b$10$w0bUwou1BJH.BKjRXTIQ2u85zYTWSOGcYRG89/ieTEX06ARIto6u6',
  'cast',
  c.rate,
  st."id",
  false,
  false,
  false,
  CURRENT_TIMESTAMP
FROM cast_src c
JOIN "Store" st ON st."name" = c.store_name
ON CONFLICT ("email") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "castLoginId" = EXCLUDED."castLoginId",
  "passwordHash" = EXCLUDED."passwordHash",
  "role" = 'cast',
  "hourlyRate" = EXCLUDED."hourlyRate",
  "storeId" = EXCLUDED."storeId",
  "accessAllStores" = false,
  "editAllStores" = false,
  "isTrialGuest" = false;

-- ダッシュボード表示対象の期間（2026年5月後半、2026年6月前半）
WITH period_src(year, month, half) AS (
  VALUES
    (2026, 5, 'second'),
    (2026, 6, 'first')
)
INSERT INTO "ShiftPeriod" (
  "id", "storeId", "year", "month", "half",
  "shiftRequestsLocked", "shiftSlotsLocked", "adjustmentConfirmedPublished", "createdAt"
)
SELECT
  'period_' || md5(st."id" || ':' || p.year::text || ':' || p.month::text || ':' || p.half),
  st."id",
  p.year,
  p.month,
  p.half,
  false,
  false,
  false,
  CURRENT_TIMESTAMP
FROM "Store" st
CROSS JOIN period_src p
ON CONFLICT ("storeId", "year", "month", "half") DO UPDATE
SET
  "shiftRequestsLocked" = false,
  "shiftSlotsLocked" = false,
  "adjustmentConfirmedPublished" = false;

-- 日付行
WITH day_src AS (
  SELECT
    sp."id" AS period_id,
    sp."year",
    sp."month",
    sp."half",
    generate_series(
      CASE WHEN sp."half" = 'first' THEN 1 ELSE 16 END,
      CASE WHEN sp."half" = 'first' THEN 15 ELSE EXTRACT(DAY FROM (date_trunc('month', make_date(sp."year", sp."month", 1)) + interval '1 month - 1 day'))::int END
    ) AS day_no
  FROM "ShiftPeriod" sp
  WHERE (sp."year", sp."month", sp."half") IN ((2026, 5, 'second'), (2026, 6, 'first'))
),
days AS (
  SELECT
    period_id,
    make_date("year", "month", day_no)::timestamp AS day_date,
    (ARRAY['日', '月', '火', '水', '木', '金', '土'])[EXTRACT(DOW FROM make_date("year", "month", day_no))::int + 1] AS dow,
    CASE
      WHEN EXTRACT(DOW FROM make_date("year", "month", day_no)) IN (0, 5, 6) THEN 300000
      ELSE 220000
    END AS budget
  FROM day_src
)
INSERT INTO "ShiftDay" (
  "id", "periodId", "date", "dayOfWeek", "targetBudget", "eventName", "expectedVisitors", "notes", "employeeOnDuty"
)
SELECT
  'day_' || md5(period_id || ':' || day_date::date::text),
  period_id,
  day_date,
  dow,
  budget,
  CASE WHEN EXTRACT(DOW FROM day_date) IN (5, 6) THEN '週末イベント' ELSE NULL END,
  NULL,
  NULL,
  CASE WHEN EXTRACT(DOW FROM day_date) IN (1, 3, 5) THEN '吉田' ELSE 'ナビ' END
FROM days
ON CONFLICT ("periodId", "date") DO UPDATE
SET
  "dayOfWeek" = EXCLUDED."dayOfWeek",
  "targetBudget" = EXCLUDED."targetBudget",
  "employeeOnDuty" = EXCLUDED."employeeOnDuty";

-- 東中野 2026年5月後半のサンプルシフト
WITH shift_defs(day_no, cast_login, start_time, end_time) AS (
  VALUES
    (16, 'りりむ', 20.0, 29.0),
    (16, 'すずな', 21.0, 26.0),
    (16, 'まい', 22.0, 29.0),
    (17, 'かのん', 19.0, 25.0),
    (17, 'ゆの', 20.0, 29.0),
    (17, 'りく', 22.0, 29.0),
    (18, 'りりむ', 20.0, 27.0),
    (18, 'ひな', 21.0, 29.0),
    (19, 'まい', 20.0, 25.0),
    (19, 'すずな', 21.0, 29.0),
    (20, 'かのん', 19.0, 24.0),
    (20, 'りりむ', 20.0, 29.0),
    (20, 'ゆの', 21.0, 29.0),
    (21, 'すずな', 19.0, 25.0),
    (21, 'まい', 20.0, 29.0),
    (21, 'ハニ', 22.0, 29.0),
    (22, 'かのん', 20.0, 29.0),
    (22, 'りりむ', 20.5, 29.0),
    (22, 'ひな', 21.0, 28.0),
    (23, '吉田', 19.0, 24.0),
    (23, 'りりむ', 20.0, 29.0),
    (23, 'まい', 21.0, 29.0),
    (23, 'まゆ', 22.0, 29.0),
    (24, 'ゆの', 19.0, 25.0),
    (24, 'かのん', 20.0, 29.0),
    (24, 'りく', 21.0, 29.0)
),
resolved AS (
  SELECT
    d."id" AS day_id,
    sp."id" AS period_id,
    make_date(2026, 5, sd.day_no)::timestamp AS shift_date,
    u."id" AS cast_id,
    sd.start_time,
    sd.end_time
  FROM shift_defs sd
  JOIN "Store" st ON st."name" = '東中野'
  JOIN "ShiftPeriod" sp ON sp."storeId" = st."id"
    AND sp."year" = 2026
    AND sp."month" = 5
    AND sp."half" = 'second'
  JOIN "ShiftDay" d ON d."periodId" = sp."id"
    AND d."date" = make_date(2026, 5, sd.day_no)::timestamp
  JOIN "User" u ON u."castLoginId" = sd.cast_login
),
slots AS (
  SELECT
    r.day_id,
    r.cast_id,
    r.start_time,
    r.end_time,
    (r.start_time + gs.i * 0.5)::float AS slot_time
  FROM resolved r
  CROSS JOIN LATERAL generate_series(0, ((r.end_time - r.start_time) * 2)::int - 1) AS gs(i)
)
INSERT INTO "ShiftSlot" ("id", "dayId", "timeSlot", "castId", "isStart", "isEnd", "memo")
SELECT
  'slot_' || md5(day_id || ':' || cast_id || ':' || slot_time::text),
  day_id,
  slot_time,
  cast_id,
  slot_time = start_time,
  slot_time = end_time - 0.5,
  NULL
FROM slots
ON CONFLICT ("dayId", "timeSlot", "castId") DO UPDATE
SET
  "isStart" = EXCLUDED."isStart",
  "isEnd" = EXCLUDED."isEnd";

-- 同じ内容を希望一覧にも少量入れる（未提出一覧の動作確認用）
WITH shift_defs(day_no, cast_login, start_time, end_time) AS (
  VALUES
    (16, 'りりむ', 20.0, 29.0),
    (16, 'すずな', 21.0, 26.0),
    (17, 'かのん', 19.0, 25.0),
    (17, 'ゆの', 20.0, 29.0),
    (18, 'りりむ', 20.0, 27.0),
    (20, 'りりむ', 20.0, 29.0),
    (21, 'まい', 20.0, 29.0),
    (22, 'かのん', 20.0, 29.0),
    (23, 'まい', 21.0, 29.0),
    (24, 'ゆの', 19.0, 25.0)
),
resolved AS (
  SELECT
    sp."id" AS period_id,
    make_date(2026, 5, sd.day_no)::timestamp AS shift_date,
    u."id" AS cast_id,
    sd.start_time,
    sd.end_time
  FROM shift_defs sd
  JOIN "Store" st ON st."name" = '東中野'
  JOIN "ShiftPeriod" sp ON sp."storeId" = st."id"
    AND sp."year" = 2026
    AND sp."month" = 5
    AND sp."half" = 'second'
  JOIN "User" u ON u."castLoginId" = sd.cast_login
)
INSERT INTO "ShiftRequest" (
  "id", "castId", "periodId", "date", "startTime", "endTime", "status", "notes", "createdAt", "updatedAt"
)
SELECT
  'request_' || md5(period_id || ':' || cast_id || ':' || shift_date::date::text),
  cast_id,
  period_id,
  shift_date,
  start_time,
  end_time,
  'approved',
  'ダミーデータ',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM resolved r
WHERE NOT EXISTS (
  SELECT 1
  FROM "ShiftRequest" sr
  WHERE sr."periodId" = r.period_id
    AND sr."castId" = r.cast_id
    AND sr."date" = r.shift_date
);

COMMIT;
