import Parser from "rss-parser";

const parser = new Parser({
  timeout: 12000,
  headers: {
    "User-Agent": "ai-feed-app/1.0",
  },
});

const RSS_SOURCES = [
  {
    name: "MarkTechPost",
    type: "rss",
    url: "https://www.marktechpost.com/feed/",
    category: "news",
  },
  {
    name: "arXiv cs.AI",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.AI",
    category: "paper",
  },
  {
    name: "arXiv cs.CL",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.CL",
    category: "paper",
  },
  {
    name: "arXiv cs.LG",
    type: "rss",
    url: "https://rss.arxiv.org/rss/cs.LG",
    category: "paper",
  },
  {
    name: "OpenAI News",
    type: "rss",
    url: "https://openai.com/news/rss.xml",
    category: "official",
  },
  {
    name: "Google DeepMind",
    type: "rss",
    url: "https://deepmind.google/blog/rss.xml",
    category: "official",
  },
  {
    name: "Hugging Face Blog",
    type: "rss",
    url: "https://huggingface.co/blog/feed.xml",
    category: "official",
  },
  {
    name: "MIT News AI",
    type: "rss",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    category: "research",
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

function stripHtml(text = "") {
  return text.replace(/<[^>]*>/g, " ");
}

function cleanSummary(text = "") {
  if (!text) return "Sem resumo disponível.";

  let plain = stripHtml(text).replace(/\s+/g, " ").trim();

  plain = plain
    .replace(/arXiv:\d+\.\d+v\d+/gi, "")
    .replace(/Announce Type:\s*\w+/gi, "")
    .replace(/Abstract:\s*/gi, "")
    .replace(/^by\s+.+?\s+-\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!plain) return "Sem resumo disponível.";

  return plain.length > 140 ? `${plain.slice(0, 137).trim()}...` : plain;
}

function translateTitle(title = "") {
  const dictionary = [
    ["introducing", "apresentando"],
    ["introduces", "apresenta"],
    ["introduced", "apresentado"],
    ["launches", "lança"],
    ["launch", "lançamento"],
    ["releases", "libera"],
    ["released", "liberado"],
    ["release", "lançamento"],
    ["announces", "anuncia"],
    ["announced", "anunciado"],
    ["announcement", "anúncio"],
    ["new", "novo"],
    ["open-source", "código aberto"],
    ["open source", "código aberto"],
    ["state-of-the-art", "estado da arte"],
    ["model", "modelo"],
    ["models", "modelos"],
    ["paper", "artigo"],
    ["papers", "artigos"],
    ["research", "pesquisa"],
    ["benchmark", "benchmark"],
    ["benchmarks", "benchmarks"],
    ["agent", "agente"],
    ["agents", "agentes"],
    ["dataset", "dataset"],
    ["datasets", "datasets"],
    ["training", "treinamento"],
    ["reasoning", "raciocínio"],
    ["multimodal", "multimodal"],
    ["developer", "desenvolvedor"],
    ["developers", "desenvolvedores"],
    ["update", "atualização"],
    ["updates", "atualizações"],
    ["github", "GitHub"],
    ["ai", "IA"],
    ["llm", "LLM"],
  ];

  let translated = title;

  for (const [en, pt] of dictionary) {
    translated = translated.replace(new RegExp(`\\b${en}\\b`, "gi"), pt);
  }

  return translated;
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

async function fetchRssSource(source, failedSources) {
  let feed;

  try {
    feed = await parser.parseURL(source.url);
  } catch (error) {
    failedSources.push(source.name);
    return [];
  }

  const items = (feed.items || []).map((entry, index) => {
    const title = entry.title || "Sem título";
    const summary = cleanSummary(
      entry.summary ||
        entry.contentSnippet ||
        entry.content ||
        entry["content:encoded"] ||
        ""
    );

    return {
      id: makeId(source.name, entry.guid || entry.id || entry.link || index),
      title,
      translatedTitle: translateTitle(title),
      summary,
      url: entry.link || "",
      source: source.name,
      type: source.category || source.type || "rss",
      publishedAt: normalizeDate(entry.isoDate || entry.pubDate),
    };
  });

  return items.filter((item) => item.url);
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
      next: { revalidate: 1800 },
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
  } catch (error) {
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
      },
    });
  } catch (error) {
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