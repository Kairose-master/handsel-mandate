# Handsel Mandate — browser prototype

## Public Demo · 테스트넷 구매 데모

도구 하나(Markdown 표 → JSON 변환기)를 공식 x402 SDK로 유료화하고, 에이전트가 **발견 → 예산 확인 → 테스트넷 결제 → 결과 수령**을 끝까지 수행하는 공개 데모입니다. `npm run demo` 후 `http://127.0.0.1:4402`를 여세요. 로컬 모드는 키 없이 실행되며 체인을 쓰지 않습니다. 테스트넷 모드 배포 방법, 내부/외부 구매 집계, 홍보 순서는 [docs/public-demo.md](docs/public-demo.md)를 보세요. 판매자는 `PRODUCT_FILE`(Seller Studio 내보내기)과 `UPSTREAM_SECRET`만으로 자기 API 앞에 같은 결제 게이트를 세울 수 있습니다. 실제 Base Sepolia 정산은 아직 수행하지 않았습니다.

## Seller Studio · 판매자용 초안

바이브 코딩으로 만든 도구의 상품 설명·호출 예제·가격을 정리하고, x402 연동 설정을 내보내는 로컬 스튜디오를 추가했습니다. `node scripts/seller-studio.js` 실행 후 `http://127.0.0.1:4173`을 여세요. 의존성 설치 없이 실행됩니다. 상품 미리보기·예산 제한 모의 구매·JSON 다운로드를 지원합니다. 실제 API 호출·결제·Bazaar 등록·공개 판매는 수행하지 않습니다. [범위와 다음 연동 단계](docs/seller-studio.md).

사람이 예산·허용 도구·만료를 지정하고 브라우저 에이전트가 그 범위 안에서 모의 구매하는 Chrome MV3 확장 초안입니다.

**v0.4: 온체인 제한 권한 + BlockFlow + x402.** Coinbase Smart Account에 `MandateValidator`를 컨트랙트 소유자로 설치합니다. 사람이 승인한 총예산·건당 한도·수령인·만료·에이전트·BlockFlow 바인딩을 체인에 기록하고, 에이전트가 결제 금액을 먼저 예약한 경우에만 해당 EIP-3009 결제를 허용합니다. 메인넷은 차단됩니다.

새 Session 모드에는 소유자 키가 없으며 에이전트는 임의 전송·새 위임 발급을 할 수 없습니다. 회수가 체인에 확정되면 미결제 예약도 무효화됩니다. 영수증은 RPC의 USDC Transfer + AuthorizationUsed nonce와 대조합니다. 실제 Base Sepolia 배포·정산은 아직 실행하지 않았습니다. [설치·검증 범위](docs/session-payments.md)를 확인하세요. 이전 full-owner 모드는 기존 설정에서만 남아 있으며 동일한 보안 보장을 제공하지 않습니다.

x402 서명은 예산 예약 전에 [DAMBI 호환 사전 정책 게이트](docs/dambi-integration.md)를 통과해야 합니다. 에이전트 실행에서는 `allow / evaluated / enforcing` 판정만 허용합니다.

## 설치

1. 이 저장소를 clone 또는 Download ZIP으로 받습니다.
2. Chrome `chrome://extensions` → 개발자 모드 → 압축해제된 확장 프로그램 로드 → `extension/` 선택.
3. 도구 모음의 Handsel 아이콘을 누르면 사이드패널이 열립니다. 확장 옵션에서도 같은 화면을 열 수 있습니다.
4. 위임장의 목표·총예산·건당 한도·기간·허용 도구를 확인하고 활성화합니다.
5. 데모 에이전트 실행: 검색 0.03 + 문서 추출 0.05 모의 USDC를 사용하고 영수증을 남깁니다.
6. 총예산 0.05, 건당 0.05로 설정하면 검색 후 추출이 차단됩니다. 첫 호출은 남으며 작업 전체가 원자적이지 않습니다.

