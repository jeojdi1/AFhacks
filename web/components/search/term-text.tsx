"use client"

import * as React from "react"
import { Term } from "@/components/muster/term"

// Engine text (job descriptions, node labels) can carry acronyms. Wrap each in <Term> so it
// is never bare on screen (docs/ux-simplification.md §2); the text itself is unchanged.
const PATTERN = /\b(CWB W47\.1|CSA W47\.1|CPCSC(?: Level 1| L1)?|CGP|ITB|SMB|SME|CCV|NAICS)\b/g
const KEY: Record<string, string> = {
  "CWB W47.1": "CWB_W47.1",
  "CSA W47.1": "CWB_W47.1",
  CPCSC: "CPCSC_L1",
  "CPCSC Level 1": "CPCSC_L1",
  "CPCSC L1": "CPCSC_L1",
}

export function TermText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(PATTERN)) {
    const i = m.index ?? 0
    if (i > last) parts.push(text.slice(last, i))
    parts.push(
      <Term key={i} k={KEY[m[0]] ?? m[0]}>
        {m[0]}
      </Term>
    )
    last = i + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
