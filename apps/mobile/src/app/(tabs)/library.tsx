// 자료 탭(시안 원본 m08). 결과물/파일 두 칸 전환 + 문서 줄(문서 그림, 이름 500, "결과물, 오늘 14:20", 점 세 개),
// 맨 아래 "비서가 만든 견적서와 보고서는 모두 여기 모여요". 줄을 누르면 그 요청 화면으로 간다.
// 파일은 단추에 올린 첨부를 앱에서 아직 목록으로 읽지 못해 빈 화면으로 둔다.
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CircleButton } from '@/components/shell/AgentHeader';
import { useShell } from '@/components/shell/ShellContext';
import { TabPage } from '@/components/shell/TabPage';
import { Button } from '@/components/ui/Button';
import { MIcon } from '@/components/ui/MIcon';
import { Seg2 } from '@/components/ui/Muse';
import { Press } from '@/components/ui/Press';
import { StateView } from '@/components/ui/StateView';
import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';
import { REMOTE_ERROR, useRemote } from '@/hooks/useRemote';
import { agentConfigured, listRuns, listSent, type AgentRole } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { libraryRows, whenShort, type DocRow } from '@/lib/library';

export default function LibraryTab() {
  const { role } = useShell();
  const live = agentConfigured();
  const load = useCallback(
    () => (role === 'cro' ? Promise.all([listSent('cro'), listRuns().catch(() => [])]).then(([s, r]) => libraryRows(s, r)) : listSent('requester').then((s) => libraryRows(s))),
    [role],
  );
  const { state, reload } = useRemote<DocRow[]>(load, live);
  return <LibraryView role={role} rows={!live ? [] : state.kind === 'ready' ? state.data : null} error={!live ? '아직 연결하는 중이에요' : state.kind === 'error' ? REMOTE_ERROR[state.code] : null} onRetry={() => void reload()} />;
}

type Pane = 'made' | 'files';

/** 화면 모양만(미리보기에서도 쓴다) */
export function LibraryView({ role, rows, error, onRetry, now }: { role: AgentRole; rows: DocRow[] | null; error: string | null; onRetry: () => void; now?: Date }) {
  const [pane, setPane] = useState<Pane>('made');
  const open = (r: DocRow) => {
    if (!r.rfqNo) return;
    router.push(role === 'cro' ? { pathname: '/lab/[id]', params: { id: r.rfqNo } } : { pathname: '/requester/[id]', params: { id: r.rfqNo } });
  };
  return (
    <TabPage
      right={
        <CircleButton label="단추에서 보기" onPress={() => void openWeb(`${DANCHU_URL}${role === 'cro' ? '/cro/docs' : '/app'}`).catch(() => undefined)}>
          <MIcon name="more" />
        </CircleButton>
      }
    >
      <View style={{ marginBottom: 10 }}>
        <Seg2
          items={[
            { key: 'made' as Pane, label: '결과물' },
            { key: 'files' as Pane, label: '파일' },
          ]}
          value={pane}
          onChange={setPane}
        />
      </View>
      {pane === 'files' ? (
        <StateView tone="empty" title="아직 모아 둔 파일이 없어요" reason="요청에 붙인 첨부는 단추 요청 화면에 있어요" />
      ) : error ? (
        <StateView tone="error" title={error} actions={<Button title="다시 시도" kind="soft" tall onPress={onRetry} />} />
      ) : rows === null ? (
        <View accessibilityLabel="불러오는 중이에요" accessibilityRole="progressbar" style={{ gap: 14, paddingVertical: 12 }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={styles.bone} />
          ))}
        </View>
      ) : (
        <>
          {rows.map((r) => (
            <Press key={r.id} label={r.title} disabled={!r.rfqNo} onPress={() => open(r)} style={styles.row}>
              <MIcon name="doc" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={styles.name} numberOfLines={1}>
                  {r.title}
                </Txt>
                <Txt style={styles.sub} color={tokens.muted} tabular>
                  {`결과물, ${whenShort(r.at, now)}`}
                </Txt>
              </View>
              <MIcon name="more" size={18} color={tokens.icon2} />
            </Press>
          ))}
          <Txt style={styles.foot} color={tokens.muted}>
            {rows.length ? '비서가 만든 견적서와 보고서는 모두 여기 모여요' : '비서가 만든 견적서와 보고서는 여기 모여요'}
          </Txt>
        </>
      )}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 2 },
  name: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22.5 },
  sub: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  foot: { marginTop: 28, textAlign: 'center', fontFamily: fonts.regular, fontSize: 13, lineHeight: 19.5 },
  bone: { height: 40, borderRadius: 10, backgroundColor: tokens.sunken },
});
