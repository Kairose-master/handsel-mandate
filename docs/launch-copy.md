# 402-LAB 런칭 문안 및 실행 체크리스트

## 현재 주장 가능한 범위

- 공개 데모는 x402 상품 탐색부터 결제 응답과 결과 수령까지 보여주는 개발자 프리뷰다.
- Base Sepolia에서 내부 정산 기록이 있다.
- 402-LAB MCP가 외부 판매자 GetBags API를 0.01 test USDC에 구매한 테스트넷 tx가 있다: https://sepolia.basescan.org/tx/0xd02557b808ed70e8533e153bcfb132d3ead8c6e931cb13e43f1936359e6279df
- 아직 확인되지 않은 것: 메인넷 실제 정산, 외부 사용자의 402-LAB 상품 구매, 반복 구매, Bazaar 유입/색인 효과, 구매자 수.
- 공개 카운터는 서버 인스턴스 메모리 값이다. 체인 기반 검증이 연결되기 전까지 외부 구매 수치로 홍보하지 않는다.
- x402 Bazaar의 상품 목록 수를 실제 구매자 수나 구매 의도로 표현하지 않는다.

데모 링크: https://handsel-mandate-demo.vercel.app  
판매 신청: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## 청중 1: 에이전트를 쓰는 사람 (구매자)

### 한국어 X 게시물
“1달러 안에서 이 문서 표를 뽑아줘.”

402-LAB MCP는 x402 상품을 찾고, 허용된 예산 안에서 구매한 뒤 결과를 돌려주는 개발자 프리뷰입니다. Base Sepolia에서 외부 API를 테스트넷 USDC로 구매하는 흐름을 확인했습니다. 메인넷 실결제나 외부 고객 구매는 아직 검증 중입니다.

데모: https://handsel-mandate-demo.vercel.app  
MCP 설치: https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md

### English X post
“Find the right tool, spend under $1, and return the result.”

402-LAB is an MCP buyer prototype that discovers x402 services and checks a configured budget before purchase. We have a Base Sepolia testnet receipt for buying an external API. Mainnet customer purchases are not yet verified.

Demo: https://handsel-mandate-demo.vercel.app  
MCP setup: https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md

## 청중 2: API를 만든 개발자 (판매자)

### 한국어 공개 글
바이브 코딩으로 만든 API를 에이전트가 호출당 구매할 수 있게 연결하는 파일럿을 찾습니다.

작동하는 엔드포인트, 입력·출력 예시, 호출 가격, 수취 주소가 있으면 x402 판매 프록시를 함께 시험합니다. 현재는 제품별 설정과 검증이 필요하고 구매자 유입이나 매출은 보장하지 않습니다. 먼저 테스트넷에서 연동하고, 실제 사용자가 원하는지 확인합니다.

판매 신청: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml  
데모: https://handsel-mandate-demo.vercel.app

### English seller post
We’re piloting x402 checkout for APIs built by indie developers.

Share a working endpoint, example input/output, per-call price, and receiving address. We’ll test a seller proxy integration with you. Setup is currently hands-on; buyer traffic and revenue are not guaranteed. We start on testnet and validate demand before discussing production.

Apply: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

### 개인 DM 템플릿
안녕하세요, [도구]를 [발견한 곳]에서 봤습니다. 에이전트가 호출당 결제해 쓰는 방식으로 연결해볼 수 있을지 여쭤봅니다.

작동하는 API라면 입력/출력 예시와 원하는 호출 가격으로 테스트넷 파일럿을 같이 진행할 수 있습니다. 아직 구매자 유입이나 매출을 보장하는 단계는 아니고, 우선 연동 난이도와 실제 수요를 검증하려고 합니다. 관심 있으시면 간단한 예제와 가격만 보내주세요.

## 청중 3: x402/Base 생태계 (증폭자)

### English showcase copy
402-LAB is an open-source MCP buyer prototype with budget checks and an x402 seller proxy. We’re testing whether agents can discover and buy useful indie APIs, starting with a Korean business-status lookup. Testnet receipt and setup: [MCP docs](https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md). Looking for feedback on Bazaar discovery and seller onboarding.

### 제출 위치 메모
- x402 GitHub: Discussions나 showcase가 실제 열려 있고 관련 게시 규칙이 허용되는 경우에만 게시. 저장소 issue를 토론 게시판처럼 사용하지 않는다.
- x402 Discord: showcase 채널의 현재 홍보 규칙을 먼저 확인한다.
- Base 생태계: 공식 앱/빌더 showcase 신청 양식이 열려 있으면 위 문안을 사용한다.
- 게시 전 위 링크와 테스트넷 tx를 다시 확인하고, 메인넷 문구는 별도의 검증된 tx가 생긴 뒤에만 추가한다.

