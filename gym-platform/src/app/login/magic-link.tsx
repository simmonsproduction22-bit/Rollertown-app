"use client";
import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function MagicLinkForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "");
    setState("sending");
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error: err } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    if (err) { setError(err.message); setState("error"); } else setState("sent");
  }
  if (state === "sent") return <p role="status" className="text-ok">Check your inbox for a sign-in link.</p>;
  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block"><span className="label">Email</span><input className="input" type="email" name="email" required autoComplete="email" /></label>
      {state === "error" && <p role="alert" className="text-sm text-bad">{error}</p>}
      <button className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 font-semibold text-brand-fg" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}
