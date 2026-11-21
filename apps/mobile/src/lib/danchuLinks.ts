// 단추 웹 주소. 가입·비밀번호 찾기·약관·요청 화면은 단추에서 연다.
// 휴대폰 앱에서는 앱 안 브라우저(iOS Safari 보기·안드로이드 Chrome 탭)로 연다. 기본 브라우저로 내보내지 않는다(앱 심사 지침 4).
import { openBrowserAsync } from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

export const DANCHU_URL = (process.env.EXPO_PUBLIC_DANCHU_URL ?? 'https://danchu.kr').replace(/\/$/, '');

/** 웹 화면 열기. 웹 앱은 새 창, 휴대폰 앱은 앱 안 브라우저(실패하면 기본 브라우저) */
export async function openWeb(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Linking.openURL(url);
    return;
  }
  try {
    await openBrowserAsync(url);
  } catch {
    await Linking.openURL(url).catch(() => undefined);
  }
}
