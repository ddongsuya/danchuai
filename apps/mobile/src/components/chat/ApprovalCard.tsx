// 보내기 전 확인 카드(시안 원본 m03 모양, components/chat/ConfirmCard). 대화 안에 놓인다.
// 규칙: 실제로 나갈 본문 원문·받는 곳·첨부를 그대로 보여 준다. "항상 허용" 같은 일괄 허용은 없다.
// 실제 허용 기록(epoch + 본문 해시)과 한 번만 보내기는 서버(/v1/outbound/:id/decision, /dispatch)가 맡는다.
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { fonts, tokens } from '@/constants/theme';

import { ConfirmCard } from './ConfirmCard';

export interface Recipient {
  id: string;
  short?: string;
  name: string;
}

interface Props {
  title: string;
  recipients: Recipient[];
  body: string;
  attachment: string;
  hideRequester?: boolean;
  guardPassed: boolean;
  onEdit: () => void;
  onApprove: () => void;
}

export function ApprovalCard({ title, recipients, body, attachment, hideRequester, guardPassed, onEdit, onApprove }: Props) {
  const toRequester = recipients.length === 1 && recipients[0].id === 'requester';
  return (
    <ConfirmCard
      title={title}
      note={guardPassed ? '보낼 본문을 확인한 뒤 허용해 주세요.' : '본문을 점검하는 중이에요.'}
      preview={
        <View style={styles.body}>
          <Txt style={styles.text} selectable>
            {body}
          </Txt>
          <Txt style={styles.attach} color={tokens.muted}>
            {`첨부: ${attachment}`}
          </Txt>
        </View>
      }
      recipient={{
        title: `받는 곳: ${recipients.map((r) => r.name).join(', ')}`,
        sub: toRequester ? '선정 전이라 회사명은 가려져요' : hideRequester ? '의뢰자 정보는 선정 뒤에 보여요' : undefined,
        icon: 'person',
      }}
      onReject={onEdit}
      onAllow={onApprove}
      disabled={!guardPassed}
      foot="허용하면 이 내용 그대로 한 번 보내요"
    />
  );
}

const styles = StyleSheet.create({
  body: { padding: 14, gap: 8 },
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 22, color: tokens.text },
  attach: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
