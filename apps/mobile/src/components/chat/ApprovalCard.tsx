// 보내기 전 승인 카드. 입력창 자리에 올라온다(ChatGPT Codex 승인 카드 방식).
// 규칙: 실제로 나갈 본문 원문·받는 곳·첨부를 그대로 보여 준다. "항상 승인" 같은 일괄 승인은 없다.
// 실제 승인 기록(epoch + 본문 해시)과 한 번만 보내기는 서버(/v1/outbound/:id/decision, /dispatch)가 맡는다.
import { EyeSlash, HourglassMedium, PaperPlaneTilt, Paperclip, ShieldCheck, User } from 'phosphor-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { lineEnter } from '@/lib/motion';

export interface Recipient {
  id: string;
  short?: string;
  name: string;
}

interface Props {
  title: string;
  recipients: Recipient[];
  body: string;
  attachment: string;
  hideRequester?: boolean;
  guardPassed: boolean;
  onEdit: () => void;
  onApprove: () => void;
}

export function ApprovalCard({ title, recipients, body, attachment, hideRequester, guardPassed, onEdit, onApprove }: Props) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={lineEnter(0, reduced)} style={styles.card} accessibilityViewIsModal>
      <View style={styles.head}>
        <Txt variant="heading" style={{ flex: 1 }} accessibilityRole="header">
          {title}
        </Txt>
        <Chip label="승인 대기" kind="wait" icon={(c) => <HourglassMedium size={u(13)} weight="bold" color={c} />} />
      </View>
      <View style={styles.to} accessibilityLabel={`받는 곳 ${recipients.map((r) => r.name).join(', ')}`}>
        {recipients.map((r) => (
          <View key={r.id} style={styles.who}>
            <View style={styles.av}>
              {r.short ? (
                <Txt variant="caption" color={tokens.muted} style={{ fontFamily: fonts.bold, fontSize: u(12) }}>
                  {r.short}
                </Txt>
              ) : (
                <User size={u(13)} color={tokens.muted} />
              )}
            </View>
            <Txt variant="small" style={{ fontFamily: fonts.semibold }}>
              {r.name}
            </Txt>
          </View>
        ))}
      </View>
      <View style={styles.body}>
        <Txt variant="small" style={{ fontSize: u(14.5), lineHeight: u(24) }} selectable>
          {body}
        </Txt>
      </View>
      <View style={styles.meta}>
        <Meta icon={<Paperclip size={u(16)} color={tokens.muted} />} label={attachment} />
        {hideRequester && <Meta icon={<EyeSlash size={u(16)} color={tokens.muted} />} label="의뢰자 정보 선정 후 공개" />}
        {guardPassed && <Meta icon={<ShieldCheck size={u(16)} weight="bold" color={tokens.accent} />} label="본문 점검 통과" accent />}
      </View>
      <View style={styles.act}>
        <Button title="고치기" kind="soft" tall flex={1} onPress={onEdit} />
        <Button
          title="승인하고 보내기"
          tall
          flex={1.7}
          disabled={!guardPassed}
          onPress={onApprove}
          icon={<PaperPlaneTilt size={u(18)} weight="bold" color={tokens.onInk} />}
        />
      </View>
    </Animated.View>
  );
}

function Meta({ icon, label, accent }: { icon: ReactNode; label: string; accent?: boolean }) {
  return (
    <View style={styles.metaRow}>
      {icon}
      <Txt variant="caption" color={accent ? tokens.accent : tokens.muted} style={accent && { fontFamily: fonts.semibold }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: space.sm,
    backgroundColor: tokens.surface,
    borderRadius: radius.approval,
    borderWidth: 1,
    borderColor: tokens.border,
    paddingTop: u(18),
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    shadowColor: tokens.ink,
    shadowOpacity: 0.16,
    shadowRadius: u(24),
    shadowOffset: { width: 0, height: u(10) },
    elevation: 8,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: u(10) },
  to: { flexDirection: 'row', flexWrap: 'wrap', gap: u(6), marginTop: u(14) },
  who: { flexDirection: 'row', alignItems: 'center', gap: u(7), height: u(32), paddingLeft: u(4), paddingRight: u(12), borderRadius: radius.pill, backgroundColor: tokens.sunken },
  av: { width: u(24), height: u(24), borderRadius: u(12), backgroundColor: tokens.surface, alignItems: 'center', justifyContent: 'center' },
  body: { marginTop: space.md, backgroundColor: tokens.sunken, borderRadius: radius.inner, padding: u(14) },
  meta: { marginTop: space.md, gap: space.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  act: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
});
