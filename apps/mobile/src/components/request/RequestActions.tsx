// 의뢰자 요청 관리: 선정 없이 마무리, 보류한 요청 다시 열기, 첨부 추가 (2026-11-25).
// 시트·대화상자의 주 버튼을 누른 것이 승인이다. 실행은 서버 보내기 장부가 한 번만 한다(초안 → 승인 → 실행).
// 첨부는 고른 파일이 곧 승인한 내용이다: 단추에서 올릴 주소를 받고(request_file_url), 올린 뒤 단추가 확인한다(request_file_done).
import { getDocumentAsync } from 'expo-document-picker';
import { CheckCircle, Paperclip, WarningCircle } from 'phosphor-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { CheckMark } from '@/components/ui/Checkbox';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Press } from '@/components/ui/Press';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens, u } from '@/constants/theme';
import { approveDanchuAction, draftDanchuAction } from '@/lib/agentClient';
import { sendApproved } from '@/lib/danchuSend';
import { CLOSE_HELP, CLOSE_OUTCOMES, closeBody, fileProblem, putSigned, uploadConfirmed, uploadedPath, type CloseOutcome } from '@/lib/danchuRequester';
import { haptic } from '@/lib/haptics';

/** 선정 없이 마무리. 외부 진행이면 어느 기관과 하는지 적는다 */
export function CloseSheet({ no, visible, onClose, onDone }: { no: string; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [outcome, setOutcome] = useState<CloseOutcome | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(null);
    const b = closeBody(outcome, note);
    if (!b.ok) return setErr(b.error);
    setBusy(true);
    const e = await sendApproved('requester', 'request_close', b.body, no);
    setBusy(false);
    if (e) return setErr(e);
    haptic.success();
    onDone();
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onShow={() => {
        setOutcome(null);
        setNote('');
        setErr(null);
      }}
    >
      <SheetBody title="선정 없이 마무리할까요?" onClose={onClose} primary={<Button title={outcome ? '마무리하기' : '고르기 전'} tall disabled={!outcome} loading={busy} onPress={() => void go()} />}>
        <ScrollView style={{ maxHeight: u(440) }} contentContainerStyle={{ gap: space.lg }} keyboardShouldPersistTaps="handled">
          <Txt variant="small" color={tokens.muted}>
            아직 회신 중인 기관에는 마무리됐다고 알려요
          </Txt>
          <View>
            {CLOSE_OUTCOMES.map((o) => (
              <Press key={o} label={o} accessibilityRole="radio" accessibilityState={{ selected: outcome === o }} style={styles.option} onPress={() => setOutcome(o)}>
                <View style={{ flex: 1, gap: u(2) }}>
                  <Txt variant="body" style={{ fontFamily: outcome === o ? fonts.semibold : fonts.regular }}>
                    {o}
                  </Txt>
                  <Txt variant="caption" color={tokens.muted}>
                    {CLOSE_HELP[o]}
                  </Txt>
                </View>
                <CheckMark on={outcome === o} />
              </Press>
            ))}
          </View>
          {outcome && <Field label={outcome === '외부 진행' ? '진행하는 기관' : '메모(선택)'} value={note} onChangeText={setNote} maxLength={500} />}
          <Note kind="error" text={err} />
        </ScrollView>
      </SheetBody>
    </Sheet>
  );
}

/** 보류한 요청 다시 열기(비교표로 돌아가 선정). 기간·받은 견적은 단추가 본다 */
export function ReopenDialog({ no, visible, onClose, onDone }: { no: string; visible: boolean; onClose: () => void; onDone: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setErr(null);
    onClose();
  };
  const go = async () => {
    setErr(null);
    setBusy(true);
    const e = await sendApproved('requester', 'request_reopen', {}, no);
    setBusy(false);
    if (e) return setErr(e);
    haptic.success();
    onDone();
  };
  return (
    <Dialog visible={visible} onClose={close}>
      <View style={{ gap: space.md }}>
        <Txt variant="heading">보류한 요청을 다시 열까요?</Txt>
        <Txt variant="small" color={tokens.muted}>
          받은 견적으로 다시 비교해요. 유효기간이 지난 견적은 선정할 수 없어요
        </Txt>
        <Note kind="error" text={err} />
        <Button title="다시 열기" tall loading={busy} onPress={() => void go()} />
        <Button title="취소" kind="text" onPress={close} />
      </View>
    </Dialog>
  );
}

