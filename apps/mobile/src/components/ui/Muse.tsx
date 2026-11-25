// 시안 원본(muse.css)의 작은 부품: 쪽 제목(.h1), 글 한 줄(.post), 묶음(.grp)·줄(.li), 두 칸·다섯 칸 전환(.seg2·.seg5),
// 묶음 이름(.sec), 체크칸(.chk), 두 단추(.b2), 아래 시트(.sheet), 덮는 시트(.full). 값은 muse.css 그대로.
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MIcon, type MIconName } from '@/components/ui/MIcon';
import { Press } from '@/components/ui/Press';
import { Spinner } from '@/components/ui/Spinner';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';

/** 색 칸 그림의 바탕·선 색(소식·맡길 일) */
export const PIC = {
  blue: { bg: tokens.tintBlue, fg: '#0447d6' },
  yellow: { bg: tokens.tintYellow, fg: '#a86b00' },
  purple: { bg: tokens.tintPurple, fg: '#6a43d6' },
  green: { bg: tokens.tintGreen, fg: '#2f9e57' },
} as const;
export type PicTone = keyof typeof PIC;

/** .h1: 22 굵게, 자간 -0.4, 아래 10 */
export function H1({ children }: { children: string }) {
  return (
    <Txt variant="mH1" accessibilityRole="header" style={{ marginHorizontal: 2, marginBottom: 10 }}>
      {children}
    </Txt>
  );
}

/** .post: 색 칸 32(반지름 9) + 굵은 제목 15 + 본문 13.5. 아래 선 */
export function Post({ tone, icon, title, body, bodyMuted, last, onPress, label, children }: { tone: PicTone; icon: MIconName; title: string; body?: string; bodyMuted?: boolean; last?: boolean; onPress?: () => void; label?: string; children?: ReactNode }) {
  const inner = (
    <>
      <View style={[s.pic, { backgroundColor: PIC[tone].bg }]}>
        <MIcon name={icon} size={17} color={PIC[tone].fg} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="mPost" style={{ marginBottom: 3 }}>
          {title}
        </Txt>
        {body ? (
          <Txt variant="mPostBody" color={bodyMuted ? tokens.muted : tokens.sub}>
            {body}
          </Txt>
        ) : null}
        {children}
      </View>
    </>
  );
  return onPress ? (
    <Press label={label ?? title} onPress={onPress} style={[s.post, last && s.noLine]}>
      {inner}
    </Press>
  ) : (
    <View style={[s.post, last && s.noLine]}>{inner}</View>
  );
}

/** 숫자 정보 상자(#f4f5f7, 반지름 12): 이름은 회색 왼쪽, 값은 오른쪽 */
export function InfoBox({ rows }: { rows: [string, string][] }) {
  return (
    <View style={s.info}>
      {rows.map(([k, v]) => (
        <View key={k} style={s.infoRow}>
          <Txt style={s.infoText} color={tokens.muted}>
            {k}
          </Txt>
          <Txt style={s.infoText} tabular>
            {v}
          </Txt>
        </View>
      ))}
    </View>
  );
}

/** .grp: 흰 묶음, 반지름 16 */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.grp, style]}>{children}</View>;
}

/** .li: 안쪽 13/14, 글 15, 사이 12, 위 선(첫 줄 빼고). 오른쪽 값(.v)은 회색 14 + 꺾쇠 */
export function Li({ icon, title, sub, value, first, chevron = true, right, onPress, label, selected }: { icon?: MIconName; title: string; sub?: string; value?: string; first?: boolean; chevron?: boolean; right?: ReactNode; onPress?: () => void; label?: string; selected?: boolean }) {
  const inner = (
    <>
      {icon ? <MIcon name={icon} size={19} /> : null}
      <View style={{ flex: 1 }}>
        <Txt variant="mBody">{title}</Txt>
        {sub ? (
          <Txt style={s.liSub} color={tokens.muted}>
            {sub}
          </Txt>
        ) : null}
      </View>
      <View style={s.v}>
        {value ? (
          <Txt style={s.vText} color={tokens.muted} tabular>
            {value}
          </Txt>
        ) : null}
        {right}
        {chevron && onPress && !right ? <MIcon name="chevron" size={16} color={tokens.muted} /> : null}
      </View>
    </>
  );
  const style = [s.li, !first && s.liLine, sub ? s.liTop : null];
  return onPress ? (
    <Press label={label ?? title} onPress={onPress} style={style} accessibilityState={selected !== undefined ? { selected } : undefined} accessibilityRole={selected !== undefined ? 'radio' : 'button'}>
      {inner}
    </Press>
  ) : (
    <View style={style} accessible accessibilityLabel={label ?? [title, sub, value].filter(Boolean).join(', ')}>
      {inner}
    </View>
  );
}

