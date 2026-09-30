// Demo accounts for the sign-in screen and role portals.
//
// Demo sign-in — fictional accounts, no real authentication. Nothing is sent
// anywhere: the chosen account lives in this browser's localStorage only
// (see ./session.ts). No personal names (CLAUDE.md §5): every account is a
// role at a fictional, synthetic or example organisation; the trainee is a
// pseudonymous seat.

export type Role = "prime" | "shop" | "college" | "trainee"

export interface DemoAccount {
  role: Role
  /** Stable id stored in the session. The shop account's id is its shop id. */
  accountId: string
  /** Who signs in, as shown on the card and in the account menu. */
  who: string
  /** Short name for the header button (fits at 390 px). */
  short: string
  /** The organisation line, with its required label. */
  org: string
  /** Role at that organisation. */
  title: string
  /** What they will do here, one plain sentence. */
  does: string
  /** Their portal home. */
  home: string
  /** Required honesty label for the organisation. */
  label: string
}

export const DEMO_SIGNIN_LABEL = "Demo sign-in — fictional accounts, no real authentication"

export const ACCOUNTS: readonly DemoAccount[] = [
  {
    role: "prime",
    accountId: "northgate-supplier-dev",
    who: "Northgate Land Systems · supplier development",
    short: "Northgate",
    org: "Northgate Land Systems",
    title: "Supplier development",
    does: "Post a parts list, see which small shops took the work, and fund training when qualified workers are short.",
    home: "/prime",
    label: "Fictional defence company",
  },
  {
    role: "shop",
    accountId: "syn-012",
    who: "Tallowfield Fabricating Ltd. (synthetic) · owner",
    short: "Tallowfield",
    org: "Tallowfield Fabricating Ltd.",
    title: "Owner",
    does: "See job offers from Northgate, what one certificate would unlock, and which certificates are due.",
    home: "/shop",
    label: "Synthetic demo shop",
  },
  {
    role: "college",
    accountId: "college-example",
    who: "Regional college (example, not affiliated) · training coordinator",
    short: "College",
    org: "Regional college",
    title: "Training coordinator",
    does: "Fill the training seats Northgate pays for, and keep the records that let the training count.",
    home: "/college",
    label: "Example (not affiliated)",
  },
  {
    role: "trainee",
    accountId: "TP-01-seat-3",
    who: "Seat 3 of 4 · TP-01",
    short: "Seat 3 of 4",
    org: "Welder training seat",
    title: "Trainee (pseudonymous)",
    does: "Follow your training seat from enrolment to your welding test, and the shop job waiting after it.",
    home: "/trainee",
    label: "Pseudonymous seat",
  },
]

export const TRAINEE_SEAT_HREF = "/m/trainee/TP-01?seat=3"

export function accountFor(role: Role | null | undefined): DemoAccount | null {
  if (!role) return null
  return ACCOUNTS.find((a) => a.role === role) ?? null
}

export function isRole(v: unknown): v is Role {
  return v === "prime" || v === "shop" || v === "college" || v === "trainee"
}
