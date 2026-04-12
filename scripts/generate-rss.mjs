import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SITE_ORIGIN = "https://online-affiliate.com";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(value) {
  const safe = String(value || "").replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${safe}]]>`;
}

function extractMeta(html, regex) {
  const match = html.match(regex);
  return (match && match[1] ? match[1] : "").trim();
}

function extractJsonLd(html) {
  const jsonText = extractMeta(html, /<script\s+type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i);
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function extractArticleDates(jsonLd) {
  const graph = jsonLd && Array.isArray(jsonLd["@graph"]) ? jsonLd["@graph"] : [];
  const article = graph.find((node) => node && (node["@type"] === "Article" || node["@type"] === "BlogPosting"));
  const datePublished = article && article.datePublished ? String(article.datePublished).trim() : "";
  const dateModified = article && article.dateModified ? String(article.dateModified).trim() : "";
  return { datePublished, dateModified };
}

async function loadPost(filePath) {
  const html = await readFile(filePath, "utf8");
  const title = extractMeta(html, /<title>([^<]+)<\/title>/i).replace(/\s+—\s+online-affiliate\s*$/i, "");
  const description = extractMeta(html, /<meta\s+name="description"\s+content="([^"]*)"/i);
  const canonical = extractMeta(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i);

  const jsonLd = extractJsonLd(html);
  const { datePublished, dateModified } = extractArticleDates(jsonLd);

  const published = datePublished || dateModified || "";
  const date = published ? new Date(published) : null;

  return {
    title,
    description,
    canonical,
    date,
  };
}

async function listBlogPosts(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  const posts = [];

  for (const slug of dirs) {
    const filePath = path.join(dir, slug, "index.html");
    try {
      const post = await loadPost(filePath);
      if (!post.canonical || !post.title) continue;
      posts.push(post);
    } catch {
      // ignore missing/unreadable posts
    }
  }

  posts.sort((a, b) => {
    const ta = a.date ? a.date.getTime() : 0;
    const tb = b.date ? b.date.getTime() : 0;
    return tb - ta;
  });

  return posts;
}

function buildRss({ feedUrl, channelUrl, channelTitle, channelDescription, language, items }) {
  const lastBuild = items.find((it) => it.date)?.date || new Date();
  const lastBuildDate = new Date(lastBuild).toUTCString();

  const itemsXml = items
    .map((it) => {
      const pubDate = it.date ? it.date.toUTCString() : lastBuildDate;
      const link = it.canonical;
      return `
    <item>
      <title>${escapeXml(it.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <description>${cdata(it.description)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channelTitle)}</title>
    <link>${escapeXml(channelUrl)}</link>
    <description>${cdata(channelDescription)}</description>
    <language>${escapeXml(language)}</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>
`;
}

async function main() {
  const frPosts = await listBlogPosts("blog");
  const enPosts = await listBlogPosts(path.join("en", "blog"));

  const frRss = buildRss({
    feedUrl: `${SITE_ORIGIN}/rss.xml`,
    channelUrl: `${SITE_ORIGIN}/blog/`,
    channelTitle: "online-affiliate — Blog",
    channelDescription: "Guides pratiques sur l’affiliation et le SEO : niche, contenu, tracking, optimisation.",
    language: "fr-FR",
    items: frPosts,
  });

  const enRss = buildRss({
    feedUrl: `${SITE_ORIGIN}/en/rss.xml`,
    channelUrl: `${SITE_ORIGIN}/en/blog/`,
    channelTitle: "online-affiliate — Blog",
    channelDescription: "Practical guides about affiliate SEO: niches, content, tracking, optimization.",
    language: "en-GB",
    items: enPosts,
  });

  await writeFile("rss.xml", frRss, "utf8");
  await mkdir("en", { recursive: true });
  await writeFile(path.join("en", "rss.xml"), enRss, "utf8");
}

await main();

