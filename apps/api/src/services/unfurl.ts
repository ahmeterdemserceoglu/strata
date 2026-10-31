import dns from 'node:dns/promises';

export interface EmbedData {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

/**
 * Checks if an IPv4 or IPv6 address belongs to private/reserved ranges
 */
export function isPrivateIp(ip: string): boolean {
  // IPv4 Loopback
  if (ip.startsWith('127.')) return true;
  // Link-Local (Cloud metadata e.g. AWS 169.254.169.254)
  if (ip.startsWith('169.254.')) return true;
  // RFC 1918 Private ranges
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;

  // IPv6 Loopback & Link-Local
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  if (ip.toLowerCase().startsWith('fe80:')) return true;
  if (ip.toLowerCase().startsWith('fc00:') || ip.toLowerCase().startsWith('fd00:')) return true;

  return false;
}

/**
 * Validates target URL against SSRF attacks before fetching
 */
export async function validateSafeUrl(targetUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return false;
    }

    // Resolve DNS and check resolved IP
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}
