// 손끝 반응 세 가지만 쓴다(결정 E7): 성공(요청·선정 끝), 오류(보내기 실패), 가벼운 탭(시트에서 고르기).
// 웹에는 없으므로 아무것도 하지 않는다. 기기가 지원하지 않거나 꺼져 있으면 조용히 넘어간다.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (fn: () => Promise<void>) => {
  if (!on) return;
  fn().catch(() => {});
};

export const haptic = {
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  tap: () => safe(() => Haptics.selectionAsync()),
};
