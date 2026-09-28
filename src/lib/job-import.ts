/** Shared helpers for importing jobs from URLs, ATS boards, and chat bots. */

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 45_000);
}

/** Prefer JSON-LD JobPosting blobs when present (Greenhouse, Lever, many careers pages). */
export function extractJsonLdJobText(html: string): string | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const chunks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        walkJsonLd(node, chunks);
      }
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  if (!chunks.length) return null;
  return chunks.join("\n\n").slice(0, 45_000);
}

function walkJsonLd(node: unknown, out: string[]) {
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const type = o["@type"];
  const types = Array.isArray(type) ? type : type ? [type] : [];
  if (types.some((t) => String(t).toLowerCase() === "jobposting")) {
    out.push(JSON.stringify(o, null, 2));
  }
  if (Array.isArray(o["@graph"])) {
    for (const child of o["@graph"]) walkJsonLd(child, out);
  }
}

export async function fetchPageHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SmartMailSenderBot/1.0; +https://smart-mail-sender.local)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`Could not fetch URL (${res.status})`);
    const ctype = res.headers.get("content-type") ?? "";
    if (!/html|xml|text|json/i.test(ctype) && ctype) {
      throw new Error(`Unsupported content type: ${ctype}`);
    }
    const html = await res.text();
    if (html.length > 2_000_000) throw new Error("Page too large to import");
    return { html, finalUrl: res.url || url };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("Fetch timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchUrlAsJobText(url: string): Promise<{ text: string; finalUrl: string }> {
  const { html, finalUrl } = await fetchPageHtml(url);
  const jsonLd = extractJsonLdJobText(html);
  const plain = htmlToText(html);
  const text = [jsonLd ? `STRUCTURED JOB DATA (JSON-LD):\n${jsonLd}` : "", plain ? `PAGE TEXT:\n${plain}` : ""]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 45_000);
  if (!text.trim()) throw new Error("No readable text found on that page");
  return { text, finalUrl };
}

export type RssItem = { title: string; link: string; description: string };

export function parseRssOrAtom(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks.slice(0, 40)) {
    const title = pickTag(block, "title");
    const link =
      pickTag(block, "link") ||
      (block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ?? "") ||
      pickTag(block, "guid");
    const description =
      pickTag(block, "description") ||
      pickTag(block, "summary") ||
      pickTag(block, "content") ||
      pickCdata(block, "content:encoded") ||
      "";
    if (!title && !description && !link) continue;
    items.push({
      title: decodeXml(title).slice(0, 200),
      link: decodeXml(link).slice(0, 500),
      description: htmlToText(decodeXml(description)).slice(0, 8_000),
    });
  }
  return items;
}

function pickTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim() ?? "";
}

function pickCdata(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim() ?? "";
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
};

export async function fetchGreenhouseJobs(boardToken: string): Promise<GreenhouseJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Greenhouse error ${res.status}`);
  const j = (await res.json()) as { jobs?: GreenhouseJob[] };
  return j.jobs ?? [];
}

export type LeverJob = {
  id: string;
  text: string;
  hostedUrl: string;
  categories?: { location?: string; commitment?: string };
  descriptionPlain?: string;
  description?: string;
  lists?: Array<{ text?: string; content?: string }>;
};

export async function fetchLeverJobs(site: string): Promise<LeverJob[]> {
  const url = `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Lever error ${res.status}`);
  const j = (await res.json()) as LeverJob[];
  return Array.isArray(j) ? j : [];
}

export function greenhouseToParseText(job: GreenhouseJob): string {
  return [
    `Title: ${job.title}`,
    job.location?.name ? `Location: ${job.location.name}` : "",
    `Apply URL: ${job.absolute_url}`,
    job.content ? `Description HTML:\n${htmlToText(job.content)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function leverToParseText(job: LeverJob): string {
  const lists = (job.lists ?? [])
    .map((l) => `${l.text ?? ""}\n${htmlToText(l.content ?? "")}`)
    .join("\n");
  return [
    `Title: ${job.text}`,
    job.categories?.location ? `Location: ${job.categories.location}` : "",
    job.categories?.commitment ? `Employment: ${job.categories.commitment}` : "",
    `Apply URL: ${job.hostedUrl}`,
    job.descriptionPlain || htmlToText(job.description ?? ""),
    lists,
  ]
    .filter(Boolean)
    .join("\n");
}
