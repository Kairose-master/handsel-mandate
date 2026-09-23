# 402-LAB — 에이전트가 발견하고 구매하는 API

402-LAB은 바이브 코딩으로 만든 API를 에이전트가 발견하고 호출당 구매할 수 있게 연결하는 개발자 프리뷰입니다.

공개 데모: https://handsel-mandate-demo.vercel.app  
판매 신청: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml  
MCP 구매 흐름: [docs/mcp.md](docs/mcp.md)

현재 확인 가능한 결제 증거는 Base Sepolia 테스트넷의 내부 검증 및 MCP 구매입니다. x402 MCP 클라이언트가 외부 판매자 GetBags의 API를 0.01 test USDC로 구매한 기록: [Base Sepolia tx](https://sepolia.basescan.org/tx/0xd02557b808ed70e8533e153bcfb132d3ead8c6e931cb13e43f1936359e6279df). 이는 테스트넷에서 우리 에이전트가 외부 서비스를 구매한 증거이며, 외부 사용자가 402-LAB 상품을 구매했거나 메인넷 매출이 발생했다는 뜻은 아닙니다.

## 이번 주에 확인할 가설

- 구매자: “1달러 안에서 필요한 결과를 찾아줘.” → 에이전트가 x402 상품을 찾아 예산 안에서 구매한다.
- 판매자: 작동하는 API의 입력·출력 예시와 가격을 보내면 x402 판매 프록시 연결을 함께 시험한다.
- 첫 상품: 한국 사업자 상태 조회 API. 최대 100개 사업자번호를 조회하는 호출은 0.02 USDC이며, NTS API 키와 이용 조건이 필요하다.

디렉터리 노출·구매자 유입·매출은 아직 검증되지 않았습니다. 가격과 결과 품질이 맞는지도 파일럿으로 확인합니다. 

## 402-LAB MCP · “1달러 안에서” 위임

사람이 자연어로 예산을 위임하면 MCP 클라이언트가 x402 상품을 찾고, 설정된 예산과 판매자 정책 안에서 구매해 결과를 돌려줍니다. `npm run mcp`(stdio) 또는 `npm run mcp:http`(확장용). [설치 및 한계](docs/mcp.md).

## Seller Studio · 판매자용 초안

바이브 코딩으로 만든 도구의 설명·호출 예제·가격을 정리하고 x402 연동 설정을 내보내는 로컬 스튜디오입니다. 실제 API 호출·결제·Bazaar 등록·공개 판매는 수행하지 않습니다. [범위와 다음 단계](docs/seller-studio.md).

## 제품 경계

- 데모의 일반 USDC 결제 모드와 테스트넷 증거는 구분합니다. 현재 메인넷 정산 또는 외부 고객 구매를 확인한 기록은 없습니다.
- 가격·예산 정책은 데모 구현의 범위에서만 강제됩니다. 결과 품질, 환불, 구매자 유입은 보장하지 않습니다.
- MCP 도구는 결제 전에 예산과 허용 정책을 검사합니다. 브라우저 제품과의 자동 연결은 각 제품의 어댑터 지원이 필요합니다.

## 개발

Node 22+에서 `npm ci` 후 `npm test`. 공개 데모 설정과 판매자 연동은 [docs/public-demo.md](docs/public-demo.md)를 참고하세요.
