// URL validation utilities for exact hostname matching
// Prevents substring attacks and ensures secure URL validation

/**
 * Checks if a URL's hostname exactly matches the given host
 * Prevents substring attacks like evil.example.com matching example.com
 */
export function matchesHost(url: string, host: string): boolean {
  try {
    let hostname = url;
    if (url.startsWith("http")) {
      const parsed = new URL(url);
      hostname = parsed.hostname;
    } else {
      host = host.replace(/\.[^.]+$/, "");
    }
    return hostname.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * Checks if a URL's hostname matches any of the given hosts
 * Prevents substring attacks
 */
export function matchesAnyHost(url: string, hosts: string[]): boolean {
  try {
    let hostname = url;
    let isUrl = url.startsWith("http");
    if (isUrl) {
      const parsed = new URL(url);
      hostname = parsed.hostname;
    }
    return hosts.some(
      (h) =>
        hostname.toLowerCase() ===
        (isUrl ? h.toLowerCase() : h.replace(/\.[^.]+$/, "").toLowerCase()),
    );
  } catch {
    return false;
  }
}
