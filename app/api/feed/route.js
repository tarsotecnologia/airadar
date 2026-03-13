import { githubRepos, rssSources } from '@/lib/sources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function decodeHtml(value = '') {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'i'))
  return match ? decodeHtml(match[1]) : ''
}

function extractItems(xml) {
  const itemMatches = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0])
  if (itemMatches.length) {
    return itemMatches.map((item) => ({
      title: extractTag(item, 'title'),
      link: extractTag(item, 'link'),
      summary: extractTag(item, 'description'),
      publishedAt: parseDate(extractTag(item, 'pubDate') || extractTag(item, 'dc:date'))
    }))
  }

  const entryMatches = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((m) => m[0])
  return entryMatches.map((entry) => {
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?/i)
    return {
      title: extractTag(entry, 'title'),
      link: linkMatch ? decodeHtml(linkMatch[1]) : '',
      summary: extractTag(entry, 'summary') || extractTag(entry, 'content'),
      publishedAt: parseDate(extractTag(entry, 'updated') || extractTag(entry, 'published'))
    }
  })
}

async function fetchRssFeed(source) {
  const response = await fetch(source.url, {
    headers: {
      'User-Agent': 'Radar-IA/1.0'
    },
    next: { revalidate: 1800 }
  })

  if (!response.ok) {
    throw new Error(`Falha ao buscar ${source.name}`)
  }

  const xml = await response.text()
  const items = extractItems(xml)
    .filter((item) => item.title && item.link)
    .slice(0, 12)
    .map((item, index) => ({
      id: `${source.id}-${index}-${item.link}`,
      title: item.title,
      url: item.link,
      summary: item.summary,
      publishedAt: item.publishedAt,
      source: source.name,
      kind: source.kind,
      type: 'rss'
    }))

  return items
}

async function fetchGithubRepo(repoDef) {
  const response = await fetch(`https://api.github.com/repos/${repoDef.repo}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Radar-IA/1.0'
    },
    next: { revalidate: 1800 }
  })

  if (!response.ok) {
    throw new Error(`Falha ao buscar ${repoDef.repo}`)
  }

  const repo = await response.json()

  let latestActivity = null

  const releasesResponse = await fetch(`https://api.github.com/repos/${repoDef.repo}/releases?per_page=1`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Radar-IA/1.0'
    },
    next: { revalidate: 1800 }
  })

  if (releasesResponse.ok) {
    const releases = await releasesResponse.json()
    if (Array.isArray(releases) && releases.length > 0) {
      const release = releases[0]
      latestActivity = {
        title: release.name || release.tag_name || `Release em ${repoDef.name}`,
        url: release.html_url,
        summary: release.body ? decodeHtml(release.body).slice(0, 240) : repoDef.description,
        publishedAt: parseDate(release.published_at || release.created_at),
        activityType: 'release'
      }
    }
  }

  if (!latestActivity) {
    const commitsResponse = await fetch(`https://api.github.com/repos/${repoDef.repo}/commits?per_page=1`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Radar-IA/1.0'
      },
      next: { revalidate: 1800 }
    })

    if (commitsResponse.ok) {
      const commits = await commitsResponse.json()
      if (Array.isArray(commits) && commits.length > 0) {
        const commit = commits[0]
        latestActivity = {
          title: commit.commit?.message?.split('\n')[0] || `Atualização em ${repoDef.name}`,
          url: commit.html_url,
          summary: repoDef.description,
          publishedAt: parseDate(commit.commit?.author?.date),
          activityType: 'commit'
        }
      }
    }
  }

  return {
    id: `github-${repoDef.id}`,
    title: latestActivity?.title || repo.full_name,
    url: latestActivity?.url || repo.html_url,
    summary: latestActivity?.summary || repo.description || repoDef.description,
    publishedAt: latestActivity?.publishedAt || parseDate(repo.updated_at),
    source: repo.full_name,
    kind: 'repositório GitHub',
    stars: repo.stargazers_count,
    repoUrl: repo.html_url,
    activityType: latestActivity?.activityType || 'repo',
    type: 'github'
  }
}

function normalize(items) {
  return items
    .filter(Boolean)
    .sort((a, b) => {
      const ad = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
      const bd = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
      return bd - ad
    })
}

export async function GET() {
  const results = await Promise.allSettled([
    ...rssSources.map(fetchRssFeed),
    ...githubRepos.map(fetchGithubRepo)
  ])

  const feed = []
  const errors = []

  results.forEach((result) => {
    if (result.status === 'fulfilled') {
      if (Array.isArray(result.value)) {
        feed.push(...result.value)
      } else {
        feed.push(result.value)
      }
    } else {
      errors.push(result.reason?.message || 'Erro desconhecido')
    }
  })

  return Response.json(
    {
      updatedAt: new Date().toISOString(),
      sources: rssSources,
      githubRepos,
      errors,
      items: normalize(feed).slice(0, 80)
    },
    {
      headers: {
        'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600'
      }
    }
  )
}
