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

if __name__ == '__main__':
    sys.stdout.write(hwp_text(sys.argv[1]))
