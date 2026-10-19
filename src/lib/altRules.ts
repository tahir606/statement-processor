/**
 * Alt description rules: if a transaction's description matches a rule, the rule's
 * alt text goes in the Alt Description column. Rules are checked in order; first match wins.
 */
export interface AltRule {
  id: string;
  /** Plain text (case-insensitive "contains") or a regular expression when `regex` is true. */
  pattern: string;
  regex: boolean;
  alt: string;
}

export interface CompiledRule {
  rule: AltRule;
  test: ((description: string) => boolean) | null;
  /** Why the rule can't be used (empty pattern, invalid regex). */
  error?: string;
}

export function compileRule(rule: AltRule): CompiledRule {
  const pattern = rule.pattern.trim();
  if (!pattern) return { rule, test: null, error: "Enter a word or pattern" };
  if (!rule.regex) {
    const needle = pattern.toLowerCase();
    return { rule, test: (d) => d.toLowerCase().includes(needle) };
  }
  try {
    const re = new RegExp(pattern, "i");
    return { rule, test: (d) => re.test(d) };
  } catch (e) {
    return { rule, test: null, error: `Invalid regex: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function compileRules(rules: AltRule[]): CompiledRule[] {
  return rules.map(compileRule);
}

/** Index of the first usable rule matching the description, or -1. */
export function matchRule(description: string, compiled: CompiledRule[]): number {
  return compiled.findIndex((c) => c.test?.(description));
}

/** Alt text for a description, or "" when no rule matches. */
export function altDescriptionFor(description: string, compiled: CompiledRule[]): string {
  const i = matchRule(description, compiled);
  return i === -1 ? "" : compiled[i].rule.alt;
}

export const newRuleId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Export format: { version, rules: [{ pattern, regex, alt }] }. */
export function rulesToJson(rules: AltRule[]): string {
  return JSON.stringify({ version: 1, rules: rules.map(({ pattern, regex, alt }) => ({ pattern, regex, alt })) }, null, 2);
}

/** Accepts the export format or a bare array of rules. Throws with a readable message on bad input. */
export function rulesFromJson(text: string): AltRule[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file.");
  }
  const list = Array.isArray(data) ? data : (data as { rules?: unknown })?.rules;
  if (!Array.isArray(list)) throw new Error('Expected a "rules" array.');
  return list.map((r, i) => {
    const { pattern, regex, alt } = (r ?? {}) as Record<string, unknown>;
    if (typeof pattern !== "string" || typeof alt !== "string") {
      throw new Error(`Rule ${i + 1} needs text "pattern" and "alt" fields.`);
    }
    return { id: newRuleId(), pattern, regex: regex === true, alt };
  });
}
