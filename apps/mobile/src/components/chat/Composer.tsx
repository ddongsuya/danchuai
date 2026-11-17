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
      <View style={styles.bar}>
        {/* 파일 첨부·음성 입력은 기능이 생기면 단다(누를 수 없는 버튼을 두지 않는다) */}
        <View style={{ flex: 1 }} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginHorizontal: space.md, marginTop: 10, backgroundColor: tokens.surface, borderRadius: 26, borderWidth: 1, borderColor: tokens.border, paddingTop: 12, paddingRight: 10, paddingBottom: 10, paddingLeft: space.lg },
  input: { fontFamily: fonts.regular, fontSize: 16, color: tokens.text, minHeight: 24, maxHeight: 120, paddingVertical: 2, marginBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
