// 기관: 받은 요청에 참여하기·이번 요청 불참(연동 4단계). 단추 웹 참여 화면(JoinPanel·DeclineForm)과 같은 내용.
// 참여 동의 문장과 약관 판은 단추가 준 그대로 보여 주고, 본 판을 그대로 보낸다.
// 사람이 시트의 버튼을 누른 것이 승인이다. 승인 기록과 한 번만 실행은 서버 보내기 장부가 맡는다.
import { WarningCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, radius, space, tokens, u } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction } from '@/lib/agentClient';
import { DANCHU_URL, openWeb } from '@/lib/danchuLinks';
import { DECLINE_NOTE_MAX, declineBody, joinBody } from '@/lib/labActions';

type Run = { kind: 'idle' } | { kind: 'sending' } | { kind: 'error'; message: string };

/** 승인한 동작 하나를 보내고 결과를 문장으로. 성공이면 null */
async function send(action: 'join' | 'decline', body: Record<string, unknown>, no: string): Promise<string | null> {
  try {
    const d = await draftDanchuAction('cro', action, body, no);
    const r = await approveDanchuAction('cro', d);
    if (r.status === 'sent') return null;
    const reason = typeof r.result?.error === 'string' ? r.result.error : null;
    return r.status === 'failed' ? (reason ?? '단추가 받지 않았어요. 확인하고 다시 보내 주세요') : '결과를 확인해 주세요';
  } catch {
    return '연결이 잠깐 끊겼어요';
  }
}

function ErrorLine({ message }: { message: string }) {
  return (
    <View style={styles.err} accessibilityRole="alert">
      <WarningCircle size={u(16)} weight="fill" color={tokens.danger} />
      <Txt variant="caption" color={tokens.danger} style={{ fontFamily: fonts.semibold, flex: 1 }}>
        {message}
      </Txt>
    </View>
  );
}

interface JoinProps {
  no: string;
  visible: boolean;
  join: { terms: string; consent: string; termsUrl: string };
  onClose: () => void;
  onDone: () => void;
}

export function DanchuJoinSheet({ no, visible, join, onClose, onDone }: JoinProps) {
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const sending = run.kind === 'sending';
  const close = () => {
    if (sending) return;
    setRun({ kind: 'idle' });
    onClose();
  };
  const go = async () => {
    setRun({ kind: 'sending' });
    const err = await send('join', joinBody(join.terms), no);
    if (err) return setRun({ kind: 'error', message: err });
    setRun({ kind: 'idle' });
    onDone();
  };
  return (
    <Sheet visible={visible} onClose={close}>
      <SheetBody title="이 요청에 참여할까요?" onClose={sending ? undefined : close} primary={<Button title="참여하기" tall loading={sending} onPress={() => void go()} />}>
        <View style={styles.consent}>
          <Txt variant="small" color={tokens.text}>
            {join.consent}
          </Txt>
        </View>
        <Button title="기관 이용약관" kind="text" onPress={() => openWeb(`${DANCHU_URL}${join.termsUrl}`)} />
        {run.kind === 'error' && <ErrorLine message={run.message} />}
      </SheetBody>
    </Sheet>
  );
}

interface DeclineProps {
  no: string;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function DanchuDeclineSheet({ no, visible, onClose, onDone }: DeclineProps) {
  const [run, setRun] = useState<Run>({ kind: 'idle' });
  const [reason, setReason] = useState('');
  const sending = run.kind === 'sending';
  const close = () => {
    if (sending) return;
    setRun({ kind: 'idle' });
    setReason('');
    onClose();
  };
  const go = async () => {
    setRun({ kind: 'sending' });
    const err = await send('decline', declineBody(reason), no);
    if (err) return setRun({ kind: 'error', message: err });
    setRun({ kind: 'idle' });
    setReason('');
    onDone();
  };
  return (
    <Sheet visible={visible} onClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SheetBody title="이번 요청에 불참할까요?" onClose={sending ? undefined : close} primary={<Button title="불참하기" tall loading={sending} onPress={() => void go()} />}>
          <Field label="불참 사유(선택)" value={reason} onChangeText={setReason} maxLength={DECLINE_NOTE_MAX} editable={!sending} />
          <View style={styles.notes}>
            <Txt variant="caption" color={tokens.muted}>
              사유는 단추 운영자에게만 전달
            </Txt>
            <Txt variant="caption" color={tokens.muted}>
              다음 참여 안내에 영향 없음
            </Txt>
          </View>
          {run.kind === 'error' && <ErrorLine message={run.message} />}
        </SheetBody>
      </KeyboardAvoidingView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  consent: { backgroundColor: tokens.sunken, borderRadius: radius.inner, padding: space.lg },
  notes: { marginTop: space.sm, gap: u(2) },
  err: { flexDirection: 'row', alignItems: 'center', gap: u(8), marginTop: space.md },
});
