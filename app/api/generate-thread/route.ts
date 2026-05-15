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

  const fallbackText = textChunks.join('\n').trim();

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

  const presetSpecificRules: Record<string, string[]> = {
    '미국 주식 리포트': [
      '아래 기준과 관련성이 높은 기사만 "오늘의 핵심 이슈"와 "핵심 포인트 3개"에 포함합니다.',
      '우선 기준: 시장 지수, 금리, 물가, 기업 실적, 빅테크, 원자재, Fed, 미중 무역, 투자심리.',
      '기준과 관련성이 낮은 기사는 "프리셋과 관련 낮은 기사" 섹션으로 분리합니다.',
      '투자 조언(매수/매도 추천)처럼 보이는 표현을 금지하고, 정보 제공 목적의 해석만 제시합니다.',
    ],
    '한국 정치 이슈 정리': [
      '"오늘의 핵심 이슈"는 확인된 사실 중심으로 작성합니다.',
      '"투자자/독자가 봐야 할 해석" 섹션에서만 해석을 제시하고, 사실과 해석을 명확히 분리합니다.',
      '여당 입장, 야당 입장, 주요 쟁점, 향후 일정을 빠짐없이 반영합니다.',
      '단정적 표현, 낙인 표현, 선동적 표현을 금지합니다.',
    ],
  };

  const selectedPresetRules = presetSpecificRules[preset] ?? [
    '프리셋 목적과 주제가 유사한 기사만 본문 핵심에 반영합니다.',
    '연관성이 약한 기사는 "프리셋과 관련 낮은 기사" 섹션으로 분리합니다.',
  ];

  return [
    '당신은 한국어 소셜 콘텐츠 에디터입니다.',
    '선택된 기사들을 바탕으로 Threads 게시용 초안을 작성하세요.',
    `프리셋: ${preset}`,
    '',
    '[작업 순서 - 반드시 순서대로 수행]',
    '1) 각 기사에 대해 프리셋 적합도를 High/Medium/Low로 먼저 판단합니다.',
    '2) High/Medium 기사만 본문 핵심 섹션(오늘의 핵심 이슈, 핵심 포인트 3개, 해석)에 사용합니다.',
    '3) Low 기사는 본문 핵심에서 제외하고 "프리셋과 관련 낮은 기사" 섹션으로 분리합니다.',
    '',
    '[공통 작성 규칙]',
    '1) 반드시 한국어로 작성합니다.',
    '2) 원문 문장을 길게 그대로 복사하지 말고, 핵심을 재구성해서 요약합니다.',
    '3) Threads 스타일로 짧고 읽기 쉽게 작성합니다.',
    '4) 문장을 너무 길게 쓰지 않고, 어려운 표현을 줄입니다.',
    '5) 한 문단은 2~3줄 이내로 유지합니다.',
    '6) 번호형 구조를 유지하고 과장된 표현을 금지합니다.',
    '7) 사실 기반으로 작성하고 단정/선정/과도한 확신 표현을 피합니다.',
    '8) 참고 출처 목록에는 기사 제목과 링크를 반드시 포함합니다.',
    '',
    '[프리셋 특화 규칙]',
    ...selectedPresetRules.map((rule, idx) => `${idx + 1}) ${rule}`),
    '',
    '[출력 형식 - 아래 섹션 제목 그대로 사용]',
    '후킹 문장',
    '오늘의 핵심 이슈',
    '핵심 포인트 3개',
    '투자자/독자가 봐야 할 해석',
    '프리셋과 관련 낮은 기사',
    '- 관련 낮은 기사가 없으면 "없음"이라고 명시합니다.',
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
          error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env.local에 값을 추가한 뒤 서버를 다시 시작해주세요.',
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
