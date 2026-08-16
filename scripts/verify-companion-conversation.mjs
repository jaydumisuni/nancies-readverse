import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const smart = await readFile("worker/smart-companion.ts", "utf8");
assert.doesNotMatch(smart, /const openings:/u, "Companion must not mechanically prepend canned openers");
assert.doesNotMatch(smart, /I am following the conversation/u, "Hard-coded meta continuity dialogue must not be user-visible source text");
assert.match(smart, /Continuity must be invisible to the user/u, "Companion prompt must keep context handling silent");
assert.match(smart, /following the conversation\|conversation \(\?:context\|history\)/u, "Quality gate must reject leaked context-tracking language");
assert.match(smart, /Itachi: "I am\. You\?"/u, "Itachi small-talk should be natural and concise");

const canonical = await readFile("worker/grounded-canonical.ts", "utf8");
assert.doesNotMatch(canonical, /OPENERS/u, "Grounded canonical answers must not prepend avatar catchphrases");
assert.match(canonical, /id: "surprise"/u, "Generic recommendation route must use a verified varied shortlist");
assert.match(canonical, /The Shadow of the Wind/u, "Verified surprise shortlist seed is missing");
assert.match(canonical, /say “surprise me”/u, "Generic recommendation must advertise the grounded follow-up");

const reader = await readFile("worker/grounded-reader.ts", "utf8");
assert.doesNotMatch(reader, /OPENERS/u, "Grounded reader answers must not prepend avatar catchphrases");
assert.match(reader, /return "surprise";/u, "Surprise-me follow-up classifier is missing");
assert.match(reader, /function surprisePrevious/u, "Surprise-me must select from verified prior history");
assert.match(reader, /function isGenericRecommendation/u, "Unconstrained recommendation guard is missing");

console.log("Companion conversation contract passed.");
