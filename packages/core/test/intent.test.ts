import { describe, expect, it } from "vitest";

import { firstMessageIntent } from "../src/intent";

// 요청함 입력창 하나(결정 E3 ①): 첫 말을 질문하기와 새 요청 대화 중 어디로 보낼지 코드로 가른다(AI 호출 없음).
describe("firstMessageIntent", () => {
  const ask = [
    "임상 1상 전에 반복투여독성은 몇 주 해야 해요?",
    "유전독성 표준 시험 조합이 뭐예요?",
    "항체 의약품도 유전독성시험이 필요해요?",
    "건강기능식품 기능성 원료 인정에 필요한 안전성 자료",
    "반복투여독성시험 군당 동물 수 기준",
    "바이오의약품 독성시험 동물종 선정 기준",
    "독성동태 채혈은 몇 마리에서 해요?",
    "ICH S6에서 회복군은 꼭 둬야 하나요",
    "OECD TG 471 균주는 어떤 걸 써요",
    "왜 비글견으로 해야 해요?",
  ];
  const request = [
    "랫드 4주 반복투여독성",
    "랫드 4주 반복투여독성, 회복군 포함이요",
    "복귀돌연변이시험 견적 받고 싶어요",
    "비글견 단회투여독성 견적 요청할게요",
    "후보물질 A로 소핵시험 맡기고 싶어요",
    "13주 반복투여독성 견적 부탁해요",
    "랫드 4주 경구 반복투여독성 견적 얼마예요?",
    "유전독성 3종 세트 견적 받을 수 있어요?",
    "PK 시험 의뢰하려고요",
    "",
  ];
  it.each(ask)("질문: %s", (t) => expect(firstMessageIntent(t)).toBe("ask"));
  it.each(request)("요청: %s", (t) => expect(firstMessageIntent(t)).toBe("request"));
});
