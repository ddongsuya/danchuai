import { CheckCircle } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Spinner } from '@/components/ui/Spinner';
import { Txt } from '@/components/ui/Txt';
import { splitAnswer } from '@/lib/chat';
import { lineEnter } from '@/lib/motion';
import { tokens, uc } from '@/constants/theme';

/** 말풍선(Muse 시안 2026-11-25): 비서는 왼쪽 회색, 나는 오른쪽 하늘색. fresh 면 아래에서 8px 올라오며 나타난다. */
export function UserMessage({ text, fresh }: { text: string; fresh?: boolean }) {
  const reduced = useReducedMotion();
  const answer = splitAnswer(text);
  return (
    <Animated.View entering={fresh ? lineEnter(0, reduced) : undefined} style={styles.me}>
      {answer && (
        <Txt variant="chatCaption" color={tokens.muted}>
          {answer.field}
        </Txt>
      )}
      <Txt variant="chatBody">{answer ? answer.value : text}</Txt>
    </Animated.View>
  );
}

export function AgentText({ children, fresh }: { children: string; fresh?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={fresh ? lineEnter(0, reduced) : undefined} style={styles.agent}>
      <Txt variant="chatBody">{children}</Txt>
    </Animated.View>
  );
}

/** 진행 문구는 끝나지 않았다는 뜻으로 "…"을 붙인다(서버가 준 단계 이름에도) */

export interface Step {
  label: string;
  state: 'done' | 'now';
}

/** 작업 단계. 회색 한 줄씩, 지금 하는 단계만 청록. */
export function StepLog({ steps }: { steps: Step[] }) {
  return (
    <View style={styles.steps} accessibilityRole="list">
      {steps.map((s) =>
        s.state === 'done' ? (
          <View key={s.label} style={styles.step}>
            <CheckCircle size={uc(15)} color={tokens.muted} />
            <Txt variant="chatCaption" color={tokens.muted}>
              {s.label}
            </Txt>
          </View>
        ) : (
          <View key={s.label} style={styles.step} accessibilityLiveRegion="polite">
            <Spinner size={uc(15)} color={tokens.accent} />
            <Txt variant="chatCaption" color={tokens.accent}>
              {s.label}
            </Txt>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: tokens.myBubble, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 15 },
  agent: { alignSelf: 'flex-start', maxWidth: '88%', backgroundColor: tokens.agentBubble, borderRadius: 20, paddingVertical: 11, paddingHorizontal: 15 },
  steps: { gap: uc(7), marginBottom: uc(10) },
  // 시안 .step: 13 중간 굵기, 진행 중은 청록
  step: { flexDirection: 'row', alignItems: 'center', gap: uc(6) },
});
