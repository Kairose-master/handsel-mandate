# 공개 데모: 도구 하나의 테스트넷 구매를 끝까지

목표는 기능 추가가 아니라 **도구 하나 → 가격 설정 → 에이전트 구매 → 결과 수령**을 Base Sepolia 테스트넷에서 끝까지 연결하고, 누구나 눌러볼 수 있는 공개 링크로 만드는 것입니다. `demo/`가 그 구현입니다.

## 무엇이 들어 있나

| 파일 | 역할 |
|---|---|
| `demo/tools/nts.js` | **판매 상품: 사업자등록 상태 조회 (국세청).** 공공데이터포털 국세청 API(이용허락범위 제한 없음)를 중계. `NTS_SERVICE_KEY`가 있으면 자동 선택 |
| `demo/tool.js` | 키가 없을 때의 대체 도구: Markdown 표 → JSON 변환기 |
| `demo/upstream.js` | **판매자용 x402 프록시.** 판매자의 기존 API 앞에 결제 게이트를 세우고, 결제된 호출만 공유 비밀 헤더와 함께 전달합니다. Seller Studio 내보내기 파일을 그대로 읽습니다 |
| `demo/config.js` | 환경 변수 파싱 (`node demo/server.js`와 Vercel 핸들러 공용) |
| `api/index.js` · `vercel.json` | Vercel 배포용 핸들러와 라우팅 |
| `demo/seller.js` | 공식 `@x402/core` + `@x402/evm` 서버 SDK로 `GET /convert/sample`, `POST /convert`에 x402 v2 exact/EIP-3009 결제 게이트를 건 판매자 서버. `product.json`, 공개 데모 페이지, 서버 실행 데모 에이전트, 내부/외부 구매 집계 포함 |
| `demo/agent.js` | 데모 구매 에이전트. 기존 `runtime/buyer.js`의 `buy()`·`validateQuote()`를 그대로 사용해 402 견적 → 예산 확인 → 서명 → 결과 수령 단계를 기록 |
| `demo/facilitator-local.js` | 체인 없는 로컬 모드용 facilitator 대역. 실제 EIP-3009 서명을 검증하지만 정산은 시뮬레이션이며 응답에 `simulation: true`를 표시 |
| `demo/page.html` · `page.js` · `page.css` | 공개 데모 페이지. TESTNET 배너가 항상 보이고, 5단계 진행과 결과 JSON, Basescan 링크, 내부/외부 구매 집계를 보여줌 |
| `tests/demo.test.js` | 402 견적, 예산 내 2회 구매 후 3회차 서명 전 차단, 외부 x402 클라이언트의 POST 구매, 재사용 서명 거부, 변조 금액 거부 |

## 로컬 실행 (키 없음)

```
npm ci
npm run demo
# http://127.0.0.1:4402
```

로컬 모드는 서명을 프로세스 안에서 검증하고 체인에는 아무것도 기록하지 않습니다. 페이지·응답·영수증 모두 "로컬 시뮬레이션"으로 표시됩니다. 판매 실적으로 세지 마세요.

## 테스트넷 실행

필요한 것: 판매자 수취 주소, https 공개 URL, 그리고 브라우저 버튼용 데모 에이전트 키(테스트넷 전용 EOA, Base Sepolia USDC 소액 보유). facilitator가 가스를 내므로 에이전트 키에 ETH는 필요 없습니다.

```
DEMO_MODE=testnet \
PUBLIC_BASE_URL=https://demo.your-domain.example \
SELLER_PAY_TO=0xYourSellerAddress \
DEMO_AGENT_KEY=0xTestnetOnlyKey \
DEMO_TOTAL=0.10 PRODUCT_PRICE=0.01 DEMO_RUNS_PER_HOUR=20 \
X402_FACILITATOR_URL=https://x402.org/facilitator \
PORT=4402 npm run demo
```

