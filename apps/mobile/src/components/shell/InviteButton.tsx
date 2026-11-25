// 위 막대 오른쪽 "초대" 알약(시안 m02 .pillr). 단추에는 동료를 초대하는 입구가 없어서,
// 휴대폰 공유 창으로 단추 주소를 동료에게 건넨다(누가 받을지는 사람이 고른다).
import { Platform, Share } from 'react-native';

import { useToast } from '@/components/ui/Toast';
import { DANCHU_URL } from '@/lib/danchuLinks';

import { PillButton } from './AgentHeader';

export const INVITE_TEXT = `단추에서 비임상 견적 일을 함께 해요. ${DANCHU_URL}`;

/** 공유 창으로 초대 글을 건넨다. 웹에서 공유 창이 없으면 복사하고 알린다 */
export async function shareInvite(toast: (t: string) => void) {
  try {
    if (Platform.OS === 'web') {
      const nav = globalThis.navigator as Navigator | undefined;
      if (nav?.share) await nav.share({ text: INVITE_TEXT });
      else {
        await nav?.clipboard?.writeText(INVITE_TEXT);
        toast('초대 글을 복사했어요');
      }
      return;
    }
    await Share.share({ message: INVITE_TEXT });
  } catch {
    // 공유 창을 닫은 경우는 알리지 않는다
  }
}

export function InviteButton() {
  const { toast } = useToast();
  return <PillButton title="초대" onPress={() => void shareInvite(toast)} />;
}
