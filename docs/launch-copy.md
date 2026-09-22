# 홍보 문안: "바이브 코딩으로 만든 제품, 에이전트가 사서 쓰게 해드립니다"

원칙: 플랫폼 설명 대신 **만든 도구 → 가격 → 에이전트 구매 → 결과**를 보여준다. 항상 테스트넷·개발자 프리뷰·보장 없음을 같이 말한다. 링크는 두 개만: 데모 https://handsel-mandate-demo.vercel.app , 신청 https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## X (한국어)

> 바이브 코딩으로 만든 도구, AI 에이전트한테 팔아보고 싶나요?
>
> 작동하는 API를 가진 개발자 3명과 첫 판매 흐름을 함께 만듭니다. 상품 설명, 호출 예제, x402 호출당 결제를 붙여드립니다.
>
> 저희 도구로 먼저 돌려봤습니다 (테스트넷): 에이전트가 발견 → 예산 확인 → 결제 → 결과 수령
> 👉 https://handsel-mandate-demo.vercel.app
>
> 개발자 프리뷰라 구매자 유입·매출은 보장 못 합니다. 엔드포인트 하나만 있으면 됩니다. 신청: (링크)

## X (English)

> Built a tool by vibe coding? Let AI agents pay for it per call.
>
> We're wiring up the first sales flow with 3 developers who have a working API: product description, call examples, x402 pay-per-call.
>
> Here's the full flow on our own tool (testnet): agent discovers → checks budget → pays → gets the result
> 👉 https://handsel-mandate-demo.vercel.app
>
> Developer preview. No promise of buyers or revenue. One endpoint is all you need. Apply: (link)

## 개발자 커뮤니티 글 (홍보가 허용되는 곳)

제목: 바이브 코딩으로 만든 API, 에이전트가 호출당 결제해서 쓰게 연결해 드립니다 (테스트넷, 3명)

본문:
- 무엇: 여러분의 기존 API 앞에 x402 결제 게이트를 세우고, 에이전트가 읽는 상품 설명과 구매 링크를 만들어 드립니다. 코드는 안 고칩니다.
- 증거: 저희 도구(Markdown 표 → JSON)로 끝까지 돌린 공개 데모. 버튼 누르면 에이전트가 402 견적을 받고, 예산을 확인하고, 테스트넷 USDC로 결제하고, 결과를 받는 게 그대로 보입니다. https://handsel-mandate-demo.vercel.app
- 조건: 작동하는 입력/출력 API, 호출당 가격, 수취 주소. 이미 공개했고 누군가 사용법을 물어본 도구를 우선합니다.
- 솔직하게: 개발자 프리뷰, Base Sepolia 테스트넷. 구매자 유입·매출·메인넷·환불·에스크로 없음. 첫 목표는 외부 구매자 1명이 여러분 도구를 실제로 쓰는 것, 그다음 반복 구매.
- 신청: (링크)

## 개별 DM (개발자 한 명에게)

> 안녕하세요, 만드신 [도구 이름] 잘 봤습니다. [어디서 봤는지 한 줄].
>
> 이 도구를 AI 에이전트가 호출당 구매하는 방식으로 연결해보고 싶습니다. 엔드포인트 하나만 있으면 되고, 코드는 안 고치셔도 됩니다. 저희 도구로 먼저 돌린 테스트넷 데모입니다: https://handsel-mandate-demo.vercel.app
>
> 개발자 프리뷰라 구매자를 보장하진 못하고, 테스트넷에서 먼저 연결한 뒤 첫 외부 구매가 나오는지 같이 보는 제안입니다. 관심 있으시면 입력/출력 예제와 원하시는 호출당 가격만 알려주세요.

## 30초 영상 대본 (화면 그대로 녹화)

| 초 | 화면 | 자막 |
|---|---|---|
| 0–4 | 데모 페이지 상단, TESTNET 배너 포함 | "바이브 코딩으로 만든 도구 하나" |
| 4–8 | 01 카드: 도구 이름, 0.01 USDC / 호출 | "가격을 정하고" |
| 8–12 | 버튼 클릭 | "에이전트가 산다" |
| 12–22 | 5단계가 차례로 ✓: 발견 → 402 견적 → 예산 확인 → 결제 → 결과 | "발견 → 예산 확인 → 테스트넷 결제 → 결과 수령" |
| 22–27 | 결과 JSON, (테스트넷 모드면) Basescan 링크 | "결과와 정산 기록" |
| 27–30 | 05 섹션 "내 도구도 팔고 싶다면" | "엔드포인트 하나만. 개발자 프리뷰" |

자르지 말 것: TESTNET 배너, "보장하지 않습니다" 문구. 넣지 말 것: "x402·AA 통합 플랫폼" 같은 설명.

## 답변 준비 (자주 나올 질문)

- 진짜 돈인가요? → 아니요, Base Sepolia 테스트넷 USDC입니다. 메인넷은 막혀 있습니다.
- 내 코드 고쳐야 하나요? → 아니요. 프록시가 앞에 서고, 결제된 호출만 비밀 헤더와 함께 전달합니다. 그 헤더 없는 호출만 거부해 주시면 됩니다.
- 구매자는 누가 데려오나요? → 지금은 판매자가 자기 사용자에게 링크를 배포합니다. 저희는 링크와 연결 방법을 드립니다. Bazaar 등록은 추가 발견 경로로 나중에 붙입니다.
- 실패한 호출도 돈이 나가나요? → API가 2xx가 아니면 검증된 결제를 취소합니다. 다만 결과 품질에 대한 환불·에스크로는 없습니다.
- 성공 기준은? → 외부 판매자 한 명의 도구를 외부 구매자 한 명이 실제로 쓰는 것. 그다음 반복 구매. 우리끼리 돌린 테스트 거래는 따로 셉니다.
