// 비서 캐릭터 그림(assets/characters, 사용자가 만든 10종). 목록·이름은 @danchuai/core 와 같다.
import type { AgentCharacterId } from '@danchuai/core';

export const CHARACTER_IMAGE: Record<AgentCharacterId, number> = {
  danchu: require('../../assets/characters/danchu.png'),
  monggeul: require('../../assets/characters/monggeul.png'),
  golmu: require('../../assets/characters/golmu.png'),
  toto: require('../../assets/characters/toto.png'),
  bangul: require('../../assets/characters/bangul.png'),
  kongi: require('../../assets/characters/kongi.png'),
  bibi: require('../../assets/characters/bibi.png'),
  capcap: require('../../assets/characters/capcap.png'),
  munge: require('../../assets/characters/munge.png'),
  peng: require('../../assets/characters/peng.png'),
};
