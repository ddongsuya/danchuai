"""원문이 지식 조각에 빠짐없이 들어갔는지, 추출기를 바꿔도 같은 글자가 나오는지 확인한다.

두 가지를 본다.
1. 빠짐 검사: 원문에서 뽑은 글의 모든 줄이(공백을 뺀 글자 그대로) 그 문서 조각들 안에 있는지.
   빠진 줄은 문서별로 모두 적는다. 쪽 번호·머리말처럼 일부러 뺀 것도 숨기지 않고 적어 사람이 판단한다.
2. 추출기 교차 확인: 같은 원본을 다른 방법으로 읽어 글자가 같은지.
   - ICH PDF: pdftotext 와 PyMuPDF
   - 고시·법령 별표: HWP(또는 HWPX)와 같은 별표의 PDF 판(국가법령정보센터가 두 벌을 올린다)
   두 결과가 다른 구간을 적는다.

실행:
  python3 -I scripts/knowledge/verify_coverage.py <캐시 폴더> [식약처 안내서 텍스트 폴더] > report.json
PyMuPDF(pip install pymupdf)가 있어야 2번을 한다.
"""
import difflib, json, os, re, sys, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_guidelines as B  # noqa: E402

try:
    import pymupdf as fitz  # PyMuPDF
    fitz.TOOLS.mupdf_display_errors(False)  # 경고가 표준 출력(보고서)에 섞이지 않게
except ImportError:  # 교차 확인 없이 빠짐 검사만
    fitz = None


def norm(s):
    s = unicodedata.normalize("NFKC", s)
    return re.sub(r"\s+", "", s)


def page_number_lines(source):
    """각 쪽 첫·마지막 줄의 쪽 번호(빌더가 일부러 빼는 줄)."""
    out = set()
    for pg in source.split("\f"):
        ls = [l.strip() for l in pg.split("\n") if l.strip()]
        for l in (ls[:1] + ls[-1:]):
            if B.PAGE_NO.fullmatch(l):
                out.add(l)
    return out


def missing_lines(source, chunk_texts, min_len=1, labels=()):
    """원문 줄 가운데 조각 어디에도 없는 줄. 조각 경계에 걸친 줄은 이어 붙인 글에서 찾는다. 절 제목만 있는 줄은 labels 에서 찾는다."""
    joined = norm("".join(chunk_texts)) + "\u0000" + norm("\u0000".join(labels))
    miss = []
    for raw in source.replace("\f", "\n").split("\n"):
        mb = re.search(r"부\s*칙\s*(?=[(<]|$)", raw)
        if mb and ("체크박스" in raw or "return false" in raw):  # 국가법령정보센터 화면 조각은 원문이 아니다
            raw = raw[mb.start():]
        n = norm(raw)
        if len(n) < min_len:
            continue
        if n not in joined:
            miss.append(raw.strip())
    return miss


def order_breaks(source, chunk_texts, min_len=8):
    """원문 줄을 차례대로 따라가며 조각 글에서 찾는다. 앞에서 찾은 자리보다 뒤에 없으면 '순서 어긋남'.
    (글자는 다 있어도 줄 순서가 섞이면 뜻이 바뀔 수 있다. 표를 따로 만든 조각은 문서 끝에 있어 여기 걸릴 수 있다)"""
    joined = norm("".join(chunk_texts))
    cur, out = 0, []
    for raw in source.replace("\f", "\n").split("\n"):
        n = norm(raw)
        if len(n) < min_len or re.search(r"\.{5,}|·{3,}|…{2,}", raw):
            continue
        p = joined.find(n, cur)
        if p >= 0:
            cur = p + len(n)
        elif n in joined:
            out.append(raw.strip())
            cur = joined.find(n) + len(n)
    return out


def classify(line, pages=()):
    s = line.strip()
    if s in pages:
        return "쪽 번호"
    if re.search(r"\.{5,}|·{3,}|…{2,}", s):
        return "목차"
    return "본문"


