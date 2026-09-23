# 홍보 문안: "바이브 코딩으로 만든 제품, 에이전트가 사서 쓰게 해드립니다"

> 게시 전 체크: 영상 1개(프리뷰 URL에서 `npm run record`, 마지막에 메인넷 Basescan 화면), 메인넷 실구매 tx 1개(`npm run buy:once ... --mainnet`), 신청 링크 클릭 확인. 이 셋이 없으면 2/ 트윗의 "실제 USDC로 결제받고 있습니다"를 "결제받을 준비가 됐습니다"로 바꿔 올리세요.

원칙: 플랫폼 설명 대신 **만든 도구 → 가격 → 에이전트 구매 → 결과**를 보여준다. 항상 테스트넷·개발자 프리뷰·보장 없음을 같이 말한다. 링크는 두 개만: 데모 https://handsel-mandate-demo.vercel.app , 신청 https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## X 스레드 (한국어) · 붙여넣기용

**1/**
바이브 코딩으로 만든 도구, AI 에이전트한테 팔아보고 싶나요?

작동하는 API를 가진 개발자 3명과 첫 판매 흐름을 함께 만듭니다. 코드는 안 고칩니다. 엔드포인트 하나에 결제 게이트를 붙이고, 에이전트가 읽는 상품 설명과 구매 링크를 드립니다.

👉 https://handsel-mandate-demo.vercel.app

**2/**
어떻게 도는지: 에이전트가 상품을 발견 → 허용 예산 확인 → x402로 호출당 결제 → 결과 수령. 저희 도구로 먼저 끝까지 돌렸고, 지금은 Base 메인넷에서 실제 USDC로 결제받고 있습니다. (영상)

**3/**
구매 쪽도 열려 있습니다. "1달러 안에서 이 문서 표를 뽑아줘"라고 하면 MCP 클라이언트(Claude Desktop·Cursor·크롬 확장)가 x402 Bazaar 1.5만 개 상품에서 찾아 예산 안에서만 사고 결과만 돌려줍니다. 예산과 권한은 서버가 강제합니다.
https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md

**4/**
개발자 프리뷰입니다. 구매자 유입이나 매출은 보장 못 합니다. 첫 목표는 외부 판매자 한 명의 도구를 외부 구매자 한 명이 실제로 쓰는 것. 그다음 반복 구매.

신청(엔드포인트·입출력 예제·가격만): https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## X thread (English)

**1/** Built a tool by vibe coding? Let AI agents pay for it per call.
We're wiring the first sales flow with 3 developers who have a working API. No code changes: one endpoint gets an x402 paywall, an agent-readable product description and a buy link.
👉 https://handsel-mandate-demo.vercel.app

**2/** The loop: agent discovers → checks its budget → pays per call over x402 → gets the result. We ran it end to end on our own tool; it now takes real USDC on Base mainnet. (video)

**3/** Buyer side is open too: say "within $1, extract the tables from this doc" and an MCP client (Claude Desktop, Cursor, a Chrome extension) searches the x402 Bazaar (~15k listings), buys only inside that budget and returns just the result. Budget and permissions are enforced server-side.

**4/** Developer preview. No promise of buyers or revenue. First goal: one external seller's tool used by one external buyer, then repeat purchases.
Apply (endpoint, example I/O, price): https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## 개발자 커뮤니티 글 (홍보가 허용되는 곳)

제목: 바이브 코딩으로 만든 API, 에이전트가 호출당 결제해서 쓰게 연결해 드립니다 (테스트넷, 3명)

본문:
- 무엇: 여러분의 기존 API 앞에 x402 결제 게이트를 세우고, 에이전트가 읽는 상품 설명과 구매 링크를 만들어 드립니다. 코드는 안 고칩니다.
- 증거: 저희 도구로 끝까지 돌린 공개 데모. 에이전트가 402 견적을 받고, 예산을 확인하고, 결제하고, 결과를 받는 흐름이 그대로 보입니다. 지금은 Base 메인넷에서 실제 USDC로 결제받습니다. https://handsel-mandate-demo.vercel.app
- 구매자 쪽: MCP 서버 하나로 Claude Desktop·Cursor·크롬 확장에서 "1달러 안에서"라고 위임하면 x402 Bazaar에서 찾아 예산 안에서만 삽니다. https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md
- 조건: 작동하는 입력/출력 API, 호출당 가격, 수취 주소. 이미 공개했고 누군가 사용법을 물어본 도구를 우선합니다.
- 솔직하게: 개발자 프리뷰. 구매자 유입·매출 보장 없음, 환불·에스크로 없음. 첫 목표는 외부 구매자 1명이 여러분 도구를 실제로 쓰는 것, 그다음 반복 구매.
- 신청: (링크)

## 개별 DM (개발자 한 명에게)

> 안녕하세요, 만드신 [도구 이름] 잘 봤습니다. [어디서 봤는지 한 줄].
>
> 이 도구를 AI 에이전트가 호출당 구매하는 방식으로 연결해보고 싶습니다. 엔드포인트 하나만 있으면 되고, 코드는 안 고치셔도 됩니다. 저희 도구로 먼저 돌려 지금 Base 메인넷에서 실제로 결제받고 있는 페이지입니다: https://handsel-mandate-demo.vercel.app
>
> 개발자 프리뷰라 구매자를 보장하진 못하고, 테스트넷에서 먼저 연결한 뒤 첫 외부 구매가 나오는지 같이 보는 제안입니다. 관심 있으시면 입력/출력 예제와 원하시는 호출당 가격만 알려주세요.

## 30초 영상 촬영

### 방법 A · 한 줄 자동 녹화 (권장)

```
npm i -D playwright && npx playwright install chromium   # 처음 한 번
npm run record                                           # 라이브 페이지를 녹화
```

`demo-video/demo.webm`(1280×800, 2배 해상도), `demo.srt`(자막, 아래 대본과 같은 문구·타이밍)가 나옵니다. X·유튜브 업로드용 MP4는 시스템 ffmpeg가 있으면 자동 생성되고, 없으면 `brew install ffmpeg` 후 화면에 나오는 변환 명령을 실행하세요. 한 번 녹화할 때마다 실제 테스트넷 구매 1건(0.01 USDC)이 일어나고 내부 거래로 집계됩니다. 다른 URL을 찍으려면 `npm run record -- https://... out-dir`.

자막은 CapCut·iMovie·DaVinci에 `demo.srt`를 불러오거나, 대본 표를 보고 직접 얹으세요. 배경음은 넣지 않아도 됩니다.

### 방법 B · 직접 녹화

1. 브라우저 창을 1280×800쯤으로, 확대 110%, 북마크 바·다른 탭·확장 아이콘은 숨깁니다. 시크릿 창이 깔끔합니다.
2. 녹화 시작: macOS는 `⌘⇧5`(화면 일부 선택), Windows는 `Win+Alt+R`. 마이크는 끕니다.
3. 아래 표 순서대로 스크롤하고 버튼을 한 번만 누릅니다. 결과가 뜬 뒤 3초 머물고, 05 섹션까지 내려가 3초 뒤 정지합니다.
4. 편집 앱에서 30초 안으로 자르고 자막을 얹은 뒤 1080p MP4(H.264)로 내보냅니다.

### 대본

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

- 진짜 돈인가요? → 네. 공개 페이지는 Base 메인넷 실제 USDC로 결제받습니다. 판매자 연결은 테스트넷에서 먼저 하고 메인넷으로 올립니다.
- 내 코드 고쳐야 하나요? → 아니요. 프록시가 앞에 서고, 결제된 호출만 비밀 헤더와 함께 전달합니다. 그 헤더 없는 호출만 거부해 주시면 됩니다.
- 구매자는 누가 데려오나요? → 판매자가 자기 사용자에게 링크를 배포하는 것이 기본입니다. 402 응답에 Bazaar 메타데이터가 들어 있어 첫 정산 뒤 x402 Bazaar에 자동으로 실리고, 저희 MCP 클라이언트를 쓰는 에이전트가 거기서 찾습니다.
- 실패한 호출도 돈이 나가나요? → API가 2xx가 아니면 검증된 결제를 취소합니다. 다만 결과 품질에 대한 환불·에스크로는 없습니다.
- 성공 기준은? → 외부 판매자 한 명의 도구를 외부 구매자 한 명이 실제로 쓰는 것. 그다음 반복 구매. 우리끼리 돌린 테스트 거래는 따로 셉니다.
