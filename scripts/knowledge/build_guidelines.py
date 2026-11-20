"""가이드라인 원문을 받아 조항 단위 지식 파일(packages/knowledge/data/guidelines.json)을 만든다.

- 목록은 단추 가이드라인 자료실(export-danchu.mts 결과)의 LIBRARY 를 그대로 쓴다.
- ICH: 공식 PDF(database.ich.org). ICH 법적 고지에 따라 출처(ICH 저작권)를 밝히면 재사용할 수 있다.
- 식약처·농진청 고시, 법령: 국가법령정보센터 본문과 별표(HWP). 법령·고시는 저작권 보호 대상이 아니다(저작권법 제7조).
- OECD: 저작권이 있어 원문을 싣지 않는다. 자료실의 한 줄 설명과 공식 주소만 넣는다.

실행(Python 3.11+, 표준 라이브러리 + pdftotext):
  python3 -I scripts/knowledge/build_guidelines.py <캐시 폴더>
캐시 폴더에 받은 원문을 두고 다시 실행하면 내려받지 않는다.
"""
import hashlib, html, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hwp5text import doc_text  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DATA = os.path.join(ROOT, "packages", "knowledge", "data")
UA = {"User-Agent": "Mozilla/5.0 (knowledge-builder)"}
LAW = "https://www.law.go.kr"
MAX_CHUNK = 1600


def get(url, cache, name):
    path = os.path.join(cache, name)
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return open(path, "rb").read()
    parts = urllib.parse.urlsplit(url)
    url = urllib.parse.urlunsplit(parts._replace(path=urllib.parse.quote(parts.path, safe="/%")))
    last = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                b = r.read()
            open(path, "wb").write(b)
            time.sleep(0.4)
            return b
        except Exception as e:  # 일시 오류만 다시 시도
            last = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"내려받기 실패: {url} ({last})")


def key(s):
    return hashlib.sha1(s.encode()).hexdigest()[:12]


