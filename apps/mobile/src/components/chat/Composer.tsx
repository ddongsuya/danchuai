import { ArrowUp } from 'phosphor-react-native';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { Press } from '@/components/ui/Press';
import { fonts, space, tokens, u } from '@/constants/theme';

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
        // 웹은 여러 줄 입력칸이 기본 두 줄 높이라 한 줄로 시작하게 한다(앱은 글 길이만큼 늘어남)
        {...(Platform.OS === 'web' ? ({ rows: 1 } as object) : null)}
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
          <ArrowUp size={u(18)} weight="bold" color={ready ? tokens.onInk : tokens.muted} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  // 한 줄짜리 알약. 글이 길어지면 다섯 줄까지 늘어나고 보내기 버튼은 아래쪽에 붙는다(시안 A).
  box: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, marginHorizontal: space.md, marginTop: u(10), backgroundColor: tokens.surface, borderRadius: u(26), borderWidth: 1, borderColor: tokens.border, paddingVertical: u(6), paddingRight: u(6), paddingLeft: space.lg, minHeight: u(52) },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: u(16), lineHeight: u(22), color: tokens.text, minHeight: u(40), maxHeight: u(120), paddingTop: u(9), paddingBottom: u(9) },
  send: { width: u(40), height: u(40), borderRadius: u(20), backgroundColor: tokens.sunken, alignItems: 'center', justifyContent: 'center' },
});
