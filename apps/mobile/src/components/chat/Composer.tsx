import { ArrowUp, Microphone, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Press } from '@/components/ui/Press';
import { fonts, radius, space, tokens } from '@/constants/theme';

export function Composer({ onSend }: { onSend?: (text: string) => void }) {
  const [text, setText] = useState('');
  const ready = text.trim().length > 0;
  return (
    <View style={styles.box}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="메시지"
        placeholderTextColor={tokens.faint}
        accessibilityLabel="메시지"
        multiline
        style={styles.input}
        selectionColor={tokens.accent}
      />
      <View style={styles.bar}>
        <IconButton label="파일 첨부" plain>
          <Plus size={20} color={tokens.text} />
        </IconButton>
        <View style={{ flex: 1 }} />
        <IconButton label="음성 입력" plain>
          <Microphone size={20} color={tokens.text} />
        </IconButton>
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
  input: { fontFamily: fonts.regular, fontSize: 15, color: tokens.text, minHeight: 24, maxHeight: 120, paddingVertical: 2, marginBottom: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
