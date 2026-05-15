import OpenAI from 'openai';
import { NextResponse } from 'next/server';

type GenerateThreadRequestItem = {
  title?: string;
  link?: string;
  contentSnippet?: string;
};

type GenerateThreadRequestBody = {
  preset?: string;
  items?: GenerateThreadRequestItem[];
};

const extractDraftText = (response: OpenAI.Responses.Response) => {
  const primaryText = response.output_text?.trim();
  if (primaryText) {
    return primaryText;
  }

  const fallbackText = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content): content is { type: 'output_text'; text: string } => content.type === 'output_text')
    .map((content) => content.text)
    .join('\n')
    .trim();

  return fallbackText;
};

const buildPrompt = (preset: string, items: GenerateThreadRequestItem[]) => {
  const articleList = items
    .map((item, idx) =>
      [
        `[기사 ${idx + 1}]`,
        `제목: ${item.title?.trim() || '(제목 없음)'}`,
        `요약: ${item.contentSnippet?.trim() || '(요약 없음)'}`,
        `링크: ${item.link?.trim() || '(링크 없음)'}`,
      ].join('\n'),
    )
    .join('\n\n');

  return [
    '당신은 한국어 소셜 콘텐츠 에디터입니다.',
    '선택된 기사들을 바탕으로 Threads 게시용 초안을 작성하세요.',
    `프리셋: ${preset}`,
    '',
    '[작성 규칙]',
    '1) 반드시 한국어로 작성합니다.',
    '2) 원문 문장을 길게 그대로 복사하지 말고, 핵심을 재구성해서 요약합니다.',
    '3) 과장, 단정, 선정적 표현을 피하고 사실 기반으로 작성합니다.',
    '4) 투자 관련 내용은 매수/매도 추천처럼 보이지 않게 작성하고, 정보 제공 목적임을 분명히 합니다.',
    '5) 정치 관련 내용은 "사실"과 "해석"을 명확히 구분해서 작성합니다.',
    '6) 참고 출처 목록에는 기사 제목과 링크를 반드시 포함합니다.',
    '',
    '[출력 형식 - 아래 섹션 제목 그대로 사용]',
    '후킹 문장',
    '핵심 포인트 3개',
    '쉬운 해석',
    '주의할 점',
    '질문형 마무리',
    '참고 출처 목록',
    '',
    '[입력 기사]',
    articleList,
  ].join('\n');
};

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'OpenAI API 키가 설정되지 않았습니다. .env.local에 OPENAI_API_KEY를 추가한 뒤 서버를 다시 시작해주세요.',
        },
        { status: 500 },
      );
    }

    const body = (await request.json()) as GenerateThreadRequestBody;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });
    }

    const preset = body.preset?.trim();
    const items = (body.items ?? []).filter((item) => item.title || item.contentSnippet || item.link);

    if (!preset) {
      return NextResponse.json({ error: '프리셋을 선택해주세요.' }, { status: 400 });
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '선택된 기사가 없습니다.' }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const prompt = buildPrompt(preset, items);

    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.7,
      max_output_tokens: 1000,
    });

    const draft = extractDraftText(response);

    if (!draft) {
      return NextResponse.json({ error: '초안 생성 결과가 비어 있습니다.' }, { status: 500 });
    }

    return NextResponse.json({ draft });
  } catch (error: unknown) {
    console.error('[generate-thread] API error:', error);

    const message =
      error instanceof Error && error.message
        ? `쓰레드 초안 생성 중 오류가 발생했습니다: ${error.message}`
        : '쓰레드 초안 생성 중 오류가 발생했습니다.';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
