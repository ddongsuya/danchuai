// 기관 비서·앱이 바로 실행한 단추 액션 기록(0012 assist_runs). 본문·바꾼 값은 넣지 않는다(되돌리기 값은 단추에만).
export interface AssistRun {
  id: string;
  orgId: string;
  userId: string;
  conversationId: string | null;
  action: string;
  label: string;
  outcome: "done" | "failed" | "unknown";
  danchuLogId: string | null;
  undoable: boolean;
  undoneAt: string | null;
  createdAt: string;
}

export interface RunRepo {
  insert(r: AssistRun): Promise<void>;
  /** 이 사람의 기록 하나(같은 작업 공간). 없으면 null */
  get(id: string, orgId: string, userId: string): Promise<AssistRun | null>;
  /** 되돌림 표시. 이미 되돌렸으면 false */
  markUndone(id: string, at: string): Promise<boolean>;
  /** 되돌리기가 실패하면 표시를 푼다 */
  clearUndone(id: string): Promise<void>;
  /** 최근 기록(최근 순) */
  recent(orgId: string, userId: string, limit: number): Promise<AssistRun[]>;
}

export class MemoryRunRepo implements RunRepo {
  readonly rows: AssistRun[] = [];
  async insert(r: AssistRun) {
    this.rows.push({ ...r });
  }
  async get(id: string, orgId: string, userId: string) {
    const r = this.rows.find((x) => x.id === id && x.orgId === orgId && x.userId === userId);
    return r ? { ...r } : null;
  }
  async markUndone(id: string, at: string) {
    const r = this.rows.find((x) => x.id === id);
    if (!r || r.undoneAt) return false;
    r.undoneAt = at;
    return true;
  }
  async clearUndone(id: string) {
    const r = this.rows.find((x) => x.id === id);
    if (r) r.undoneAt = null;
  }
  async recent(orgId: string, userId: string, limit: number) {
    return this.rows
      .filter((x) => x.orgId === orgId && x.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((x) => ({ ...x }));
  }
}
