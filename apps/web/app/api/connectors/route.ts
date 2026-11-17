import type { ConnectorStatus } from "@fluent/shared";
import { handle, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { getConnection } from "@/lib/connections";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  const user = await requireUser(req);
  const [g, a] = await Promise.all([getConnection(user.id, "google"), getConnection(user.id, "airtable")]);
  const status: ConnectorStatus = {
    google: {
      connected: !!g,
      email: g?.meta.email as string | undefined,
      rateCardSheetId: g?.meta.rateCardSheetId as string | undefined,
      rateCardRange: g?.meta.rateCardRange as string | undefined,
    },
    airtable: { connected: !!a, baseId: a?.meta.baseId as string | undefined, table: a?.meta.table as string | undefined },
  };
  return json(status);
});
