// 요청서 빈 항목을 선택지로 묻는다(Perplexity 질문 카드 방식). 건너뛰면 "미정"으로 남긴다.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens } from '@/constants/theme';

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
  return (
    <View style={styles.card}>
      <Txt variant="label" style={{ fontFamily: fonts.bold, marginBottom: space.md }}>
        {title}
      </Txt>
      {questions.map((q, i) => (
        <View key={q.id} style={i > 0 && { marginTop: 14 }} accessibilityRole="radiogroup" accessibilityLabel={q.label}>
          <Txt variant="small" color={tokens.muted} style={{ marginBottom: space.sm }}>
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
                  onPress={() => setAnswers((a) => ({ ...a, [q.id]: o }))}
                  style={[styles.opt, on && styles.optOn]}
                >
                  <Txt variant="small" color={on ? tokens.onInk : tokens.text} style={{ fontFamily: fonts.medium }}>
                    {o}
                  </Txt>
                </Press>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.act}>
        <Button title="건너뛰기" kind="ghost" onPress={onSkip} />
        <Button title="계속" onPress={() => onSubmit(answers)} disabled={!complete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: tokens.surface, borderRadius: radius.card, borderWidth: 1, borderColor: tokens.border, padding: space.lg, marginTop: space.md },
  opts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  opt: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: tokens.sunken, justifyContent: 'center' },
  optOn: { backgroundColor: tokens.ink },
  act: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm, marginTop: space.lg },
});
