import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env, isDemoMode } from "@/lib/env";
import { publicCtx } from "@/lib/ctx";
import { receiveSms } from "@/lib/services/comms";

/** Twilio inbound SMS → two-way inbox. ?gym=<slug>. Verifies X-Twilio-Signature when configured. */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  if (env.twilioToken) {
    const data = req.url + Object.keys(params).sort().map((k) => k + params[k]).join("");
    const expected = createHmac("sha1", env.twilioToken).update(data).digest("base64");
    const got = req.headers.get("x-twilio-signature") ?? "";
    if (expected.length !== got.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(got))) return new NextResponse("bad signature", { status: 403 });
  } else if (!isDemoMode()) {
    return new NextResponse("SMS not configured", { status: 501 });
  }
  const ctx = await publicCtx(req.nextUrl.searchParams.get("gym") ?? "demo-mma");
  await receiveSms(ctx, params.From ?? "", params.Body ?? "");
  return new NextResponse("<Response/>", { headers: { "Content-Type": "text/xml" } });
}
