import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { rulesFromJson, rulesToJson, type AltRule } from "../altRules";

/** Where rules are kept on disk. Override with the ALT_RULES_FILE environment variable. */
export function rulesFilePath(): string {
  // turbopackIgnore: this path is only known at runtime, so don't trace (and bundle) the project around it.
  return path.resolve(process.env.ALT_RULES_FILE || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "alt-rules.json"));
}

/** Path shown in the UI: relative to the project when inside it. */
export function displayPath(file = rulesFilePath()): string {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

export async function loadRules(file = rulesFilePath()): Promise<AltRule[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return rulesFromJson(text);
}

/** Write via a temp file + rename so a crash mid-write never leaves a half-written rules file. */
export async function saveRules(rules: AltRule[], file = rulesFilePath()): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, rulesToJson(rules) + "\n", "utf8");
  await rename(tmp, file);
}
