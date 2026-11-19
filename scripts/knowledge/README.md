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

## 원문을 읽는 방식 (2026-11-19)

- 고시 별표는 HWP(OLE)와 HWPX(zip) 둘 다 읽는다. HWPX 표는 칸을 ` | `로 이어 한 줄로 둔다. 별지(서식)는 넣지 않는다.
- 쪽수가 큰 별표(6만 자 넘고 `제N장`이 3개 이상, 예: 의료기기 생물학적 안전 기준 별표)는 장·절 제목으로 나눈다. 목차 줄(끝이 쪽 번호)은 제목으로 보지 않는다.
- ICH PDF: 목차 제목과 같은 본문 줄은 번호가 없어도 제목으로 본다(S5 4.1~4.3). 표는 `pdftotext -layout`으로 따로 조각을 만든다(M3 표 1). 제목 번호가 없는 표 형식 Q&A(M10 Q&A)는 낱말 좌표로 조항·질문·답 칸을 나눈다.
- 목록(`LIBRARY`) 밖에 원문을 더 넣는 ICH 문서는 `EXTRA`, 목록 주소와 다른 PDF를 쓰는 문서는 `PDF_URL`.
- 검색 배율(`src/index.ts` `passageWeight`): 제출 서류 작성방법 별표 0.5, 공식 Q&A 0.8. 두 낱말 이상 질문은 두 낱말 이상 맞은 조각만 근거로 쓴다.
- 식약처 민원인 안내서: mfds.go.kr은 해외 접속을 끊어서 사용자 PC 크롬으로 받아 텍스트로 바꾼 것을 쓴다. 텍스트는 브랜치 `claude/mfds-guides-text`의 `data-staging/mfds-guides/text`, 목록·이름·게시글 번호는 `mfds-guides.json`. 빌드할 때 `MFDS_GUIDES_DIR=<text 폴더>`를 준다(없으면 안내서는 건너뛴다). 스캔본 3건(독성시험기준 해설서, 세포·유전자치료제 초기 임상시험 디자인, 피부흡수)은 사용자 PC의 Windows 내장 OCR로 읽은 글이다(index.json method "ocr-windows", 문서 license에 OCR 표시). 3T3 NRU 책자는 같은 안내서의 텍스트판이 있어 뺐다. 검색 배율은 공식 Q&A와 같은 0.8.
