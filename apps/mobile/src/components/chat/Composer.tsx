// 입력창(시안 원본 m02 .comp): 흰 알약 한 줄, 높이 44, 그림자 0 1 8 8%, 안쪽 왼 12 오른 8, 단추 32.
// 왼쪽 "+"(맡길 일 고르기), 가운데 "메시지", 오른쪽 마이크. 글을 쓰면 마이크 자리가 파란 보내기 화살표로 바뀐다.
// 탭 막대 바로 10 위에 놓인다(탭 막대 위 여백 10은 탭 막대가 가진다).
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { MIcon } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { fonts, tokens } from '@/constants/theme';

export function Composer({
  onSend,
  onPlus,
  onMic,
  disabled,
  placeholder = '메시지',
  initial = '',
  style,
}: {
  onSend?: (text: string) => void;
  /** "+" 단추. 없으면 흐리게 두지 않고 숨긴다 */
  onPlus?: () => void;
  /** 마이크 단추(회의 녹음). 없으면 글이 없을 때 보내기 화살표를 흐리게 둔다 */
  onMic?: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** 미리보기용 처음 글 */
  initial?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [text, setText] = useState(initial);
  const typed = text.trim().length > 0;
  const ready = typed && !disabled;
  const send = () => {
    if (!ready) return;
    onSend?.(text.trim());
    setText('');
  };
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.box}>
        {onPlus ? (
          <Press label="맡길 일 고르기" disabled={disabled} onPress={onPlus} style={styles.btn}>
            <MIcon name="plus" size={20} color={disabled ? tokens.muted : tokens.text} />
          </Press>
        ) : (
          <View style={styles.gap} />
        )}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={tokens.muted}
          accessibilityLabel={placeholder}
          multiline
          // 웹은 여러 줄 입력칸이 기본 두 줄 높이라 한 줄로 시작하게 한다
          {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
          style={styles.input}
          selectionColor={tokens.primary}
          onSubmitEditing={send}
        />
        {!typed && onMic ? (
          <Press label="녹음" disabled={disabled} onPress={onMic} style={styles.btn}>
            <MIcon name="mic" size={19} color={disabled ? tokens.muted : tokens.text} />
          </Press>
        ) : (
          <Press label="보내기" disabled={!ready} onPress={send} style={[styles.btn, ready && styles.sendOn]}>
            <MIcon name="arrowUp" size={18} width={2.2} color={ready ? tokens.onPrimary : tokens.muted} />
          </Press>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, backgroundColor: 'transparent' },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  gap: { width: 2 },
  btn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sendOn: { backgroundColor: tokens.primary },
  // input: 15px, 한 줄 44 안에 들어가게. 길어지면 다섯 줄까지
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: tokens.text, minHeight: 44, maxHeight: 112, paddingTop: 12, paddingBottom: 12 },
});
