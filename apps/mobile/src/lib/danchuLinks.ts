// 단추 웹 주소. 가입·비밀번호 찾기·약관·요청 화면은 단추에서 연다.
export const DANCHU_URL = (process.env.EXPO_PUBLIC_DANCHU_URL ?? 'https://danchu.kr').replace(/\/$/, '');
