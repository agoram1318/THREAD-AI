import OpenAI from 'openai';
import { NextResponse } from 'next/server';

type RecommendRequestItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
  pubDate?: string;
};

type RecommendRequestBody = {
  preset?: string;
  items?: RecommendRequestItem[];
};

type RecommendedArticle = {
  title: string;
  url: string;
  score: number;
  reason: string;
};

const extractTextFromResponse = (response: OpenAI.Responses.Response) => {
  const primaryText = response.output_text?.trim();
  if (primaryText) {
    return primaryText;
  }

  const textChunks: string[] = [];
  for (const item of response.output ?? []) {
    if (!('content' in item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content as Array<{ type?: string; text?: string }>) {
      if (content.type === 'output_text' && typeof content.text === 'string') {
        textChunks.push(content.text);
      }
    }
  }

  return textChunks.join('\n').trim();
};

const extractJsonArray = (text: string) => {
  const trimmed = text.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // no-op
  }

  const withoutCodeFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const arrayMatch = withoutCodeFence.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(arrayMatch[0]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const clampScore = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
};

const normalizeRecommendations = (input: unknown, maxCount: number): RecommendedArticle[] => {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const candidate = item as {
        title?: unknown;
        url?: unknown;
        score?: unknown;
        reason?: unknown;
      };

      const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
      const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
      const reason = typeof candidate.reason === 'string' ? candidate.reason.trim() : '';

      if (!title || !url || !reason) {
        return null;
      }

      return {
        title,
        url,
        score: clampScore(candidate.score),
        reason,
      };
    })
    .filter((item): item is RecommendedArticle => Boolean(item))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount);
};

const buildRecommendPrompt = (preset: string, items: RecommendRequestItem[]) => {
  const presetCriteria: Record<string, string> = {
    '미국 주식 리포트':
      '시장 지수, 금리, 물가, 기업 실적, 빅테크, 원자재, Fed, 미중 무역, 투자심리와의 관련성을 최우선으로 평가하세요.',
    '한국 정치 이슈 정리':
      '확인된 사실, 여야 입장, 핵심 쟁점, 향후 일정이 명확한 기사를 우선 평가하세요.',
    '경제 뉴스 쉽게 설명':
      '일반 독자가 어렵게 느낄 경제 이슈를 쉽게 풀어 설명하기 좋은 기사를 우선 평가하세요.',
    '5줄 핵심 요약':
      '중요도가 높고, 짧은 요약(5줄)으로 압축하기 좋은 기사를 우선 평가하세요.',
    '질문 유도형 쓰레드':
      '독자의 의견을 유도할 논점, 관점 차이, 토론거리가 분명한 기사를 우선 평가하세요.',
  };

  const criteria = presetCriteria[preset] ?? '프리셋 목적과 주제 관련성이 높은 기사를 우선 평가하세요.';

  const articleList = items
    .map((item, idx) =>
      [
        `[기사 ${idx + 1}]`,
        `title: ${item.title?.trim() || '(제목 없음)'}`,
        `url: ${item.link?.trim() || '(링크 없음)'}`,
        `summary: ${item.contentSnippet?.trim() || '(요약 없음)'}`,
        `published_at: ${item.pubDate?.trim() || '(날짜 없음)'}`,
      ].join('\n'),
    )
    .join('\n\n');

  const targetCount = Math.min(5, Math.max(3, items.length));

  return [
    '너는 뉴스 에디터이며, 선택된 프리셋에 맞는 기사 추천 점수를 매긴다.',
    `프리셋: ${preset}`,
    `추천 개수: ${targetCount}개 (최소 3개, 최대 5개)`,
    '',
    '[평가 기준]',
    criteria,
    '기사별 점수는 0~100 정수로 산정한다.',
    '점수는 프리셋 적합성, 중요도, 독자 관심 가능성을 종합해 부여한다.',
    'reason은 1문장으로 간결하게 작성한다.',
    '',
    '[출력 규칙]',
    '반드시 JSON 배열만 출력한다. 마크다운 코드블록을 쓰지 마라.',
    '각 항목은 title, url, score, reason 필드를 반드시 포함한다.',
    '',
    '[출력 예시]',
    '[',
    '  {',
    '    "title": "기사 제목",',
    '    "url": "기사 URL",',
    '    "score": 92,',
    '    "reason": "프리셋 관련성이 높고 영향도가 큼"',
    '  }',
    ']',
    '',
    '[입력 기사 목록]',
    articleList,
  ].join('\n');
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENAI_API_KEY가 설정되지 않았습니다. 환경변수를 확인해주세요.' },
        { status: 500 },
      );
    }

    const body = (await request.json()) as RecommendRequestBody;
    const preset = body.preset?.trim();
    const items = (body.items ?? []).filter((item) => item.title || item.contentSnippet || item.link);

    if (!preset) {
      return NextResponse.json({ error: '프리셋을 선택해주세요.' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '추천할 기사가 없습니다.' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const prompt = buildRecommendPrompt(preset, items);
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.3,
      max_output_tokens: 1200,
    });

    const rawText = extractTextFromResponse(response);
    const jsonArray = extractJsonArray(rawText);
    const recommendations = normalizeRecommendations(jsonArray, 5);

    if (recommendations.length === 0) {
      return NextResponse.json(
        {
          error: '추천 결과를 해석하지 못했습니다. 잠시 후 다시 시도해주세요.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ recommendations });
  } catch (error: unknown) {
    console.error('[recommend-articles] API error:', error);
    const message =
      error instanceof Error && error.message
        ? `추천 분석 중 오류가 발생했습니다: ${error.message}`
        : '추천 분석 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
