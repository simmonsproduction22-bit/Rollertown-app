import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { z } from "zod";
import type { Member, WaiverSignature, WaiverTemplate } from "@/lib/data/types";
import { AppError } from "@/lib/result";
import { audit, mustGet, type Ctx } from "./context";

export async function currentWaivers(ctx: Ctx): Promise<WaiverTemplate[]> {
  return ctx.store.list("waiver_templates", { where: { gym_id: ctx.gym.id, is_current: true, required: true } });
}

function ageOn(dob: string | null, now: Date): number | null {
  if (!dob) return null;
  return Math.floor((now.getTime() - new Date(dob).getTime()) / (365.25 * 86_400_000));
}

export function isMinor(member: Member, now: Date): boolean {
  const a = ageOn(member.date_of_birth, now);
  return a !== null && a < 18;
}

/** ok = signed the CURRENT version of every required waiver. */
export async function waiverStatus(ctx: Ctx, memberId: string) {
  const templates = await currentWaivers(ctx);
  const sigs = await ctx.store.list("waiver_signatures", { where: { member_id: memberId } });
  const missing = templates.filter((t) => !sigs.some((s) => s.template_id === t.id));
  const stale = missing.filter((t) => sigs.some((s) => s.template_version < t.version));
  return { ok: missing.length === 0, missing, needsResign: stale.length > 0, signatures: sigs.sort((a, b) => (a.signed_at < b.signed_at ? 1 : -1)) };
}

export const signSchema = z.object({
  templateId: z.string().uuid(),
  memberId: z.string().uuid(),
  signerName: z.string().trim().min(2).max(120),
  relationship: z.enum(["self", "parent", "guardian"]),
  signerEmail: z.string().email().optional().or(z.literal("")),
  signatureSvg: z.string().min(20).max(200_000).refine((s) => s.trim().startsWith("<svg") && !/<script|on\w+=/i.test(s), "Invalid signature"),
  agree: z.literal(true, { errorMap: () => ({ message: "You must agree to the waiver" }) }),
});

export async function signWaiver(ctx: Ctx, input: z.input<typeof signSchema>, meta: { ip?: string | null; userAgent?: string | null } = {}): Promise<WaiverSignature> {
  const args = signSchema.parse(input);
  const tpl = await mustGet(ctx, "waiver_templates", args.templateId);
  if (!tpl.is_current) throw new AppError("This waiver version has been replaced. Reload to sign the latest.");
  const member = await mustGet(ctx, "members", args.memberId);
  if (isMinor(member, ctx.now()) && args.relationship === "self") throw new AppError("Members under 18 must be signed for by a parent or guardian.");
  const sig = await ctx.store.insert("waiver_signatures", {
    gym_id: ctx.gym.id, template_id: tpl.id, template_version: tpl.version, member_id: member.id, signer_name: args.signerName,
    signer_relationship: args.relationship, signer_email: args.signerEmail || null, signature_svg: args.signatureSvg,
    ip_address: meta.ip ?? null, user_agent: meta.userAgent?.slice(0, 300) ?? null, pdf_path: null, signed_at: ctx.now().toISOString(),
  });
  const pdfPath = `${ctx.gym.id}/${member.id}/${sig.id}.pdf`;
  if (ctx.store.kind === "supabase") {
    const bytes = await waiverPdf(ctx, tpl, sig, member);
    const { supabaseService } = await import("@/lib/supabase/server");
    const { error } = await supabaseService().storage.from("waivers").upload(pdfPath, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new AppError("Signed, but storing the PDF failed. Staff can regenerate it from the member profile.");
  }
  await ctx.store.update("waiver_signatures", sig.id, { pdf_path: pdfPath });
  await audit(ctx, "waiver.signed", "members", member.id, { template: tpl.title, version: tpl.version, signer: args.signerName, relationship: args.relationship });
  return { ...sig, pdf_path: pdfPath };
}

/** Publishing a new version: old signatures stay on file, members re-sign. */
export async function publishWaiverVersion(ctx: Ctx, input: { templateId: string; body: string }): Promise<WaiverTemplate> {
  const body = z.string().trim().min(50).max(50_000).parse(input.body);
  const old = await mustGet(ctx, "waiver_templates", input.templateId);
  await ctx.store.update("waiver_templates", old.id, { is_current: false });
  const next = await ctx.store.insert("waiver_templates", { gym_id: ctx.gym.id, title: old.title, version: old.version + 1, body, is_current: true, required: old.required, created_at: ctx.now().toISOString() });
  await audit(ctx, "waiver.version_published", "waiver_templates", next.id, { title: old.title, version: next.version });
  return next;
}

function wrap(text: string, max = 95): string[] {
  return text.split("\n").flatMap((para) => {
    const words = para.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim();
    }
    return [...lines, cur];
  });
}

/** Renders the signed waiver as a PDF (text + signer + timestamp + signature path). */
export async function waiverPdf(ctx: Ctx, tpl: WaiverTemplate, sig: WaiverSignature, member: Member): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([612, 792]);
  let y = 740;
  const line = (t: string, f = font, size = 10) => {
    if (y < 80) { page = doc.addPage([612, 792]); y = 740; }
    page.drawText(t.replace(/[^\x20-\x7E]/g, "-"), { x: 50, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    y -= size + 5;
  };
  line(ctx.gym.name, bold, 16);
  line(`${tpl.title} (version ${tpl.version})`, bold, 12);
  y -= 6;
  wrap(tpl.body).forEach((l) => line(l));
  y -= 12;
  line(`Member: ${member.first_name} ${member.last_name}${member.date_of_birth ? ` (DOB ${member.date_of_birth})` : ""}`, bold);
  line(`Signed by: ${sig.signer_name} (${sig.signer_relationship})`);
  line(`Signed at: ${new Date(sig.signed_at).toUTCString()}  IP: ${sig.ip_address ?? "n/a"}`);
  const path = sig.signature_svg.match(/ d="([^"]+)"/)?.[1];
  if (path) page.drawSvgPath(path, { x: 50, y: y - 10, scale: 0.6, borderColor: rgb(0, 0, 0), borderWidth: 2 });
  return doc.save();
}
