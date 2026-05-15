'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  sourceName?: string;
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

type AutoWorkflowLog = {
  step: string;
  status: 'success' | 'error';
  message: string;
};

type SavedThreadDraft = {
  id: string;
  content: string;
  selectedPreset: string;
  createdAt: string;
  sourceArticles: Array<{ title: string; link: string; sourceName?: string }>;
  status: 'draft' | 'ready' | 'used';
};

type SavedDraftStatusFilter = 'all' | 'draft' | 'ready' | 'used';
type SavedDraftSortOption = 'latest' | 'oldest';

const PRESET_OPTIONS = [
  '미국 주식 리포트',
  '한국 정치 이슈 정리',
  '경제 뉴스 쉽게 설명',
  '5줄 핵심 요약',
  '질문 유도형 쓰레드',
];

const RSS_SOURCES_STORAGE_KEY = 'thread-ai-rss-sources-v1';
const THREAD_DRAFTS_STORAGE_KEY = 'thread-ai-saved-drafts-v1';
const THREAD_DRAFT_CHECKLIST_STORAGE_KEY = 'thread-ai-draft-checklist-v1';
const REVIEW_CHECKLIST_ITEMS = [
  '출처 링크 확인',
  '원문과 다른 사실 없는지 확인',
  '과장/낚시성 표현 없는지 확인',
  '투자 조언처럼 보이지 않는지 확인',
  '정치/사회 이슈는 사실과 해석이 구분됐는지 확인',
  '문장이 Threads에 맞게 짧고 읽기 쉬운지 확인',
  '복사 후 실제 업로드 여부 확인',
] as const;

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

const SOURCE_SET_CONFIGS = [
  {
    key: 'us_stock',
    label: '미국 주식 세트',
    keywords: ['미국주식', '미국경제', '경제', 'marketwatch', 'investing', 'federal reserve', 'sec'],
  },
  {
    key: 'tech_ai',
    label: '기술/AI 세트',
    keywords: ['기술', 'ai', 'technology', 'the verge', 'nytimes technology', 'ars technica'],
  },
  {
    key: 'global_news',
    label: '글로벌 뉴스 세트',
    keywords: ['국제', '글로벌', 'bbc', 'world'],
  },
  {
    key: 'korea_news',
    label: '한국 뉴스 세트',
    keywords: ['한국', '정치', '뉴스', '경향', '한겨레', '연합뉴스'],
  },
] as const;

const PRESET_SOURCE_RECOMMENDATIONS: Record<string, { message: string; keywords: string[] }> = {
  '미국 주식 리포트': {
    message: '미국 주식 리포트에는 미국 주식 세트를 추천합니다.',
    keywords: ['미국주식', '미국경제', '경제', 'marketwatch', 'investing', 'federal reserve', 'sec'],
  },
  '한국 정치 이슈 정리': {
    message: '한국 정치 이슈에는 한국 뉴스 세트를 추천합니다.',
    keywords: ['한국', '정치', '뉴스', '경향', '한겨레', '연합뉴스'],
  },
  '경제 뉴스 쉽게 설명': {
    message: '경제 뉴스에는 미국 주식/경제 세트를 추천합니다.',
    keywords: ['경제', '미국경제', '미국주식', 'marketwatch', 'investing', 'federal reserve'],
  },
  '5줄 핵심 요약': {
    message: '전체 뉴스 또는 글로벌 뉴스 세트를 추천합니다.',
    keywords: ['국제', '글로벌', 'bbc', 'world', '뉴스'],
  },
  '질문 유도형 쓰레드': {
    message: '글로벌 뉴스 또는 한국 뉴스 세트를 추천합니다.',
    keywords: ['국제', '글로벌', '한국', '정치', '뉴스', 'bbc', 'world'],
  },
};

