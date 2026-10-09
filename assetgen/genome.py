"""DRAGONVEIN genome — the single source of truth for what a dragon is.

A genome is diploid: every gene carries two alleles. The expressed phenotype comes
from the dominant allele; the recessive one stays hidden and can surface in a later
generation. That hidden half is the whole reason breeding is worth doing.

This module is pure data + math. It imports nothing from Blender or Three.js so that
the Python (reference) and TypeScript (runtime) mesh builders can be checked against
each other gene for gene.
"""
from dataclasses import dataclass, field, asdict
from typing import Dict, Tuple, List
import hashlib, json, math

# ---------------------------------------------------------------- RNG
class Rng:
    """xorshift128 — identical stream in Python and TypeScript."""
    __slots__ = ("a", "b", "c", "d")
    def __init__(self, seed: int):
        s = seed & 0xFFFFFFFF or 0x9E3779B9
        self.a = s ^ 0x6D2B79F5; self.b = (s * 0x85EBCA6B) & 0xFFFFFFFF
        self.c = (s * 0xC2B2AE35) & 0xFFFFFFFF; self.d = (s ^ 0x27D4EB2F) & 0xFFFFFFFF
        for _ in range(8): self.next()
    def next(self) -> float:
        t = (self.b << 9) & 0xFFFFFFFF
        self.c ^= self.a; self.d ^= self.b
        self.b ^= self.c; self.a ^= self.d; self.c ^= t
        self.d = ((self.d << 11) | (self.d >> 21)) & 0xFFFFFFFF
        return (((self.a + self.d) & 0xFFFFFFFF) >> 0) / 4294967296.0
    def range(self, lo: float, hi: float) -> float: return lo + self.next() * (hi - lo)
    def int(self, lo: int, hi: int) -> int: return int(math.floor(self.range(lo, hi + 1 - 1e-9)))
    def pick(self, xs): return xs[self.int(0, len(xs) - 1)]
    def chance(self, p: float) -> bool: return self.next() < p

# ---------------------------------------------------------------- gene table
# name -> (lo, hi, kind). kind: 'f' continuous, 'i' integer, 'e' enum index
GENES: Dict[str, Tuple[float, float, str]] = {
    # torso
    "bodyMass":      (0.70, 1.45, "f"),
    "bodyLength":    (0.80, 1.35, "f"),
    "chestDepth":    (0.80, 1.30, "f"),
    # neck + head
    "neckLength":    (0.60, 1.70, "f"),
    "neckArc":       (0.00, 1.00, "f"),
    "headSize":      (0.78, 1.40, "f"),
    "snoutLength":   (0.45, 1.60, "f"),
    "jawWidth":      (0.75, 1.30, "f"),
    # tail
    "tailLength":    (0.60, 1.80, "f"),
    "tailTaper":     (0.50, 1.30, "f"),
    "tailTip":       (0, 3, "e"),          # 0 none 1 fin 2 spade 3 spike-club
    # limbs
    "legLength":     (0.70, 1.40, "f"),
    "legThickness":  (0.70, 1.50, "f"),
    "toeCount":      (3, 5, "i"),
    # wings
    "wingSpan":      (0.55, 1.65, "f"),
    "wingFingers":   (2, 4, "i"),
    "wingShape":     (0.00, 1.00, "f"),    # 0 broad soaring, 1 falcate sprint
    "wingDroop":     (0.00, 1.00, "f"),
    # crown
    "hornCount":     (0, 6, "i"),
    "hornLength":    (0.50, 1.80, "f"),
    "hornCurve":     (0.00, 1.00, "f"),
    "crestType":     (0, 3, "e"),          # 0 none 1 frill 2 fin 3 antler
    "spineCount":    (4, 14, "i"),
    "spineHeight":   (0.40, 1.60, "f"),
    # surface
    "hue":           (0.00, 1.00, "f"),
    "hueShift":      (-0.22, 0.22, "f"),   # belly/membrane offset from base hue
    "saturation":    (0.35, 1.00, "f"),
    "value":         (0.28, 0.92, "f"),
    "pattern":       (0, 4, "e"),          # 0 plain 1 banded 2 mottled 3 gradient 4 iridescent
    "glow":          (0.00, 1.00, "f"),
}
ELEMENTS = ["ember", "tide", "stone", "gale", "jade", "umbra"]
TAIL_TIPS = ["none", "fin", "spade", "club"]
CRESTS    = ["none", "frill", "fin", "antler"]
PATTERNS  = ["plain", "banded", "mottled", "gradient", "iridescent"]

