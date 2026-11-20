// 요청서 빈 항목을 선택지로 묻는다(Perplexity 질문 카드 방식). "미정으로 두기"는 그 항목을 미정으로 보낸다.
// 질문이 하나면 고르는 순간 바로 보낸다(결정 E4 ①, 토스 은행 고르기 Mobbin f2bd0ee9). 여러 개면 다 고른 뒤 버튼에 고른 값을 넣는다.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { haptic } from '@/lib/haptics';
import { fonts, radius, tokens, uc } from '@/constants/theme';

export interface Question {
  id: string;
  label: string;
  options: string[];
}

interface Props {
  title: string;
  questions: Question[];
  initial?: Record<string, string>;
  onSubmit: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

export function QuestionCard({ title, questions, initial = {}, onSubmit, onSkip }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(initial);
  const complete = questions.every((q) => answers[q.id]);
  const instant = questions.length === 1;
  return (
    <View style={styles.card}>
      <Txt variant="chatLabel" style={{ fontFamily: fonts.bold, marginBottom: uc(10) }}>
        {title}
      </Txt>
      {questions.map((q, i) => (
        <View key={q.id} style={i > 0 && { marginTop: uc(14) }} accessibilityRole="radiogroup" accessibilityLabel={q.label}>
          <Txt variant="chatSmall" color={tokens.muted} style={{ marginBottom: uc(8) }}>
            {q.label}
          </Txt>
          <View style={styles.opts}>
            {q.options.map((o) => {
              const on = answers[q.id] === o;
              return (
                <Press
                  key={o}
                  label={o}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic.tap();
                    const next = { ...answers, [q.id]: o };
                    setAnswers(next);
                    if (instant) onSubmit(next);
                  }}
                  style={[styles.opt, on && styles.optOn]}
                >
                  <Txt variant="chatSmall" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.medium }}>
                    {o}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.act}>
        {!instant && <Button chat title={complete ? '이대로 정하기' : '고르기 전'} onPress={() => onSubmit(answers)} disabled={!complete} />}
        <Button chat title="미정으로 두기" kind="text" onPress={onSkip} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: uc(18), borderWidth: 1, borderColor: tokens.border, padding: uc(14), marginTop: uc(10) },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: uc(8) },
  opt: { minHeight: uc(36), paddingHorizontal: uc(14), borderRadius: radius.pill, backgroundColor: tokens.sunken, justifyContent: 'center' },
  optOn: { backgroundColor: tokens.ink },
  act: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start', gap: uc(8), marginTop: uc(10), marginLeft: -uc(10) },
});
