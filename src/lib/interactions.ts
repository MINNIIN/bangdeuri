/**
 * 가구·아이템마다 미니미가 하는 일.
 * 누르면 미니미가 그 앞(또는 위)으로 걸어가서 자세를 잡고, 효과가 나오고, 한마디를 한다.
 */

export type Pose =
  /** 그 앞에 서서 (정면) */
  | 'stand'
  /** 그 앞에 서서 뒷모습 (냉장고·싱크대처럼 그쪽을 보고 쓰는 것) */
  | 'back'
  /** 그 앞 바닥에 앉아 뒷모습 (TV·게임) */
  | 'watch'
  /** 그 앞 바닥에 앉아 정면 (먹기) */
  | 'floor'
  /** 가구 위에 앉기 (소파·의자·변기) */
  | 'sit'
  /** 이불 덮고 눕기 */
  | 'lie'
  /** 욕조에 들어가기 */
  | 'bath'
  /** 들썩들썩 */
  | 'dance'

export type Fx =
  | 'tv'
  | 'game'
  | 'screen'
  | 'zzz'
  | 'night'
  | 'hearts'
  | 'notes'
  | 'steam'
  | 'bubbles'
  | 'drops'
  | 'flush'
  | 'sparkle'
  | 'confetti'
  | 'shock'
  | 'disco'
  | 'wind'
  | 'type'
  | 'stink'
  | 'sweat'
  | 'fridge'
  | 'ring'
  /** 바다 위 밤하늘에 터지는 불꽃 */
  | 'firework'

export type ItemMotion = 'shake' | 'spin' | 'hop' | 'float' | 'glow'

export interface Interaction {
  verb: string
  pose: Pose
  /** 미니미가 설 자리 (아이템 기준 바닥 좌표 차이). 기본은 바로 앞 */
  spot?: { du: number; dv: number }
  /** sit·lie·bath: 아이템 그림 아래에서 몇 줄 위에 몸을 얹을지 */
  seat?: number
  /** sit·lie·bath: 아이템 그림의 몇 번째 줄부터 미니미 위에 덮을지 (이불, 욕조 앞면, 변기 앞) */
  cover?: number
  fx: Fx[]
  motion?: ItemMotion
  lines: string[]
  /** 잠깐 하고 끝나는 동작 (ms). 없으면 다른 데를 누를 때까지 계속 */
  ms?: number
  /** 일어날 때 */
  leave?: { fx: Fx; line: string }
  /** 옷장: 옷을 갈아입는다 */
  outfit?: boolean
  /** 스탠드: 불을 켜고 끈다 */
  light?: boolean
  /** 기겁하고 도망간다 */
  flee?: boolean
  /** 그 자리 그 방향에 딱 서서 한다 (물놀이·허리돌리기처럼 기구 위·물속) */
  exact?: boolean
  /** 다 하고 나면 기구 쪽이 아니라 바깥(카메라 쪽)을 본다 (인증샷) */
  faceOut?: boolean
}

/** 미끄럼틀 한 번 (사다리 오르기 ~ 아래에서 일어서기) */
export const SLIDE_MS = 3400

const eat = (lines: string[]): Interaction => ({ verb: '먹기', pose: 'floor', fx: ['hearts'], lines, ms: 2800 })
const hug = (lines: string[]): Interaction => ({ verb: '안아 주기', pose: 'stand', fx: ['hearts'], lines, ms: 2600 })
const sit = (seat: number, lines: string[], verb = '앉기'): Interaction => ({ verb, pose: 'sit', seat, fx: [], lines })

