"""가이드라인 원문을 받아 조항 단위 지식 파일(packages/knowledge/data/guidelines.json)을 만든다.

- 목록은 단추 가이드라인 자료실(export-danchu.mts 결과)의 LIBRARY 를 그대로 쓴다.
- ICH: 공식 PDF(database.ich.org). ICH 법적 고지에 따라 출처(ICH 저작권)를 밝히면 재사용할 수 있다.
- 식약처·농진청 고시, 법령: 국가법령정보센터 본문과 별표(HWP). 법령·고시는 저작권 보호 대상이 아니다(저작권법 제7조).
- OECD: 저작권이 있어 원문을 싣지 않는다. 자료실의 한 줄 설명과 공식 주소만 넣는다.

실행(Python 3.11+, 표준 라이브러리 + pdftotext):
  python3 -I scripts/knowledge/build_guidelines.py <캐시 폴더>
캐시 폴더에 받은 원문을 두고 다시 실행하면 내려받지 않는다.
"""
import hashlib, html, json, os, re, subprocess, sys, time, urllib.parse, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hwp5text import hwp_text  # noqa: E402

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

def ich_qa_table(path):
    """표 형식 Q&A(조항 | 질문 | 답, 예: M10 Q&A). 제목 번호가 없어 ich_chunks가 0개를 낸다.
    pdftotext -bbox 낱말 좌표로 칸을 나누고, 머리줄 'Guideline Questions Answers'의 x 위치를 칸 경계로 쓴다."""
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        out = os.path.join(d, "b.html")
        subprocess.run(["pdftotext", "-bbox", path, out], check=True, capture_output=True)
        src = open(out, encoding="utf-8").read()
    rows, cols = [], None
    for page in src.split("<page")[1:]:
        ws = [(float(a), float(b), html.unescape(w)) for a, b, w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)</word>', page)]
        ws = [w for w in ws if w[1] > 70]  # 쪽 머리(날짜·문서 이름) 빼기
        top = 0
        for x, y, w in ws:
            if w != "Guideline":
                continue
            q = [v for v in ws if v[2] == "Questions" and abs(v[1] - y) < 3]
            a = [v for v in ws if v[2] == "Answers" and abs(v[1] - y) < 3]
            if q and a:
                cols, top = (q[0][0] - 5, a[0][0] - 5), y + 20
                break
        if not cols:
            continue
        lines = {}
        for x, y, w in ws:
            if y >= top:
                lines.setdefault(round(y), []).append((x, w))
        for y in sorted(lines):
            ln = sorted(lines[y])
            sec = [w for x, w in ln if x < cols[0]]
            if sec and re.match(r"^[\d.,]+$", sec[0]):
                rows.append([" ".join(sec), [], []])
            elif sec and rows:
                rows[-1][0] += " " + " ".join(sec)
            if rows:
                rows[-1][1] += [w for x, w in ln if cols[0] <= x < cols[1]]
                rows[-1][2] += [w for x, w in ln if x >= cols[1]]
    out = []
    for sec, q, a in rows:
        if q and a:
            out += [(f"Q&A (본문 {sec.strip()})"[:80], p) for p in split_long(f"Q: {' '.join(q)}\nA: {' '.join(a)}")]
    return out


