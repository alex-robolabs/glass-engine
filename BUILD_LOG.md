# BUILD LOG: The Glass Engine

Built by Claude Code (Fable 5) for Robolabs Summer Academy 2026.

## The plan

One self-contained `glass-engine.html`, no network, phone-first. Five modules, five checkpoints, five gauges, one license card.

**Order of work:**
1. Generate the data assets in parallel (multi-agent workflow):
   - a 250-sentence lowercase corpus for the bigram model, written to branch well (shared vocabulary, recurring characters) so temperature visibly matters
   - a 110-word 2D meaning map with cluster layout, coordinates solved so the three word-math presets land exactly (verified by script before acceptance)
   - a deterministic subword tokenizer vocab (common words, prefixes, suffixes, units) that provably splits "strawberry" into straw + berry
2. Build the single HTML file: shared design system (asphalt `#171D26`, glass panels, amber/teal/alert, mono-as-instrument), header gauge cluster (SVG, needle sweep on checkpoint pass), bottom nav on phone / top rail on desktop, the five modules, checkpoint factory, license modal.
3. Verify every acceptance checklist line with real tooling: puppeteer-core driving system Chrome headless at 360 px and 1280 px, network request monitoring, tap-target measurement, reduced-motion emulation, scripted click-through of all five checkpoints to the license, plus static checks (file size, em dash grep, external URL grep) and logic checks run in node (temperature behavior, tokenizer, word math).
4. Only then: stretch goals, re-verified.

**Key design decisions (made up front):**
- Bigram sampling is `p ∝ count^(1/T)`. At T=0.2 that is count^5 (near-argmax, repetitive); at T=2.0 it is count^0.5 (flattened, weird). Real math, honest footnote.
- Word math is a parallelogram: the answer word is placed at exactly `A - B + C` so the presets are guaranteed, then nearest-neighbor lookup (excluding the three inputs) is verified by script over the whole map so no other word photobombs the landing zone.
- Tokenizer is greedy and deterministic: known whole words pass through, known prefixes/suffixes split off, leftovers chunk into 3-4 char pieces. "straw" and "berry" are both vocabulary units, so "strawberry" always splits visibly.
- `ATTENTION_PRESETS` is one flat array with a loud CLASS SENTENCE SLOT comment; the UI builds preset chips and toggles purely from that array, so a live-added preset needs zero other edits.
- All animation goes through CSS transitions/keyframes plus a single `prefers-reduced-motion` gate; JS checks the same media query before running JS-driven animations (needle sweeps, ghost dot, line draws).
- No em dash will exist anywhere in the file, code comments included, so the copy check can never be poisoned by a comment.

## Decisions and errors

**Asset generation (multi-agent).** Three agents ran in parallel: a corpus writer, a word-map designer, and a tokenizer designer, each required to verify its own output with a script before returning. Best catch of the run: the tokenizer agent noticed that the fallback 4/3 chunker split "skyscraper" into `skys · crap · er`, which is not a word you want on a projector in front of twenty teenagers. It added "scrap" as a vocabulary unit so the split becomes `sky · scrap · er`. This is why you verify.

**Error 1: license modal open on page load.** The modal uses the `hidden` attribute, but `.modal { display: flex }` has higher specificity than the browser's `[hidden] { display: none }`, so the modal (and the license banner) rendered immediately. Fix: a global `[hidden] { display: none !important; }` rule. Classic, embarrassing, caught by the very first screenshot.

**Decision: build tooling lives outside the deliverable.** The app is one hand-written HTML file assembled from `.src/` parts by a tiny node script that splices the generated data in and refuses to emit the file if it contains an em dash, an en dash, or an unspliced data marker, or if it exceeds 400 KB. The copy rule is enforced by the compiler, not by hoping.

**Error 2: license card mini-gauges rendered as five bare dots.** The gauge stroke styles were scoped under `.gauge`, and the card's mini-gauges live outside that class, so their arcs and needles had no stroke and only the center pins drew. Unscoped the part styles. Caught by screenshotting the license flow.

