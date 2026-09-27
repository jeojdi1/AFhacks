// Colour roles for the ITB Scorecard charts and meters.
// One emphasis hue (cyan) for the SME 2x story, never the brand red, which reads as a warning
// on a chart (QA Q34); slate for everything else; emerald only for credit created by funded
// training (the "funded" state).

export const SC = {
  accent: "#0E7490", // cyan-700: SME direct (2x), the page's single emphasis
  accentSoft: "#CFFAFE", // same hue, light step: the "work value" ghost behind the SME bar
  ink: "#1E293B", // slate-800: base credit / direct credit
  inkSoft: "#E2E8F0", // slate-200: meter track
  regular: "#94A3B8", // slate-400: regular 1x work
  regularSoft: "#E2E8F0",
  funded: "#059669", // emerald-600: credit unlocked by funded training
  fundedSoft: "#BBF7D0",
  track: "#F1F5F9", // slate-100: empty-row track
  textPrimary: "#0F172A",
  textSecondary: "#475569",
  textMuted: "#64748B",
} as const;

export type CategoryKey = "regular" | "sme_direct" | "training" | "indigenous_training";

export function categoryColors(category: string): { solid: string; soft: string } {
  switch (category) {
    case "sme_direct":
      return { solid: SC.accent, soft: SC.accentSoft };
    case "training":
    case "indigenous_training":
      return { solid: SC.funded, soft: SC.fundedSoft };
    default:
      return { solid: SC.regular, soft: SC.regularSoft };
  }
}
