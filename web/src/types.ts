export type { RunResult } from "../../src/app/analyze";
export type { Draft } from "../../src/agent/evidenceAgent";
export type { Citation, TestResult } from "../../src/engine/types";

export type Loaded = { result: import("../../src/app/analyze").RunResult; fileBase: string };

/** What people see. Internally the engine says FAIL / REVIEW / PASS. One meeting cannot fail the law, it can only not
 *  meet a test; and "PASS" reads like a legal conclusion a firm would have to sign, so it is shown as what it is: the
 *  presence tests are evidenced. A reviewer still signs. */
export const verdictWord = (v: string): string => (v === "FAIL" ? "NOT MET" : v === "PASS" ? "EVIDENCED" : v);
