import { describe, expect, it } from "vitest";
import { isPlayableMirror, sortEpisodes } from "./asiantv.js";

describe("Asiantv helpers", () => {
  it("sorts numeric episodes ascending", () => {
    const episodes = [
      { id: 3, name: "10" },
      { id: 1, name: "02" },
      { id: 2, name: "01" },
    ];
    expect(sortEpisodes(episodes).map((episode) => episode.name)).toEqual([
      "01",
      "02",
      "10",
    ]);
  });

  it("sorts dated episodes ascending", () => {
    const episodes = [
      { id: 2, name: "2026-11-05" },
      { id: 1, name: "2026-11-04" },
    ];
    expect(sortEpisodes(episodes).map((episode) => episode.name)).toEqual([
      "2026-11-04",
      "2026-11-05",
    ]);
  });

  it("reverses unknown episode ordering", () => {
    const episodes = [
      { id: 2, name: "B" },
      { id: 1, name: "A" },
    ];
    expect(sortEpisodes(episodes).map((episode) => episode.name)).toEqual([
      "A",
      "B",
    ]);
  });

  it("accepts only playable mirrors", () => {
    expect(
      isPlayableMirror({
        name: "CDN #2",
        videourl: "https://cdn.example/hdplay.m3u8",
        videotype: 2,
      }),
    ).toBe(true);
    expect(
      isPlayableMirror({
        name: "CDN",
        videourl: "https://cdn.example/drive/a.html",
        videotype: 1,
      }),
    ).toBe(false);
  });
});
