import OpenAI from "openai";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const RSS_SOURCES = [
  {
    name: "MarkTechPost",
    type: "news",
    url: "https://www.marktechpost.com/feed/",
  },
  {
    name: "arXiv cs.AI",
    type: "paper",
    url: "https://rss.arxiv.org/rss/cs.AI",
  },
  {
    name: "arXiv cs.CL",
    type: "paper",
    url: "https://rss.arxiv.org/rss/cs.CL",
  },
  {
    name: "arXiv cs.LG",
    type: "paper",
    url: "https://rss.arxiv.org/rss/cs.LG",
  },
  {
    name: "OpenAI News",
    type: "official",
    url: "https://openai.com/news/rss.xml",
  },
  {
    name: "Google DeepMind",
    type: "official",
    url: "https://deepmind.google/blog/rss.xml",
  },
  {
    name: "Hugging Face Blog",
    type: "official",
    url: "https://huggingface.co/blog/feed.xml",
  },
  {
    name: "MIT News AI",
    type: "research",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
  },
];

const GITHUB_REPOS = [
  {
    owner: "Hannibal046",
    repo: "Awesome-LLM",
    label: "Awesome-LLM",
    category: "github",
  },
  {
    owner: "KylinC",
    repo: "Awesome-Awesome-LLM",
    label: "Awesome-Awesome-LLM",
    category: "github",
  },
  {
    owner: "Shubhamsaboo",
    repo: "awesome-llm-apps",
    label: "awesome-llm-apps",
    category: "github",
  },
  {
    owner: "huggingface",
    repo: "transformers",
    label: "transformers",
    category: "github",
  },
];

function decodeXmlEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripHtml(text = "") {
  return decodeXmlEntities(text).replace(/<[^>]*>/g, " ");
}

function cleanSummary(text = "") {
  if (!text) return "Sem resumo disponível.";

  let plain = stripHtml(text)
    .replace(/\s+/g, " ")
    .trim();

  plain = plain
    .replace(/arXiv:\d+\.\d+v\d+/gi, "")
    .replace(/Announce Type:\s*\w+/gi, "")
    .replace(/Abstract:\s*/gi, "")
    .replace(/^by\s+.+?\s+-\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return "Sem resumo disponível.";

  return plain.length > 140
    ? `${plain.slice(0, 137).trim()}...`
    : plain;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function makeId(...parts) {
  return parts
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9-_:.]/g, "")
    .slice(0, 180);
}

function extractTag(block, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = block.match(regex);
  return match ? decodeXmlEntities(match[1].trim()) : "";
}

function extractAllItems(xml = "") {
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  if (itemMatches.length > 0) {
    return itemMatches.map((raw, index) => ({
      id: extractTag(raw, "guid") || extractTag(raw, "link") || `rss-item-${index}`,
      title: extractTag(raw, "title"),
      link: extractTag(raw, "link"),
      summary:
        extractTag(raw, "description") ||
        extractTag(raw, "content:encoded") ||
        extractTag(raw, "summary"),
      publishedAt: extractTag(raw, "pubDate") || extractTag(raw, "dc:date"),
    }));
  }

  const entryMatches = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0]);
  return entryMatches.map((raw, index) => {
    const linkMatch = raw.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
    return {
      id:
        extractTag(raw, "id") ||
        (linkMatch ? linkMatch[1] : "") ||
        `atom-entry-${index}`,
      title: extractTag(raw, "title"),
      link: linkMatch ? decodeXmlEntities(linkMatch[1]) : "",
      summary:
        extractTag(raw, "summary") ||
        extractTag(raw, "content") ||
        extractTag(raw, "description"),
      publishedAt:
        extractTag(raw, "updated") ||
        extractTag(raw, "published") ||
        extractTag(raw, "pubDate"),
    };
  });
}

