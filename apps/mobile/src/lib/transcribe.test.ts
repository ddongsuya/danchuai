// 회의 녹음 전사(lib/transcribe.ts): Deepgram 응답 읽기, 파일 형식, 길이 어림, 보내는 모양
import { describe, expect, it } from 'vitest';

import { audioMime, minutesFromSize, SttError, sttFailureOf, transcribe, transcriptOf } from './transcribe';

const dg = (transcript: string, paragraphs?: string) => ({ results: { channels: [{ alternatives: [{ transcript, ...(paragraphs ? { paragraphs: { transcript: paragraphs } } : {}) }] }] } });

describe('전사본 읽기', () => {
  it('화자 문단이 있으면 그것을 쓰고 화자 번호를 1부터', () => {
    expect(transcriptOf(dg('일정은 12월 초로 하죠 네', '\nSpeaker 0: 일정은 12월 초로 하죠.\n\n\n\nSpeaker 1: 네.'))).toBe('화자 1: 일정은 12월 초로 하죠.\n\n화자 2: 네.');
  });
  it('문단이 없으면 전체 글, 글이 없으면 null', () => {
    expect(transcriptOf(dg(' 다음 주에 보내 드릴게요 '))).toBe('다음 주에 보내 드릴게요');
    expect(transcriptOf(dg(''))).toBeNull();
    expect(transcriptOf(null)).toBeNull();
    expect(transcriptOf({ results: {} })).toBeNull();
  });
});

describe('파일', () => {
  it('형식: 받은 형식이 audio/ 이면 그대로, 아니면 확장자로', () => {
    expect(audioMime('a.m4a', null)).toBe('audio/mp4');
    expect(audioMime('a.MP3')).toBe('audio/mpeg');
    expect(audioMime('a.webm', 'audio/webm')).toBe('audio/webm');
    expect(audioMime('a.bin', 'application/octet-stream')).toBe('audio/*');
  });
  it('길이 어림: 64kbps, 1분 이상, 상한까지', () => {
    expect(minutesFromSize(0)).toBe(1);
    expect(minutesFromSize(480_000 * 30)).toBe(30);
    expect(minutesFromSize(480_000 * 500)).toBe(180);
  });
});

describe('보내기', () => {
  const ticket = { provider: 'deepgram' as const, token: 'jwt', expiresIn: 120, url: 'https://api.deepgram.com/v1/listen?language=ko' };
  it('녹음을 전사 서비스로 바로 보내고(Bearer 임시 토큰) 글을 돌려준다', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.startsWith('file:')) return new Response(new Blob(['x']));
      return new Response(JSON.stringify(dg('회의 내용')), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await transcribe(ticket, { uri: 'file:///rec.m4a', mime: 'audio/mp4' }, f)).toBe('회의 내용');
    expect(calls[1]!.url).toBe(ticket.url);
    expect(calls[1]!.init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer jwt', 'content-type': 'audio/mp4' } });
  });
  it('실패 코드: 서비스 거절, 빈 글, 서버 404·413·429', async () => {
    const bad = (async (url: string) => (url.startsWith('file:') ? new Response(new Blob(['x'])) : new Response('no', { status: 401 }))) as unknown as typeof fetch;
    await expect(transcribe(ticket, { uri: 'file:///a', mime: 'audio/mp4' }, bad)).rejects.toMatchObject({ code: 'stt_failed' });
    const empty = (async (url: string) => (url.startsWith('file:') ? new Response(new Blob(['x'])) : new Response(JSON.stringify(dg(''))))) as unknown as typeof fetch;
    await expect(transcribe(ticket, { uri: 'file:///a', mime: 'audio/mp4' }, empty)).rejects.toMatchObject({ code: 'empty' });
    expect(sttFailureOf({ code: 'provider_error', status: 404 })).toBe('not_configured');
    expect(sttFailureOf({ code: 'provider_error', status: 413 })).toBe('too_long');
    expect(sttFailureOf({ code: 'usage_limit', status: 429 })).toBe('usage_limit');
    expect(sttFailureOf(new SttError('empty'))).toBe('empty');
  });
});
