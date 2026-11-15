// 휴대폰: 로그인 세션을 기기 안 SQLite에 둔다(Expo 문서의 Supabase 안내 방식).
import 'expo-sqlite/localStorage/install';

export const authStorage: Storage | undefined = globalThis.localStorage;
