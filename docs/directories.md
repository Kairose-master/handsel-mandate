# 디렉터리 등록·제출 절차 (MCP 레지스트리 · Smithery · mcp.so · Cursor · x402 에코시스템 · 커뮤니티)

파일은 이 저장소에 다 들어 있습니다. 계정 로그인이 필요한 단계만 사람이 하면 됩니다. 순서대로 하면 30분 안에 끝납니다.

| 대상 | 저장소 안 파일 | 사람이 할 일 |
|---|---|---|
| MCPB 번들(공통 산출물) | `mcp/manifest.json`, `scripts/build-mcpb.sh` | `npm run build:mcpb` → `dist/402-lab.mcpb` |
| GitHub Release | — | 태그 `mcp-v0.1.0`에 `dist/402-lab.mcpb` 첨부 |
| 공식 MCP Registry | `mcp/server.registry.json` → `dist/server.json` | `mcp-publisher login github` → `publish` |
| Smithery | 위 번들 | smithery.ai/new 에서 Local(MCPB) 업로드 |
| mcp.so | — | 제출 폼에 저장소 URL + 아래 문안 |
| Cursor | `.cursor/mcp.json`, README의 Add to Cursor 버튼 | cursor.com/mcp 제출 |
| Claude Desktop | 위 번들 | 더블클릭 설치(배포는 Release 링크) |
| x402 에코시스템 페이지 | `submissions/x402-ecosystem/` | x402-foundation/x402 에 PR |
| Discord(CDP·x402) | 아래 문안 | 쇼케이스 채널에 게시 |

## 0. 번들 만들기 (한 번)

```bash
npm ci
npm run build:mcpb
# → dist/402-lab.mcpb, dist/server.json (sha256 채워짐)
```

번들 안에는 `mcp/*.js` 세 파일과 런타임 의존성만 들어가고 지갑 키는 들어가지 않습니다. 설치하는 사람이 자기 키를 넣습니다(`user_config.buyer_private_key`, 민감 값으로 표시되어 OS 키체인에 저장).

## 1. GitHub Release

1. https://github.com/Kairose-master/handsel-mandate/releases/new
2. Tag `mcp-v0.1.0`, 제목 "402-LAB buyer MCP 0.1.0"
3. `dist/402-lab.mcpb` 첨부 후 Publish.
4. 첨부 URL이 정확히 `https://github.com/Kairose-master/handsel-mandate/releases/download/mcp-v0.1.0/402-lab.mcpb` 인지 확인합니다. `dist/server.json`이 이 URL과 sha256을 가리킵니다.

버전을 올릴 때는 `mcp/manifest.json`과 `mcp/server.registry.json`의 version·identifier를 같이 바꾸고 다시 빌드합니다.

## 2. 공식 MCP Registry (registry.modelcontextprotocol.io)

```bash
# macOS/Linux
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/
cd dist
mcp-publisher validate      # server.json 검사
mcp-publisher login github  # 기기 코드 인증. Kairose-master 계정으로
mcp-publisher publish
```

이름 `io.github.kairose-master/402-lab`은 GitHub 로그인으로 소유권이 검증됩니다. 패키지 형식은 npm이 아니라 MCPB(Release 첨부 URL + sha256)라서 npm 계정이 필요 없습니다. 게시 후 https://registry.modelcontextprotocol.io/v0/servers?search=402-lab 에서 확인합니다.

## 3. Smithery

1. https://smithery.ai/new → **Local (MCPB Bundle)** 탭
2. `dist/402-lab.mcpb` 업로드, 이름 `kairose-master/402-lab`
3. 서버 페이지의 Settings → Verification 체크리스트(저장소 연결) 완료.

CLI를 쓰면: `npx @smithery/cli mcp publish ./dist/402-lab.mcpb -n kairose-master/402-lab`

## 4. mcp.so

https://mcp.so 상단 **Submit** → GitHub 로그인 → 아래 값 입력.

- Name: 402-LAB
- URL: https://github.com/Kairose-master/handsel-mandate
- Description (EN):

> Budget-capped x402 buyer. A human says "stay under $1"; the agent discovers tools on the x402 Bazaar (~15k listed resources) and seller catalogs, pays USDC per call on Base, and returns only the result. The server, not the model, enforces the total cap, per-call cap, network, asset and seller allow-list. Also includes a paywall proxy that puts any existing API behind x402 in an afternoon.

- Tags: x402, payments, usdc, base, agent, bazaar

## 5. Cursor

- 저장소를 연 사람: `.cursor/mcp.json`이 자동 인식됩니다. 셸에 `BUYER_PRIVATE_KEY`만 export 해 두면 됩니다.
- 저장소 없이 설치: README의 **Add to Cursor** 버튼. 링크 원문:

