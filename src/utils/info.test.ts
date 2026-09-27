import { describe, expect, it, vi } from "vitest";

vi.mock("./axios.js", () => ({ axiosGet: vi.fn() }));
vi.mock("./error.js", () => ({
  handleError: vi.fn(),
  ProbeInfoError: class ProbeInfoError extends Error {},
}));

const { getFfprobeArgs,getProbeInfo } = await import("./info.js");

describe("getFfprobeArgs", () => {
  it("keeps a URL with shell metacharacters as one opaque argument", () => {
    const url =
      "https://hls08.cdnvideo11.shop/hls08/13610/Ep1.v434_index.m3u8";

    const args = getFfprobeArgs(url);
    console.log(args);
    const info = getProbeInfo(url);
    console.log(JSON.stringify(info));

    expect(args.at(-1)).toBe(url);
    expect(args.filter((arg) => arg === url)).toHaveLength(1);
    expect(args).toContain("-show_entries");
    expect(args.join(" ")).not.toContain(`"${url}"`);
  });
});
