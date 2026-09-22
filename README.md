# Handsel Mandate — browser prototype

사람이 예산·허용 도구·만료를 지정하고 브라우저 에이전트가 그 범위 안에서 모의 구매하는 Chrome MV3 확장 초안입니다.

**v0.3: BlockFlow + ERC-4337 AA + Base Sepolia x402 경로.** Native Host는 고정된 BlockFlow 커밋으로 위임 BPMN을 IR/Solidity/Foundry 테스트까지 컴파일하고, 정책과 산출물 해시를 바인딩합니다. 배포된 Coinbase Smart Account가 EIP-1271 형식으로 x402 v2 결제에 서명합니다. 메인넷은 차단됩니다.

현재 예산 집행자는 로컬 Native Host입니다. BlockFlow 컨트랙트는 아직 배포하지 않으며 Coinbase Smart Account에 제한된 session key 모듈을 설치하지도 않습니다. 따라서 이것은 **AA 결제 연결 프로토타입**이지 온체인 강제형 위임 완성본이 아닙니다. 전용 테스트넷 계정만 사용하세요. 설치와 검증 범위는 [실제 결제 설정](docs/live-payments.md)을 보세요.

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

`위임 입력 → BlockFlow BPMN/IR/soundness/Solidity → 산출물+정책 바인딩 → ERC-4337 EIP-1271 signer → x402 EIP-3009 → 영수증` 순서입니다. BlockFlow 검증 실패, 컴파일러 커밋 불일치, 바인딩 변경, 미배포 AA 계정, EIP-1271 호환성 실패 중 하나라도 있으면 서명 전에 닫힙니다.

## 다음 단계

다음 보안 마일스톤은 BlockFlow가 생성한 정책을 스마트계정 validator/session-key 모듈로 내려 예산·수령인·만료를 온체인에서 강제하고, 영수증 트랜잭션을 RPC로 독립 검증하는 것입니다. 기존 Handsel 전체 코드를 가져오지 않고 구매 경로 하나부터 검증합니다.

References: [Chrome Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging), [x402 Bazaar](https://docs.x402.org/extensions/bazaar).
