import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import JSZip from "jszip";
import { createApiKey, exportZip, hashKey, previewImport, runImport } from "@/lib/services/data-io";
import { posSale } from "@/lib/services/people";
import { makeCtx } from "./helpers";

describe("data in/out", () => {
  it("imports a Mindbody client CSV with auto-mapping and reports bad rows", async () => {
    const ctx = await makeCtx();
    const csv = "Client ID,First Name,Last Name,Email,Mobile Phone\n1,Kai,Lopez,kai@example.com,555-123-4567\n2,,Nope,bad,\n";
    const p = previewImport(csv, "members", "mindbody");
    expect(p.valid).toBe(1);
    const job = await runImport(ctx, { text: csv, entity: "members", system: "mindbody", mapping: p.mapping });
    expect(job.imported_count).toBe(1);
    expect(job.error_count).toBe(1);
    expect(await ctx.store.first("members", { where: { email: "kai@example.com" } })).not.toBeNull();
  });
  it("exports a ZIP with CSVs and waiver PDFs, no secrets", async () => {
    const ctx = await makeCtx();
    const zip = await JSZip.loadAsync(await exportZip(ctx));
    const names = Object.keys(zip.files);
    expect(names).toContain("csv/members.csv");
    expect(names.filter((n) => n.startsWith("waivers/")).length).toBeGreaterThan(30);
    expect(await zip.file("csv/api_keys.csv")!.async("string")).not.toContain("key_hash");
  });
  it("API keys store only a hash", async () => {
    const ctx = await makeCtx();
    const { key, raw } = await createApiKey(ctx, { name: "Zapier", scopes: ["read"] });
    expect(key.key_hash).toBe(hashKey(raw));
    expect(JSON.stringify(key)).not.toContain(raw);
  });
  it("POS sale decrements stock and refuses overselling", async () => {
    const ctx = await makeCtx();
    const item = (await ctx.store.list("inventory_items")).find((i) => i.name === "Water")!;
    await posSale(ctx, { memberId: null, lines: [{ itemId: item.id, qty: 2 }] });
    expect((await ctx.store.get("inventory_items", item.id))!.stock).toBe(item.stock - 2);
    await expect(posSale(ctx, { memberId: null, lines: [{ itemId: item.id, qty: 50 }] })).rejects.toThrow(/left/);
  });
});
