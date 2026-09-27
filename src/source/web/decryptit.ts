import { axiosPost } from "../../utils/axios.js";
import { DecryptitError } from "../../utils/error.js";
import { Logger } from "../../utils/logger.js";

interface DecryptitResponse {
  success: {
    message: string;
    links: string[];
  };
}
const logger = new Logger("DECRYPTIT");

export const DECRYPTIT_HOST = "dcrypt.it";
export const DECRYPTIT_ORIGIN = `http://${DECRYPTIT_HOST}`;
export async function getUrlsFromDecryptit(dlcContent: string) {
  const data = `content=${encodeURIComponent(dlcContent)}`;
  const response = await axiosPost<DecryptitResponse>(
    `${DECRYPTIT_ORIGIN}/decrypt/paste`,
    data,
  );
  if (!response) throw new DecryptitError("No response");
  logger.log(`getUrlsFromDecryptit ${response.success.links.length}`);
  return response.success.links;
}
