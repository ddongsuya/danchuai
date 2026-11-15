// 대화 화면 자리. 시안 승인 뒤 6화면(일 맡기기, 승인, 회신 정리, 기관 3화면)을 여기서부터 만든다.
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { space, tokens } from '@/constants/theme';

export default function ChatScreen() {
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Text style={styles.wordmark}>견적 에이전트</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  top: {
    height: 56,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: tokens.line,
  },
  wordmark: { fontSize: 16, fontWeight: '700', color: tokens.ink, letterSpacing: -0.3 },
});