/** 묶음 위 작은 이름(12.5 회색 600) */
export function GroupLabel({ children }: { children: string }) {
  return (
    <Txt style={s.gl} color={tokens.muted}>
      {children}
    </Txt>
  );
}

/** .seg2: 두 칸 전환(#f6f6f7 바탕, 고른 칸은 흰 + 그림자) */
export function Seg2<K extends string>({ items, value, onChange }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Press key={it.key} label={it.label} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)} style={[s.segItem, on && s.seg2On]}>
            <Txt style={s.segText}>{it.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** .seg5: 그림 다섯 칸 전환(고른 칸 #e6e6e9) */
export function Seg5<K extends string>({ items, value, onChange }: { items: { key: K; label: string; icon: MIconName }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={[s.seg, { marginVertical: 12 }]} accessibilityRole="tablist">
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Press key={it.key} label={it.label} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(it.key)} style={[s.segItem, on && s.seg5On]}>
            <MIcon name={it.icon} size={20} />
          </Press>
        );
      })}
    </View>
  );
}

/** .sec: 점 8 + 묶음 이름(600 14) */
export function Sec({ color, children, first }: { color: string; children: string; first?: boolean }) {
  return (
    <View style={[s.sec, !first && { paddingTop: 16 }]} accessibilityRole="header">
      <View style={[s.dot, { backgroundColor: color }]} />
      <Txt style={s.secText} color={color}>
        {children}
      </Txt>
    </View>
  );
}

/** .item: 왼쪽(체크칸 등) + 제목 15 600 + 설명 13 회색 + 점 세 개 */
export function Item({ lead, title, sub, onMore, onPress, label }: { lead: ReactNode; title: string; sub?: string; onMore?: () => void; onPress?: () => void; label?: string }) {
  const body = (
    <View style={{ flex: 1 }}>
      <Txt variant="mItem">{title}</Txt>
      {sub ? (
        <Txt variant="mItemSub" color={tokens.muted}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
  return (
    <View style={s.item}>
      {lead}
      {onPress ? (
        <Press label={label ?? title} onPress={onPress} style={{ flex: 1 }}>
          {body}
        </Press>
      ) : (
        body
      )}
      {onMore ? (
        <Press label={`${title} 더보기`} onPress={onMore} style={s.kebab}>
          <MIcon name="more" size={18} color={tokens.icon2} />
        </Press>
      ) : null}
    </View>
  );
}

/** .chk: 20 체크칸(테두리 1.8 #9a9aa0, 반지름 5). 고르면 파랑 */
export function Chk({ on, onPress, label }: { on: boolean; onPress: () => void; label: string }) {
  return (
    <Press label={label} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress} style={s.chkHit}>
      <View style={[s.chk, on && s.chkOn]}>{on ? <MIcon name="check" size={14} width={2.4} color={tokens.onPrimary} /> : null}</View>
    </Press>
  );
}

/** .b2: 같은 폭 두 단추(회색·파랑, 높이 40) */
export function Buttons2({ left, right, onLeft, onRight, busy, disabled, height = 40, leftWhite }: { left: string; right: string; onLeft: () => void; onRight: () => void; busy?: boolean; disabled?: boolean; height?: number; leftWhite?: boolean }) {
  return (
    <View style={s.b2}>
      <Press label={left} disabled={busy || disabled} onPress={onLeft} style={[s.b2Btn, { height, backgroundColor: leftWhite ? '#ffffff' : tokens.selected }]}>
        <Txt style={s.b2Text}>{left}</Txt>
      </Press>
      <Press label={right} disabled={busy || disabled} onPress={onRight} style={[s.b2Btn, { height, backgroundColor: disabled ? tokens.selected : tokens.primary }]}>
        {busy ? <Spinner size={16} color={tokens.onPrimary} /> : <Txt style={s.b2Text} color={disabled ? tokens.muted : tokens.onPrimary}>{right}</Txt>}
      </Press>
    </View>
  );
}

/** .sheet: 아래 시트(좌우·아래 8, 반지름 34, 안쪽 22/20/18, 사이 12). 뒤는 .dim 32% */
export function BottomSheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: ReactNode; label: string }) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.32)' }]} accessibilityLabel="닫기" onPress={onClose} />
      <SafeAreaView edges={['bottom']} style={s.sheetWrap} pointerEvents="box-none">
        <View style={s.sheet} accessibilityViewIsModal accessibilityLabel={label}>
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** .full: 위 44 아래로 덮는 시트(반지름 34 34 0 0, 안쪽 16). 뒤는 어둡게(dim) */
export function FullSheet({ visible, onClose, children, bg = tokens.group, dim = 'rgba(0,0,0,0.22)' }: { visible: boolean; onClose: () => void; children: ReactNode; bg?: string; dim?: string }) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: dim }]} accessibilityLabel="닫기" onPress={onClose} />
      <View style={[s.full, { backgroundColor: bg }]} accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

