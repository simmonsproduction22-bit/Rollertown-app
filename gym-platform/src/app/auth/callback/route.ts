import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safe-next";
import { supabaseForUser } from "@/lib/supabase/server";

/** Exchanges the magic-link code for a session cookie, then returns to `next` (same-site only). */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await (await supabaseForUser()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.url));
}
