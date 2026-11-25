import { describe, expect, it, vi } from 'vitest';

import { canAttach, canClose, canReopen, closeBody, fileProblem, putSigned, uploadConfirmed, uploadedPath } from './danchuRequester';

const req = (o: Partial<{ status: string; selected: boolean; compareOpen: boolean; outcome: string | null }> = {}) => ({
  status: 'replying',
  selected: false,
  compareOpen: false,
  outcome: null,
  ...o,
});

describe('선정 없이 마무리 (단추 /api/rfq/[no]/outcome 과 같은 규칙)', () => {
  it('선정 전이고 아직 열린 요청만 마무리할 수 있다', () => {
    expect(canClose(req())).toBe(true);
    expect(canClose(req({ selected: true }))).toBe(false);
    expect(canClose(req({ status: 'closed' }))).toBe(false);
    expect(canClose(req({ status: 'cancelled' }))).toBe(false);
  });
  it('외부 진행은 어느 기관과 하는지 적어야 한다', () => {
    expect(closeBody('외부 진행', '  ')).toEqual({ ok: false, error: '어느 기관과 진행하는지 적어 주세요' });
    expect(closeBody('외부 진행', ' 가나바이오 ')).toEqual({ ok: true, body: { outcome: '외부 진행', note: '가나바이오' } });
  });
  it('보류·취소는 메모 없이도 되고, 빈 메모는 싣지 않는다', () => {
    expect(closeBody('보류', '')).toEqual({ ok: true, body: { outcome: '보류' } });
    expect(closeBody('취소', '계획 변경')).toEqual({ ok: true, body: { outcome: '취소', note: '계획 변경' } });
  });
  it('사유를 고르지 않았거나 메모가 500자를 넘으면 막는다', () => {
    expect(closeBody(null, '').ok).toBe(false);
    expect(closeBody('보류', 'a'.repeat(501))).toEqual({ ok: false, error: '500자까지 적을 수 있어요' });
  });
});

describe('보류한 요청 다시 열기 (단추 /api/rfq/[no]/reopen)', () => {
  it('비교표가 열린 뒤 보류로 마무리한 요청만', () => {
    expect(canReopen(req({ status: 'closed', outcome: '보류', compareOpen: true }))).toBe(true);
    expect(canReopen(req({ status: 'closed', outcome: '보류', compareOpen: false }))).toBe(false);
    expect(canReopen(req({ status: 'closed', outcome: '외부 진행', compareOpen: true }))).toBe(false);
    expect(canReopen(req({ status: 'cancelled', outcome: '취소', compareOpen: true }))).toBe(false);
  });
  it('단추가 outcome 을 아직 보내지 않으면 버튼을 숨긴다', () => {
    expect(canReopen({ status: 'closed', selected: false, compareOpen: true })).toBe(false);
  });
});

describe('요청 첨부 (단추 /api/rfq/[no]/files/retry 와 같은 형식·크기)', () => {
  it('끝난 요청에는 첨부할 수 없다', () => {
    expect(canAttach(req())).toBe(true);
    expect(canAttach(req({ status: 'closed' }))).toBe(false);
    expect(canAttach(req({ status: 'cancelled' }))).toBe(false);
  });
  it('단추가 받는 형식의 20MB 이하 파일만', () => {
    expect(fileProblem('독성 계획.HWP', 1000)).toBeNull();
    expect(fileProblem('plan.pdf', 20 * 1024 * 1024)).toBeNull();
    expect(fileProblem('plan.pdf', 20 * 1024 * 1024 + 1)).toBe('20MB 이하 파일만 올릴 수 있어요');
    expect(fileProblem('plan.zip', 10)).toBe('PDF, 그림, 워드, 엑셀, 한글 파일만 올릴 수 있어요');
    expect(fileProblem('plan.pdf', 0)).toBe('빈 파일은 올릴 수 없어요');
  });
  it('단추가 준 올릴 주소에서 경로를 꺼낸다(이미 올린 파일이면 null)', () => {
    expect(uploadedPath({ name: 'a.pdf', path: 'R-1/x.pdf', signedUrl: 'https://s/u' })).toEqual({ path: 'R-1/x.pdf', signedUrl: 'https://s/u' });
    expect(uploadedPath({ uploaded: true })).toBeNull();
    expect(uploadedPath(null)).toBeNull();
    expect(uploadedPath({ path: 'R-1/x.pdf', signedUrl: 'http://not-https' })).toBeNull();
  });
  it('단추가 저장소에서 파일을 찾아 확인했을 때만 올린 것으로 본다', () => {
    expect(uploadConfirmed({ confirmed: 1, complete: true })).toBe(true);
    expect(uploadConfirmed({ confirmed: 0, complete: false })).toBe(false);
    expect(uploadConfirmed({ confirmed: 0 })).toBe(false);
    expect(uploadConfirmed(null)).toBe(false);
  });
  it('파일을 서명 주소로 PUT 하고 실패하면 던진다', async () => {
    const blob = new Blob(['x']);
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === 'file:///a.pdf') return new Response(blob);
      expect(init?.method).toBe('PUT');
      expect((init?.headers as Record<string, string>)['content-type']).toBe('application/pdf');
      return new Response(null, { status: url.endsWith('ok') ? 200 : 400 });
    });
    await expect(putSigned('https://s/ok', { uri: 'file:///a.pdf', mime: 'application/pdf' }, f as unknown as typeof fetch)).resolves.toBeUndefined();
    await expect(putSigned('https://s/bad', { uri: 'file:///a.pdf', mime: 'application/pdf' }, f as unknown as typeof fetch)).rejects.toThrow();
  });
});
