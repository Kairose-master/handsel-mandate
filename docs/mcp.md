# 402-LAB MCP 서버: "1달러 안에서" 자연어 위임 → 에이전트가 찾고 사서 결과만 돌려줌

사람이 자연어로 예산을 위임하면(예: "1달러 안에서 이 문서 표를 JSON으로 뽑아줘"), MCP를 쓰는 어떤 클라이언트든(크롬 확장, Aside 같은 브라우저 에이전트, Claude Desktop, Cursor) 이 서버의 도구로 상품을 찾고, 예산 안에서만 x402 결제하고, 결과만 돌려줍니다. 예산과 권한은 서버가 강제합니다. 클라이언트의 LLM이 아무리 원해도 한도를 넘는 서명은 나가지 않습니다.

## 도구

| 도구 | 역할 | 강제되는 것 |
|---|---|---|
| `mandate_status` | 현재 위임 상태 | 항상 먼저 호출 |
| `mandate_create(total_usdc, per_call_usdc?, minutes?, allowed_sellers?)` | 사람이 말한 예산을 위임으로 기록 | 서버 설정 상한(`MANDATE_MAX_USDC`, 기본 1 USDC / `MANDATE_MAX_MINUTES` 60분) 초과 거부, 활성 위임 1개만 |
| `mandate_revoke` | 즉시 회수 | 이후 서명 차단. 이미 서명된 건은 정산될 수 있음 |
| `discover(query)` | 상품 검색 | 설정 네트워크의 상품만. 판매자 `product.json` 목록 + (옵션) x402 Bazaar |
| `buy(url, method?, input?, request_id?)` | 402 견적 검증 → 예산 예약 → 서명 → 결과 | 건당 한도, 남은 총예산, 네트워크·USDC 고정, 판매자 허용 목록, https 전용, 견적 URL 일치. 예약은 서명 전에 기록되고 환불되지 않음. `request_id` 재사용 시 재결제 없음 |
| `receipts` | 영수증과 정산 tx 링크 | |

에이전트에게 주는 지시문(서버가 `instructions`로 전달): 상태 확인 → 위임 없으면 사람에게 예산을 묻고 `mandate_create` → `discover` → `buy` → 결과만 반환. 사람이 말하지 않은 위임은 만들지 않는다.

## 실행

```
BUYER_PRIVATE_KEY=0x...            # 구매 지갑 (테스트넷이면 Base Sepolia USDC, 메인넷이면 Base USDC)
NETWORK=eip155:84532               # 또는 eip155:8453 (메인넷, 실제 USDC)
MANDATE_MAX_USDC=1                 # 사람이 정하는 절대 상한
CATALOG_URLS=https://handsel-mandate-demo.vercel.app/product.json   # 쉼표로 여러 개
BAZAAR=1                           # x402 Bazaar 검색도 포함 (선택)
npm run mcp                        # stdio
npm run mcp:http -- 4402           # http://127.0.0.1:4402/mcp, 시작 시 Bearer 토큰 출력
```

상태는 `mcp/state.local.json`(`STATE_PATH`)에 남고 프로세스를 재시작해도 예산 예약이 유지됩니다.

### Claude Desktop · Cursor · Aside (stdio)

```json
{ "mcpServers": { "402-lab": { "command": "node", "args": ["/absolute/path/handsel-mandate/mcp/server.js"],
  "env": { "BUYER_PRIVATE_KEY": "0x...", "NETWORK": "eip155:84532", "MANDATE_MAX_USDC": "1" } } } }
```

그다음 대화에서: "1달러 안에서 이 마크다운 표를 JSON으로 바꿔줘". 클라이언트가 `mandate_create("1")` → `discover` → `buy`를 호출하고 결과 JSON을 보여줍니다. 대부분의 MCP 호스트는 도구 호출마다 사람의 승인 창을 띄우므로, 위임 생성과 각 결제는 사람이 한 번씩 확인하게 됩니다.

### 크롬 확장 (HTTP)

브라우저 확장은 stdio를 열 수 없으므로 `--http`로 띄운 로컬 서버에 붙습니다. `examples/mcp-browser-client.js`가 SDK 없이 JSON-RPC로 초기화·도구 목록·도구 호출을 하는 40줄짜리 클라이언트입니다. 확장의 background에서:

```js
import { createMcpClient } from './mcp-browser-client.js';
const mcp = createMcpClient({ url: 'http://127.0.0.1:4402/mcp', token: SAVED_TOKEN });
await mcp.init();
await mcp.call('mandate_create', { total_usdc: '1' });     // 사람이 "1달러" 라고 한 뒤에만
const { items } = await mcp.call('discover', { query: '표 추출' });
const r = await mcp.call('buy', { url: items[0].url });      // r.result 가 도구 출력
```

보호 장치: 127.0.0.1 바인딩, Host 검사, Bearer 토큰 필수, `Origin`이 있으면 `chrome-extension://…`만 허용(일반 웹페이지는 403). 토큰은 서버 시작 시 stderr에 찍히며 확장 옵션에 한 번 저장합니다.

## 권한 모델

- 한도는 사람이 두 곳에서 정합니다. 서버 환경 변수의 절대 상한, 그리고 대화에서 말한 위임 금액. 에이전트는 둘 중 작은 쪽 안에서만 움직입니다.
- 예약은 서명 전에 파일에 기록되고 돌려주지 않습니다. 타임아웃·오류가 나도 예산은 소비된 것으로 칩니다(서명이 나중에 정산될 수 있음). `runtime/buyer.js`와 같은 원칙입니다.
- 네트워크와 토큰은 서버 설정에 고정됩니다. 다른 체인·다른 토큰 견적은 거부합니다.
- 결과의 품질은 보장하지 않습니다. 환불·에스크로는 없습니다. 지갑 키는 이 프로세스가 들고 있으므로 위임 상한 이하의 소액만 넣으세요.
- 이 서버의 예산 강제는 프로세스 안에서 이뤄집니다. 온체인에서 강제되는 위임(Coinbase Smart Account + MandateValidator)은 별도 경로([session-payments.md](session-payments.md))이며 아직 연결하지 않았습니다.

## 수수료 모델에 대해

x402 exact 결제는 한 주소로 한 번 전송되므로 프로토콜 안에서 중개 수수료를 나눌 수 없습니다. 선택지는 셋입니다. ① 판매자 프록시(`demo/upstream.js`)의 수취 주소를 플랫폼 주소로 두고 판매자에게 정산(수탁형, 규제 검토 필요) ② 판매자 등록 시 월 정산 계약(비수탁, 원장은 수취 주소의 USDC 전송으로 검증) ③ 구매 측 서버가 건당 소액을 플랫폼 주소로 별도 전송(가스·UX 비용). 지금은 ②를 전제로 원장만 남깁니다.
