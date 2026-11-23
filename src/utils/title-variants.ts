import { ratio } from "fuzzball";

/**
 * Helpers for the fallback TMDB lookup used by catalogs when the regular
 * title search finds nothing. Kept pure so the rules can be unit tested.
 */

export interface TitleVariant {
  title: string;
  /** Built by dropping a ": subtitle"; only trusted on an exact year match. */
  weak: boolean;
}

export interface ParsedTitle {
  variants: TitleVariant[];
  year?: number | undefined;
  season?: number | undefined;
}

const YEAR_RE = /\s*\(?((?:19|20)\d{2})\)?\s*$/;
// "(Uncut Version)", "[TV Ver.]", "~special edit version~", "(Director's Cut)", "(Short)"
const EDITION_BRACKET_RE =
  /\s*[([~][^)\]~]*?\b(?:uncut|ver\.?|version|edit|cut|shorts?|special)\b[^)\]~]*[)\]~]/gi;
// "(BL)", "(GL)", "(PH)", "(Thai Version)", "(Hong Kong)"
const LABEL_BRACKET_RE =
  /\s*[([]\s*(?:bl|gl|ph|thai|hong kong|korean|japanese|chinese)(?:\s+version)?\s*[)\]]/gi;
// trailing "Uncut Version", ": Uncut", "Hidden Cut .Ver", ": Shorts", "Special"
const EDITION_TAIL_RE =
  /\s*[:-]?\s*\b(?:uncut(?:\s+version|\s+ver\.?)?|hidden\s+cut\s*\.?\s*ver|special|shorts?)\s*$/i;
// "(S1 + S2)", "(P1+P2)", "- Parts 2"
const PARTS_RE =
  /\s*\((?:s\d+\s*\+\s*s\d+|p\d+\s*\+\s*p\d+)\)\s*$|\s*-\s*parts?\s*\d+\s*$/i;
// "Season 2", "- Season 10", "Season 2: Mellow Rain"
const SEASON_RE = /\s*[-:]?\s*season\s*(\d+)\s*(?::.*)?$/i;
// trailing season number without the word, e.g. "The Face Men Thailand 4"
const TRAILING_NUMBER_RE = /\s+(\d)$/;

export function normalizeTitle(str: string): string {
  return str
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Ordered similarity 0-100 (word order matters: "Tune In" != "In Tune"). */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  return ratio(na, nb, { full_process: false });
}

export function parseCatalogTitle(
  raw: string,
  type: "movie" | "series" | string,
): ParsedTitle {
  let title = raw.trim();
  let year: number | undefined;
  let season: number | undefined;

  let bareYear = false; // "Make It Right 2026" (year is part of the name)
  let previous: string | undefined;
  while (previous !== title) {
    previous = title;
    const yearMatch = year === undefined ? title.match(YEAR_RE) : null;
    if (yearMatch) {
      year = parseInt(yearMatch[1]!);
      bareYear = !yearMatch[0].includes("(");
      title = title.slice(0, yearMatch.index).trim();
    }
    title = title
      .replace(EDITION_BRACKET_RE, "")
      .replace(LABEL_BRACKET_RE, "")
      .replace(EDITION_TAIL_RE, "")
      .replace(PARTS_RE, "")
      .replace(/[\s:-]+$/, "")
      .trim();
  }

  const seasonMatch = title.match(SEASON_RE);
  if (seasonMatch) {
    season = parseInt(seasonMatch[1]!);
    title = title.slice(0, seasonMatch.index).replace(/[\s:-]+$/, "").trim();
  } else if (type === "series") {
    // Only series: for movies a trailing number is a sequel ("Hibla 2").
    const numberMatch = title.match(TRAILING_NUMBER_RE);
    if (numberMatch) {
      season = parseInt(numberMatch[1]!);
      title = title.slice(0, numberMatch.index).trim();
    }
  }

  const candidates: TitleVariant[] = [{ title, weak: false }];
  if (bareYear && year !== undefined) {
    candidates.unshift({ title: `${title} ${year}`, weak: false });
  }
  if (title.includes(" - ")) {
    // Bilingual titles: "Life in Smokey Blue - Smoke Blue no Ame Nochi Hare"
    for (const part of title.split(" - ")) {
      candidates.push({ title: part.trim(), weak: false });
    }
  }
  if (title.includes(":")) {
    candidates.push({ title: title.split(":")[0]!.trim(), weak: true });
  }

  const seen = new Set<string>();
  const variants = candidates.filter((variant) => {
    const key = normalizeTitle(variant.title);
    if (key.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { variants, year, season };
}

/** Catalog country name -> TMDB origin country and accepted original languages. */
export const CATALOG_COUNTRY: Record<
  string,
  { country: string; languages: string[] } | undefined
> = {
  Korean: { country: "KR", languages: ["ko"] },
  Chinese: { country: "CN", languages: ["zh", "cn"] },
  Japanese: { country: "JP", languages: ["ja"] },
  Hongkong: { country: "HK", languages: ["cn", "zh"] },
  Thai: { country: "TH", languages: ["th"] },
  Taiwanese: { country: "TW", languages: ["zh", "cn"] },
  Philippine: { country: "PH", languages: ["tl", "fil", "en"] },
  US: { country: "US", languages: ["en"] },
};

export interface TmdbCandidate {
  year?: number | undefined;
  originCountry?: string[] | undefined;
  originalLanguage?: string | undefined;
}

/** Hard filters a TMDB result must pass before its title is compared. */
export function isCandidateAllowed(
  candidate: TmdbCandidate,
  parsed: Pick<ParsedTitle, "year" | "season">,
  variant: TitleVariant,
  kind: "tv" | "movie",
  catalogCountry?: string | undefined,
): boolean {
  const { year, season } = parsed;
  // A "Season N" title carries that season's year, not the show's.
  const checkYear = year !== undefined && (season === undefined || season === 1);
  if (variant.weak) {
    if (!checkYear || candidate.year !== year) return false;
  } else if (checkYear && !candidate.year) {
    return false; // year known on our side but not on TMDB: too uncertain
  } else if (
    checkYear &&
    year !== undefined &&
    candidate.year &&
    Math.abs(candidate.year - year) > 1
  ) {
    return false;
  }
  const expected = catalogCountry ? CATALOG_COUNTRY[catalogCountry] : undefined;
  if (expected) {
    // Must positively match the catalog's country; missing data is rejected.
    const countryOk = !!candidate.originCountry?.includes(expected.country);
    const languageOk =
      !!candidate.originalLanguage &&
      expected.languages.includes(candidate.originalLanguage);
    if (kind === "tv" ? !(countryOk || languageOk) : !languageOk) return false;
  }
  return true;
}

export const MIN_TITLE_SIMILARITY = 90;
