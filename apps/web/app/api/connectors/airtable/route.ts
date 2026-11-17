import { handle, HttpError, json, options } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { deleteConnection, getConnection, saveConnection } from "@/lib/connections";
import { verifyAirtable } from "@/lib/connectors/airtable";

export const runtime = "nodejs";
export const OPTIONS = options;

export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req);
  const body = await req.json();
  const baseId = String(body.baseId ?? "").trim();
  const table = String(body.table ?? "").trim();
  if (!/^app[A-Za-z0-9]{8,}$/.test(baseId)) throw new HttpError(400, "Base ID should look like appXXXXXXXXXXXXXX.");
  if (!table) throw new HttpError(400, "Add the table name.");
  const existing = await getConnection(user.id, "airtable");
  const token = String(body.token ?? "").trim() || existing?.secret;
  if (!token) throw new HttpError(400, "Add an Airtable personal access token.");
  try {
    await verifyAirtable(token, baseId, table);
  } catch (e) {
    throw new HttpError(400, `Airtable said: ${e instanceof Error ? e.message : "couldn't open that table"}`);
  }
  await saveConnection(user.id, "airtable", token, { baseId, table });
  return json({ ok: true });
});

export const DELETE = handle(async (req: Request) => {
  const user = await requireUser(req);
  await deleteConnection(user.id, "airtable");
  return json({ ok: true });
});
