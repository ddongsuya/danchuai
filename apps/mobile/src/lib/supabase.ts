// Supabase 로그인 클라이언트. 앱에는 공개 키(publishable)만 둔다. DB 비밀번호·서비스 키는 서버에만.
// EXPO_PUBLIC_SUPABASE_URL 이 없으면 로그인을 끄고 시연 화면으로 연다.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { authStorage } from './storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: authStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;

export const authEnabled = () => supabase !== null;

if (supabase && Platform.OS !== 'web') {
  // 앱이 화면에 있을 때만 토큰을 갱신한다(Supabase 권장).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** 지금 로그인 토큰. 없으면 null. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
