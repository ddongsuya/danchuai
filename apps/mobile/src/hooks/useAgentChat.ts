import { useCallback, useEffect, useReducer, useRef } from 'react';

import { AgentHttpError, createConversation, getConversation, sendTurn, type AgentRole, type ConversationMode } from '@/lib/agentClient';
import { chatReducer, initialChat, type ActionCard } from '@/lib/chat';

/** 서버 대화 하나를 연다(conversationId가 있으면 이어서 연다). 화면을 떠나면 진행 중인 턴을 끊는다. */
export function useAgentChat(role: AgentRole, requestId?: string, conversationId?: string, mode: ConversationMode = 'request') {
  const [state, dispatch] = useReducer(chatReducer, { ...initialChat, status: 'starting' });
  const abort = useRef<AbortController | null>(null);
  const idRef = useRef<string | null>(null);

  const open = useCallback(async () => {
    try {
      const c = conversationId ? await getConversation(role, conversationId) : await createConversation(role, requestId, mode);
      idRef.current = c.id;
      dispatch({ type: 'opened', id: c.id, role: c.role, sheet: c.sheet, missing: c.missing, messages: c.messages, question: c.question, summary: c.summary, draft: c.draft, quote: c.quote });
    } catch (e) {
      dispatch({ type: 'open_failed', code: e instanceof AgentHttpError ? e.code : 'network' });
    }
  }, [role, requestId, conversationId, mode]);

  /** 서버의 대화 상태를 다시 읽는다(단추에 제출한 뒤 제출한 판 등). 열려 있지 않으면 새로 연다 */
  const refresh = useCallback(async () => {
    const id = idRef.current;
    if (!id) return open();
    try {
      const c = await getConversation(role, id);
      dispatch({ type: 'opened', id: c.id, role: c.role, sheet: c.sheet, missing: c.missing, messages: c.messages, question: c.question, summary: c.summary, draft: c.draft, quote: c.quote });
    } catch {
      // 다시 읽지 못해도 화면은 그대로 둔다
    }
  }, [role, open]);

  useEffect(() => {
    void open();
    return () => abort.current?.abort();
  }, [open]);

  // 다시 보내기에 쓸 전사본(화면 상태에는 두지 않는다)
  const lastTranscript = useRef<string | undefined>(undefined);
  const send = useCallback(
    async (text: string, transcript?: string) => {
      const id = idRef.current;
      if (!id || abort.current) return;
      const ctrl = new AbortController();
      abort.current = ctrl;
      lastTranscript.current = transcript;
      dispatch({ type: 'send', text, at: Date.now() });
      try {
        await sendTurn(role, id, text, (e) => dispatch({ type: 'server', event: e.event, data: e.data }), ctrl.signal, transcript);
        dispatch({ type: 'ended', at: Date.now() });
      } catch (e) {
        if (!ctrl.signal.aborted) dispatch({ type: 'failed', code: e instanceof AgentHttpError ? e.code : 'network', at: Date.now() });
      } finally {
        abort.current = null;
      }
    },
    [role],
  );

  const retry = useCallback(() => {
    if (!idRef.current) return void open();
    if (state.lastText) void send(state.lastText, lastTranscript.current);
  }, [open, send, state.lastText]);

  /** 기관 비서: 되돌린 실행 카드를 표시한다 */
  const markUndone = useCallback((runId: string) => dispatch({ type: 'undone', runId }), []);

  /** 기관 비서: "매번 묻기"로 멈춘 카드를 허용·거절한 결과로 바꾼다 */
  const patchAction = useCallback((key: string, patch: Partial<ActionCard>) => dispatch({ type: 'patchAction', key, patch }), []);

  return { state, send, retry, refresh, markUndone, patchAction };
}