def ich_tables(path):
    """표는 pdftotext 기본 모드에서 칸 순서가 섞인다(M3 표 1의 설치류·비설치류). 배치 보존 모드로 표만 따로 조각을 만든다.
    칸 사이 넓은 빈칸을 ' | '로 바꾼다."""
    lay = subprocess.run(["pdftotext", "-enc", "UTF-8", "-layout", path, "-"], capture_output=True, check=True).stdout.decode("utf-8", "ignore")
    lines = lay.replace("\f", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        m = re.match(r"^\s*(Table\s+\d+[A-Z]?)\.?\s+(\S.*)$", lines[i])
        if m and not re.search(r"\.{5,}", lines[i]):
            title = re.sub(r"\s{2,}", " ", f"{m.group(1)} {m.group(2)}").strip()
            rows, blank, j = [], 0, i + 1
            while j < len(lines) and len(rows) < 60:
                l = lines[j]
                if not l.strip():
                    blank += 1
                    if blank >= 3 and rows:
                        break
                    j += 1
                    continue
                blank = 0
                if re.match(r"^\s*(\d+\.(\d+\.?)*\s+[A-Z]|Table\s+\d+)", l) and rows:
                    break
                rows.append(re.sub(r"\s{3,}", " | ", l.strip()))
                j += 1
            txt = "\n".join(rows).strip()
            if len(txt) > 40:
                out += [(title[:80], p) for p in split_long(txt)]
            i = j
        else:
            i += 1
    return out


def pdf_text(b, cache, name):
    p = os.path.join(cache, name)
    if not os.path.exists(p):
        open(p, "wb").write(b)
    return subprocess.run(["pdftotext", "-enc", "UTF-8", p, "-"], capture_output=True, check=True).stdout.decode("utf-8", "ignore")


HEAD = re.compile(r"^(\d+\.(?:\d+\.?){0,3}|[IVX]+\.|Note \d+|Annex \d+|Appendix \d+|PART [IVX]+:?)\s+([A-Z][A-Za-z0-9 ,;:()/'’\-–&]+)$")
NUM_ONLY = re.compile(r"^(\d+\.(?:\d+\.?){0,3}|[IVX]+\.)$")


def toc_titles(lines):
    """목차(점선 줄)의 제목들. 번호가 그림으로 찍혀 본문에서 빠진 절 제목(예: S5 4.1~4.3)을 찾는 데 쓴다."""
    out, buf = set(), ""
    for l in lines:
        s = l.strip()
        if not s:
            buf = ""
            continue
        t = re.sub(r"^(\d+\.(?:\d+\.?){0,3}|[IVX]+\.)\s*", "", s)
        if re.search(r"\.{5,}\s*\d*$|\.{3,}\s*\d+$", s):
            t = re.sub(r"\s*\.{3,}\s*\d*$", "", t)
            full = re.sub(r"[^A-Z0-9]", "", (buf + " " + t).upper())
            if len(full) >= 12:
                out.add(full)
            buf = ""
        elif s.isupper() and len(s) < 90:
            buf = (buf + " " + t).strip()
        else:
            buf = ""
    return out


def ich_chunks(text):
    lines = [l.rstrip() for l in text.replace("\f", "\n").split("\n")]
    toc = toc_titles(lines)
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
    def toc_head(s):  # 번호 없이 찍힌 절 제목
        if not toc or len(s) > 110 or not s[:1].isupper() or s.endswith((".", ",", ";")) or NUM_ONLY.match(s) or HEAD.match(s):
            return False
        k = re.sub(r"[^A-Z0-9]", "", s.upper())
        return len(k) >= 12 and any(t == k for t in toc)
    sections, cur, label = [], [], None
    for s in body:
        m = HEAD.match(s)
        if (m and len(s) < 110) or toc_head(s):
            if cur:
                sections.append((label, cur))
            label, cur = s, []
        else:
            cur.append(s)
    if cur:
        sections.append((label, cur))
    # 번호 없는 절 제목에 번호를 붙인다: 바로 다음 번호 제목이 "4.1.1"이면 "4.1"
    labels = [lb for lb, _ in sections]
    for i, lb in enumerate(labels):
        if lb is None or HEAD.match(lb):
            continue
        nxt = next((x for x in labels[i + 1:] if x and HEAD.match(x)), None)
        prev = next((x for x in reversed(labels[:i]) if x and HEAD.match(x)), None)
        mn = re.match(r"^(\d+)\.(\d+)\.\d+", nxt or "")
        if mn:
            cand = f"{mn.group(1)}.{mn.group(2)}"
            pv = re.match(r"^(\d+(?:\.\d+)*)", prev or "")
            if not pv or not pv.group(1).rstrip(".").startswith(cand):
                sections[i] = (f"{cand} {lb}", sections[i][1])
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



# ---------- 식약처 민원인 안내서 ----------
# mfds.go.kr은 해외 접속을 끊어서 사용자 PC 크롬으로 받아 텍스트로 바꾼 것을 읽는다
# (브랜치 claude/mfds-guides-text 의 data-staging/mfds-guides/text). 목록·이름은 mfds-guides.json.
MFDS_VIEW = "https://www.mfds.go.kr/brd/m_1060/view.do?seq="
GUIDE_TOP = re.compile(r"^\s*(제\s*\d+\s*[장편]\s*\S.*|[IVXⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]{1,4}\s*\.\s*\S.*|부\s*록.*|별\s*첨.*|참고\s*문헌.*)$")
GUIDE_SUB = re.compile(r"^\s*(제\s*\d+\s*절\s*\S.*|제\d+조(의\d+)?\(.+?\).*|[1-9]\d?(\.\d{1,2}){0,2}\.?\s+[^\d\s].*|Q\s*\d+[.):]?\s*\S.*)$")
GUIDE_TOC = re.compile(r"(·{3,}|\.{4,}|…{2,}|-{4,})|\s\d{1,3}\s*$")
def head_label(line, n=40):
    line = re.sub(r"\s+", " ", line.strip())
    m = re.match(r"^(\S+\s+[^.。]{0,%d}?)(?=\s[가-힣A-Za-z(]+\s.*(다\.|요\.|한다|이다)|$)" % n, line)
    s = line[:n]
    if len(line) > n:
        cut = s.rfind(" ")
        s = s[:cut] if cut > 10 else s
    return s
def guide_chunks(text, size=MAX_CHUNK):
    """민원인 안내서: 장(로마 숫자·제N장)과 절(N., N.N, 제N조, Q)로 나눈다. 목차 줄은 제목으로 보지 않는다."""
    lines = text.replace("\f", "\n").split("\n")
    top, segs, cur_label, buf = "", [], "앞부분", []
    def flush():
        t = "\n".join(l for l in buf if l.strip()).strip()
        if t:
            segs.append([cur_label, t])
    for ln in lines:
        s = ln.strip()
        if not s:
            buf.append(""); continue
        is_toc = bool(re.search(r"·{3,}|\.{4,}|…{2,}", s)) or (bool(GUIDE_TOC.search(s)) and len(s) < 90)
        if not is_toc and GUIDE_TOP.match(s) and len(s) < 60:
            flush(); buf = [s]; top = head_label(s, 30); cur_label = top; continue
        if not is_toc and GUIDE_SUB.match(s):
            flush(); buf = [s]; sub = head_label(s); cur_label = f"{top} {sub}".strip() if top and not sub.startswith(top) else sub; continue
        buf.append(s)
    flush()
    # 짧은 절은 앞 절에 붙인다(정의 목록 1. 2. 3. 이 조각마다 갈라지지 않게)
    merged = []
    for lab, t in segs:
        if merged and len(t) < 300 and len(merged[-1][1]) + len(t) < 1200:
            merged[-1][1] += "\n" + t
        else:
            merged.append([lab, t])
    out = []
    for lab, t in merged:
        for p in split_long(t, size):
            out.append((lab, p))
    return out


def mfds_guides(text_dir):
    lst = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "mfds-guides.json"), encoding="utf-8"))
    idx_path = os.path.join(os.path.dirname(os.path.normpath(text_dir)), "index.json")
    methods = {}
    if os.path.exists(idx_path):
        for f in json.load(open(idx_path, encoding="utf-8")).get("files", []):
            methods[os.path.basename(f.get("text", ""))] = f.get("method", "")
    docs = []
    for e in lst:
        e = {**e, "ocr": "ocr" in methods.get(e["file"], "")}
        path = os.path.join(text_dir, e["file"])
        txt = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        m = re.search(r"(20\d\d)\s*[.년]\s*(\d{1,2})", txt[:3000])
        version = f"{m.group(1)}.{int(m.group(2)):02d}" if m else ""
        got = guide_chunks(txt) if len(re.sub(r"\s", "", txt)) > 2000 else []
        docs.append((e, version, got))
    return docs


