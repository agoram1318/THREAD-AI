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
      '아래 기준과 관련성이 높은 기사만 본문 번호 항목에 포함합니다.',
      '우선 기준: 시장 지수, 금리, 물가, 기업 실적, 빅테크, 원자재, Fed, 미중 무역, 투자심리.',
      '기준과 관련성이 낮은 기사는 본문에서 제외합니다.',
      '투자 조언(매수/매도 추천)처럼 보이는 표현을 금지하고, 정보 제공 목적의 해석만 제시합니다.',
    ],
    '한국 정치 이슈 정리': [
      '확인된 사실 중심으로 작성하고, 해석이 필요하면 문단에서 사실/해석을 분리해 표현합니다.',
      '여당 입장, 야당 입장, 주요 쟁점, 향후 일정을 빠짐없이 반영합니다.',
      '단정적 표현, 낙인 표현, 선동적 표현을 금지합니다.',
    ],
  };

  const selectedPresetRules = presetSpecificRules[preset] ?? [
    '프리셋 목적과 주제가 유사한 기사만 본문 핵심에 반영합니다.',
    '연관성이 약한 기사는 본문에서 제외합니다.',
  ];

  return [
    '당신은 한국어 소셜 콘텐츠 에디터입니다.',
    '선택된 기사들을 바탕으로 Threads에 바로 올릴 수 있는 실전형 초안을 작성하세요.',
    `프리셋: ${preset}`,
    '',
    '[작업 순서 - 반드시 순서대로 수행]',
    '1) 각 기사에 대해 프리셋 적합도를 High/Medium/Low로 먼저 판단합니다.',
    '2) High/Medium 기사만 본문 번호 항목에 사용합니다.',
    '3) Low 기사는 본문에서 제외합니다.',
    '',
    '[공통 작성 규칙]',
    '1) 반드시 한국어로 작성합니다.',
    '2) 원문 문장을 길게 그대로 복사하지 말고, 핵심을 재구성해서 요약합니다.',
    '3) 리포트 형식의 섹션 제목(예: 후킹 문장, 오늘의 핵심 이슈, 핵심 포인트 3개)을 그대로 출력하지 마세요.',
    '4) Threads 스타일로 짧고 읽기 쉽게 작성합니다. 문체는 딱딱한 보고서체가 아니라 쉬운 설명 말투로 작성합니다.',
    '5) 출력 구조는 반드시 "메인 게시글 1개 + 답글들"로 분리합니다. 메인 게시글에서 제시한 핵심을 답글에서 확장하세요.',
    '6) 메인 게시글은 반드시 500자 이내로 작성하고, 가능하면 350~450자 사이를 목표로 합니다.',
    '7) 메인 게시글 마지막 문장은 아래 연결 문장 톤으로 짧게 마무리합니다: "그 이유는", "문제는 여기서부터입니다", "핵심은 여기입니다", "중요한 건 이겁니다", "시장이 보는 건 이 부분입니다", "진짜 봐야 할 건 따로 있습니다", "여기서 갈리는 포인트가 있습니다".',
    '8) 메인 게시글 마지막 문장에서 "답글에 정리했습니다", "아래에 풀어볼게요", "이어집니다"처럼 설명식 안내 문장을 금지합니다.',
    '9) "충격적인 이유", "반드시 봐야 합니다", "모르면 손해입니다", "큰일 납니다" 같은 낚시형 표현을 금지합니다.',
    '10) 이모지는 메인 게시글 기준 1~3개만 사용하고, 반드시 아래 목록에서만 선택합니다: 📌 📈 📉 🏦 ⚠️ 💬',
    '11) 사실 기반으로 작성하고 단정/선정/과도한 확신 표현을 피합니다.',
    '12) 투자 관련 내용은 매수/매도 추천처럼 보이지 않게 작성합니다.',
    '13) 정치/사회 이슈는 사실과 해석을 문장 단위로 구분해 작성합니다.',
    '14) 본문에 긴 URL을 나열하지 마세요.',
    '15) 마지막 줄은 반드시 "참고: 출처명1, 출처명2" 형식으로 간단히 표시합니다. (예: 참고: MarketWatch, Federal Reserve)',
    '16) 마지막에 "※ 투자 추천이 아닌 시장 흐름 정리입니다." 문구를 포함합니다.',
    '',
    '[프리셋 특화 규칙]',
    ...selectedPresetRules.map((rule, idx) => `${idx + 1}) ${rule}`),
    '',
    '[출력 형식 예시 지침]',
    '메인 게시글 첫 문장은 핵심 이슈를 짧게 제시하는 후킹 문장으로 시작합니다.',
    '메인 게시글 본문은 2~4개의 짧은 문단으로 핵심 맥락만 제시하고, 마지막 문장은 반드시 짧은 연결 문장으로 끝냅니다.',
    '답글은 메인 게시글에서 던진 핵심을 근거/맥락 중심으로 풀어 쓰되, 설명식 연결 안내 문장을 남발하지 않습니다.',
    '출력은 최종 본문만 작성하고, 별도의 해설/주석/JSON/마크다운 코드블록은 금지합니다.',
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