# Mutation rate per gene, per breeding. Rare genes mutate less so they stay rare.
MUTATION_RATE = 0.06
MUTATION_SPREAD = 0.14   # fraction of the gene's range

@dataclass
class Allele:
    value: float
    dominant: bool = True

@dataclass
class Genome:
    """Diploid genome. `g[name]` is a pair of alleles."""
    g: Dict[str, List[Allele]] = field(default_factory=dict)
    element: List[str] = field(default_factory=lambda: ["ember", "ember"])
    generation: int = 0
    lineage: str = ""

    # ---------- expression ----------
    def express(self, name: str) -> float:
        a, b = self.g[name]
        if a.dominant and not b.dominant: v = a.value
        elif b.dominant and not a.dominant: v = b.value
        else: v = (a.value + b.value) * 0.5          # co-dominant → blend
        lo, hi, kind = GENES[name]
        v = min(max(v, lo), hi)
        return round(v) if kind in ("i", "e") else v

    @property
    def phenotype(self) -> Dict[str, float]:
        return {k: self.express(k) for k in GENES}

    @property
    def primary_element(self) -> str: return self.element[0]
    @property
    def recessive_element(self) -> str: return self.element[1]
    @property
    def is_hybrid(self) -> bool: return self.element[0] != self.element[1]

    def rarity(self) -> float:
        """0..1. Extremes and hidden elements are what collectors chase."""
        p = self.phenotype; score = 0.0
        for k, (lo, hi, kind) in GENES.items():
            if kind != "f": continue
            t = (p[k] - lo) / (hi - lo)
            score += abs(t - 0.5) * 2            # distance from the average
        score /= sum(1 for _, (_, _, k) in GENES.items() if k == "f")
        if self.is_hybrid: score += 0.18
        if p["hornCount"] >= 5: score += 0.10
        if p["wingFingers"] == 4: score += 0.08
        if p["pattern"] == 4: score += 0.12       # iridescent
        return min(1.0, score)

    def gid(self) -> str:
        blob = json.dumps({k: round(v, 5) for k, v in self.phenotype.items()},
                          sort_keys=True) + "|".join(self.element)
        return hashlib.sha1(blob.encode()).hexdigest()[:10]

    def to_json(self) -> dict:
        return {"g": {k: [[a.value, a.dominant] for a in v] for k, v in self.g.items()},
                "element": self.element, "generation": self.generation,
                "lineage": self.lineage, "gid": self.gid()}

# ---------------------------------------------------------------- creation
def wild(seed: int, element: str = None) -> Genome:
    """A wild-caught dragon: homozygous-ish, middling stats, element-typical bias."""
    r = Rng(seed)
    el = element or r.pick(ELEMENTS)
    gm = Genome(element=[el, el], generation=0, lineage="wild")
    bias = ELEMENT_BIAS.get(el, {})
    ch, cs, cv = ELEMENT_COLOR.get(el, (0.5, 0.7, 0.5))
    anchor = {"hue": ch, "saturation": cs, "value": cv}
    for k, (lo, hi, kind) in GENES.items():
        mid = (lo + hi) / 2
        if k in anchor:                      # colour genes are anchored, not biased
            base = anchor[k]; spread = COLOR_SPREAD[k]
        else:
            spread = (hi - lo) * 0.30
            base = mid + bias.get(k, 0.0) * (hi - lo) * 0.5
        a = min(max(base + r.range(-spread, spread), lo), hi)
        b = min(max(base + r.range(-spread, spread), lo), hi)
        gm.g[k] = [Allele(a, r.chance(0.7)), Allele(b, r.chance(0.7))]
    return gm

