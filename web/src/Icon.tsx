/** Drawn icons (24px grid, 1.75 stroke, currentColor) instead of text glyphs, so marks look the same on every
 *  platform and font. Decorative by default: the word next to each icon carries the meaning. */
type Name = "check" | "cross" | "question" | "arrow-right" | "arrow-down" | "dot" | "play" | "doc";

const PATHS: Record<Name, string> = {
  check: "M5 12.5l4.2 4.2L19 7",
  cross: "M6.5 6.5l11 11M17.5 6.5l-11 11",
  question: "M9.2 9.2a2.9 2.9 0 1 1 4.1 2.6c-.8.4-1.3 1-1.3 1.9v.6M12 17.6v.1",
  "arrow-right": "M5 12h13M13 6.5l5.5 5.5L13 17.5",
  "arrow-down": "M12 5v13M6.5 13l5.5 5.5 5.5-5.5",
  dot: "",
  play: "M8 5.5v13l10.5-6.5z",
  doc: "M7 3.5h7l4 4V20.5H7zM14 3.5v4h4",
};

export function Icon({ name, size = "1em", className, label }: { name: Name; size?: string; className?: string; label?: string }) {
  return (
    <svg className={`ic${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {name === "dot" ? <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />
        : name === "play" ? <path d={PATHS.play} fill="currentColor" stroke="none" />
        : <path d={PATHS[name]} />}
    </svg>
  );
}

/** The icon for a status word: met / not met / unproven (and the same for present / absent / unknown). */
export function StatusIcon({ s }: { s: string }) {
  const name: Name = s === "pass" || s === "present" || s === "PASS" || s === "ok" ? "check" : s === "fail" || s === "absent" || s === "FAIL" || s === "bad" ? "cross" : "question";
  return <Icon name={name} />;
}