def strip_html(t):
    t = re.sub(r"<script.*?</script>|<style.*?</style>", "", t, flags=re.S)
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</tr>", "\n", t)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t).replace("\xa0", " ")
    lines = [re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")]
    out = []
    for l in lines:
        if not l:
            continue
        # 국가법령정보센터 본문은 인용 법령 이름마다 줄이 끊긴다. 짧은 조각은 앞 줄에 잇는다.
        if out and (len(l) < 25 or l[0] in ",.)」·") and not re.match(r"^(제\d+조|부칙|[①-⑳]|\d+\.|[가-하]\.)", l):
            out[-1] += ("" if l[0] in ",.)」" else " ") + l
        else:
            out.append(l)
    return "\n".join(out)


# ---------- ICH ----------

def pdf_text(b, cache, name):
    p = os.path.join(cache, name)
    if not os.path.exists(p):
        open(p, "wb").write(b)
    return subprocess.run(["pdftotext", "-enc", "UTF-8", p, "-"], capture_output=True, check=True).stdout.decode("utf-8", "ignore")


HEAD = re.compile(r"^(\d+\.(?:\d+\.?){0,3}|[IVX]+\.|Note \d+|Annex \d+|Appendix \d+|PART [IVX]+:?)\s+([A-Z][A-Za-z0-9 ,;:()/'’\-–&]+)$")
NUM_ONLY = re.compile(r"^(\d+\.(?:\d+\.?){0,3}|[IVX]+\.)$")


def ich_chunks(text):
    lines = [l.rstrip() for l in text.replace("\f", "\n").split("\n")]
    # 목차(점선 줄)와 머리·꼬리말·쪽 번호 제거
    body = []
    for l in lines:
        s = l.strip()
        if re.search(r"\.{5,}\s*\d*$", s) or re.fullmatch(r"(Page )?\d+( of \d+)?|i{1,3}|iv|v|vi{0,3}", s):
            continue
        body.append(s)
    # pdftotext 는 절 번호와 제목을 두 줄로 내놓는다. "3.1" + "Scope" → "3.1 Scope"
    merged = []
    for s in body:
        if merged and NUM_ONLY.match(merged[-1]) and s and s[0].isupper() and len(s) < 100:
            merged[-1] = f"{merged[-1]} {s}"
        elif s:
            merged.append(s)
    body = merged
    sections, cur, label = [], [], None
    for s in body:
        m = HEAD.match(s)
        if m and len(s) < 110:
            if cur:
                sections.append((label, cur))
            label, cur = s, []
        else:
            cur.append(s)
    if cur:
        sections.append((label, cur))
    out = []
    for label, ls in sections:
        if label is None:  # 표지·개정 이력·목차·약어표
            continue
        txt = re.sub(r"\n{2,}", "\n", "\n".join(ls)).strip()
        txt = re.sub(r"(?<![.:;])\n(?=[a-z(])", " ", txt)  # 문장 중간 줄바꿈 잇기
        if len(txt) < 40:
            continue
        out += [(label, p) for p in split_long(txt)]
    return out


def split_long(txt, size=MAX_CHUNK):
    if len(txt) <= size:
        return [txt]
    paras, out, buf = txt.split("\n"), [], ""
    for p in paras:
        while len(p) > size:  # 아주 긴 문단은 문장 경계에서 자른다
            cut = max(p.rfind(". ", 0, size), p.rfind("다. ", 0, size), size // 2)
            if buf:
                out.append(buf); buf = ""
            out.append(p[: cut + 1].strip()); p = p[cut + 1 :].strip()
        if len(buf) + len(p) + 1 > size and buf:
            out.append(buf); buf = p
        else:
            buf = f"{buf}\n{p}" if buf else p
    if buf:
        out.append(buf)
    return out


# ---------- 국가법령정보센터 ----------

# HWPX 별표를 아직 넣지 않는 문서. 농약 등록기준은 별표가 조각 480여 개라 넣으면 의약품 질문 검색 정확도가
# 90% 아래로 떨어진다(2026-11-21, 86.7%). 제품 유형별 검색 조정 뒤에 넣는다.
HWPX_SKIP = {"농약 등록기준"}


def law_doc(url, cache, hwpx=True):
    page = get(url, cache, "page-" + key(url) + ".html").decode("utf-8", "ignore")
    is_rule = "/행정규칙/" in urllib.parse.unquote(url)
    if is_rule:
        seq = re.search(r'id="admRulSeq" value="(\d+)"', page).group(1)
        body_url = f"{LAW}/LSW/admRulLsInfoR.do?admRulSeq={seq}"
    else:
        seq = re.search(r'id="lsiSeq" value="(\d+)"', page).group(1)
        ef = re.search(r'name="efYd" value="(\d*)"', page).group(1)
        body_url = f"{LAW}/LSW/lsInfoR.do?lsiSeq={seq}&efYd={ef}&chrClsCd=010202&urlMode=lsInfoP&ancYnChk=0&nwJoYnInfo=Y&efGubun=Y"
    raw = get(body_url, cache, "body-" + key(body_url) + ".html").decode("utf-8", "ignore")
    head = re.search(r"\[시행 [^\]]+\]\s*\[[^\]]+\]", strip_html(raw))
    version = head.group(0) if head else ""
    # 본문: 조문 부분만(별표 목록·부칙 이전)
    text = strip_html(raw)
    files = []
    seen = set()
    for m in re.finditer(r'flDownload\.do\?[^"\']*?flSeq=(\d+)[^"\']*', raw):
        fl = m.group(1)
        if fl in seen:
            continue
        seen.add(fl)
        href = html.unescape(m.group(0))
        try:
            b = get(f"{LAW}/LSW/{href}", cache, f"fl-{fl}.bin")
        except RuntimeError:
            continue
        # HWP(OLE)·HWPX(zip). 같은 별표의 PDF 판은 글자 순서가 흐트러져 쓰지 않는다
        p = os.path.join(cache, f"fl-{fl}.bin")
        try:
            t = doc_text(p)
        except Exception:
            continue
        if t and (hwpx or b[:4] != b"PK\x03\x04"):
            files.append(t)
    return version, text, files


ART = re.compile(r"^(제\d+조(?:의\d+)?)\(([^)]{1,40})\)")


def law_chunks(text, files, relevant):
    out = []
    # 조문
    cur, label = [], None
    for l in text.split("\n"):
        m = ART.match(l)
        if m:
            if label and cur:
                out.append((label, "\n".join(cur)))
            label, cur = f"{m.group(1)}({m.group(2)})", [l]
        elif re.match(r"^부칙", l):
            if label and cur:
                out.append((label, "\n".join(cur)))
            label, cur = None, []
        elif label:
            cur.append(l)
    if label and cur:
        out.append((label, "\n".join(cur)))
    # 별표: 같은 제목은 한 번만(HWP·PDF 두 벌)
    titles = set()
    for f in files:
        f = re.sub(r"\n{2,}", "\n", f).strip()
        flines = f.split("\n")
        first = flines[0].strip()
        m = re.match(r"^\[?(별표\s*[\d의]+|별지[^\]]*)\]?\s*(.*)", first)
        if not m:
            continue
        name = re.sub(r"\s+", " ", m.group(1)).replace("별표 ", "별표")
        rest = m.group(2).strip()
        body_from = 1
        # HWPX 별표는 "[별표 3]" 다음 줄에 제목이 온다. "<개정 …>" 같은 개정 표시 줄은 건너뛴다
        while not rest and body_from < min(len(flines), 4):
            cand = flines[body_from].strip()
            body_from += 1
            if not re.match(r"^<[^>]*(개정|신설)", cand):
                rest = cand
        title = f"{name} {rest}".strip()
        if title in titles or name.startswith("별지") or not relevant(title):
            continue
        titles.add(title)
        part, plabel = [], title
        for l in flines[body_from:]:
            mm = re.match(r"^\s*([①-⑳]|\d{1,2}\.)\s", l)
            if mm and part and len("\n".join(part)) > 300:
                out += [(plabel, p) for p in split_long("\n".join(part))]
                part = []
            part.append(l.strip())
        if part:
            out += [(plabel, p) for p in split_long("\n".join(part))]
    out = [(lb, p) for lb, t in out for p in split_long(t)]
    return [(lb, t) for lb, t in out if len(t.strip()) > 20 and not ADDENDA.search(lb)]


ADDENDA = re.compile(r"\((시행일|적용례|경과조치|재검토기한|유효기간|다른 법령의 개정|일반적 경과조치)\)")


SKIP_BYL = re.compile(r"수수료|행정처분|과태료|서식|위반행위|신청서|지정서|감독")


def main():
    cache = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".knowledge-cache"))
    os.makedirs(cache, exist_ok=True)
    exp = json.load(open(os.path.join(DATA, "danchu-export.raw.json"), encoding="utf-8"))
    docs, chunks, gaps = [], [], []
    for d in exp["library"]["LIBRARY"]:
        url, short = d["url"], d["short"]
        meta = {"short": short, "name": d["name"], "by": d["by"], "about": d["about"], "url": url, "topic": d["topic"], "products": d["products"]}
        got = []
        version = ""
        try:
            if url.startswith("https://database.ich.org/") and url.endswith(".pdf"):
                b = get(url, cache, "ich-" + key(url) + ".pdf")
                text = pdf_text(b, cache, "ich-" + key(url) + ".pdf")
                m = re.search(r"(Current )?Step 4 version\s*\n?\s*dated ([0-9A-Za-z ]+\d{4})", text)
                version = f"Step 4, {m.group(2).strip()}" if m else "Step 4"
                got = ich_chunks(text)
                meta["license"] = "© ICH. 원문을 조항 단위로 나눈 것이며 내용은 바꾸지 않았다."
                meta["lang"] = "en"
            elif url.startswith(LAW):
                version, text, files = law_doc(url, cache, hwpx=short not in HWPX_SKIP)
                relevant = (lambda t: "유해성" in t or "시험" in t) if "/법령/" in urllib.parse.unquote(url) else (lambda t: not SKIP_BYL.search(t))
                got = law_chunks(text, files, relevant)
                meta["license"] = "법령·고시(저작권법 제7조, 보호받지 않는 저작물)"
                meta["lang"] = "ko"
            else:
                meta["lang"] = "ko"
                meta["license"] = "원문 미수록(저작권). 공식 주소만 연결"
                gaps.append(short)
        except Exception as e:
            print("실패", short, e, file=sys.stderr)
            gaps.append(short)
        meta["version"] = version
        meta["chunks"] = len(got)
        docs.append(meta)
        for i, (label, text) in enumerate(got):
            chunks.append({"id": f"{key(short)}-{i}", "doc": short, "section": label[:80], "text": text})
        print(f"{short:28} {len(got):4} 조각 {version}", file=sys.stderr)
    out = {"builtAt": time.strftime("%Y-%m-%d"), "source": exp["source"], "docs": docs, "chunks": chunks, "gaps": gaps}
    json.dump(out, open(os.path.join(DATA, "guidelines.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("완료", len(docs), "문서", len(chunks), "조각", "원문 없음:", gaps, file=sys.stderr)


if __name__ == "__main__":
    main()
