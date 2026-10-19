import { rulesFromJson } from "@/lib/altRules";
import { displayPath, loadRules, saveRules } from "@/lib/server/rulesStore";

// Alt description rules, stored as a JSON file on the machine running the app so they
// survive browser data being cleared. Only rules pass through here — never statement data.

const MAX_BODY_BYTES = 1_000_000;

export async function GET() {
  try {
    const rules = await loadRules();
    return Response.json({ rules: rules.map(({ pattern, regex, alt }) => ({ pattern, regex, alt })), file: displayPath() });
  } catch (e) {
    return Response.json({ error: `Couldn't read ${displayPath()}: ${message(e)}` }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  // Only the app itself may write: reject other sites' pages posting to localhost.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return Response.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Expected application/json." }, { status: 415 });
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Rules file too large." }, { status: 413 });

  let rules;
  try {
    rules = rulesFromJson(text);
  } catch (e) {
    return Response.json({ error: message(e) }, { status: 400 });
  }
  try {
    await saveRules(rules);
  } catch (e) {
    return Response.json({ error: `Couldn't write ${displayPath()}: ${message(e)}` }, { status: 500 });
  }
  return Response.json({ ok: true, count: rules.length, file: displayPath() });
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
