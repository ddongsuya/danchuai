// 요청서 빈 칸 질문 카드. 입력창 자리에 뜬다(2026-11-20 사용자 선택 "B. 입력창 자리", 시안 danchuai-question-card).
// 한 번에 질문 하나: 위에 칸 이름과 남은 필수 칸, 질문, 근거, 선택지(고르면 달라지는 것), 맨 아래 "미정" 한 줄, 그 아래 직접 입력.
// 고르면 0.12초 동안 고른 표시를 보여 주고 보낸다. 접으면 입력창 높이의 한 줄로 줄어든다.
import { BookOpenText, CaretDown, CaretUp, Check } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, motion, tokens, uc } from '@/constants/theme';
import type { AgentQuestion } from '@/lib/chat';
import { haptic } from '@/lib/haptics';
import { KEEP, WEB, easeOut } from '@/lib/motion';

import { Composer } from './Composer';
import { SourcesSheet } from './SourcesSheet';

/** 고른 표시를 보여 주고 보내기까지 */
const PICK_MS = 120;
const UNSURE = '미정';

interface Props {
  question: AgentQuestion;
  /** 위 왼쪽 칸 이름 */
  field: string;
  /** 위 오른쪽(필수 N칸 남음, 다시 묻는 칸은 지금 값) */
  left?: string | null;
  disabled?: boolean;
  /** 고른 선택지 이름, "미정", 직접 쓴 글 */
  onAnswer: (value: string) => void;
  /** 미리보기용 첫 상태 */
  initial?: { folded?: boolean; picked?: string; text?: string; sources?: boolean };
}

/** 카드가 올라올 때 0.24초 ease-out. 동작 줄이기·웹은 흐림 전환만 */
function enter(reduced: boolean) {
  if (reduced) return FadeIn.duration(motion.ms.reduced).reduceMotion(KEEP);
  if (WEB) return FadeIn.duration(motion.ms.popIn).easing(easeOut).reduceMotion(KEEP);
  return FadeInDown.duration(motion.ms.popIn)
    .easing(easeOut)
    .withInitialValues({ opacity: 0, transform: [{ translateY: uc(20) }] })
    .reduceMotion(KEEP);
}

