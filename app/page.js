'use client'

import { useEffect, useMemo, useState } from 'react'

const FILTERS = [
  { id: 'all', label: 'Tudo' },
  { id: 'rss', label: 'Fontes' },
  { id: 'github', label: 'GitHub' },
  { id: 'papers', label: 'Papers' },
  { id: 'official', label: 'Oficiais' }
]

function formatDate(iso) {
  if (!iso) return 'sem data'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(iso))
}

function relativeDate(iso) {
  if (!iso) return 'sem data'
  const now = Date.now()
  const diff = now - new Date(iso).getTime()
  const minutes = Math.round(diff / 60000)
  if (minutes < 60) return `${minutes} min atrás`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h atrás`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d atrás`
  const months = Math.round(days / 30)
  return `${months} mês(es) atrás`
}

function matchFilter(item, filter) {
  if (filter === 'all') return true
  if (filter === 'rss') return item.type === 'rss'
  if (filter === 'github') return item.type === 'github'
  if (filter === 'papers') return item.kind === 'papers'
  if (filter === 'official') return item.kind === 'fonte oficial'
  return true
}

export default function HomePage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')

  async function loadFeed() {
    try {
      setLoading(true)
      setError('')
      const response = await fetch('/api/feed', { cache: 'no-store' })
      if (!response.ok) throw new Error('Não consegui atualizar o feed.')
      const json = await response.json()
      setData(json)
    } catch (err) {
      setError(err.message || 'Erro inesperado.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFeed()
  }, [])

  const items = useMemo(() => {
    const list = data?.items || []
    const term = query.trim().toLowerCase()
    return list.filter((item) => {
      const matchesFilter = matchFilter(item, filter)
      const haystack = `${item.title} ${item.summary} ${item.source}`.toLowerCase()
      const matchesQuery = term ? haystack.includes(term) : true
      return matchesFilter && matchesQuery
    })
  }, [data, filter, query])

  const stats = useMemo(() => {
    const list = data?.items || []
    return {
      total: list.length,
      papers: list.filter((item) => item.kind === 'papers').length,
      github: list.filter((item) => item.type === 'github').length,
      official: list.filter((item) => item.kind === 'fonte oficial').length
    }
  }, [data])

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Radar IA</span>
          <h1>Feed de IA</h1>
          <p>
            Acompanhe LLMs, papers, fontes oficiais e repositórios do GitHub em um painel simples e leve.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary" onClick={loadFeed}>Atualizar agora</button>
          <a className="ghost" href="/manifest.webmanifest" target="_blank" rel="noreferrer">
            Manifesto PWA
          </a>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card"><strong>{stats.total}</strong><span>itens no radar</span></article>
        <article className="stat-card"><strong>{stats.papers}</strong><span>papers</span></article>
        <article className="stat-card"><strong>{stats.github}</strong><span>sinais GitHub</span></article>
        <article className="stat-card"><strong>{stats.official}</strong><span>fontes oficiais</span></article>
      </section>

      <section className="toolbar">
        <div className="filters">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={filter === item.id ? 'chip active' : 'chip'}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por LLM, benchmark, repo, laboratório..."
        />
      </section>

      <section className="sources-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Fontes monitoradas</h2>
            <span>{data?.sources?.length || 0}</span>
          </div>
          <ul className="mini-list">
            {(data?.sources || []).map((source) => (
              <li key={source.id}>
                <strong>{source.name}</strong>
                <span>{source.kind}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <div className="panel-head">
            <h2>Repos no radar</h2>
            <span>{data?.githubRepos?.length || 0}</span>
          </div>
          <ul className="mini-list">
            {(data?.githubRepos || []).map((repo) => (
              <li key={repo.id}>
                <strong>{repo.name}</strong>
                <span>{repo.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error ? <div className="empty-state error">{error}</div> : null}
      {loading ? <div className="empty-state">Carregando o radar…</div> : null}
      {!loading && !error && data?.errors?.length ? (
        <div className="warning-box">
          Algumas fontes falharam nesta rodada: {data.errors.join(' · ')}
        </div>
      ) : null}

      <section className="feed-grid">
        {items.map((item) => (
          <article className="feed-card" key={item.id}>
            <div className="card-top">
              <span className="badge">{item.kind}</span>
              <span className="muted">{relativeDate(item.publishedAt)}</span>
            </div>
            <h3 title={item.translatedTitle || item.title}>
              {item.translatedTitle || item.title}
            </h3>
            <p className="summary clamp-2">
            {item.summary}
          </p>
            <div className="card-meta">
              <div>
                <strong>{item.source}</strong>
                <span>{formatDate(item.publishedAt)}</span>
              </div>
              {item.type === 'github' && item.stars ? (
                <div>
                  <strong>{Intl.NumberFormat('pt-BR').format(item.stars)}</strong>
                  <span>stars</span>
                </div>
              ) : null}
            </div>
            <div className="card-actions">
              <a href={item.url} target="_blank" rel="noreferrer">Abrir item</a>
              {item.repoUrl ? <a href={item.repoUrl} target="_blank" rel="noreferrer">Ver repositório</a> : null}
            </div>
          </article>
        ))}
      </section>

      {!loading && !error && items.length === 0 ? (
        <div className="empty-state">Nada bateu com esse filtro. Seu radar está seletivo hoje.</div>
      ) : null}

      <footer className="footer">
        <span>Atualizado em {formatDate(data?.updatedAt)}</span>
        <span>Pronto para Vercel e fácil de evoluir para PWA completo.</span>
      </footer>
    </main>
  )
}
