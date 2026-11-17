import { gfetch } from "./google";

export async function readRange(userId: string, spreadsheetId: string, range: string) {
  const r = await gfetch(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return { range: r.range as string, values: (r.values ?? []) as string[][] };
}

export async function appendRow(userId: string, spreadsheetId: string, tab: string, row: (string | number)[]) {
  const range = `${tab}!A:Z`;
  const r = await gfetch(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: JSON.stringify({ values: [row] }) },
  );
  const updated = (r.updates?.updatedRange ?? "") as string; // e.g. Deals!A5:I5
  const m = updated.match(/!A(\d+)/);
  return { row: m ? Number(m[1]) : null };
}
