"""
Maps raw YOLOv8 class names onto the coarse waste categories that the
priority engine scores on.

The trained model's class list is whatever `best.pt` was trained with, so
resolution happens in two passes:

  1. EXPLICIT_MAP  - exact, lowercased class-name matches. Add entries here
                     as you confirm the real class list.
  2. KEYWORD_RULES - substring fallback, first match wins. Catches variants
                     like "plastic_bottle", "Plastic Bottle", "pet bottle".

Anything unresolved becomes "Other", which the scorer weights at 0.45.
Keep these category strings in sync with
frontend/src/lib/priority/weights.ts.
"""

PLASTIC = "Plastic"
PAPER = "Paper/Cardboard"
GLASS = "Glass"
METAL = "Metal"
ORGANIC = "Organic/Food"
BIOMEDICAL = "Biomedical/Hazardous"
EWASTE = "E-waste"
OTHER = "Other"

ALL_CATEGORIES = [
    PLASTIC,
    PAPER,
    GLASS,
    METAL,
    ORGANIC,
    BIOMEDICAL,
    EWASTE,
    OTHER,
]

EXPLICIT_MAP = {
    "plastic bag": PLASTIC,
    "plastic bottle": PLASTIC,
    "plastic container": PLASTIC,
    "plastic cup": PLASTIC,
    "plastic wrapper": PLASTIC,
    "styrofoam": PLASTIC,
    "cardboard": PAPER,
    "paper": PAPER,
    "carton": PAPER,
    "newspaper": PAPER,
    "glass bottle": GLASS,
    "broken glass": GLASS,
    "can": METAL,
    "metal can": METAL,
    "aluminium foil": METAL,
    "scrap metal": METAL,
    "pop tab": METAL,
    "plastic bottle cap": PLASTIC,
    "drink carton": PAPER,
    "food waste": ORGANIC,
    "vegetable waste": ORGANIC,
    "organic waste": ORGANIC,
    "leaves": ORGANIC,
    "syringe": BIOMEDICAL,
    "medical waste": BIOMEDICAL,
    "biomedical waste": BIOMEDICAL,
    "mask": BIOMEDICAL,
    "sanitary waste": BIOMEDICAL,
    "battery": EWASTE,
    "electronic waste": EWASTE,
    "e-waste": EWASTE,
    "cable": EWASTE,
}

# (substring, category) - evaluated in order, first hit wins.
KEYWORD_RULES = [
    ("syringe", BIOMEDICAL),
    ("needle", BIOMEDICAL),
    ("medic", BIOMEDICAL),
    ("biomed", BIOMEDICAL),
    ("hazard", BIOMEDICAL),
    ("sanitary", BIOMEDICAL),
    ("diaper", BIOMEDICAL),
    ("mask", BIOMEDICAL),
    ("batter", EWASTE),
    ("electron", EWASTE),
    ("e-waste", EWASTE),
    ("ewaste", EWASTE),
    ("circuit", EWASTE),
    ("cable", EWASTE),
    ("plastic", PLASTIC),
    ("polythene", PLASTIC),
    ("polyethylene", PLASTIC),
    ("pet ", PLASTIC),
    ("styrofoam", PLASTIC),
    ("thermocol", PLASTIC),
    ("wrapper", PLASTIC),
    ("straw", PLASTIC),
    ("cardboard", PAPER),
    ("carton", PAPER),
    ("paper", PAPER),
    ("newspaper", PAPER),
    ("glass", GLASS),
    ("metal", METAL),
    ("aluminium", METAL),
    ("aluminum", METAL),
    ("tin", METAL),
    ("can", METAL),
    ("food", ORGANIC),
    ("organic", ORGANIC),
    ("vegetable", ORGANIC),
    ("fruit", ORGANIC),
    ("leaf", ORGANIC),
    ("leaves", ORGANIC),
    ("compost", ORGANIC),
]


def resolve_category(class_name: str) -> str:
    """Resolve a raw YOLO class name to a coarse waste category."""
    if not class_name:
        return OTHER

    key = class_name.strip().lower().replace("_", " ")

    if key in EXPLICIT_MAP:
        return EXPLICIT_MAP[key]

    for needle, category in KEYWORD_RULES:
        if needle in key:
            return category

    return OTHER
