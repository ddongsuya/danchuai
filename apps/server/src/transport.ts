import type { OutboundDraft } from "@danchuai/core";

/** 상대에게 실제로 전달하는 부분. 결과를 확실히 모르면 throw 대신 "unknown"을 돌려준다. */
export interface Transport {
  deliver(draft: OutboundDraft): Promise<"sent" | "unknown">;
}
