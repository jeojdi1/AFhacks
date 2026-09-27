"use client";

import { Fragment } from "react";

import { Term } from "@/components/muster/term";
import { plainFor } from "@/lib/ui/plain";

// Engine text (part descriptions, match reasons) still carries acronyms such as
// "structural welding to CWB W47.1" or "CPCSC Level 1". On screen each becomes
// "plain label (ACRONYM)" inside a <Term>, so hover or focus explains it and no acronym
// sits on screen by itself (docs/ux-simplification.md §2). The data is not changed.
const ACRONYM = /\b(CWB W47\.1|CWB|CPCSC Level 1|CPCSC L1|CPCSC|CGP|CCV|SMB|SME|ITB|NAICS)\b/g;

const KEY: Record<string, string> = {
  "CWB W47.1": "CWB_W47.1",
  CWB: "CWB_W47.1",
  "CPCSC Level 1": "CPCSC_L1",
  "CPCSC L1": "CPCSC_L1",
  CPCSC: "CPCSC_L1",
  CGP: "CGP",
  CCV: "CCV",
  SMB: "SMB",
  SME: "SMB",
  ITB: "ITB",
  NAICS: "NAICS",
};

export function TermText({ text }: { text: string }) {
  const parts = text.split(ACRONYM);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const key = KEY[p] ?? p;
        // Already "(CGP)" in the source: keep the acronym. Otherwise show the plain label first:
        // "structural welding to welding certification (CWB W47.1)".
        const inParens = /\($/.test(parts[i - 1] ?? "");
        const plain = plainFor(key);
        const visible = inParens || !plain ? p : LOWER.has(key) ? lowerFirst(plain.first) : plain.first;
        return (
          <Term key={i} k={key}>
            {visible}
          </Term>
        );
      })}
    </>
  );
}

/** Common nouns that read mid-sentence in lower case ("welding certification (CWB W47.1)"). */
const LOWER = new Set(["CWB_W47.1", "CPCSC_L1"]);

function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/**
 * Engine blocked reason → plain words (§8.3 program.stuck.reason):
 * "Both CWB W47.1 welding shops are at capacity (18 and 16 h/week free vs 40 needed); 2 other…"
 * → "both certified welding shops are full (18 and 16 hrs/wk free, 40 needed)".
 * The full engine sentence stays available as the row's title.
 */
export function plainStuckReason(reason: string): string {
  const first = (reason.split(";")[0] ?? reason).trim();
  const s = first
    .replace(/CWB W47\.1 /g, "certified ")
    .replace(/CWB W47\.1/g, "welding certification")
    .replace(/\bat capacity\b/g, "full")
    .replace(/h\/week/g, "hrs/wk")
    .replace(/ vs /g, ", ")
    .replace(/\s*\(certified-welder shortage\)/g, "");
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "Tessellate Precision Machining Inc." → "Tessellate Precision Machining" (titles only). */
export function shortShopName(name: string): string {
  return name.replace(/,?\s+(Inc|Ltd|Limited|Corp|Corporation|Co)\.?$/i, "").trim();
}
