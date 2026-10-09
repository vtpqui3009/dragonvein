# ART BIBLE

## Direction

Stylised realism. Readable chunky silhouettes with real lighting — not flat-shaded
low-poly, not photoreal. The reference feel is a hand-painted diorama lit by a real sun.

- **Silhouette first.** Every asset must be identifiable as a black shape at 25% zoom.
- **Three values per asset.** Dark base, mid body, light accent. No more; it muddies.
- **Light does the work.** Materials stay simple; the sun, the fill and the rim carry mood.
- **Contact shadows are mandatory.** An object without one floats, and floating reads as broken.

## Palette

| role | hex | use |
|---|---|---|
| sky zenith | `#0a1c4f` | top of the gradient |
| sky horizon | `#ff9044` | golden hour band |
| deep shadow | `#1a1420` | underside of islands, crevices |
| rock mid | `#5a4a40` | cliffs |
| foliage dark | `#1e4a21` | canopy underside |
| foliage mid | `#3f8a33` | canopy |
| foliage light | `#8fd24a` | sunlit leaf tips |
| water | `#2d92ba` → `#a6f1f2` | depth gradient |
| UI surface | `rgba(11,36,48,0.82)` | glass panels |
| UI accent | `#ffd479` | highlights, currency |

Dragon colour comes from genes, not from this table — but saturation stays inside
0.35–1.00 and value inside 0.28–0.92 so no dragon is pure white or pure black and every
dragon reads against both sky and ground.

## Proportions

Dragons are chunky and front-heavy: head roughly 1/5 of body length, legs short relative
to torso, wings generous. Cute enough to want, sharp enough to respect.

## Lighting

One sun with cascaded shadows. One cool fill from the opposite side at roughly 20% of key
intensity. One warm rim. Day/night cycles the sun colour and elevation, never the asset.

## Density

A dressed island is never bare between features. Ground cover, scatter rocks, fallen
leaves and small flora fill the gaps. The `art-critic`'s A6 line exists to enforce this.
