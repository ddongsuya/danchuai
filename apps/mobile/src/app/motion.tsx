// 움직임 기준 미리보기. 예시 값만 쓰고 서버를 부르지 않는다. 로그인 없이 열린다(_layout).
import { router } from 'expo-router';
import { X } from 'phosphor-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { LikeButton } from '@/components/ui/LikeButton';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { StaggerLines } from '@/components/ui/StaggerLines';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { radius, space, tokens, u } from '@/constants/theme';

export default function MotionPreview() {
  const { toast, snack } = useToast();
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [liked, setLiked] = useState(false);
  const [checks, setChecks] = useState([true, false]);
  const [titleKey, setTitleKey] = useState(0);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <IconButton label="닫기" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <X size={u(22)} color={tokens.text} />
        </IconButton>
        <Txt variant="nav" accessibilityRole="header">
          움직임
        </Txt>
        <View style={{ width: u(44) }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Row name="스낵바">
          <Button title="요청 삭제" kind="soft" onPress={() => snack('요청을 지웠어요', { label: '되돌리기', onPress: () => toast('되돌렸어요') })} />
        </Row>
        <Row name="토스트">
          <Button title="번호 복사" kind="soft" onPress={() => toast('복사했어요')} />
        </Row>
        <Row name="팝업">
          <Button title="로그아웃" kind="soft" onPress={() => setDialog(true)} />
        </Row>
        <Row name="바텀시트">
          <Button title="시험 항목" kind="soft" onPress={() => setSheet(true)} />
        </Row>
        <Row name="좋아요">
          <LikeButton liked={liked} onChange={setLiked} label="답 저장" />
        </Row>
        <View style={styles.block}>
          <Txt variant="label" color={tokens.muted}>
            체크박스
          </Txt>
          <Checkbox checked={checks[0]} onChange={(v) => setChecks([v, checks[1]])} label="이용약관 동의" />
          <Checkbox checked={checks[1]} onChange={(v) => setChecks([checks[0], v])} label="개인정보 국외 이전 동의" />
        </View>
        <Row name="로딩">
          <View style={styles.load}>
            <Spinner size={u(20)} />
            <Button title="요청하는 중" loading onPress={() => {}} />
          </View>
        </Row>
        <View style={styles.block}>
          <View style={styles.rowHead}>
            <Txt variant="label" color={tokens.muted} style={{ flex: 1 }}>
              타이틀과 서브타이틀
            </Txt>
            <Button title="다시 보기" kind="text" onPress={() => setTitleKey((k) => k + 1)} />
          </View>
          <StaggerLines key={titleKey} style={{ gap: u(6) }}>
            <Txt variant="title">단추에 요청했어요</Txt>
            <Txt variant="body" color={tokens.muted}>
              회신 기한 11.26(목)
            </Txt>
            <Txt variant="small" color={tokens.muted}>
              분야가 맞는 참여 기관 전체
            </Txt>
          </StaggerLines>
        </View>
      </ScrollView>

      <Dialog visible={dialog} onClose={() => setDialog(false)}>
        <Txt variant="heading" accessibilityRole="header">
          로그아웃할까요?
        </Txt>
        <View style={styles.acts}>
          <Button title="닫기" kind="soft" tall flex={1} onPress={() => setDialog(false)} />
          <Button title="로그아웃" tall flex={1} onPress={() => setDialog(false)} />
        </View>
      </Dialog>

      <Sheet visible={sheet} onClose={() => setSheet(false)}>
        <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.grab} />
          <Txt variant="title" style={{ fontSize: u(22), lineHeight: u(30) }} accessibilityRole="header">
            어떤 시험이에요?
          </Txt>
          {['독성', '효력', '약동학'].map((o) => (
            <View key={o} style={styles.option}>
              <Txt variant="body">{o}</Txt>
            </View>
          ))}
          <View style={{ marginTop: space.md }}>
            <Button title="닫기" kind="soft" tall onPress={() => setSheet(false)} />
          </View>
        </SafeAreaView>
      </Sheet>
    </SafeAreaView>
  );
}

function Row({ name, children }: { name: string; children: ReactNode }) {
  return (
    <View style={styles.rowHead}>
      <Txt variant="label" color={tokens.muted} style={{ flex: 1 }}>
        {name}
      </Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, height: u(56) },
  body: { paddingHorizontal: space.xl, paddingBottom: u(120), gap: space.lg },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(56), borderBottomWidth: 1, borderBottomColor: tokens.border },
  block: { gap: space.sm, paddingBottom: space.lg, borderBottomWidth: 1, borderBottomColor: tokens.border },
  load: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  acts: { flexDirection: 'row', gap: space.sm, marginTop: space.xl },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: radius.approval, borderTopRightRadius: radius.approval, paddingTop: u(10), paddingHorizontal: space.xl, paddingBottom: space.xl },
  grab: { alignSelf: 'center', width: u(40), height: u(4), borderRadius: u(2), backgroundColor: tokens.border, marginBottom: space.lg },
  option: { minHeight: u(56), justifyContent: 'center', borderTopWidth: 1, borderTopColor: tokens.border },
});
