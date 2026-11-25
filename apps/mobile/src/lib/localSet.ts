// 기기 안에만 두는 작은 표시(소식 좋아요, 할 일 체크). 서버에 저장하지 않는다. 읽기·쓰기가 실패해도 화면은 그대로 동작한다.
import { useCallback, useState } from 'react';

import { authStorage } from './storage';

const read = (key: string): Set<string> => {
  try {
    const raw = authStorage?.getItem(key);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(-300) : []);
  } catch {
    return new Set();
  }
};

export function useLocalSet(key: string, initial?: string[]): [Set<string>, (id: string) => void] {
  const [set, setSet] = useState<Set<string>>(() => (initial ? new Set(initial) : read(key)));
  const toggle = useCallback(
    (id: string) => {
      setSet((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          authStorage?.setItem(key, JSON.stringify([...next]));
        } catch {
          // 저장하지 못해도 이번 화면에서는 보인다
        }
        return next;
      });
    },
    [key],
  );
  return [set, toggle];
}
