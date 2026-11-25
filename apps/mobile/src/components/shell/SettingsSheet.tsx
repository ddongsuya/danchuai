// 설정 시트(시안 원본 m12): 대화 위로 덮는 #f4f5f7 판, 오른쪽 위 흰 닫기 원, "설정" 24 굵게,
// 사용량 묶음(이번 달 사용량 %, 초기화 날짜, 6px 막대, 요금제 보기), 흰 묶음 목록.
// 앱에 있는 곳만 둔다: 비서 캐릭터·권한 / 계정 / (시연 모드만) 화면 바꾸기. 사용량은 서버가 계산한 값 그대로.
import { router, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MIcon } from '@/components/ui/MIcon';
import { FullSheet, Group, Li } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { agentConfigured, getUsage, type AgentRole, type UsageView } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';

import { CircleButton } from './AgentHeader';

export function SettingsSheet({ visible, onClose, role, demo, onSwitchRole }: { visible: boolean; onClose: () => void; role: AgentRole; demo: boolean; onSwitchRole?: () => void }) {
  const [usage, setUsage] = useState<UsageView | null | 'error'>(null);
  useEffect(() => {
    if (!visible || !agentConfigured()) return;
    let live = true;
    getUsage(role)
      .then((u) => live && setUsage(u))
      .catch(() => live && setUsage('error'));
    return () => {
      live = false;
    };
  }, [visible, role]);
  return (
    <FullSheet visible={visible} onClose={onClose}>
      <SettingsBody usage={usage} role={role} demo={demo} onClose={onClose} onSwitchRole={onSwitchRole} />
    </FullSheet>
  );
}

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;

/** 시트 안쪽(미리보기에서도 쓴다) */
export function SettingsBody({ usage, role, demo, onClose, onSwitchRole }: { usage: UsageView | null | 'error'; role: AgentRole; demo: boolean; onClose: () => void; onSwitchRole?: () => void }) {
  const go = (href: Href) => {
    onClose();
    router.push(href);
  };
  const u = usage && usage !== 'error' ? usage : null;
  return (
    <View>
      <View style={styles.top}>
        <CircleButton label="닫기" onPress={onClose}>
          <MIcon name="close" />
        </CircleButton>
      </View>
      <Txt style={styles.title} accessibilityRole="header">
        설정
      </Txt>
      <Group style={styles.usage}>
        <View style={styles.usageHead}>
          <Txt style={styles.plan}>이번 달 사용량</Txt>
          <Txt style={styles.small} color={tokens.muted} tabular>
            {usage === 'error' ? '불러오지 못했어요' : !u ? '세는 중이에요' : u.percent === null ? '한도 없음' : `${u.percent}% 사용`}
          </Txt>
        </View>
        <Txt style={styles.reset} color={tokens.muted}>
          {u ? `${md(u.resetsOn)}에 초기화돼요` : '매달 1일에 초기화돼요'}
        </Txt>
        <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={u?.percent != null ? { min: 0, max: 100, now: u.percent } : undefined}>
          <View style={[styles.fill, { width: `${u?.percent ?? 0}%` }]} />
        </View>
        {role === 'cro' ? (
          <Press label="요금제 보기" onPress={() => void openWeb(`${DANCHU_URL}/cro/billing`).catch(() => undefined)} style={styles.link}>
            <Txt style={styles.linkText} color={tokens.link}>
              요금제 보기
            </Txt>
          </Press>
        ) : null}
      </Group>
      <Group style={styles.gap}>
        <Li first icon="brush" title="비서 캐릭터" onPress={() => go('/account/character' as Href)} />
        <Li icon="shield" title="권한" onPress={() => go('/account/permissions' as Href)} />
      </Group>
      <Group style={styles.gap}>
        <Li first icon="person" title="계정" onPress={() => go('/account' as Href)} />
        <Li icon="info" title="가이드라인 질문" onPress={() => go({ pathname: '/ask', params: { role } })} />
      </Group>
      {demo && onSwitchRole ? (
        <Group>
          <Li
            first
            icon="phone"
            title={role === 'cro' ? '의뢰자 화면으로 바꾸기' : '기관 화면으로 바꾸기'}
            onPress={() => {
              onClose();
              onSwitchRole();
            }}
          />
        </Group>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'flex-end' },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 32, marginTop: 2, marginHorizontal: 4, marginBottom: 14, color: tokens.text },
  usage: { paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, marginBottom: 12 },
  usageHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plan: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: tokens.text },
  small: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  reset: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, marginTop: 2, marginBottom: 8 },
  bar: { height: 6, borderRadius: 3, backgroundColor: tokens.selected, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: tokens.primary },
  link: { marginTop: 12, minHeight: 24, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  gap: { marginBottom: 12 },
});
