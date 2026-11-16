import { useCallback, useEffect, useReducer, useRef } from 'react';

import { AgentHttpError, createConversation, getConversation, sendTurn, type AgentRole, type ConversationMode } from '@/lib/agentClient';
import { chatReducer, initialChat } from '@/lib/chat';

/** 서버 대화 하나를 연다(conversationId가 있으면 이어서 연다). 화면을 떠나면 진행 중인 턴을 끊는다. */
export function useAgentChat(role: AgentRole, requestId?: string, conversationId?: string, mode: ConversationMode = 'request') {
  const [state, dispatch] = useReducer(chatReducer, { ...initialChat, status: 'starting' });
  const abort = useRef<AbortController | null>(null);
  const idRef = useRef<string | null>(null);

  const open = useCallback(async () => {
    try {
      const c = conversationId ? await getConversation(role, conversationId) : await createConversation(role, requestId, mode);
      idRef.current = c.id;
      dispatch({ type: 'opened', id: c.id, role: c.role, sheet: c.sheet, missing: c.missing, messages: c.messages, question: c.question, summary: c.summary, draft: c.draft });
    } catch (e) {
      dispatch({ type: 'open_failed', code: e instanceof AgentHttpError ? e.code : 'network' });
    }
  }, [role, requestId, conversationId, mode]);

  useEffect(() => {
    void open();
    return () => abort.current?.abort();
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const id = idRef.current;
      if (!id || abort.current) return;
      const ctrl = new AbortController();
      abort.current = ctrl;
      dispatch({ type: 'send', text, at: Date.now() });
      try {
        await sendTurn(role, id, text, (e) => dispatch({ type: 'server', event: e.event, data: e.data }), ctrl.signal);
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
    if (state.lastText) void send(state.lastText);
  }, [open, send, state.lastText]);

  return { state, send, retry };
}
