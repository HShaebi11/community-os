import { describe, expect, it } from "vitest";
import { qrSvg } from "./qr.ts";

describe("qrSvg", () => {
  it("returns an svg document", () => {
    const svg = qrSvg("https://os.test/e/abc");
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  it("is deterministic for the same input and differs for different inputs", () => {
    expect(qrSvg("https://a")).toBe(qrSvg("https://a"));
    expect(qrSvg("https://a")).not.toBe(qrSvg("https://b"));
  });
});
