import { router } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { StyleSheet, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Txt } from '@/components/ui/Txt';
import { space, tokens } from '@/constants/theme';

export function NavBar({ title }: { title: string }) {
  return (
    <View style={styles.nav}>
      <IconButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
        <CaretLeft size={20} color={tokens.text} />
      </IconButton>
      <Txt variant="nav" numberOfLines={1} style={styles.title} accessibilityRole="header">
        {title}
      </Txt>
      {/* 더 보기 메뉴는 기능이 생기면 단다. 제목이 가운데에 오도록 자리만 둔다. */}
      <View style={styles.spacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  title: { flex: 1, textAlign: 'center' },
  spacer: { width: 44 },
});
