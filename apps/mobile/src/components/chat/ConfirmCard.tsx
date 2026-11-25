// 확인 카드(시안 원본 m03). 대화 안에 놓이는 흰 카드(반지름 22, 그림자 0 1 10 8%, 안쪽 16, 사이 12):
// 문서 그림 + 제목 600("비서 이름 + 하려는 일") → 안내 한 줄(13 #55555a) → 미리보기 상자(#f4f5f7, 반지름 14, 테두리 #ececee)
// → 받는 곳 줄(#f4f5f7, 흰 칸 그림 30) → 예상 합계 ⓘ → 거절(회색)·허용(파랑) 같은 폭 → 맨 아래 한 줄(11.5 회색 가운데).
// 규칙 1: 나갈 것은 미리보기 상자에 그대로 보인다. "항상 허용" 같은 일괄 허용은 없다. 허용 기록과 한 번만 보내기는 서버가 맡는다.
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { MIcon, type MIconName } from '@/components/ui/MIcon';
import { Buttons2 } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { lineEnter } from '@/lib/motion';

export interface ConfirmCardProps {
  title: string;
  note?: string;
  /** 미리보기 상자 안(나갈 본문, 견적서 줄 등) */
  preview?: ReactNode;
  /** 미리보기 상자 오른쪽 아래 알약("견적서 보기") */
  previewAction?: { label: string; onPress: () => void };
  recipient?: { title: string; sub?: string; icon?: MIconName; onPress?: () => void };
  total?: { label: string; value: string; onInfo?: () => void };
  /** 합계 아래에 펼치는 것(조건 등) */
  extra?: ReactNode;
  rejectLabel?: string;
  allowLabel?: string;
  onReject: () => void;
  onAllow: () => void;
  busy?: boolean;
  disabled?: boolean;
  /** 허용을 막은 까닭(빨강 한 줄) */
  issue?: string | null;
  foot: ReactNode;
}

export function ConfirmCard({ title, note, preview, previewAction, recipient, total, extra, rejectLabel = '거절', allowLabel = '허용', onReject, onAllow, busy, disabled, issue, foot }: ConfirmCardProps) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={lineEnter(0, reduced)} style={styles.card}>
      <View style={styles.head}>
        <MIcon name="doc" />
        <Txt style={styles.title} accessibilityRole="header">
          {title}
        </Txt>
      </View>
      {note ? (
        <Txt style={styles.note} color={tokens.note}>
          {note}
        </Txt>
      ) : null}
      {preview ? (
        <View style={styles.preview}>
          {preview}
          {previewAction ? (
            <Press label={previewAction.label} onPress={previewAction.onPress} style={styles.see}>
              <Txt style={styles.seeText}>{previewAction.label}</Txt>
            </Press>
          ) : null}
        </View>
      ) : null}
      {recipient ? <Recipient {...recipient} /> : null}
      {total ? (
        <View style={styles.total} accessible accessibilityLabel={`${total.label} ${total.value}`}>
          <View style={styles.totalLabel}>
            <Txt style={styles.totalText}>{total.label}</Txt>
            {total.onInfo ? (
              <Press label="조건 보기" onPress={total.onInfo} style={styles.info}>
                <MIcon name="info" size={16} color={tokens.muted} />
              </Press>
            ) : null}
          </View>
          <Txt style={[styles.totalText, { fontFamily: fonts.bold }]} tabular>
            {total.value}
          </Txt>
        </View>
      ) : null}
      {extra}
      {issue ? (
        <Txt style={styles.issue} color={tokens.danger} accessibilityLiveRegion="polite">
          {issue}
        </Txt>
      ) : null}
      <Buttons2 left={rejectLabel} right={allowLabel} onLeft={onReject} onRight={onAllow} busy={busy} disabled={disabled} />
      {typeof foot === 'string' ? (
        <Txt style={styles.foot} color={tokens.muted}>
          {foot}
        </Txt>
      ) : (
        foot
      )}
    </Animated.View>
  );
}

function Recipient({ title, sub, icon = 'person', onPress }: NonNullable<ConfirmCardProps['recipient']>) {
  const inner = (
    <>
      <View style={styles.rIc}>
        <MIcon name={icon} size={17} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt style={styles.rTitle}>{title}</Txt>
        {sub ? (
          <Txt style={styles.rSub} color={tokens.muted}>
            {sub}
          </Txt>
        ) : null}
      </View>
      {onPress ? <MIcon name="chevron" size={16} color={tokens.muted} /> : null}
    </>
  );
  return onPress ? (
    <Press label={title} onPress={onPress} style={styles.recipient}>
      {inner}
    </Press>
  ) : (
    <View style={styles.recipient} accessible accessibilityLabel={[title, sub].filter(Boolean).join(', ')}>
      {inner}
    </View>
  );
}

/** 미리보기 상자 안 견적서 모양(파란 띠, 문서 이름, 줄과 금액 9.5px) */
export function DocThumb({ name, lines }: { name: string; lines: [string, string][] }) {
  return (
    <View style={styles.thumb} accessible accessibilityLabel={`${name}, ${lines.map(([k, v]) => `${k} ${v}`).join(', ')}`}>
      <View style={styles.bar} />
      <Txt style={styles.thumbName}>{name}</Txt>
      <View style={{ gap: 5 }}>
        {lines.map(([k, v], i) => (
          <View key={`${k}${i}`} style={styles.thumbRow}>
            <Txt style={styles.thumbText} color={tokens.note} numberOfLines={1}>
              {k}
            </Txt>
            <Txt style={styles.thumbText} color={tokens.note} tabular>
              {v}
            </Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { alignSelf: 'stretch', backgroundColor: '#ffffff', borderRadius: 22, padding: 16, gap: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 1 }, elevation: 3 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: tokens.text },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19.5 },
  preview: { minHeight: 150, borderRadius: 14, backgroundColor: tokens.group, borderWidth: 1, borderColor: tokens.line, overflow: 'hidden' },
  see: { position: 'absolute', right: 10, bottom: 10, backgroundColor: '#ffffff', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  seeText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: tokens.group, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  rIc: { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  rTitle: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  rSub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  total: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalText: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: tokens.text },
  info: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  issue: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19 },
  foot: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
  thumb: { paddingTop: 14, paddingHorizontal: 16, paddingBottom: 40 },
  bar: { height: 10, borderRadius: 3, backgroundColor: tokens.primary, opacity: 0.85 },
  thumbName: { fontFamily: fonts.semibold, fontSize: 11, lineHeight: 16, marginTop: 10, marginBottom: 6, color: tokens.text },
  thumbRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  thumbText: { fontFamily: fonts.regular, fontSize: 9.5, lineHeight: 13 },
});
