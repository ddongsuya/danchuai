// 답 수준 평가 세트: 실제 질문에 모델이 답한 글을 채점한다(apps/server/scripts/eval-answers.ts).
// proof: 정답 사실이 원문 조각에 그대로 있다는 증거(문서·정규식). answer.test.ts가 키 없이도 매번 확인한다.
// must: 답 글에 있어야 하는 말. mustNot: 있으면 틀린 말. cite: (근거: …)에 있어야 하는 문서(하나라도).
export interface AnswerCase {
  q: string;
  cite: readonly string[];
  proof: readonly { doc: string; re: RegExp }[];
  must: readonly RegExp[];
  mustNot?: readonly RegExp[];
}

export const ANSWER_SET: readonly AnswerCase[] = [
  { q: "임상 1상을 2주 반복 투여로 하려는데 반복투여독성은 몇 주 해야 해요?", cite: ["ICH M3", "식약처 독성시험기준"],
    proof: [{ doc: "ICH M3", re: /Up to 2 weeks/ }], must: [/2\s*주/] },
  { q: "임상 투여가 6개월을 넘으면 설치류와 비설치류 반복투여 기간은요?", cite: ["ICH M3", "ICH S4"],
    proof: [{ doc: "ICH M3", re: /9 months/ }], must: [/6\s*개월/, /9\s*개월/] },
  { q: "독성시험 최고 용량을 1000 mg/kg 넘게 잡아야 하나요?", cite: ["ICH M3"],
    proof: [{ doc: "ICH M3", re: /1000 mg\/kg/ }], must: [/1,?000\s*mg\/kg/] },
  { q: "유전독성 표준 시험 조합이 뭐예요?", cite: ["ICH S2"],
    proof: [{ doc: "ICH S2", re: /bacterial reverse gene mutation/ }, { doc: "ICH S2", re: /micronucle/ }], must: [/복귀돌연변이|Ames|에임스|세균/, /소핵|염색체/] },
  { q: "에임스 시험 균주는 어떤 걸 써요?", cite: ["ICH S2", "식약처 독성시험기준"],
    proof: [{ doc: "ICH S2", re: /TA98/ }, { doc: "식약처 독성시험기준", re: /TA98/ }], must: [/TA98/, /TA100/] },
  { q: "배태자 발생독성시험은 어떤 동물로 해요?", cite: ["ICH S5"],
    proof: [{ doc: "ICH S5", re: /rabbit/ }], must: [/토끼/] },
  { q: "생체시료 분석법 밸리데이션 정확도 기준은?", cite: ["ICH M10"],
    proof: [{ doc: "ICH M10", re: /±15%/ }, { doc: "ICH M10", re: /±20%/ }], must: [/15\s*%/, /20\s*%/] },
  { q: "발암성시험은 어떤 약에 필요해요?", cite: ["ICH S1A", "ICH M3"],
    proof: [{ doc: "ICH S1A", re: /6 months/ }], must: [/6\s*개월/] },
  { q: "항체 의약품 독성시험 동물종은 어떻게 골라요?", cite: ["ICH S6"],
    proof: [{ doc: "ICH S6", re: /relevant species/ }], must: [/관련|적합|약리/] },
  { q: "건강기능식품 원료 독성시험 자료는 뭐가 기본이에요?", cite: ["식약처 건강기능식품 인정 규정"],
    proof: [{ doc: "식약처 건강기능식품 인정 규정", re: /90일 반복투여독성시험/ }], must: [/단회/, /90\s*일/, /유전독성/], mustNot: [/28\s*일\s*반복/] },
  { q: "건강기능식품도 28일 반복투여만 하면 되나요?", cite: ["식약처 건강기능식품 인정 규정"],
    proof: [{ doc: "식약처 건강기능식품 인정 규정", re: /90일 반복투여독성시험/ }], must: [/90\s*일/] },
  { q: "기능성화장품 단회투여독성은 투여경로가 어떻게 돼요?", cite: ["식약처 기능성화장품 심사 규정"],
    proof: [{ doc: "식약처 기능성화장품 심사 규정", re: /경구 또는 비경구/ }], must: [/경구/, /비경구/] },
  { q: "농약 원제 반복 흡입독성은 몇 일 시험이에요?", cite: ["농약 등록기준"],
    proof: [{ doc: "농약 등록기준", re: /90일 반복흡입독성시험/ }], must: [/90\s*일/], mustNot: [/28\s*일\s*(반복\s*)?흡입/] },
  { q: "신규화학물질 10톤 이상이면 반복투여독성은 며칠짜리예요?", cite: ["화평법 시행규칙"],
    proof: [{ doc: "화평법 시행규칙", re: /반복투여독성\(28일\)/ }], must: [/28\s*일/] },
  { q: "줄기세포치료제 종양원성 시험 동물은 뭘 써요?", cite: ["식약처 줄기세포치료제 종양원성 평가 가이드라인"],
    proof: [{ doc: "식약처 줄기세포치료제 종양원성 평가 가이드라인", re: /면역결핍/ }], must: [/면역(결핍|저하)/] },
  { q: "3T3 NRU 광독성 시험은 어떤 값으로 판정해요?", cite: ["식약처 화장품 등 광독성 동물대체시험법(In vitro 3T3 NRU 시험법) 가이드라인", "ICH S10"],
    proof: [{ doc: "식약처 화장품 등 광독성 동물대체시험법(In vitro 3T3 NRU 시험법) 가이드라인", re: /PIF/ }], must: [/PIF|MPE/] },
  { q: "hERG 시험은 언제 해요?", cite: ["ICH S7B", "ICH E14/S7B Q&A"],
    proof: [{ doc: "ICH S7B", re: /hERG/ }], must: [/hERG/] },
  { q: "소아 임상 전에 어린 동물 독성시험이 꼭 필요해요?", cite: ["ICH S11", "ICH M3"],
    proof: [{ doc: "ICH S11", re: /juvenile/ }, { doc: "ICH M3 Q&A", re: /JUVENILE ANIMAL/i }], must: [/어린|유약|발육/] },
  // 원문에 없는 것: 짐작하지 말고 확인하지 못했다고 해야 한다
  { q: "ToxTracker 시험이 식약처 기준에 들어 있나요?", cite: [], proof: [],
    must: [/확인하지 못|찾지 못|없어요|없습니다/], mustNot: [/(근거: 식약처[^)]*\))/] },
];
