// Google 로그인에서 돌아오는 주소(danchuai://auth/callback). 세션 교환은 googleSignIn.ts가 하고, 여기서는 첫 화면으로 보낸다.
import { Redirect } from 'expo-router';

export default function AuthCallback() {
  return <Redirect href="/" />;
}
