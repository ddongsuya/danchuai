// 회의 녹음 시트(2026-11-20, 녹음 전사). 비서 화면 위 마이크 버튼에서 연다.
// 순서: 참석자 동의 확인 → 녹음(또는 녹음 파일 고르기) → 글로 옮기기 → 비서에게 정리 맡기기(미팅 기록·할 일).
// 녹음은 서버를 거치지 않고 전사 서비스(Deepgram, 미국)로 바로 간다. 앱·서버 어디에도 녹음과 전사본을 남기지 않는다.
// 녹음 중 표시만 빨강(위험색 점), 글로 옮기는 동안은 청록(에이전트가 일하는 중).
import { getDocumentAsync } from 'expo-document-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { FileAudio, Microphone, Stop } from 'phosphor-react-native';
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { StepLog } from '@/components/chat/Messages';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Sheet, SheetBody } from '@/components/ui/Sheet';
import { Txt } from '@/components/ui/Txt';
import { fonts, space, tokens, u } from '@/constants/theme';
import { getSttTicket } from '@/lib/agentClient';
import { audioMime, minutesFromSize, sttFailureOf, transcribe, type SttFailure } from '@/lib/transcribe';

/** 녹음 상한(분). 서버 STT_MAX_MINUTES 기본값과 같다 */
export const MAX_MINUTES = 180;

/** 말소리용: 한 채널 64kbps(한 시간 약 29MB) */
const PRESET = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000, web: { mimeType: 'audio/webm', bitsPerSecond: 64_000 } };

const FAIL: Record<SttFailure | 'mic', string> = {
  not_configured: '아직 회의 녹음을 쓸 수 없어요',
  usage_limit: '이번 달 쓸 수 있는 만큼 다 썼어요',
  too_long: `${MAX_MINUTES}분까지 옮길 수 있어요`,
  stt_failed: '글로 옮기지 못했어요. 한 번 더 해 볼까요?',
  empty: '들리는 말이 없었어요. 한 번 더 녹음해 볼까요?',
  network: '연결이 잠깐 끊겼어요',
  mic: '마이크 권한이 필요해요',
};

type Phase =
  | { kind: 'ready' }
  | { kind: 'recording' }
  | { kind: 'recorded'; uri: string; mime: string; minutes: number; label: string }
  | { kind: 'working'; minutes: number }
  | { kind: 'error'; code: SttFailure | 'mic'; back: Phase | null };

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};

export function RecordSheet({ visible, onClose, onTranscript }: { visible: boolean; onClose: () => void; onTranscript: (transcript: string, minutes: number) => void }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      {visible ? <RecordBody onClose={onClose} onTranscript={onTranscript} /> : null}
    </Sheet>
  );
}

