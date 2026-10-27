// Rollertown Rewards account API.
// Email + password accounts stored in Netlify Database (Postgres).
// Passwords are hashed with scrypt; sessions are random tokens stored only as SHA-256 hashes.
import type { Config, Context } from "@netlify/functions";
import { getDatabase } from "@netlify/database";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;

const SESSION_DAYS = 180;          // members stay signed in for 6 months of inactivity
const MAX_FAILED = 5;              // failed sign-ins before a short lockout
const LOCK_MINUTES = 15;
const MAX_STATE_BYTES = 200_000;
// Public demo account for the pitch. It is meant to be shared.
const DEMO_EMAIL = "demo@rollertown.app";
const DEMO_PASSWORD = "rollertown";

type Member = {
  id: number; email: string; password_hash: string; first_name: string; last_name: string;
  phone: string; birthday: string | null; state: Record<string, unknown>;
  failed_logins: number; locked_until: string | null;
};

let dbInstance: ReturnType<typeof getDatabase> | null = null;
const db = () => (dbInstance ??= getDatabase());

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
const fail = (status: number, error: string, message: string) => json({ error, message }, status);

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

function isoDate(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
}

function publicMember(m: Member) {
  return {
    email: m.email, firstName: m.first_name, lastName: m.last_name, phone: m.phone,
    birthday: isoDate(m.birthday), state: m.state ?? {},
  };
}

async function createSession(memberId: number) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db().sql`INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (${sha256(token)}, ${memberId}, ${expires})`;
  return token;
}

async function memberFromRequest(req: Request): Promise<{ member: Member; tokenHash: string } | null> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.length > 200) return null;
  const tokenHash = sha256(token);
  const rows = await db().sql<Member & { expires_at: string }>`
    SELECT m.*, s.expires_at FROM sessions s JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ${tokenHash}`;
  const row = rows[0];
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await db().sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
    return null;
  }
  // Sliding expiry: every visit pushes the sign-out date back, so active members never have to sign in again.
  const newExpiry = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db().sql`UPDATE sessions SET expires_at = ${newExpiry} WHERE token_hash = ${tokenHash}`;
  return { member: row, tokenHash };
}

async function readBody(req: Request): Promise<Record<string, any>> {
  try { const b = await req.json(); return b && typeof b === "object" ? b : {}; } catch { return {}; }
}

function ageFrom(birthday: string): number {
  const b = new Date(birthday + "T12:00:00Z");
  if (Number.isNaN(b.getTime())) return -1;
  return (Date.now() - b.getTime()) / (365.25 * 864e5);
}

async function signup(req: Request) {
  const body = await readBody(req);
  const email = normEmail(body.email);
  const password = String(body.password ?? "");
  const firstName = String(body.firstName ?? "").trim().slice(0, 60);
  const lastName = String(body.lastName ?? "").trim().slice(0, 60);
  const phone = String(body.phone ?? "").trim().slice(0, 30);
  const birthday = String(body.birthday ?? "").slice(0, 10);
  const state = body.state && typeof body.state === "object" ? body.state : {};

  if (!firstName) return fail(400, "first_name", "Add your first name.");
  if (!validEmail(email)) return fail(400, "email", "Enter a valid email address.");
  if (phone && phone.replace(/\D/g, "").length < 10) return fail(400, "phone", "Phone is optional, but if you add one it needs 10 digits.");
  if (password.length < 8 || password.length > 200) return fail(400, "password", "Choose a password with at least 8 characters.");
  const age = ageFrom(birthday);
  if (age < 0) return fail(400, "birthday", "Add your birthday.");
  if (age < 21) return fail(400, "underage", "You need to be 21 or older to join Rollertown Rewards.");
  if (JSON.stringify(state).length > MAX_STATE_BYTES) return fail(413, "too_large", "Account data is too large.");

  const hash = await hashPassword(password);
  const rows = await db().sql<Member>`
    INSERT INTO members (email, password_hash, first_name, last_name, phone, birthday, state)
    VALUES (${email}, ${hash}, ${firstName}, ${lastName}, ${phone}, ${birthday}, ${JSON.stringify(state)}::jsonb)
    ON CONFLICT (email) DO NOTHING
    RETURNING *`;
  if (!rows[0]) return fail(409, "exists", "An account with that email already exists. Sign in instead.");
  const token = await createSession(rows[0].id);
  return json({ token, member: publicMember(rows[0]) }, 201);
}