export const INTERACTIONS: Record<string, Interaction> = {
  // ─── 거실 ───
  tv: {
    verb: '보기',
    pose: 'watch',
    spot: { du: 0.17, dv: 0.17 },
    fx: ['tv'],
    lines: ['드라마 정주행 각', '한 편만 더…', '이거 완전 내 얘기잖아', '다음 화 자동 재생 ㄷㄷ'],
  },
  sofa: sit(4, ['소파랑 한 몸', '아 편하다~', '여기서 같이 영화 보자'], '앉기'),
  lowtable: { verb: '엎드리기', pose: 'floor', fx: ['hearts'], lines: ['여기서 치킨 먹자', '배달 언제 와?'], ms: 2800 },
  turntable: { verb: '노래 틀기', pose: 'dance', spot: { du: 0.05, dv: 0.07 }, fx: ['notes'], lines: ['오늘의 BGM은 내가 고른다', '이 노래 알아?', '둠칫둠칫'] },
  calendar: { verb: '달력 보기', pose: 'back', spot: { du: 0.04, dv: 0.07 }, fx: [], lines: ['이번 주 약속이…', '주말까지 며칠 남았지?', '이날 시간 돼?'], ms: 1800 },
  lamp: { verb: '불 켜기', pose: 'stand', spot: { du: 0.05, dv: 0.04 }, fx: [], light: true, lines: ['딸깍', '분위기 있다~'], ms: 1400 },
  // ─── 침실 ───
  bed: {
    verb: '눕기',
    pose: 'lie',
    seat: 9,
    cover: 6,
    fx: ['zzz', 'night'],
    lines: ['잘 자', '5분만 더…', '오늘 하루 끝!', '이불 밖은 위험해'],
    leave: { fx: 'sparkle', line: '잘 잤다~ 기지개 쭉' },
  },
  wardrobe: {
    verb: '갈아입기',
    pose: 'back',
    fx: ['sparkle'],
    outfit: true,
    lines: ['짜잔! 새 옷', '오늘은 이거다', '이거 어때?'],
    ms: 2200,
  },
  alarm: { verb: '맞추기', pose: 'stand', fx: ['ring'], motion: 'shake', lines: ['따르릉!!!', '5분만 더…', '알람 7개 맞춤'], ms: 2600 },
  // ─── 작은방 ───
  desk: { verb: '공부하기', pose: 'back', fx: ['type'], lines: ['공부 좀 하자 (진짜로)', '5분만 폰 보고…', '과제 마감 3시간 전'] },
  chair: sit(6, ['잠깐 쉬어 갈게', '의자 빙글빙글']),
  bookshelf: { verb: '책 읽기', pose: 'back', fx: ['sparkle'], lines: ['지식 충전 중', '세 쪽 읽고 졸림', '이 책 재밌다'] },
  beanbag: sit(3, ['한번 앉으면 못 일어남', '여기서 살래', '으아 빨려 들어간다'], '파묻히기'),
  // ─── 주방 ───
  fridge: {
    verb: '열어 보기',
    pose: 'back',
    fx: ['fridge'],
    lines: ['뭐 먹지…', '어제 그 치킨 어디 갔지?', '냉장고 파먹기 시작'],
    ms: 3200,
  },
  counter: { verb: '요리하기', pose: 'back', spot: { du: 0.06, dv: 0.07 }, fx: ['steam'], lines: ['라면 끓이는 중', '계란 넣을까 말까', '오늘은 내가 셰프'] },
  washer: { verb: '빨래 돌리기', pose: 'back', fx: ['bubbles'], motion: 'shake', lines: ['덜컹덜컹', '양말 한 짝 또 어디 갔어', '섬유유연제 듬뿍'] },
  microwave: { verb: '데우기', pose: 'back', fx: ['screen'], motion: 'shake', lines: ['1분 30초…', '띵! 다 됐다'], ms: 3000 },
  // ─── 화장실 ───
  toilet: {
    ...sit(4, ['끄응…', '여기가 제일 편해', '휴대폰 보는 중', '아무도 들어오지 마'], '앉기'),
    cover: 9,
    leave: { fx: 'flush', line: '쏴아아~' },
  },
  bathtub: {
    verb: '목욕하기',
    pose: 'bath',
    seat: 9,
    cover: 1,
    fx: ['bubbles', 'steam'],
    lines: ['아~ 극락이다', '뜨끈뜨끈', '오리 인형 어디 갔지'],
    leave: { fx: 'sparkle', line: '뽀득뽀득 개운해!' },
  },
  basin: { verb: '손 씻기', pose: 'back', fx: ['drops', 'bubbles'], lines: ['뽀득뽀득', '손 씻기 30초!'], ms: 3000 },
  // ─── 가전 ───
  laptop: { verb: '타자 치기', pose: 'watch', spot: { du: 0.06, dv: 0.06 }, fx: ['type', 'screen'], lines: ['타닥타닥', '쇼핑몰 장바구니 정리 중', '이메일 37통…'] },
  console: { verb: '게임하기', pose: 'watch', spot: { du: 0.07, dv: 0.07 }, fx: ['game'], lines: ['한 판만 더!', '아 렉 걸렸어', '이번엔 이긴다'] },
  fan: { verb: '바람 쐬기', pose: 'stand', spot: { du: 0.06, dv: 0.06 }, fx: ['wind'], motion: 'spin', lines: ['아~ 시원해', '아아아아아 (선풍기 국룰)'] },
  aircon: { verb: '켜기', pose: 'stand', spot: { du: 0.07, dv: 0.07 }, fx: ['wind'], lines: ['에어컨 18도 실화?', '여기가 천국'] },
  phone: { verb: '전화 받기', pose: 'stand', fx: ['ring'], motion: 'shake', lines: ['여보세요?', '어 나 지금 방들이 중'], ms: 3000 },
  mic: { verb: '노래하기', pose: 'dance', fx: ['notes'], lines: ['♪ 내 노래를 들어라', '고음 갑니다', '100점 나와라'] },
  disco: { verb: '파티 타임', pose: 'dance', spot: { du: 0.07, dv: 0.07 }, fx: ['disco', 'notes'], motion: 'spin', lines: ['파티 타임!', '둠칫둠칫', '오늘 밤 주인공은 나'] },
  // ─── 소품 ───
  plant: { verb: '물 주기', pose: 'stand', fx: ['drops'], lines: ['쑥쑥 자라라', '오늘도 초록초록'], ms: 2600 },
  cactus: { verb: '만져 보기', pose: 'stand', fx: ['shock'], lines: ['아야!', '가시 있잖아…'], ms: 2000 },
  teddy: hug(['꼬옥', '포근해', '안고 자야지']),
  cushion: hug(['말랑말랑', '쿠션 꼭 끌어안기']),
  cat: { verb: '쓰다듬기', pose: 'stand', fx: ['hearts'], motion: 'hop', lines: ['냐옹~', '골골골골', '츄르 줄까?'], ms: 2600 },
  fishbowl: { verb: '구경하기', pose: 'stand', fx: ['bubbles'], lines: ['뻐끔뻐끔', '물멍 중…'], ms: 3000 },
  books: { verb: '읽기', pose: 'floor', fx: [], lines: ['한 권 쏙', '이건 언제 다 읽지'], ms: 2800 },
  balloon: { verb: '잡아 보기', pose: 'stand', fx: ['hearts'], motion: 'float', lines: ['둥실둥실', '날아갈 것 같아'], ms: 2600 },
  gift: { verb: '열어 보기', pose: 'stand', fx: ['confetti'], motion: 'hop', lines: ['뭐가 들었을까?', '와 대박!'], ms: 2800 },
  trophy: { verb: '자랑하기', pose: 'dance', fx: ['sparkle'], motion: 'glow', lines: ['내가 1등!', '수상 소감은…'], ms: 2800 },
  dumbbell: { verb: '운동하기', pose: 'dance', fx: ['sweat'], lines: ['하나! 둘!', '근손실 안 돼', '오운완'] },
  // ─── 먹을거 ───
  ramen: eat(['후루룩!', '라면은 진리']),
  coffee: eat(['아아 수혈 완료', '얼죽아']),
  cake: { verb: '촛불 끄기', pose: 'stand', fx: ['confetti'], lines: ['생일 축하해~', '후~!'], ms: 3000 },
  chicken: eat(['치킨은 살 안 쪄', '1인 1닭']),
  tteokbokki: eat(['맵다 맵다!', '시원한 음료 어디?']),
  // ─── 킹받는거 ───
  poop: { verb: '건드리기', pose: 'stand', fx: ['shock', 'stink'], lines: ['으악! 누가 놓고 갔어', '킹받네…'], ms: 2000, flee: true },
  roach: { verb: '잡기', pose: 'stand', fx: ['shock'], motion: 'hop', lines: ['바선생이다!!!', '으아아악'], ms: 1600, flee: true },
  socks: { verb: '냄새 맡기', pose: 'stand', fx: ['stink'], lines: ['윽 이게 무슨 냄새', '한 짝은 어디 갔어?'], ms: 2400 },
  trashbag: { verb: '버리기', pose: 'stand', fx: ['stink'], lines: ['내일 버릴게…', '분리수거 해야 돼'], ms: 2400 },
  rock: { verb: '들어 보기', pose: 'stand', fx: ['sweat'], lines: ['…돌이다', '왜 돌을 주는 거야'], ms: 2400 },
  // ─── 공원 놀이터 ───
  p_swing: { verb: '그네 타기', pose: 'sit', fx: [], lines: ['슝~ 슝~', '더 높이!', '어릴 때 생각난다', '누가 좀 밀어 줘'] },
  p_slide: { verb: '미끄럼틀 타기', pose: 'stand', fx: [], lines: ['야호~!', '한 번 더!', '슈웅~'], ms: SLIDE_MS, leave: { fx: 'sparkle', line: '재밌다!' } },
  p_bench: sit(5, ['공원 벤치 최고', '바람 좋다~', '여기 앉아서 수다 떨자', '날씨 좋다'], '앉기'),
  p_seesaw: { verb: '시소 타기', pose: 'sit', fx: [], lines: ['위로~ 아래로~', '엉덩이 아파 ㅋㅋ', '같이 타자! 반대편 앉아', '쿵! 쿵!'] },
  p_sand: { verb: '모래 놀이', pose: 'floor', fx: ['sparkle'], lines: ['모래성 쌓는 중', '두껍아 두껍아 헌 집 줄게', '삽질 중 (진짜로)', '보물 찾았다!'] },
  // ─── 편의점 앞 · 포장마차 ───
  o_table: sit(5, ['컵라면은 편의점 앞에서 먹어야 제맛', '삼각김밥 포장 한 번에 성공!', '여기서 수다 떨다 가자', '딸기 우유 하나 더?'], '앉기'),
  o_vending: { verb: '음료 뽑기', pose: 'back', fx: ['ring'], lines: ['덜컹! 캔커피 나왔다', '500원 넣었는데 안 나와…', '이온음료 원샷', '버튼 아무거나 눌러 봄'], ms: 2600 },
  o_pocha: { ...sit(5, ['떡볶이 1인분이요!', '어묵 국물은 무한 리필', '오늘 하루도 고생했다', '이모 여기 순대도요~']), fx: ['steam'] },
  // ─── 뒷산 ───
  m_pavilion: sit(6, ['산바람 시원하다~', '여기서 한숨 돌리자', '동네가 다 내려다보여', '도시락 싸 올걸']),
  m_scope: { verb: '망원경 보기', pose: 'back', fx: ['sparkle'], lines: ['우리 동네 한눈에 보인다!', '저기 우리 집이다!', '바다까지 보여', '누가 놀러 오나 감시 중'], ms: 5200 },
  m_summit: { verb: '정상 인증', pose: 'dance', fx: ['sparkle', 'confetti'], faceOut: true, lines: ['정상 도착! 인증샷 찰칵', '야호~~~!', '방들이산 정복 완료'], ms: 2800 },
  m_twister: { verb: '허리 돌리기', pose: 'dance', fx: ['sweat'], exact: true, lines: ['허리 돌리기 100번!', '이게 바로 동네 헬스장', '뱃살아 빠져라~'] },
  m_spring: { verb: '약수 마시기', pose: 'back', fx: ['drops'], lines: ['약수 한 사발 캬~', '물맛 좋다', '십 년은 젊어진 느낌'], ms: 2800 },
  // ─── 바닷가 ───
  b_sunbed: { verb: '눕기', pose: 'lie', fx: ['zzz'], lines: ['태닝 중… 건들지 마', '파도 소리 좋다~', '여기가 몰디브지'], leave: { fx: 'sparkle', line: '잘 쉬었다~' } },
  b_ball: { verb: '공 차기', pose: 'dance', fx: ['sparkle'], lines: ['슛~!', '받아라!', '비치볼 패스!'], ms: 1700 },
  b_castle: { verb: '모래성 쌓기', pose: 'floor', fx: ['sparkle'], lines: ['모래성 쌓는 중', '파도야 오지 마…', '방들이 성 완공!'] },
  b_shell: { verb: '조개 줍기', pose: 'stand', fx: ['sparkle'], lines: ['예쁜 조개 주웠다!', '소라 귀에 대면 바다 소리 나', '불가사리다!', '반짝이는 조약돌 득템'], ms: 2300 },
  b_wade: { verb: '물놀이', pose: 'dance', fx: ['drops'], exact: true, lines: ['앗 차가워!', '첨벙첨벙~', '발만 담글게', '바다다~!'] },
  b_firework: { verb: '불꽃놀이', pose: 'stand', fx: ['firework'], lines: ['불꽃놀이 시작!', '와아~ 예쁘다!', '소원 빌어!'], ms: 4600 },
  b_tower: { ...sit(17, ['안전요원 출동 대기 중', '바다가 다 보인다!', '수영은 부표 안쪽에서~']), exact: true },
  b_fish: { ...sit(1, ['입질 왔다!', '고등어 낚았다!!', '…오늘은 꽝인가', '기다림의 미학']), fx: ['drops'], exact: true },
  // ─── 편의점 안 ───
  c_drink: { verb: '음료 고르기', pose: 'back', fx: ['fridge'], lines: ['바나나 맛 우유 국룰', '제로 콜라 어디 있지', '1+1 음료 득템!'], ms: 2800 },
  c_kimbap: { verb: '삼각김밥 고르기', pose: 'back', fx: [], lines: ['참치마요 vs 전주비빔', '도시락 신상 나왔다', '유통기한 제일 긴 걸로'], ms: 2400 },
  c_icecream: { verb: '아이스크림 고르기', pose: 'back', fx: ['fridge'], lines: ['멜론 맛 막대 하나!', '붕어 모양 vs 콘 아이스크림', '겨울에도 아이스크림'], ms: 2600 },
  c_ramen: { verb: '라면 고르기', pose: 'back', fx: [], lines: ['오늘은 매운 거다', '컵라면 2+1 개꿀', '신상 라면 도전'], ms: 2400 },
  c_snack: { verb: '과자 고르기', pose: 'back', fx: [], lines: ['과자 봉지 고르는 중', '신상 과자 털이', '이건 친구 거'], ms: 2400 },
  c_goods: { verb: '구경하기', pose: 'back', fx: [], lines: ['칫솔 사러 왔는데…', '충전기 깜빡했다', '이런 것도 팔아?'], ms: 2400 },
  c_bread: { verb: '빵 고르기', pose: 'back', fx: [], lines: ['스티커 빵 있나?!', '크림빵 득템', '단팥빵은 진리'], ms: 2400 },
  c_counter: { verb: '계산하기', pose: 'stand', fx: ['ring'], lines: ['이거 계산이요!', '봉투는 괜찮아요', '포인트 적립할게요'], ms: 2800 },
  c_water: { verb: '컵라면 물 붓기', pose: 'back', fx: ['steam'], lines: ['물 선까지 정확히', '3분만 기다려…', '나무젓가락 챙겨'], ms: 3000 },
  c_stool: { ...sit(5, ['컵라면엔 삼각김밥이지', '창밖 구경하며 후루룩', '편의점 야식 최고']), fx: ['steam'] },
}

export const interactionFor = (item: string): Interaction | undefined => INTERACTIONS[item]

export const pickLine = (inter: Interaction, n = Math.random()) => inter.lines[Math.floor(n * inter.lines.length) % inter.lines.length]

/** TV 채널 */
export const TV_CHANNELS = ['도트 드라마', '9시 뉴스', '음악 방송', '고양이 채널', '축구 중계'] as const