async function translateTitleRaw(title) {
  if (!title || !openai) return title;

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "system",
          content:
            "Traduza títulos de notícias e artigos técnicos de IA para português do Brasil. " +
            "Mantenha siglas e termos técnicos quando fizer sentido, como LLM, benchmark, dataset, transformer, agent, API, GitHub. " +
            "Responda apenas com a tradução final, sem aspas, sem explicações.",
        },
        {
          role: "user",
          content: title,
        },
      ],
      temperature: 0,
      max_output_tokens: 80,
    });

    const translated = response.output_text?.trim();
    return translated || title;
  } catch {
    return title;
  }
}

const getCachedTranslation = unstable_cache(
  async (title) => translateTitleRaw(title),
  ["feed-title-translation-v1"],
  { revalidate: 60 * 60 * 24 * 30 } // 30 dias
);

async function translateTitle(title = "") {
  if (!title) return "";
  try {
    return await getCachedTranslation(title);
  } catch {
    return title;
  }
}

async function fetchRssSource(source, failedSources) {
  try {
    const response = await fetch(source.url, {
      next: { revalidate: 60 * 30 },
      headers: {
        "User-Agent": "ai-feed-app/1.0",
        Accept: "application/rss+xml, application/atom+xml, text/xml, application/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      failedSources.push(source.name);
      return [];
    }

    const xml = await response.text();
    const rawItems = extractAllItems(xml);

    const items = await Promise.all(
      rawItems.slice(0, 12).map(async (entry, index) => {
        const title = entry.title || "Sem título";

        return {
          id: makeId(source.name, entry.id || entry.link || index),
          title,
          translatedTitle: await translateTitle(title),
          summary: cleanSummary(entry.summary || ""),
          url: entry.link || "",
          source: source.name,
          type: source.type,
          publishedAt: normalizeDate(entry.publishedAt),
        };
      })
    );

    return items.filter((item) => item.url);
  } catch {
    failedSources.push(source.name);
    return [];
  }
}

async function fetchGithubRepo(repo, failedSources) {
  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-feed-app/1.0",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
      next: { revalidate: 60 * 30 },
    });

    if (!response.ok) {
      failedSources.push(`GitHub: ${repo.label}`);
      return [];
    }

    const data = await response.json();

    const title = `${repo.label} no GitHub`;
    const rawSummary = [
      data.description || "Repositório sem descrição.",
      typeof data.stargazers_count === "number" ? `⭐ ${data.stargazers_count}` : "",
      typeof data.forks_count === "number" ? `🍴 ${data.forks_count}` : "",
      data.language ? `Linguagem: ${data.language}` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    return [
      {
        id: makeId("github", repo.owner, repo.repo),
        title,
        translatedTitle: title,
        summary: cleanSummary(rawSummary),
        url: data.html_url,
        source: "GitHub",
        type: repo.category || "github",
        publishedAt: normalizeDate(data.updated_at || data.pushed_at || data.created_at),
      },
    ];
  } catch {
    failedSources.push(`GitHub: ${repo.label}`);
    return [];
  }
}

function sortItems(items = []) {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.publishedAt).getTime();
    const dateB = new Date(b.publishedAt).getTime();
    return dateB - dateA;
  });
}

export async function GET() {
  const failedSources = [];

  try {
    const rssResults = await Promise.all(
      RSS_SOURCES.map((source) => fetchRssSource(source, failedSources))
    );

    const githubResults = await Promise.all(
      GITHUB_REPOS.map((repo) => fetchGithubRepo(repo, failedSources))
    );

    const items = sortItems([...rssResults.flat(), ...githubResults.flat()]).slice(0, 60);

    return Response.json({
      ok: true,
      items,
      failedSources,
      meta: {
        total: items.length,
        generatedAt: new Date().toISOString(),
        translation: openai ? "openai+cache" : "fallback-original-title",
      },
    });
  } catch {
    return Response.json(
      {
        ok: false,
        items: [],
        failedSources,
        error: "Falha ao montar o feed.",
      },
      { status: 500 }
    );
  }
}