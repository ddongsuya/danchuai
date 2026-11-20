// 근거 원문 목록 시트. 질문하기 답의 근거와 질문 카드의 근거가 같이 쓴다.
// 원문 조각(excerpt)이 있으면 조항 아래 인용 상자로 보여 준다(질문 카드).
import * as WebBrowser from 'expo-web-browser';
import { ArrowSquareOut } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { space, tokens, u } from '@/constants/theme';
import type { SourceRef } from '@/lib/chat';

export type SourceItem = SourceRef & { excerpt?: string };

export function SourcesSheet({ sources, onClose }: { sources: SourceItem[] | null; onClose: () => void }) {
  // 닫히는 동안에도 마지막 목록을 그대로 보여 준다.
  const [last, setLast] = useState<SourceItem[] | null>(sources);
  if (sources && sources !== last) setLast(sources);
  const shown = sources ?? last ?? [];
  return (
    <Sheet visible={!!sources} onClose={onClose}>
      {/* 할 일이 읽기뿐이라 주 버튼 없이 글자 닫기만 */}
      <SheetBody title={`근거 ${shown.length}건`} onClose={onClose}>
        <ScrollView style={{ maxHeight: u(420) }}>
          {shown.map((s, i) => (
            <View key={`${s.doc}-${s.section}`} style={i > 0 && styles.line}>
              <Press
                label={`${s.doc} ${s.section}${s.url ? ', 원문 열기' : ''}`}
                disabled={!s.url}
                onPress={s.url ? () => void WebBrowser.openBrowserAsync(s.url!) : undefined}
                style={styles.src}
              >
                <View style={{ flex: 1, gap: u(2) }}>
                  <Txt variant="label">{s.doc}</Txt>
                  <Txt variant="caption" color={tokens.muted} numberOfLines={2}>
                    {(s.excerpt ? [s.section, s.version] : [s.section, s.name, s.version]).filter(Boolean).join(', ')}
                  </Txt>
                </View>
                {s.url && <ArrowSquareOut size={u(18)} color={tokens.muted} />}
              </Press>
              {s.excerpt ? (
                <View style={styles.quote}>
                  <Txt variant="small">{s.excerpt}</Txt>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  line: { borderTopWidth: 1, borderTopColor: tokens.border },
  src: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: u(60), paddingVertical: space.md },
  quote: { marginBottom: space.md, paddingVertical: u(10), paddingHorizontal: u(12), borderRadius: u(12), backgroundColor: tokens.sunken },
});