# Absolute colour targets per element. Hue is a wheel position, so biasing it as an
# offset from the midpoint (0.5 = cyan) made every element pastel — ember has to be
# anchored at 0.03, not nudged away from cyan.
ELEMENT_COLOR = {
  "ember": (0.030, 0.90, 0.50),   # deep red-orange
  "tide":  (0.555, 0.74, 0.50),   # ocean blue
  "stone": (0.085, 0.46, 0.38),   # weathered brown
  "gale":  (0.505, 0.26, 0.80),   # pale cyan-white
  "jade":  (0.350, 0.72, 0.46),   # jade green
  "umbra": (0.760, 0.58, 0.30),   # dark violet
}
COLOR_SPREAD = {"hue": 0.035, "saturation": 0.10, "value": 0.09}

# Each element pushes the silhouette so species read apart at a glance.
ELEMENT_BIAS = {
  "ember": {"hornCount": +0.5, "spineHeight": +0.4, "glow": +0.3},
  "tide":  {"wingShape": -0.5, "neckLength": +0.4, "tailLength": +0.5},
  "stone": {"bodyMass": +0.6, "legThickness": +0.6, "wingSpan": -0.4},
  "gale":  {"wingSpan": +0.6, "bodyMass": -0.4, "wingShape": +0.5, "legLength": +0.3},
  "jade":  {"crestType": +0.6, "hornCurve": +0.4, "glow": +0.2},
  "umbra": {"wingDroop": +0.5, "spineCount": +0.4, "pattern": +0.5},
}

def breed(a: Genome, b: Genome, seed: int) -> Genome:
    """Meiosis: one allele from each parent, then mutation. This is the whole game."""
    r = Rng(seed)
    child = Genome(generation=max(a.generation, b.generation) + 1,
                   lineage=f"{a.gid()}x{b.gid()}")
    for k, (lo, hi, kind) in GENES.items():
        from_a = a.g[k][0 if r.chance(0.5) else 1]
        from_b = b.g[k][0 if r.chance(0.5) else 1]
        pair = [Allele(from_a.value, from_a.dominant), Allele(from_b.value, from_b.dominant)]
        for al in pair:
            if r.chance(MUTATION_RATE):
                al.value = min(max(al.value + r.range(-1, 1) * (hi - lo) * MUTATION_SPREAD, lo), hi)
            if r.chance(MUTATION_RATE * 0.5):
                al.dominant = not al.dominant
        child.g[k] = pair
    # element inheritance: one allele each; a matching recessive pair can surface
    ea = a.element[0 if r.chance(0.5) else 1]
    eb = b.element[0 if r.chance(0.5) else 1]
    if ea == eb:
        child.element = [ea, eb]
    elif r.chance(0.08):                       # rare fusion into a third element
        child.element = [FUSIONS.get(frozenset((ea, eb)), ea), ea if r.chance(.5) else eb]
    else:
        child.element = [ea, eb] if r.chance(0.5) else [eb, ea]
    return child

FUSIONS = {
  frozenset(("ember", "tide")):  "umbra",
  frozenset(("ember", "gale")):  "ember",
  frozenset(("stone", "jade")):  "jade",
  frozenset(("tide", "gale")):   "tide",
  frozenset(("umbra", "jade")):  "jade",
  frozenset(("stone", "ember")): "stone",
}

if __name__ == "__main__":
    pa, pb = wild(11, "ember"), wild(29, "tide")
    kid = breed(pa, pb, 777)
    for nm, gm in (("parent A", pa), ("parent B", pb), ("child", kid)):
        p = gm.phenotype
        print(f"{nm:9} {gm.gid()} el={gm.element} gen={gm.generation} rarity={gm.rarity():.2f}")
        print(f"          mass={p['bodyMass']:.2f} wing={p['wingSpan']:.2f} horns={int(p['hornCount'])} "
              f"fingers={int(p['wingFingers'])} spines={int(p['spineCount'])} "
              f"crest={CRESTS[int(p['crestType'])]} tail={TAIL_TIPS[int(p['tailTip'])]} "
              f"pattern={PATTERNS[int(p['pattern'])]}")
