import { Platform, Text, type TextProps, type TextStyle } from 'react-native';

import { tokens, type as typeScale } from '@/constants/theme';

// 한글은 어절 단위로 줄을 바꾼다. iOS는 hangul-word, 웹은 keep-all.
const keepAll = (Platform.OS === 'web' ? { wordBreak: 'keep-all' } : {}) as TextStyle;

type Variant = keyof typeof typeScale;

interface Props extends TextProps {
  variant?: Variant;
  color?: string;
  /** 금액·날짜처럼 바뀌는 숫자는 고정폭 숫자로 */
  tabular?: boolean;
}

export function Txt({ variant = 'body', color = tokens.text, tabular, style, ...rest }: Props) {
  return (
    <Text
      lineBreakStrategyIOS="hangul-word"
      style={[keepAll, typeScale[variant], { color }, tabular && { fontVariant: ['tabular-nums'] }, style]}
      {...rest}
    />
  );
}