/** 주소로 여는 덮는 화면(시안 m13·m14): 뒤 #c9c9c9, 위 44부터 판(반지름 34 34 0 0), 맨 위 뒤로 원 + 가운데 제목 600 */
export function FullPage({ title, onBack, bg = tokens.group, children, foot }: { title: string; onBack: () => void; bg?: string; children: ReactNode; foot?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.pageRoot, { paddingTop: Math.max(insets.top, 44) }]}>
      <View style={[s.pagePanel, { backgroundColor: bg }]}>
        <View style={s.pageHead}>
          <Press label="뒤로" onPress={onBack} style={s.pageBack}>
            <MIcon name="back" />
          </Press>
          <Txt style={s.pageTitle} accessibilityRole="header">
            {title}
          </Txt>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: foot ? 96 : 32 }}>{children}</ScrollView>
        {foot ? <View style={[s.pageFoot, { bottom: Math.max(insets.bottom, 30) }]}>{foot}</View> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pageRoot: { flex: 1, backgroundColor: tokens.backdrop },
  pagePanel: { flex: 1, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 16, paddingHorizontal: 16 },
  pageHead: { height: 42, alignItems: 'center', justifyContent: 'center' },
  pageBack: { position: 'absolute', left: 0, top: 0, width: 42, height: 42, borderRadius: 21, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  pageTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22 },
  pageFoot: { position: 'absolute', left: 16, right: 16 },
  post: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: tokens.line },
  noLine: { borderBottomWidth: 0 },
  pic: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  info: { marginTop: 8, backgroundColor: tokens.group, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, gap: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between' },
  infoText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19.5 },
  grp: { backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden' },
  li: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  liTop: { alignItems: 'flex-start' },
  liLine: { borderTopWidth: 1, borderTopColor: tokens.line },
  liSub: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  v: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  vText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
  gl: { fontFamily: fonts.semibold, fontSize: 12.5, lineHeight: 18, marginTop: 18, marginBottom: 6, marginHorizontal: 6 },
  seg: { flexDirection: 'row', backgroundColor: tokens.seg, borderRadius: 999, padding: 4 },
  segItem: { flex: 1, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  seg2On: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  seg5On: { backgroundColor: tokens.segOn },
  segText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  sec: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 12, paddingHorizontal: 2, paddingBottom: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  secText: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 21 },
  item: { flexDirection: 'row', gap: 10, paddingVertical: 10, paddingHorizontal: 2 },
  kebab: { width: 28, height: 28, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', marginTop: -2 },
  chkHit: { width: 24, height: 24, alignItems: 'flex-start', justifyContent: 'flex-start', paddingTop: 2 },
  chk: { width: 20, height: 20, borderWidth: 1.8, borderColor: tokens.icon2, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  chkOn: { backgroundColor: tokens.primary, borderColor: tokens.primary },
  b2: { flexDirection: 'row', gap: 8 },
  b2Btn: { flex: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  b2Text: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 20 },
  sheetWrap: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  sheet: { backgroundColor: '#ffffff', borderRadius: 34, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18, gap: 12 },
  full: { position: 'absolute', top: 44, left: 0, right: 0, bottom: 0, borderTopLeftRadius: 34, borderTopRightRadius: 34, paddingTop: 16, paddingHorizontal: 16 },
});
