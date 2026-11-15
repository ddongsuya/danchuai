// 서버가 보내는 SSE(event:/data:)를 조각 단위로 받아 이벤트로 바꾼다. 조각이 줄 중간에서 끊겨도 된다.
export interface SseEvent {
  event: string;
  data: unknown;
}

export function createSseParser(onEvent: (e: SseEvent) => void) {
  let buf = '';
  return {
    push(chunk: string) {
      buf += chunk.replace(/\r\n/g, '\n');
      let at: number;
      while ((at = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, at);
        buf = buf.slice(at + 2);
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
        }
        if (!data.length) continue;
        try {
          onEvent({ event, data: JSON.parse(data.join('\n')) });
        } catch {
          // 깨진 조각은 버린다. 끝 이벤트가 안 오면 호출한 쪽이 연결 오류로 처리한다.
        }
      }
    },
  };
}
