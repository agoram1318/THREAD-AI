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
  const [selectedSourceId, setSelectedSourceId] = useState(DEFAULT_RSS_SOURCES[0]?.id ?? '');
  const [manageSourceId, setManageSourceId] = useState(DEFAULT_RSS_SOURCES[0]?.id ?? '');
  const [showAddSourceForm, setShowAddSourceForm] = useState(false);
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

  useEffect(() => {
    if (savedSources.length === 0) {
      setSelectedSourceId('');
      setManageSourceId('');
      return;
    }

    if (!savedSources.some((source) => source.id === selectedSourceId)) {
      setSelectedSourceId(savedSources[0].id);
    }

    if (!savedSources.some((source) => source.id === manageSourceId)) {
      setManageSourceId(savedSources[0].id);
    }
  }, [savedSources, selectedSourceId, manageSourceId]);

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

  const clearAllSelectedItems = () => {
    setSelectedItemKeys([]);
  };

  const getSourceById = (sourceId: string) => savedSources.find((source) => source.id === sourceId);

  const getArticleSourceLabel = (link: string) => {
    try {
      return new URL(link).hostname.replace(/^www\./, '');
    } catch {
      return '출처 없음';
    }
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

  const collectByUrl = async (nextUrl: string) => {
    const targetUrl = nextUrl.trim();
    if (!targetUrl) {
      setError('RSS URL을 입력해주세요.');
      return;
    }

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
        body: JSON.stringify({ url: targetUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? '알 수 없는 오류가 발생했습니다.');
      }

      setItems(data.items ?? []);
      setUrl(targetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollectSelectedSource = async () => {
    const source = getSourceById(selectedSourceId);
    if (!source) {
      setSourceSaveError('사용할 RSS 소스를 선택해주세요.');
      return;
    }

    setSourceSaveError('');
    setSourceSaveMessage(`${source.name} 소스로 수집을 시작합니다.`);
    await collectByUrl(source.url);
  };

  const handleDeleteManagedSource = () => {
    if (!manageSourceId) {
      setSourceSaveError('삭제할 RSS 소스를 선택해주세요.');
      return;
    }
    handleDeleteSavedSource(manageSourceId);
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
    await collectByUrl(url);
  };

  const currentStageLabel = draft || draftLoading || draftError
    ? '4단계 진행 중'
    : selectedPreset || selectedItemKeys.length > 0 || recommendedArticles.length > 0
      ? '3단계 진행 중'
      : items.length > 0
        ? '2단계 진행 중'
        : '1단계 진행 중';

  const selectedSource = getSourceById(selectedSourceId);

  return (
    <main className="min-h-screen bg-slate-50 py-8">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 px-4 md:px-8">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">THREAD-AI</h1>
              <p className="text-sm text-slate-500">
                RSS에서 좋은 기사를 고르고, Threads 초안을 빠르게 생성하세요.
              </p>
            </div>
            <span className="inline-flex w-fit items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              {currentStageLabel}
            </span>
          </div>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">1단계: RSS 소스 선택</h2>
            <p className="mt-1 text-sm text-slate-500">저장된 RSS 소스를 고르거나 URL을 직접 입력해 수집하세요.</p>
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <select
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
              >
                <option value="">저장된 RSS 소스 선택</option>
                {savedSources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name} · {source.category}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCollectSelectedSource}
                disabled={!selectedSourceId || loading}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? '수집 중...' : '이 소스로 수집'}
              </button>
            </div>
            {selectedSource && (
              <p className="text-xs text-slate-500">
                선택한 소스: {selectedSource.name} · {selectedSource.description}
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowAddSourceForm((prev) => !prev)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {showAddSourceForm ? '새 RSS 소스 입력 닫기' : '새 RSS 소스 추가'}
            </button>

            {showAddSourceForm && (
              <form onSubmit={handleSaveRssSource} className="space-y-2 rounded-xl bg-slate-50 p-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    placeholder="소스 이름"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none ring-blue-500 focus:ring"
                  />
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="RSS URL"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none ring-blue-500 focus:ring"
                  />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    value={sourceDescription}
                    onChange={(e) => setSourceDescription(e.target.value)}
                    placeholder="간단한 설명"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none ring-blue-500 focus:ring"
                  />
                  <input
                    type="text"
                    value={sourceCategory}
                    onChange={(e) => setSourceCategory(e.target.value)}
                    placeholder="카테고리"
                    className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none ring-blue-500 focus:ring"
                  />
                </div>
                <button
                  type="submit"
                  className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  저장하기
                </button>
              </form>
            )}

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-medium text-slate-500">저장함 관리</p>
              <div className="flex flex-col gap-2 md:flex-row">
                <select
                  value={manageSourceId}
                  onChange={(e) => setManageSourceId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
                >
                  <option value="">삭제할 소스 선택</option>
                  {savedSources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleDeleteManagedSource}
                  disabled={!manageSourceId}
                  className="h-10 rounded-xl border border-red-200 bg-red-50 px-3 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                >
                  삭제
                </button>
              </div>
            </div>

            {sourceSaveError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                {sourceSaveError}
              </div>
            )}
            {!sourceSaveError && sourceSaveMessage && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-2 text-sm text-green-700">
                {sourceSaveMessage}
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-slate-200 p-4">
            <label htmlFor="rssUrl" className="block text-sm font-medium text-slate-700">
              RSS URL 직접 입력
            </label>
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                id="rssUrl"
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none ring-blue-500 focus:ring"
              />
              <button
                type="submit"
                disabled={loading}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? '수집 중...' : '기사 수집'}
              </button>
            </div>
          </form>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">2단계: 수집된 기사</h2>
              <p className="mt-1 text-sm text-slate-500">체크박스로 쓰레드에 사용할 기사를 고르세요.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
              총 {items.length}개
            </span>
          </div>

          {items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              먼저 RSS를 수집해주세요.
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((item, idx) => {
                const itemKey = getItemKey(item, idx);
                const isSelected = selectedItemKeys.includes(itemKey);
                return (
                  <li
                    key={itemKey}
                    className={`rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-blue-200 bg-blue-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(itemKey)}
                        aria-label={`${item.title || '(제목 없음)'} 선택`}
                        className="mt-1 h-4 w-4 cursor-pointer accent-blue-600"
                      />
                      <div className="min-w-0 space-y-1">
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-semibold text-slate-900 hover:underline"
                        >
                          {item.title || '(제목 없음)'}
                        </a>
                        <p className="text-xs text-slate-500">
                          {getArticleSourceLabel(item.link)} · {item.pubDate || '날짜 없음'}
                        </p>
                        <p
                          className="text-xs text-slate-600"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.contentSnippet || '요약 없음'}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">3단계: AI 추천 및 기사 선택</h2>
            <p className="mt-1 text-sm text-slate-500">프리셋을 고르고 추천을 받아 선택 기사를 빠르게 완성하세요.</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700">
                선택한 기사
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {selectedItemKeys.length}개
                </span>
              </p>
              <button
                type="button"
                onClick={clearAllSelectedItems}
                disabled={selectedItemKeys.length === 0}
                className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                전체 해제
              </button>
            </div>
            {selectedItemKeys.length === 0 ? (
              <p className="text-sm text-slate-500">쓰레드에 사용할 기사를 선택해주세요.</p>
            ) : (
              <ul className="space-y-1">
                {selectedItemKeys.map((itemKey) => {
                  const selectedItem = items.find((item, idx) => getItemKey(item, idx) === itemKey);
                  if (!selectedItem) return null;
                  return (
                    <li key={itemKey} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
                      <span className="truncate text-sm text-slate-700">{selectedItem.title || '(제목 없음)'}</span>
                      <button
                        type="button"
                        onClick={() => removeSelectedItem(itemKey)}
                        className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        제거
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <label className="block text-sm font-medium text-slate-700">프리셋 선택</label>
            <select
              value={selectedPreset}
              onChange={(e) => {
                setSelectedPreset(e.target.value);
                setRecommendedArticles([]);
                setRecommendError('');
              }}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
            >
              <option value="">프리셋 선택</option>
              {PRESET_OPTIONS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRecommendArticles}
                disabled={!canRecommendArticles || recommendLoading}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                AI 추천 받기
              </button>
              <button
                type="button"
                onClick={handleAutoSelectTopRecommended}
                disabled={recommendedArticles.length === 0}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                상위 3개 자동 선택
              </button>
            </div>

            {recommendLoading && <p className="text-sm text-slate-600">추천 분석 중...</p>}
            {!recommendLoading && recommendError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {recommendError}
              </div>
            )}
            {!recommendLoading && recommendedArticles.length === 0 && !recommendError && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                프리셋을 선택하고 AI 추천을 받아보세요.
              </div>
            )}
            {!recommendLoading && recommendedArticles.length > 0 && (
              <ul className="space-y-2">
                {recommendedArticles.map((recommended) => (
                  <li key={`${recommended.url}-${recommended.title}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{recommended.title}</p>
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {recommended.score}점
                        </span>
                        <p className="text-xs text-slate-500">{recommended.reason}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddRecommendedArticle(recommended)}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        선택에 추가
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">4단계: 쓰레드 초안 생성</h2>
            <p className="mt-1 text-sm text-slate-500">초안을 생성하고 필요하면 바로 다듬어 사용하세요.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={!canGenerateDraft || draftLoading}
              className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {draftLoading ? '생성 중...' : '쓰레드 초안 생성'}
            </button>
            {!canGenerateDraft && (
              <p className="text-sm text-slate-500">
                {selectedItems.length === 0 ? '쓰레드에 사용할 기사를 선택해주세요.' : '프리셋을 선택해주세요.'}
              </p>
            )}
          </div>

          {!draft && !draftLoading && !draftError && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              기사를 선택한 뒤 초안을 생성해보세요.
            </div>
          )}

          {(draft || draftError || draftLoading) && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {draftLoading && <p className="text-sm text-slate-600">생성 중...</p>}
              {!draftLoading && draftError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {draftError}
                </div>
              )}
              {!draftLoading && draft && (
                <>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <pre className="min-h-56 whitespace-pre-wrap text-sm leading-7 text-slate-700">{draft}</pre>
                  </div>

                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                    <h4 className="text-sm font-semibold text-slate-800">초안 다듬기</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('shorter')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        더 짧게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('easier')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        더 쉽게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('hookier')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        더 후킹 있게
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('neutral')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        더 중립적으로
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('threads_tone')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Threads 말투로 다듬기
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRewriteDraft('three_versions')}
                        disabled={rewriteLoading}
                        className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        다른 버전 3개 생성
                      </button>
                    </div>
                    {rewriteLoading && <p className="text-sm text-slate-600">초안 다듬는 중...</p>}
                    {!rewriteLoading && rewriteError && (
                      <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                        {rewriteError}
                      </div>
                    )}
                    {!rewriteLoading && rewriteVersions.length > 0 && (
                      <div className="grid gap-2 md:grid-cols-3">
                        {rewriteVersions.map((version, idx) => (
                          <article key={`rewrite-version-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="mb-2 text-xs font-semibold text-slate-500">버전 {idx + 1}</p>
                            <pre className="mb-2 whitespace-pre-wrap text-xs leading-6 text-slate-700">{version}</pre>
                            <button
                              type="button"
                              onClick={() => handleUseRewriteVersion(version)}
                              className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
                      className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      복사하기
                    </button>
                    {copySuccess && <span className="text-sm text-green-700">복사되었습니다</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
