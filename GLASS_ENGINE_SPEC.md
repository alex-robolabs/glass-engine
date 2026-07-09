# GLASS ENGINE BUILD SPEC
## A challenge for Claude Code running Fable 5

You are building **The Glass Engine**: an interactive, phone-first web app that lets high school students see inside a large language model by touching it. It will be used twice in one lecture at the Robolabs Summer Academy at UC Berkeley: first driven by the instructor on a projector, module by module, as the visual aid for a talk on how LLMs work; then released to about twenty students' phones via QR code, where they explore it solo, pass five checkpoints, and earn a license card they will want to screenshot.

Your bar is not "working demo." Your bar is: a 16-year-old picks this up with zero instructions, gasps at least once, and can explain tokens, embeddings, attention, temperature, and the agent loop afterward. Reference points for the energy we want: the 3Blue1Brown GPT lessons (visual clarity, honest mechanics) and Google's Sketch-RNN experiment (you act, the model responds, delight). Ours must be MORE tactile than both, and it must run on a school kid's phone.

Work in this order: read the whole spec, write a short plan, build the core, verify every line of the acceptance checklist yourself, and only then attempt stretch goals. Keep a running BUILD_LOG.md as you work (plan, decisions, errors you hit and fixed); the instructor will show that log on stage as proof an agent built this.

---

## 1. Hard constraints (non-negotiable)

1. **One single self-contained HTML file** named `glass-engine.html`. All CSS and JS inline. No external requests of any kind: no CDNs, no fonts, no analytics, no API calls. It must work opened from the filesystem with wifi off.
2. **No backend, no accounts, no cookies.** State lives in memory; losing progress on refresh is acceptable.
3. **Phone-first**: flawless at 360 px wide, touch targets at least 44 px, no horizontal scroll, iOS Safari and Android Chrome both fine. **Projector mode too**: at desktop widths, type and visuals scale up so the back row of a lecture hall can read them.
4. **Performance**: interactive in under 2 seconds on a mid-range phone; file size under about 400 KB.
5. **Accessibility floor**: visible keyboard focus, respects prefers-reduced-motion, text contrast at least 4.5:1.
6. **Copy rules**: sentence case, plain verbs, playful but never cringe, scientifically honest. **Never use an em dash anywhere in the app copy**; use commas, colons, or periods. Every simplification gets an honest footnote (see module specs).
7. **The live-demo hook**: all attention presets live in ONE clearly named data array (`ATTENTION_PRESETS`) with a loud comment reading `CLASS SENTENCE SLOT: add new presets here, match this shape`. During the lecture, an agent will add a preset live in front of the class, so this array must be trivially extendable and the UI must pick up a new preset with zero other changes.

## 2. Art direction

Concept: **night pit-lane telemetry meets a glass anatomy model**. This is a robotics camp; the app should feel like the tool a pit crew would use to look inside an engine, because that is exactly what it is.

- Palette: asphalt blue-grey base `#171D26` (not pure black), glass panels `rgba(255,255,255,0.05)` with a 1 px inner stroke, signal amber `#FFB020` for primary interaction and highlights, coolant teal `#5BD1C6` for data and secondary accents, alert `#FF5D45` for wrong answers and hot readings, chalk `#EDF2F7` text with dim `#8B97A8` captions. You may refine these values if you can justify it; do not drift into acid-green-on-black or cream-and-serif clichés.
- Type: system stacks only (no font files). All numbers, IDs, probabilities, and telemetry readouts in `ui-monospace`; that mono-as-instrument feel carries the personality. Display headers heavy and tight-tracked.
- **Signature element**: a cluster of five small gauge dials in the header, one per module. Passing a module's checkpoint sweeps that needle to full with a satisfying animation. Five full gauges unlock the Engine License. Spend your polish budget here.
- Motion: purposeful only. Needle sweeps, probability bars growing, attention lines drawing themselves, a ghost dot traveling during word math. No ambient particle nonsense.

## 3. Structure