type AttachState = { kind: 'idle' } | { kind: 'busy'; name: string } | { kind: 'done'; name: string } | { kind: 'error'; text: string };

/** 요청에 첨부 추가. 참여해 회신 중인 기관에는 단추가 알린다 */
export function AttachButton({ no }: { no: string }) {
  const [s, setS] = useState<AttachState>({ kind: 'idle' });
  const pick = async () => {
    const r = await getDocumentAsync({ copyToCacheDirectory: true, multiple: false }).catch(() => null);
    const a = r && !r.canceled ? r.assets[0] : null;
    if (!a) return;
    const bad = fileProblem(a.name, a.size ?? 0);
    if (bad) return setS({ kind: 'error', text: bad });
    setS({ kind: 'busy', name: a.name });
    setS(await upload(no, { name: a.name, size: a.size ?? 0, uri: a.uri, mime: a.mimeType ?? 'application/octet-stream' }));
  };
  return (
    <View style={{ gap: u(4) }}>
      <Button title="첨부 추가" kind="text" icon={<Paperclip size={u(16)} color={tokens.text} />} loading={s.kind === 'busy'} loadingTitle="올리는 중" onPress={() => void pick()} />
      <Note kind="done" text={s.kind === 'done' ? `${s.name} 올렸어요` : null} />
      <Note kind="error" text={s.kind === 'error' ? s.text : null} />
    </View>
  );
}

async function upload(no: string, f: { name: string; size: number; uri: string; mime: string }): Promise<AttachState> {
  try {
    const d = await draftDanchuAction('requester', 'request_file_url', { name: f.name, size: f.size, type: f.mime.slice(0, 100) }, no);
    const r = await approveDanchuAction('requester', d);
    if (r.status !== 'sent') {
      const code = typeof r.result?.error === 'string' ? r.result.error : null;
      return { kind: 'error', text: r.status === 'failed' ? (code && /[가-힣]/.test(code) ? code : '단추가 받지 않았어요') : '결과 확인 필요' };
    }
    const target = uploadedPath(r.result);
    // 같은 이름·크기의 파일을 이미 올렸다
    if (!target) return { kind: 'done', name: f.name };
    await putSigned(target.signedUrl, f);
    const dd = await draftDanchuAction('requester', 'request_file_done', { paths: [target.path] }, no);
    const done = await approveDanchuAction('requester', dd);
    if (done.status === 'sent' && uploadConfirmed(done.result)) return { kind: 'done', name: f.name };
    return { kind: 'error', text: done.status === 'unknown' ? '결과 확인 필요' : '단추가 파일을 확인하지 못했어요. 다시 올려 주세요' };
  } catch {
    return { kind: 'error', text: '올리지 못했어요. 다시 시도해 주세요' };
  }
}

function Note({ kind, text }: { kind: 'error' | 'done'; text: string | null }) {
  if (!text) return null;
  const color = kind === 'error' ? tokens.danger : tokens.accent;
  const Icon = kind === 'error' ? WarningCircle : CheckCircle;
  return (
    <View style={styles.note} accessibilityRole={kind === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite">
      <Icon size={u(16)} weight="fill" color={color} />
      <Txt variant="caption" color={color} style={{ flex: 1, fontFamily: fonts.semibold }}>
        {text}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', minHeight: u(60), paddingVertical: u(8), borderTopWidth: 1, borderTopColor: tokens.border, gap: space.md },
  note: { flexDirection: 'row', alignItems: 'center', gap: u(6) },
});