def diff_spans(a, b, limit=40):
    """두 추출 결과(공백 제거)의 다른 구간. 길이가 크면 줄 단위로 맞춘 뒤 비교한다."""
    sm = difflib.SequenceMatcher(None, a, b, autojunk=False)
    spans = []
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            continue
        spans.append({"op": tag, "a": a[max(0, i1 - 15):i2 + 15], "b": b[max(0, j1 - 15):j2 + 15]})
        if len(spans) >= limit:
            break
    return sm.ratio(), spans


def pdf_mupdf(path):
    d = fitz.open(path)
    return "\n".join(p.get_text() for p in d)


def same_chars(a, b):
    """글자 순서가 달라도(칸 배치 차이) 같은 글자가 같은 수만큼 있는지. 빠지거나 바뀐 글자만 센다."""
    from collections import Counter
    ca, cb = Counter(a), Counter(b)
    only_a = sum((ca - cb).values())
    only_b = sum((cb - ca).values())
    return only_a, only_b, (ca - cb).most_common(15), (cb - ca).most_common(15)


def main():
    cache = os.path.abspath(sys.argv[1])
    guide_dir = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("MFDS_GUIDES_DIR")
    data = json.load(open(os.path.join(B.DATA, "guidelines.json"), encoding="utf-8"))
    by_doc, labels = {}, {}
    for c in data["chunks"]:
        by_doc.setdefault(c["doc"], []).append(c["text"])
        labels.setdefault(c["doc"], []).append(c["section"])  # 절 제목은 section 에 있다
    exp = json.load(open(os.path.join(B.DATA, "danchu-export.raw.json"), encoding="utf-8"))
    report = {"docs": [], "cross": []}

    for d in exp["library"]["LIBRARY"] + B.EXTRA:
        url, short = B.PDF_URL.get(d["short"], d["url"]), d["short"]
        chunks = by_doc.get(short, [])
        if url.startswith("https://database.ich.org/") and url.endswith(".pdf"):
            name = "ich-" + B.key(url) + ".pdf"
            path = os.path.join(cache, name)
            text = B.pdf_text(open(path, "rb").read(), cache, name)
            miss = missing_lines(text, chunks, labels=labels.get(short, []))
            report["docs"].append(entry(short, "ICH PDF", text, miss, order=order_breaks(text, chunks)[:100]))
            if fitz:
                a, b = norm(text), norm(pdf_mupdf(path))
                oa, ob, ta, tb = same_chars(a, b)
                report["cross"].append({"doc": short, "kind": "pdftotext↔PyMuPDF", "chars": len(a), "only_pdftotext": oa, "only_mupdf": ob, "top_only_pdftotext": ta, "top_only_mupdf": tb})
        elif url.startswith(B.LAW):
            fetched = []
            orig_get = B.get
            def rec(u, c, n, _g=orig_get):
                fetched.append(os.path.join(c, n))
                return _g(u, c, n)
            B.get = rec
            try:
                version, text, files = B.law_doc(url, cache)
            finally:
                B.get = orig_get
            relevant = (lambda t: "유해성" in t or "시험" in t) if "/법령/" in B.urllib.parse.unquote(url) else (lambda t: not B.SKIP_BYL.search(t))
            # 조문 부분: 첫 조문부터 부칙 앞까지(부칙·별표 목록·화면 메뉴는 원래 넣지 않는다)
            lines = text.split("\n")
            st = next((i for i, l in enumerate(lines) if B.ART.match(l)), 0)
            en = next((i for i, l in enumerate(lines) if i > st and re.match(r"^부칙", l)), len(lines))
            body = "\n".join(lines[st:en])
            src = [body]
            used = set()
            for fname, f in files:
                t = B.law_chunks("", [(fname, f)], relevant)
                if t:
                    src.append(f)
                    used.add(fname)
            miss = missing_lines("\n".join(src), chunks, labels=labels.get(short, []))
            report["docs"].append(entry(short, "고시·법령", "\n".join(src), miss, files=sorted(used), order=order_breaks("\n".join(src), chunks)[:100]))
            if fitz:
                report["cross"] += law_twins(short, fetched, files, used)
        else:
            report["docs"].append({"doc": short, "kind": "원문 미수록", "chunks": len(chunks)})

    if guide_dir:
        for e, version, got in B.mfds_guides(guide_dir):
            short = "식약처 " + e["name"]
            p = os.path.join(guide_dir, e["file"])
            text = open(p, encoding="utf-8").read() if os.path.exists(p) else ""
            miss = missing_lines(text, by_doc.get(short, []), labels=labels.get(short, []))
            report["docs"].append(entry(short, "안내서 OCR" if e["ocr"] else "안내서", text, miss, order=order_breaks(text, by_doc.get(short, []))[:100]))

    tot = sum(x.get("lines", 0) for x in report["docs"])
    body_miss = sum(x.get("missing_by_kind", {}).get("본문", 0) for x in report["docs"])
    report["summary"] = {"docs": len(report["docs"]), "source_lines": tot,
                         "missing_lines": sum(x.get("missing", 0) for x in report["docs"]), "missing_body_lines": body_miss}
    json.dump(report, sys.stdout, ensure_ascii=False, indent=1)


