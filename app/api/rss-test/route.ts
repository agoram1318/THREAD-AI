import { NextResponse } from 'next/server';

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
};

const getTagValue = (block: string, tag: string) => {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = block.match(regex);
  if (!match?.[1]) return '';

  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const parseRssItems = (xmlText: string): RssItem[] => {
  const itemBlocks = xmlText.match(/<item[\s\S]*?<\/item>/gi) ?? [];

  return itemBlocks.slice(0, 30).map((item) => ({
    title: getTagValue(item, 'title'),
    link: getTagValue(item, 'link'),
    pubDate: getTagValue(item, 'pubDate'),
    contentSnippet:
      getTagValue(item, 'content:encoded') ||
      getTagValue(item, 'description') ||
      getTagValue(item, 'summary'),
  }));
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };
    const url = body.url?.trim();

    if (!url) {
      return NextResponse.json({ error: 'RSS URL을 입력해주세요.' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: '유효한 URL 형식이 아닙니다.' }, { status: 400 });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'http 또는 https URL만 허용됩니다.' }, { status: 400 });
    }

    const response = await fetch(parsedUrl.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'THREAD-AI-RSS-Tester/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `RSS를 가져오지 못했습니다. (status: ${response.status})` },
        { status: 400 },
      );
    }

    const xml = await response.text();
    const items = parseRssItems(xml).filter((item) => item.title || item.link);

    if (items.length === 0) {
      return NextResponse.json({ error: 'RSS 항목을 찾지 못했습니다.' }, { status: 400 });
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: 'RSS 테스트 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
