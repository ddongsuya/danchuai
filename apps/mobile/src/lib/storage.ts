// 웹: 브라우저 localStorage. 서버 렌더링 중에는 없다.
export const authStorage: Storage | undefined = typeof window !== 'undefined' ? window.localStorage : undefined;
