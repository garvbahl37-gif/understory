# Design record

The visual system, the reasoning behind it, and the checks that were run rather than assumed.

This document exists because "it looks nice" is not a defensible answer in an interview. Every value below can be traced to a constraint.

---

## The brief, in one paragraph

An engineer opens this at 09:00 on the day a CVE drops. They need to know which services are affected, through which chain, and who owns the fix — in under a minute, while other people are asking them questions. A second audience matters too: a reviewer who has never seen a lockfile and needs the same answer to be legible. So the interface has to be dense enough for the first reader and explicit enough for the second, which mostly means **never making colour the only carrier of meaning** and **always showing the path, not just the verdict**.

---

## The organising idea: depth

A supply chain is read top-down. The service you own is at the surface; the package that is actually on fire is usually four or five levels below it, and nobody on the owning team has ever typed its name.

So **depth gets its own encoding and nothing else is allowed to use it**:

- a single-hue sequential ramp, indigo, light at the surface → dark at the bedrock
- every dependency chain in the application is drawn as an indented monospace tree with a depth gutter
- the graph explorer's radial view maps **radius directly to hop count**
- node fill in the explorer is the same ramp

The payoff is that the tables, the chains and the diagrams all agree, and a reader learns the encoding once.

---

## Three colour families, one job each

| Family | Job | Never used for |
|---|---|---|
| **Indigo** | depth, links, selection, primary actions | status |
| **Warm ramp** | severity — and only severity | anything decorative |
| **Neutral graphite** | everything not carrying meaning | emphasis |

### Ground

```
--ink        #0B0E14   page
--surface    #151922   raised panels
--surface-2  #1D222D   popovers, hovered rows
--well       #080A0F   inset / sunken
--rule       #232936   hairlines
```

Cool graphite rather than pure black: pure black makes a warm severity ramp look muddy, and it flattens elevation because there is nowhere further down to go. Two atmosphere layers sit at `z-index: -1` — a fine grain and a faint overhead gradient — so the ground reads as material rather than as a flat fill.

> **A bug this caused.** The first version lifted content above the atmosphere with `body > * { position: relative; z-index: 1 }`. That rule also applied to portalled overlays, whose `position: fixed` then resolved against the document instead of the viewport — opening ⌘K halfway down a long page put the dialog off-screen with the page showing through it. Painting the ground on `<html>` and dropping both layers to `z-index: -1` removed the need for the rule entirely.

### Text

```
--fg         #E9EDF5   primary
--fg-muted   #B8C1D1   secondary
--fg-subtle  #A3ADBF   captions, hints
--fg-faint   #78839A   annotations — still ≥4.5:1
--fg-ghost   #5A6478   decorative only, never carries text
```

Every one of the first four clears **4.5:1 against all three surfaces**. Measured, not estimated:

| token | on `--ink` | on `--surface` | on `--well` |
|---|---:|---:|---:|
| `--fg` | 16.46 | 14.99 | 16.87 |
| `--fg-muted` | 11.4 | 10.4 | 11.7 |
| `--fg-subtle` | 8.54 | 7.78 | 8.76 |
| `--fg-faint` | 5.07 | 4.62 | 5.20 |
| `--accent` | 8.13 | 7.40 | 8.33 |

### Severity

```
CRITICAL #E25A5A    HIGH #E59318    MEDIUM #ECD76D    LOW #75B478
```

Tuned with a colour-vision validator rather than by eye. The first attempt failed: `#D98A3D` and `#C9A94A` separated by only **ΔE 4.1 under deuteranopia** and 7.7 under normal vision — indistinguishable in a stacked bar. Re-stepping the ramp got it to:

| check | result |
|---|---|
| CVD separation (worst adjacent pair) | ΔE **10.9** deutan · 11.0 tritan — pass |
| Normal-vision floor | ΔE **15.4** — pass |
| Chroma floor | all four above the grey threshold — pass |
| Contrast vs surface | all four ≥ 3:1 — pass |

The one deliberate "failure" is the lightness-band check: severity **should** vary in lightness, because that is a second encoding channel that survives greyscale printing. And every severity mark ships with its label — `CRIT`, `HIGH`, `MED`, `LOW` — so colour alone never carries the meaning.

### Depth

Two ramps from one hue, because a 3px band and a line of 12px text have different requirements.

```
band  #E6ECFF #C3D0F7 #A2B4EE #8298DF #647CC4 #4C619F #3A4B78   (strictly monotonic lightness)
text  #E6ECFF #CBD6FA #B2C1F3 #9BADEA #8A9DE0 #7C90D6 #7185CC   (every step ≥4.5:1 everywhere)
```

The band ramp is free to go as dark as it likes — it carries no text. The text ramp is the same hue held above the contrast floor.

---

## Type

