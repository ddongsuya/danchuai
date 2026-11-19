"""HWP 5.0 문서에서 본문 글자만 뽑는다(표준 라이브러리만 사용). 국가법령정보센터 별표 파일용.
사용: python3 -I hwp5text.py 파일.hwp > 결과.txt"""
import struct, sys, zlib

def cfb_streams(data):
    ss = 1 << struct.unpack_from('<H', data, 30)[0]
    mss = 1 << struct.unpack_from('<H', data, 32)[0]
    dir_start = struct.unpack_from('<I', data, 48)[0]
    cutoff = struct.unpack_from('<I', data, 56)[0]
    minifat_start, = struct.unpack_from('<I', data, 60)
    difat_start, n_difat = struct.unpack_from('<II', data, 68)
    def sec(i):
        o = 512 + i * ss
        return data[o:o + ss]
    difat = list(struct.unpack_from('<109I', data, 76))
    s = difat_start
    for _ in range(n_difat):
        if s >= 0xFFFFFFFA: break
        b = sec(s); vals = struct.unpack('<%dI' % (ss // 4), b)
        difat += vals[:-1]; s = vals[-1]
    fat = []
    for d in difat:
        if d >= 0xFFFFFFFA: continue
        fat += struct.unpack('<%dI' % (ss // 4), sec(d))
    def chain(start, table):
        out = []; s = start; seen = set()
        while s < 0xFFFFFFFA and s not in seen and s < len(table):
            seen.add(s); out.append(s); s = table[s]
        return out
    def read(start, size=None):
        b = b''.join(sec(i) for i in chain(start, fat))
        return b if size is None else b[:size]
    dirdata = read(dir_start)
    entries = []
    for i in range(len(dirdata) // 128):
        e = dirdata[i * 128:(i + 1) * 128]
        nl = struct.unpack_from('<H', e, 64)[0]
        name = e[:max(nl - 2, 0)].decode('utf-16le', 'ignore')
        typ = e[66]
        left, right, child = struct.unpack_from('<III', e, 68)
        start, size = struct.unpack_from('<IQ', e, 116)
        entries.append(dict(name=name, typ=typ, left=left, right=right, child=child, start=start, size=size & 0xFFFFFFFF))
    root = entries[0]
    ministream = read(root['start'], root['size'])
    minifat = []
    if minifat_start < 0xFFFFFFFA:
        mb = read(minifat_start); minifat = list(struct.unpack('<%dI' % (len(mb) // 4), mb))
    def read_entry(e):
        if e['size'] < cutoff:
            return b''.join(ministream[i * mss:(i + 1) * mss] for i in chain(e['start'], minifat))[:e['size']]
        return read(e['start'], e['size'])
    out = {}
    def walk(idx, prefix):
        if idx >= len(entries) or idx == 0xFFFFFFFF: return
        e = entries[idx]
        walk(e['left'], prefix); walk(e['right'], prefix)
        path = prefix + e['name']
        if e['typ'] == 2: out[path] = lambda e=e: read_entry(e)
        elif e['typ'] == 1: walk(e['child'], path + '/')
    walk(root['child'], '')
    return out

EXT = {1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23}

def para_text(b):
    out = []; i = 0; n = len(b) // 2
    while i < n:
        c = struct.unpack_from('<H', b, i * 2)[0]
        if c in EXT: i += 8; continue
        if c in (10, 13): out.append('\n')
        elif c == 9: out.append('\t')
        elif c >= 32: out.append(chr(c))
        i += 1
    # 한 글자씩 chr 로 만든 서로게이트 쌍을 제 글자로 합친다
    return ''.join(out).encode('utf-16le', 'surrogatepass').decode('utf-16le', 'replace')

def hwp_text(path):
    data = open(path, 'rb').read()
    st = cfb_streams(data)
    flags = struct.unpack_from('<I', st['FileHeader'](), 36)[0]
    compressed = flags & 1
    secs = sorted((k for k in st if k.startswith('BodyText/Section')), key=lambda k: int(k.split('Section')[1]))
    texts = []
    for k in secs:
        b = st[k]()
        if compressed: b = zlib.decompress(b, -15)
        p = 0
        while p + 4 <= len(b):
            h = struct.unpack_from('<I', b, p)[0]; p += 4
            tag = h & 0x3FF; size = (h >> 20) & 0xFFF
            if size == 0xFFF: size = struct.unpack_from('<I', b, p)[0]; p += 4
            if tag == 67: texts.append(para_text(b[p:p + size]))
            p += size
    return ''.join(texts)

# ---------- 표를 칸 위치대로 읽기 ----------
# hwp_text 는 표 칸을 한 줄씩 늘어놓아 어느 행·열의 값인지 알 수 없다(품목허가 규정 별표 1의 ○△× 표).
# hwp_blocks 는 문단과 표를 차례대로 돌려주고, 표는 칸마다 (행, 열, 행 병합, 열 병합, 글)을 준다.

def _records(path):
    data = open(path, 'rb').read()
    st = cfb_streams(data)
    flags = struct.unpack_from('<I', st['FileHeader'](), 36)[0]
    secs = sorted((k for k in st if k.startswith('BodyText/Section')), key=lambda k: int(k.split('Section')[1]))
    recs = []
    for k in secs:
        b = st[k]()
        if flags & 1: b = zlib.decompress(b, -15)
        p = 0
        while p + 4 <= len(b):
            h = struct.unpack_from('<I', b, p)[0]; p += 4
            tag = h & 0x3FF; lvl = (h >> 10) & 0x3FF; size = (h >> 20) & 0xFFF
            if size == 0xFFF: size = struct.unpack_from('<I', b, p)[0]; p += 4
            recs.append((tag, lvl, b[p:p + size])); p += size
    return recs

PARA_HEADER, PARA_TEXT, CTRL_HEADER, LIST_HEADER = 66, 67, 71, 72

def _paras(recs, i, lvl):
    """lvl 수준의 문단들을 읽는다. 문단 안 컨트롤(표·각주 등)은 문단 글 뒤에 둔다."""
    blocks = []
    while i < len(recs) and recs[i][1] == lvl and recs[i][0] == PARA_HEADER:
        i += 1
        text, ctrl_blocks = '', []
        while i < len(recs) and recs[i][1] > lvl:
            tag, l, d = recs[i]
            if l == lvl + 1 and tag == PARA_TEXT:
                text += para_text(d); i += 1
            elif l == lvl + 1 and tag == CTRL_HEADER:
                cid = d[:4][::-1]; i += 1
                if cid == b'tbl ':
                    cells, i = _table(recs, i, lvl + 2)
                    ctrl_blocks.append(('table', cells))
                elif cid == b'tdut':  # 덧말(글자 위 작은 글, 예: ○ 위의 *). 본문 글자 뒤에 덧말을 붙인다
                    try:
                        n1 = struct.unpack_from('<H', d, 4)[0]
                        main = d[6:6 + 2 * n1].decode('utf-16le', 'ignore')
                        o = 6 + 2 * n1
                        n2 = struct.unpack_from('<H', d, o)[0]
                        sub = d[o + 2:o + 2 + 2 * n2].decode('utf-16le', 'ignore')
                        text += main + sub
                    except struct.error:
                        pass
                    while i < len(recs) and recs[i][1] >= lvl + 2:
                        i += 1
                elif cid == b'eqed':  # 수식: HWPTAG_EQEDIT(88)의 스크립트를 글로 남긴다
                    while i < len(recs) and recs[i][1] >= lvl + 2:
                        if recs[i][0] == 88 and len(recs[i][2]) >= 6:
                            n = struct.unpack_from('<H', recs[i][2], 4)[0]
                            script = recs[i][2][6:6 + 2 * n].decode('utf-16le', 'ignore')
                            text += '[수식: ' + ' '.join(script.replace('`', ' ').replace('~', ' ').split()) + ']'
                        i += 1
                else:  # 각주·머리말·글상자·그림 설명 등 안의 문단(깊이가 제각각이다)
                    while i < len(recs) and recs[i][1] >= lvl + 2:
                        if recs[i][0] == PARA_HEADER:
                            sub, i = _paras(recs, i, recs[i][1]); ctrl_blocks += sub
                        else:
                            i += 1
            else:
                i += 1
        blocks.append(('p', text))
        blocks += ctrl_blocks
    return blocks, i

def _table(recs, i, cl):
    cells = []
    while i < len(recs) and recs[i][1] >= cl:
        tag, l, d = recs[i]
        if l == cl and tag == LIST_HEADER and len(d) >= 16:
            col, row, cs, rs = struct.unpack_from('<HHHH', d, 8)
            width = struct.unpack_from('<I', d, 16)[0] if len(d) >= 20 else 0
            sub, i = _paras(recs, i + 1, cl)
            cells.append((row, col, max(rs, 1), max(cs, 1), blocks_plain(sub), width))
        elif tag == PARA_HEADER and l > cl and cells:  # 칸 안 글상자 등 더 깊은 문단은 그 칸에 붙인다
            sub, i = _paras(recs, i, l)
            r_, c_, rs_, cs_, t_, w_ = cells[-1]
            cells[-1] = (r_, c_, rs_, cs_, (t_ + '\n' + blocks_plain(sub)).strip('\n'), w_)
        else:
            i += 1
    return cells, i

def blocks_plain(blocks):
    out = []
    for kind, v in blocks:
        if kind == 'p':
            out.append(v.strip('\n'))
        else:
            out.append(render_table(v))
    return '\n'.join(x for x in out if x.strip())

def hwp_blocks(path):
    recs = _records(path)
    blocks, i, out = [], 0, []
    while i < len(recs):
        if recs[i][1] == 0 and recs[i][0] == PARA_HEADER:
            b, i = _paras(recs, i, 0); out += b
        else:
            i += 1
    return out

def hwp_text_tables(path):
    """표를 '행 이름 | 열 이름: 값 | …' 줄로 바꾼 본문."""
    return blocks_plain(hwp_blocks(path))

def render_table(cells):
    """칸 목록 → 글. 왼쪽 위 칸이 차지하는 행·열을 머리 행·이름 열로 본다(국내 고시 표의 관행).
    열이 4개 이상이면 값마다 그 열의 머리 글을 붙이고, 그보다 작으면 행 단위로 ' | ' 로 잇는다.
    글자는 원문 그대로 쓰고 새 낱말을 넣지 않는다(빈칸은 '열 이름: ' 처럼 값 없이 둔다)."""
    if not cells:
        return ''
    cells = [tuple(x[:5]) + ((x[5] if len(x) > 5 and x[5] else 1000 * x[3]),) for x in cells]
    clean = lambda t: ' '.join(t.split())
    # 칸의 가로 위치: 행마다 왼쪽부터 칸 너비를 더한다(병합 칸은 처음 나온 행의 위치). 머리 칸과 값 칸을 실제 위치로 맞춘다
    xpos = {}
    for r in range(max(x[0] + x[2] for x in cells)):
        x = 0
        for cell in sorted((y for y in cells if y[0] <= r < y[0] + y[2]), key=lambda y: y[1]):
            xpos.setdefault(cell, x)
            x += cell[5]
    nrows = max(r + rs for r, c, rs, cs, t, *_ in cells)
    ncols = max(c + cs for r, c, rs, cs, t, *_ in cells)
    tl = next((x for x in cells if x[0] == 0 and x[1] == 0), None)
    if ncols < 4 or nrows < 3 or tl is None:
        rows = {}
        for r, c, rs, cs, t, *_ in sorted(cells):
            rows.setdefault(r, []).append(clean(t))
        return '\n'.join(' | '.join(v) for _, v in sorted(rows.items()) if any(v))
    H, L = tl[2], tl[3]
    if H >= nrows:
        H = 1
    hdr = [x for x in cells if x[0] < H and x[1] >= L and clean(x[4])]
    def group_title(x):  # 맨 위 행에서 여러 열을 덮는 묶음 제목("자료번호")은 열 이름에서 뺀다
        return H >= 3 and x[0] == 0 and x[3] >= 3 and x[0] + x[2] < H
    def overlap(h, v):
        return min(xpos[h] + h[5], xpos[v] + v[5]) - max(xpos[h], xpos[v])
    def path(v):
        """값 칸 위에 있는 머리 글(실제 가로 위치로 맞춘다). 층마다 가장 많이 겹치는 머리를 쓰고,
        두 머리가 비슷하게(80% 이상) 겹치면 '/'로 둘 다 적는다."""
        levels = []
        for r in range(H):
            cand = sorted(((overlap(x, v), x) for x in hdr if x[0] <= r < x[0] + x[2] and not group_title(x)), key=lambda z: -z[0])
            cand = [(o, x) for o, x in cand if o > 0]
            if not cand:
                continue
            best = cand[0][0]
            ts = []
            for o, x in sorted(cand, key=lambda z: z[1][1]):
                if o >= 0.8 * best and clean(x[4]) not in ts:
                    ts.append(clean(x[4]))
            if not levels or levels[-1] != ts:
                levels.append(ts)
        return ' '.join('/'.join(ts) for ts in levels)
    head = []
    for r in range(H):
        row = [clean(t) for rr, c, rs, cs, t, *_ in sorted(cells, key=lambda x: (x[0], x[1])) if rr == r and clean(t)]
        if row:
            head.append(' | '.join(row))
    out = ['[표 머리] ' + ' / '.join(head)] if head else []
    for r in range(H, nrows):
        label = [clean(t) for rr, c, rs, cs, t, *_ in sorted(cells, key=lambda x: x[1]) if c < L and rr <= r < rr + rs and clean(t)]
        vals = []
        for v in sorted(cells, key=lambda x: x[1]):
            rr, c, rs, cs, t = v[:5]
            if c >= L and rr <= r < rr + rs:
                vals.append((path(v), clean(t)))
        if not any(v for _, v in vals):
            if label:
                out.append(' '.join(label))
            continue
        out.append(' | '.join([' '.join(label)] + [f"{p_}: {v}" if p_ else v for p_, v in vals]))
    return '\n'.join(out)

if __name__ == '__main__':
    sys.stdout.write(hwp_text(sys.argv[1]))
