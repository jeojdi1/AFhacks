#!/usr/bin/env python3
"""Build the Northgate demo scenario and every fixture in data/fixtures (H0.3).

Run: `make fixtures` (= .venv/bin/python scripts/build_fixtures.py). Standard library only.

What it does, in order:
  1. Defines the scenario in code: 30 synthetic shops, 40 Northgate parts lines, the program,
     and the simplified rules (policy, filters, weights, training costs).
  2. Writes the engine's input drafts:
       data/processed/{shops_synthetic.json, parts_northgate.csv, program_northgate.json}
       data/rules/{policy.json, filters.json, weights.json, training_costs.json}
       data/cache/tags_northgate.json
  3. Simulates the engine in plain Python (CLAUDE.md §3):
       rules -> scoring -> greedy assignment -> ledger -> gaps -> training packages
       -> fund TP-01 -> fund TP-02 -> shop readiness
  4. Writes every fixture listed in docs/api.md §4 with the shapes in docs/api.md §2-§3.
  5. Asserts every scenario target and exits non-zero with a clear message if one fails.

Deterministic: no randomness, stable ordering, money rounded to cents (Decimal, half-up),
JSON pretty-printed with indent 2 and a trailing newline. Re-running gives byte-identical files.

Everything here is fictional: Northgate Land Systems is a fictional prime and every shop is
synthetic. Policy numbers come from CLAUDE.md §4 / §11; anything else is labelled "assumption".
"""

from __future__ import annotations

import copy
import csv
import hashlib
import io
import json
import math
import sys
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES = ROOT / "data" / "fixtures"
PROCESSED = ROOT / "data" / "processed"
RULES = ROOT / "data" / "rules"
CACHE = ROOT / "data" / "cache"

RULES_VERSION = "demo-2026-09-26"
RULES_LABEL = "Simplified ITB rules for demo"
SYNTHETIC_LABEL = "Synthetic"

# ---------------------------------------------------------------------------------------------
# Vocabularies (docs/api.md §1)
# ---------------------------------------------------------------------------------------------

PROCESS_TAGS = [
    "cnc_milling", "five_axis_milling", "cnc_turning", "sheet_metal", "welding", "heat_treat",
    "anodizing", "plating", "painting", "wire_harness", "electronics_assembly", "fasteners",
]
MATERIALS = ["steel", "armour_steel", "stainless", "aluminum", "titanium", "copper", "polymer"]
TOLERANCE = ["standard", "precision", "ultra"]
CERT_TYPES = [
    "CGP", "CPCSC_L1", "ISO9001", "AS9100",
    "NADCAP:HEAT_TREAT", "NADCAP:CHEM_PROCESSING", "NADCAP:COATINGS", "CWB_W47.1",
]
COUNTING_STATUSES = ["verified", "declared", "pending_training"]
FILTERS = ["process", "envelope", "certs", "controlled_cgp", "cpcsc", "capacity"]
CITIES = ["Kitchener", "Waterloo", "Cambridge", "Woolwich", "London", "Hamilton"]

PROCESS_LABEL = {
    "cnc_milling": "CNC milling", "five_axis_milling": "5-axis milling",
    "cnc_turning": "CNC turning", "sheet_metal": "sheet metal", "welding": "welding",
    "heat_treat": "heat treating", "anodizing": "anodizing", "plating": "plating",
    "painting": "painting", "wire_harness": "wire harness",
    "electronics_assembly": "electronics assembly", "fasteners": "fasteners",
}
CERT_LABEL = {
    "CGP": "CGP registration", "CPCSC_L1": "CPCSC Level 1", "ISO9001": "ISO 9001",
    "AS9100": "AS9100", "NADCAP:HEAT_TREAT": "Nadcap heat treating",
    "NADCAP:CHEM_PROCESSING": "Nadcap chemical processing", "NADCAP:COATINGS": "Nadcap coatings",
    "CWB_W47.1": "CWB W47.1",
}
# Most specific first: used to pick the cert named in an assignment's capability reason.
CERT_REASON_PRIORITY = [
    "CWB_W47.1", "NADCAP:HEAT_TREAT", "NADCAP:CHEM_PROCESSING", "NADCAP:COATINGS",
    "AS9100", "CPCSC_L1", "ISO9001",
]

# ---------------------------------------------------------------------------------------------
# Sources (CLAUDE.md §11)
# ---------------------------------------------------------------------------------------------

SRC_ITB_OVERVIEW = ("https://ised-isde.canada.ca/site/ised/en/procurement-services/"
                    "defence-and-marine-procurement/industrial-and-technological-benefits-itb")
SRC_ITB_POLICY = "https://ised-isde.canada.ca/site/industrial-technological-benefits/en/itb-policy"
SRC_MODEL_TERMS = ("https://ised-isde.canada.ca/site/ised/en/procurement-services/"
                   "defence-and-marine-procurement/industrial-and-technological-benefits-itb/"
                   "itb-toolkit/itb-model-terms-and-conditions")
SRC_GOWLING = ("https://gowlingwlg.com/en/insights-resources/articles/2026/"
               "industrial-and-technological-benefits-policy")
SRC_CGP = ("https://www.canada.ca/en/public-services-procurement/services/industrial-security/"
           "controlled-goods/find-individuals-organizations-registered-program.html")
SRC_CPCSC = ("https://www.canada.ca/en/public-services-procurement/news/2026/04/"
             "canadian-program-for-cyber-security-certification-level-1.html")
SRC_CWB = "https://www.cwbgroup.org/directory/certified-companies"
SRC_NADCAP = "https://www.eauditnet.com"
SRC_IAF = "https://www.iafcertsearch.org"

# ---------------------------------------------------------------------------------------------
# Program
# ---------------------------------------------------------------------------------------------

PROGRAM = {
    "id": "northgate",
    "prime_name": "Northgate Land Systems",
    "prime_label": "Fictional prime",
    "site": {"city": "London", "lat": 42.9849, "lon": -81.2453},
    "contract_value_cad": 500000000.0,
    "obligation_cad": 500000000.0,
    "smb_target_pct": 0.15,
    "rules_version": RULES_VERSION,
    "rules_label": RULES_LABEL,
}
FLEET_VEHICLES = 360  # fictional armoured vehicle fleet; qty = per_vehicle * 360 + spares

# ---------------------------------------------------------------------------------------------
# Rules drafts (data/rules/*.json)
# ---------------------------------------------------------------------------------------------

WEIGHTS = {
    "label": RULES_LABEL,
    "description": ("Match score = w_fit*fit + w_distance*(1 - d/d_max) + w_lead_time*(1 - lead/lead_max)"
                    " + w_itb_value*itb_norm (CLAUDE.md §3.3). Each term is clamped to [0, 1]."),
    "weights": {"fit": 0.35, "distance": 0.25, "lead_time": 0.15, "itb_value": 0.25},
    "d_max_km": 200,
    "lead_max_days": 60,
    "itb_norm": {"sme": 1.0, "non_sme": 0.5,
                 "note": "SMEs earn 2x direct credit (ITB overview), so they score higher."},
    "distance_from": "program site (Program.site)",
    "fit": {
        "description": ("fit = 0.40*tolerance + 0.35*material + 0.25*envelope, in [0, 1]."),
        "components": {"tolerance": 0.40, "material": 0.35, "envelope": 0.25},
        "tolerance": {"shop_equals_job": 1.0, "shop_better_than_job": 0.85,
                      "shop_worse_than_job": 0.3,
                      "note": "Tolerance is a score term, not a hard filter (docs/api.md §1)."},
        "material": {"in_shop_materials": 1.0, "not_listed": 0.4},
        "envelope": {"formula": "0.6 + 0.4*min(1, margin/0.5)",
                     "margin": "min over sorted dims of (shop_dim - job_dim) / shop_dim"},
    },
    "tie_break": "higher score first, then lower shop id",
    "assignment": ("Greedy fallback: hardest job first (fewest shops passing every filter except "
                   "capacity; ties by higher est_value_cad, then job id); each job goes to the "
                   "best-scoring shop that passes every filter including remaining capacity. "
                   "After funding, only still-blocked jobs are re-routed; existing assignments stay."),
    "flags": ["assumption"],
}

FILTERS_RULES = {
    "label": RULES_LABEL,
    "counting_cert_statuses": COUNTING_STATUSES,
    "counting_note": ("A certification counts if its status is verified, declared or pending_training. "
                      "pending_training is only created by funding a training package."),
    "filters": [
        {"code": "process",
         "description": "The shop offers every one of the job's process_tags."},
        {"code": "envelope",
         "description": ("The job fits the shop's work envelope: the job's sorted dimensions are each "
                         "<= the shop's sorted max_envelope_mm.")},
        {"code": "certs",
         "description": ("Every certification in the job's required_certs (other than CPCSC_L1, which "
                         "the cpcsc filter checks) has a counting status at the shop.")},
        {"code": "controlled_cgp",
         "description": ("A controlled job (controlled: true; technical data is a controlled good) may "
                         "only go to a shop whose CGP registration counts. Muster never stores drawings.")},
        {"code": "cpcsc",
         "description": ("If CPCSC_L1 is in the job's required_certs, the shop's CPCSC_L1 must count "
                         "(self-assessed, shop-declared).")},
        {"code": "capacity",
         "description": ("The shop's remaining weekly capacity (capacity_hours_week minus hours_week of "
                         "jobs already assigned to it) is >= the job's hours_week.")},
    ],
    "capacity_rule": "remaining_hours_week >= job.hours_week",
    "eligible_definition": "A shop is eligible for a job when it passes all six filters.",
    "near_miss_definition": ("A near-miss shop fails only the certs filter (on one trainable cert) or "
                             "only the capacity filter; training packages are built for near misses."),
}

TRAINING_COSTS = {
    "label": RULES_LABEL,
    "note": ("Illustrative costs for the demo. Every number here is an assumption, not a quote or a "
             "policy value; confirm eligibility and costs with the Defence Investment Agency."),
    "costs": {
        "personal_certification": {
            "cwb_w47_1_welder_cad": 24000,
            "unit": "per trainee",
            "includes": "Welder certification to CWB W47.1 / CSA W59 tests, course fees, shop time",
            "flag": "assumption",
            "note": "Illustrative per-welder cost; not a quote.",
        },
        "apprentice_sponsorship": {
            "welding_apprentice_cad": 20000,
            "unit": "per apprentice (first-year sponsorship)",
            "includes": "Sponsorship costs for a registered welding apprentice",
            "flag": "assumption",
            "note": "Illustrative per-apprentice cost; not a quote.",
        },
    },
    "capacity_per_trainee_hours_week": {
        "value": 20, "flag": "assumption",
        "note": "Production hours per week a newly certified welder or apprentice adds to a shop.",
    },
    "cert_package_trainees": {
        "value": 4, "flag": "assumption",
        "note": "Default cohort size for a certification package (one college course section).",
    },
    "recipient_by_gap": {
        "cert": {"category": "personal_certification",
                 "categories": ["personal_certification", "apprentice_sponsorship"],
                 "recipient_type": "college",
                 "recipient_example": "Conestoga College (example, not affiliated)",
                 "credit_category": "training", "multiplier": 5,
                 "flag": "assumption"},
        "capacity": {"category": "apprentice_sponsorship",
                     "categories": ["apprentice_sponsorship"],
                     "recipient_type": "indigenous_institution",
                     "recipient_example": "Indigenous-governed training institute (example, not affiliated)",
                     "credit_category": "indigenous_training", "multiplier": 10,
                     "flag": "assumption",
                     "note": ("Demo assumption: capacity gaps are filled by sponsoring apprentices through "
                              "an Indigenous-governed training institution (10x per the ITB overview).")},
    },
    "trainable_certs": ["CWB_W47.1"],
}

