import { CaretRight, CheckCircle, CircleNotch, ListChecks } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';

/** 내 메시지만 말풍선. 에이전트 글은 말풍선 없이 본문으로 쓴다. */
export function UserMessage({ text }: { text: string }) {
  return (
    <View style={styles.me}>
      <Txt variant="body">{text}</Txt>
    </View>
  );
}

export function AgentText({ children }: { children: string }) {
  return <Txt variant="agent">{children}</Txt>;
}

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
            <CheckCircle size={16} color={tokens.muted} />
            <Txt variant="small" color={tokens.muted}>
              {s.label}
            </Txt>
          </View>
        ) : (
          <View key={s.label} style={styles.step} accessibilityLiveRegion="polite">
            <CircleNotch size={16} color={tokens.accent} weight="bold" />
            <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
              {s.label}
            </Txt>
          </View>
        ),
      )}
    </View>
  );
}

/** 끝난 작업은 한 줄로 접는다. */
export function FoldedLog({ count, onPress }: { count: number; onPress?: () => void }) {
  return (
    <Press label={`작업 기록 ${count}건 펼치기`} onPress={onPress} style={styles.fold}>
      <ListChecks size={16} color={tokens.muted} />
      <Txt variant="small" color={tokens.muted}>
        작업 기록 {count}건
      </Txt>
      <CaretRight size={14} color={tokens.muted} />
    </Press>
  );
}

export function WaitingLine({ label }: { label: string }) {
  return (
    <View style={styles.waiting} accessibilityLiveRegion="polite">
      <View style={styles.ring}>
        <View style={styles.pulse} />
      </View>
      <Txt variant="caption" color={tokens.accent} style={{ fontFamily: fonts.semibold }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  me: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: tokens.sunken, borderRadius: radius.bubble, paddingVertical: 11, paddingHorizontal: space.lg },
  steps: { gap: 9, marginBottom: space.md },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 10, minHeight: 24 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 10 },
  ring: { width: 16, height: 16, borderRadius: 8, backgroundColor: tokens.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.accent },
});