```
cursor://anysphere.cursor-deeplink/mcp/install?name=402-lab&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdpdGh1YjpLYWlyb3NlLW1hc3Rlci9oYW5kc2VsLW1hbmRhdGUiXSwiZW52Ijp7IkJVWUVSX1BSSVZBVEVfS0VZIjoiMHhfUkVQTEFDRV9NRSIsIk5FVFdPUksiOiJlaXAxNTU6ODQ1MzIiLCJNQU5EQVRFX01BWF9VU0RDIjoiMSJ9fQ==
```

  (config = base64 of `{"command":"npx","args":["-y","github:Kairose-master/handsel-mandate"],"env":{"BUYER_PRIVATE_KEY":"0x_REPLACE_ME","NETWORK":"eip155:84532","MANDATE_MAX_USDC":"1"}}`. 설치 후 Cursor 설정에서 키를 바꿉니다.)
- 디렉터리 등재: https://cursor.com/mcp 하단 제출 링크에 이름·저장소·설명(4번 문안)·위 딥링크 제출.

## 6. Claude Desktop

Settings → Extensions → Advanced → **Install Extension…** 에서 `402-lab.mcpb` 선택. 설치 화면에서 지갑 키·네트워크·상한을 입력합니다. 배포할 때는 Release 첨부 링크를 줍니다.

## 7. x402 에코시스템 페이지 (x402.org/ecosystem)

파일 두 개를 x402-foundation/x402 저장소에 PR로 냅니다.

```bash
git clone https://github.com/<본인fork>/x402 && cd x402
git checkout -b ecosystem/402-lab
cp <handsel-mandate>/submissions/x402-ecosystem/402-lab/metadata.json typescript/site/app/ecosystem/partners-data/402-lab/metadata.json
cp <handsel-mandate>/submissions/x402-ecosystem/logos/402-lab.png typescript/site/public/logos/402-lab.png
git add -A && git commit -m "ecosystem: add 402-LAB (Services/Endpoints)" && git push -u origin ecosystem/402-lab
```

PR 제목: `ecosystem: add 402-LAB (Services/Endpoints)`. 본문:

> Adds 402-LAB to the ecosystem directory under Services/Endpoints: one metadata.json and one 256×256 PNG logo. Live x402 resource on Base mainnet (Bazaar-listed): https://handsel-mandate-demo.vercel.app — Korean business-registration status lookup, 0.02 USDC per call, settled via the CDP facilitator. Buyer side is an MCP server that enforces a human-delegated budget. Source: https://github.com/Kairose-master/handsel-mandate

경로가 `data/ecosystem/`로 바뀌어 있으면 그 README를 따릅니다(최근 병합된 PR #3566은 위 경로를 씁니다).

## 8. Discord · 커뮤니티 게시 문안

CDP Discord(https://discord.gg/cdp)의 x402 쇼케이스/빌더 채널과 x402 Foundation 커뮤니티에 같은 글을 올립니다. 채널 이름은 서버마다 다르니 "showcase", "built-with", "share-your-project" 계열을 찾습니다.

**EN**

> **402-LAB — sell a vibe-coded API to agents, and let an agent buy within a budget**
> Seller side: a paywall proxy that fronts any existing endpoint with x402 (exact / USDC on Base), declares Bazaar discovery metadata, and forwards paid calls with a shared secret. Live: https://handsel-mandate-demo.vercel.app (Korean business-registration status, 0.02 USDC/call, settled through the CDP facilitator, indexed on the Bazaar).
> Buyer side: an MCP server for Claude Desktop / Cursor / browser agents. The human says "stay under $1"; the server enforces total cap, per-call cap, network, asset and seller allow-list, so the model can't overspend. Discovery = Bazaar search + seller product.json.
> Looking for: developers who already have a published API and want it sold to agents. Open an issue with the template and I'll wire it in: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml
> Source: https://github.com/Kairose-master/handsel-mandate · 30s demo: (동영상 첨부)

**KR** (디스코드 한국 채널·오픈채팅용)

> 바이브코딩으로 만든 API를 AI 에이전트가 사서 쓰게 만드는 402-LAB입니다. 기존 API 앞에 x402 결제 게이트를 세워 호출당 USDC(Base)로 받고, 구매자 쪽은 "1달러 안에서"라고 말하면 MCP 서버가 예산을 강제하면서 Bazaar에서 찾아 결제합니다. 지금 라이브 상품은 국세청 사업자등록 상태 조회(0.02 USDC/호출). 이미 공개한 API가 있는 분은 신청서 하나면 됩니다: https://github.com/Kairose-master/handsel-mandate/issues/new?template=sell-your-tool.yml

## 확인 방법

- 레지스트리: `curl "https://registry.modelcontextprotocol.io/v0/servers?search=402-lab"`
- Smithery: https://smithery.ai/server/kairose-master/402-lab
- x402 에코시스템: PR 병합 후 https://x402.org/ecosystem 에서 402-LAB 검색
- 일일 루틴이 판매 신청 이슈와 메인넷 정산을 계속 확인합니다. 디렉터리 유입은 `/demo/status`의 external 구매 수로 드러납니다.