- `PUBLIC_BASE_URL`은 402 견적의 `resource.url`이 됩니다. 구매자는 이 주소로 결제하므로 배포 도메인과 정확히 일치해야 합니다.
- `DEMO_AGENT_KEY`는 서버 메모리에만 있고 페이지로 나가지 않습니다. 페이지 버튼은 `POST /demo/run`만 호출합니다. 시간당 실행 횟수와 시간당 총예산(`DEMO_TOTAL`, 최대 1 USDC)으로 소진 폭을 제한합니다. 이 키의 구매는 자동으로 **internal**로 집계됩니다.
- `INTERNAL_PAYERS=0x...,0x...`에 팀 지갑을 적으면 그 구매도 internal로 셉니다. 나머지가 **external**입니다. 첫 성공 기준은 external 1건, 그다음 같은 payer의 반복 구매입니다. 원장은 `LEDGER_PATH`(기본 `demo/ledger.local.jsonl`)에 JSONL로 남습니다.
- 정산 확인: 응답의 `PAYMENT-RESPONSE`와 페이지의 Basescan 링크로 USDC Transfer를 직접 확인하세요. 판매자 서버가 보고한 정산은 판매자의 주장이며, 독립 확인이 끝나기 전에는 "확인된 온체인 구매"라고 말하지 마세요.
- 배포: 상태 없는 Node 22 프로세스 하나입니다. Render·Fly·Railway 등 어느 Node 호스트든 위 환경 변수와 `node demo/server.js`면 됩니다. 원장을 남기려면 영속 볼륨 또는 외부 로그 수집을 붙이세요.

내 에이전트로 직접 구매: `SELLER_PAY_TO`, `DEMO_AGENT_KEY`, `DEMO_ENDPOINT=https://.../convert/sample`을 지정하고 `npm run demo:buy`. 다른 x402 v2 클라이언트도 `curl -i .../convert/sample`로 402를 받은 뒤 그대로 결제할 수 있습니다.

## 우리 상품: 사업자등록 상태 조회 (국세청)

`POST /biz/status` 본문 `{"b_no": ["1248100998", ...]}`(최대 100건, 하이픈 허용) → 국세청 기준 사업자 상태(계속·휴업·폐업), 과세유형, 폐업일. `GET /biz/status/sample`은 예제 번호 1건. 서버가 공공데이터포털 인증키 `NTS_SERVICE_KEY`를 들고 `api.odcloud.kr/api/nts-businessman/v1/status`를 호출하며, 키는 응답·product.json·로그 어디에도 나가지 않습니다. 국세청 응답이 OK가 아니면 검증된 결제를 취소하고 502를 돌려줍니다. 입력(사업자번호)은 로그에 남기지 않습니다.

프로덕션에는 2026-09-23에 키를 넣어 이 상품이 켜져 있고 가격은 0.02 USDC/호출입니다. 키 발급: https://www.data.go.kr/data/15081808/openapi.do 에서 활용신청(자동승인) → 마이페이지에서 일반 인증키(Decoding) 복사 → Vercel `NTS_SERVICE_KEY`에 저장 후 재배포. 활용 목적에는 "유료 API 중계 서비스"라고 사실대로 적고, 트래픽이 늘면 활용사례를 등록해 증량을 신청합니다. 한도는 1회 100건, 하루 100만 건입니다. 상품 설명에 출처(국세청)를 표기합니다.

## 판매자: 내 API 앞에 결제 게이트 세우기

판매자는 코드를 고치지 않습니다. Seller Studio에서 내려받은 `blockflow-product-draft.json`과 비밀 문자열 하나로 프록시를 띄웁니다.

```
PRODUCT_FILE=./blockflow-product-draft.json \
UPSTREAM_SECRET=$(openssl rand -hex 24) \
DEMO_MODE=testnet PUBLIC_BASE_URL=https://pay.your-domain.example \
DEMO_AGENT_KEY=0xTestnetOnlyKey npm run demo
```