async function ensureDemoMember() {
  const hash = await hashPassword(DEMO_PASSWORD);
  await db().sql`
    INSERT INTO members (email, password_hash, first_name, last_name, phone, birthday, state)
    VALUES (${DEMO_EMAIL}, ${hash}, ${"Jordan"}, ${"Avery"}, ${"(214) 555-0923"}, ${"1994-03-14"}, ${JSON.stringify({ demo: true })}::jsonb)
    ON CONFLICT (email) DO NOTHING`;
}

async function login(req: Request) {
  const body = await readBody(req);
  const email = normEmail(body.email);
  const password = String(body.password ?? "");
  const bad = () => fail(401, "invalid", "That email and password don’t match. Try again or reset your password.");
  if (!validEmail(email) || !password || password.length > 200) return bad();
  if (email === DEMO_EMAIL) await ensureDemoMember();

  const rows = await db().sql<Member>`SELECT * FROM members WHERE email = ${email}`;
  const m = rows[0];
  if (!m) { await hashPassword(password); return bad(); } // same work either way, so timing doesn't reveal accounts
  if (m.locked_until && new Date(m.locked_until).getTime() > Date.now()) {
    return fail(429, "locked", `Too many tries. Wait ${LOCK_MINUTES} minutes, then try again or reset your password.`);
  }
  if (!(await checkPassword(password, m.password_hash))) {
    const failed = m.failed_logins + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60e3) : null;
    await db().sql`UPDATE members SET failed_logins = ${lock ? 0 : failed}, locked_until = ${lock} WHERE id = ${m.id}`;
    return bad();
  }
  await db().sql`UPDATE members SET failed_logins = 0, locked_until = NULL WHERE id = ${m.id}`;
  const token = await createSession(m.id);
  return json({ token, member: publicMember(m) });
}

export default async (req: Request, context: Context) => {
  const action = context.params.action;
  try {
    if (action === "signup" && req.method === "POST") return await signup(req);
    if (action === "login" && req.method === "POST") return await login(req);

    if (action === "reset" && req.method === "POST") {
      // Always answer the same way so the form never reveals which emails have accounts.
      return json({ ok: true });
    }

    const session = await memberFromRequest(req);
    if (!session) return fail(401, "signed_out", "Please sign in again.");
    const { member, tokenHash } = session;

    if (action === "me" && req.method === "GET") return json({ member: publicMember(member) });

    if (action === "state" && req.method === "PUT") {
      const body = await readBody(req);
      const state = body.state && typeof body.state === "object" ? body.state : null;
      if (!state) return fail(400, "state", "Missing account data.");
      const text = JSON.stringify(state);
      if (text.length > MAX_STATE_BYTES) return fail(413, "too_large", "Account data is too large.");
      await db().sql`UPDATE members SET state = ${text}::jsonb, updated_at = NOW() WHERE id = ${member.id}`;
      return json({ ok: true });
    }

    if (action === "logout" && req.method === "POST") {
      await db().sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
      return json({ ok: true });
    }

    if (action === "account" && req.method === "DELETE") {
      if (member.email === DEMO_EMAIL) return fail(403, "demo", "The demo account can’t be deleted.");
      await db().sql`DELETE FROM members WHERE id = ${member.id}`; // sessions cascade
      return json({ ok: true });
    }

    return fail(404, "not_found", "Not found.");
  } catch (err) {
    console.error("api error", action, err);
    return fail(500, "server", "Something went wrong on our side. Try again in a minute.");
  }
};

export const config: Config = { path: "/api/:action" };