| Role | Face | Why |
|---|---|---|
| Display | **Fraunces** | The wordmark and section titles. A variable serif with real character, so the product has a voice rather than a default. Used with restraint — never below 19px. |
| Interface | **IBM Plex Sans** | Humanist and slightly technical. Not Inter, which is the default everything reaches for. |
| Data | **IBM Plex Mono** | Every identifier, version, CVE id and number. Same family as the UI face, so the interface reads as one instrument rather than two. Tabular figures on. |

Scale: `9 · 10.5 · 11.5 · 12.5 · 13 · 15 · 19 · 22 · 30` — dense, because the data is dense.

---

## The signature: dependency chains as trees

Every path in this application is drawn the way an engineer already reads one:

```
0 │ Checkout API                       service
1 │ └─ express@4.18.0                  declared
2 │    └─ qs@6.11.3
3 │       └─ side-channel@1.0.1
4 │          └─ get-intrinsic@1.1.2    vulnerable
```

A depth number, a coloured band, an indent, a monospace name. Not a breadcrumb with chevrons — a *descent*. This is the notation `npm ls` already uses, which means it needs no explanation for the first audience, and the gutter makes depth legible at a glance for the second.

---

## Two projections of one subgraph

The explorer offers **radial** (default) and **force**, and the reason is worth stating.

A force layout answers *"what is tangled up with what"*. It is bad at the question this product asks, because the physics puts a node wherever the springs settle — **distance on screen means nothing**.

The radial tree makes **radius *be* hop distance**. The thing you asked about is at the centre, each ring outward is one more dependency hop, and the eye reads depth before it reads a label. It draws the breadth-first spanning tree, so each node shows the one canonical route the blast-radius query would report.

Both share the depth ramp, so switching between them is a change of projection, not of language.

Details that took iteration:

- **Label culling by arc length.** Labels are sorted by angle and kept only if they clear the previous one by ≥24px of arc *at their own radius*. Nodes on a hovered route always win. An unreadable pile of overlapping text is worse than fewer labels.
- **Hover traces the route to the centre** and dims everything off it. One breadth-first search per layout, and it is the single most useful thing the drawing can do.
- **The force view re-frames itself while settling** rather than drifting off-screen and snapping back at the end.
- **Reduced motion** runs the layout to completion in one tick instead of animating.

---

## Charts

Chosen by the job the data does, not for variety.

| Data | Form | Why |
|---|---|---|
| Advisory backlog composition | stacked bar, 2px gaps, direct labels | parts of a whole, four ordered categories |
| Exposure depth | column chart on the depth ramp | magnitude over an ordered bin — and it reuses the depth encoding |
| Reach / risk in tables | inline bar + number | comparison within a column, scannable without reading digits |
| Counts | stat tile, no chart | a single number is not a chart |

No dual-axis charts. No pie charts. Legends on anything with more than one series.

---

## Interaction and states

- **Filters live in the URL.** Every view is a shareable link, and filtering is a smaller query rather than a large payload trimmed in the browser.
- **Loading is designed.** Skeletons match the shape of what they replace — the hero skeleton has a five-row chain in it, the radial preview pulses as concentric rings.
- **Empty states are answers.** "Nothing we run can reach this" is a finding, not a blank screen. One advisory in the dataset is deliberately left unexposed so this state is real rather than theoretical.
- **Errors are typed.** Six kinds, each with its own remediation sentence, rendered as a panel with a retry — never a stack trace. Break `COGNODB_PASSWORD` and reload any page to see it.
- **Streaming.** The overview is three Suspense regions; time-to-first-byte is under 100ms with the expensive traversals arriving behind it.

---

## What was checked, not assumed

| Check | Tool | Result |
|---|---|---|
| Contrast, every text token × every surface | computed WCAG ratios | all ≥4.5:1 |
| Severity ramp under colour-vision deficiency | palette validator | ΔE 10.9 deutan / 15.4 normal — pass |
| Depth ramp monotonicity | computed relative luminance | strictly decreasing |
| Console errors, all routes | headless browser | zero |
| Horizontal overflow | headless browser at 375 / 768 / 1440 | none |
| Exactly one `h1` per page | headless browser | pass |
| Buttons without an accessible name | headless browser | zero |
| Every Cypher statement | `npm run verify` against the live instance | 43/43 |

The last one is the important one. It found four correctness bugs that produced *plausible* output and threw no errors — see the README's [What CognoDB does differently](../README.md#what-cognodb-does-differently).

---

## Deliberate omissions

- **No light mode.** A security console is read in a dark room at 09:00, and shipping one good theme beats shipping two mediocre ones.
- **No icon set.** Text labels and the depth gutter carry the meaning. An icon library would have been decoration.
- **No animation on the data.** Numbers do not count up. The content is the point.