파일 없이 환경 변수로도 됩니다: `UPSTREAM_URL`, `UPSTREAM_METHOD`, `PRODUCT_NAME`, `PRODUCT_DESCRIPTION`, `PRODUCT_EXAMPLE_REQUEST`(JSON), `PRODUCT_PRICE`, `SELLER_PAY_TO`.

동작: 프록시가 업스트림과 같은 경로(예: `POST /extract`)를 공개하고, 결제된 요청만 업스트림으로 전달합니다. 전달 요청에는 `x-paywall-secret: <UPSTREAM_SECRET>`과 `x-paid-by: <구매자 주소>`가 붙습니다. **판매자 API는 이 비밀 헤더가 없는 호출을 거부해야** 프록시를 우회한 무료 호출을 막을 수 있습니다. `GET /extract/sample`은 Studio에 적은 예제 입력을 그대로 보내는 경로라 GET 전용 에이전트(데모 에이전트 포함)도 구매할 수 있습니다.

업스트림이 2xx가 아니면 검증된 결제를 취소하고 구매자에게 502를 돌려주므로, 실패한 호출에는 정산이 일어나지 않습니다. 잠금: https 고정, 리다이렉트 금지, 20초 타임아웃, 요청 256KB·응답 1MB 제한, 쿼리·자격증명이 있는 URL 거부, 판매자당 엔드포인트 하나. 비밀은 `product.json`에 나가지 않습니다.

## 메인넷 모드

판매자가 Base 메인넷에서 실제 USDC 결제를 받는 모드입니다. 브라우저 데모 에이전트는 메인넷에서 자동 구매하지 않으며, 외부 구매자가 자기 지갑·예산 정책으로 결제해야 합니다.

필수 환경 변수: `DEMO_MODE=mainnet`, `PUBLIC_BASE_URL=https://...`, `SELLER_PAY_TO=0x...`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`. 선택: `BASE_MAINNET_RPC`, `PRODUCT_PRICE`. 메인넷 facilitator는 CDP 인증 클라이언트를 사용합니다. `SELLER_PAY_TO`에는 Base 메인넷 USDC를 받을 주소를 지정하세요. `DEMO_AGENT_KEY`는 메인넷 모드에서 거부됩니다. 메인넷 결제는 실제 USDC를 이동하며 현재 환불·에스크로가 없습니다.

전환 절차 (Vercel 프로젝트 `handsel-mandate-demo`): ① `CDP_API_KEY_ID`·`CDP_API_KEY_SECRET`(portal.cdp.coinbase.com → API Keys → Secret API key)와 본인이 통제하는 Base 메인넷 USDC 수취 주소를 준비 ② 환경 변수 `SELLER_PAY_TO`를 그 주소로 바꾸고 CDP 키 2개를 sensitive로 추가 ③ `DEMO_AGENT_KEY`·`SELLER_PRIVATE_KEY`(테스트넷 키) 삭제 ④ `DEMO_MODE=mainnet`으로 변경 후 재배포 ⑤ `curl -i https://handsel-mandate-demo.vercel.app/convert/sample`로 402의 network가 `eip155:8453`, asset이 Base USDC인지 확인 ⑥ 본인 지갑으로 실구매 1건: `npm run buy:once -- https://handsel-mandate-demo.vercel.app/convert/sample --key 0x... --max 0.01 --mainnet` 후 Basescan에서 USDC Transfer 확인.

상품은 `GET /product.json`에 노출되고 paid endpoint는 Base mainnet `eip155:8453`과 Base USDC를 사용합니다. Bazaar 색인은 metadata를 가진 endpoint에 성공적인 결제가 정산된 뒤 확인합니다.

## Vercel 배포