export default function HomePage() {
  const draftSectionRef = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState('');
  const [savedSources, setSavedSources] = useState<SavedRssSource[]>(DEFAULT_RSS_SOURCES);
  const [selectedSourceId, setSelectedSourceId] = useState(DEFAULT_RSS_SOURCES[0]?.id ?? '');
  const [manageSourceId, setManageSourceId] = useState(DEFAULT_RSS_SOURCES[0]?.id ?? '');
  const [checkedSourceIds, setCheckedSourceIds] = useState<string[]>([]);
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
  const [multiCollectWarning, setMultiCollectWarning] = useState('');
  const [savedDrafts, setSavedDrafts] = useState<SavedThreadDraft[]>([]);
  const [draftChecklistById, setDraftChecklistById] = useState<Record<string, boolean[]>>({});
  const [draftStorageReady, setDraftStorageReady] = useState(false);
  const [draftLibraryMessage, setDraftLibraryMessage] = useState('');
  const [savedDraftSearch, setSavedDraftSearch] = useState('');
  const [savedDraftStatusFilter, setSavedDraftStatusFilter] = useState<SavedDraftStatusFilter>('all');
  const [savedDraftPresetFilter, setSavedDraftPresetFilter] = useState('all');
  const [savedDraftSort, setSavedDraftSort] = useState<SavedDraftSortOption>('latest');
  const [readyCombinedText, setReadyCombinedText] = useState('');
  const [autoWorkflowRunning, setAutoWorkflowRunning] = useState(false);
  const [autoWorkflowStep, setAutoWorkflowStep] = useState('');
  const [autoWorkflowLogs, setAutoWorkflowLogs] = useState<AutoWorkflowLog[]>([]);
  const [autoWorkflowError, setAutoWorkflowError] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const getItemKey = (item: RssItem, idx: number) => `${item.link}-${idx}`;
  // Selected items are derived from keys to keep UI state minimal.
  const selectedItems = selectedItemKeys
    .map((itemKey) => items.find((item, idx) => getItemKey(item, idx) === itemKey))
    .filter((item): item is RssItem => Boolean(item));
  const canGenerateDraft = selectedItems.length > 0 && Boolean(selectedPreset);
  const canRecommendArticles = items.length > 0 && Boolean(selectedPreset);
  const presetSourceRecommendation = selectedPreset
    ? PRESET_SOURCE_RECOMMENDATIONS[selectedPreset] ?? null
    : null;

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
    try {
      const raw = localStorage.getItem(THREAD_DRAFTS_STORAGE_KEY);
      if (!raw) {
        setDraftStorageReady(true);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        setDraftStorageReady(true);
        return;
      }

      const normalized = parsed
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const candidate = item as {
            id?: unknown;
            content?: unknown;
            selectedPreset?: unknown;
            createdAt?: unknown;
            sourceArticles?: unknown;
            status?: unknown;
          };

          const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
          const content = typeof candidate.content === 'string' ? candidate.content.trim() : '';
          const selectedPreset =
            typeof candidate.selectedPreset === 'string' ? candidate.selectedPreset.trim() : '';
          const createdAt = typeof candidate.createdAt === 'string' ? candidate.createdAt : '';
          const status = candidate.status === 'used' ? 'used' : candidate.status === 'ready' ? 'ready' : 'draft';
          const sourceArticles: SavedThreadDraft['sourceArticles'] = [];
          if (Array.isArray(candidate.sourceArticles)) {
            for (const sourceArticle of candidate.sourceArticles) {
              if (!sourceArticle || typeof sourceArticle !== 'object') {
                continue;
              }

              const sourceCandidate = sourceArticle as {
                title?: unknown;
                link?: unknown;
                sourceName?: unknown;
              };

              const title = typeof sourceCandidate.title === 'string' ? sourceCandidate.title.trim() : '';
              const link = typeof sourceCandidate.link === 'string' ? sourceCandidate.link.trim() : '';
              const sourceNameValue =
                typeof sourceCandidate.sourceName === 'string' ? sourceCandidate.sourceName.trim() : '';

              if (!title && !link) {
                continue;
              }

              sourceArticles.push({ title, link, sourceName: sourceNameValue || undefined });
            }
          }

          if (!id || !content || !selectedPreset || !createdAt) {
            return null;
          }

          return { id, content, selectedPreset, createdAt, sourceArticles, status };
        })
        .filter((item): item is SavedThreadDraft => Boolean(item));

      setSavedDrafts(normalized);
    } catch {
      // Ignore parse errors.
    } finally {
      setDraftStorageReady(true);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(THREAD_DRAFT_CHECKLIST_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }

      const normalized: Record<string, boolean[]> = {};
      for (const [draftId, value] of Object.entries(parsed)) {
        if (!Array.isArray(value)) {
          continue;
        }

        const checklist = value
          .slice(0, REVIEW_CHECKLIST_ITEMS.length)
          .map((item) => Boolean(item));

        while (checklist.length < REVIEW_CHECKLIST_ITEMS.length) {
          checklist.push(false);
        }

        normalized[draftId] = checklist;
      }

      setDraftChecklistById(normalized);
    } catch {
      // Ignore parse errors.
    }
  }, []);

  useEffect(() => {
    if (!draftStorageReady) {
      return;
    }

    try {
      localStorage.setItem(THREAD_DRAFTS_STORAGE_KEY, JSON.stringify(savedDrafts));
    } catch {
      // Ignore storage write errors.
    }
  }, [savedDrafts, draftStorageReady]);

  useEffect(() => {
    if (!draftStorageReady) {
      return;
    }

    try {
      localStorage.setItem(THREAD_DRAFT_CHECKLIST_STORAGE_KEY, JSON.stringify(draftChecklistById));
    } catch {
      // Ignore storage write errors.
    }
  }, [draftChecklistById, draftStorageReady]);

  useEffect(() => {
    const hasReadyDraft = savedDrafts.some((savedDraft) => savedDraft.status === 'ready');
    if (!hasReadyDraft && readyCombinedText) {
      setReadyCombinedText('');
    }
  }, [savedDrafts, readyCombinedText]);

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

    setCheckedSourceIds((prev) => prev.filter((sourceId) => savedSources.some((source) => source.id === sourceId)));
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

  const getArticleSourceLabel = (item: RssItem) => {
    if (item.sourceName?.trim()) {
      return item.sourceName.trim();
    }

    try {
      return new URL(item.link).hostname.replace(/^www\./, '');
    } catch {
      return '출처 없음';
    }
  };

  const toggleSourceCheckbox = (sourceId: string) => {
    setCheckedSourceIds((prev) =>
      prev.includes(sourceId) ? prev.filter((id) => id !== sourceId) : [...prev, sourceId],
    );
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

  const matchSourceIdsByKeywords = (keywords: readonly string[]) => {
    const loweredKeywords = keywords.map((keyword) => keyword.toLowerCase());
    return savedSources
      .filter((source) => {
        const target = `${source.category} ${source.name} ${source.description}`.toLowerCase();
        return loweredKeywords.some((keyword) => target.includes(keyword));
      })
      .map((source) => source.id);
  };

  const applySourceSelectionByKeywords = (keywords: readonly string[], label: string) => {
    const matchedSourceIds = matchSourceIdsByKeywords(keywords);
    setCheckedSourceIds(matchedSourceIds);

    if (matchedSourceIds.length === 0) {
      setSourceSaveError(`${label}에 맞는 RSS 소스를 찾지 못했습니다.`);
      setSourceSaveMessage('');
      return;
    }

    setSourceSaveError('');
    setSourceSaveMessage(`${label} 적용: ${matchedSourceIds.length}개 소스를 선택했습니다.`);
  };

  const handleApplySourceSet = (setKey: (typeof SOURCE_SET_CONFIGS)[number]['key']) => {
    const config = SOURCE_SET_CONFIGS.find((item) => item.key === setKey);
    if (!config) {
      return;
    }
    applySourceSelectionByKeywords(config.keywords, config.label);
  };

  const handleApplyPresetRecommendation = () => {
    if (!presetSourceRecommendation || !selectedPreset) {
      setSourceSaveError('먼저 프리셋을 선택해주세요.');
      setSourceSaveMessage('');
      return;
    }

    applySourceSelectionByKeywords(
      presetSourceRecommendation.keywords,
      `${selectedPreset} 추천 소스`,
    );
  };

  const handleClearCheckedSources = () => {
    setCheckedSourceIds([]);
    setSourceSaveError('');
    setSourceSaveMessage('선택한 RSS 소스를 모두 해제했습니다.');
  };

  const prepareCollection = (options?: { preservePreset?: boolean }) => {
    const preservePreset = options?.preservePreset ?? false;
    setLoading(true);
    setError('');
    setMultiCollectWarning('');
    setItems([]);
    setSelectedItemKeys([]);
    if (!preservePreset) {
      setSelectedPreset('');
    }
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
  };

  const fetchRssItems = async (targetUrl: string) => {
    const res = await fetch('/api/rss-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: targetUrl }),
    });
    const data = (await res.json()) as { items?: RssItem[]; error?: string };

    if (!res.ok) {
      throw new Error(data.error ?? '알 수 없는 오류가 발생했습니다.');
    }

    return data.items ?? [];
  };

  const collectItemsFromSources = async (sources: SavedRssSource[]) => {
    const failedSourceNames: string[] = [];
    const mergedItems: RssItem[] = [];

    for (const source of sources) {
      try {
        const sourceItems = await fetchRssItems(source.url);
        for (const item of sourceItems) {
          mergedItems.push({ ...item, sourceName: source.name });
        }
      } catch {
        failedSourceNames.push(source.name);
      }
    }

    const dedupedItems: RssItem[] = [];
    const seenLinks = new Set<string>();
    for (const item of mergedItems) {
      const normalizedLink = item.link?.trim() ?? '';
      if (normalizedLink && seenLinks.has(normalizedLink)) {
        continue;
      }
      if (normalizedLink) {
        seenLinks.add(normalizedLink);
      }
      dedupedItems.push(item);
    }

    return { dedupedItems, failedSourceNames };
  };

  const requestRecommendedArticles = async (preset: string, targetItems: RssItem[]) => {
    const res = await fetch('/api/recommend-articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset,
        items: targetItems.map((item) => ({
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

    return nextRecommendations;
  };

  const findItemKeyFromItemsByRecommendation = (
    targetItems: RssItem[],
    recommended: RecommendedArticle,
  ) => {
    const indexByLink = targetItems.findIndex((item) => item.link === recommended.url);
    if (indexByLink >= 0) {
      return getItemKey(targetItems[indexByLink], indexByLink);
    }

    const indexByTitle = targetItems.findIndex((item) => item.title === recommended.title);
    if (indexByTitle >= 0) {
      return getItemKey(targetItems[indexByTitle], indexByTitle);
    }

    return null;
  };

  const requestGeneratedDraft = async (preset: string, targetItems: RssItem[]) => {
    const res = await fetch('/api/generate-thread', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset,
        items: targetItems.map((item) => ({
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

    return nextDraft;
  };

  const collectByUrl = async (nextUrl: string) => {
    const targetUrl = nextUrl.trim();
    if (!targetUrl) {
      setError('RSS URL을 입력해주세요.');
      return;
    }

    prepareCollection();

    try {
      const nextItems = await fetchRssItems(targetUrl);
      setItems(nextItems.map((item) => ({ ...item, sourceName: '직접 입력' })));
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
    prepareCollection();

    try {
      const nextItems = await fetchRssItems(source.url);
      setItems(nextItems.map((item) => ({ ...item, sourceName: source.name })));
      setUrl(source.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCollectCheckedSources = async () => {
    if (checkedSourceIds.length === 0) {
      setSourceSaveError('전체 수집할 RSS 소스를 1개 이상 선택해주세요.');
      return;
    }

    const selectedSources = savedSources.filter((source) => checkedSourceIds.includes(source.id));
    if (selectedSources.length === 0) {
      setSourceSaveError('선택된 RSS 소스를 찾을 수 없습니다.');
      return;
    }

    setSourceSaveError('');
    setSourceSaveMessage(`선택한 소스 ${selectedSources.length}개를 순서대로 수집합니다.`);
    prepareCollection();

    const { dedupedItems, failedSourceNames } = await collectItemsFromSources(selectedSources);
    setItems(dedupedItems);

    if (failedSourceNames.length > 0) {
      setMultiCollectWarning(`일부 소스 수집 실패: ${failedSourceNames.join(', ')}`);
    }

    if (dedupedItems.length === 0 && failedSourceNames.length > 0) {
      setError('선택한 소스에서 기사를 가져오지 못했습니다.');
    }

    setLoading(false);
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
      const nextRecommendations = await requestRecommendedArticles(selectedPreset, items);
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
      const nextDraft = await requestGeneratedDraft(selectedPreset, selectedItems);
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

  const handleRunAutoWorkflow = async () => {
    if (!selectedPreset) {
      setAutoWorkflowError('프리셋을 먼저 선택해주세요.');
      return;
    }

    const recommendation = PRESET_SOURCE_RECOMMENDATIONS[selectedPreset];
    if (!recommendation) {
      setAutoWorkflowError('선택한 프리셋의 추천 소스 기준을 찾지 못했습니다.');
      return;
    }

    const addWorkflowLog = (step: string, status: 'success' | 'error', message: string) => {
      setAutoWorkflowLogs((prev) => [...prev, { step, status, message }]);
    };

    setAutoWorkflowRunning(true);
    setAutoWorkflowStep('');
    setAutoWorkflowLogs([]);
    setAutoWorkflowError('');
    setError('');

    try {
      setAutoWorkflowStep('소스 선택 중...');
      const matchedSourceIds = matchSourceIdsByKeywords(recommendation.keywords);
      setCheckedSourceIds(matchedSourceIds);
      if (matchedSourceIds.length === 0) {
        throw new Error('프리셋에 맞는 RSS 소스를 찾지 못했습니다.');
      }
      addWorkflowLog('1단계', 'success', `프리셋 추천 소스 ${matchedSourceIds.length}개 선택 완료`);

      setAutoWorkflowStep('RSS 기사 수집 중...');
      const matchedSources = savedSources.filter((source) => matchedSourceIds.includes(source.id));
      prepareCollection({ preservePreset: true });
      const { dedupedItems, failedSourceNames } = await collectItemsFromSources(matchedSources);
      setItems(dedupedItems);
      setLoading(false);

      if (failedSourceNames.length > 0) {
        setMultiCollectWarning(`일부 소스 수집 실패: ${failedSourceNames.join(', ')}`);
        addWorkflowLog(
          '2단계',
          'success',
          `기사 ${dedupedItems.length}개 수집 완료 (일부 실패: ${failedSourceNames.join(', ')})`,
        );
      } else {
        addWorkflowLog('2단계', 'success', `기사 ${dedupedItems.length}개 수집 완료`);
      }

      if (dedupedItems.length === 0) {
        throw new Error('수집된 기사가 없어 다음 단계를 진행할 수 없습니다.');
      }

      setAutoWorkflowStep('AI가 좋은 기사 분석 중...');
      const nextRecommendations = await requestRecommendedArticles(selectedPreset, dedupedItems);
      setRecommendedArticles(nextRecommendations);
      setRecommendError('');
      addWorkflowLog('3단계', 'success', `AI 추천 ${nextRecommendations.length}개 생성 완료`);

      setAutoWorkflowStep('상위 기사 자동 선택 중...');
      const topRecommendations = [...nextRecommendations].sort((a, b) => b.score - a.score).slice(0, 3);
      const nextSelectedKeys = topRecommendations
        .map((recommended) => findItemKeyFromItemsByRecommendation(dedupedItems, recommended))
        .filter((itemKey): itemKey is string => Boolean(itemKey));
      if (nextSelectedKeys.length === 0) {
        throw new Error('추천 기사 자동 선택에 실패했습니다.');
      }
      setSelectedItemKeys(nextSelectedKeys);
      addWorkflowLog('4단계', 'success', `상위 기사 ${nextSelectedKeys.length}개 자동 선택 완료`);

      setAutoWorkflowStep('쓰레드 초안 생성 중...');
      const selectedItemsForDraft = nextSelectedKeys
        .map((itemKey) => dedupedItems.find((item, idx) => getItemKey(item, idx) === itemKey))
        .filter((item): item is RssItem => Boolean(item));
      const nextDraft = await requestGeneratedDraft(selectedPreset, selectedItemsForDraft);
      setDraft(nextDraft);
      setDraftError('');
      setRewriteError('');
      setRewriteVersions([]);
      setCopySuccess(false);
      addWorkflowLog('5단계', 'success', '쓰레드 초안 생성 완료');

      setAutoWorkflowStep('자동 생성 완료');
      setTimeout(() => {
        draftSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err) {
      const message = err instanceof Error ? err.message : '자동 생성 중 오류가 발생했습니다.';
      setAutoWorkflowError(message);
      setAutoWorkflowStep('자동 생성 중단');
      addWorkflowLog('실패', 'error', message);
    } finally {
      setAutoWorkflowRunning(false);
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

  const formatDraftDate = (createdAt: string) => {
    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return createdAt;
    }
    return parsedDate.toLocaleString('ko-KR');
  };

  const getDraftChecklist = (draftId: string) => {
    const checklist = draftChecklistById[draftId];
    if (!Array.isArray(checklist)) {
      return Array(REVIEW_CHECKLIST_ITEMS.length).fill(false) as boolean[];
    }

    const normalized = checklist.slice(0, REVIEW_CHECKLIST_ITEMS.length).map((item) => Boolean(item));
    while (normalized.length < REVIEW_CHECKLIST_ITEMS.length) {
      normalized.push(false);
    }

    return normalized;
  };

  const handleSaveCurrentDraft = () => {
    const nextDraft = draft.trim();
    if (!nextDraft) {
      setDraftLibraryMessage('저장할 초안이 없습니다.');
      return;
    }

    if (!selectedPreset) {
      setDraftLibraryMessage('프리셋 정보가 없어 저장할 수 없습니다.');
      return;
    }

    const savedDraft: SavedThreadDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      content: nextDraft,
      selectedPreset,
      createdAt: new Date().toISOString(),
      sourceArticles: selectedItems.map((item) => ({
        title: item.title || '(제목 없음)',
        link: item.link,
        sourceName: item.sourceName,
      })),
      status: 'draft',
    };

    setSavedDrafts((prev) => [savedDraft, ...prev]);
    setDraftChecklistById((prev) => ({
      ...prev,
      [savedDraft.id]: Array(REVIEW_CHECKLIST_ITEMS.length).fill(false),
    }));
    setDraftLibraryMessage('초안을 저장했습니다.');
  };

  const handleLoadSavedDraft = (savedDraft: SavedThreadDraft) => {
    setDraft(savedDraft.content);
    setSelectedPreset(savedDraft.selectedPreset);
    setDraftError('');
    setRewriteError('');
    setRewriteVersions([]);
    setCopySuccess(false);
    setDraftLibraryMessage('저장된 초안을 불러왔습니다.');
    setTimeout(() => {
      draftSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleCopySavedDraft = async (savedDraft: SavedThreadDraft) => {
    try {
      await navigator.clipboard.writeText(savedDraft.content);
      setDraftLibraryMessage('저장된 초안을 복사했습니다.');
    } catch {
      setDraftLibraryMessage('저장된 초안 복사에 실패했습니다.');
    }
  };

  const handleMarkSavedDraftUsed = (draftId: string) => {
    setSavedDrafts((prev) =>
      prev.map((savedDraft) =>
        savedDraft.id === draftId ? { ...savedDraft, status: 'used' } : savedDraft,
      ),
    );
    setDraftLibraryMessage('초안 상태를 사용완료로 변경했습니다.');
  };

  const handleToggleDraftChecklist = (draftId: string, checklistIndex: number) => {
    const nextChecklist = (() => {
      const currentChecklist = getDraftChecklist(draftId);
      return currentChecklist.map((checked, idx) => (idx === checklistIndex ? !checked : checked));
    })();

    setDraftChecklistById((prev) => ({ ...prev, [draftId]: nextChecklist }));

    const isAllChecked = nextChecklist.every(Boolean);
    setSavedDrafts((prev) =>
      prev.map((savedDraft) => {
        if (savedDraft.id !== draftId) {
          return savedDraft;
        }
        if (savedDraft.status === 'used') {
          return savedDraft;
        }
        return { ...savedDraft, status: isAllChecked ? 'ready' : 'draft' };
      }),
    );
  };

  const handleDeleteSavedDraft = (draftId: string) => {
    setSavedDrafts((prev) => prev.filter((savedDraft) => savedDraft.id !== draftId));
    setDraftChecklistById((prev) => {
      const next = { ...prev };
      delete next[draftId];
      return next;
    });
    setDraftLibraryMessage('저장된 초안을 삭제했습니다.');
  };

  const getDraftFilenameDate = (createdAt: string) => {
    const parsedDate = new Date(createdAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }
    return parsedDate.toISOString().slice(0, 10);
  };

  const triggerTextDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(downloadUrl);
  };

  const handleDownloadSavedDraftTxt = (savedDraft: SavedThreadDraft) => {
    const filename = `thread_draft_${getDraftFilenameDate(savedDraft.createdAt)}.txt`;
    triggerTextDownload(filename, savedDraft.content);
    setDraftLibraryMessage('초안을 TXT 파일로 다운로드했습니다.');
  };

  const handleDownloadAllReadyDraftsTxt = () => {
    const readyDrafts = savedDrafts.filter((savedDraft) => savedDraft.status === 'ready');
    if (readyDrafts.length === 0) {
      setDraftLibraryMessage('다운로드할 ready 초안이 없습니다.');
      return;
    }

    const mergedText = readyDrafts
      .map((savedDraft, idx) =>
        [
          `### Ready Draft ${idx + 1}`,
          `프리셋: ${savedDraft.selectedPreset}`,
          `생성일: ${formatDraftDate(savedDraft.createdAt)}`,
          '',
          savedDraft.content,
        ].join('\n'),
      )
      .join('\n\n------------------------------\n\n');

    const filename = `thread_ready_drafts_${new Date().toISOString().slice(0, 10)}.txt`;
    triggerTextDownload(filename, mergedText);
    setDraftLibraryMessage('ready 초안을 하나의 TXT 파일로 다운로드했습니다.');
  };

  const handleBuildReadyCombinedText = () => {
    const readyDrafts = savedDrafts.filter((savedDraft) => savedDraft.status === 'ready');
    if (readyDrafts.length === 0) {
      setReadyCombinedText('');
      setDraftLibraryMessage('합칠 ready 초안이 없습니다.');
      return;
    }

    const mergedText = readyDrafts
      .map((savedDraft, idx) =>
        [
          `[Ready Draft ${idx + 1}]`,
          `프리셋: ${savedDraft.selectedPreset}`,
          `생성일: ${formatDraftDate(savedDraft.createdAt)}`,
          savedDraft.content,
        ].join('\n'),
      )
      .join('\n\n==============================\n\n');

    setReadyCombinedText(mergedText);
    setDraftLibraryMessage('ready 초안을 하나의 복사용 텍스트로 만들었습니다.');
  };

  const handleCopyReadyCombinedText = async () => {
    if (!readyCombinedText.trim()) {
      setDraftLibraryMessage('복사할 통합 텍스트가 없습니다.');
      return;
    }

    try {
      await navigator.clipboard.writeText(readyCombinedText);
      setDraftLibraryMessage('통합 텍스트를 복사했습니다.');
    } catch {
      setDraftLibraryMessage('통합 텍스트 복사에 실패했습니다.');
    }
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
  const savedDraftPresetOptions = [...new Set(savedDrafts.map((savedDraft) => savedDraft.selectedPreset))].sort(
    (a, b) => a.localeCompare(b, 'ko'),
  );
  const readyDrafts = savedDrafts.filter((savedDraft) => savedDraft.status === 'ready');
  const usedDraftCount = savedDrafts.filter((savedDraft) => savedDraft.status === 'used').length;
  const filteredSavedDrafts = savedDrafts
    .filter((savedDraft) => {
      if (savedDraftStatusFilter !== 'all' && savedDraft.status !== savedDraftStatusFilter) {
        return false;
      }

      if (savedDraftPresetFilter !== 'all' && savedDraft.selectedPreset !== savedDraftPresetFilter) {
        return false;
      }

      const keyword = savedDraftSearch.trim().toLowerCase();
      if (!keyword) {
        return true;
      }

      const target = `${savedDraft.selectedPreset} ${savedDraft.content}`.toLowerCase();
      return target.includes(keyword);
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      const normalizedA = Number.isNaN(timeA) ? 0 : timeA;
      const normalizedB = Number.isNaN(timeB) ? 0 : timeB;
      return savedDraftSort === 'latest' ? normalizedB - normalizedA : normalizedA - normalizedB;
    });

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

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500">추천 소스 세트</p>
                <button
                  type="button"
                  onClick={handleClearCheckedSources}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  전체 선택 해제
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {SOURCE_SET_CONFIGS.map((sourceSet) => (
                  <button
                    key={sourceSet.key}
                    type="button"
                    onClick={() => handleApplySourceSet(sourceSet.key)}
                    className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {sourceSet.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">여러 소스 동시 수집</p>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  선택 {checkedSourceIds.length}개
                </span>
              </div>
              {savedSources.length === 0 ? (
                <p className="text-xs text-slate-500">저장된 소스가 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {savedSources.map((source) => (
                    <li key={`check-${source.id}`} className="rounded-lg bg-white p-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checkedSourceIds.includes(source.id)}
                          onChange={() => toggleSourceCheckbox(source.id)}
                          className="h-4 w-4 accent-blue-600"
                        />
                        <span className="truncate text-sm text-slate-700">
                          {source.name} · {source.category}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={handleCollectCheckedSources}
                disabled={checkedSourceIds.length === 0 || loading}
                className="h-10 rounded-xl bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? '수집 중...' : '선택한 소스 전체 수집'}
              </button>
              {multiCollectWarning && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
                  {multiCollectWarning}
                </div>
              )}
            </div>

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
                          {getArticleSourceLabel(item)} · {item.pubDate || '날짜 없음'}
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
                onClick={handleRunAutoWorkflow}
                disabled={!selectedPreset || autoWorkflowRunning}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {autoWorkflowRunning ? '자동 생성 진행 중...' : '자동 생성 시작'}
              </button>
              <button
                type="button"
                onClick={handleRecommendArticles}
                disabled={!canRecommendArticles || recommendLoading || autoWorkflowRunning}
                className="h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                AI 추천 받기
              </button>
              <button
                type="button"
                onClick={handleAutoSelectTopRecommended}
                disabled={recommendedArticles.length === 0 || autoWorkflowRunning}
                className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                상위 3개 자동 선택
              </button>
            </div>
            {!selectedPreset && (
              <p className="text-sm text-slate-500">프리셋을 먼저 선택해주세요.</p>
            )}

            {(autoWorkflowRunning || autoWorkflowStep || autoWorkflowLogs.length > 0 || autoWorkflowError) && (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                {autoWorkflowStep && (
                  <p className="text-sm font-medium text-slate-700">진행 상태: {autoWorkflowStep}</p>
                )}
                {autoWorkflowError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                    자동 생성 실패: {autoWorkflowError}
                  </div>
                )}
                {autoWorkflowLogs.length > 0 && (
                  <ul className="space-y-1">
                    {autoWorkflowLogs.map((log, idx) => (
                      <li
                        key={`auto-workflow-log-${idx}`}
                        className={`text-sm ${log.status === 'error' ? 'text-red-700' : 'text-slate-600'}`}
                      >
                        {log.step}: {log.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {presetSourceRecommendation && (
              <div className="flex flex-col gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-blue-800">{presetSourceRecommendation.message}</p>
                <button
                  type="button"
                  onClick={handleApplyPresetRecommendation}
                  className="h-9 rounded-xl border border-blue-200 bg-white px-3 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  추천 소스 자동 선택
                </button>
              </div>
            )}

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

        <section ref={draftSectionRef} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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
                      onClick={handleSaveCurrentDraft}
                      className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      초안 저장
                    </button>
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

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">저장된 초안</h2>
            <p className="mt-1 text-sm text-slate-500">생성한 초안을 저장하고 나중에 다시 불러올 수 있습니다.</p>
            <p className="mt-1 text-xs text-slate-500">
              전체 {savedDrafts.length}개 / 현재 표시 {filteredSavedDrafts.length}개
            </p>
          </div>

          {draftLibraryMessage && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {draftLibraryMessage}
            </div>
          )}

          <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
            <input
              type="text"
              value={savedDraftSearch}
              onChange={(e) => setSavedDraftSearch(e.target.value)}
              placeholder="프리셋 또는 초안 내용 검색"
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none ring-blue-500 focus:ring"
            />
            <select
              value={savedDraftStatusFilter}
              onChange={(e) => setSavedDraftStatusFilter(e.target.value as SavedDraftStatusFilter)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
            >
              <option value="all">상태: 전체</option>
              <option value="draft">상태: draft</option>
              <option value="ready">상태: ready</option>
              <option value="used">상태: used</option>
            </select>
            <select
              value={savedDraftPresetFilter}
              onChange={(e) => setSavedDraftPresetFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
            >
              <option value="all">프리셋: 전체</option>
              {savedDraftPresetOptions.map((preset) => (
                <option key={`saved-draft-preset-${preset}`} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            <select
              value={savedDraftSort}
              onChange={(e) => setSavedDraftSort(e.target.value as SavedDraftSortOption)}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none ring-blue-500 focus:ring"
            >
              <option value="latest">정렬: 최신순</option>
              <option value="oldest">정렬: 오래된순</option>
            </select>
          </div>

          {savedDrafts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              아직 저장된 초안이 없습니다
            </div>
          ) : filteredSavedDrafts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              조건에 맞는 초안이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredSavedDrafts.map((savedDraft) => (
                <li key={savedDraft.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {savedDraft.selectedPreset}
                    </span>
                    <span className="text-xs text-slate-500">{formatDraftDate(savedDraft.createdAt)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        savedDraft.status === 'used'
                          ? 'bg-green-50 text-green-700'
                          : savedDraft.status === 'ready'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {savedDraft.status === 'draft'
                        ? '초안'
                        : savedDraft.status === 'ready'
                          ? '발행 준비'
                          : '사용완료'}
                    </span>
                    <span className="text-xs text-slate-500">
                      사용 기사 {savedDraft.sourceArticles.length}개
                    </span>
                  </div>

                  <p
                    className="mb-3 text-sm text-slate-700"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {savedDraft.content}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadSavedDraft(savedDraft)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopySavedDraft(savedDraft)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      복사하기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkSavedDraftUsed(savedDraft.id)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      사용완료 표시
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSavedDraft(savedDraft.id)}
                      className="h-9 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      삭제
                    </button>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-600">검수 체크리스트</p>
                      {(() => {
                        const checklist = getDraftChecklist(savedDraft.id);
                        const completedCount = checklist.filter(Boolean).length;
                        const allDone = completedCount === REVIEW_CHECKLIST_ITEMS.length;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500">
                              {completedCount}/{REVIEW_CHECKLIST_ITEMS.length} 완료
                            </span>
                            {allDone && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                발행 준비 완료
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <ul className="space-y-1">
                      {REVIEW_CHECKLIST_ITEMS.map((checkItem, idx) => {
                        const checklist = getDraftChecklist(savedDraft.id);
                        return (
                          <li key={`${savedDraft.id}-check-${idx}`} className="rounded-lg bg-white px-2 py-1.5">
                            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={checklist[idx] ?? false}
                                onChange={() => handleToggleDraftChecklist(savedDraft.id, idx)}
                                className="mt-0.5 h-4 w-4 accent-blue-600"
                              />
                              <span>{checkItem}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">발행 대기함</h2>
            <p className="mt-1 text-sm text-slate-500">검수 완료된 ready 초안을 모아보고 복사/내보내기할 수 있습니다.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            발행 준비 완료 초안 {readyDrafts.length}개 · 사용완료 초안 {usedDraftCount}개 · 전체 저장 초안 {savedDrafts.length}개
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleDownloadAllReadyDraftsTxt}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              전체 ready 초안 TXT로 다운로드
            </button>
            <button
              type="button"
              onClick={handleBuildReadyCombinedText}
              className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              전체 ready 초안 복사용 텍스트 만들기
            </button>
          </div>

          {readyCombinedText && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-700">ready 초안 통합 텍스트</p>
                <button
                  type="button"
                  onClick={handleCopyReadyCombinedText}
                  className="h-8 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700"
                >
                  전체 복사
                </button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-700">
                {readyCombinedText}
              </pre>
            </div>
          )}

          {readyDrafts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              아직 발행 준비 완료된 초안이 없습니다. 검수 체크리스트를 완료해보세요.
            </div>
          ) : (
            <ul className="space-y-3">
              {readyDrafts.map((savedDraft) => (
                <li key={`ready-queue-${savedDraft.id}`} className="rounded-xl border border-slate-200 p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {savedDraft.selectedPreset}
                    </span>
                    <span className="text-xs text-slate-500">{formatDraftDate(savedDraft.createdAt)}</span>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      발행 준비
                    </span>
                    <span className="text-xs text-slate-500">
                      사용 기사 {savedDraft.sourceArticles.length}개
                    </span>
                  </div>
                  <p
                    className="mb-3 text-sm text-slate-700"
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {savedDraft.content}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadSavedDraft(savedDraft)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      불러오기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopySavedDraft(savedDraft)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      복사하기
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMarkSavedDraftUsed(savedDraft.id)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      사용완료 표시
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadSavedDraftTxt(savedDraft)}
                      className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      TXT 다운로드
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
