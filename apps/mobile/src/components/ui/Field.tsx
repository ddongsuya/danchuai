// 입력 칸: 라벨은 위, 도움말·오류는 아래. 플레이스홀더를 라벨로 쓰지 않는다.
import { WarningCircle } from 'phosphor-react-native';
import { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { fonts, radius, space, tokens, u } from '@/constants/theme';

import { Txt } from './Txt';

interface Props extends TextInputProps {
  label: string;
  help?: string;
  error?: string | null;
}

export const Field = forwardRef<React.ComponentRef<typeof TextInput>, Props>(function Field({ label, help, error, style, onFocus, onBlur, ...rest }, ref) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={styles.wrap}>
      <Txt variant="small" style={styles.label} nativeID={`${label}-label`}>
        {label}
      </Txt>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityLabelledBy={`${label}-label`}
        placeholderTextColor={tokens.faint}
        selectionColor={tokens.accent}
        cursorColor={tokens.accent}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          onBlur?.(e);
        }}
        style={[styles.input, focus && styles.focus, !!error && styles.err, style]}
        {...rest}
      />
      {error ? (
        <View style={styles.msg} accessibilityLiveRegion="polite">
          <WarningCircle size={u(16)} color={tokens.danger} style={{ marginTop: u(2) }} />
          <Txt variant="small" color={tokens.danger} style={{ flex: 1 }}>
            {error}
          </Txt>
        </View>
      ) : help ? (
        <Txt variant="small" color={tokens.muted} style={{ marginTop: space.sm }}>
          {help}
        </Txt>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {},
  label: { fontFamily: fonts.semibold, marginBottom: space.sm },
  input: { height: u(52), borderRadius: radius.inner, backgroundColor: tokens.surface, borderWidth: 1, borderColor: tokens.borderInput, paddingHorizontal: space.lg, fontFamily: fonts.regular, fontSize: u(16), color: tokens.text },
  focus: { borderWidth: 2, borderColor: tokens.ink, paddingHorizontal: space.lg - 1 },
  err: { borderWidth: 2, borderColor: tokens.danger, paddingHorizontal: space.lg - 1 },
  msg: { flexDirection: 'row', gap: u(6), marginTop: space.sm },
});
