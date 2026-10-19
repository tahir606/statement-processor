"use client";

import { useEffect, useState } from "react";

const USE_ALT_KEY = "statement-processor.export-use-alt";

/** "Use alt description as description" on export. Remembered per browser; it's a preference, not data. */
export function useExportPreference(): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time load from browser storage
      setValue(localStorage.getItem(USE_ALT_KEY) === "1");
    } catch {
      // Storage unavailable; default off.
    }
  }, []);
  const set = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(USE_ALT_KEY, v ? "1" : "0");
    } catch {
      // Storage unavailable; the choice still applies this session.
    }
  };
  return [value, set];
}
