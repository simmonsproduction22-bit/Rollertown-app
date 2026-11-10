import { NextResponse, type NextRequest } from "next/server";
import { supabaseForUser } from "@/lib/supabase/server";

/** Exchanges the magic-link code for a session cookie. */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) await (await supabaseForUser()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL("/app", req.url));
}