현재 배포: **https://handsel-mandate-demo.vercel.app** (Vercel 프로젝트 `handsel-mandate-demo`, `main` 푸시마다 자동 배포). **2026-09-23부터 프로덕션은 `DEMO_MODE=mainnet`** 입니다. CDP facilitator를 쓰고, 402 견적은 `eip155:8453` Base USDC, 수취 주소 `0xe818cf591E65C93600311E789f25301138299232` (판매자가 통제하는 메인넷 주소). 브라우저 데모 에이전트는 서버가 거부해 꺼져 있고, 페이지에 실결제 경고가 뜹니다. 전환 직후 확인: `/health` mainnet, 402의 network·asset·payTo, `product.json` status `production`, `/demo/run` 503. **첫 메인넷 정산 확인 (2026-09-23, 내부 테스트 거래):** 판매자 본인 지갑 `0xAdC7A7FF6F9a00FbBB099867951D57e494C1C3d0`이 `GET /biz/status/sample`을 0.02 USDC에 구매, CDP facilitator 정산. tx [`0x4da02862…c42cfd`](https://basescan.org/tx/0x4da028621c3c27ce57ceecc9023f724c62a9dff4ebeaf86f5c90924440c42cfd) (블록 51687095). RPC 대조: success, USDC `Transfer` 구매자 → 판매자 `0xe818…9232` 20000 µUSDC, 같은 authorizer의 `AuthorizationUsed` nonce 일치. 응답은 국세청 상태조회 결과(계속사업자). 우리 지갑끼리의 거래라 external로 세지 않습니다. 두 번째 정산 [`0xd8d60226…f73289`](https://basescan.org/tx/0xd8d602260a0e95553a278b2153edf63fe8afd24e88b88978a807559709f73289)(블록 51687284, 11:45 UTC)는 Bazaar 서버 확장을 켠 뒤의 첫 정산이라 색인 조건을 채웠습니다. 등재 확인(2026-09-24): CDP 검증 API `POST https://api.cdp.coinbase.com/platform/v2/x402/validate {"resource": "...", "method": "GET"}`가 `index: {active: true, lastCrawledAt: 2026-09-23T11:45:14Z}`를 돌려주고, 목록 16,693건 중 15,932번째, 한국어 검색("국세청 사업자등록 상태 조회")에서 1위입니다. 목록 순서는 최근 30일 호출 수·고유 구매자 수(quality)라 정산이 쌓여야 올라갑니다. 등재 여부는 목록 첫 페이지가 아니라 validate 엔드포인트의 `index` 필드나 검색으로 확인하세요. 정산 응답의 `EXTENSION-RESPONSES` 헤더(`bazaar.status`: success/processing/rejected, `rejectedReason`)는 서버 로그와 `/demo/status`의 recent 항목에 기록됩니다. 같은 분야의 기존 등재 판매자로 `kbv-server-…run.app/v1/business/*`(한국 사업자 검증, 영어 설명)가 있습니다. 프리뷰 배포는 `DEMO_MODE=testnet`과 테스트넷 에이전트 키를 유지합니다. 테스트넷 시절 값(에이전트 `0x0657…0990`, 판매자 `0x1f6C…D7d0`)은 프로덕션에서 제거했습니다.

저장소 루트가 그대로 Vercel 프로젝트입니다 (`api/index.js`가 모든 경로를 받고 `vercel.json`이 재작성). 환경 변수는 위와 같고, `PUBLIC_BASE_URL`을 비우면 프로덕션 도메인을 자동으로 씁니다. 서버리스라 구매 집계·데모 예산·로컬 모드의 nonce 기록은 인스턴스 메모리에만 있고 JSONL 원장은 꺼집니다. 집계가 필요하면 로그 드레인이나 외부 저장소를 붙이세요. 브라우저 버튼의 데모 에이전트는 같은 인스턴스에 루프백으로 접속해 구매하므로 배포 보호 설정과 무관하게 동작합니다.

## 검증 상태