Header (title "THE GLASS ENGINE", tagline "See inside the machine.", gauge cluster) · five tabs (bottom nav on phones, top rail on desktop): **PREDICT · TOKENS · MEANING · ATTENTION · LOOP** · license modal · a one-line footer: "Built by an AI coding agent for Robolabs Summer Academy 2026".

Each tab ends with a **CHECKPOINT**: one multiple-choice question, three options, tap to answer, instant feedback, a one-line explanation appears either way, retry until correct, correct answer sweeps that tab's gauge.

## 4. The five modules

### 4.1 PREDICT: a real tiny language model
The mind-blow: a genuine, working language model small enough to live inside this webpage.

- Embed a corpus you write yourself: 200 to 300 short lowercase sentences themed on robots, pit crews, summer camp, Berkeley, school, food, sports, and music. Make them funny. Build a word-pair (bigram) chain from it at load.
- UI: starter chips ("the robot", "my teacher", "at lunch", "the pit crew", "our team"). After each word, show the **top five candidate next words as animated horizontal probability bars** with mono percentages. The student can tap a bar to choose that word, or press "Roll the dice" to sample, or "Auto-finish" to watch it generate word by word. "Start over" resets.
- **Temperature slider** from 0.2 to 2.0 that genuinely reweights sampling (probability proportional to count^(1/T)). Label the ends "boring" and "unhinged" with live state words between. Low temperature must visibly produce repetitive safe text; high temperature must go delightfully weird.
- Honest footnote, verbatim spirit: "This is a real language model that fits in a webpage. It learned by counting word pairs in 300 sentences. GPT plays the same game with attention, deep networks, and most of the internet."
- Checkpoint idea: what does raising the temperature do? (Correct: it picks less likely words more often.)

### 4.2 TOKENS: the engine eats numbers
- A big input box. As the student types, render the text as **colored token chunks**, each pill showing its chunk and a small mono ID number beneath. An approximate subword tokenizer is fine (common-word whole tokens, known prefixes and suffixes split off, remaining text chunked), but it must be deterministic and must visibly split words like "strawberry" into pieces such as `straw` and `berry`.
- Live counter: "N tokens · M characters". A context-window meter showing their sentence as a sliver of a 1,000,000-token window, with the percentage in mono.
- A "try strawberry" chip that triggers a caption: the model sees chunks, not letters, which is why counting the r's in strawberry is famously hard for it.
- Checkpoint idea: why do models miscount letters? (Correct: they see chunks, not letters.)

### 4.3 MEANING: a map where distance is meaning
- A pannable-feeling (but simple) 2D scatter of roughly 100 to 120 everyday words positioned so related words cluster: royalty and people, animals, food, robotics and machines, feelings, school and sports, music, places (include berkeley). Tap any word: it lights up and its five nearest neighbors glow with connecting lines.
- **Word math**: three dropdowns and a compute button for expressions of the form A minus B plus C. A ghost dot animates from A along the vector path and lands near the answer word, which pulses. Preset chips that MUST work exactly, so place coordinates to guarantee them: `king - man + woman = queen`, `robot - wheels + wings = drone`, `dog - puppy + kitten = cat` (or the equivalent parallelogram with cat and kitten). Nearest-word lookup must exclude the three input words.
- Honest footnote: real models use thousands of dimensions, not two; this map is a flattened cartoon of the idea, and the idea is real.
- Checkpoint idea: in this map, close together means what? (Correct: similar meaning.)

### 4.4 ATTENTION: every word looks at every other word
- Preset-driven, with a **predict-first flow**: show the sentence as word chips, ask "Tap the word that 'it' points to," let the student commit to an answer, THEN animate curved lines from "it" to the other words with thickness and opacity proportional to hand-crafted attention weights. If they were right, celebrate; if wrong, show the machine's view kindly.
- Preset 1: "The robot couldn't cross the field because it was too [heavy | muddy]" with a toggle between endings. Heavy must route attention to robot; muddy must route to field; toggling animates the re-route. Preset 2: "The trophy wouldn't fit in the suitcase because it was too [big | small]" (big routes to trophy, small to suitcase).
- A "see the full grid" toggle that shows a small heatmap of word-to-word weights for the curious.
- The `ATTENTION_PRESETS` array and CLASS SENTENCE SLOT comment from the hard constraints live here.
- Checkpoint idea: attention lets each word do what? (Correct: look at every other word to sharpen its meaning here.)

