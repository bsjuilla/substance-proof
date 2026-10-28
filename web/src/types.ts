export type { RunResult } from "../../src/app/analyze";
export type { Draft } from "../../src/agent/evidenceAgent";
export type { Citation, TestResult } from "../../src/engine/types";

export type Loaded = { result: import("../../src/app/analyze").RunResult; fileBase: string };