POLICY = {
    "label": RULES_LABEL,
    "rules_version": RULES_VERSION,
    "note": ("Values from CLAUDE.md §4, each with its source (CLAUDE.md §11). Never invent a policy "
             "number; anything else is labelled assumption."),
    "obligation": {
        "value": 1.0, "unit": "fraction of contract value",
        "description": "A prime must do business activity in Canada equal to 100% of the contract value.",
        "source": SRC_ITB_OVERVIEW,
    },
    "thresholds": {
        "automatic_above_cad": 100000000,
        "review_range_cad": [25000000, 100000000],
        "description": "The policy applies automatically above $100M; contracts of $25M-$100M are reviewed.",
        "source": SRC_ITB_OVERVIEW,
    },
    "credit_measure": {
        "value": "CCV", "description": "Credit is measured in Canadian Content Value (CCV).",
        "source": SRC_ITB_POLICY,
    },
    "smb_requirement_example": {
        "value": 0.15, "unit": "fraction of contract price",
        "description": "A contract may carry a mandatory SMB requirement, e.g. 15% of the contract price.",
        "source": SRC_ITB_POLICY,
    },
    "direct_indirect": {
        "direct": "Work on the contract itself.",
        "indirect": "Any other eligible activity.",
        "excess": "Excess credit can be applied elsewhere.",
        "source": SRC_MODEL_TERMS,
    },
    "value_proposition": {
        "min_bid_weight": 0.10, "unit": "fraction of bid score",
        "description": "The Value Proposition is generally weighted at least 10% of the bid score.",
        "source": SRC_GOWLING,
    },
    "banking": {
        "max_years": 10, "description": "Credits can be banked for up to 10 years.",
        "source": SRC_GOWLING,
    },
    "multipliers": {
        "regular": 1, "sme_direct": 2, "training": 5, "indigenous_training": 10,
        "description": ("Regular work 1x, SME direct work 2x, eligible skills and training 5x, "
                        "Indigenous workforce development 10x."),
        "source": SRC_ITB_OVERVIEW,
    },
    "training_categories": {
        "values": [
            {"id": "apprentice_sponsorship",
             "description": "Sponsorship costs for apprentices in a recognized apprenticeship program"},
            {"id": "personal_certification",
             "description": ("Certification for a Canadian citizen or permanent resident by a recognized "
                             "trade body")},
            {"id": "skills_program_contribution",
             "description": "Contribution to a skills program through a registered charity or nonprofit"},
            {"id": "education_costs",
             "description": "Tuition, course fees and travel incurred in Canada"},
        ],
        "reference": "ITB model terms §7.5.1",
        "source": SRC_MODEL_TERMS,
    },
    "authority": {
        "agency": "Defence Investment Agency", "effective_date": "2026-07-16",
        "contact": "ITB-RIT@dia-aid.gc.ca",
        "description": "ITB authority moved to the Defence Investment Agency on July 16, 2026.",
        "source": SRC_ITB_OVERVIEW,
    },
    "compliance_gates": {
        "controlled_goods": {
            "description": ("Technical data counts as a controlled good. Muster never stores drawings. "
                            "A controlled job may only go to a CGP-registered shop."),
            "source": SRC_CGP,
        },
        "cpcsc_level_1": {
            "description": "13 controls, self-assessed, no public registry. Always a shop-declared field.",
            "source": SRC_CPCSC,
        },
        "quality_and_process_certs": {
            "description": "ISO, AS9100, Nadcap, CWB: record source, verified_at and status.",
            "sources": {"ISO9001/AS9100": SRC_IAF, "Nadcap": SRC_NADCAP, "CWB": SRC_CWB},
        },
    },
    "assumptions": [
        {"id": "smb_progress_basis",
         "description": "SMB progress counts the CCV of SME work before multipliers.",
         "flag": "assumption"},
        {"id": "credit_formula",
         "description": "credit = value_cad x ccv_pct x multiplier; funded training has ccv_pct 1.0.",
         "flag": "assumption"},
        {"id": "sme_definition",
         "description": "SME = fewer than 500 employees (demo simplification).",
         "flag": "assumption"},
    ],
}

# ---------------------------------------------------------------------------------------------
# Shops (all synthetic; fictional names; role-based emails on the reserved .example TLD)
# ---------------------------------------------------------------------------------------------
# certs: the cert types this shop has DECLARED; every other cert type is "unknown".

def shop_def(**kw):
    return kw


SHOP_DEFS = [
    shop_def(id="syn-001", name="Tessellate Precision Machining Inc.", city="Kitchener",
             lat=43.4186, lon=-80.4450, naics="332710", band="50-99",
             processes=["five_axis_milling", "cnc_milling"],
             machines=["5-axis horizontal machining centre (2)", "3-axis VMC (4)", "Coordinate measuring machine"],
             materials=["steel", "aluminum", "titanium", "stainless"], env=[2200, 2200, 1000],
             tol="ultra", cap=90, lead=35, email="quotes@tessellate-precision.example",
             certs=["CGP", "ISO9001", "AS9100"]),
    shop_def(id="syn-002", name="Kestrel Axis Manufacturing Ltd.", city="Waterloo",
             lat=43.4880, lon=-80.5390, naics="332710", band="20-49",
             processes=["five_axis_milling", "cnc_milling", "cnc_turning"],
             machines=["5-axis trunnion VMC (2)", "3-axis VMC (3)", "CNC lathe (2)"],
             materials=["aluminum", "steel", "titanium"], env=[800, 600, 500],
             tol="ultra", cap=70, lead=28, email="rfq@kestrel-axis.example",
             certs=["CGP", "ISO9001", "AS9100"]),
    shop_def(id="syn-003", name="Quillon Mill & Turn Inc.", city="Cambridge",
             lat=43.3855, lon=-80.3280, naics="332710", band="20-49",
             processes=["cnc_milling", "cnc_turning"],
             machines=["3-axis VMC (5)", "CNC lathe with live tooling (3)"],
             materials=["steel", "stainless", "aluminum"], env=[1000, 800, 600],
             tol="precision", cap=80, lead=21, email="quotes@quillon-millturn.example",
             certs=["CGP", "ISO9001"]),
    shop_def(id="syn-004", name="Forkline Weld & Machine Ltd.", city="London",
             lat=42.9480, lon=-81.2020, naics="332710", band="10-19",
             processes=["welding", "cnc_milling"],
             machines=["MIG/GMAW cells (2)", "3-axis VMC (2)"],
             materials=["steel", "aluminum"], env=[1200, 800, 600],
             tol="standard", cap=30, lead=18, email="sales@forkline-weld.example",
             certs=["ISO9001"]),
    shop_def(id="syn-005", name="Brassgate Turning & Weld Inc.", city="Kitchener",
             lat=43.4330, lon=-80.4630, naics="332710", band="10-19",
             processes=["welding", "cnc_turning"],
             machines=["TIG/GTAW stations (2)", "CNC lathe (3)"],
             materials=["steel", "stainless"], env=[1000, 700, 700],
             tol="precision", cap=60, lead=20, email="quotes@brassgate-tw.example",
             certs=["ISO9001"]),
    shop_def(id="syn-006", name="Lanternfield Sheet Metal Ltd.", city="London",
             lat=42.9285, lon=-81.2215, naics="332319", band="20-49",
             processes=["sheet_metal", "painting"],
             machines=["Fibre laser 3 m", "Press brake 220t (2)", "Powder coat line"],
             materials=["steel", "aluminum", "stainless"], env=[3000, 1500, 1000],
             tol="standard", cap=80, lead=15, email="quotes@lanternfield-sm.example",
             certs=["ISO9001"]),
    shop_def(id="syn-007", name="Pinwheel Precision Turning Inc.", city="Waterloo",
             lat=43.4972, lon=-80.5502, naics="332720", band="20-49",
             processes=["cnc_turning", "fasteners"],
             machines=["Swiss-type CNC lathes (6)", "Thread rolling (2)"],
             materials=["steel", "stainless", "titanium"], env=[400, 200, 200],
             tol="precision", cap=60, lead=25, email="rfq@pinwheel-turning.example",
             certs=["ISO9001", "AS9100"]),
    shop_def(id="syn-008", name="Anvilbrook Structural Welding Ltd.", city="Cambridge",
             lat=43.3440, lon=-80.3080, naics="332319", band="20-49",
             processes=["welding", "sheet_metal", "painting"],
             machines=["MIG/GMAW cells (3)", "Press brake 150t", "Paint booth"],
             materials=["steel", "armour_steel"], env=[2500, 1500, 1000],
             tol="standard", cap=36, lead=21, email="quotes@anvilbrook-welding.example",
             certs=["ISO9001", "CWB_W47.1"]),
    shop_def(id="syn-009", name="Emberforge Thermal Processing Corp.", city="Hamilton",
             lat=43.2450, lon=-79.7780, naics="332810", band="500-999",
             processes=["heat_treat"],
             machines=["Vacuum furnaces (4)", "Carburizing furnaces (6)", "Induction hardening"],
             materials=["steel", "armour_steel", "stainless", "titanium"], env=[3000, 1500, 1500],
             tol="precision", cap=200, lead=14, email="sales@emberforge-thermal.example",
             certs=["ISO9001", "AS9100", "NADCAP:HEAT_TREAT"]),
    shop_def(id="syn-010", name="Coldframe Heat Treating Inc.", city="Kitchener",
             lat=43.4501, lon=-80.4310, naics="332810", band="10-19",
             processes=["heat_treat"],
             machines=["Atmosphere furnaces (3)", "Temper ovens (2)"],
             materials=["steel"], env=[1500, 900, 900],
             tol="standard", cap=80, lead=10, email="quotes@coldframe-ht.example",
             certs=["ISO9001"]),
    shop_def(id="syn-011", name="Galvanta Surface Finishing Corp.", city="Cambridge",
             lat=43.3700, lon=-80.3510, naics="332810", band="500-999",
             processes=["plating", "anodizing"],
             machines=["Zinc-nickel rack and barrel lines", "Hard anodize line", "Electroless nickel tanks"],
             materials=["steel", "aluminum", "stainless"], env=[2400, 1200, 1200],
             tol="precision", cap=200, lead=12, email="sales@galvanta-finishing.example",
             certs=["ISO9001", "AS9100", "NADCAP:CHEM_PROCESSING"]),
    # DEMO SHOP (TP-01): welding + sheet metal + painting, no CWB W47.1, no ISO 9001, lots of room.
    # (CPCSC Level 1 is self-assessed, so a small shop can declare it; it unlocks nothing here alone.)
    shop_def(id="syn-012", name="Tallowfield Fabricating Ltd.", city="Woolwich",
             lat=43.5990, lon=-80.5570, naics="332319", band="20-49",
             processes=["welding", "sheet_metal", "painting"],
             machines=["MIG/GMAW cells (6)", "Press brake 175t", "Plasma table 3 m", "Paint booth 4 m"],
             materials=["steel", "armour_steel", "aluminum"], env=[3000, 1600, 1200],
             tol="standard", cap=200, lead=14, email="sales@tallowfield-fab.example",
             certs=["CPCSC_L1"]),
    shop_def(id="syn-013", name="Nickelwright Plating Ltd.", city="Hamilton",
             lat=43.2560, lon=-79.8380, naics="332810", band="10-19",
             processes=["plating"],
             machines=["Electroless nickel line", "Zinc barrel line"],
             materials=["steel", "stainless"], env=[1200, 600, 600],
             tol="standard", cap=50, lead=10, email="quotes@nickelwright.example",
             certs=["ISO9001"]),
    shop_def(id="syn-014", name="Carapace Coatings Inc.", city="London",
             lat=42.9750, lon=-81.1650, naics="332810", band="50-99",
             processes=["painting"],
             machines=["Drive-through paint booth 6 m", "CARC spray line", "Blast room"],
             materials=["steel", "armour_steel", "aluminum"], env=[4500, 2500, 2000],
             tol="standard", cap=100, lead=12, email="quotes@carapace-coatings.example",
             certs=["ISO9001", "NADCAP:COATINGS"]),
    shop_def(id="syn-015", name="Loomline Harness Systems Inc.", city="Waterloo",
             lat=43.4760, lon=-80.5130, naics="335990", band="50-99",
             processes=["wire_harness"],
             machines=["Harness boards (20)", "Automatic cut/strip/crimp (3)", "Continuity testers"],
             materials=["copper", "polymer"], env=[4000, 1000, 500],
             tol="precision", cap=80, lead=20, email="rfq@loomline-harness.example",
             certs=["ISO9001"]),
    shop_def(id="syn-016", name="Trunkline Interconnect Corp.", city="London",
             lat=42.9365, lon=-81.2780, naics="335920", band="500-999",
             processes=["wire_harness", "electronics_assembly"],
             machines=["Harness assembly cells (40)", "SMT lines (3)", "Environmental test chamber"],
             materials=["copper", "polymer", "aluminum"], env=[4000, 1200, 800],
             tol="precision", cap=300, lead=45, email="sales@trunkline-interconnect.example",
             certs=["CGP", "CPCSC_L1", "ISO9001", "AS9100"]),
    shop_def(id="syn-017", name="Bitmesh Electronics Assembly Inc.", city="Waterloo",
             lat=43.4905, lon=-80.5270, naics="334410", band="50-99",
             processes=["electronics_assembly", "cnc_milling"],
             machines=["SMT line", "Selective solder", "3-axis VMC (2) for enclosures"],
             materials=["aluminum", "copper", "polymer"], env=[600, 500, 400],
             tol="precision", cap=70, lead=30, email="quotes@bitmesh-ea.example",
             certs=["CGP", "CPCSC_L1", "ISO9001", "AS9100"]),
    shop_def(id="syn-018", name="Circuitry Row Assembly Ltd.", city="Kitchener",
             lat=43.4225, lon=-80.4857, naics="334410", band="20-49",
             processes=["electronics_assembly", "sheet_metal"],
             machines=["SMT line", "Turret punch", "Press brake 80t"],
             materials=["aluminum", "copper", "steel"], env=[800, 600, 400],
             tol="precision", cap=60, lead=25, email="rfq@circuitry-row.example",
             certs=["CGP", "CPCSC_L1", "ISO9001"]),
    shop_def(id="syn-019", name="Solderpoint Contract Manufacturing Inc.", city="Cambridge",
             lat=43.4180, lon=-80.3150, naics="335315", band="20-49",
             processes=["electronics_assembly"],
             machines=["SMT line", "Wave solder", "Box-build stations"],
             materials=["copper", "aluminum", "polymer"], env=[600, 400, 300],
             tol="precision", cap=60, lead=20, email="quotes@solderpoint-cm.example",
             certs=["ISO9001"]),
    shop_def(id="syn-020", name="Threadstone Fastener Works Ltd.", city="Hamilton",
             lat=43.2290, lon=-79.7650, naics="332720", band="20-49",
             processes=["fasteners", "cnc_turning"],
             machines=["Cold headers (3)", "Thread rollers (4)", "CNC lathe (2)"],
             materials=["steel", "stainless"], env=[300, 100, 100],
             tol="standard", cap=60, lead=15, email="sales@threadstone-fasteners.example",
             certs=["ISO9001"]),
    shop_def(id="syn-021", name="Northfield Axis Machining Inc.", city="London",
             lat=42.9980, lon=-81.2030, naics="332710", band="20-49",
             processes=["cnc_milling", "cnc_turning"],
             machines=["3-axis VMC (4)", "CNC lathe (3)", "CMM"],
             materials=["steel", "aluminum", "stainless"], env=[900, 600, 500],
             tol="precision", cap=60, lead=21, email="quotes@northfield-axis.example",
             certs=["CGP", "ISO9001"]),
    shop_def(id="syn-022", name="Orchard Line Machine Ltd.", city="Woolwich",
             lat=43.5390, lon=-80.5540, naics="332710", band="10-19",
             processes=["cnc_milling", "five_axis_milling"],
             machines=["5-axis VMC", "3-axis VMC (2)"],
             materials=["aluminum", "steel"], env=[700, 500, 400],
             tol="precision", cap=50, lead=24, email="rfq@orchardline-machine.example",
             certs=["ISO9001"]),
    shop_def(id="syn-023", name="Ridgeplate Metalworks Ltd.", city="Hamilton",
             lat=43.2510, lon=-79.8150, naics="332319", band="20-49",
             processes=["welding", "sheet_metal"],
             machines=["MIG/GMAW cells (4)", "Press brake 200t", "Plasma table"],
             materials=["steel", "armour_steel"], env=[3600, 1600, 1000],
             tol="standard", cap=36, lead=30, email="quotes@ridgeplate-metal.example",
             certs=["ISO9001"]),
    shop_def(id="syn-024", name="Glossmark Finishing Inc.", city="Kitchener",
             lat=43.4390, lon=-80.4120, naics="332810", band="10-19",
             processes=["painting"],
             machines=["Powder coat line", "Wet paint booth"],
             materials=["steel", "aluminum"], env=[2000, 1000, 1000],
             tol="standard", cap=60, lead=8, email="quotes@glossmark-finishing.example",
             certs=["ISO9001"]),
    shop_def(id="syn-025", name="Foldwell Enclosures Inc.", city="Waterloo",
             lat=43.5010, lon=-80.5405, naics="332319", band="10-19",
             processes=["sheet_metal"],
             machines=["Turret punch", "Press brake 110t (2)", "PEM insertion"],
             materials=["steel", "aluminum", "stainless"], env=[2400, 1200, 800],
             tol="standard", cap=50, lead=12, email="rfq@foldwell-enclosures.example",
             certs=["ISO9001"]),
    shop_def(id="syn-026", name="Keelbar Heavy Fabrication Ltd.", city="Hamilton",
             lat=43.2530, lon=-79.7950, naics="332319", band="100-199",
             processes=["welding", "sheet_metal", "painting"],
             machines=["Submerged-arc and MIG cells (5)", "Plate rolls", "Press brake 400t", "Paint bay"],
             materials=["steel", "armour_steel"], env=[4000, 2200, 1500],
             tol="standard", cap=36, lead=28, email="quotes@keelbar-heavyfab.example",
             certs=["ISO9001", "CWB_W47.1"]),
    shop_def(id="syn-027", name="Quintaxis Machining Inc.", city="Cambridge",
             lat=43.3600, lon=-80.2950, naics="332710", band="20-49",
             processes=["five_axis_milling", "cnc_milling"],
             machines=["5-axis VMC (3)", "3-axis VMC (2)"],
             materials=["aluminum", "steel", "titanium"], env=[1000, 800, 700],
             tol="ultra", cap=60, lead=30, email="quotes@quintaxis.example",
             certs=["ISO9001", "AS9100"]),
    shop_def(id="syn-028", name="Millrace Machine Works Ltd.", city="Woolwich",
             lat=43.6050, lon=-80.5480, naics="332710", band="10-19",
             processes=["cnc_milling", "cnc_turning"],
             machines=["3-axis VMC (3)", "CNC lathe (2)"],
             materials=["steel", "aluminum"], env=[800, 500, 400],
             tol="standard", cap=50, lead=18, email="sales@millrace-mw.example",
             certs=["ISO9001"]),
    shop_def(id="syn-029", name="Boltcraft Turning Supply Inc.", city="London",
             lat=42.9600, lon=-81.1900, naics="332720", band="10-19",
             processes=["fasteners", "cnc_turning"],
             machines=["CNC lathes (3)", "Thread roller"],
             materials=["steel", "stainless"], env=[250, 100, 100],
             tol="standard", cap=40, lead=14, email="quotes@boltcraft-turning.example",
             certs=["ISO9001"]),
    shop_def(id="syn-030", name="Stackyard Anodizing & Plating Ltd.", city="Hamilton",
             lat=43.2380, lon=-79.8420, naics="332810", band="20-49",
             processes=["anodizing", "plating"],
             machines=["Type II anodize line", "Zinc and nickel plating tanks"],
             materials=["aluminum", "steel"], env=[1500, 800, 800],
             tol="standard", cap=60, lead=10, email="quotes@stackyard-finishing.example",
             certs=["ISO9001"]),
]
NON_SME_BANDS = {"500-999", "1000+"}