### 4.5 LOOP: the engine is not the car
- A step-through replay of an agent diagnosing a robot, matching the lab these students did yesterday, so use EXACTLY this scenario: question "vex-red drives for about a minute, then veers left and stops. What's wrong?" Step 1 PLAN: check battery and error log before concluding. Step 2 ACT: `check_battery("vex-red")` returns "12.6V (full is about 12.8V)". Step 3 OBSERVE: battery is fine, keep digging. Step 4 ACT: `get_error_log("vex-red")` returns "WARN: left drive motor over temperature (Port 1)". Step 5 OBSERVE: found it. Step 6 ANSWER: left drive motor is overheating, thermal protection cuts power, so the robot pulls left and stops; let it cool and check Port 1 friction.
- Render each step as a card with a badge (PLAN amber, ACT teal, OBSERVE dim, ANSWER green) and mono chips for tool calls. Buttons: "Next step" and "Run it again". Closing line on screen: "Model = engine. Agent = engine + tools + this loop."
- Checkpoint idea: what makes an agent more than a model? (Correct: tools plus a loop that checks results.)

## 5. The license
When all five gauges are full, a "Claim your Engine License" action unlocks: the student types their name and receives a license card styled like a pit pass: checkered accent strip, THE GLASS ENGINE, their name large, "Certified Engine-Opener", the date, "Robolabs Summer Academy 2026 · UC Berkeley", five filled mini-gauges. Include a "screenshot this" nudge. Make this card the thing they show their friends.

## 6. Pedagogy requirements
Predict before reveal wherever possible (attention does this explicitly; PREDICT's tap-a-bar does it implicitly). Immediate feedback everywhere. One concept per screen, no walls of text: captions of one or two sentences. Retry until correct on checkpoints, never punishing. Self-paced: nothing auto-advances.

## 7. Acceptance checklist (verify each yourself before touching stretch goals)
- [ ] Opens from file:// with wifi off; zero network requests in devtools
- [ ] At 360 px wide: no horizontal scroll, all taps land, bottom nav reachable
- [ ] At 1280 px wide: readable from the back of a lecture hall
- [ ] Temperature slider visibly changes generation character at both extremes
- [ ] "strawberry" visibly splits into chunks; token counter accurate
- [ ] All three word-math presets land on the promised words
- [ ] Attention: heavy routes to robot, muddy to field, big to trophy, small to suitcase; toggle animates
- [ ] Adding a third object to ATTENTION_PRESETS (test it, then remove it) appears in the UI with no other edits
- [ ] All five checkpoints pass, gauges sweep, license renders with a typed name and current date
- [ ] prefers-reduced-motion disables sweeps and line-draw animations
- [ ] No em dash anywhere in rendered copy (search the file)
- [ ] File under ~400 KB, loads fast

## 8. Stretch goals, in order, only after the checklist is green
1. Download-the-license: render the card to a canvas and offer it as a PNG download.
2. Attention free-play: a small free-text mode that renders a heuristic word-to-word heatmap for any short sentence.
3. A subtle "engine idle" ambient state on the header gauges (tiny needle flutter), disabled under reduced motion.
4. Sound design behind a mute-by-default toggle: soft click on token chunking, a rising tick on gauge sweeps.
5. One hidden easter egg for the kid who taps the title five times. Your call. Make it worth finding.

## 9. Deliverables
1. `glass-engine.html`
2. `BUILD_LOG.md`: your plan, key decisions, every error you hit and how you fixed it, and what you verified.
3. `DEMO_NOTES.md`: three lines telling the instructor the coolest thing to show first on a projector and the one thing to avoid doing live.
