// 설정 › 비서 캐릭터(Muse 시안 2026-11-25 m14). 큰 미리보기, 10종 격자, 이름, "이 캐릭터로 바꾸기".
// 이름은 캐릭터 이름을 따른다. 고른 값은 계정별로 서버에 저장한다(시연 모드는 기기에).
import { AGENT_CHARACTERS, characterOf, type AgentCharacterId } from '@danchuai/core';
import { router } from 'expo-router';
import { CaretLeft, Check } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { CircleButton } from '@/components/shell/AgentHeader';
import { Button } from '@/components/ui/Button';
import { Press } from '@/components/ui/Press';
import { useToast } from '@/components/ui/Toast';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { callName } from '@/lib/format';
import { useAuth } from '@/lib/session';

export default function CharacterRoute() {
  const { character, setCharacter } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async (id: AgentCharacterId) => {
    setBusy(true);
    setError(null);
    try {
      await setCharacter(id);
      toast(`이제 ${callName(characterOf(id).name)} 불러 주세요. 하던 일은 그대로 이어서 할게요.`);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch {
      setError('바꾸지 못했어요. 한 번 더 해 볼까요?');
    } finally {
      setBusy(false);
    }
  };
  return <CharacterView current={character} busy={busy} error={error} onSave={(id) => void save(id)} />;
}

/** 화면 모양만(미리보기에서도 쓴다) */
export function CharacterView({ current, initial, busy, error, onSave }: { current: AgentCharacterId; initial?: AgentCharacterId; busy?: boolean; error?: string | null; onSave: (id: AgentCharacterId) => void }) {
  const [picked, setPicked] = useState<AgentCharacterId>(initial ?? current);
  const c = characterOf(picked);
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.nav}>
        <CircleButton label="뒤로" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <CaretLeft size={20} color={tokens.text} />
        </CircleButton>
        <Txt variant="museHead" style={styles.navTitle} accessibilityRole="header">
          비서 캐릭터
        </Txt>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <AgentAvatar size={132} character={picked} />
          <Txt variant="museTitle">{c.name}</Txt>
          <Txt variant="museSmall" color={tokens.muted}>
            비서 이름도 함께 바뀌어요
          </Txt>
        </View>
        <View style={styles.grid} accessibilityRole="radiogroup">
          {AGENT_CHARACTERS.map((x) => {
            const on = x.id === picked;
            return (
              <Press key={x.id} label={`${x.name}, ${x.alt}`} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} onPress={() => setPicked(x.id)} style={[styles.tile, on && styles.tileOn]}>
                <AgentAvatar size={44} character={x.id} />
                <Txt variant="museSmall" style={{ fontFamily: on ? fonts.bold : fonts.medium }} numberOfLines={1}>
                  {x.name}
                </Txt>
                {on && (
                  <View style={styles.check}>
                    <Check size={11} weight="bold" color={tokens.onPrimary} />
                  </View>
                )}
              </Press>
            );
          })}
        </View>
        <View style={styles.nameRow} accessible accessibilityLabel={`이름 ${c.name}`}>
          <Txt variant="museBody" color={tokens.muted} style={{ flex: 1 }}>
            이름
          </Txt>
          <Txt variant="museBody" style={{ fontFamily: fonts.semibold }}>
            {c.name}
          </Txt>
        </View>
      </ScrollView>
      <View style={styles.foot}>
        {error ? (
          <Txt variant="museSmall" color={tokens.danger} style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Txt>
        ) : null}
        <Button title={picked === current ? '지금 쓰는 캐릭터예요' : '이 캐릭터로 바꾸기'} tall disabled={picked === current} loading={busy} onPress={() => onSave(picked)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.bg },
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  navTitle: { flex: 1, textAlign: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 24 },
  hero: { alignItems: 'center', gap: 4, paddingTop: 20, paddingBottom: 24 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, justifyContent: 'space-between' },
  tile: { width: '18.6%', aspectRatio: 0.82, borderRadius: 16, backgroundColor: tokens.group, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' },
  tileOn: { borderColor: tokens.primary, backgroundColor: tokens.surface },
  check: { position: 'absolute', top: -5, right: -5, width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: tokens.surface },
  nameRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, minHeight: 52, paddingHorizontal: 16, borderRadius: 14, backgroundColor: tokens.group },
  foot: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 8 },
  error: { textAlign: 'center' },
});
