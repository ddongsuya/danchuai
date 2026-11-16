// 로그인 화면의 규칙과 문구. 화면 밖에서 시험할 수 있게 따로 둔다.

export const PASSWORD_MIN = 8;
export const OTP_LENGTH = 6;
export const RESEND_SECONDS = 60;

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
export const passwordOk = (s: string) => s.length >= PASSWORD_MIN && s.length <= 72;
export const digitsOnly = (s: string, max = OTP_LENGTH) => s.replace(/\D/g, '').slice(0, max);

/** 초대 코드 입력값을 XXXX-XXXX 모양으로. 서버가 다시 검사한다. */
export function formatInviteInput(s: string): string {
  const raw = s.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/** 가입 요청에 이미 있는 메일이 들어왔는지. Supabase는 이때 identities가 빈 사용자를 돌려준다. */
export function alreadySignedUp(user: { identities?: unknown[] } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

/** Supabase 로그인 오류를 화면 문구로. 어느 쪽이 틀렸는지(계정 유무)는 밝히지 않는다. */
export function authErrorText(e: { code?: string; status?: number; message?: string } | null | undefined): string {
  const code = e?.code ?? '';
  if (code === 'invalid_credentials' || code === 'email_not_confirmed') return '이메일 또는 비밀번호가 맞지 않아요.';
  if (code === 'user_already_exists' || code === 'email_exists') return '이미 가입한 이메일이에요. 로그인해 주세요.';
  if (code === 'weak_password') return `비밀번호를 ${PASSWORD_MIN}자 이상, 더 다양하게 넣어 주세요.`;
  if (code === 'otp_expired') return '코드가 맞지 않거나 만료됐어요. 다시 받아 주세요.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e?.status === 429) return '요청이 많아요. 잠시 뒤 다시 해 주세요.';
  if (e?.status === 0 || /fetch|network/i.test(e?.message ?? '')) return '연결이 끊겼어요. 다시 해 주세요.';
  return '처리하지 못했어요. 다시 해 주세요.';
}

/** /account 오류 코드를 화면 문구로. */
export function joinErrorText(code: string): string {
  switch (code) {
    case 'expired':
      return '만료된 코드예요. 초대한 분께 새 코드를 받아 주세요.';
    case 'used':
      return '이미 사용한 코드예요. 초대한 분께 새 코드를 받아 주세요.';
    case 'not_found':
      return '없는 코드예요. 코드를 다시 확인해 주세요.';
    case 'already_member':
      return '이미 조직에 속해 있어요.';
    case 'too_many_attempts':
      return '시도가 많아요. 10분 뒤 다시 해 주세요.';
    default:
      return '처리하지 못했어요. 다시 해 주세요.';
  }
}