- 자동 테스트: 실제 x402 SDK가 양쪽(판매자 서버, 구매 에이전트)에서 동작하고, 서명·금액·수취인·nonce 재사용이 검증됩니다. 프록시는 가짜 업스트림으로 비밀 헤더 전달, 미결제 차단, 업스트림 실패 시 결제 취소를 검증합니다. 체인은 사용하지 않습니다.
- **첫 테스트넷 구매 확인 (2026-09-23, 내부 테스트 거래):** 배포된 데모 에이전트 `0x06578002e67Ec357Bf1932c97de5f6053AD60990`가 `GET /convert/sample`을 0.01 USDC에 구매했고, x402.org facilitator가 정산했습니다. tx [`0x2cea207c6b688ac18519792679ac69d4bbf12ff98e301ff7194a9c3d5b0dc756`](https://sepolia.basescan.org/tx/0x2cea207c6b688ac18519792679ac69d4bbf12ff98e301ff7194a9c3d5b0dc756) (블록 47179820). RPC로 독립 대조: 상태 success, USDC `Transfer` 에이전트 → 판매자 `0x1f6C5A411c2223a36DC0E693387E1F69f0FBD7d0` 10000 µUSDC, 같은 authorizer의 `AuthorizationUsed` nonce 일치, 판매자 잔액 0.01 USDC. 이 건은 우리끼리 돌린 거래라 external 집계에 넣지 않습니다.
- 데모 에이전트는 EOA이며 Handsel의 온체인 위임 경로(Coinbase Smart Account + MandateValidator + BlockFlow 바인딩 + DAMBI 게이트)를 쓰지 않습니다. 예산은 구매 프로세스 안에서만 강제됩니다. 이 경로 연결은 [seller-studio.md](seller-studio.md)의 게이트 5입니다.
- 프로덕션은 메인넷 모드로 켜져 있고 첫 메인넷 정산(내부 거래)을 확인했습니다. Bazaar 색인 확인은 정산 이후 진행 중입니다. 환불·에스크로, 판매자 로그인, 자동 고객 유입도 없습니다.

## 홍보 순서

1. **파일럿 먼저.** 기술 흐름을 보여줄 때는 테스트넷 배너와 Basescan 링크가 보이는 데모를 씁니다. 실제 구매 의향을 검증할 때는 메인넷 환경 설정을 확인한 뒤 실제 결제라는 점을 명시하고 판매자 1곳·외부 구매자 1곳부터 연결합니다. "x402·AA 통합 플랫폼"보다 도구가 해결하는 작업을 설명합니다.
2. **링크 공개.** 영상과 함께 페이지 링크, `product.json`, curl 한 줄을 올립니다.
3. **개발자에게 구체적으로 제안.** 이미 도구를 공개했고 사용법 질문을 받는 개발자를 X·개발자 커뮤니티·인맥에서 고릅니다. 문구 예: "만드신 PDF 표 추출 도구를 에이전트가 호출당 구매하는 방식으로 연결해보고 싶습니다. 엔드포인트 하나만 있으면 되고, 여기 저희 도구로 돌린 테스트넷 데모가 있습니다: (링크)". 홍보가 허용되는 곳에서만 모집합니다.
4. **판매자가 자기 사용자에게 배포.** 우리는 상품 링크(`product.json`)와 에이전트 연결 방법(402 → 서명 → 결과)을 주고, 판매자는 기존 소개 글·문서에 붙입니다. 402 응답에는 Bazaar 호환 검색 메타데이터가 포함됩니다. 실제 facilitator 색인은 성공한 테스트넷 정산 후 확인해야 하며, 색인이 되기 전까지 `product.json` 직접 링크를 배포합니다.

첫 성공 기준: 가입자 수가 아니라 **외부 판매자 한 명의 도구를 외부 구매자 한 명이 실제로 사용**하는 것. 그다음 반복 구매. 우리끼리 돌린 테스트 거래는 internal로 따로 셉니다.
