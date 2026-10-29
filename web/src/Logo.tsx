/** The mark: a dashed square (what the minutes claim) offset against a solid square (what the evidence shows).
 *  Where they fail to line up is the product. Uses currentColor plus the "contradicted" red. */
export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="3" width="17" height="17" rx="2.5" fill="none" stroke="var(--bad)" strokeWidth="2.2" strokeDasharray="3.2 2.6" />
      <rect x="11" y="11" width="18" height="18" rx="2.5" fill="currentColor" />
    </svg>
  );
}
