import { handle, HttpError, json, options } from "@/lib/http";
import { audit, requireAdmin } from "@/lib/admin/auth";
import { FLAG_DEFAULTS, getFlags, setFlag, type Flags } from "@/lib/admin/flags";

export const runtime = "nodejs";
export const OPTIONS = options;

export const GET = handle(async (req: Request) => {
  await requireAdmin(req);
  return json({ flags: await getFlags(true) });
});

export const PUT = handle(async (req: Request) => {
  const me = await requireAdmin(req);
  const b = (await req.json()) as Partial<Flags>;
  const cur = await getFlags(true);
  for (const k of Object.keys(b) as (keyof Flags)[]) {
    if (!(k in FLAG_DEFAULTS)) throw new HttpError(400, `Unknown control: ${k}`);
    const v = b[k] as unknown;
    if (typeof FLAG_DEFAULTS[k] === "boolean" && typeof v !== "boolean") throw new HttpError(400, `${k} must be on or off`);
    if (k === "auto_pause_errors" && !(Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000)) throw new HttpError(400, "Auto-pause needs a whole number from 0 to 1000");
    if (k === "promote_gate" && !(typeof v === "number" && v >= 0 && v <= 1)) throw new HttpError(400, "The gate is a number from 0 to 1");
    if (k === "model_prices" && (typeof v !== "object" || v === null || Object.values(v as object).some((p: any) => typeof p?.in !== "number" || typeof p?.out !== "number"))) throw new HttpError(400, "Prices look like { \"model\": { \"in\": 3, \"out\": 15 } } per million tokens");
    await setFlag(k, v as never, me.id);
    await audit(me, "control_change", k, { from: cur[k], to: v });
  }
  return json({ flags: await getFlags(true) });
});
