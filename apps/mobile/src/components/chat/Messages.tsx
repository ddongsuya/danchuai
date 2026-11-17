import { CheckCircle } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Spinner } from '@/components/ui/Spinner';
import { Txt } from '@/components/ui/Txt';
import { lineEnter } from '@/lib/motion';
import { radius, space, tokens, u } from '@/constants/theme';

/** 내 메시지만 말풍선. 에이전트 글은 말풍선 없이 본문으로 쓴다. fresh 면 아래에서 8px 올라오며 나타난다. */
export function UserMessage({ text, fresh }: { text: string; fresh?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={fresh ? lineEnter(0, reduced) : undefined} style={styles.me}>
      <Txt variant="body">{text}</Txt>
    </Animated.View>
  );
}

export function AgentText({ children, fresh }: { children: string; fresh?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={fresh ? lineEnter(0, reduced) : undefined}>
      <Txt variant="agent">{children}</Txt>
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
            <CheckCircle size={u(16)} color={tokens.muted} />
            <Txt variant="caption" color={tokens.muted}>
              {s.label}
            </Txt>
          </View>
        ) : (
          <View key={s.label} style={styles.step} accessibilityLiveRegion="polite">
            <Spinner size={u(16)} color={tokens.accent} />
            <Txt variant="caption" color={tokens.accent}>
              {s.label}
            </Txt>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: tokens.sunken, borderRadius: radius.bubble, paddingVertical: u(11), paddingHorizontal: space.lg },
  steps: { gap: u(9), marginBottom: space.md },
  // 시안 .step: 13 중간 굵기, 진행 중은 청록
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});