function RecordBody({ onClose, onTranscript }: { onClose: () => void; onTranscript: (transcript: string, minutes: number) => void }) {
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });
  const recorder = useAudioRecorder(PRESET);
  const rec = useAudioRecorderState(recorder, 500);
  const stopping = useRef(false);

  const start = async () => {
    const p = await requestRecordingPermissionsAsync().catch(() => null);
    if (!p?.granted) return setPhase({ kind: 'error', code: 'mic', back: { kind: 'ready' } });
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase({ kind: 'recording' });
    } catch {
      setPhase({ kind: 'error', code: 'mic', back: { kind: 'ready' } });
    }
  };

  const stop = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const ms = rec.durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) throw new Error('no_uri');
      setPhase({ kind: 'recorded', uri, mime: Platform.OS === 'web' ? 'audio/webm' : 'audio/mp4', minutes: Math.max(1, Math.ceil(ms / 60_000)), label: `${mmss(ms)} 녹음` });
    } catch {
      setPhase({ kind: 'error', code: 'stt_failed', back: { kind: 'ready' } });
    } finally {
      stopping.current = false;
    }
  };

  // 상한에 닿으면 멈춘다
  // 녹음하는 동안 화면이 꺼지지 않게 한다(잠기면 휴대폰이 녹음을 멈춘다)
  const recording = phase.kind === 'recording';
  useEffect(() => {
    if (!recording) return;
    void activateKeepAwakeAsync('record').catch(() => undefined);
    return () => void deactivateKeepAwake('record').catch(() => undefined);
  }, [recording]);

  const over = phase.kind === 'recording' && rec.durationMillis >= MAX_MINUTES * 60_000;
  useEffect(() => {
    if (!over) return;
    const t = setTimeout(() => void stop(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);

  const pick = async () => {
    const r = await getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false }).catch(() => null);
    const a = r && !r.canceled ? r.assets[0] : null;
    if (!a) return;
    setPhase({ kind: 'recorded', uri: a.uri, mime: audioMime(a.name, a.mimeType), minutes: minutesFromSize(a.size ?? 0, MAX_MINUTES), label: a.name });
  };

  const run = async (p: Extract<Phase, { kind: 'recorded' }>) => {
    setPhase({ kind: 'working', minutes: p.minutes });
    try {
      const ticket = await getSttTicket(p.minutes);
      const text = await transcribe(ticket, { uri: p.uri, mime: p.mime });
      onTranscript(text, p.minutes);
      onClose();
    } catch (e) {
      setPhase({ kind: 'error', code: sttFailureOf(e), back: p });
    }
  };

  const close = () => {
    if (phase.kind === 'recording') void recorder.stop().catch(() => undefined);
    onClose();
  };

  const primary =
    phase.kind === 'ready' ? (
      <Button title="녹음 시작" tall icon={<Microphone size={u(18)} color={agreed ? tokens.onInk : tokens.faint} />} disabled={!agreed} onPress={() => void start()} />
    ) : phase.kind === 'recording' ? (
      <Button title="녹음 끝내기" tall icon={<Stop size={u(18)} weight="fill" color={tokens.onInk} />} onPress={() => void stop()} />
    ) : phase.kind === 'recorded' ? (
      <Button title="글로 옮기기" tall onPress={() => void run(phase)} />
    ) : phase.kind === 'working' ? (
      <Button title="글로 옮기는 중이에요" tall loading disabled onPress={() => undefined} />
    ) : (
      <Button title="다시 하기" tall onPress={() => setPhase(phase.back ?? { kind: 'ready' })} />
    );

  return (
    <SheetBody title="회의 녹음" primary={primary} onClose={phase.kind === 'working' ? undefined : close}>
      {phase.kind === 'ready' && (
        <View style={{ gap: space.md }}>
          <Checkbox checked={agreed} onChange={setAgreed} label="참석자 모두 녹음과 전사에 동의했어요" />
          <Txt variant="caption" color={tokens.muted}>
            녹음은 Deepgram(미국)으로 보내 글로 옮기고, 녹음과 전사본은 저장하지 않아요
          </Txt>
          <Button title="녹음 파일 고르기" kind="text" icon={<FileAudio size={u(18)} color={agreed ? tokens.text : tokens.faint} />} disabled={!agreed} onPress={() => void pick()} />
        </View>
      )}
      {phase.kind === 'recording' && (
        <View style={styles.live} accessibilityLiveRegion="polite" accessibilityLabel={`녹음 중, ${mmss(rec.durationMillis)}`}>
          <View style={styles.dot} />
          <Txt variant="title" tabular style={{ fontFamily: fonts.bold }}>
            {mmss(rec.durationMillis)}
          </Txt>
        </View>
      )}
      {phase.kind === 'recorded' && (
        <Txt variant="body" numberOfLines={2} style={styles.picked}>
          {phase.label}
        </Txt>
      )}
      {phase.kind === 'working' && <StepLog steps={[{ label: `${phase.minutes}분 분량을 글로 옮기는 중이에요`, state: 'now' }]} />}
      {phase.kind === 'error' && (
        <Txt variant="body" color={tokens.danger} accessibilityRole="alert" style={styles.picked}>
          {FAIL[phase.code]}
        </Txt>
      )}
    </SheetBody>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: u(10), paddingVertical: space.lg },
  dot: { width: u(10), height: u(10), borderRadius: u(5), backgroundColor: tokens.danger },
  picked: { paddingVertical: space.md },
});
