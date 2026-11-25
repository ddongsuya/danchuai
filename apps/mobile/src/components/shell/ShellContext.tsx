// 탭 화면 공통 상태(Muse 시안 2026-11-25). 역할, 비서 이름, 서랍 열기, 위 막대 상태(확인 필요 건수)를 탭 화면들이 나눠 쓴다.
// 서버를 읽는 일(보낸 것 확인 필요 수, 읽지 않은 소식 수)은 탭 묶음에서 한 번만 한다.
import { createContext, useContext, type ReactNode } from 'react';

import type { AgentCharacterId } from '@danchuai/core';

import type { AgentRole } from '@/lib/agentClient';

export type TabKey = 'index' | 'feed' | 'ideas' | 'todo' | 'library';

export interface ShellState {
  role: AgentRole;
  /** 고른 비서 캐릭터와 그 이름 */
  character: AgentCharacterId;
  agentName: string;
  /** 서버에 닿을 수 있는지(연결됨·연결 전) */
  live: boolean;
  /** 보낸 것 가운데 결과를 봐야 하는 건수(위 막대 "확인 필요") */
  check: number;
  onCheck: () => void;
  /** 읽지 않은 소식 수(아래 탭 점) */
  unread: number;
  openDrawer: () => void;
  /** 비서 프로필(위 막대 캐릭터를 누르면) */
  openAgent: () => void;
  /** 설정 시트 */
  openSettings: () => void;
  /** 대화 탭을 새 대화로 */
  chatKey: number;
  /** 다른 탭(맡길 일)에서 대화 탭으로 넘긴 일. 대화 탭이 한 번 받아 쓰고 비운다 */
  pending: ChatHandoff | null;
  handoff: (h: ChatHandoff | null) => void;
}

export type ChatHandoff = { kind: 'send'; text: string } | { kind: 'record' };

const Ctx = createContext<ShellState>({
  role: 'requester',
  character: 'danchu',
  agentName: '단추',
  live: false,
  check: 0,
  onCheck: () => undefined,
  unread: 0,
  openDrawer: () => undefined,
  openAgent: () => undefined,
  openSettings: () => undefined,
  chatKey: 0,
  pending: null,
  handoff: () => undefined,
});

export const useShell = () => useContext(Ctx);

export function ShellProvider({ value, children }: { value: ShellState; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
