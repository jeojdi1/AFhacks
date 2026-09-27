// The production security layer, shown on the demo notice and /security.
// Honest by construction: `demo` says what this demo actually does, `production` is the plan.
// `activeNow` is true only for controls this demo already enforces. Never mark a planned control active.

export interface SecurityLayer {
  key: string
  title: string
  /** What this demo does today. */
  demo: string
  /** What Shieldworks runs with in production (planned). */
  production: string
  /** True only when the demo already enforces it. */
  activeNow: boolean
}

export const SECURITY_LAYERS: SecurityLayer[] = [
  {
    key: "drawings",
    title: "No drawings or technical data",
    demo: "Matching uses part metadata only (process, material, size). Nothing asks for or stores drawings.",
    production:
      "Same rule. Drawings move only through the defence company's own secure channel, and only after Shieldworks is registered in the Controlled Goods Program.",
    activeNow: true,
  },
  {
    key: "controlled",
    title: "Controlled jobs go to cleared shops only",
    demo: "A controlled job can only be matched to a shop registered in the Controlled Goods Program. The engine enforces it and tests it.",
    production: "Same rule, plus CPCSC checks and registration expiry alerts before any offer goes out.",
    activeNow: true,
  },
  {
    key: "people",
    title: "No personal information",
    demo: "No names anywhere. Trainees are seat numbers (\"Seat 3 of 4\") and contacts are role emails.",
    production: "Keep only what a contract needs, with consent. Shops can export or delete their profile.",
    activeNow: true,
  },
  {
    key: "ai",
    title: "AI suggests, rules decide",
    demo: "AI only reads part descriptions into fixed labels, checked against a strict format. Answers are saved, so the same parts list gives the same result every time; keyword rules take over if the AI is down. Every match, security check and credit number is plain code, with its reasons shown.",
    production: "Same design. Every AI answer is logged next to the rule decision it fed, so a person can review or override it.",
    activeNow: true,
  },
  {
    key: "private-ai",
    title: "Private AI",
    demo: "Part descriptions from the fictional parts list only.",
    production: "The model runs in a Canadian region with no data retention and no training on customer data. It never sees drawings or controlled technical data.",
    activeNow: false,
  },
  {
    key: "signin",
    title: "Sign-in with two-factor",
    demo: "Demo accounts, one tap, no password.",
    production: "Company single sign-on plus two-factor authentication for every user. Sessions expire.",
    activeNow: false,
  },
  {
    key: "access",
    title: "Each company sees only its own data",
    demo: "Anyone on this network can open any view.",
    production:
      "Separate accounts per company with role-based access: a shop sees only its offers, a defence company only its programs, a college only its seats.",
    activeNow: false,
  },
  {
    key: "encryption",
    title: "Encrypted everywhere",
    demo: "Runs on this laptop over local Wi-Fi.",
    production: "TLS 1.3 in transit, AES-256 at rest, keys held in a managed key vault and rotated.",
    activeNow: false,
  },
  {
    key: "hosting",
    title: "Hosted in Canada",
    demo: "This laptop.",
    production:
      "A Canadian cloud region with a provider that is registered in the Controlled Goods Program. Data stays in Canada. Backups are encrypted.",
    activeNow: false,
  },
  {
    key: "audit",
    title: "Audit trail",
    demo: "A simple log of demo actions (accepts, declines, funding).",
    production: "Every view, change and export recorded in a tamper-evident audit log that the defence company can hand to the government.",
    activeNow: false,
  },
]

export const DEMO_FACTS = [
  "Northgate Land Systems is a fictional defence company.",
  "The shops that get work are synthetic. Real shops from public data are labelled and never sent work.",
  "ITB rules are simplified. Contracts, paperwork and signatures are demo only: nothing is signed or sent.",
]
