import { describe, expect, it } from "vitest";
import { detectDateOrder, formatDate, parseAmount, parseDate } from "@/lib/normalize";

describe("parseAmount", () => {
  it.each([
    ["1,234.56", 1234.56],
    ["£1,234.56", 1234.56],
    ["1.234,56", 1234.56],
    ["12,50", 12.5],
    ["1,250", 1250],
    ["(45.20)", -45.2],
    ["45.20-", -45.2],
    ["-45.20", -45.2],
    ["45.20 DR", -45.2],
    ["45.20DR", -45.2],
    ["45.20 CR", 45.2],
    ["PKR 64,210.75", 64210.75],
    ["", null],
    ["abc", null],
  ])("%s → %s", (input, expected) => expect(parseAmount(input)).toBe(expected));
});

describe("parseDate", () => {
  it("handles common formats", () => {
    expect(parseDate("05/10/2026", "DMY")).toBe("2026-10-05");
    expect(parseDate("10/05/2026", "MDY")).toBe("2026-10-05");
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("05 Oct 2026")).toBe("2026-10-05");
    expect(parseDate("5-Oct-26")).toBe("2026-10-05");
    expect(parseDate("Oct 5, 2026")).toBe("2026-10-05");
    expect(parseDate("05 Oct", "DMY", 2025)).toBe("2025-10-05");
    expect(parseDate("31/02/2026")).toBeNull();
  });
  it("detects date order from values over 12", () => {
    expect(detectDateOrder(["01/02/2026", "25/02/2026"])).toBe("DMY");
    expect(detectDateOrder(["02/01/2026", "02/25/2026"])).toBe("MDY");
  });
});

describe("formatDate", () => {
  it("formats ISO dates as DD-Mmm-YY", () => {
    expect(formatDate("2026-10-05")).toBe("05-Oct-26");
    expect(formatDate("2025-01-31")).toBe("31-Jan-25");
  });
});
