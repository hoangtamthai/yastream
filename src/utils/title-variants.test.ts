import { describe, expect, it } from "vitest";
import {
  isCandidateAllowed,
  parseCatalogTitle,
  titleSimilarity,
} from "./title-variants.js";

const titles = (raw: string, type = "series") =>
  parseCatalogTitle(raw, type).variants.map((v) => v.title);

describe("parseCatalogTitle", () => {
  it.each([
    ["Knot (Uncut Version)", "Knot"],
    ["Lovex3 Uncut Version", "Lovex3"],
    ["Fool in Love (Uncut ver.)", "Fool in Love"],
    ["Third Person (UNCUT)", "Third Person"],
    ["UNSEEN (TV Ver.)", "UNSEEN"],
    ["The Next Prince Hidden Cut .Ver", "The Next Prince"],
    ["A Perfect Match (BL)", "A Perfect Match"],
    ["Fight for My Way (PH)", "Fight for My Way"],
    ["Crash Course in Romance (Thai Version)", "Crash Course in Romance"],
    ["Ghosting (P1+P2)", "Ghosting"],
    ["Had I Not Seen the Sun - Parts 2", "Had I Not Seen the Sun"],
  ])("strips edition labels: %s", (raw, expected) => {
    expect(titles(raw)[0]).toBe(expected);
  });

  it("strips the year and keeps it", () => {
    const parsed = parseCatalogTitle("Make It Right 2026 (Uncut Version)", "series");
    expect(parsed.variants.map((v) => v.title)).toEqual([
      "Make It Right 2026",
      "Make It Right",
    ]);
    expect(parsed.year).toBe(2026);
    expect(parseCatalogTitle("Siping (2026)", "movie").variants).toEqual([
      { title: "Siping", weak: false },
    ]);
  });

  it("drops a season subtitle", () => {
    const parsed = parseCatalogTitle(
      "When It Rains, It Pours Season 2: Mellow Rain",
      "series",
    );
    expect(parsed.variants[0]!.title).toBe("When It Rains, It Pours");
    expect(parsed.season).toBe(2);
  });

  it("treats a trailing number as a season only for series", () => {
    expect(parseCatalogTitle("The Face Men Thailand 4", "series").season).toBe(4);
    const movie = parseCatalogTitle("Hibla 2 (2026)", "movie");
    expect(movie.season).toBeUndefined();
    expect(movie.variants[0]!.title).toBe("Hibla 2");
  });

  it("splits bilingual titles", () => {
    expect(titles("Life in Smokey Blue - Smoke Blue no Ame Nochi Hare")).toEqual([
      "Life in Smokey Blue - Smoke Blue no Ame Nochi Hare",
      "Life in Smokey Blue",
      "Smoke Blue no Ame Nochi Hare",
    ]);
  });

  it("marks the subtitle-less variant as weak", () => {
    const variants = parseCatalogTitle("Jan Dara: Final Capture", "movie").variants;
    expect(variants.at(-1)).toEqual({ title: "Jan Dara", weak: true });
  });
});

describe("titleSimilarity", () => {
  it("is order sensitive", () => {
    expect(titleSimilarity("Tune In", "In Tune")).toBeLessThan(90);
  });
  it("ignores punctuation and case", () => {
    expect(titleSimilarity("Who's The Boss", "Who's The Boss?")).toBe(100);
    expect(titleSimilarity("Lovex3", "LOVEx3")).toBe(100);
  });
});

describe("isCandidateAllowed", () => {
  const strong = { title: "x", weak: false };
  const weak = { title: "x", weak: true };

  it("allows +-1 year, rejects more", () => {
    const parsed = { year: 2026 };
    expect(isCandidateAllowed({ year: 2025 }, parsed, strong, "tv")).toBe(true);
    expect(isCandidateAllowed({ year: 2002 }, parsed, strong, "tv")).toBe(false);
  });

  it("skips the year check for later seasons", () => {
    const parsed = { year: 2026, season: 2 };
    expect(isCandidateAllowed({ year: 2020 }, parsed, strong, "tv")).toBe(true);
  });

  it("requires an exact year for weak variants", () => {
    expect(isCandidateAllowed({ year: 2001 }, {}, weak, "movie")).toBe(false);
    expect(isCandidateAllowed({ year: 2026 }, { year: 2026 }, weak, "movie")).toBe(true);
    expect(isCandidateAllowed({ year: 2025 }, { year: 2026 }, weak, "movie")).toBe(false);
  });

  it("filters series by origin country", () => {
    expect(
      isCandidateAllowed({ originCountry: ["US"] }, {}, strong, "tv", "Korean"),
    ).toBe(false);
    expect(
      isCandidateAllowed({ originCountry: ["KR"] }, {}, strong, "tv", "Korean"),
    ).toBe(true);
  });

  it("filters movies by original language", () => {
    // "Operation Seduction" (Thai catalog) must not match a French film
    expect(
      isCandidateAllowed({ originalLanguage: "fr" }, {}, strong, "movie", "Thai"),
    ).toBe(false);
    expect(
      isCandidateAllowed({ originalLanguage: "th" }, {}, strong, "movie", "Thai"),
    ).toBe(true);
  });

  it("rejects candidates without country data for known catalogs", () => {
    // "Summer Fever (2026)" (Korean) must not match an English show with no data
    expect(isCandidateAllowed({}, {}, strong, "tv", "Korean")).toBe(false);
    expect(
      isCandidateAllowed({ originalLanguage: "ko" }, {}, strong, "tv", "Korean"),
    ).toBe(true);
  });

  it("rejects candidates without a year when we know ours", () => {
    expect(isCandidateAllowed({}, { year: 2026 }, strong, "tv")).toBe(false);
  });

  it("does not filter by country for unknown catalogs", () => {
    expect(
      isCandidateAllowed({ originCountry: ["US"] }, {}, strong, "tv", "Popular"),
    ).toBe(true);
  });
});
