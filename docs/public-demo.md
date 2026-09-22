# 공개 데모: 도구 하나의 테스트넷 구매를 끝까지

목표는 기능 추가가 아니라 **도구 하나 → 가격 설정 → 에이전트 구매 → 결과 수령**을 Base Sepolia 테스트넷에서 끝까지 연결하고, 누구나 눌러볼 수 있는 공개 링크로 만드는 것입니다. `demo/`가 그 구현입니다.

## 무엇이 들어 있나

| 파일 | 역할 |
|---|---|
| `demo/tool.js` | 기본 판매 도구: Markdown 표 → JSON 변환기 (의존성 없음) |
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

## Vercel 배포

현재 배포: **https://handsel-mandate-demo.vercel.app** (Vercel 프로젝트 `handsel-mandate-demo`, `main` 푸시마다 자동 배포). `DEMO_MODE=testnet`으로 배포돼 있고 x402.org facilitator를 씁니다. 판매자 수취 주소 `0x1f6C5A411c2223a36DC0E693387E1F69f0FBD7d0`, 데모 에이전트 지갑 `0x06578002e67Ec357Bf1932c97de5f6053AD60990` (둘 다 테스트넷 전용, 키는 Vercel 환경 변수에 있음). 에이전트 지갑의 Base Sepolia USDC 잔액이 호출가보다 적으면 페이지 버튼이 꺼지고 충전 안내가 뜹니다. https://faucet.circle.com 에서 Base Sepolia USDC를 그 주소로 보내면 재배포 없이 바로 켜집니다. `BASE_SEPOLIA_RPC`로 잔액 조회 RPC를 바꿀 수 있습니다.

저장소 루트가 그대로 Vercel 프로젝트입니다 (`api/index.js`가 모든 경로를 받고 `vercel.json`이 재작성). 환경 변수는 위와 같고, `PUBLIC_BASE_URL`을 비우면 프로덕션 도메인을 자동으로 씁니다. 서버리스라 구매 집계·데모 예산·로컬 모드의 nonce 기록은 인스턴스 메모리에만 있고 JSONL 원장은 꺼집니다. 집계가 필요하면 로그 드레인이나 외부 저장소를 붙이세요. 브라우저 버튼의 데모 에이전트는 같은 인스턴스에 루프백으로 접속해 구매하므로 배포 보호 설정과 무관하게 동작합니다.

## 검증 상태

- 자동 테스트: 실제 x402 SDK가 양쪽(판매자 서버, 구매 에이전트)에서 동작하고, 서명·금액·수취인·nonce 재사용이 검증됩니다. 프록시는 가짜 업스트림으로 비밀 헤더 전달, 미결제 차단, 업스트림 실패 시 결제 취소를 검증합니다. 체인은 사용하지 않습니다.
- **실제 Base Sepolia 정산은 이 변경에서 실행하지 않았습니다.** 자금 있는 테스트넷 키와 공개 https 도메인이 필요합니다. 테스트넷 모드로 배포한 뒤 첫 구매의 tx 해시를 이 문서에 기록하세요.
- 데모 에이전트는 EOA이며 Handsel의 온체인 위임 경로(Coinbase Smart Account + MandateValidator + BlockFlow 바인딩 + DAMBI 게이트)를 쓰지 않습니다. 예산은 구매 프로세스 안에서만 강제됩니다. 이 경로 연결은 [seller-studio.md](seller-studio.md)의 게이트 5입니다.
- 없는 것: 메인넷, 환불·에스크로, Bazaar 등록, 판매자 로그인, 자동 고객 유입.

## 홍보 순서

1. **데모 먼저.** 위 테스트넷 모드로 배포해 공개 링크를 만듭니다. 30초 영상은 페이지 그대로: 도구 카드 → 버튼 → 5단계 체크 → 결과 JSON → Basescan. "x402·AA 통합 플랫폼" 설명은 넣지 않습니다. TESTNET 배너는 자르지 않습니다.
2. **링크 공개.** 영상과 함께 페이지 링크, `product.json`, curl 한 줄을 올립니다.
3. **개발자에게 구체적으로 제안.** 이미 도구를 공개했고 사용법 질문을 받는 개발자를 X·개발자 커뮤니티·인맥에서 고릅니다. 문구 예: "만드신 PDF 표 추출 도구를 에이전트가 호출당 구매하는 방식으로 연결해보고 싶습니다. 엔드포인트 하나만 있으면 되고, 여기 저희 도구로 돌린 테스트넷 데모가 있습니다: (링크)". 홍보가 허용되는 곳에서만 모집합니다.
4. **판매자가 자기 사용자에게 배포.** 우리는 상품 링크(`product.json`)와 에이전트 연결 방법(402 → 서명 → 결과)을 주고, 판매자는 기존 소개 글·문서에 붙입니다. Bazaar 등록은 추가 발견 경로로 나중에 붙입니다.

첫 성공 기준: 가입자 수가 아니라 **외부 판매자 한 명의 도구를 외부 구매자 한 명이 실제로 사용**하는 것. 그다음 반복 구매. 우리끼리 돌린 테스트 거래는 internal로 따로 셉니다.
