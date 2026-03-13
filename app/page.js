"use client";

import { useEffect, useMemo, useState } from "react";

const FILTERS = [
  { label: "Tudo", value: "all" },
  { label: "Notícias", value: "news" },
  { label: "Papers", value: "paper" },
  { label: "Oficiais", value: "official" },
  { label: "Pesquisa", value: "research" },
  { label: "GitHub", value: "github" },
];

function formatDate(dateString) {
  if (!dateString) return "Sem data";

  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateString));
  } catch {
    return "Sem data";
  }
}

export default function Page() {
  const [items, setItems] = useState([]);
  const [failedSources, setFailedSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [generatedAt, setGeneratedAt] = useState("");

  async function loadFeed() {
    try {
      setLoading(true);

      const response = await fetch("/api/feed", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar feed.");
      }

      setItems(Array.isArray(data.items) ? data.items : []);
      setFailedSources(Array.isArray(data.failedSources) ? data.failedSources : []);
      setGeneratedAt(data?.meta?.generatedAt || "");
    } catch (error) {
      console.error(error);
      setItems([]);
      setFailedSources(["Falha ao carregar o feed"]);
      setGeneratedAt("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFeed();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesFilter =
        activeFilter === "all" ? true : item.type === activeFilter;

      const haystack = [
        item.title,
        item.translatedTitle,
        item.summary,
        item.source,
        item.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = normalizedQuery
        ? haystack.includes(normalizedQuery)
        : true;

      return matchesFilter && matchesQuery;
    });
  }, [items, query, activeFilter]);

  const stats = useMemo(() => {
    const papers = items.filter((item) => item.type === "paper").length;
    const news = items.filter((item) => item.type === "news").length;
    const github = items.filter((item) => item.type === "github").length;

    return {
      total: items.length,
      papers,
      news,
      github,
    };
  }, [items]);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Radar IA</span>
          <h1>Feed de IA</h1>
          <p>
            Acompanhe LLMs, papers, fontes oficiais e repositórios do GitHub em
            um painel leve, direto e sem barroquismo visual desnecessário.
          </p>
        </div>

        <div className="hero-actions">
          <button className="primary" onClick={loadFeed} type="button">
            {loading ? "Atualizando..." : "Atualizar agora"}
          </button>

          <a
            className="ghost"
            href="/manifest.webmanifest"
            target="_blank"
            rel="noreferrer"
          >
            Manifesto PWA
          </a>
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <span>Total</span>
          <strong>{stats.total}</strong>
        </article>

        <article className="stat-card">
          <span>Papers</span>
          <strong>{stats.papers}</strong>
        </article>

        <article className="stat-card">
          <span>Notícias</span>
          <strong>{stats.news}</strong>
        </article>

        <article className="stat-card">
          <span>GitHub</span>
          <strong>{stats.github}</strong>
        </article>
      </section>

      <section className="toolbar">
        <div className="filters">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={`chip ${activeFilter === filter.value ? "active" : ""}`}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div>
          <input
            className="search"
            type="text"
            placeholder="Buscar por título, fonte ou resumo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      {failedSources.length > 0 && (
        <div className="warning-box">
          Algumas fontes falharam nesta rodada: {failedSources.join(", ")}
        </div>
      )}

      {loading ? (
        <div className="empty-state">Carregando o feed...</div>
      ) : filteredItems.length === 0 ? (
        <div className="empty-state">
          Nada encontrado com os filtros atuais. O feed ficou exigente.
        </div>
      ) : (
        <section className="feed-grid">
          {filteredItems.map((item) => (
            <article key={item.id} className="feed-card">
              <div className="card-top">
                <span className="badge">{item.source}</span>
                <span className="muted">{formatDate(item.publishedAt)}</span>
              </div>

              <div>
                <h3 title={item.translatedTitle || item.title}>
                  {item.translatedTitle || item.title}
                </h3>
              </div>

              <p className="summary clamp-2">{item.summary}</p>

              <div className="card-meta">
                <div>
                  <span>Categoria</span>
                  <strong>{item.type}</strong>
                </div>
              </div>

              <div className="card-actions">
                <a href={item.url} target="_blank" rel="noreferrer">
                  Abrir fonte
                </a>
              </div>
            </article>
          ))}
        </section>
      )}

      <footer className="footer">
        <span>
          {generatedAt
            ? `Última atualização: ${formatDate(generatedAt)}`
            : "Sem atualização registrada"}
        </span>
        <span>{filteredItems.length} itens visíveis</span>
      </footer>
    </main>
  );
}