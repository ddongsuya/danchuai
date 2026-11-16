# 에이전트 지식 만들기

`packages/knowledge/data` 의 파일 세 개를 만든다. 앱 실행 중에는 네트워크·DB를 쓰지 않고 이 파일만 읽는다.

| 파일 | 내용 | 출처 |
|---|---|---|
| `guidelines.json` | 가이드라인 원문을 조항 단위로 나눈 조각 | ICH 공식 PDF, 국가법령정보센터(고시 본문·별표). OECD는 저작권 때문에 원문을 넣지 않고 주소만 둔다 |
| `reference.json` | 요청서 항목 체계, 시험 묶음(근거·고친 곳 포함), 효력 질환 영역 | 단추 저장소 `lib/` 의 공개 기준 자료 |
| `notes.json` | 정리본 조각(원문 찾는 길잡이) | 계정 스킬 nonclinical-guideline 참고 문서 |

단추 DB, 기관 카탈로그·단가, 회원·요청 자료는 읽지 않는다.

## 순서

```bash
# 1. 단추 공개 기준 자료 뽑기 (단추 저장소를 옆에 받아 둔다)
DANCHU_DIR=../danchu npx tsx --tsconfig ../danchu/tsconfig.json scripts/knowledge/export-danchu.mts

# 2. 가이드라인 원문 받아 조각 만들기 (Python 3.11+, pdftotext 필요. 캐시 폴더는 커밋하지 않는다)
python3 -I scripts/knowledge/build_guidelines.py /tmp/knowledge-cache

# 3. 기준 자료·정리본 정리
SKILL_DIR=<nonclinical-guideline 스킬 폴더> npx tsx scripts/knowledge/build-reference.mts

# 4. 검색 정확도 확인 (정확도 질문 세트 90% 이상)
npm test -w @danchuai/knowledge
```

## 갱신할 때

- 가이드라인이 개정되면 2번을 다시 돌린다. 국가법령정보센터는 그날 기준 최신 고시를 준다(시행 전 개정본일 수 있어 `docs[].version` 의 시행일을 확인한다).
- 시험 묶음에서 원문과 어긋나 고친 곳은 `build-reference.mts` 의 `fix(...)` 와 `reference.json` 의 `corrections` 에 근거 조항과 함께 남긴다.
- 정확도 질문 세트는 `packages/knowledge/test/eval-set.ts`. 놓친 질문이 생기면 여기에 더한다.