DEMO_SHOP_ID = "syn-012"
CWB_SHOP_IDS = ["syn-008", "syn-026"]  # shop A (Cambridge), shop B (Hamilton)
DEMO_PACKAGE_ID = "TP-01"

# ---------------------------------------------------------------------------------------------
# Parts (40 lines; fleet-lifetime quantities)
# ---------------------------------------------------------------------------------------------
# (id, part_no, description, per_vehicle, spares, unit_price, ccv, hours_week,
#  material, process_tags, envelope_mm, tolerance, required_certs, controlled)

PART_DEFS = [
    ("NG-001", "NG-BRK-1010",
     "Antenna mount bracket, 6061-T6 aluminum, 3-axis CNC milled, ISO 9001 quality system",
     4, 80, "185.00", "0.88", 10, "aluminum", ["cnc_milling"], [220, 140, 60], "precision", ["ISO9001"], False),
    ("NG-002", "NG-BRK-1022",
     "Periscope guard bracket, mild steel, laser cut and press-brake formed sheet metal, commercial quality",
     4, 80, "140.00", "0.90", 8, "steel", ["sheet_metal"], [480, 260, 120], "standard", [], False),
    ("NG-003", "NG-HSG-2105",
     "Hydraulic valve block housing, 6061-T6 aluminum, 3-axis CNC milled, precision bores, ISO 9001",
     2, 20, "1350.00", "0.89", 18, "aluminum", ["cnc_milling"], [260, 180, 140], "precision", ["ISO9001"], False),
    ("NG-004", "NG-TUR-1120",
     "Turret ring bearing housing, 4340 steel forging, 5-axis milled, AS9100, controlled technical data (CGP)",
     1, 20, "7400.00", "0.90", 30, "steel", ["five_axis_milling"], [1900, 1900, 220], "ultra", ["AS9100"], True),
    ("NG-005", "NG-FCS-3301",
     "Fire-control sensor mounting bracket, 7075 aluminum, 5-axis milled, AS9100, controlled technical data (CGP)",
     2, 20, "1180.00", "0.88", 16, "aluminum", ["five_axis_milling"], [320, 210, 140], "ultra", ["AS9100"], True),
    ("NG-006", "NG-WPN-3350",
     "Remote weapon station mount adapter, 4140 steel, CNC turned and milled, ISO 9001, controlled technical data (CGP)",
     1, 20, "3900.00", "0.90", 20, "steel", ["cnc_milling", "cnc_turning"], [420, 420, 260], "precision", ["ISO9001"], True),
    ("NG-007", "NG-DRV-4102",
     "Final drive output shaft, 4340 steel, CNC turned and ground, ISO 9001",
     2, 40, "2100.00", "0.87", 22, "steel", ["cnc_turning"], [620, 110, 110], "precision", ["ISO9001"], False),
    ("NG-008", "NG-DRV-4118",
     "Driveline yoke flange, 4140 steel, CNC turned and milled, ISO 9001",
     4, 20, "640.00", "0.88", 18, "steel", ["cnc_turning", "cnc_milling"], [240, 240, 120], "precision", ["ISO9001"], False),
    ("NG-009", "NG-TUR-1135",
     "Turret traverse gearbox housing, A356 cast aluminum, 5-axis machined, AS9100",
     1, 20, "5200.00", "0.89", 26, "aluminum", ["five_axis_milling"], [700, 520, 380], "precision", ["AS9100"], False),
    ("NG-010", "NG-SUS-5010",
     "Suspension arm bushing sleeve, 1045 steel, CNC turned, ISO 9001",
     12, 240, "78.00", "0.91", 12, "steel", ["cnc_turning"], [140, 90, 90], "standard", ["ISO9001"], False),
    ("NG-011", "NG-HT-6001",
     "Heat treat service: through-harden and temper 4340 drive shafts, Nadcap heat treating accredited",
     4, 80, "210.00", "0.93", 10, "steel", ["heat_treat"], [700, 150, 150], "precision", ["NADCAP:HEAT_TREAT"], False),
    ("NG-012", "NG-HT-6014",
     "Heat treat service: carburize and case-harden final drive gears, ISO 9001",
     16, 240, "64.00", "0.93", 12, "steel", ["heat_treat"], [400, 400, 120], "standard", ["ISO9001"], False),
    ("NG-013", "NG-ANO-6102",
     "Type III hard anodize service, aluminum turret housings, Nadcap chemical processing",
     8, 160, "95.00", "0.94", 8, "aluminum", ["anodizing"], [700, 520, 380], "standard", ["NADCAP:CHEM_PROCESSING"], False),
    ("NG-014", "NG-ANO-6110",
     "Type II anodize service, aluminum brackets and covers, ISO 9001",
     20, 100, "38.00", "0.94", 6, "aluminum", ["anodizing"], [480, 300, 120], "standard", ["ISO9001"], False),
    ("NG-015", "NG-PLT-6201",
     "Zinc-nickel plating service, steel fasteners and brackets, Nadcap chemical processing",
     100, 0, "9.50", "0.94", 10, "steel", ["plating"], [300, 200, 100], "standard", ["NADCAP:CHEM_PROCESSING"], False),
    ("NG-016", "NG-PLT-6215",
     "Electroless nickel plating service, hydraulic manifold components, ISO 9001",
     20, 100, "58.00", "0.93", 10, "steel", ["plating"], [300, 200, 150], "standard", ["ISO9001"], False),
    ("NG-017", "NG-PNT-6301",
     "CARC paint system service, armour steel hull subassemblies up to 3.4 m, Nadcap coatings",
     4, 0, "880.00", "0.92", 24, "armour_steel", ["painting"], [3400, 1800, 1400], "standard", ["NADCAP:COATINGS"], False),
    ("NG-018", "NG-PNT-6318",
     "Powder coat service, steel interior stowage brackets and covers, commercial finish",
     30, 200, "32.00", "0.93", 10, "steel", ["painting"], [800, 500, 300], "standard", [], False),
    ("NG-019", "NG-HAR-7001",
     "Chassis power distribution wire harness, copper, IPC/WHMA-A-620 Class 3, ISO 9001",
     3, 20, "1850.00", "0.78", 26, "copper", ["wire_harness"], [2400, 300, 150], "precision", ["ISO9001"], False),
    ("NG-020", "NG-VET-7010",
     ("Vetronics data bus wire harness, shielded copper, IPC/WHMA-A-620 Class 3, CPCSC Level 1, ISO 9001, "
      "controlled technical data (CGP)"),
     3, 20, "2400.00", "0.76", 30, "copper", ["wire_harness"], [3000, 300, 150], "precision", ["CPCSC_L1", "ISO9001"], True),
    ("NG-021", "NG-STW-2210",
     "Crew stowage rack, mild steel sheet metal, formed and MIG welded, primed and painted (non-structural)",
     4, 0, "640.00", "0.91", 22, "steel", ["sheet_metal", "welding", "painting"], [1200, 600, 400], "standard", [], False),
    ("NG-022", "NG-STW-2224",
     "Tool and equipment box, steel, MIG welded and painted (non-structural)",
     3, 0, "720.00", "0.91", 24, "steel", ["welding", "painting"], [1100, 500, 450], "standard", [], False),
    ("NG-023", "NG-ELC-7105",
     "Power converter electronics assembly, IPC-A-610 Class 3, conformal coat, aluminum enclosure, ISO 9001",
     1, 20, "4800.00", "0.72", 20, "aluminum", ["electronics_assembly"], [400, 300, 150], "precision", ["ISO9001"], False),
    ("NG-024", "NG-MCC-7120",
     ("Mission computer chassis, CNC milled aluminum enclosure with electronics assembly, CPCSC Level 1, ISO 9001, "
      "controlled technical data (CGP)"),
     1, 20, "9800.00", "0.75", 28, "aluminum", ["electronics_assembly", "cnc_milling"], [480, 350, 220], "precision",
     ["CPCSC_L1", "ISO9001"], True),
    ("NG-025", "NG-ELC-7133",
     "Driver display enclosure, sheet aluminum enclosure with electronics assembly, ISO 9001",
     1, 20, "3700.00", "0.74", 16, "aluminum", ["electronics_assembly", "sheet_metal"], [420, 320, 120], "precision",
     ["ISO9001"], False),
    ("NG-026", "NG-ELC-7140",
     "Intercom control box electronics assembly, IPC-A-610, aluminum housing, ISO 9001",
     4, 60, "820.00", "0.73", 16, "aluminum", ["electronics_assembly"], [220, 160, 90], "standard", ["ISO9001"], False),
    ("NG-027", "NG-FST-8001",
     "Armour bolt kits, grade 8 steel fasteners, zinc-nickel finish, ISO 9001",
     6, 0, "145.00", "0.80", 8, "steel", ["fasteners"], [150, 60, 60], "standard", ["ISO9001"], False),
    ("NG-028", "NG-FST-8014",
     "Titanium quick-release panel fasteners, precision CNC turned, AS9100",
     40, 0, "26.00", "0.82", 8, "titanium", ["fasteners", "cnc_turning"], [60, 20, 20], "precision", ["AS9100"], False),
    ("NG-029", "NG-TOW-4401",
     "Tow bracket weldment, armour steel, structural welding to CWB W47.1, ISO 9001",
     2, 40, "820.00", "0.90", 18, "armour_steel", ["welding"], [700, 400, 300], "standard", ["CWB_W47.1", "ISO9001"], False),
    ("NG-030", "NG-STP-4405",
     "Boarding step weldment, steel, structural welding to CWB W47.1, painted, ISO 9001",
     4, 20, "390.00", "0.90", 20, "steel", ["welding", "painting"], [600, 500, 250], "standard", ["CWB_W47.1", "ISO9001"], False),
    ("NG-031", "NG-HUL-4410",
     "Hull side stowage bin weldment, armour steel plate, press-brake formed sheet metal, structural welding to CWB W47.1",
     4, 0, "1150.00", "0.90", 40, "armour_steel", ["welding", "sheet_metal"], [900, 600, 450], "standard", ["CWB_W47.1"], False),
    ("NG-032", "NG-HUL-4422",
     "Engine deck access hatch frame weldment, armour steel, structural welding to CWB W47.1",
     2, 20, "2300.00", "0.90", 44, "armour_steel", ["welding"], [1400, 1100, 200], "standard", ["CWB_W47.1"], False),
    ("NG-033", "NG-HUL-4431",
     "Rear ramp door frame weldment, armour steel, structural welding to CWB W47.1, primed and painted",
     1, 20, "4500.00", "0.90", 48, "armour_steel", ["welding", "painting"], [2400, 1500, 300], "standard", ["CWB_W47.1"], False),
    ("NG-034", "NG-HUL-4450",
     "Hull belly plate weldment, 3200 mm long, armour steel, structural welding to CWB W47.1",
     1, 20, "3950.00", "0.90", 40, "armour_steel", ["welding"], [3200, 1400, 500], "standard", ["CWB_W47.1"], False),
    ("NG-035", "NG-BRK-1040",
     "Fuel tank mounting bracket, mild steel, laser cut and press-brake formed sheet metal",
     2, 40, "260.00", "0.90", 8, "steel", ["sheet_metal"], [520, 300, 180], "standard", [], False),
    ("NG-036", "NG-HSG-2130",
     "Transmission oil cooler housing, 6061 aluminum, 3-axis CNC milled, ISO 9001",
     1, 20, "2100.00", "0.89", 14, "aluminum", ["cnc_milling"], [520, 380, 160], "precision", ["ISO9001"], False),
    ("NG-037", "NG-TUR-1150",
     "Turret hatch hinge, 4140 steel, CNC milled and turned, ISO 9001",
     2, 40, "690.00", "0.89", 12, "steel", ["cnc_milling", "cnc_turning"], [320, 160, 120], "precision", ["ISO9001"], False),
    ("NG-038", "NG-OPT-1160",
     "Periscope housing, 7075 aluminum, 5-axis milled, AS9100",
     3, 20, "1300.00", "0.88", 18, "aluminum", ["five_axis_milling"], [360, 240, 200], "ultra", ["AS9100"], False),
    ("NG-039", "NG-ELC-7155",
     "Sensor interface circuit board assembly, IPC-A-610 Class 3, ISO 9001",
     4, 60, "620.00", "0.72", 12, "copper", ["electronics_assembly"], [200, 150, 40], "precision", ["ISO9001"], False),
    ("NG-040", "NG-HAR-7022",
     "Exterior lighting wire harness, copper, IPC/WHMA-A-620, ISO 9001",
     4, 0, "420.00", "0.78", 12, "copper", ["wire_harness"], [1800, 200, 100], "standard", ["ISO9001"], False),
]

