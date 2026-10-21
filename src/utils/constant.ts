import { ENV } from "./env.js";

export const API = "api";
export const STREAMS = `streams-resource`;
export const SUBTITLES = `subtitles-resource`;
export const RATE_LIMIT_DESCRIPTION = `Rate limit\nRetry after a few seconds`;

export const IDRAMA_HOST = "www.idramahd.com";
export const IDRAMA_ORIGIN = `https://${IDRAMA_HOST}`;
export const ONETOUCHTV_ORIGIN = "https://onetouchtv.xyz";
export const TICKCOUNTER_HOST = "tickcounter.com";
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
export const MKVDRAMA_HOST = new URL(MKVDRAMA_ORIGIN).hostname;
export const VIKING_HOST = "vikingfile.com";
export const VIKING_ORIGIN = `https://${VIKING_HOST}`;
export const PIXELDRAIN_HOST = "pixeldrain.com";
export const PIXELDRAIN_ORIGIN = `https://${PIXELDRAIN_HOST}`;
export const MEGA_HOST = "mega.nz";
export const MEGA_ORIGIN = `https://${MEGA_HOST}`;