export function QuestionCard({ question, field, left, disabled, onAnswer, initial }: Props) {
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [folded, setFolded] = useState(initial?.folded ?? false);
  const [picked, setPicked] = useState<string | null>(initial?.picked ?? null);
  const [open, setOpen] = useState(initial?.sources ?? false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const pick = (value: string) => {
    if (picked || disabled) return;
    haptic.tap();
    setPicked(value);
    timer.current = setTimeout(() => onAnswer(value), PICK_MS);
  };

  // 시안: 카드 안 입력창 아래 20(시안 px)
  const bottomPad = insets.bottom + uc(18);
  const basis = question.basis ?? [];
  // 알약에는 문서와 조항 번호만("ICH M3 5.1"). 조항 이름은 근거 시트에서
  const basisShort = basis.map((b) => `${b.doc} ${b.section.split(/\s+/)[0] ?? ''}`.trim()).join(', ');

  if (folded) {
    return (
      <View style={{ paddingBottom: bottomPad }}>
        <Press label={`${field} 질문 펼치기`} onPress={() => setFolded(false)} style={styles.mini}>
          <Txt variant="chatLabel" style={styles.miniT} numberOfLines={1}>
            {field}
            <Txt variant="chatLabel" color={tokens.muted} style={{ fontFamily: fonts.regular }}>
              {'  질문 1개'}
            </Txt>
          </Txt>
          <View style={styles.fold}>
            <CaretUp size={uc(16)} color={tokens.muted} />
          </View>
        </Press>
      </View>
    );
  }

  const options = [...question.options, { label: UNSURE, effect: undefined }];
  return (
    <Animated.View entering={enter(reduced)} style={[styles.card, { paddingBottom: bottomPad }]}>
      <View style={styles.head}>
        <Txt variant="chatCaption" color={tokens.muted} style={{ fontFamily: fonts.semibold }}>
          {field}
        </Txt>
        <Txt variant="chatCaption" color={tokens.muted} tabular numberOfLines={1} style={styles.left}>
          {left ?? ''}
        </Txt>
        <Press label="질문 접기" onPress={() => setFolded(true)} style={styles.fold}>
          <CaretDown size={uc(16)} color={tokens.muted} />
        </Press>
      </View>

      <Txt style={styles.q} accessibilityRole="header">
        {question.question}
      </Txt>

      {basis.length > 0 && (
        <Press label={`근거 ${basisShort}`} onPress={() => setOpen(true)} style={styles.pill}>
          <BookOpenText size={uc(15)} color={tokens.muted} />
          <Txt variant="chatCaption" style={{ fontFamily: fonts.semibold }}>
            근거
          </Txt>
          <Txt variant="chatCaption" color={tokens.muted} numberOfLines={1} style={{ flexShrink: 1 }}>
            {basisShort}
          </Txt>
        </Press>
      )}

      <View style={styles.opts} accessibilityRole="radiogroup" accessibilityLabel={question.question}>
        {options.map((o, i) => {
          const on = picked === o.label;
          const prevOn = i > 0 && picked === options[i - 1].label;
          const unsure = o.label === UNSURE && i === options.length - 1;
          return (
            <Press
              key={`${o.label}-${i}`}
              label={o.effect ? `${o.label}, ${o.effect}` : o.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: !!disabled }}
              disabled={disabled}
              onPress={() => pick(o.label)}
              style={[styles.op, on && styles.opOn]}
            >
              {i > 0 && !on && !prevOn && <View style={styles.sep} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={styles.l} color={unsure ? tokens.muted : tokens.text}>
                  {o.label}
                </Txt>
                {o.effect ? (
                  <Txt style={styles.e} color={tokens.muted}>
                    {o.effect}
                  </Txt>
                ) : null}
              </View>
              {on && <Check size={uc(18)} weight="bold" color={tokens.ink} />}
            </Press>
          );
        })}
      </View>

      <Composer placeholder="직접 입력" initial={initial?.text} disabled={disabled || !!picked} onSend={onAnswer} style={styles.comp} />

      <SourcesSheet sources={open ? basis : null} onClose={() => setOpen(false)} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 시안: 위 모서리 24, 위 테두리 1, 위로 번지는 그림자
  card: {
    backgroundColor: tokens.surface,
    borderTopLeftRadius: uc(22),
    borderTopRightRadius: uc(22),
    borderTopWidth: 1,
    borderColor: tokens.border,
    paddingTop: uc(5.5),
    shadowColor: tokens.ink,
    shadowOpacity: 0.08,
    shadowRadius: uc(14),
    shadowOffset: { width: 0, height: -uc(6) },
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: uc(7), minHeight: uc(36), paddingLeft: uc(18), paddingRight: uc(5.5) },
  left: { flex: 1, textAlign: 'right' },
  fold: { width: uc(36), height: uc(36), alignItems: 'center', justifyContent: 'center' },
  q: { fontFamily: fonts.bold, fontSize: uc(17), lineHeight: uc(23.6), letterSpacing: -0.26, paddingHorizontal: uc(18) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uc(5.5),
    alignSelf: 'flex-start',
    maxWidth: '90%',
    height: uc(29),
    paddingLeft: uc(9),
    paddingRight: uc(11),
    marginTop: uc(9),
    marginLeft: uc(18),
    borderRadius: 999,
    backgroundColor: tokens.sunken,
  },
  opts: { marginTop: uc(9), paddingHorizontal: uc(7.3) },
  op: { flexDirection: 'row', alignItems: 'center', gap: uc(11), minHeight: uc(52.7), paddingVertical: uc(8.2), paddingHorizontal: uc(11), borderRadius: uc(12.7) },
  opOn: { backgroundColor: tokens.sunken },
  sep: { position: 'absolute', top: 0, left: uc(11), right: uc(11), height: StyleSheet.hairlineWidth * 2, backgroundColor: tokens.border },
  l: { fontFamily: fonts.medium, fontSize: uc(15), lineHeight: uc(20) },
  e: { fontFamily: fonts.regular, fontSize: uc(12.5), lineHeight: uc(17.3), marginTop: uc(1.8) },
  comp: { marginTop: uc(5.5) },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uc(9),
    marginHorizontal: uc(12),
    marginTop: uc(8),
    minHeight: uc(48),
    paddingLeft: uc(16.4),
    paddingRight: uc(5.5),
    borderRadius: uc(24),
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.border,
  },
  miniT: { flex: 1 },
});
