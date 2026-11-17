import { gfetch } from "./google";

export async function readRange(userId: string, spreadsheetId: string, range: string) {
  const r = await gfetch(
    userId,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`,
  );
  return { range: r.range as string, values: (r.values ?? []) as string[][] };
}
