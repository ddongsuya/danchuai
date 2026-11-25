import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { AgentHttpError } from '@/lib/agentClient';

export type Remote<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; code: 'network' | 'not_found' | 'unauthorized' | 'other' };

const codeOf = (e: unknown): 'network' | 'not_found' | 'unauthorized' | 'other' => {
  if (!(e instanceof AgentHttpError)) return 'other';
  if (e.status === 0) return 'network';
  if (e.status === 404) return 'not_found';
  if (e.status === 401) return 'unauthorized';
  return 'other';
};

/** 화면에 들어올 때마다 다시 읽는다. 이미 자료가 있으면 다시 읽는 동안에도 그대로 보여 준다. */
export function useRemote<T>(load: () => Promise<T>, enabled = true) {
  const [state, setState] = useState<Remote<T>>({ kind: 'loading' });
  const seq = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const n = ++seq.current;
    setState((s) => (s.kind === 'ready' ? s : { kind: 'loading' }));
    try {
      const data = await load();
      if (n === seq.current) setState({ kind: 'ready', data });
    } catch (e) {
      if (n === seq.current) setState((s) => (s.kind === 'ready' ? s : { kind: 'error', code: codeOf(e) }));
    }
  }, [load, enabled]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { state, reload, set: setState };
}

export const REMOTE_ERROR: Record<'network' | 'not_found' | 'unauthorized' | 'other', string> = {
  network: '연결이 잠깐 끊겼어요',
  not_found: '이 요청을 찾지 못했어요',
  unauthorized: '다시 로그인해 주세요',
  other: '못 불러왔어요. 다시 해 볼까요?',
};
