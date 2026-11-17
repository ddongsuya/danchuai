// 요청함 입력창의 첫 말을 어디로 보낼지 가른다: "ask"(가이드라인 질문하기) 또는 "request"(새 견적 요청 대화).
// AI 를 부르지 않는 규칙이다. 견적·요청 말이 있으면 요청, 없고 묻는 말(물음표, 몇·뭐·어떻게, 기준·요건)이면 질문.
// 애매하면 요청으로 보낸다(요청 대화 안에서도 질문에 답하고, 질문하기 답 아래에도 견적 요청 버튼이 있다).

export type FirstIntent = "ask" | "request";

const REQUEST = /견적|요청|맡기|맡길|의뢰|발주|부탁|진행하고|받고\s*싶|받을\s*수/;
const QUESTION = /[?？]\s*$|몇|뭐|무엇|무슨|어떤|어떻게|어느|왜|언제|인가요|나요\s*$|되나요|돼요\s*$|해야\s*해|필요해요|필요한가|기준|요건|가이드라인|규정|인정에\s*필요/;

export function firstMessageIntent(text: string): FirstIntent {
  const t = text.trim();
  if (!t || REQUEST.test(t)) return "request";
  return QUESTION.test(t) ? "ask" : "request";
}
