import { ENV } from "./env.js";

export const API = "api";
export const STREAMS = `streams-resource`;
export const SUBTITLES = `subtitles-resource`;
export const RATE_LIMIT_DESCRIPTION = `Rate limit\nRetry after a few seconds`;
export const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:156.0) Gecko/20100101 Firefox/156.0";

export const ONETOUCHTV_ORIGIN = "https://onetouchtv.xyz";
export const TICKCOUNTER_HOST = "tickcounter.com";

// Host/origin constants live here, not in the source modules: utils/axios.ts
// needs them, and importing the source graph from a leaf util is a cycle.
export const GOFILE_HOST = "gofile.io";
export const GOFILE_ORIGIN = `https://${GOFILE_HOST}`;
export const GOFILE_API_ORIGIN = `https://api.${GOFILE_HOST}`;
export const DECRYPTIT_HOST = "dcrypt.it";
export const DECRYPTIT_ORIGIN = `http://${DECRYPTIT_HOST}`;
export const FILECRYPT_HOST = "filecrypt.cc";
export const FILECRYPT_ORIGIN = `https://${FILECRYPT_HOST}`;
export const VIEWCRATE_HOST = "viewcrate.cc";
export const VIEWCRATE_ORIGIN = `https://${VIEWCRATE_HOST}`;
export const MKVDRAMA_ORIGIN = ENV.MKVDRAMA_URL;
export const VIKING_HOST = "vikingfile.com";
export const VIKING_ORIGIN = `https://${VIKING_HOST}`;
export const PIXELDRAIN_HOST = "pixeldrain.com";
export const PIXELDRAIN_ORIGIN = `https://${PIXELDRAIN_HOST}`;
export const MEGA_HOST = "mega.nz";
export const MEGA_ORIGIN = `https://${MEGA_HOST}`;