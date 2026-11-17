import { ArrowUp } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Press } from '@/components/ui/Press';
import { fonts, space, tokens } from '@/constants/theme';

export function Composer({ onSend, disabled, placeholder = '메시지' }: { onSend?: (text: string) => void; disabled?: boolean; placeholder?: string }) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !disabled;
  return (
    <View style={styles.box}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={tokens.faint}
        accessibilityLabel={placeholder}
        multiline
        style={styles.input}
        selectionColor={tokens.accent}
      />
      {/* 파일 첨부·음성 입력은 기능이 생기면 단다(누를 수 없는 버튼을 두지 않는다) */}
      <Press
          label="보내기"
          disabled={!ready}
          onPress={() => {
            onSend?.(text.trim());
            setText('');
          }}
          style={[styles.send, ready && { backgroundColor: tokens.ink }]}
        >
          <ArrowUp size={18} weight="bold" color={ready ? tokens.onInk : tokens.muted} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  // 한 줄짜리 알약. 글이 길어지면 다섯 줄까지 늘어나고 보내기 버튼은 아래쪽에 붙는다(시안 A).
  box: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginHorizontal: space.md, marginTop: 10, backgroundColor: tokens.surface, borderRadius: 26, borderWidth: 1, borderColor: tokens.border, paddingVertical: 6, paddingRight: 6, paddingLeft: space.lg, minHeight: 52 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22, color: tokens.text, minHeight: 40, maxHeight: 120, paddingTop: 9, paddingBottom: 9 },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
