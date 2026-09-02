import { google, sheets_v4 } from "googleapis";

let sheetsClient: sheets_v4.Sheets | null = null;

function getClient(): sheets_v4.Sheets {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    throw new Error(
      "Google Sheets credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env"
    );
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  sheetsClient = google.sheets({ version: "v4", auth });
  return sheetsClient;
}

export function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error("GOOGLE_SHEET_ID not configured in .env");
  return id;
}

// シート内容を読み取り
export async function readSheet(
  sheetName: string,
  range: string
): Promise<(string | number | null)[][]> {
  const sheets = getClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!${range}`,
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  return (res.data.values || []) as (string | number | null)[][];
}

// シートに書き込み
export async function writeSheet(
  sheetName: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  const sheets = getClient();
  const spreadsheetId = getSpreadsheetId();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!${range}`,
    valueInputOption: "RAW",
    requestBody: { values },
  });
}

// セル単位で書き込み
export async function writeCell(
  sheetName: string,
  cell: string,
  value: string | number | null
): Promise<void> {
  await writeSheet(sheetName, cell, [[value]]);
}

/**
 * 複数のセルを 1 回の通信で書き込む。
 *
 * 1 セルずつ送ると 1 期間で約 1,000 回になり、
 * Google の上限（1 分あたり 60 回）に当たって途中で止まる。
 */
export async function writeCells(
  sheetName: string,
  updates: { cell: string; value: string | number | null }[],
): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getClient();
  const spreadsheetId = getSpreadsheetId();

  const CHUNK = 200;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: chunk.map((u) => ({
          range: `'${sheetName}'!${u.cell}`,
          values: [[u.value]],
        })),
      },
    });
  }
}

// シート一覧を取得
export async function listSheets(): Promise<string[]> {
  const sheets = getClient();
  const spreadsheetId = getSpreadsheetId();

  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });

  return (
    res.data.sheets?.map((s) => s.properties?.title || "").filter(Boolean) || []
  );
}

// Google Sheets連携が設定済みかチェック
export function isSheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SHEET_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}
