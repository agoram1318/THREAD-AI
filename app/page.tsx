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
  const [selectedItemKeys, setSelectedItemKeys] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const getItemKey = (item: RssItem, idx: number) => `${item.link}-${idx}`;

  const toggleItemSelection = (itemKey: string) => {
    setSelectedItemKeys((prev) =>
      prev.includes(itemKey) ? prev.filter((key) => key !== itemKey) : [...prev, itemKey]
    );
  };

  const removeSelectedItem = (itemKey: string) => {
    setSelectedItemKeys((prev) => prev.filter((key) => key !== itemKey));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setItems([]);
    setSelectedItemKeys([]);

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
        </>
      )}
    </main>
  );
}
