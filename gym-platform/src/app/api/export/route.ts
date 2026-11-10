import { NextResponse } from "next/server";
import { authorize } from "@/lib/auth/session";
import { ctxFor } from "@/lib/ctx";
import { exportZip } from "@/lib/services/data-io";
import { fail } from "@/lib/result";

/** One-click full export: ZIP of CSVs + waiver PDFs. Free, always. */
export async function GET() {
  try {
    const ctx = await ctxFor(await authorize("export.run"));
    const zip = await exportZip(ctx);
    return new NextResponse(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${ctx.gym.slug}-export-${new Date().toISOString().slice(0, 10)}.zip"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json(fail(e), { status: 403 });
  }
}
