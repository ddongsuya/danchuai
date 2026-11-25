import { CheckCircle } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import type { ReactNode } from 'react';

import { MIcon, type MIconName } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { Spinner } from '@/components/ui/Spinner';
import { Txt } from '@/components/ui/Txt';
import { splitAnswer } from '@/lib/chat';
import { lineEnter } from '@/lib/motion';
import { fonts, tokens, uc } from '@/constants/theme';

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
      <Txt variant="mBubble">{answer ? answer.value : text}</Txt>
    </Animated.View>
  );
}

export function AgentText({ children, fresh }: { children: string; fresh?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={fresh ? lineEnter(0, reduced) : undefined} style={styles.agent}>
      <Txt variant="mBubble">{children}</Txt>
    </Animated.View>
  );
}

/** 시각 한 줄(.time): 가운데 11.5 회색 */
export function TimeLine({ children }: { children: string }) {
  return (
    <Txt style={styles.time} color={tokens.muted}>
      {children}
    </Txt>
  );
}

/** 예약 작업·제안 카드(.task): 회색 바탕 20, 흰 칸 그림 30 + 제목·부제, 설명, 흰 알약 단추(또는 두 단추) */
export function TaskCard({ icon = 'clock', title, sub, body, action, onAction, children }: { icon?: MIconName; title: string; sub?: string; body?: string; action?: string; onAction?: () => void; children?: ReactNode }) {
  return (
    <View style={styles.task}>
      <View style={styles.t1}>
        <View style={styles.ic}>
          <MIcon name={icon} size={17} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={styles.taskTitle}>{title}</Txt>
          {sub ? (
            <Txt style={styles.taskSub} color={tokens.muted}>
              {sub}
            </Txt>
          ) : null}
        </View>
      </View>
      {body ? <Txt style={styles.taskBody}>{body}</Txt> : null}
      {action && onAction ? (
        <Press label={action} onPress={onAction} style={styles.wbtn}>
          <Txt style={styles.wbtnText}>{action}</Txt>
        </Press>
      ) : null}
      {children}
    </View>
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
  // 시안 원본 .me / .ag
  me: { alignSelf: 'flex-end', maxWidth: '78%', backgroundColor: tokens.myBubble, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 14 },
  agent: { alignSelf: 'flex-start', maxWidth: '86%', backgroundColor: tokens.agentBubble, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 14 },
  time: { alignSelf: 'center', fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17 },
  task: { alignSelf: 'stretch', backgroundColor: tokens.agentBubble, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, gap: 8 },
  t1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ic: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  taskSub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  taskBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  wbtn: { height: 38, borderRadius: 19, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  wbtnText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  steps: { gap: uc(7), marginBottom: uc(10) },
  // 시안 .step: 13 중간 굵기, 진행 중은 청록
  step: { flexDirection: 'row', alignItems: 'center', gap: uc(6) },
});
