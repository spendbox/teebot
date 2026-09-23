import { safeEqual } from "@/lib/auth";
import { runTick } from "@/lib/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !safeEqual(given, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await runTick());
}

export const GET = handle;
export const POST = handle;
