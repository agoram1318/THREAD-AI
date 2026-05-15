'use client';

import { FormEvent, useEffect, useState } from 'react';

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
};

type RecommendedArticle = {
  title: string;
  url: string;
  score: number;
  reason: string;
};

type SavedRssSource = {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
};

type RewriteMode =
  | 'shorter'
  | 'easier'
  | 'hookier'
  | 'neutral'
  | 'threads_tone'
  | 'three_versions';

const PRESET_OPTIONS = [
  '미국 주식 리포트',
  '한국 정치 이슈 정리',
  '경제 뉴스 쉽게 설명',
  '5줄 핵심 요약',
  '질문 유도형 쓰레드',
];

const RSS_SOURCES_STORAGE_KEY = 'thread-ai-rss-sources-v1';

const DEFAULT_RSS_SOURCES: SavedRssSource[] = [
  {
    id: 'default-bbc-world',
    name: 'BBC World',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    description: '국제 뉴스와 글로벌 이슈 수집용',
    category: '국제뉴스',
  },
  {
    id: 'default-marketwatch-top-stories',
    name: 'MarketWatch Top Stories',
    url: 'https://www.marketwatch.com/rss/topstories',
    description: '미국 주식과 경제 주요 뉴스 수집용',
    category: '미국주식',
  },
  {
    id: 'default-nytimes-technology',
    name: 'NYTimes Technology',
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml',
    description: '기술, AI, 빅테크 이슈 수집용',
    category: '기술',
  },
  {
    id: 'default-the-verge',
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    description: 'IT, 플랫폼, 제품, AI 트렌드 수집용',
    category: '기술',
  },
  {
    id: 'default-fed-press-releases',
    name: 'Federal Reserve Press Releases',
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    description: '연준 보도자료와 금리 정책 이슈 수집용',
    category: '미국경제',
  },
];

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [savedSources, setSavedSources] = useState<SavedRssSource[]>(DEFAULT_RSS_SOURCES);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [sourceCategory, setSourceCategory] = useState('');
  const [sourceSaveError, setSourceSaveError] = useState('');
  const [sourceSaveMessage, setSourceSaveMessage] = useState('');
  const [sourceStorageReady, setSourceStorageReady] = useState(false);
  const [items, setItems] = useState<RssItem[]>([]);
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState('');
  const [recommendedArticles, setRecommendedArticles] = useState<RecommendedArticle[]>([]);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteError, setRewriteError] = useState('');
  const [rewriteVersions, setRewriteVersions] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const getItemKey = (item: RssItem, idx: number) => `${item.link}-${idx}`;
  // Selected items are derived from keys to keep UI state minimal.
  const selectedItems = selectedItemKeys
    .map((itemKey) => items.find((item, idx) => getItemKey(item, idx) === itemKey))
    .filter((item): item is RssItem => Boolean(item));
  const canGenerateDraft = selectedItems.length > 0 && Boolean(selectedPreset);
  const canRecommendArticles = items.length > 0 && Boolean(selectedPreset);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RSS_SOURCES_STORAGE_KEY);
      if (!raw) {
        setSourceStorageReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setSourceStorageReady(true);
        return;
      }

      const normalized = parsed
        .map((item, idx) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const candidate = item as {
            id?: unknown;
            name?: unknown;
            url?: unknown;
            description?: unknown;
            category?: unknown;
          };

          const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
          const rssUrl = typeof candidate.url === 'string' ? candidate.url.trim() : '';
          const description =
            typeof candidate.description === 'string' ? candidate.description.trim() : '';
          const category = typeof candidate.category === 'string' ? candidate.category.trim() : '';
          const id =
            typeof candidate.id === 'string' && candidate.id.trim()
              ? candidate.id.trim()
              : `saved-${idx}-${Date.now()}`;

          if (!name || !rssUrl) {
            return null;
          }

          return { id, name, url: rssUrl, description, category };
        })
        .filter((item): item is SavedRssSource => Boolean(item));

      if (normalized.length > 0) {
        setSavedSources(normalized);
      }
    } catch {
      // Ignore localStorage parse errors and keep defaults.
    } finally {
      setSourceStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!sourceStorageReady) {
      return;
    }

    try {
      localStorage.setItem(RSS_SOURCES_STORAGE_KEY, JSON.stringify(savedSources));
    } catch {
      // Ignore storage write errors.
    }
  }, [savedSources, sourceStorageReady]);

  const toggleItemSelection = (itemKey: string) => {
    setSelectedItemKeys((prev) =>
      prev.includes(itemKey) ? prev.filter((key) => key !== itemKey) : [...prev, itemKey]
    );
  };

  const addItemSelection = (itemKey: string) => {
    setSelectedItemKeys((prev) => (prev.includes(itemKey) ? prev : [...prev, itemKey]));
  };

  const removeSelectedItem = (itemKey: string) => {
    setSelectedItemKeys((prev) => prev.filter((key) => key !== itemKey));
  };

  const handleSaveRssSource = (e: FormEvent) => {
    e.preventDefault();
    setSourceSaveError('');
    setSourceSaveMessage('');

    const nextName = sourceName.trim();
    const nextUrl = sourceUrl.trim();
    const nextDescription = sourceDescription.trim();
    const nextCategory = sourceCategory.trim();

    if (!nextName || !nextUrl || !nextDescription || !nextCategory) {
      setSourceSaveError('소스 이름, RSS URL, 설명, 카테고리를 모두 입력해주세요.');
      return;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(nextUrl);
    } catch {
      setSourceSaveError('유효한 RSS URL 형식이 아닙니다.');
      return;
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      setSourceSaveError('http 또는 https URL만 저장할 수 있습니다.');
      return;
    }

    const alreadyExists = savedSources.some(
      (source) => source.url.toLowerCase() === nextUrl.toLowerCase(),
    );
    if (alreadyExists) {
      setSourceSaveError('이미 저장된 RSS URL입니다.');
      return;
    }

    const newSource: SavedRssSource = {
      id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: nextName,
      url: nextUrl,
      description: nextDescription,
      category: nextCategory,
    };

    setSavedSources((prev) => [newSource, ...prev]);
    setSourceName('');
    setSourceUrl('');
    setSourceDescription('');
    setSourceCategory('');
    setSourceSaveMessage('RSS 소스를 저장했습니다.');
  };

  const handleUseSavedSource = (rssUrl: string) => {
    setUrl(rssUrl);
    setSourceSaveMessage('RSS 입력창에 URL을 반영했습니다.');
    setSourceSaveError('');
  };

  const handleDeleteSavedSource = (sourceId: string) => {
    setSavedSources((prev) => prev.filter((source) => source.id !== sourceId));
    setSourceSaveMessage('RSS 소스를 삭제했습니다.');
    setSourceSaveError('');
  };

  const findItemKeyByRecommendation = (recommended: RecommendedArticle) => {
    const indexByLink = items.findIndex((item) => item.link === recommended.url);
    if (indexByLink >= 0) {
      return getItemKey(items[indexByLink], indexByLink);
    }

    const indexByTitle = items.findIndex((item) => item.title === recommended.title);
    if (indexByTitle >= 0) {
      return getItemKey(items[indexByTitle], indexByTitle);
    }

    return null;
  };

  const handleRecommendArticles = async () => {
    if (!canRecommendArticles) {
      return;
    }

    setRecommendLoading(true);
    setRecommendError('');

    try {
      const res = await fetch('/api/recommend-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
          items: items.map((item) => ({
            title: item.title,
            link: item.link,
            contentSnippet: item.contentSnippet,
            pubDate: item.pubDate,
          })),
        }),
      });

      const data = (await res.json()) as {
        recommendations?: RecommendedArticle[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? `기사 추천에 실패했습니다. (status: ${res.status})`);
      }

      const nextRecommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
      if (nextRecommendations.length === 0) {
        throw new Error('추천 결과가 비어 있습니다. 다시 시도해주세요.');
      }

      setRecommendedArticles(nextRecommendations);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '추천 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setRecommendError(message);
      setRecommendedArticles([]);
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleAddRecommendedArticle = (recommended: RecommendedArticle) => {
    const itemKey = findItemKeyByRecommendation(recommended);
    if (!itemKey) {
      return;
    }

    addItemSelection(itemKey);
  };

  const handleAutoSelectTopRecommended = () => {
    const topRecommendations = [...recommendedArticles].sort((a, b) => b.score - a.score).slice(0, 3);
    for (const recommended of topRecommendations) {
      const itemKey = findItemKeyByRecommendation(recommended);
      if (itemKey) {
        addItemSelection(itemKey);
      }
    }
  };

  const handleGenerateDraft = async () => {
    if (!canGenerateDraft) {
      return;
    }

    setDraftLoading(true);
    setError('');
    setDraftError('');
    setDraft('');
    setRewriteError('');
    setRewriteVersions([]);
    setCopySuccess(false);

    try {
      const res = await fetch('/api/generate-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
          items: selectedItems.map((item) => ({
            title: item.title,
            link: item.link,
            contentSnippet: item.contentSnippet,
          })),
        }),
      });

      let data: { draft?: string; error?: string } | null = null;
      try {
        data = (await res.json()) as { draft?: string; error?: string };
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error(data?.error ?? `쓰레드 초안 생성에 실패했습니다. (status: ${res.status})`);
      }

      const nextDraft = data?.draft?.trim() ?? '';
      if (!nextDraft) {
        throw new Error('초안 생성 결과가 비어 있습니다. 다시 시도해주세요.');
      }

      setDraft(nextDraft);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '쓰레드 초안 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';

      setDraftError(message);
      setError(message);
    } finally {
      setDraftLoading(false);
    }
  };

  const handleRewriteDraft = async (mode: RewriteMode) => {
    if (!draft || !selectedPreset) {
      return;
    }

    setRewriteLoading(true);
    setRewriteError('');
    if (mode !== 'three_versions') {
      setRewriteVersions([]);
    }

    try {
      const res = await fetch('/api/rewrite-thread', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: selectedPreset,
          draft,
          mode,
        }),
      });

      const data = (await res.json()) as {
        draft?: string;
        versions?: string[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error ?? `초안 다듬기에 실패했습니다. (status: ${res.status})`);
      }

      if (mode === 'three_versions') {
        const nextVersions = Array.isArray(data.versions)
          ? data.versions.map((version) => version.trim()).filter(Boolean)
          : [];
        if (nextVersions.length === 0) {
          throw new Error('다른 버전 생성 결과가 비어 있습니다. 다시 시도해주세요.');
        }
        setRewriteVersions(nextVersions);
        return;
      }

      const nextDraft = data.draft?.trim() ?? '';
      if (!nextDraft) {
        throw new Error('다듬어진 초안이 비어 있습니다. 다시 시도해주세요.');
      }

      setDraft(nextDraft);
      setCopySuccess(false);
      setRewriteVersions([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '초안 다듬기 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      setRewriteError(message);
    } finally {
      setRewriteLoading(false);
    }
  };

  const handleUseRewriteVersion = (version: string) => {
    const nextDraft = version.trim();
    if (!nextDraft) {
      return;
    }

    setDraft(nextDraft);
    setCopySuccess(false);
    setRewriteVersions([]);
    setRewriteError('');
  };

  const handleCopyDraft = async () => {
    if (!draft) {
      return;
    }

    try {
      await navigator.clipboard.writeText(draft);
      setCopySuccess(true);
    } catch {
      setCopySuccess(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setItems([]);
    setSelectedItemKeys([]);
    setSelectedPreset('');
    setRecommendedArticles([]);
    setRecommendError('');
    setRecommendLoading(false);
    setDraft('');
    setDraftError('');
    setRewriteLoading(false);
    setRewriteError('');
    setRewriteVersions([]);
    setCopySuccess(false);
    setDraftLoading(false);

    try {
      const res = await fetch('/api/rss-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? '알 수 없는 오류가 발생했습니다.');
      }

      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-4 text-2xl font-bold">RSS 테스트 수집</h1>

      <section className="mb-6 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">RSS 소스 저장함</h2>

        <form onSubmit={handleSaveRssSource} className="space-y-2 rounded border p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="text"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="소스 이름 (예: BBC World)"
              className="rounded border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring"
            />
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="RSS URL"
              className="rounded border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring"
            />
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="text"
              value={sourceDescription}
              onChange={(e) => setSourceDescription(e.target.value)}
              placeholder="간단한 설명"
              className="rounded border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring"
            />
            <input
              type="text"
              value={sourceCategory}
              onChange={(e) => setSourceCategory(e.target.value)}
              placeholder="카테고리 (예: 기술)"
              className="rounded border px-3 py-2 text-sm outline-none ring-blue-500 focus:ring"
            />
          </div>
          <button
            type="submit"
            className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            RSS 소스 저장
          </button>
          {sourceSaveError && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {sourceSaveError}
            </div>
          )}
          {!sourceSaveError && sourceSaveMessage && (
            <div className="rounded border border-green-200 bg-green-50 p-2 text-sm text-green-700">
              {sourceSaveMessage}
            </div>
          )}
        </form>

        {savedSources.length === 0 ? (
          <p className="text-sm text-slate-500">저장된 RSS 소스가 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {savedSources.map((source) => (
              <li key={source.id} className="rounded border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-slate-800">{source.name}</p>
                    <p className="text-xs text-slate-500">카테고리: {source.category}</p>
                    <p className="text-sm text-slate-700">{source.description}</p>
                    <p className="truncate text-xs text-slate-500">{source.url}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleUseSavedSource(source.url)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      이 URL 사용하기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedSource(source.id)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={handleSubmit} className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
        <label htmlFor="rssUrl" className="mb-2 block text-sm font-medium text-slate-700">
          RSS URL
        </label>
        <div className="flex gap-2">
          <input
            id="rssUrl"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/feed.xml"
            className="flex-1 rounded border px-3 py-2 outline-none ring-blue-500 focus:ring"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {loading ? '수집 중...' : '테스트 수집'}
          </button>
        </div>
      </form>

      {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</div>}

      {items.length > 0 && (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              수집된 기사 ({items.length}) · 선택됨 {selectedItemKeys.length}개
            </h2>
            {items.map((item, idx) => {
              const itemKey = getItemKey(item, idx);
              const isSelected = selectedItemKeys.includes(itemKey);

              return (
                <article key={itemKey} className="rounded-lg border bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItemSelection(itemKey)}
                      aria-label={`${item.title || '(제목 없음)'} 선택`}
                      className="mt-1 h-5 w-5 cursor-pointer accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-lg font-semibold text-blue-700 hover:underline"
                      >
                        {item.title || '(제목 없음)'}
                      </a>
                      <p className="mt-1 text-sm text-slate-500">{item.pubDate || '날짜 없음'}</p>
                      <p className="mt-2 text-sm text-slate-700">{item.contentSnippet || '요약 없음'}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <section className="mt-8 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">선택된 기사 목록 ({selectedItemKeys.length})</h2>
            {selectedItemKeys.length === 0 ? (
              <p className="text-sm text-slate-500">선택된 기사가 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {selectedItemKeys.map((itemKey) => {
                  const selectedItem = items.find((item, idx) => getItemKey(item, idx) === itemKey);

                  if (!selectedItem) {
                    return null;
                  }

                  return (
                    <li key={itemKey} className="flex items-center justify-between gap-3 rounded border p-2">
                      <span className="truncate text-sm text-slate-700">{selectedItem.title || '(제목 없음)'}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedItem(itemKey)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        제거
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">글 생성 프리셋 선택</h2>
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                setRecommendedArticles([]);
                setRecommendError('');
              }}
              className="w-full rounded border px-3 py-2 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
            >
              <option value="">프리셋 선택</option>
              {PRESET_OPTIONS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            <p className="text-sm text-slate-600">
              선택된 프리셋: {selectedPreset || '프리셋을 선택해주세요'}
            </p>
          </section>

          <section className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">AI 기사 추천</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleRecommendArticles}
                disabled={!canRecommendArticles || recommendLoading}
                className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                AI가 좋은 기사 추천
              </button>
              {recommendedArticles.length > 0 && (
                <button
                  type="button"
                  onClick={handleAutoSelectTopRecommended}
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  상위 추천 기사 자동 선택
                </button>
              )}
            </div>

            {recommendLoading && <p className="text-sm text-slate-600">추천 분석 중...</p>}
            {!recommendLoading && !canRecommendArticles && (
              <p className="text-sm text-slate-500">
                {items.length === 0 ? '기사 목록이 있어야 추천할 수 있습니다.' : '프리셋을 선택해주세요.'}
              </p>
            )}
            {!recommendLoading && recommendError && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {recommendError}
              </div>
            )}
            {!recommendLoading && recommendedArticles.length > 0 && (
              <ul className="space-y-2">
                {recommendedArticles.map((recommended) => (
                  <li key={`${recommended.url}-${recommended.title}`} className="rounded border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <a
                          href={recommended.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-semibold text-blue-700 hover:underline"
                        >
                          {recommended.title}
                        </a>
                        <p className="text-xs text-slate-500">추천 점수: {recommended.score}점</p>
                        <p className="text-sm text-slate-700">{recommended.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddRecommendedArticle(recommended)}
                        className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        선택에 추가
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Threads 글 초안 생성</h2>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={!canGenerateDraft || draftLoading}
              className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-60"
            >
              {draftLoading ? '생성 중...' : '쓰레드 초안 생성'}
            </button>
            {!canGenerateDraft && (
              <p className="text-sm text-slate-500">
                {selectedItems.length === 0
                  ? '기사를 1개 이상 선택해주세요.'
                  : '프리셋을 선택해주세요.'}
              </p>
            )}
          </section>

          {(draft || draftError || draftLoading) && (
            <section className="mt-4 space-y-3 rounded-lg border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">생성된 쓰레드 초안</h2>
              {draftLoading && <p className="text-sm text-slate-600">생성 중...</p>}
              {!draftLoading && draftError && (
                <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {draftError}
                </div>
              )}
              {!draftLoading && draft && (
                <>
                  <pre className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-sm text-slate-700">
                    {draft}
                  </pre>
                  <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-3">
                    <h3 className="text-sm font-semibold text-slate-800">초안 다듬기</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('shorter')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        더 짧게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('easier')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        더 쉽게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('hookier')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        더 후킹 있게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('neutral')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        더 중립적으로
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('threads_tone')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        Threads 말투로 다듬기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('three_versions')}
                        disabled={rewriteLoading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        다른 버전 3개 생성
                      </button>
                    </div>
                    {rewriteLoading && <p className="text-sm text-slate-600">초안 다듬는 중...</p>}
                    {!rewriteLoading && rewriteError && (
                      <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                        {rewriteError}
                      </div>
                    )}
                    {!rewriteLoading && rewriteVersions.length > 0 && (
                      <div className="space-y-2">
                        {rewriteVersions.map((version, idx) => (
                          <article key={`rewrite-version-${idx}`} className="rounded border bg-white p-3">
                            <p className="mb-2 text-xs font-semibold text-slate-500">버전 {idx + 1}</p>
                            <pre className="whitespace-pre-wrap text-sm text-slate-700">{version}</pre>
                            <button
                              type="button"
                              onClick={() => handleUseRewriteVersion(version)}
                              className="mt-2 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              이 버전 사용
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCopyDraft}
                      className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      복사하기
                    </button>
                    {copySuccess && <span className="text-sm text-green-700">복사되었습니다</span>}
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
