// Google 로그인: Supabase OAuth(PKCE). 휴대폰은 인앱 브라우저로 열고 앱 주소(danchuai://auth/callback)로 돌아온다.
// 웹은 같은 창에서 다녀오고, 돌아오면 Supabase가 주소의 code를 읽는다(detectSessionInUrl).
// 매번 계정 선택 창을 띄운다. 없으면 Google이 마지막 계정으로 바로 들어가 다른 계정으로 바꿀 수 없다.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type GoogleResult = 'ok' | 'cancelled' | 'error';

const queryParams = { prompt: 'select_account' };

export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!supabase) return 'error';
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin, queryParams } });
    return error ? 'error' : 'ok';
  }
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true, queryParams } });
  if (error || !data.url) return 'error';
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return 'cancelled';
  const code = new URL(res.url).searchParams.get('code');
  if (!code) return 'error';
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  return exErr ? 'error' : 'ok';
}
