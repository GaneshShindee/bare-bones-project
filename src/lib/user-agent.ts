// Lightweight User-Agent parser for open-tracking events.
// No external dependency — Cloudflare Workers safe.

export type ParsedUA = {
  deviceType: "Mobile" | "Tablet" | "Desktop" | "Bot" | "Unknown";
  browser: string;
  os: string;
};

export function parseUserAgent(uaRaw: string | null | undefined): ParsedUA {
  const ua = (uaRaw ?? "").toString();
  if (!ua) return { deviceType: "Unknown", browser: "Unknown", os: "Unknown" };

  // Device
  let deviceType: ParsedUA["deviceType"] = "Desktop";
  if (/bot|crawler|spider|preview|proxy|fetch|monitor|scanner/i.test(ua)) deviceType = "Bot";
  else if (/iPad|Tablet/i.test(ua)) deviceType = "Tablet";
  else if (/Mobi|Android.*Mobile|iPhone|iPod/i.test(ua)) deviceType = "Mobile";

  // OS
  let os = "Unknown";
  if (/Windows NT 10/i.test(ua)) os = "Windows 10/11";
  else if (/Windows/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod|iOS/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser / mail client
  let browser = "Unknown";
  if (/GoogleImageProxy/i.test(ua)) browser = "Gmail (image proxy)";
  else if (/YahooMailProxy/i.test(ua)) browser = "Yahoo Mail";
  else if (/Outlook/i.test(ua)) browser = "Outlook";
  else if (/Thunderbird/i.test(ua)) browser = "Thunderbird";
  else if (/AppleMail|Mail\/\d/i.test(ua)) browser = "Apple Mail";
  else if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox/i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  // If Gmail proxy on mobile device, hint at Gmail app.
  if (browser === "Gmail (image proxy)" && deviceType === "Mobile") browser = "Gmail App";

  return { deviceType, browser, os };
}

export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}