import type { Company, Director, PresenceResult, TestStatus } from "../types";

export type Tally = { present: number; absent: number; unknown: number };

export function tally(presence: PresenceResult[], ids: string[]): Tally {
  const t: Tally = { present: 0, absent: 0, unknown: 0 };
  for (const id of ids) {
    const p = presence.find((x) => x.directorId === id);
    if (!p) t.unknown += 1;
    else t[p.status] += 1;
  }
  return t;
}

/** "at least `need` of them are present", with honest handling of unknowns. */
export function atLeast(t: Tally, need: number): TestStatus {
  if (t.present >= need) return "pass";
  if (t.present + t.unknown < need) return "fail";
  return "inconclusive";
}

export function strategicDirectors(company: Company): Director[] {
  return company.directors.filter((d) => d.hasStrategicAuthority);
}

export function countText(t: Tally): string {
  return `${t.present} present, ${t.absent} absent, ${t.unknown} unproven`;
}
