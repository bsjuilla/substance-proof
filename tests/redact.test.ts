import { describe, expect, it } from "vitest";
import { parseSamBoxes } from "../src/extract/redact";

describe("SAM 3.1 output parsing", () => {
  it("reads the box of a real response (captured from the live API, 30 Oct 2026)", () => {
    const real = "<0f>0<|box;x1=239;y1=152;x2=256;y2=168;w=900;h=560;c=0.8358974456787109|><|mask;x=0;y=0;c=0.8358974456787109;data=2,2,~abc|>\n";
    expect(parseSamBoxes(real, "airplane icon")).toEqual([{ label: "airplane icon", x1: 239, y1: 152, x2: 256, y2: 168, w: 900, h: 560, c: 0.8358974456787109 }]);
  });
  it("reads several matches and drops low-confidence ones", () => {
    const text = "<0f>0<|box;x1=1;y1=2;x2=3;y2=4;w=10;h=10;c=0.9|><|mask;data=1,1,~a|>,3<|box;x1=5;y1=6;x2=7;y2=8;w=10;h=10;c=0.2|><|mask;data=1,1,~a|>";
    expect(parseSamBoxes(text, "face").map((b) => b.x1)).toEqual([1]);
  });
  it("treats an empty lane as no matches", () => {
    expect(parseSamBoxes("", "barcode")).toEqual([]);
  });
});
