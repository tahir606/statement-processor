"use client";

import { useEffect, useRef, useState } from "react";
import { rulesFromJson, rulesToJson, type AltRule } from "@/lib/altRules";

const BROWSER_KEY = "statement-processor.alt-rules";
const SAVE_DELAY_MS = 400;

export interface RulesStorage {
  /** "file": saved to a JSON file by the app's server. "browser": the server isn't available (e.g. a static deploy). */
  where: "loading" | "file" | "browser";
  file?: string;
  status: "idle" | "saving" | "saved" | "error";
  error?: string;
}

function readBrowserCopy(): AltRule[] {
  try {
    const saved = localStorage.getItem(BROWSER_KEY);
    return saved ? rulesFromJson(saved) : [];
  } catch {
    return [];
  }
}

function writeBrowserCopy(rules: AltRule[]) {
  try {
    localStorage.setItem(BROWSER_KEY, rulesToJson(rules));
  } catch {
    // Storage unavailable (private window); the file copy is what matters.
  }
}

/**
 * Alt description rules, kept permanently in a JSON file on disk via /api/rules.
 * A browser copy is kept too, as a fallback when the server can't be reached.
 */
export function useAltRules() {
  const [rules, setRules] = useState<AltRule[]>([]);
  const [storage, setStorage] = useState<RulesStorage>({ where: "loading", status: "idle" });
  // Skip saving the rules we just loaded; save everything after that.
  const skipNextSave = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const browserRules = readBrowserCopy();
      try {
        const res = await fetch("/api/rules", { cache: "no-store" });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        const fileRules = rulesFromJson(JSON.stringify(body));
        if (cancelled) return;
        // First run with the file store: move rules saved in the browser earlier into the file.
        const migrate = fileRules.length === 0 && browserRules.length > 0;
        skipNextSave.current = !migrate;
        setRules(migrate ? browserRules : fileRules);
        setStorage({ where: "file", file: body.file, status: "idle" });
      } catch (e) {
        if (cancelled) return;
        skipNextSave.current = true;
        setRules(browserRules);
        setStorage({
          where: "browser",
          status: "error",
          error: `Rules file unavailable (${e instanceof Error ? e.message : String(e)}) — saving in this browser only.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (storage.where === "loading") return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    writeBrowserCopy(rules);
    if (storage.where !== "file") return;

    const timer = setTimeout(async () => {
      setStorage((s) => ({ ...s, status: "saving" }));
      try {
        const res = await fetch("/api/rules", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: rulesToJson(rules),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        setStorage((s) => ({ ...s, status: "saved", error: undefined, file: body.file ?? s.file }));
      } catch (e) {
        setStorage((s) => ({ ...s, status: "error", error: `Couldn't save rules file: ${e instanceof Error ? e.message : String(e)}` }));
      }
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [rules, storage.where]);

  return { rules, setRules, storage };
}
