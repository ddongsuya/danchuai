// 설정 › 비서 캐릭터(시안 원본 m14). 큰 미리보기, 10종 격자, 이름, "이 캐릭터로 바꾸기".
// 이름은 캐릭터 이름을 따른다. 고른 값은 계정별로 서버에 저장한다(시연 모드는 기기에).
import { AGENT_CHARACTERS, characterOf, type AgentCharacterId } from '@danchuai/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AgentAvatar } from '@/components/agent/AgentAvatar';
import { MIcon } from '@/components/ui/MIcon';
import { FullPage } from '@/components/ui/Muse';
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

/** 화면 모양만(미리보기에서도 쓴다). 시안 원본 m14: 덮는 흰 판, 큰 미리보기 150, 다섯 칸 격자, 이름 줄, 아래 "이 캐릭터로 바꾸기" */
export function CharacterView({ current, initial, busy, error, onSave }: { current: AgentCharacterId; initial?: AgentCharacterId; busy?: boolean; error?: string | null; onSave: (id: AgentCharacterId) => void }) {
  const [picked, setPicked] = useState<AgentCharacterId>(initial ?? current);
  const c = characterOf(picked);
  return (
    <FullPage
      title="비서 캐릭터"
      bg="#ffffff"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      foot={
        <View style={{ gap: 8 }}>
          {error ? (
            <Txt variant="mSmall" color={tokens.danger} style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Txt>
          ) : null}
          <Press label={picked === current ? '지금 쓰는 캐릭터예요' : '이 캐릭터로 바꾸기'} disabled={picked === current || busy} onPress={() => onSave(picked)} style={[styles.save, picked === current && styles.saveOff]}>
            <Txt style={styles.saveText} color={picked === current ? tokens.muted : tokens.onPrimary}>
              {busy ? '바꾸는 중이에요' : picked === current ? '지금 쓰는 캐릭터예요' : '이 캐릭터로 바꾸기'}
            </Txt>
          </Press>
        </View>
      }
    >
      <View style={styles.hero}>
        <AgentAvatar size={150} character={picked} />
        <Txt style={styles.heroName}>{c.name}</Txt>
        <Txt style={styles.heroSub} color={tokens.muted}>
          비서 이름도 함께 바뀌어요
        </Txt>
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {AGENT_CHARACTERS.map((x) => {
          const on = x.id === picked;
          return (
            <Press key={x.id} label={`${x.name}, ${x.alt}`} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} onPress={() => setPicked(x.id)} style={[styles.tile, on && styles.tileOn]}>
              {on && (
                <View style={styles.check}>
                  <MIcon name="check" size={12} width={2.6} color={tokens.onPrimary} />
                </View>
              )}
              <AgentAvatar size={52} character={x.id} />
              <Txt style={[styles.tileName, { fontFamily: on ? fonts.bold : fonts.medium }]} numberOfLines={1}>
                {x.name}
              </Txt>
            </Press>
          );
        })}
      </View>
      <View style={styles.nameRow} accessible accessibilityLabel={`이름 ${c.name}`}>
        <Txt style={styles.nameLabel}>이름</Txt>
        <Txt style={styles.nameValue}>{c.name}</Txt>
        <MIcon name="pencil" size={16} color={tokens.muted} />
      </View>
    </FullPage>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 10 },
  heroName: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 28, marginTop: -6, color: tokens.text },
  heroSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19.5 },
  // 다섯 칸, 사이 8
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  tile: { width: '18.2%', flexGrow: 1, borderRadius: 18, backgroundColor: tokens.group, paddingTop: 8, paddingHorizontal: 4, paddingBottom: 6, alignItems: 'center', gap: 2 },
  tileOn: { backgroundColor: tokens.pickBg, borderWidth: 2.5, borderColor: tokens.primary, paddingTop: 5.5, paddingHorizontal: 1.5, paddingBottom: 3.5 },
  tileName: { fontSize: 12.5, lineHeight: 18, color: tokens.text },
  check: { position: 'absolute', top: 6, right: 6, zIndex: 1, width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: tokens.group, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
  nameLabel: { flex: 1, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: tokens.text },
  nameValue: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: tokens.text },
  save: { height: 48, borderRadius: 24, backgroundColor: tokens.primary, alignItems: 'center', justifyContent: 'center' },
  saveOff: { backgroundColor: tokens.selected },
  saveText: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  error: { textAlign: 'center' },
});
