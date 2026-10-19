import { describe, expect, it } from "vitest";
import { altDescriptionFor, compileRules, rulesFromJson, rulesToJson, type AltRule } from "@/lib/altRules";

const rule = (pattern: string, alt: string, regex = false): AltRule => ({ id: pattern, pattern, regex, alt });

describe("alt description rules", () => {
  const compiled = compileRules([
    rule("tesco", "Food - Supermarket"),
    rule("^ATM\\b", "Cash", true),
    rule("landlord", "Housing - Rent"),
    rule("store", "Shopping"),
  ]);

  it("matches plain text case-insensitively anywhere in the description", () => {
    expect(altDescriptionFor("Card payment TESCO STORES 3021", compiled)).toBe("Food - Supermarket");
    expect(altDescriptionFor("Standing order LANDLORD RENT", compiled)).toBe("Housing - Rent");
  });
  it("matches regex patterns case-insensitively", () => {
    expect(altDescriptionFor("atm withdrawal", compiled)).toBe("Cash");
    expect(altDescriptionFor("Cash at ATM", compiled)).toBe(""); // ^ anchors to the start
  });
  it("uses the first matching rule", () => {
    expect(altDescriptionFor("TESCO STORE", compiled)).toBe("Food - Supermarket");
  });
  it("returns blank when nothing matches", () => {
    expect(altDescriptionFor("NETFLIX.COM", compiled)).toBe("");
  });
  it("skips empty and invalid rules instead of throwing", () => {
    const c = compileRules([rule("", "Nope"), rule("(unclosed", "Bad", true), rule("netflix", "Subscriptions")]);
    expect(c[0].error).toMatch(/Enter a word/);
    expect(c[1].error).toMatch(/Invalid regex/);
    expect(altDescriptionFor("NETFLIX.COM", c)).toBe("Subscriptions");
  });
  it("round-trips through JSON and rejects malformed files", () => {
    const rules = [rule("tesco", "Food"), rule("^ATM", "Cash", true)];
    const back = rulesFromJson(rulesToJson(rules));
    expect(back.map(({ pattern, regex, alt }) => ({ pattern, regex, alt }))).toEqual([
      { pattern: "tesco", regex: false, alt: "Food" },
      { pattern: "^ATM", regex: true, alt: "Cash" },
    ]);
    expect(() => rulesFromJson("not json")).toThrow(/valid JSON/);
    expect(() => rulesFromJson('{"rules":[{"pattern":1}]}')).toThrow(/Rule 1/);
  });
});