# ---------- 국가법령정보센터 ----------

def law_doc(url, cache):
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
        cls = re.search(r"bylClsCd=(\d+)", href)
        if cls and cls.group(1) not in ("200201", "110201"):  # 별지(서식)는 받지 않는다
            continue
        nm = re.search(r"flNm=([^&]*)", href)
        name = urllib.parse.unquote_plus(nm.group(1)) if nm else ""
        if not name:  # 법령 본문은 링크에 파일 이름이 없다. 바로 앞 글에서 [별표 N] 제목을 찾는다
            ctx = html.unescape(re.sub(r"<[^>]+>", " ", raw[max(0, m.start() - 1500):m.start()]))
            t = re.findall(r"\[별표[^\]]*\][^\n\[]{0,80}", ctx)
            name = re.sub(r"\s+", " ", t[-1]).strip() if t else ""
        try:
            b = get(f"{LAW}/LSW/{href}", cache, f"fl-{fl}.bin")
        except RuntimeError:
            continue
        p = os.path.join(cache, f"fl-{fl}.bin")
        try:
            if b[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":  # HWP(OLE)
                files.append((name, hwp_text(p)))
            elif b[:2] == b"PK":  # HWPX(압축 XML). 2024년 이후 고시 별표는 대부분 이 형식
                files.append((name, hwpx_text(p)))
        except Exception:
            continue
    return version, text, files


def hwpx_text(path):
    """HWPX 본문 글자. 표는 한 행을 ' | '로 이어 한 줄로 둔다(○△× 표가 뜻을 잃지 않게)."""
    z = zipfile.ZipFile(path)
    secs = sorted((n for n in z.namelist() if re.match(r"Contents/section\d+\.xml$", n)), key=lambda n: int(re.findall(r"\d+", n)[0]))
    out = []
    for n in secs:
        x = z.read(n).decode("utf-8", "ignore")
        # 표를 먼저 행 단위 글로 바꾼다(안쪽 표부터)
        while True:
            m = re.search(r"<hp:tbl\b(?:(?!<hp:tbl\b).)*?</hp:tbl>", x, re.S)
            if not m:
                break
            rows = []
            for tr in re.findall(r"<hp:tr\b.*?</hp:tr>", m.group(0), re.S):
                cells = [re.sub(r"\s+", " ", "".join(re.findall(r"<hp:t\b[^>]*>([^<]*)</hp:t>", tc))).strip() for tc in re.findall(r"<hp:tc\b.*?</hp:tc>", tr, re.S)]
                if any(cells):
                    rows.append(" | ".join(cells))
            x = x[:m.start()] + "<hp:t>" + html.escape("\n".join(rows)) + "</hp:t></hp:p>" + x[m.end():]
        x = re.sub(r"</hp:p>", "\n", x)
        parts = re.findall(r"<hp:t\b[^>]*>([^<]*)</hp:t>|(\n)", x)
        out.append(html.unescape("".join(a or b for a, b in parts)))
    return re.sub(r"\n\s*\n+", "\n", "\n".join(out))


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
    for fname, f in files:
        f = re.sub(r"\n{2,}", "\n", f).strip()
        lines = f.split("\n")
        # 제목: 파일 첫 몇 줄의 "[별표 N] 제목"(법령 별표는 앞에 "■ 법령 이름"이 붙는다). 없으면 내려받기 링크의 파일 이름
        m, head = None, 0
        for i, l in enumerate(lines[:4]):
            m = re.search(r"\[(별표\s*[\d의]*|별지[^\]]*)\]\s*(.*)", l)
            if m:
                head = i + 1
                break
        if not m:
            m = re.match(r"^\[(별표\s*[\d의]*|별지[^\]]*)\]\s*(.*)", fname or "")
        if not m:
            continue
        name = re.sub(r"\s+", "", m.group(1))
        sub = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        if not sub and head < len(lines):  # 제목이 다음 줄에 있는 경우
            sub = lines[head].strip(); head += 1
        title = f"{name} {sub}".strip() if sub else (fname or name)
        if title in titles or name.startswith("별지") or not relevant(title):
            continue
        titles.add(title)
        # 큰 별표(의료기기 기준처럼 수백 쪽)는 장·절 제목을 따라 나눈다
        big = len(f) > 60000 and len(re.findall(r"^\s*제\d+장", f, re.M)) >= 3  # 장으로 나뉜 큰 별표만
        chap, sec_, part = "", "", []
        def label():
            return re.sub(r"\s+", " ", f"{name} {chap} {sec_}" if big and (chap or sec_) else title).strip()
        plabel = label()
        for l in lines[head:]:
            s2 = l.strip()
            if big and re.search(r"[가-힣)]\s*\d{1,3}$", s2) and len(s2) < 70:  # 목차 줄: "제5장 : 세포독성시험87"
                part.append(s2)
                continue
            if big and re.match(r"^제\d+장\s*:?\s*\S", s2) and len(s2) < 60 and not re.search(r"\t\s*\d+$", l):
                if part:
                    out += [(plabel, p) for p in split_long("\n".join(part))]
                    part = []
                chap, sec_ = re.sub(r"\s*:\s*", " ", s2), ""
                plabel = label()
                continue
            if big and re.match(r"^\d+(\.\d+){0,3}\.?\s+[가-힣A-Za-z(]", s2) and len(s2) < 60 and not re.search(r"\t\s*\d+$", l):
                if part and len("\n".join(part)) > 300:
                    out += [(plabel, p) for p in split_long("\n".join(part))]
                    part = []
                sec_ = s2
                if not part:
                    plabel = label()
            mm = re.match(r"^\s*([①-⑳]|\d{1,2}\.)\s", l)
            if not big and mm and part and len("\n".join(part)) > 300:
                out += [(plabel, p) for p in split_long("\n".join(part))]
                part = []
            part.append(s2)
        if part:
            out += [(plabel, p) for p in split_long("\n".join(part))]
    out = [(lb, p) for lb, t in out for p in split_long(t)]
    return [(lb, t) for lb, t in out if len(t.strip()) > 20 and not ADDENDA.search(lb)]


ADDENDA = re.compile(r"\((시행일|적용례|경과조치|재검토기한|유효기간|다른 법령의 개정|일반적 경과조치)\)")


# 자료실이 목록 페이지로 연결한 문서의 공식 PDF
PDF_URL = {"ICH S1B": "https://database.ich.org/sites/default/files/S1B-R1_FinalGuideline_2022_0719.pdf"}

# 자료실(LIBRARY)에 없는 비임상 ICH 문서. 2026-11-18 ICH 사이트 목록과 대조한 현행판
_I = "https://database.ich.org/sites/default/files/"
EXTRA = [
    {"short": "ICH S1C", "name": "ICH S1C(R2) 의약품 발암성시험 용량 선택", "by": "ICH", "about": "발암성시험 고용량 설정 기준", "url": _I + "S1C%28R2%29%20Guideline.pdf", "topic": "carc", "products": ["drug"]},
    {"short": "ICH S3B", "name": "ICH S3B 반복투여 조직분포시험", "by": "ICH", "about": "반복투여 조직분포시험이 필요한 경우", "url": _I + "S3B_Guideline.pdf", "topic": "tk", "products": ["drug"]},
    {"short": "ICH S3A Q&A", "name": "ICH S3A 질의응답(미량 채혈)", "by": "ICH", "about": "독성동태 미량 채혈", "url": _I + "S3A_Q%26As_Q%26As.pdf", "topic": "tk", "products": ["drug", "bio"]},
    {"short": "ICH M3 Q&A", "name": "ICH M3(R2) 질의응답", "by": "ICH", "about": "M3 적용 사례 질의응답", "url": _I + "M3_R2_Q%26As_R2_Q%26As_0.pdf", "topic": "plan", "products": ["drug", "bio"]},
    {"short": "ICH S9 Q&A", "name": "ICH S9 질의응답", "by": "ICH", "about": "항암제 비임상 평가 질의응답", "url": _I + "S9_Q%26As_Q%26As.pdf", "topic": "product", "products": ["drug", "bio"]},
    {"short": "ICH E14/S7B Q&A", "name": "ICH E14/S7B 질의응답(R1)", "by": "ICH", "about": "QT 위험 통합 평가, 비임상 hERG·체내 QT 시험 모범 사례", "url": _I + "ICH%20E14_S7B%20Q%26As%28R1%29%202026_2008.pdf", "topic": "safety", "products": ["drug"]},
    {"short": "ICH M7", "name": "ICH M7(R2) 변이원성 불순물 평가와 관리", "by": "ICH", "about": "DNA 반응성 불순물의 평가·허용 기준", "url": _I + "ICH_M7%28R2%29_Guideline_Step4_2023_0216_0.pdf", "topic": "geno", "products": ["drug"]},
    {"short": "ICH M7 Q&A", "name": "ICH M7(R2) 질의응답", "by": "ICH", "about": "변이원성 불순물 질의응답", "url": _I + "M7R2_QAs_Step3_2022_0517-Error%20Corrected.pdf", "topic": "geno", "products": ["drug"]},
    {"short": "ICH M10 Q&A", "name": "ICH M10 질의응답", "by": "ICH", "about": "생체시료 분석법 밸리데이션 질의응답", "url": _I + "ICH_M10_QAs_2022_1111.pdf", "topic": "tk", "products": ["drug", "bio"]},
    {"short": "ICH M12 Q&A", "name": "ICH M12 질의응답", "by": "ICH", "about": "약물상호작용 시험 질의응답", "url": _I + "ICH_M12_Step4_Q%26As_2023_0521.pdf", "topic": "tk", "products": ["drug"]},
]

SKIP_BYL = re.compile(r"수수료|행정처분|과태료|서식|위반행위|신청서|지정서|감독")


def main():
    cache = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, ".knowledge-cache"))
    os.makedirs(cache, exist_ok=True)
    exp = json.load(open(os.path.join(DATA, "danchu-export.raw.json"), encoding="utf-8"))
    docs, chunks, gaps = [], [], []
    for d in exp["library"]["LIBRARY"] + EXTRA:
        url, short = PDF_URL.get(d["short"], d["url"]), d["short"]
        meta = {"short": short, "name": d["name"], "by": d["by"], "about": d["about"], "url": url, "topic": d["topic"], "products": d["products"]}
        got = []
        version = ""
        try:
            if url.startswith("https://database.ich.org/") and url.endswith(".pdf"):
                b = get(url, cache, "ich-" + key(url) + ".pdf")
                text = pdf_text(b, cache, "ich-" + key(url) + ".pdf")
                m = re.search(r"(Current )?Step 4 version\s*\n?\s*dated ([0-9A-Za-z ]+\d{4})", text)
                version = f"Step 4, {m.group(2).strip()}" if m else "Step 4"
                pdf = os.path.join(cache, "ich-" + key(url) + ".pdf")
                got = ich_chunks(text) or ich_qa_table(pdf)
                got += ich_tables(pdf)
                meta["license"] = "© ICH. 원문을 조항 단위로 나눈 것이며 내용은 바꾸지 않았다."
                meta["lang"] = "en"
            elif url.startswith(LAW):
                version, text, files = law_doc(url, cache)
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
    guide_dir = os.environ.get("MFDS_GUIDES_DIR")
    if guide_dir:
        for e, version, got in mfds_guides(guide_dir):
            short = "식약처 " + e["name"]
            meta = {"short": short, "name": e["name"], "by": "식품의약품안전처", "about": "민원인 안내서 (" + e["group"] + ")", "url": MFDS_VIEW + str(e["seq"]),
                    "topic": "guide", "products": [], "lang": "ko", "version": version, "chunks": len(got),
                    "license": "공공저작물(저작권법 제24조의2). 식약처 민원인 안내서 원문을 조항 단위로 나눈 것이며 내용은 바꾸지 않았다."}
            if e["ocr"]:
                meta["license"] += " 스캔본을 OCR로 읽은 글이라 글자 오류가 있을 수 있어 수치는 원본으로 확인한다."
            if not got:
                meta["license"] = "원문 미수록(스캔본 또는 암호화 문서). 공식 주소만 연결"
                gaps.append(e["name"])
            docs.append(meta)
            for i, (label, text) in enumerate(got):
                chunks.append({"id": f"{key(short + e['file'])}-{i}", "doc": short, "section": label[:80], "text": text})
            print(f"{short:28} {len(got):4} 조각 {version}", file=sys.stderr)
    out = {"builtAt": time.strftime("%Y-%m-%d"), "source": exp["source"], "docs": docs, "chunks": chunks, "gaps": gaps}
    json.dump(out, open(os.path.join(DATA, "guidelines.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("완료", len(docs), "문서", len(chunks), "조각", "원문 없음:", gaps, file=sys.stderr)


if __name__ == "__main__":
    main()
