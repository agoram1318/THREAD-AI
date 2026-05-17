import OpenAI from 'openai';
import { NextResponse } from 'next/server';

type RewriteMode = 'shorter' | 'easier' | 'hookier' | 'neutral' | 'threads_tone' | 'three_versions';

type RewriteThreadRequestBody = {
  preset?: string;
  draft?: string;
  mode?: RewriteMode;
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

const extractSourceSection = (draft: string) => {
  const markers = ['참고:', '참고 출처 목록'];
  for (const marker of markers) {
    const start = draft.indexOf(marker);
    if (start >= 0) {
      return draft.slice(start).trim();
    }
  }
  return '';
};

const extractJsonObject = (text: string) => {
  const trimmed = text.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // no-op
  }

  const withoutFence = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    return null;
  }

  try {
    const parsed = JSON.parse(objectMatch[0]);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const MODE_INSTRUCTIONS: Record<Exclude<RewriteMode, 'three_versions'>, string> = {
  shorter: '핵심은 유지하되 분량을 20~35% 줄여서 더 간결하게 작성하세요.',
  easier: '어려운 표현을 쉬운 말로 바꿔서 일반 독자가 바로 이해하도록 작성하세요.',
  hookier: '첫 문장과 문단 연결을 더 흡입력 있게 다듬되, 과장 없이 작성하세요.',
  neutral: '평가적 어조를 줄이고 사실과 해석을 분리해 더 중립적으로 작성하세요.',
  threads_tone: 'Threads에서 읽기 좋게 짧은 문장, 가벼운 흐름, 번호 구조를 유지해 다듬으세요.',
};

const buildSingleRewritePrompt = (
  preset: string,
  originalDraft: string,
  sourceSection: string,
  mode: Exclude<RewriteMode, 'three_versions'>,
) => {
  const sourceRule = sourceSection
    ? [
        '아래 참고 정보의 출처명은 유지하세요. 항목 누락, 임의 추가를 하지 마세요.',
        '본문에는 긴 URL을 넣지 말고 출처명 중심으로 간단히 유지하세요.',
        '[현재 참고 정보]',
        sourceSection,
      ].join('\n')
    : '마지막 줄에 "참고: 출처명1, 출처명2" 형식을 포함하고, 긴 URL은 출력하지 마세요.';

  return [
    '너는 한국어 Threads 에디터다.',
    `프리셋: ${preset}`,
    `다듬기 요청: ${MODE_INSTRUCTIONS[mode]}`,
    '',
    '[필수 규칙]',
    '1) 기존 초안의 핵심 사실을 유지하고, 원문에 없는 새로운 사실을 만들지 마세요.',
    '2) 메인 게시글/답글 분리 구조는 반드시 유지하세요.',
    '3) 리포트형 섹션 제목(예: 후킹 문장, 오늘의 핵심 이슈)을 그대로 쓰지 마세요.',
    '4) 메인 게시글은 500자 이내로 유지하고, 가능하면 350~450자 범위로 다듬으세요.',
    '5) 메인 게시글은 핵심 이슈를 짧게 제시한 뒤, 마지막 문장을 자연스러운 연결 문장으로 마무리하세요.',
    '6) 메인 게시글 마지막 문장은 아래 톤의 짧은 문장을 사용하세요: "그 이유는", "문제는 여기서부터입니다", "핵심은 여기입니다", "중요한 건 이겁니다", "시장이 보는 건 이 부분입니다", "진짜 봐야 할 건 따로 있습니다", "여기서 갈리는 포인트가 있습니다".',
    '7) "답글에 정리했습니다", "아래에 풀어볼게요", "이어집니다" 같은 설명식 문장과 과한 예고 문장을 금지하세요.',
    '8) "충격적인 이유", "반드시 봐야 합니다", "모르면 손해입니다", "큰일 납니다" 같은 낚시형 표현을 금지하세요.',
    '9) 문체는 딱딱한 보고서체 대신 쉬운 Threads 말투로 작성하세요.',
    '10) 이모지는 메인 게시글 기준 1~3개만 사용하고, 반드시 아래 목록에서만 선택하세요: 📌 📈 📉 🏦 ⚠️ 💬',
    '11) 투자 관련 내용은 매수/매도 추천처럼 보이지 않게 작성하세요.',
    '12) 정치/사회 이슈는 특정 진영 지지 표현을 피하고 사실/해석을 구분하세요.',
    '13) 마지막에 "※ 투자 추천이 아닌 시장 흐름 정리입니다." 문구를 포함하세요. (투자/경제 주제일 때)',
    `14) ${sourceRule}`,
    '',
    '[출력 규칙]',
    '최종 다듬어진 본문만 출력하세요. 설명 문장이나 주석은 출력하지 마세요.',
    '',
    '[기존 초안]',
    originalDraft,
  ].join('\n');
};

const buildThreeVersionsPrompt = (preset: string, originalDraft: string, sourceSection: string) => {
  const sourceRule = sourceSection
    ? [
        '아래 참고 정보의 출처명은 각 버전에서 동일하게 유지하세요. 항목 누락, 임의 추가를 금지합니다.',
        '본문에는 긴 URL을 넣지 말고 출처명 중심으로 간단히 표기하세요.',
        '[현재 참고 정보]',
        sourceSection,
      ].join('\n')
    : '각 버전에 마지막 줄 "참고: 출처명1, 출처명2"를 포함하고 긴 URL은 출력하지 마세요.';

  return [
    '너는 한국어 Threads 에디터다.',
    `프리셋: ${preset}`,
    '',
    '[요청]',
    '기존 초안을 서로 다른 톤의 3개 버전으로 다시 작성하세요.',
    '버전 1: 가장 간결한 버전',
    '버전 2: 가장 쉬운 설명 버전',
    '버전 3: 후킹이 강한 버전(과장 금지)',
    '',
    '[필수 규칙]',
    '1) 원문에 없는 새로운 사실을 만들지 마세요.',
    '2) 메인 게시글/답글 분리 구조를 유지하세요.',
    '3) 리포트형 섹션 제목(예: 후킹 문장, 오늘의 핵심 이슈)을 그대로 쓰지 마세요.',
    '4) 메인 게시글은 500자 이내로 유지하고, 가능하면 350~450자 범위로 다듬으세요.',
    '5) 메인 게시글 마지막 문장은 아래 톤의 짧은 연결 문장으로 끝내세요: "그 이유는", "문제는 여기서부터입니다", "핵심은 여기입니다", "중요한 건 이겁니다", "시장이 보는 건 이 부분입니다", "진짜 봐야 할 건 따로 있습니다", "여기서 갈리는 포인트가 있습니다".',
    '6) "답글에 정리했습니다", "아래에 풀어볼게요", "이어집니다" 같은 설명식 연결 문장을 금지하세요.',
    '7) "충격적인 이유", "반드시 봐야 합니다", "모르면 손해입니다", "큰일 납니다" 같은 낚시형 표현을 금지하세요.',
    '8) 문체는 딱딱한 보고서체 대신 쉬운 Threads 말투로 작성하세요.',
    '9) 이모지는 메인 게시글 기준 1~3개만 사용하고, 반드시 아래 목록에서만 선택하세요: 📌 📈 📉 🏦 ⚠️ 💬',
    '10) 투자 관련 내용은 매수/매도 추천처럼 보이지 않게 작성하세요.',
    '11) 정치/사회 이슈는 특정 진영 지지 표현을 피하고 사실/해석을 구분하세요.',
    '12) 마지막에 "※ 투자 추천이 아닌 시장 흐름 정리입니다." 문구를 포함하세요. (투자/경제 주제일 때)',
    `13) ${sourceRule}`,
    '',
    '[출력 규칙]',
    'JSON 객체만 출력하세요. 마크다운 코드블록 금지.',
    '형식: {"versions": ["버전1", "버전2", "버전3"]}',
    '',
    '[기존 초안]',
    originalDraft,
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

    const body = (await request.json()) as RewriteThreadRequestBody;
    const preset = body.preset?.trim();
    const originalDraft = body.draft?.trim();
    const mode = body.mode;

    if (!preset) {
      return NextResponse.json({ error: '프리셋을 선택해주세요.' }, { status: 400 });
    }

    if (!originalDraft) {
      return NextResponse.json({ error: '다듬을 초안이 없습니다.' }, { status: 400 });
    }

    if (!mode) {
      return NextResponse.json({ error: '다듬기 모드가 없습니다.' }, { status: 400 });
    }

    const sourceSection = extractSourceSection(originalDraft);
    const openai = new OpenAI({ apiKey });

    if (mode === 'three_versions') {
      const prompt = buildThreeVersionsPrompt(preset, originalDraft, sourceSection);
      const response = await openai.responses.create({
        model: 'gpt-4.1-mini',
        input: prompt,
        temperature: 0.6,
        max_output_tokens: 1800,
      });

      const rawText = extractTextFromResponse(response);
      const parsed = extractJsonObject(rawText);
      const versions = Array.isArray(parsed?.versions)
        ? parsed.versions
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => Boolean(value))
            .slice(0, 3)
        : [];

      if (versions.length === 0) {
        return NextResponse.json({ error: '다른 버전 3개 생성에 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
      }

      return NextResponse.json({ versions });
    }

    const prompt = buildSingleRewritePrompt(preset, originalDraft, sourceSection, mode);
    const response = await openai.responses.create({
      model: 'gpt-4.1-mini',
      input: prompt,
      temperature: 0.5,
      max_output_tokens: 1400,
    });

    const rewrittenDraft = extractTextFromResponse(response).trim();
    if (!rewrittenDraft) {
      return NextResponse.json({ error: '다듬어진 초안이 비어 있습니다. 다시 시도해주세요.' }, { status: 500 });
    }

    return NextResponse.json({ draft: rewrittenDraft });
  } catch (error: unknown) {
    console.error('[rewrite-thread] API error:', error);
    const message =
      error instanceof Error && error.message
        ? `초안 다듬기 중 오류가 발생했습니다: ${error.message}`
        : '초안 다듬기 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
