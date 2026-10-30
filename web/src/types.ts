export type { RunResult } from "../../src/app/analyze";
export type { Draft } from "../../src/agent/evidenceAgent";
export type { Citation, TestResult } from "../../src/engine/types";

export type Loaded = { result: import("../../src/app/analyze").RunResult; fileBase: string };

/** What people see. Internally the engine says FAIL; one meeting cannot fail the law, it can only not meet a test. */
export const verdictWord = (v: string): string => (v === "FAIL" ? "NOT MET" : v);
