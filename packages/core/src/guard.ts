// 상대에게 나가는 AI 초안 문장 점검. 걸린 문장은 버리고, 요약 자체가 걸리면 초안 전체를 다시 만든다.

export type GuardIssue =
  | { kind: "ranking"; match: string }
  | { kind: "money"; match: string }
  | { kind: "contact"; match: string };

// 기관 추천·순위·우열 표현. 중립 원칙.
const RANKING = [/추천/u, /순위/u, /\d+\s*위(?=[는로를에가인\s.,]|$)/u, /가장\s*(저렴|싼|좋|빠른|나은)/u, /최저가/u, /베스트/u, /더\s*나은\s*기관/u];
// 숫자 + 원·만원·억 또는 ₩. AI가 금액을 쓰지 못하게 한다(금액은 코드가 계산).
const MONEY = /(₩\s*[\d,]+|[\d][\d,.]*\s*(원|만\s*원|만|억|천\s*원))/u;
// 선정 전에는 상대 신원·연락처가 나가면 안 된다.
const CONTACT = [/[\w.+-]+@[\w-]+\.[\w.]+/u, /\b0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}\b/u];

export function checkSentence(sentence: string, opts: { allowMoney?: boolean } = {}): GuardIssue[] {
  const issues: GuardIssue[] = [];
  for (const re of RANKING) {
    const m = sentence.match(re);
    if (m) issues.push({ kind: "ranking", match: m[0] });
  }
  if (!opts.allowMoney) {
    const m = sentence.match(MONEY);
    if (m) issues.push({ kind: "money", match: m[0] });
  }
  for (const re of CONTACT) {
    const m = sentence.match(re);
    if (m) issues.push({ kind: "contact", match: m[0] });
  }
  return issues;
}

/** 문장 단위로 나눠 걸린 문장을 뺀다. */
export function filterSentences(text: string, opts: { allowMoney?: boolean } = {}) {
  const sentences = text
    .split(/(?<=[.?!])\s+|\n+/u)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept: string[] = [];
  const dropped: { sentence: string; issues: GuardIssue[] }[] = [];
  for (const s of sentences) {
    const issues = checkSentence(s, opts);
    if (issues.length) dropped.push({ sentence: s, issues });
    else kept.push(s);
  }
  return { text: kept.join(" "), kept, dropped };
}