def entry(short, kind, text, miss, **kw):
    pages = page_number_lines(text)
    lines = [l for l in text.replace("\f", "\n").split("\n") if len(norm(l)) >= 1]
    kinds = {}
    for m in miss:
        k = classify(m, pages)
        kinds[k] = kinds.get(k, 0) + 1
    return {"doc": short, "kind": kind, "lines": len(lines), "chars": len(norm(text)), "missing": len(miss),
            "missing_by_kind": kinds, "missing_lines": miss[:400], **kw}


def plain_of(path):
    """별표 파일의 글자만(표 변환 없이). HWP는 칸마다 한 줄, HWPX는 글 조각마다 한 줄."""
    with open(path, "rb") as fh:
        head = fh.read(8)
    if head == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        return B.hwp_text_plain(path)
    if head[:2] == b"PK":
        import zipfile, html as H
        z = zipfile.ZipFile(path)
        secs = sorted(n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n))
        return "\n".join(H.unescape(re.sub(r"<[^>]+>", "\n", t)) for n in secs for t in re.findall(r"<hp:t\b[^>]*>(.*?)</hp:t>", z.read(n).decode("utf-8", "ignore"), re.S))
    return None


def law_twins(short, fetched, files, used):
    """1) 표를 열 이름 붙은 줄로 바꾼 글이 원래 글자를 하나도 잃지 않았는지(변환 전 글자 ⊆ 변환 후 글자)
    2) 같은 별표의 PDF 판과 글자가 같은지. 제목 줄([별표 N])로 짝을 짓는다."""
    def title(t):
        for l in t.split("\n")[:4]:
            m = re.search(r"\[(별표\s*[\d의]*)\]", l)
            if m:
                return re.sub(r"\s+", "", m.group(1))
        return None
    used_titles = {title(f) for fn, f in files if fn in used}
    plains, pdfs = {}, {}
    for p in fetched:
        if not p.endswith(".bin"):
            continue
        with open(p, "rb") as fh:
            is_pdf = fh.read(4) == b"%PDF"
        t = pdf_mupdf(p) if is_pdf else plain_of(p)
        if not t:
            continue
        k = title(t)
        if k in used_titles:
            (pdfs if is_pdf else plains).setdefault(k, t)
    labeled = {title(f): f for fn, f in files if fn in used}
    out = []
    for k in sorted(used_titles, key=lambda x: (x is None, str(x))):
        row = {"doc": short, "kind": "별표 " + str(k)}
        if k in plains and k in labeled:
            lost, _, top, _ = same_chars(norm(plains[k]).replace("|", ""), norm(labeled[k]).replace("|", ""))
            row["table_conversion_lost_chars"] = lost
            row["table_conversion_lost_top"] = top
        if k in plains and k in pdfs:
            oa, ob, ta, tb = same_chars(norm(plains[k]), norm(pdfs[k]))
            row.update({"chars": len(norm(plains[k])), "only_hwp": oa, "only_pdf": ob, "top_only_hwp": ta, "top_only_pdf": tb})
        elif k not in pdfs:
            row["pdf"] = "PDF 판 없음"
        out.append(row)
    return out


if __name__ == "__main__":
    main()