**Error 3: harness, not app.** The temperature check read the generated sentence via `textContent`, which concatenates spans with no spaces, so the word-overlap metric compared single giant tokens. Fixed the harness to read the model's word array directly.

**Decision: dry-run the whole checklist on placeholder data.** Before the real corpus and map were ready, the full 31-check harness ran against a stub build. That shook out harness bugs early and proved the temperature check fails exactly when it should: a 10-sentence stub corpus has every bigram count equal to 1, and count^(1/T) of 1 is 1 at any temperature. The slider cannot change anything when the model has no opinions. Good lesson for the lecture, honestly.

**Error 4: the meaning map was an unreadable word soup at 360 px.** 111 labels in a 100-unit plane with a verified minimum spacing of 2.8 units cannot all be legible; that is geometry, not CSS. Fix: every word keeps its dot (still tappable, still counted in the math), but labels go through a greedy collision pass that prioritizes the word-math preset words; hidden labels pop back in whenever their word is selected or glows as a neighbor.

**Error 5: probability bars rendered as empty tracks.** Two causes stacked: the fill span was `display: inline`, so its width and height were ignored, and true probabilities (a top candidate at 5.8%) made even correct fills near-invisible. Fixes: block-level fill, and bar widths now scale relative to the front-runner while the mono labels keep the true percentages. Honest numbers, visible bars.

**Decision: corpus agent overruled on one constraint.** The corpus writer satisfied every check that matters (259 valid sentences, five starter phrases each with 10+ openings and 5+ continuations, cold generation loops, hot generation goes weird) but kept grinding to squeeze 571 unique words under my arbitrary 440 target, which was making sentences worse, not better. I stopped it and took the corpus as-is. Constraints serve the product, not the other way around.

**Decision: verification is headless Chrome, not vibes.** puppeteer-core drives the real installed Chrome against `file://` with a network listener attached, at 360 px and 1280 px, with `prefers-reduced-motion` emulation for the accessibility checks. Every checklist line gets a scripted check where one is possible, screenshots where judgment is needed.

**Adversarial review round (multi-agent).** Six specialist reviewers (spec compliance, copy and voice, JS correctness, mobile Safari quirks, design and pedagogy, and a break-it tester) audited the finished build, with a second wave of agents assigned to refute each finding. A rate limit ate part of the first run; the survivors' findings were triaged by hand and the missing reviewers re-ran after the reset. Fixes that came out of it:
- The "see the full grid" button could leak the answer before the student committed a prediction, which breaks the predict-first rule. It now unlocks only after they commit.
- Inputs and selects were 14.4 px, which makes iOS Safari zoom the whole page on focus. Bumped to 16 px.
- Hover highlights stuck after taps on touch screens; hover styles now live behind `@media (hover: hover)`.
- No `AudioContext.resume()` meant sound died permanently after an iOS interruption. The license PNG's blob URL was also revoked so fast that iOS's download confirmation could lose the race; now it waits a minute.
- Long-pressing the meaning map could summon the iOS text-selection loupe mid-pan; the map is now unselectable.
- The LOOP intro called a scripted replay "a real diagnosis"; it now says replay, because honesty is a spec requirement, not a vibe. TOKENS also gained its missing honest footnote about hand-made chunk lists and fake IDs.
- The license PNG truncated names at 20 characters while the input allowed 24; the canvas now shrinks the font to fit instead of cutting kids' names off.
- Resizing the window during an attention reveal overwrote the "you read it like the machine does" message with toggle copy. Redraws now refresh geometry without touching the words, and the curved lines re-anchor to the chips within a pixel.