SMALL_CWB_JOBS = ["NG-029", "NG-030"]
LARGE_CWB_JOBS = ["NG-031", "NG-032", "NG-033", "NG-034"]
TP01_JOBS = ["NG-031", "NG-032", "NG-033"]
HULL_JOB = "NG-034"

# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------

CENT = Decimal("0.01")


def D(x) -> Decimal:
    return Decimal(str(x))


def cents(x) -> Decimal:
    return D(x).quantize(CENT, rounding=ROUND_HALF_UP)


def money(x) -> float:
    return float(cents(x))


def short_money(x) -> str:
    x = float(x)
    if abs(x) >= 1_000_000:
        return f"${x / 1_000_000:.1f}M"
    if abs(x) >= 1_000:
        return f"${round(x / 1000):.0f}K"
    return f"${x:.0f}"


def plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def fits(job_env, shop_env) -> bool:
    return all(j <= s for j, s in zip(sorted(job_env), sorted(shop_env)))


def dumps(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


WRITTEN: list[Path] = []


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    WRITTEN.append(path)


def write_json(path: Path, obj) -> None:
    write_text(path, dumps(obj))


def tag_key(part_no: str, description: str) -> str:
    return hashlib.sha256(f"{part_no}|{description}".encode()).hexdigest()


# ---------------------------------------------------------------------------------------------
# Build static scenario objects
# ---------------------------------------------------------------------------------------------


# One illustrative date moved into the CGP renewal window so the phone app's compliance
# wallet has a live "urgent" example (docs/app-spec.md §2.4). Expiry is not a routing filter,
# so no demo number moves.
CERT_DATE_OVERRIDES = {
    ("syn-001", "CGP"): {
        "expires_at": "2027-01-15",
        "note": "Synthetic shop: self-declared (illustrative date, inside the CGP renewal window for the demo)",
    },
}


def build_shops():
    shops = []
    for i, d in enumerate(SHOP_DEFS):
        is_sme = d["band"] not in NON_SME_BANDS
        shop = {
            "id": d["id"], "name": d["name"], "source": "synthetic", "label": SYNTHETIC_LABEL,
            "city": d["city"], "lat": d["lat"], "lon": d["lon"], "naics": d["naics"],
            "employee_band": d["band"], "is_sme": is_sme,
            "processes": list(d["processes"]), "machines": list(d["machines"]),
            "materials": list(d["materials"]), "max_envelope_mm": list(d["env"]),
            "tolerance_class": d["tol"], "capacity_hours_week": d["cap"],
            "lead_time_days": d["lead"], "website": None, "contact_role_email": d["email"],
            "provenance": [{"field": "*", "source_url": None, "confidence": "synthetic"}],
        }
        certs = []
        for k, ctype in enumerate(CERT_TYPES):
            if ctype in d["certs"]:
                day = (i * 7 + k * 3) % 25 + 1
                years = 1 + (i + k) % 3
                certs.append({
                    "shop_id": d["id"], "type": ctype, "status": "declared", "source_url": None,
                    "verified_at": f"2026-09-{day:02d}",
                    "expires_at": f"{2026 + years}-09-{day:02d}",
                    "note": "Synthetic shop: self-declared (illustrative)",
                })
            else:
                certs.append({
                    "shop_id": d["id"], "type": ctype, "status": "unknown", "source_url": None,
                    "verified_at": None, "expires_at": None,
                    "note": "Synthetic shop: not declared (illustrative)",
                })
        for c in certs:
            override = CERT_DATE_OVERRIDES.get((d["id"], c["type"]))
            if override:
                c.update(override)
        shops.append((shop, certs))
    return shops


def build_jobs():
    jobs = []
    for (jid, part_no, desc, per_v, spares, price, ccv, hours, mat, tags, env, tol, certs, ctrl) in PART_DEFS:
        qty = per_v * FLEET_VEHICLES + spares
        value = cents(D(qty) * D(price))
        jobs.append({
            "id": jid, "program_id": "northgate", "part_no": part_no, "description": desc,
            "qty": qty, "unit_price_cad": money(price), "est_value_cad": float(value),
            "ccv_pct": float(ccv), "hours_week": hours, "material": mat,
            "process_tags": list(tags), "envelope_mm": list(env), "tolerance_class": tol,
            "required_certs": list(certs), "controlled": ctrl, "tag_source": "cache",
            "status": "unrouted",
        })
    return jobs


# ---------------------------------------------------------------------------------------------
# Engine simulation
# ---------------------------------------------------------------------------------------------


class State:
    """Mutable engine state: shops, per-shop certs/capacity, assignments, ledger, packages."""

    def __init__(self, shops_with_certs, jobs):
        self.shops = {s["id"]: copy.deepcopy(s) for s, _ in shops_with_certs}
        self.shop_order = [s["id"] for s, _ in shops_with_certs]
        self.certs = {s["id"]: copy.deepcopy(c) for s, c in shops_with_certs}
        self.jobs = {j["id"]: copy.deepcopy(j) for j in jobs}
        self.job_order = [j["id"] for j in jobs]
        self.used = {sid: 0 for sid in self.shop_order}
        self.assignments: dict[str, dict] = {}
        self.blocked: list[str] = []
        self.txns: list[dict] = []
        self.packages: list[dict] = []
        self.state = "empty"
        site = PROGRAM["site"]
        self.distance = {
            sid: haversine_km(site["lat"], site["lon"], s["lat"], s["lon"])
            for sid, s in self.shops.items()
        }

    # --- cert / capacity -------------------------------------------------------------------
    def cert_status(self, sid, ctype):
        for c in self.certs[sid]:
            if c["type"] == ctype:
                return c["status"]
        return "unknown"

    def counts(self, sid, ctype) -> bool:
        return self.cert_status(sid, ctype) in COUNTING_STATUSES

    def remaining(self, sid) -> int:
        return self.shops[sid]["capacity_hours_week"] - self.used[sid]

    # --- rules (hard filters) ---------------------------------------------------------------
    def missing_certs(self, sid, job):
        return [c for c in job["required_certs"] if c != "CPCSC_L1" and not self.counts(sid, c)]

    def failing(self, sid, job, with_capacity=True):
        shop = self.shops[sid]
        fails = []
        if not set(job["process_tags"]) <= set(shop["processes"]):
            fails.append("process")
        if not fits(job["envelope_mm"], shop["max_envelope_mm"]):
            fails.append("envelope")
        if self.missing_certs(sid, job):
            fails.append("certs")
        if job["controlled"] and not self.counts(sid, "CGP"):
            fails.append("controlled_cgp")
        if "CPCSC_L1" in job["required_certs"] and not self.counts(sid, "CPCSC_L1"):
            fails.append("cpcsc")
        if with_capacity and self.remaining(sid) < job["hours_week"]:
            fails.append("capacity")
        return fails

    def eligible_ignoring_capacity(self, job):
        return [sid for sid in self.shop_order if not self.failing(sid, job, with_capacity=False)]

    # --- scoring ----------------------------------------------------------------------------
    def score(self, sid, job):
        shop = self.shops[sid]
        w = WEIGHTS["weights"]
        diff = TOLERANCE.index(shop["tolerance_class"]) - TOLERANCE.index(job["tolerance_class"])
        tol = 1.0 if diff == 0 else (0.85 if diff > 0 else 0.3)
        mat = 1.0 if job["material"] in shop["materials"] else 0.4
        margin = min((s - j) / s for j, s in zip(sorted(job["envelope_mm"]), sorted(shop["max_envelope_mm"])))
        env = 0.6 + 0.4 * min(1.0, max(0.0, margin) / 0.5)
        fit = 0.40 * tol + 0.35 * mat + 0.25 * env
        dist = max(0.0, min(1.0, 1 - self.distance[sid] / WEIGHTS["d_max_km"]))
        lead = max(0.0, min(1.0, 1 - shop["lead_time_days"] / WEIGHTS["lead_max_days"]))
        itb = WEIGHTS["itb_norm"]["sme"] if shop["is_sme"] else WEIGHTS["itb_norm"]["non_sme"]
        total = w["fit"] * fit + w["distance"] * dist + w["lead_time"] * lead + w["itb_value"] * itb
        return round(total, 4), {"fit": round(fit, 3), "distance": round(dist, 3),
                                 "lead_time": round(lead, 3), "itb_value": round(itb, 3)}

    # --- assignment -------------------------------------------------------------------------
    def reasons(self, sid, job, n_eligible):
        shop = self.shops[sid]
        procs = [PROCESS_LABEL[p] for p in job["process_tags"]][:2]
        cap = " + ".join(procs)
        cert = next((c for c in CERT_REASON_PRIORITY if c in job["required_certs"]), None)
        if cert:
            cap = f"{cap} + {CERT_LABEL[cert]}"
        cap = cap[0].upper() + cap[1:]
        if job["controlled"]:
            second = "CGP-registered (controlled job)"
        else:
            second = f"{self.distance[sid]:.0f} km from Northgate's London site"
        if shop["is_sme"]:
            third = "SME: 2x direct credit"
        elif n_eligible == 1:
            third = "Only qualified shop in range (1x credit)"
        else:
            third = "Large firm: 1x direct credit"
        return [cap, second, third]

    def make_assignment(self, sid, job, n_eligible):
        shop = self.shops[sid]
        category = "sme_direct" if shop["is_sme"] else "regular"
        mult = 2 if shop["is_sme"] else 1
        value = cents(job["est_value_cad"])
        credit = cents(value * D(job["ccv_pct"]) * mult)
        score, breakdown = self.score(sid, job)
        return {
            "job_id": job["id"], "part_no": job["part_no"], "description": job["description"],
            "shop_id": sid, "shop_name": shop["name"], "shop_source": shop["source"],
            "shop_city": shop["city"], "shop_lat": shop["lat"], "shop_lon": shop["lon"],
            "is_sme": shop["is_sme"], "controlled": job["controlled"],
            "hours_week": job["hours_week"], "value_cad": float(value), "ccv_pct": job["ccv_pct"],
            "category": category, "multiplier": mult, "credit_cad": float(credit),
            "distance_km": round(self.distance[sid], 1),
            "score": score, "score_breakdown": breakdown,
            "reasons": self.reasons(sid, job, n_eligible),
            "status": "offered",
        }

    def add_txn(self, **kw):
        txn = {"id": f"TX-{len(self.txns) + 1:04d}", "program_id": "northgate"}
        txn.update(kw)
        self.txns.append(txn)
        return txn

    def route(self, job_ids):
        """Greedy: hardest job first; existing assignments are never touched."""
        counts = {j: len(self.eligible_ignoring_capacity(self.jobs[j])) for j in job_ids}
        order = sorted(job_ids, key=lambda j: (counts[j], -self.jobs[j]["est_value_cad"], j))
        newly = []
        for jid in order:
            job = self.jobs[jid]
            cands = [sid for sid in self.shop_order if not self.failing(sid, job)]
            if not cands:
                job["status"] = "blocked"
                continue
            cands.sort(key=lambda sid: (-self.score(sid, job)[0], sid))
            sid = cands[0]
            a = self.make_assignment(sid, job, counts[jid])
            self.assignments[jid] = a
            self.used[sid] += job["hours_week"]
            job["status"] = "assigned"
            newly.append(jid)
        # Transactions in job-id order for this routing pass (stable ids).
        for jid in sorted(newly):
            a = self.assignments[jid]
            self.add_txn(origin="assignment", ref_id=jid, shop_id=a["shop_id"], type="direct",
                         category=a["category"], value_cad=a["value_cad"], ccv_pct=a["ccv_pct"],
                         multiplier=a["multiplier"], credit_cad=a["credit_cad"], flags=["simplified-demo"])
        self.blocked = [j for j in self.job_order if self.jobs[j]["status"] == "blocked"]
        return sorted(newly)

    # --- gaps -------------------------------------------------------------------------------
    def blocked_job(self, jid):
        job = self.jobs[jid]
        ff = {f: 0 for f in FILTERS}
        eligible = 0
        process_shops = []
        for sid in self.shop_order:
            fails = self.failing(sid, job)
            for f in fails:
                ff[f] += 1
            if not [f for f in fails if f != "capacity"]:
                eligible += 1
            if "process" not in fails:
                process_shops.append((sid, fails))
        c = Counter(f for _, fails in process_shops for f in fails)
        reason_code = min(c.items(), key=lambda kv: (-kv[1], FILTERS.index(kv[0])))[0] if c else "process"
        # Human-readable reason: certified shops at capacity vs process shops missing the cert.
        needed = [x for x in job["required_certs"] if x != "CPCSC_L1"]
        main_cert = next((x for x in CERT_REASON_PRIORITY if x in needed), None)
        proc = PROCESS_LABEL[job["process_tags"][0]]
        # Mirrors engine/gaps.py: only shops that fail nothing but certs/capacity count toward
        # the certified-capacity story (an envelope/CGP/CPCSC miss is not "at capacity").
        fit = [(sid, fails) for sid, fails in process_shops if not (set(fails) - {"certs", "capacity"})]
        holders = [sid for sid, fails in fit if "certs" not in fails]
        full = [sid for sid, fails in fit if "certs" not in fails and "capacity" in fails]
        lacking = [sid for sid, fails in fit if "certs" in fails]
        if main_cert:
            label = CERT_LABEL[main_cert]
            free = sorted({self.remaining(s) for s in full}, reverse=True)
            free_txt = " and ".join(str(f) for f in free)
            if len(full) == len(holders) == 1:
                head = (f"The only {label} {proc} shop that fits is at capacity ({free_txt} h/week "
                        f"free vs {job['hours_week']} needed)")
            elif len(full) == len(holders) == 2:
                head = (f"Both {label} {proc} shops are at capacity ({free_txt} h/week free vs "
                        f"{job['hours_week']} needed)")
            else:
                head = f"{len(full)} of {len(holders)} {label} {proc} shops are at capacity"
            other = (f"1 other {proc} shop lacks" if len(lacking) == 1
                     else f"{len(lacking)} other {proc} shops lack")
            reason = f"{head}; {other} {label}" if lacking else head
            reason += " (certified-welder shortage)"
        else:
            reason = f"No shop passes every filter; most common failure: {reason_code}"
        return {
            "job_id": jid, "part_no": job["part_no"], "description": job["description"],
            "process_tags": job["process_tags"], "required_certs": job["required_certs"],
            "value_cad": job["est_value_cad"], "hours_week": job["hours_week"],
            "reason_code": reason_code, "reason": reason,
            "eligible_shop_count": eligible, "failing_filters": ff,
            "suggestion_ids": [p["id"] for p in self.packages if jid in p["blocked_job_ids"]],
        }

    def build_packages(self):
        """Near-miss shops (fail only certs on one trainable cert, or only capacity) -> packages.

        Greedy set cover: repeatedly pick the candidate package unlocking the most uncovered
        blocked jobs (tie: closest shop to the site, then shop id)."""
        tc = TRAINING_COSTS
        per_trainee_hours = tc["capacity_per_trainee_hours_week"]["value"]
        uncovered = sorted(self.blocked, key=lambda j: (-self.jobs[j]["est_value_cad"], j))
        packages = []
        while uncovered:
            cands = []
            for sid in self.shop_order:
                groups: dict[tuple, list] = {}
                for jid in uncovered:
                    job = self.jobs[jid]
                    fails = self.failing(sid, job)
                    if fails == ["certs"]:
                        miss = self.missing_certs(sid, job)
                        if len(miss) == 1 and miss[0] in tc["trainable_certs"]:
                            groups.setdefault(("cert", miss[0]), []).append(jid)
                    elif fails == ["capacity"]:
                        groups.setdefault(("capacity", job["process_tags"][0]), []).append(jid)
                for (kind, req), jids in groups.items():
                    rem = self.remaining(sid)
                    if kind == "cert":
                        trainees = tc["cert_package_trainees"]["value"]
                    else:
                        shortfall = self.jobs[jids[0]]["hours_week"] - rem
                        trainees = max(1, math.ceil(shortfall / per_trainee_hours))
                    unlock = trainees * per_trainee_hours
                    budget, chosen = rem + unlock, []
                    for jid in jids:
                        if self.jobs[jid]["hours_week"] <= budget:
                            chosen.append(jid)
                            budget -= self.jobs[jid]["hours_week"]
                    if chosen:
                        cands.append((kind, req, sid, trainees, unlock, chosen))
            if not cands:
                break
            cands.sort(key=lambda c: (-len(c[5]), self.distance[c[2]], c[2], c[0]))
            kind, req, sid, trainees, unlock, chosen = cands[0]
            packages.append(self.make_package(len(packages) + 1, kind, req, sid, trainees, unlock, chosen))
            uncovered = [j for j in uncovered if j not in chosen]
        self.packages = packages

    def make_package(self, n, kind, req, sid, trainees, unlock, jids):
        shop = self.shops[sid]
        tc = TRAINING_COSTS
        rule = tc["recipient_by_gap"][kind]
        jids = sorted(jids)
        proc = "welding"
        if kind == "cert":
            per = D(tc["costs"]["personal_certification"]["cwb_w47_1_welder_cad"])
            title = f"Certify {trainees} welders to {CERT_LABEL[req]} at {shop['name']} ({shop['city']})"
            detail = (f"Has {PROCESS_LABEL[proc]} cells and {self.remaining(sid)} h/week free capacity, "
                      f"but no {CERT_LABEL[req]} certification")
            gap = {"kind": "cert", "requirement": req, "detail": detail}
            cert_unlock = req
            eligibility = ("Personal certification counts only for Canadian citizens or permanent residents "
                           "(ITB model terms §7.5.1).")
        else:
            proc = req
            per = D(tc["costs"]["apprentice_sponsorship"]["welding_apprentice_cad"])
            title = (f"Sponsor {trainees} {PROCESS_LABEL[proc]} apprentices at {shop['name']} ({shop['city']}) "
                     f"through an Indigenous-governed training institute")
            needed = max(self.jobs[j]["hours_week"] for j in jids)
            certs_held = [CERT_LABEL[c] for c in self.jobs[jids[0]]["required_certs"] if c != "CPCSC_L1"]
            detail = (f"{' + '.join(certs_held)} certified with a large enough envelope, but only "
                      f"{self.remaining(sid)} h/week free for a {needed} h/week job")
            gap = {"kind": "capacity", "requirement": proc, "detail": detail}
            cert_unlock = None
            eligibility = ("The 10x Indigenous workforce development multiplier applies per the ITB overview; "
                           "eligibility of this apprenticeship sponsorship would need to be confirmed with the Defence "
                           "Investment Agency (assumption).")
        cost = cents(per * trainees)
        mult = rule["multiplier"]
        return {
            "id": f"TP-{n:02d}", "program_id": "northgate", "title": title,
            "blocked_job_ids": jids,
            "shop_id": sid, "shop_name": shop["name"], "shop_city": shop["city"], "shop_source": shop["source"],
            "gap": gap, "category": rule["category"], "categories": list(rule["categories"]),
            "recipient_type": rule["recipient_type"], "recipient_example": rule["recipient_example"],
            "trainees": trainees, "est_cost_cad": float(cost),
            "cost_basis": "data/rules/training_costs.json (assumption)",
            "multiplier": mult, "est_credit_cad": float(cents(cost * D("1.0") * mult)),
            "cert_unlock": cert_unlock, "capacity_unlock": {proc: unlock},
            "unblocks_value_cad": float(sum(cents(self.jobs[j]["est_value_cad"]) for j in jids)),
            "eligibility_note": eligibility, "flags": ["assumption"], "status": "suggested",
        }

    # --- ledger -----------------------------------------------------------------------------
    def ledger(self):
        direct = sum((cents(t["credit_cad"]) for t in self.txns if t["type"] == "direct"), Decimal(0))
        indirect = sum((cents(t["credit_cad"]) for t in self.txns if t["type"] == "indirect"), Decimal(0))
        total = sum((cents(t["credit_cad"]) for t in self.txns), Decimal(0))
        assert total == direct + indirect
        target = cents(D(PROGRAM["contract_value_cad"]) * D(PROGRAM["smb_target_pct"]))
        achieved = sum((cents(D(a["value_cad"]) * D(a["ccv_pct"])) for a in self.assignments.values()
                        if a["is_sme"]), Decimal(0))
        labels = [("regular", "Regular work", 1), ("sme_direct", "SME direct work", 2),
                  ("training", "Skills and training", 5),
                  ("indigenous_training", "Indigenous workforce development", 10)]
        breakdown = []
        for cat, label, mult in labels:
            ts = [t for t in self.txns if t["category"] == cat]
            breakdown.append({
                "category": cat, "label": label, "multiplier": mult, "count": len(ts),
                "value_cad": float(sum((cents(t["value_cad"]) for t in ts), Decimal(0))),
                "credit_cad": float(sum((cents(t["credit_cad"]) for t in ts), Decimal(0))),
            })
        flags = ["simplified-demo"]
        if any("assumption" in t["flags"] for t in self.txns):
            flags.append("assumption")
        total_f, achieved_f, target_f = float(total), float(achieved), float(target)
        return {
            "program_id": "northgate", "rules_version": RULES_VERSION, "rules_label": RULES_LABEL,
            "obligation_cad": PROGRAM["obligation_cad"],
            "credit_total_cad": total_f,
            "obligation_met_pct": total_f / PROGRAM["obligation_cad"],
            "direct_credit_cad": float(direct), "indirect_credit_cad": float(indirect),
            "smb": {"target_pct": PROGRAM["smb_target_pct"], "target_cad": target_f,
                    "achieved_cad": achieved_f, "progress_pct": achieved_f / target_f,
                    "basis": "CCV of SME work before multipliers (assumption)"},
            "multiplier_breakdown": breakdown,
            "transactions": copy.deepcopy(self.txns),
            "flags": flags,
        }

    def snapshot(self):
        lg = self.ledger()
        return {"assigned": len(self.assignments), "blocked": len(self.blocked),
                "credit_total_cad": lg["credit_total_cad"], "obligation_met_pct": lg["obligation_met_pct"],
                "direct_credit_cad": lg["direct_credit_cad"], "indirect_credit_cad": lg["indirect_credit_cad"],
                "smb_achieved_cad": lg["smb"]["achieved_cad"], "smb_progress_pct": lg["smb"]["progress_pct"]}

    # --- fund -------------------------------------------------------------------------------
    def fund(self, pkg_id):
        pkg = next(p for p in self.packages if p["id"] == pkg_id)
        assert pkg["status"] == "suggested", f"{pkg_id} already funded"
        before = self.snapshot()
        before_credit = D(before["credit_total_cad"])
        sid = pkg["shop_id"]
        pkg["status"] = "funded"
        if pkg["cert_unlock"]:
            for c in self.certs[sid]:
                if c["type"] == pkg["cert_unlock"]:
                    c.update({"status": "pending_training", "source_url": None, "verified_at": None,
                              "expires_at": None,
                              "note": (f"Pending training: {pkg['id']} funded "
                                       f"({pkg['trainees']} trainees; demo simulation)")})
        self.shops[sid]["capacity_hours_week"] += sum(pkg["capacity_unlock"].values())
        credit_cat = TRAINING_COSTS["recipient_by_gap"][pkg["gap"]["kind"]]["credit_category"]
        txn = self.add_txn(origin="training", ref_id=pkg["id"], shop_id=sid, type="indirect",
                           category=credit_cat, value_cad=pkg["est_cost_cad"], ccv_pct=1.0,
                           multiplier=pkg["multiplier"], credit_cad=pkg["est_credit_cad"],
                           flags=["assumption", "simplified-demo"])
        prev_blocked = list(self.blocked)
        newly = self.route(prev_blocked)
        self.state = "funded"
        after = self.snapshot()
        unblocked = [copy.deepcopy(self.assignments[j]) for j in newly]
        jobs_cad = sum((cents(a["credit_cad"]) for a in unblocked), Decimal(0))
        training_cad = cents(txn["credit_cad"])
        added = cents(D(after["credit_total_cad"]) - before_credit)
        assert added == training_cad + jobs_cad, (added, training_cad, jobs_cad)
        n = len(unblocked)
        headline = (f"{short_money(pkg['est_cost_cad'])} training → {short_money(pkg['est_credit_cad'])} credit "
                    f"({pkg['multiplier']}x) + {plural(n, 'job')} unblocked (+{short_money(jobs_cad)} credit)")
        return {
            "program_id": "northgate", "package_id": pkg_id, "package": copy.deepcopy(pkg),
            "before": before, "after": after, "unblocked_jobs": unblocked,
            "still_blocked": list(self.blocked), "training_txn": copy.deepcopy(txn),
            "credit_added": float(added),
            "credit_added_breakdown": {"training_cad": float(training_cad), "jobs_cad": float(jobs_cad)},
            "headline": headline,
        }

    # --- views ------------------------------------------------------------------------------
    def shop_obj(self, sid):
        s = copy.deepcopy(self.shops[sid])
        s["cert_summary"] = [{"type": c["type"], "status": c["status"]} for c in self.certs[sid]]
        return s

    def requirements(self, sid, job):
        """Failing requirements for readiness: set of (kind, requirement), plus an envelope flag."""
        shop = self.shops[sid]
        reqs = set()
        for p in job["process_tags"]:
            if p not in shop["processes"]:
                reqs.add(("process", p))
        for c in self.missing_certs(sid, job):
            reqs.add(("cert", c))
        if job["controlled"] and not self.counts(sid, "CGP"):
            reqs.add(("cert", "CGP"))
        if "CPCSC_L1" in job["required_certs"] and not self.counts(sid, "CPCSC_L1"):
            reqs.add(("cert", "CPCSC_L1"))
        if self.remaining(sid) < job["hours_week"]:
            reqs.add(("capacity", job["process_tags"][0]))
        envelope_fail = not fits(job["envelope_mm"], shop["max_envelope_mm"])
        return reqs, envelope_fail

    def readiness(self, sid):
        offered = {j for j, a in self.assignments.items() if a["shop_id"] == sid}
        groups: dict[tuple, list] = {}
        for jid in self.job_order:
            if jid in offered:
                continue
            reqs, env_fail = self.requirements(sid, self.jobs[jid])
            if env_fail or len(reqs) != 1:  # envelope cannot be trained away -> not a readiness item
                continue
            groups.setdefault(next(iter(reqs)), []).append(jid)
        kind_order = {"cert": 0, "capacity": 1, "process": 2}
        items = []
        for (kind, req), jids in groups.items():
            value = sum((cents(self.jobs[j]["est_value_cad"]) for j in jids), Decimal(0))
            more = f"{len(jids)} more job" + ("" if len(jids) == 1 else "s")
            if kind == "cert":
                msg = f"Get {CERT_LABEL[req]} → qualify for {more} worth {short_money(value)}"
            elif kind == "capacity":
                msg = f"Add {PROCESS_LABEL[req]} capacity → qualify for {more} worth {short_money(value)}"
            else:
                msg = f"Add {PROCESS_LABEL[req]} → qualify for {more} worth {short_money(value)}"
            items.append({"kind": kind, "requirement": req, "jobs_unlocked": jids,
                          "value_cad": float(value), "message": msg})
        items.sort(key=lambda it: (-it["value_cad"], kind_order[it["kind"]], it["requirement"]))
        return items

    def shop_detail(self, sid):
        offers = []
        for jid in self.job_order:
            a = self.assignments.get(jid)
            if not a or a["shop_id"] != sid:
                continue
            offers.append({"job_id": jid, "part_no": a["part_no"], "description": a["description"],
                           "program_id": "northgate", "prime_name": PROGRAM["prime_name"],
                           "value_cad": a["value_cad"], "hours_week": a["hours_week"],
                           "multiplier": a["multiplier"], "credit_cad": a["credit_cad"],
                           "reasons": list(a["reasons"]), "status": a["status"]})
        training = []
        for p in self.packages:
            if p["shop_id"] != sid:
                continue
            if p["cert_unlock"]:
                what = f"{p['trainees']} welders"
                if p["status"] == "funded":
                    msg = f"{what} in training for {CERT_LABEL[p['cert_unlock']]}"
                else:
                    msg = f"Suggested: certify {what} to {CERT_LABEL[p['cert_unlock']]}"
            else:
                proc = next(iter(p["capacity_unlock"]))
                what = f"{p['trainees']} {PROCESS_LABEL[proc]} apprentices"
                msg = f"{what} in training" if p["status"] == "funded" else f"Suggested: sponsor {what}"
            training.append({"package_id": p["id"], "status": p["status"], "category": p["category"],
                             "trainees": p["trainees"], "recipient_example": p["recipient_example"],
                             "cert_unlock": p["cert_unlock"], "capacity_unlock": dict(p["capacity_unlock"]),
                             "message": msg})
        return {"shop": self.shop_obj(sid), "certifications": copy.deepcopy(self.certs[sid]),
                "offers": offers, "readiness": self.readiness(sid), "training": training}

    def program_view(self):
        return {"program": copy.deepcopy(PROGRAM),
                "counts": {"jobs": len(self.jobs), "assigned": len(self.assignments),
                           "blocked": len(self.blocked), "shops": len(self.shops)},
                "state": self.state}

    def assignments_list(self):
        return [copy.deepcopy(self.assignments[j]) for j in self.job_order if j in self.assignments]

    def jobs_view(self):
        """GET /programs/{id}/jobs: every job with its current status."""
        return {"program_id": "northgate", "jobs": [copy.deepcopy(self.jobs[j]) for j in self.job_order]}

    def gaps(self):
        blocked = [self.blocked_job(j) for j in self.blocked]
        value = sum((cents(self.jobs[j]["est_value_cad"]) for j in self.blocked), Decimal(0))
        missing = Counter(c for j in self.blocked for c in self.jobs[j]["required_certs"] if c != "CPCSC_L1")
        if missing:
            top_cert = min(missing.items(), key=lambda kv: (-kv[1], kv[0]))[0]
            top_reason = f"{CERT_LABEL[top_cert]} welder shortage (certification + capacity)"
        else:
            top_reason = "None"
        return {"program_id": "northgate",
                "summary": {"blocked_jobs": len(blocked), "blocked_value_cad": float(value),
                            "top_reason": top_reason},
                "blocked": blocked, "suggestions": copy.deepcopy(self.packages)}


# ---------------------------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------------------------

FAILURES: list[str] = []


def check(cond, msg):
    if not cond:
        FAILURES.append(msg)


def check_ledger(lg, name):
    total = sum(cents(t["credit_cad"]) for t in lg["transactions"])
    check(cents(lg["credit_total_cad"]) == total, f"{name}: credit_total != sum(transactions)")
    check(cents(lg["direct_credit_cad"]) + cents(lg["indirect_credit_cad"]) == cents(lg["credit_total_cad"]),
          f"{name}: direct + indirect != total")
    check(abs(lg["obligation_met_pct"] - lg["credit_total_cad"] / lg["obligation_cad"]) < 1e-12,
          f"{name}: obligation_met_pct mismatch")
    check(abs(lg["smb"]["progress_pct"] - lg["smb"]["achieved_cad"] / lg["smb"]["target_cad"]) < 1e-12,
          f"{name}: smb progress mismatch")
    check([m["category"] for m in lg["multiplier_breakdown"]] ==
          ["regular", "sme_direct", "training", "indigenous_training"], f"{name}: breakdown categories")
    for t in lg["transactions"]:
        exp = cents(D(t["value_cad"]) * D(t["ccv_pct"]) * t["multiplier"])
        check(exp == cents(t["credit_cad"]), f"{name}: {t['id']} credit != value*ccv*mult")
    bsum = sum(cents(m["credit_cad"]) for m in lg["multiplier_breakdown"])
    check(bsum == total, f"{name}: multiplier_breakdown credit != total")


def check_structural_block(base: State):
    """The 4 LARGE CWB jobs are blocked under ANY feasible assignment (before funding):
    every shop passing all non-capacity filters has total capacity < the job's hours."""
    for jid in LARGE_CWB_JOBS:
        job = base.jobs[jid]
        for sid in base.eligible_ignoring_capacity(job):
            check(base.shops[sid]["capacity_hours_week"] < job["hours_week"],
                  f"structural: {jid} could fit {sid} (capacity {base.shops[sid]['capacity_hours_week']})")
    # the two SMALL jobs cannot share one CWB shop
    small_h = sum(base.jobs[j]["hours_week"] for j in SMALL_CWB_JOBS)
    for sid in CWB_SHOP_IDS:
        check(base.shops[sid]["capacity_hours_week"] < small_h, f"structural: {sid} could hold both SMALL jobs")
        check(base.shops[sid]["capacity_hours_week"] >= max(base.jobs[j]["hours_week"] for j in SMALL_CWB_JOBS),
              f"structural: {sid} cannot hold one SMALL job")


# ---------------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------------


def main() -> int:
    shops_with_certs = build_shops()
    jobs = build_jobs()

    # ---- inputs: data/processed, data/rules, data/cache -----------------------------------
    write_json(PROCESSED / "program_northgate.json", PROGRAM)
    shops_out = []
    for s, certs in shops_with_certs:
        d = copy.deepcopy(s)
        d["certifications"] = copy.deepcopy(certs)
        shops_out.append(d)
    write_json(PROCESSED / "shops_synthetic.json", {
        "label": SYNTHETIC_LABEL, "source": "synthetic",
        "generated_by": "scripts/build_fixtures.py",
        "note": ("30 fictional shops for the Northgate demo. Names, addresses, capabilities and "
                 "certification statuses are illustrative; any resemblance to a real company is "
                 "unintended. Declared certs are self-declared (verified_at = date declared)."),
        "shops": shops_out,
    })
    buf = io.StringIO()
    wr = csv.writer(buf, lineterminator="\n")
    wr.writerow(["part_no", "description", "qty", "unit_price_cad", "ccv_pct", "hours_week"])
    for j, pd in zip(jobs, PART_DEFS):
        wr.writerow([j["part_no"], j["description"], j["qty"], pd[5], pd[6], j["hours_week"]])
    write_text(PROCESSED / "parts_northgate.csv", buf.getvalue())
    tags = {"_key": "sha256(part_no + '|' + description), hex, UTF-8",
            "_source": "hand-authored demo tags written by scripts/build_fixtures.py (stands in for LLM output)"}
    for j in jobs:
        tags[tag_key(j["part_no"], j["description"])] = {
            "process_tags": j["process_tags"], "material": j["material"], "envelope_mm": j["envelope_mm"],
            "tolerance_class": j["tolerance_class"], "required_certs": j["required_certs"],
            "controlled": j["controlled"],
        }
    write_json(CACHE / "tags_northgate.json", tags)
    # Once data/rules/{policy,training_costs}.json exist they are the source of truth (research
    # corrections are edited there); the constants above only seed a fresh checkout.
    for name, key in (("policy.json", "POLICY"), ("training_costs.json", "TRAINING_COSTS")):
        if (RULES / name).exists():
            with open(RULES / name, encoding="utf-8") as fh:
                globals()[key] = json.load(fh)
    write_json(RULES / "policy.json", globals()["POLICY"])
    write_json(RULES / "filters.json", FILTERS_RULES)
    write_json(RULES / "weights.json", WEIGHTS)
    write_json(RULES / "training_costs.json", globals()["TRAINING_COSTS"])

    # ---- simulate --------------------------------------------------------------------------
    st = State(shops_with_certs, jobs)
    base = State(shops_with_certs, jobs)  # untouched copy for structural checks
    shops_list = {"shops": [st.shop_obj(sid) for sid in st.shop_order]}
    reset = {"ok": True, "program_id": "northgate", "shops": len(st.shops), "jobs": 0,
             "message": "Demo reset: shops and program seeded; no parts uploaded."}
    st.state = "uploaded"
    upload = {"program_id": "northgate", "count": len(jobs),
              "tagger": {"llm": 0, "cache": len(jobs), "rules": 0},
              "jobs": [copy.deepcopy(st.jobs[j]) for j in st.job_order]}

    st.route(list(st.job_order))
    st.state = "routed"
    st.build_packages()
    assigned_value = sum((cents(a["value_cad"]) for a in st.assignments.values()), Decimal(0))
    sme_value = sum((cents(a["value_cad"]) for a in st.assignments.values() if a["is_sme"]), Decimal(0))
    gaps0 = st.gaps()
    route = {"program_id": "northgate", "solver": "greedy", "elapsed_ms": 42,
             "stats": {"jobs": len(st.jobs), "assigned": len(st.assignments), "blocked": len(st.blocked),
                       "assigned_value_cad": float(assigned_value),
                       "sme_share_pct": float(sme_value) / float(assigned_value)},
             "assignments": st.assignments_list(), "blocked": gaps0["blocked"]}
    program0 = st.program_view()
    assignments0 = {"program_id": "northgate", "assignments": st.assignments_list()}
    jobs0 = st.jobs_view()
    ledger0 = st.ledger()
    shop0 = st.shop_detail(DEMO_SHOP_ID)
    routed_assign = {j: a["shop_id"] for j, a in st.assignments.items()}

    fund1 = st.fund("TP-01")
    program1 = st.program_view()
    assignments1 = {"program_id": "northgate", "assignments": st.assignments_list()}
    jobs1 = st.jobs_view()
    ledger1 = st.ledger()
    gaps1 = st.gaps()
    shop1 = st.shop_detail(DEMO_SHOP_ID)
    after1_assign = {j: a["shop_id"] for j, a in st.assignments.items()}

    fund2 = st.fund("TP-02")
    final_assign = {j: a["shop_id"] for j, a in st.assignments.items()}

    # ---- fixtures --------------------------------------------------------------------------
    sid = DEMO_SHOP_ID
    fx = {
        "health.json": {"status": "ok", "service": "muster-engine", "version": "0.1.0"},
        "demo_reset.json": reset,
        "program.json": program0,
        "program_after_fund.json": program1,
        "parts_upload.json": upload,
        "route.json": route,
        "assignments.json": assignments0,
        "assignments_after_fund.json": assignments1,
        "jobs.json": jobs0,
        "jobs_after_fund.json": jobs1,
        "ledger.json": ledger0,
        "ledger_after_fund.json": ledger1,
        "gaps.json": gaps0,
        "gaps_after_fund.json": gaps1,
        "fund_TP-01.json": fund1,
        "fund_TP-02.json": fund2,
        "shops.json": shops_list,
        f"shop_{sid}.json": shop0,
        f"shop_{sid}_after_fund.json": shop1,
    }
    fx["index.json"] = {
        "program_id": "northgate", "demo_shop_id": sid, "demo_package_id": DEMO_PACKAGE_ID,
        "endpoints": {
            "GET /health": "health.json",
            "POST /demo/reset": "demo_reset.json",
            "GET /programs/northgate": "program.json",
            "POST /programs/northgate/parts": "parts_upload.json",
            "POST /programs/northgate/route": "route.json",
            "GET /programs/northgate/assignments": "assignments.json",
            "GET /programs/northgate/jobs": "jobs.json",
            "GET /programs/northgate/ledger": "ledger.json",
            "GET /programs/northgate/gaps": "gaps.json",
            "POST /programs/northgate/training/TP-01/fund": "fund_TP-01.json",
            "POST /programs/northgate/training/TP-02/fund": "fund_TP-02.json",
            "GET /shops": "shops.json",
            f"GET /shops/{sid}": f"shop_{sid}.json",
        },
        "after_fund": {
            "GET /programs/northgate": "program_after_fund.json",
            "GET /programs/northgate/assignments": "assignments_after_fund.json",
            "GET /programs/northgate/jobs": "jobs_after_fund.json",
            "GET /programs/northgate/ledger": "ledger_after_fund.json",
            "GET /programs/northgate/gaps": "gaps_after_fund.json",
            f"GET /shops/{sid}": f"shop_{sid}_after_fund.json",
        },
    }
    for name in sorted(fx):
        write_json(FIXTURES / name, fx[name])

    # ---- asserts ---------------------------------------------------------------------------
    shops = [s for s, _ in shops_with_certs]
    check(len(shops) == 30, "exactly 30 shops")
    check([s["id"] for s in shops] == [f"syn-{i:03d}" for i in range(1, 31)], "shop ids syn-001..syn-030")
    check(all(s["city"] in CITIES for s in shops), "shop cities")
    check(len({s["name"] for s in shops}) == 30, "unique shop names")
    check(all(s["contact_role_email"].endswith(".example") for s in shops), "emails on .example")
    n_sme = sum(s["is_sme"] for s in shops)
    check(26 <= n_sme <= 27, f"26-27 SMEs (got {n_sme})")
    non_sme_assigned = {a["shop_id"] for a in route["assignments"] if not a["is_sme"]}
    check(len(non_sme_assigned) >= 3, f">= 3 non-SME shops assigned (got {len(non_sme_assigned)})")
    for p in PROCESS_TAGS:
        check(sum(p in s["processes"] for s in shops) >= 2, f"process {p} offered by >= 2 shops")
    for s, certs in shops_with_certs:
        check([c["type"] for c in certs] == CERT_TYPES, f"{s['id']}: one cert per type")
        check(all(c["status"] in ("declared", "unknown") for c in certs), f"{s['id']}: cert statuses")
        check(s["naics"][:4] in ("3327", "3323", "3328", "3344", "3353", "3359") or s["naics"][:3] == "332",
              f"{s['id']}: naics")
    cgp_shops = [s for s, c in shops_with_certs if any(x["type"] == "CGP" and x["status"] == "declared" for x in c)]
    check(len(cgp_shops) >= 6, f">= 6 CGP shops (got {len(cgp_shops)})")
    ctrl_procs = {p for j in jobs if j["controlled"] for p in j["process_tags"]}
    check(ctrl_procs <= {p for s in cgp_shops for p in s["processes"]}, "CGP shops cover controlled processes")
    cwb_holders = [s["id"] for s, c in shops_with_certs
                   if any(x["type"] == "CWB_W47.1" and x["status"] == "declared" for x in c)]
    check(cwb_holders == CWB_SHOP_IDS, f"exactly 2 CWB shops {CWB_SHOP_IDS} (got {cwb_holders})")

    check(len(jobs) == 40, "40 jobs")
    check([j["id"] for j in jobs] == [f"NG-{i:03d}" for i in range(1, 41)], "job ids NG-001..NG-040")
    total_value = sum(cents(j["est_value_cad"]) for j in jobs)
    check(Decimal(36_000_000) <= total_value <= Decimal(44_000_000), f"package value 36-44M (got {total_value})")
    for j in jobs:
        check(0.70 <= j["ccv_pct"] <= 0.95, f"{j['id']} ccv")
        check(6 <= j["hours_week"] <= 60, f"{j['id']} hours")
        check(cents(D(j["qty"]) * D(j["unit_price_cad"])) == cents(j["est_value_cad"]), f"{j['id']} value")
        check(set(j["process_tags"]) <= set(PROCESS_TAGS) and j["material"] in MATERIALS
              and set(j["required_certs"]) <= set(CERT_TYPES), f"{j['id']} vocab")
    controlled = [j["id"] for j in jobs if j["controlled"]]
    check(len(controlled) == 5, "exactly 5 controlled jobs")
    for jid in controlled:
        a = st.assignments.get(jid)
        check(a is not None and routed_assign.get(jid) is not None, f"controlled {jid} assigned before funding")
        if a:
            check(base.counts(a["shop_id"], "CGP"), f"controlled {jid} on a CGP shop")
    cpcsc = [j["id"] for j in jobs if "CPCSC_L1" in j["required_certs"]]
    check(1 <= len(cpcsc) <= 2, "1-2 CPCSC jobs")
    cwb_jobs = [j["id"] for j in jobs if "CWB_W47.1" in j["required_certs"]]
    check(sorted(cwb_jobs) == sorted(SMALL_CWB_JOBS + LARGE_CWB_JOBS), "exactly 6 CWB jobs")
    for jid in SMALL_CWB_JOBS:
        check("ISO9001" in base.jobs[jid]["required_certs"], f"{jid} requires ISO9001")

    check(route["stats"]["assigned"] == 36 and route["stats"]["blocked"] == 4, "36 assigned / 4 blocked")
    check(sorted(st.jobs[j]["id"] for j in LARGE_CWB_JOBS) == sorted(b["job_id"] for b in route["blocked"]),
          "the 4 blocked jobs are the LARGE CWB jobs")
    check(all(j in routed_assign for j in SMALL_CWB_JOBS), "SMALL CWB jobs assigned")
    check({routed_assign.get(j) for j in SMALL_CWB_JOBS} == set(CWB_SHOP_IDS), "one SMALL job per CWB shop")
    check_structural_block(base)
    blocked_value = sum(cents(base.jobs[j]["est_value_cad"]) for j in LARGE_CWB_JOBS)
    check(Decimal(5_000_000) <= blocked_value <= Decimal(7_000_000), f"blocked value 5-7M (got {blocked_value})")
    tp1_value = sum(cents(base.jobs[j]["est_value_cad"]) for j in TP01_JOBS)
    check(Decimal(4_000_000) <= tp1_value <= Decimal(5_500_000), f"TP-01 value 4-5.5M (got {tp1_value})")
    for a in route["assignments"]:
        check(len(a["reasons"]) == 3, f"{a['job_id']}: 3 reasons")
    for b in route["blocked"]:
        check(len(b["suggestion_ids"]) >= 1, f"{b['job_id']}: has a suggestion")

    # demo shop design
    demo = base.shops[DEMO_SHOP_ID]
    check(demo["city"] == "Woolwich" and demo["is_sme"], "demo shop is an SME in Woolwich")
    check({"welding", "sheet_metal", "painting"} <= set(demo["processes"]), "demo shop processes")
    check(base.cert_status(DEMO_SHOP_ID, "CWB_W47.1") == "unknown", "demo shop has no CWB")
    check(demo["capacity_hours_week"] - sum(base.jobs[j]["hours_week"] for j in routed_assign
                                            if routed_assign[j] == DEMO_SHOP_ID)
          >= sum(base.jobs[j]["hours_week"] for j in TP01_JOBS), "demo shop free capacity >= 3 LARGE jobs")
    for jid in TP01_JOBS:
        check(fits(base.jobs[jid]["envelope_mm"], demo["max_envelope_mm"]), f"demo envelope fits {jid}")
    check(not fits(base.jobs[HULL_JOB]["envelope_mm"], demo["max_envelope_mm"]), "demo envelope excludes hull")
    n_offers0 = len(shop0["offers"])
    check(1 <= n_offers0 <= 2, f"demo shop has 1-2 offers before funding (got {n_offers0})")
    check(all("CWB_W47.1" not in base.jobs[o["job_id"]]["required_certs"] for o in shop0["offers"]),
          "demo pre-fund offers are non-CWB")
    distractors = [s["id"] for s in shops if "welding" in s["processes"]
                   and s["id"] not in CWB_SHOP_IDS + [DEMO_SHOP_ID]]
    check(2 <= len(distractors) <= 3, f"2-3 distractor welding shops (got {distractors})")

    r0 = shop0["readiness"]
    check(len(r0) == 1 and r0[0]["kind"] == "cert" and r0[0]["requirement"] == "CWB_W47.1"
          and r0[0]["jobs_unlocked"] == TP01_JOBS, f"demo readiness before = one CWB item (got {r0})")
    r1 = shop1["readiness"]
    check(len(r1) == 1 and r1[0]["kind"] == "cert" and r1[0]["requirement"] == "ISO9001"
          and r1[0]["jobs_unlocked"] == SMALL_CWB_JOBS, f"demo readiness after = one ISO9001 item (got {r1})")
    check(shop0["training"] and shop0["training"][0]["message"] == "Suggested: certify 4 welders to CWB W47.1",
          "demo training message before")
    check(shop1["training"] and shop1["training"][0]["status"] == "funded"
          and shop1["training"][0]["message"] == "4 welders in training for CWB W47.1", "demo training after")
    check({o["job_id"] for o in shop1["offers"]} >= set(TP01_JOBS), "unblocked jobs in demo offers after fund")

    # packages
    pk = {p["id"]: p for p in gaps0["suggestions"]}
    check(sorted(pk) == ["TP-01", "TP-02"], f"exactly 2 packages (got {sorted(pk)})")
    if "TP-01" in pk:
        p = pk["TP-01"]
        check(p["shop_id"] == DEMO_SHOP_ID and p["gap"]["kind"] == "cert" and p["gap"]["requirement"] == "CWB_W47.1"
              and p["category"] == "personal_certification"
              and p["categories"] == ["personal_certification", "apprentice_sponsorship"]
              and p["recipient_type"] == "college" and p["trainees"] == 4 and p["est_cost_cad"] == 96000.0
              and p["multiplier"] == 5 and p["est_credit_cad"] == 480000.0 and p["cert_unlock"] == "CWB_W47.1"
              and p["capacity_unlock"] == {"welding": 80} and p["blocked_job_ids"] == TP01_JOBS
              and p["flags"] == ["assumption"], f"TP-01 fields {p}")
    if "TP-02" in pk:
        p = pk["TP-02"]
        check(p["shop_id"] == CWB_SHOP_IDS[1] and p["gap"] == {**p["gap"], "kind": "capacity", "requirement": "welding"}
              and p["category"] == "apprentice_sponsorship" and p["recipient_type"] == "indigenous_institution"
              and p["trainees"] == 2 and p["est_cost_cad"] == 40000.0 and p["multiplier"] == 10
              and p["capacity_unlock"] == {"welding": 40} and p["cert_unlock"] is None
              and p["blocked_job_ids"] == [HULL_JOB] and p["flags"] == ["assumption"], f"TP-02 fields {p}")

    # ledgers & fund
    for lg, name in [(ledger0, "ledger"), (ledger1, "ledger_after_fund"), (st.ledger(), "ledger_final")]:
        check_ledger(lg, name)
    ob0, ob1 = ledger0["obligation_met_pct"], ledger1["obligation_met_pct"]
    check(0.10 <= ob0 <= 0.15, f"obligation before in [0.10, 0.15] (got {ob0:.4f})")
    check(ob1 - ob0 >= 0.012, f"obligation rises >= 1.2 pts (got {(ob1 - ob0) * 100:.2f})")
    smb_rise = ledger1["smb"]["progress_pct"] - ledger0["smb"]["progress_pct"]
    check(smb_rise >= 0.03, f"SMB progress rises >= 3 pts (got {smb_rise * 100:.2f})")
    check(fund1["credit_added"] >= 5_000_000, f"TP-01 credit_added >= $5M (got {fund1['credit_added']})")
    check([a["job_id"] for a in fund1["unblocked_jobs"]] == TP01_JOBS, "TP-01 unblocks the 3 LARGE jobs")
    check(fund1["still_blocked"] == [HULL_JOB], "after TP-01 only the hull job is blocked")
    check([a["job_id"] for a in fund2["unblocked_jobs"]] == [HULL_JOB], "TP-02 unblocks the hull job")
    check(fund2["still_blocked"] == [] and fund2["after"]["blocked"] == 0, "no blocked jobs after TP-02")
    for f in (fund1, fund2):
        check(cents(f["credit_added"]) == cents(f["after"]["credit_total_cad"]) - cents(f["before"]["credit_total_cad"]),
              f"{f['package_id']}: credit_added = after - before")
        check(cents(f["credit_added"]) == cents(f["credit_added_breakdown"]["training_cad"])
              + cents(f["credit_added_breakdown"]["jobs_cad"]), f"{f['package_id']}: breakdown sums")
        t = f["training_txn"]
        check(t["origin"] == "training" and t["type"] == "indirect" and t["ccv_pct"] == 1.0
              and t["flags"] == ["assumption", "simplified-demo"], f"{f['package_id']}: training txn")
    check(fund1["training_txn"]["category"] == "training", "TP-01 txn category training")
    check(fund2["training_txn"]["category"] == "indigenous_training", "TP-02 txn category indigenous_training")
    check(fund1["before"]["credit_total_cad"] == ledger0["credit_total_cad"], "fund1 before == ledger")
    check(fund1["after"]["credit_total_cad"] == ledger1["credit_total_cad"], "fund1 after == ledger_after_fund")
    check(fund2["before"] == fund1["after"], "fund2 before == fund1 after")
    for j, s in routed_assign.items():
        check(after1_assign.get(j) == s, f"no reshuffle after TP-01 ({j})")
    for j, s in after1_assign.items():
        check(final_assign.get(j) == s, f"no reshuffle after TP-02 ({j})")
    check(program0["state"] == "routed" and program1["state"] == "funded", "program states")
    check(gaps1["summary"]["blocked_jobs"] == 1 and [p["status"] for p in gaps1["suggestions"]] == ["funded", "suggested"]
          and gaps1["blocked"][0]["suggestion_ids"] == ["TP-02"], "gaps after fund")
    check(all(j["status"] == "unrouted" and j["tag_source"] == "cache" for j in upload["jobs"]), "upload jobs")
    for jv, name, n_assigned, n_blocked in [(jobs0, "jobs", 36, 4), (jobs1, "jobs_after_fund", 39, 1)]:
        st_counts = Counter(j["status"] for j in jv["jobs"])
        check([j["id"] for j in jv["jobs"]] == [j["id"] for j in jobs], f"{name}: all 40 jobs in order")
        check(st_counts == Counter(assigned=n_assigned, blocked=n_blocked),
              f"{name}: {n_assigned} assigned / {n_blocked} blocked (got {dict(st_counts)})")
    check({j["id"] for j in jobs0["jobs"] if j["status"] == "assigned"} == {a["job_id"] for a in route["assignments"]},
          "jobs statuses match route assignments")
    check({j["id"] for j in jobs1["jobs"] if j["status"] == "blocked"} == set(fund1["still_blocked"]),
          "jobs_after_fund blocked == fund_TP-01 still_blocked")

    # ---- summary ---------------------------------------------------------------------------
    print(f"wrote {len(WRITTEN)} files ({len(fx)} fixtures)")
    print(f"package value      ${float(total_value):,.2f} across {len(jobs)} jobs")
    print(f"routed             {route['stats']['assigned']} assigned (${route['stats']['assigned_value_cad']:,.2f}, "
          f"SME share {route['stats']['sme_share_pct']:.1%}), {route['stats']['blocked']} blocked "
          f"(${gaps0['summary']['blocked_value_cad']:,.2f})")
    print(f"credit before      ${ledger0['credit_total_cad']:,.2f} = {ob0:.2%} of obligation; "
          f"SMB {ledger0['smb']['progress_pct']:.1%}")
    print(f"credit after TP-01 ${ledger1['credit_total_cad']:,.2f} = {ob1:.2%} (+{(ob1 - ob0) * 100:.2f} pts); "
          f"SMB {ledger1['smb']['progress_pct']:.1%} (+{smb_rise * 100:.1f} pts)")
    print(f"TP-01 headline     {fund1['headline']}")
    print(f"TP-02 headline     {fund2['headline']}")
    print(f"after TP-02        {fund2['after']['obligation_met_pct']:.2%} of obligation, 0 blocked")
    tp1 = fund1["package"]
    print(f"pitch numbers      work package ~{short_money(total_value)}; obligation {ob0:.1%} -> {ob1:.1%}; "
          f"SMB {ledger0['smb']['progress_pct']:.1%} -> {ledger1['smb']['progress_pct']:.1%}; "
          f"TP-01 unblocks {len(fund1['unblocked_jobs'])} jobs worth {short_money(tp1['unblocks_value_cad'])} "
          f"(earning {short_money(fund1['credit_added_breakdown']['jobs_cad'])} credit)")
    print(f"demo shop          {DEMO_SHOP_ID} {base.shops[DEMO_SHOP_ID]['name']}: offers "
          f"{[o['job_id'] for o in shop0['offers']]}; readiness '{r0[0]['message'] if r0 else '-'}' -> "
          f"'{r1[0]['message'] if r1 else '-'}'")
    if FAILURES:
        print(f"\nFAILED {len(FAILURES)} scenario check(s):", file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("all scenario checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
