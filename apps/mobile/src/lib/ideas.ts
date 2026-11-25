// 맡길 일(시안 원본 m05·m06): 비서가 먼저 내놓는 일. 지금 받은 요청·내 요청에서만 만든다(지어낸 일 없음).
// 기관을 추천하거나 순위를 매기는 제안은 만들지 않는다(규칙 2). 맡겨도 밖으로 나가는 일은 허용한 뒤 한 번만(규칙 1).
import type { MIconName } from '@/components/ui/MIcon';
import type { PicTone } from '@/components/ui/Muse';

import type { InboxItem } from './inbox';
import type { DanchuLabItem } from './marketClient';

export type IdeaGo =
  | { kind: 'quote'; no: string }
  | { kind: 'lab'; no: string }
  | { kind: 'send'; text: string }
  | { kind: 'record' }
  | { kind: 'start'; seed: string }
  | { kind: 'request'; id: string }
  | { kind: 'ask' };

export interface Idea {
  key: string;
  tone: PicTone;
  icon: MIconName;
  title: string;
  body: string;
  /** 시트 "포함되는 일" 세 줄 */
  includes: { icon: MIconName; text: string }[];
  go: IdeaGo;
}

const md = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`;
const short = (no: string) => no.replace(/^DC-\d{4}-/, '');

/** 기관: 견적 작성 중인 요청, 오늘 정리, 회의 녹음, 선정된 요청 보고, 이번 주 보고 */
export function labIdeas(items: DanchuLabItem[]): Idea[] {
  const out: Idea[] = [];
  const work = items.find((x) => x.group === 'work');
  if (work) {
    out.push({
      key: `quote:${work.no}`,
      tone: 'blue',
      icon: 'doc',
      title: work.due ? `${md(work.due)} 전에 ${short(work.no)} 견적서를 마무리해 둘게요` : `${short(work.no)} 견적서를 마무리해 둘게요`,
      body: '비어 있는 칸을 단가표 값으로 채워 둘게요. 허용하기 전에는 아무것도 제출하지 않아요.',
      includes: [
        { icon: 'doc', text: `${work.no} 견적서 읽기` },
        { icon: 'pencil', text: '빈 칸 채우기, 제출하지 않아요' },
        { icon: 'shield', text: '제출은 허용한 뒤 한 번만' },
      ],
      go: { kind: 'quote', no: work.no },
    });
  }
  out.push({
    key: 'brief',
    tone: 'yellow',
    icon: 'clock',
    title: '오늘 할 일을 한 장으로 정리할게요',
    body: '받은 요청, 회신 기한, 유효기간이 끝나 가는 견적, 오늘 일정을 모아 대화에 보여 드려요.',
    includes: [
      { icon: 'clock', text: '지금 한 번, 대화에서' },
      { icon: 'doc', text: '받은 요청함, 견적, 일정 읽기' },
      { icon: 'check', text: '바꾸는 것은 없어요' },
    ],
    go: { kind: 'send', text: '오늘 아침 브리핑 보여 줘' },
  });
  out.push({
    key: 'record',
    tone: 'purple',
    icon: 'mic',
    title: '미팅 녹음을 기록으로 옮길게요',
    body: '녹음에서 요청 시험, 다음 할 일, 담당자를 뽑아 고객 기록에 넣어요.',
    includes: [
      { icon: 'mic', text: '녹음하고 글로 옮기기' },
      { icon: 'person', text: '고객 기록, 할 일 넣기' },
      { icon: 'clock', text: '7일 안에 되돌릴 수 있어요' },
    ],
    go: { kind: 'record' },
  });
  const won = items.find((x) => x.group === 'won');
  if (won) {
    out.push({
      key: `won:${won.no}`,
      tone: 'green',
      icon: 'check',
      title: `선정된 ${short(won.no)}, 계약 체결 보고를 준비할게요`,
      body: '계약서(안) 금액과 선정 견적을 맞춰 보고 초안을 만들어 둬요.',
      includes: [
        { icon: 'doc', text: '선정 견적 읽기' },
        { icon: 'pencil', text: '보고 초안 만들기' },
        { icon: 'shield', text: '보고는 허용한 뒤 한 번만' },
      ],
      go: { kind: 'lab', no: won.no },
    });
  }
  out.push({
    key: 'week',
    tone: 'blue',
    icon: 'list',
    title: '이번 주 견적 흐름을 보고로 묶을게요',
    body: '받은 요청, 제출, 선정 수를 단추에서 세어 한 장으로 정리해요.',
    includes: [
      { icon: 'doc', text: '단추 보고 읽기' },
      { icon: 'list', text: '이번 주 수만 세기' },
      { icon: 'check', text: '바꾸는 것은 없어요' },
    ],
    go: { kind: 'send', text: '이번 주 보고 만들어 줘' },
  });
  return out;
}

/** 의뢰자: 새 견적 요청(독성·효력), 회신 정리, 보낼 준비 된 요청, 가이드라인 질문 */
export function requesterIdeas(items: InboxItem[]): Idea[] {
  const out: Idea[] = [];
  const waiting = items.find((x) => x.status === 'waiting');
  if (waiting) {
    out.push({
      key: `wait:${waiting.id}`,
      tone: 'blue',
      icon: 'doc',
      title: `${waiting.title}, 보낼 준비를 마쳤어요`,
      body: '보낼 본문을 한 번 더 보여 드릴게요. 허용하기 전에는 보내지 않아요.',
      includes: [
        { icon: 'doc', text: '요청서 본문 보기' },
        { icon: 'shield', text: '보내기는 허용한 뒤 한 번만' },
        { icon: 'bell', text: '회신이 오면 소식에 알려요' },
      ],
      go: { kind: 'request', id: waiting.id },
    });
  }
  const replied = items.find((x) => x.status === 'replied');
  if (replied) {
    out.push({
      key: `reply:${replied.id}`,
      tone: 'green',
      icon: 'list',
      title: `${replied.title} 회신을 한 표로 볼 수 있게 할게요`,
      body: '회신이 도착한 순서대로 놓아요. 기관을 추천하거나 순위를 매기지 않아요.',
      includes: [
        { icon: 'doc', text: '받은 회신 읽기' },
        { icon: 'list', text: '도착한 순서대로 놓기' },
        { icon: 'shield', text: '선정은 직접 고르실 때만' },
      ],
      go: { kind: 'request', id: replied.id },
    });
  }
  out.push({
    key: 'tox',
    tone: 'yellow',
    icon: 'idea',
    title: '독성시험 견적을 받아 드릴게요',
    body: '시험 이름이나 물질만 알려 주시면 요청서를 같이 채워요. 보내기 전에 꼭 허용을 받아요.',
    includes: [
      { icon: 'chat', text: '대화로 요청서 채우기' },
      { icon: 'doc', text: '보낼 본문 미리 보기' },
      { icon: 'shield', text: '보내기는 허용한 뒤 한 번만' },
    ],
    go: { kind: 'start', seed: '독성시험 견적이 필요해요' },
  });
  out.push({
    key: 'eff',
    tone: 'purple',
    icon: 'idea',
    title: '효력시험 견적을 받아 드릴게요',
    body: '적응증과 모델을 알려 주시면 요청서를 같이 채워요. 보내기 전에 꼭 허용을 받아요.',
    includes: [
      { icon: 'chat', text: '대화로 요청서 채우기' },
      { icon: 'doc', text: '보낼 본문 미리 보기' },
      { icon: 'shield', text: '보내기는 허용한 뒤 한 번만' },
    ],
    go: { kind: 'start', seed: '효력시험 견적이 필요해요' },
  });
  out.push({
    key: 'ask',
    tone: 'blue',
    icon: 'info',
    title: '가이드라인을 근거와 함께 찾아 드릴게요',
    body: '원문 조각에 있는 내용만, 문서와 조항을 붙여 답해요. 원문에 없으면 짐작하지 않아요.',
    includes: [
      { icon: 'search', text: '가이드라인 원문 찾기' },
      { icon: 'doc', text: '근거 문서, 조항 붙이기' },
      { icon: 'check', text: '바꾸는 것은 없어요' },
    ],
    go: { kind: 'ask' },
  });
  return out;
}