**Second review wave (code, design, break-it), 12 confirmed findings, all fixed:**
- Best catch of the whole build: at the 30-word generation cap, the app silently dropped the sampled word and rendered the end-of-sentence square as if the model chose to stop, even when P(end | last word) was zero. A tiny lie in an app whose whole point is honesty. The cap now keeps the word and renders a distinct "... out of road, start over" marker, which is accidentally also a lesson: real APIs distinguish stop from length for exactly this reason.
- The license modal declared aria-modal but let Tab wander into the page behind it and dropped focus on close. It now traps Tab across its three controls and returns focus to the claim button.
- Selecting a word on the map left the previous word-math ghost dot glowing forever; the brightest pixel on screen contradicted the current selection. Cleared on select.
- Tapping a word-math preset mid-animation rewrote the dropdowns but silently skipped the compute, leaving the printed result contradicting the dropdowns. Controls now lock while the dot travels.
- Map labels were ~8 px on phones; raised to ~12 px with a dark halo, with the collision-thinning pass absorbing the size change, and revealed neighbor labels get their own mini collision pass so the flagship "tap robot" demo stays crisp.
- "propeller" clipped at the map's right edge; edge labels now flip to the left of their dot.
- The attention heatmap stayed postage-stamp sized on a projector; cells now grow at desktop widths.
- The attention stage reserved 100 px of blank arc headroom before there was anything to draw; it now grows when the reveal happens.
- An unbroken emoji run tokenized as one giant pill that forced horizontal scroll at 360 px; symbol runs now chunk by code points like digits do.

**What was NOT fixed, deliberately:** four findings were rejected by adversarial verification as artificial (force-clicking hidden buttons from the console, double-invoking internal functions) or cosmetic beyond usefulness (two toasts overlapping if you speedrun the whole app in 30 seconds).

## Final verification record

Every acceptance checklist line, verified by scripted headless Chrome runs (`.verify/checklist.js`, 31 checks) plus eyes on screenshots:

- Opens from file:// with the network emulated offline; the only request is the document itself. Load event in ~60 ms.
- 360 px: max scrollWidth 360 on all five tabs with the grid, free play, and strawberry caption open; every button, select, input, and textarea at least 44 px tall; bottom nav inside the viewport.
- 1280 px: root font scales to 19 px (22 px past 1400), headers proportionally; screenshots reviewed.
- Temperature: at 0.2 eight generations from "the robot" collapse into repetitive loops (mean pairwise word overlap 0.45); at 2.0 they diverge (0.16 and all eight distinct). Visible on the bars as the distribution flattens live.
- "strawberry" tokenizes to exactly [straw, berry]; counter reads "2 tokens · 10 characters"; the why-models-miscount caption appears.
- Word math: king - man + woman = queen, robot - wheels + wings = drone, dog - puppy + kitten = cat, all three land, verified by reading the rendered answer after the animation.
- Attention: heavy routes to robot, muddy to field, big to trophy, small to suitcase; the toggle re-route animates via CSS transitions on the line weights; verified after committing a prediction first, as students will.
- A third preset injected into ATTENTION_PRESETS appeared as a working chip with both endings routing correctly, zero other edits; then removed.
- All five checkpoints answered (including one wrong answer first to confirm kind feedback and retry), five gauges sweep to full (needle transform and arc dashoffset checked computationally), license renders a typed name and the current date.
- prefers-reduced-motion: needle flutter animation-name is none, sweep and draw transitions collapse to 1 ms, the word-math dot lands instantly with the result text present.
- No em dash or en dash anywhere in the file bytes or the rendered text (also enforced at build time).
- 93.8 KB, a quarter of the budget.

Stretch goals, all five, verified: PNG download saves a real license card (long names shrink to fit), free-play heatmap renders for arbitrary sentences, idle needle flutter runs (and dies under reduced motion), sound is mute-by-default with a working toggle and iOS resume handling, and five taps on the title do something worth finding.

Build artifacts: `.src/` holds the source parts and the build script; `.verify/` holds the checklist harness and screenshots. The deliverable `glass-engine.html` is assembled by `node .src/build.js`, which refuses to emit dashes or oversized files.