## 별도 에이전트 확장 연결

`examples/agent-extension/`도 압축해제 로드합니다. 그 확장 ID를 Handsel 연결란에 저장한 뒤 새 위임장을 활성화하세요. 데모 확장 팝업에 Handsel 확장 ID를 입력하면 extension-to-extension 메시지로 구매를 요청합니다.

지원 API: `status`, `catalog`, `purchase` (`mandateId`, `requestId`, `serviceId`). 응답은 `{ok,result}` 또는 `{ok:false,error}`입니다. 연결된 확장 하나만 접근 가능합니다. 연결 변경은 기존 위임을 회수합니다. 외부 에이전트는 위임 생성·연결 변경·권한 확대를 할 수 없습니다.

브라우저 내장 AI나 Aside류 제품에 자동 연결되는 것은 아닙니다. 해당 제품이 확장 메시지/API 연결을 지원해야 어댑터를 붙일 수 있습니다. 일반 웹페이지에 지출 API를 공개하지 않습니다.

## 테스트

Node 22+에서 `npm ci` 후 `npm test`. BlockFlow 통합 테스트까지 실행하려면 BlockFlow 저장소를 `../BlockFlow`에 clone하거나 `BLOCKFLOW_ROOT=/absolute/path/to/BlockFlow npm test`를 사용합니다. 테스트는 실제 BlockFlow 컴파일, Coinbase Smart Account의 EIP-1271 래핑 서명, x402 payload의 AA payer 주소를 확인합니다. Chrome/체인 실제 설치 검증은 아래 체크리스트로 별도 수행합니다.

- [ ] 아이콘 클릭 → 사이드패널 열림
- [ ] 생성 → 데모 구매 → 재시작 후 예산/영수증 유지
- [ ] 만료/회수/건당/총예산 초과 차단
- [ ] 연결되지 않은 데모 확장 호출 거절
- [ ] 연결 후 데모 확장 호출 성공
- [ ] 두 패널 동시 호출에도 총예산 초과 없음

## 구현 경계

- 정수 micro-USDC로 금액 계산, service worker의 직렬 큐로 상태 갱신, request ID로 중복 차감 방지.
- 서비스 가격은 고정 로컬 카탈로그에서 읽습니다. 외부 요청이 가격을 지정할 수 없습니다.
- 목표의 의미나 API 품질은 검증하지 않습니다. 자연어를 금융 권한으로 자동 컴파일하지 않습니다.
- 내보낸 JSON은 **서명되지 않은 데모 기록**이며 법률상 위임장 또는 온체인 권한이 아닙니다.
- 저장소의 코드/영수증은 공개되지 않고 확장 로컬 저장소에만 기록됩니다. 동기화/원격 분석 없음.

## 통합 구조

`위임 입력 → BlockFlow 검증·산출물 바인딩 → 사람이 온체인 grant → 에이전트 reserve → EIP-1271 x402 결제 → RPC 영수증 대조` 순서입니다. 컴파일러 커밋·작업트리·정책·컨트랙트 바이트코드·소유자 슬롯을 검사하고 불일치하면 차단합니다.

BlockFlow는 워크플로 구조를 검증합니다. 예산 제약은 별도로 작성한 `MandateValidator`가 집행하며, BlockFlow가 임의 BPMN 전체를 지출 모듈로 자동 변환하는 것은 아닙니다. endpoint와 자연어 목표는 온체인 결제 의미로 강제되지 않습니다.

## 다음 단계

남은 검증은 실제 Base Sepolia USDC와 facilitator를 이용한 배포·정산, 별도 보안 검토, 사람 지갑 승인 UI입니다. 현재 승인은 로컬 human-only CLI이고 구매마다 예약 가스가 발생합니다. 임의 UserOperation에 대한 session 권한이나 범용 ERC-7579 모듈을 주장하지 않습니다.

References: [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [x402 Bazaar](https://docs.x402.org/extensions/bazaar).
