import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, PUT } from "@/app/api/rules/route";
import { loadRules, saveRules } from "@/lib/server/rulesStore";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "alt-rules-"));
  file = path.join(dir, "nested", "alt-rules.json");
  process.env.ALT_RULES_FILE = file;
});
afterEach(async () => {
  delete process.env.ALT_RULES_FILE;
  await rm(dir, { recursive: true, force: true });
});

const rules = [
  { id: "a", pattern: "tesco", regex: false, alt: "Food - Supermarket" },
  { id: "b", pattern: "^ATM\\b", regex: true, alt: "Cash" },
];
const put = (body: string, headers: Record<string, string> = {}) =>
  PUT(new Request("http://localhost:3000/api/rules", { method: "PUT", body, headers: { "content-type": "application/json", ...headers } }));

describe("rules file store", () => {
  it("returns no rules when the file doesn't exist yet", async () => {
    expect(await loadRules()).toEqual([]);
  });

  it("saves to disk (creating folders) and loads back", async () => {
    await saveRules(rules);
    const loaded = await loadRules();
    expect(loaded.map(({ pattern, regex, alt }) => ({ pattern, regex, alt }))).toEqual([
      { pattern: "tesco", regex: false, alt: "Food - Supermarket" },
      { pattern: "^ATM\\b", regex: true, alt: "Cash" },
    ]);
    expect(await readdir(path.dirname(file))).toEqual(["alt-rules.json"]); // no temp files left behind
  });
});

describe("/api/rules", () => {
  it("PUT then GET round-trips through the file", async () => {
    const res = await put(JSON.stringify({ version: 1, rules }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, count: 2 });
    expect(JSON.parse(await readFile(file, "utf8")).rules[0]).toEqual({ pattern: "tesco", regex: false, alt: "Food - Supermarket" });

    const body = await (await GET()).json();
    expect(body.rules).toHaveLength(2);
    expect(body.rules[1]).toEqual({ pattern: "^ATM\\b", regex: true, alt: "Cash" });
  });

  it("rejects writes from other websites", async () => {
    const res = await put(JSON.stringify({ rules }), { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await loadRules()).toEqual([]);
  });

  it("rejects non-JSON content types and malformed rules without touching the file", async () => {
    await saveRules(rules);
    expect((await PUT(new Request("http://localhost:3000/api/rules", { method: "PUT", body: "x", headers: { "content-type": "text/plain" } }))).status).toBe(415);
    expect((await put('{"rules":[{"pattern":1}]}')).status).toBe(400);
    expect(await loadRules()).toHaveLength(2);
  });
});
