import { ArrowUp } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { Press } from '@/components/ui/Press';
import { fonts, tokens, uc } from '@/constants/theme';

export function Composer({
  onSend,
  disabled,
  placeholder = '메시지',
  initial = '',
  style,
}: {
  onSend?: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 미리보기용 처음 글 */
  initial?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [text, setText] = useState(initial);
  const ready = text.trim().length > 0 && !disabled;
  return (
    <View style={[styles.box, style]}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={tokens.faint}
        accessibilityLabel={placeholder}
        multiline
        // 웹은 여러 줄 입력칸이 기본 두 줄 높이라 한 줄로 시작하게 한다(앱은 글 길이만큼 늘어남)
        {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
        style={styles.input}
        selectionColor={tokens.primary}
      />
      {/* 파일 첨부·음성 입력은 기능이 생기면 단다(누를 수 없는 버튼을 두지 않는다) */}
      <Press
          label="보내기"
          disabled={!ready}
          onPress={() => {
            onSend?.(text.trim());
            setText('');
          }}
          style={[styles.send, ready && { backgroundColor: tokens.primary }]}
        >
          <ArrowUp size={uc(17)} weight="bold" color={ready ? tokens.onPrimary : tokens.muted} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  // 한 줄짜리 알약. 글이 길어지면 다섯 줄까지 늘어나고 보내기 버튼은 아래쪽에 붙는다(시안 A).
  box: { flexDirection: 'row', alignItems: 'flex-end', gap: uc(8), marginHorizontal: uc(12), marginTop: uc(8), backgroundColor: tokens.surface, borderRadius: uc(24), borderWidth: 1, borderColor: tokens.border, paddingVertical: uc(5), paddingRight: uc(5), paddingLeft: uc(16), minHeight: uc(48) },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: uc(15), lineHeight: uc(21), color: tokens.text, minHeight: uc(38), maxHeight: uc(116), paddingTop: uc(8), paddingBottom: uc(8) },
  send: { width: uc(38), height: uc(38), borderRadius: uc(19), backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
