'use client';

import { FormEvent, useState } from 'react';

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
};

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [items, setItems] = useState<RssItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const getItemId = (item: RssItem, idx: number) => `${item.link || item.title || 'rss-item'}-${idx}`;

  const selectedItems = items
    .map((item, idx) => ({ item, itemId: getItemId(item, idx) }))
    .filter(({ itemId }) => selectedItemIds.includes(itemId));

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((currentIds) =>
      currentIds.includes(itemId)
        ? currentIds.filter((currentId) => currentId !== itemId)
        : [...currentIds, itemId],
    );
  };

  const removeSelectedItem = (itemId: string) => {
    setSelectedItemIds((currentIds) => currentIds.filter((currentId) => currentId !== itemId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setItems([]);
    setSelectedItemIds([]);

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
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">수집된 기사 ({items.length})</h2>
            <p className="text-sm font-medium text-blue-700">선택한 기사 {selectedItems.length}개</p>
          </div>

          {items.map((item, idx) => {
            const itemId = getItemId(item, idx);
            const isSelected = selectedItemIds.includes(itemId);

            return (
              <article key={itemId} className="flex gap-3 rounded-lg border bg-white p-4 shadow-sm">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleItemSelection(itemId)}
                  aria-label={`${item.title || '제목 없는 기사'} 선택`}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
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
              </article>
            );
          })}
        </section>
      )}

      {items.length > 0 && (
        <section className="mt-8 rounded-lg border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">선택된 기사 목록</h2>
            <span className="text-sm text-slate-500">{selectedItems.length}개 선택됨</span>
          </div>

          {selectedItems.length > 0 ? (
            <ul className="space-y-2">
              {selectedItems.map(({ item, itemId }) => (
                <li key={itemId} className="flex items-center justify-between gap-3 rounded border border-slate-200 p-3">
                  <span className="text-sm font-medium text-slate-800">{item.title || '(제목 없음)'}</span>
                  <button
                    type="button"
                    onClick={() => removeSelectedItem(itemId)}
                    className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    제거
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">선택된 기사가 없습니다.</p>
          )}
        </section>
      )}
    </main>
  );
}
