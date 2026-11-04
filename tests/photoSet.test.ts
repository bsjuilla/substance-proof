import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TAG, CostCap, PHOTO_PROMPT, evidenceFiles, localTime, newLayoutPrompt, parseAudit, photoRel } from "../scripts/lib/photoSet";

describe("Muse Image test-set helpers", () => {
  it("marks every output file as AI-made and as a PNG", () => {
    expect(photoRel("t03/stay/folio_A_SINGAPORE.pdf")).toBe(`t03/stay/${AI_TAG}_folio_A_SINGAPORE.png`);
    expect(photoRel("t07/travel/BP_A_JER-HKG.png")).toBe("t07/travel/AIPHOTO_BP_A_JER-HKG.png");
  });

  it("never photographs the minutes, only travel and stay documents", () => {
    const d = mkdtempSync(join(tmpdir(), "pack-"));
    mkdirSync(join(d, "travel")); mkdirSync(join(d, "stay"));
    for (const f of ["minutes.pdf", "recording.wav", "travel/BP.png", "travel/notes.txt", "stay/folio.pdf"]) writeFileSync(join(d, f), "x");
    expect(evidenceFiles(d).map((p) => p.slice(d.length + 1).split("\\").join("/"))).toEqual(["travel/BP.png", "stay/folio.pdf"]);
  });

  it("prints local airport time, as a boarding pass does, and refuses unknown airports", () => {
    expect(localTime("JER", "2026-10-09T10:22:00Z")).toEqual({ date: "09 Oct 2026", time: "11:22" }); // BST
    expect(localTime("HKG", "2026-10-09T17:22:00Z")).toEqual({ date: "10 Oct 2026", time: "01:22" });
    expect(localTime("ZZZ", "2026-10-09T17:22:00Z")).toBeUndefined();
  });

  it("stops before a call would cross the cap", () => {
    const c = new CostCap(0.03);
    c.reserve(0.01); c.add(0.01); c.reserve(0.01); c.add(0.01); c.reserve(0.01); c.add(0.01);
    expect(c.canSpend(0.01)).toBe(false);
    expect(() => c.reserve(0.01)).toThrow(/Cost cap reached/);
  });

  it("reads the human text audit", () => {
    const m = parseAudit("file,text_changed,notes\nt01/stay/AIPHOTO_a.png,no,\nt02/travel/AIPHOTO_b.png, YES ,date 12->13\nt03/x.png,,\n");
    expect([...m.entries()]).toEqual([["t01/stay/AIPHOTO_a.png", "no"], ["t02/travel/AIPHOTO_b.png", "yes"], ["t03/x.png", ""]]);
  });

  it("prompts forbid changing text and forbid real logos, people and codes", () => {
    expect(PHOTO_PROMPT).toMatch(/Do not add, remove, translate or retype any text/);
    expect(PHOTO_PROMPT).toMatch(/Do not add logos, people, hands or faces/);
    const p = newLayoutPrompt({ passenger: "Priya Anand-Lowe", from: "JER", to: "HKG", date: "09 Oct 2026", dep: "11:22", arr: "01:22 on 10 Oct 2026", flight: "SX 100", style: "s" });
    expect(p).toMatch(/SPECIMEN AIR/); expect(p).toMatch(/SPECIMEN — SYNTHETIC DOCUMENT/); expect(p).toMatch(/No barcode, no QR code, no photo/);
  });
});
