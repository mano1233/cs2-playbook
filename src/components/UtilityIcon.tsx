import { UTILITY, type BuyUtility } from "@/lib/mirage-buy-plan";

export function UtilityIcon({ kind, colour }: { kind: BuyUtility; colour?: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colour ?? UTILITY[kind].colour} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={UTILITY[kind].label}>
      <title>{UTILITY[kind].label}</title>
      {kind === "smoke" ? <><path d="M8 9h8v12H8zM10 9V5h5l3 4M10 13h4M10 17h4" /><path d="M5 6c-3-2 1-3 0-5M20 6c-3-2 1-3 0-5" /></> : null}
      {kind === "flash" ? <><rect x="8" y="7" width="8" height="14" rx="2" /><path d="M10 7V3h5l3 5M3 10l2 2M21 10l-2 2M12 11v6M9 14h6" /></> : null}
      {kind === "molotov" ? <><path d="M10 8V3h4v5l3 5v8H7v-8zM10 2h6l2 3M8 15h8" /><path d="M20 8c-3-1 0-3-1-5 4 2 3 4 1 5z" /></> : null}
    </svg>
  );
}
