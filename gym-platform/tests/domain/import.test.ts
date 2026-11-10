import { describe, expect, it } from "vitest";
import { autoMap } from "@/lib/import/presets";
import { validateRows } from "@/lib/import/validate";

describe("autoMap", () => {
  it("maps Mindbody client export headers", () => {
    const m = autoMap(["Client ID", "First Name", "Last Name", "Email", "Mobile Phone", "Birth Date", "Creation Date"], "members", "mindbody");
    expect(m).toMatchObject({ external_ref: "Client ID", first_name: "First Name", email: "Email", phone: "Mobile Phone", date_of_birth: "Birth Date", joined_on: "Creation Date" });
  });
  it("maps Mindbody pricing options to packages", () => {
    const m = autoMap(["Email", "Pricing Option", "Count", "Remaining", "Expiration Date", "Staff"], "packages", "mindbody");
    expect(m).toMatchObject({ package_name: "Pricing Option", credits_total: "Count", credits_remaining: "Remaining", expires_on: "Expiration Date", coach_name: "Staff" });
  });
  it("maps Booksy customer headers", () => {
    const m = autoMap(["Customer ID", "Customer First Name", "Customer Last Name", "Email"], "members", "booksy");
    expect(m.first_name).toBe("Customer First Name");
  });
});

describe("validateRows", () => {
  it("normalizes valid rows and reports bad ones with row numbers", () => {
    const mapping = { first_name: "First", last_name: "Last", email: "Email", status: "Status" };
    const { ok, errors } = validateRows("members", [
      { First: "Ana", Last: "Silva", Email: "ANA@EXAMPLE.COM", Status: "Inactive" },
      { First: "", Last: "X", Email: "bad", Status: "" },
    ], mapping);
    expect(ok).toEqual([{ first_name: "Ana", last_name: "Silva", email: "ana@example.com", status: "cancelled" }]);
    expect(errors[0].row).toBe(3);
    expect(errors[0].messages.length).toBe(2);
  });
  it("requires mapping for required fields", () => {
    const { errors } = validateRows("packages", [{}], { member_email: "Email" });
    expect(errors[0].messages[0]).toMatch(/Package name/);
  });
  it("parses money and package counts", () => {
    const mapping = { member_email: "e", package_name: "p", credits_total: "t", credits_remaining: "r", amount_paid: "a" };
    const { ok } = validateRows("packages", [{ e: "a@b.co", p: "10 Privates", t: "10", r: "4", a: "$750.00" }], mapping);
    expect(ok[0]).toMatchObject({ credits_total: 10, credits_remaining: 4, amount_paid: 75000 });
  });
});
