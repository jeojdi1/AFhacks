# Decisions log

Short record of scope decisions and why. Newest last.

## Sat Sept 26, ~6 PM (kickoff, James + Claude)

1. **Shop side is on the demo path (P0).** Shieldworks is two-sided: primes pay, shops use it free. The pitch says "we help both", so judges must see a shop get something: a Northgate offer to accept, a readiness card ("Get CWB W47.1 → qualify for N more jobs worth $X"), and welders in training after the prime funds it. H3.5 promoted to P0; H2.9 added; demo gate step 8 (`shop`) added.
2. **Fleet-sized quantities (package ≈ $40M).** With single-order quantities the 40 parts are worth ~$4M, which is ~1.6% of the $500M obligation; the meter looks empty and the Fund jump is invisible. Real work packages are priced over the whole fleet, so `qty` is the fleet-lifetime quantity. Rejected: a made-up "prior credits" baseline (a judge could ask where it came from).
3. **36 assigned / 4 blocked.** The original "~30 assigned, 3–5 blocked" did not add up to 40; every job is either assigned or blocked.
4. **`pending_training` counts in the rules**, otherwise a funded package cannot unblock anything. `credit_added` = training credit + newly assigned jobs' credit, and the fund response carries a `headline` for the UI.
5. **`requires_cpcsc` = `"CPCSC_L1"` in `required_certs`** (no separate field).
6. **SMB progress = CCV of SME work before multipliers**, labelled assumption.
7. **Repo is `jeojdi1/AFhacks`, public from the start** (submission requires public anyway).
8. **Python 3.12 via uv** because the system Python is 3.14 and some wheels (OR-Tools) may lag.

## Wed Sept 30 (shop feedback: every trade, not just welders)

9. **Training covers every trade, not just welders.** Shop feedback: a machine shop ("more machinist than welders"), a gear maker ("we are not a welding shop"), an electronics shop (subassemblies and box builds) and a fabricator ("the issue is not certified welders"). `data/rules/training_costs.json` now has a `trades` catalog (welding, CNC machining, electronics assembly, cable and harness assembly, coatings and plating, quality inspection; every cost labelled assumption, with sources). A gap maps to its trade: a missing cert through the trade's `certs` (CWB W47.1, IPC J-STD-001 / IPC-A-610 / IPC/WHMA-A-620), missing capacity through its `processes`. Packages, readiness ("Train 2 CNC machinists (+40 h/week CNC milling) → …") and training messages name the trade; generic UI copy says "qualified workers". IPC certifications are operator certifications a shop declares, required only when a line names the standard. Welding keeps its original costs and wording, so the Northgate demo (36/4, TP-01 $96K → $480K, 11.5% → 13.4%) is unchanged. Rejected: new response fields (every fixture golden would change); the web derives the trade from `cert_unlock` / `capacity_unlock` with the same catalog.