## MCP 디렉터리 제출용 설명문

### Short description
402-LAB MCP helps an agent discover x402 services and buy within a user-configured budget, returning the purchased result.

### Long description
402-LAB is an open-source MCP server prototype for x402 service discovery and purchase. It searches the x402 Bazaar, presents available service details, and checks configured spend limits and seller policies before a purchase. It is an early developer preview: discovery coverage, service quality, refunds, and buyer demand are not guaranteed. Testnet purchase evidence and setup instructions are documented in the repository.

### Tags
`payments`, `x402`, `agent-tools`, `procurement`, `budget-controls`

### Submission checklist
- Repository URL: https://github.com/Kairose-master/handsel-mandate
- MCP setup: [docs/mcp.md](https://github.com/Kairose-master/handsel-mandate/blob/main/docs/mcp.md)
- Demo: https://handsel-mandate-demo.vercel.app
- State clearly that an MCP server is not automatically compatible with every browser agent; client-specific setup may be needed.
- Do not claim marketplace demand, 15k active buyers, guaranteed savings, or verified mainnet sales.

## 첫 상품 파일럿: 사업자 상태 조회

사업자번호의 계속·휴업·폐업 상태를 공식 NTS API에서 조회합니다. 공개 데모 가격은 0.02 USDC/요청이며, 요청당 최대 100개 번호를 받습니다. 이는 테스트할 초기 상품 가설이지, 아직 고객 수요나 데이터 독점성을 증명하지 않습니다. 판매 전 API 키의 이용 조건, 출처 표기, 허용된 상업적 사용을 확인합니다.

구매자가 실제 결과를 필요로 하는지 5명의 한국 자동화/API 개발자와 짧은 인터뷰로 확인합니다. 관심 표현보다 실제 테스트넷 구매 또는 업무에 붙여 다시 쓰는지를 핵심 신호로 봅니다.

## 실행 순서 (2주)

1. 공개 프로필·페이지·저장소에서 402-LAB 이름과 링크를 통일한다. 저장소 slug와 Vercel 프로젝트 이름은 별도 변경 권한이 필요하다.
2. 제품을 외부에서 직접 호출해 상품 설명, 가격, 현재 네트워크 모드를 확인한다.
3. 테스트넷에서 판매자/구매자 양쪽 흐름을 각각 확인하고 tx와 역할을 구분해 기록한다.
4. 30초 데모를 녹화한다. 네트워크 배너, 가격, 결과, 테스트넷 tx를 화면에 포함하고 비밀키·환경변수는 노출하지 않는다.
5. MCP 디렉터리 제출 양식을 확인해 지원되는 곳에 등록한다. 승인·색인은 별도 상태로 기록한다.
6. 구매자 글과 판매자 글을 다른 날/채널에 게시한다. 공개 글은 X, 허용되는 커뮤니티, x402/Base showcase에 맞춰 쓴다.
7. 이미 공개 도구를 만든 개발자 10명에게 개인화된 DM을 보낸다. 대량 자동 발송은 하지 않는다.
8. 2주 후 설치/호출, 검증된 외부 USDC 결제, 판매자 답장을 점검한다. 반응이 없으면 게시물을 늘리기보다 응답자와 비응답자를 인터뷰한다.

## 측정 기준

- MCP 서버 사용: 설치 수보다 실제 `discover` / `buy` 성공 이벤트를 우선. 현재 이를 독립 분석 서비스로 집계하지 않는다.
- 외부 결제: Base USDC 컨트랙트에서 구매자 주소, 수취 주소, 금액, tx를 확인하고 내부 주소를 제외한다. 단순 토큰 전송은 API 사용을 증명하지 않으므로 정산/응답 증거와 함께 본다.
- 판매자 관심: 유효한 답장 수, 테스트넷 연동 완료 수.
- 조회수와 팔로워는 핵심 지표로 사용하지 않는다.

## 지금 게시하지 않을 주장

- “메인넷에서 실제 USDC를 받고 있다”
- “외부 구매자가 우리 상품을 샀다”
- “Bazaar에 1.5만 구매자/고객이 있다”
- “코드 수정 없이 즉시 판매 가능” (현재 판매자 설정과 검증이 필요함)
- “결과 품질·환불·수익을 보장한다”
