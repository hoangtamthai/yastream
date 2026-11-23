import { describe, expect, it } from "vitest";
import { catalogMetaId } from "./catalog-id.js";

describe("catalogMetaId", () => {
  const native = "kisskh:14139";

  it("keeps the provider id without a TMDB match", () => {
    expect(catalogMetaId(native, null, { tmdbId: true })).toBe(native);
  });

  it("prefers the IMDb id whatever the setting", () => {
    const detail = { id: "123", imdbId: "tt1234567" };
    expect(catalogMetaId(native, detail, { tmdbId: false })).toBe("tt1234567");
    expect(catalogMetaId(native, detail, { tmdbId: true })).toBe("tt1234567");
  });

  it("uses tmdb:<id> for TMDB-only matches when enabled", () => {
    expect(catalogMetaId(native, { id: "311722" }, { tmdbId: true })).toBe(
      "tmdb:311722",
    );
  });

  it("keeps the provider id for TMDB-only matches when disabled", () => {
    expect(catalogMetaId(native, { id: "311722" }, { tmdbId: false })).toBe(
      native,
    );
  });
});
