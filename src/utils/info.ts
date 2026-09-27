import { execFileSync } from "node:child_process";
import { EStream } from "../db/schema/stream.js";
import { axiosGet } from "./axios.js";
import { handleError, ProbeInfoError } from "./error.js";
import { Logger } from "./logger.js";

const logger = new Logger("INFO");

export interface StreamInfo {
  size?: number;
  hours?: number;
  minutes?: number;
  resolution?: Resolution;
}

export interface Resolution {
  width: number;
  height: number;
}
export interface ProbeStream extends Resolution {
  bit_rate: number;
}

interface ProbeInfo {
  streams: ProbeStream[];
  format: {
    duration: number;
    size: number;
    bit_rate: number;
  };
}
export type Quality = "2160p" | "1080pHD" | "1080p" | "720p" | "480p";

export async function probeStreamInfo(
  url: string,
): Promise<StreamInfo | undefined> {
  let info: StreamInfo | undefined = { size: 0 };
  try {
    const uri = new URL(url);
    const isM3u8 = uri.pathname.endsWith(".m3u8");
    const isMp4 = uri.pathname.endsWith(".mp4");
    if (isM3u8) {
      info = await probeM3u8(url);
    } else if (isMp4) {
      info = await probeMp4(url);
    } else {
      info = await probeMp4(url); // default work for both
    }
  } catch (error) {
    handleError(error, logger, `Fail to probe stream info | ${url}`);
  }
  return info;
}

async function probeMp4(url: string): Promise<StreamInfo> {
  logger.log(`GET mp4 info | ${url}`);
  const data = await getProbeInfo(url);
  if (!data) return { size: 0 };
  const hours = getHours(data.format.duration);
  const minutes = getMinutes(data.format.duration);
  const resolution: Resolution = {
    width: data.streams[0]?.width!,
    height: data.streams[0]?.height!,
  };
  let GB = data.format.size;
  const info: StreamInfo = {
    hours: hours,
    minutes: minutes,
    resolution: resolution,
  };
  if (GB > 0) info.size = GB;
  return info;
}

function getHours(durationSeconds: number) {
  return Math.floor(durationSeconds / 60 / 60);
}

function getMinutes(durationSeconds: number) {
  return Math.floor((durationSeconds / 60) % 60);
}

async function probeM3u8(url: string): Promise<StreamInfo | undefined> {
  logger.log(`GET m3u8 | ${url}`);
  const data = await axiosGet<string>(url);
  if (!data) return undefined;
  const lines = data.split("\n");

  let totalDuration = 0;
  let totalSizeInBytes = 0;
  let firstSegmentUrl: string | undefined;
  lines.forEach((line: string) => {
    // Get Duration
    let currentDuration;
    if (line.startsWith("#EXTINF:")) {
      currentDuration = parseFloat(line.split(":")[1]?.replace(",", "") || "");
      totalDuration += currentDuration;
    }

    if (!firstSegmentUrl && !line.startsWith("#")) {
      if (line.startsWith("http")) {
        firstSegmentUrl = line;
      } else if (line.startsWith("//")) {
        firstSegmentUrl = `https:${line}`;
      } else {
        firstSegmentUrl = new URL(line, url).toString();
      }
    }

    // Get Size from Byte Range (Format: length@offset)
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      const length = parseInt(line.split(":")[1]?.split("@")[0] || "");
      totalSizeInBytes += length;
    }
  });
  let gb = totalSizeInBytes / (1024 * 1024 * 1024);
  let probeResult;
  logger.debug(`First segment ${firstSegmentUrl}`);
  try {
    if (firstSegmentUrl && isValidSegmentUrl(firstSegmentUrl)) {
      probeResult = await getProbeInfo(firstSegmentUrl);
    } else {
      probeResult = await getProbeInfo(url);
    }
  } catch (error) {
    handleError(error, logger, `Fail to probe stream info | ${url}`);
  }
  if (probeResult?.format.duration && totalDuration == 0) {
    totalDuration = probeResult?.format.duration;
  }

  const hours = getHours(totalDuration);
  const minutes = getMinutes(totalDuration);
  if (!probeResult) {
    return {
      size: gb,
      hours: hours,
      minutes: minutes,
    };
  }
  if (gb === 0 && !Number.isNaN(probeResult.format.size)) {
    gb = probeResult.format.size;
  }
  const resolution: Resolution = {
    height: probeResult.streams[0]?.height!,
    width: probeResult.streams[0]?.width!,
  };
  logger.log(
    `${url} | ${hours} hours ${minutes} minutes, ${gb.toFixed(2)} GB, ${resolution.width} x ${resolution.height}`,
  );
  const info: StreamInfo = {
    hours: hours,
    minutes: minutes,
    resolution: resolution,
  };
  if (gb > 0) info.size = gb;
  return info;
}

function isValidSegmentUrl(url: string) {
  const segmentUrl = new URL(url);
  const pathname = segmentUrl.pathname.toLowerCase();
  switch (true) {
    case pathname.endsWith("ts"):
    case pathname.endsWith("png"):
      return true;
    default:
      return false;
  }
}

export function getFfprobeArgs(url: string): string[] {
  return [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "format=duration,size",
    "-show_entries",
    "stream=width,height,bit_rate",
    "-of",
    "json",
    "-allowed_segment_extensions",
    "ALL",
    "-extension_picky",
    "0",
    url,
  ];
}

export function getProbeInfo(url: string): ProbeInfo | null {
  try {
    const output = execFileSync("ffprobe", getFfprobeArgs(url), {
      timeout: 10000,
      stdio: ["ignore", "pipe", "ignore"],
      shell: false,
    }).toString();
    const data: ProbeInfo = JSON.parse(output);
    const size = (data.streams[0]?.bit_rate! * data.format.duration) / 8;
    data.format.size = size / (1024 * 1024 * 1024);
    return data;
  } catch {
    throw new ProbeInfoError("FFprobe failed");
  }
}

export function toQuality(resolution: Resolution) {
  const width = resolution.width;
  const height = resolution.height;
  if (width >= 3840 || height >= 2160) return "4K";
  if (width >= 1920 || height >= 800) return "1080p";
  if (width >= 1280 || height >= 534) return "720p";
  if (width >= 854 || height >= 480) return "480p";
  return "SD";
}

// 1080p -> 1980x1080, 720p -> 1280x720, 480p -> 854x480
export function toResolution(quality: Quality): Resolution {
  switch (quality) {
    case "2160p":
      return { width: 3840, height: 2160 };
    case "1080pHD":
    case "1080p":
      return { width: 1980, height: 1080 };
    case "720p":
      return { width: 1280, height: 720 };
    case "480p":
      return { width: 854, height: 480 };
    default:
      return { width: 854, height: 480 };
  }
}

export function parseInfo(stream: EStream) {
  let info: StreamInfo = {};
  if (stream.size) info.size = parseFloat(stream.size);
  if (stream.duration) {
    info.hours = getHours(parseInt(stream.duration));
    info.minutes = getMinutes(parseInt(stream.duration));
  }
  if (stream.resolution) {
    const width = stream.resolution.split("x")[0];
    const height = stream.resolution.split("x")[1];
    if (width && height) {
      info.resolution = {
        width: parseInt(width),
        height: parseInt(height),
      };
    }
  }
  return info;
}
