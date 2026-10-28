import test from "node:test";
import assert from "node:assert/strict";

import { scoreZoneMatch } from "./zoneTextMatch";

/*
 * scoreZoneMatch is the pure half of the matcher: it takes one zone and some
 * text and decides whether the text names that zone. The thresholds it feeds
 * are 80 for a strong match and 68 for a weak one, so the assertions here
 * pin those boundaries rather than exact scores.
 */

// buildMatcher is internal, so these mirror what it produces for real rows.
function matcherFor(name: string, type: string, weight: number) {
  // Re-derive through the same code path the resolver uses by scoring a text
  // that definitely contains the full name, then reuse the returned matcher.
  // Simpler: construct the shape directly to keep the test independent.
  const head = name.split(",")[0];
  const rest = name.split(",").slice(1).join(" ").trim();

  const normalise = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

  const words = head.split(/[^A-Za-z0-9]+/).filter(Boolean);

  let acronym = "";
  for (const word of words) {
    const lower = word.toLowerCase();
    if (["of", "and", "the", "for"].includes(lower)) continue;
    acronym += word.length <= 5 && word === word.toUpperCase() ? lower : lower[0];
  }

  let shortForm = "";
  for (const word of words) {
    if (word.length <= 5 && word === word.toUpperCase() && /[A-Z]/.test(word)) {
      shortForm += word.toLowerCase();
    } else break;
  }

  const GENERIC = new Set([
    "college", "school", "hospital", "institute", "university", "academy",
    "technology", "technical", "education", "engineering", "of", "the",
    "national", "public", "high", "international", "memorial", "medical",
    "bengaluru", "bangalore", "sciences", "science", "multispeciality",
  ]);

  return {
    zone: { name, type, weight },
    normalised: normalise(name),
    acronym,
    shortForm,
    distinctive: normalise(head)
      .split(" ")
      .filter((t) => t.length >= 3 && !GENERIC.has(t)),
    locality: rest ? normalise(rest) : null,
  };
}

const JSSATE = matcherFor(
  "JSS Academy of Technical Education, Bengaluru",
  "COLLEGE",
  1.45
);
const RVCE = matcherFor("R V College of Engineering", "COLLEGE", 1.45);
const NARAYANA = matcherFor(
  "Narayana Multispeciality Hospital, HSR",
  "HOSPITAL",
  1.6
);

test("zone text matching", async (t) => {
  await t.test("matches the full acronym", () => {
    const result = scoreZoneMatch("garbage dumped near JSSATE", JSSATE);
    assert.ok(result);
    assert.ok(result.score >= 80, `expected strong, got ${result.score}`);
  });

  await t.test("matches a short form plus city", () => {
    const result = scoreZoneMatch("dump near JSS Bangalore", JSSATE);
    assert.ok(result);
    assert.ok(result.score >= 80, `expected strong, got ${result.score}`);
  });

  await t.test("matches RVCE written in full as an acronym", () => {
    const result = scoreZoneMatch("waste outside RVCE main gate", RVCE);
    assert.ok(result);
    assert.ok(result.score >= 80);
  });

  await t.test("matches a truncated acronym people actually type", () => {
    const result = scoreZoneMatch("near RVC college", RVCE);
    assert.ok(result, "RVC should resolve to RVCE");
    assert.ok(result.score >= 80, `expected strong, got ${result.score}`);
  });

  await t.test("matches a two-letter short form only with a kind word", () => {
    const withKind = scoreZoneMatch("beside RV college", RVCE);
    assert.ok(withKind);
    assert.ok(withKind.score >= 68);

    const withoutKind = scoreZoneMatch("rv parked here", RVCE);
    assert.ok(
      withoutKind === null || withoutKind.score < 68,
      "a bare two-letter token must not trigger a zone"
    );
  });

  await t.test("matches a distinctive word", () => {
    const result = scoreZoneMatch("rubbish outside Narayana hospital", NARAYANA);
    assert.ok(result);
    assert.ok(result.score >= 68);
  });

  await t.test("naming the branch raises confidence", () => {
    const plain = scoreZoneMatch("near Narayana hospital", NARAYANA);
    const branch = scoreZoneMatch("near Narayana hospital HSR", NARAYANA);
    assert.ok(plain && branch);
    assert.ok(branch.score > plain.score);
  });

  await t.test("generic words alone never match", () => {
    assert.equal(scoreZoneMatch("near the college", RVCE), null);
    assert.equal(scoreZoneMatch("big pile of garbage", JSSATE), null);
    assert.equal(scoreZoneMatch("next to a hospital", NARAYANA), null);
  });

  await t.test("unrelated text does not match", () => {
    assert.equal(scoreZoneMatch("overflowing bin on 5th main", JSSATE), null);
    assert.equal(scoreZoneMatch("plastic waste near the lake", RVCE), null);
  });

  await t.test("empty text is safe", () => {
    assert.equal(scoreZoneMatch("", JSSATE), null);
    assert.equal(scoreZoneMatch("   ", JSSATE), null);
  });
});
