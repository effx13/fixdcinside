<img src="assets/icon.svg" alt="" width="88" align="left" hspace="12">

# FixDcinside

디시인사이드 링크를 디스코드·텔레그램·마스토돈에서 제대로 미리보기 되게 만드는 프록시.
[FxEmbed](https://github.com/FxEmbed/FxEmbed)의 디시인사이드 판입니다.

Cloudflare Workers 위에서 **HTTP 요청과 HTML 파싱만으로** 동작합니다. Chromium·Puppeteer·Playwright 같은
헤드리스 브라우저를 쓰지 않습니다.

<br clear="left">

## 왜 필요한가

디시인사이드 글에도 `og:` 태그가 붙어 있지만, 이미지 서버(`dcimg*.dcinside.co.kr`)가 **Referer 기반
핫링크 차단**을 겁니다. 디스코드 크롤러는 Referer 없이 이미지를 가져가므로 `403`을 받고, 결과적으로
미리보기에 이미지가 뜨지 않습니다. 게다가 이미지 응답의 `Content-Type`이 `application/octet-stream`이라
그대로는 렌더링되지도 않습니다.

이 워커는 두 가지를 대신합니다.

- 글을 파싱해 제목·본문·작성자·조회/추천/댓글 수를 담은 임베드 메타태그를 만들어 줍니다.
- 이미지를 `/media/...`로 프록시하면서 Referer를 붙이고, 매직 바이트로 실제 `Content-Type`을 판별해 줍니다.

## 쓰는 법

링크의 `gall.dcinside.com`을 배포한 도메인으로 바꾸기만 하면 됩니다.

| 원본                                                                      | 바꾼 주소                                                               |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `gall.dcinside.com/mgallery/board/view/?id=sff&no=1719767`                | `fixdcinside.com/mgallery/board/view/?id=sff&no=1719767`                |
| `gall.dcinside.com/mgallery/board/lists/?id=sff&exception_mode=recommend` | `fixdcinside.com/mgallery/board/lists/?id=sff&exception_mode=recommend` |

지원하는 주소 형태:

- `/board/view/?id=&no=` — 정식 갤러리
- `/mgallery/board/view/?id=&no=` — 마이너 갤러리
- `/mini/board/view/?id=&no=`, `/person/board/view/?id=&no=` — 미니·인물 갤러리
- `/board/lists/?id=` 및 위 접두사들의 리스트 페이지
- `/board/<갤러리>/<글번호>` — m.dcinside.com 형식
- `/<갤러리>/<글번호>`, `/<갤러리>` — 짧은 주소

사람이 접속하면 원본 디시인사이드 페이지로 302 리다이렉트되고, 크롤러(Discordbot 등)에게만 임베드용
HTML을 돌려줍니다. 루트(`/`)는 이 저장소로 보냅니다.

### JSON API

주소 앞에 `/api`를 붙이면 파싱 결과를 JSON으로 받습니다.

```
https://fixdcinside.com/api/mgallery/board/view/?id=sff&no=1719767
```

## 동작 방식

```
요청 → URL 파싱 → dcinside 페이지 fetch → cheerio 파싱 → OG 메타태그 렌더
                                     ↓ (차단 시)
                              m.dcinside.com 폴백
```

- `src/parser/url.ts` — 여러 형태의 디시 주소를 하나의 타깃으로 정규화
- `src/fetcher/dcinside.ts` — 브라우저처럼 보이는 헤더로 요청, 실패하면 모바일 레이아웃으로 폴백
- `src/parser/post.ts` · `list.ts` — PC/모바일 두 레이아웃 파싱
- `src/parser/media.ts` — 사진·디시콘·동영상·외부 임베드 추출 (모바일의 `data-original` 지연 로딩 포함)
- `src/fetcher/media.ts` — 이미지 프록시. 디시 호스트만 허용해 오픈 프록시가 되지 않게 막습니다
- `src/fetcher/mosaic.ts` — 사진 여러 장을 한 장으로 합성 (WASM 코덱)
- `src/render/embed.ts` — 임베드 뷰 모델 구성 후 EJS 템플릿 렌더
- `src/cache.ts` — 파싱 결과 KV 캐시

### 템플릿 (EJS)

임베드 HTML은 `templates/*.ejs`로 작성합니다. 다만 Cloudflare Workers는 런타임 `eval`/`new Function`을
금지하기 때문에 **EJS가 엣지에서 템플릿을 컴파일할 수 없습니다.** 그래서 `scripts/build-templates.mjs`가
빌드 시점에 템플릿을 평범한 TypeScript 함수(`src/render/templates.generated.ts`)로 미리 컴파일합니다.
배포되는 워커 번들에는 EJS 자체가 들어가지 않습니다.

템플릿을 고쳤으면 다시 생성하세요. `dev`/`test`/`deploy`는 자동으로 먼저 실행합니다.

```bash
pnpm build:templates
```

### 아이콘

로고는 `assets/icon.svg` 하나가 원본입니다. `assets/favicon.ico`(16·32·48·64px)는 거기서 생성하고,
둘 다 번들에 포함되어 워커가 `/icon.svg`와 `/favicon.ico`로 서빙합니다.

```bash
pnpm build:favicon   # icon.svg를 고쳤을 때
```

작업 중 눈으로 확인하려면 `node scripts/logo-preview.mjs`가 여러 크기로 렌더한 HTML을 만들어 줍니다.

### 모자이크

글에 사진이 2장 이상이면 `og:image`를 `/mosaic/...`로 보냅니다. 디스코드는 `og:image`가 여러 개면
자체 격자 레이아웃으로 전환하는데, 그 레이아웃에는 하단 사이트 행(아이콘·이름·타임스탬프)이 없습니다.
그래서 격자를 이미지 안에 구워 넣습니다 — FxEmbed가 별도 서비스로 하는 일을 여기서는 워커 안에서 합니다.

합성은 `@jsquash`의 WASM 코덱(mozjpeg, libpng)으로 하며 Cloudflare Images 같은 유료 이미지 서비스는
쓰지 않습니다. 사진은 잘라내지 않고 같은 너비로 세로 배치합니다 — dcinside 첨부는 619×59 배너부터
세로로 긴 스크린샷까지 섞여 있어서, 고정 격자에 맞추면 반드시 뭔가 잘려 나갑니다.

결과는 Cache API에 저장하고, 임베드를 렌더할 때 원본 사진들을 미리 받아둡니다. 합성에 실패하거나
사진이 1장이면 대표 이미지로 리다이렉트합니다.

### 캐시 (KV)

같은 글이 여러 채널에 뿌려져도 디시인사이드에는 한 번만 요청하도록 파싱 결과를 KV에 캐시합니다
(글 10분, 리스트 1분). 응답의 `X-Cache` 헤더로 `HIT`/`MISS`를 확인할 수 있습니다.
KV 바인딩이 없어도 워커는 그대로 동작하며, 매 요청이 캐시 미스가 될 뿐입니다.

```bash
pnpm wrangler kv namespace create CACHE
```

출력된 id를 `wrangler.jsonc`의 `kv_namespaces`에 넣고 `pnpm cf-typegen`을 다시 돌리세요.
파서를 고쳐 기존 캐시가 틀려지면 `src/constants.ts`의 `CACHE_SCHEMA_VERSION`을 올리면 됩니다.

## 개발

```bash
pnpm install
pnpm dev          # wrangler dev
pnpm test         # 파서·임베드·캐시 단위 테스트
pnpm lint         # eslint
pnpm format       # prettier
pnpm check        # lint + format:check + typecheck + test
```

> TypeScript는 6.x로 고정되어 있습니다. typescript-eslint가 아직 TS 7을 지원하지 않아서, 린트가 동작하는
> 가장 최신 버전을 쓰고 있습니다.

크롤러인 척 요청해 봐야 임베드 HTML을 볼 수 있습니다.

```bash
curl -A "Discordbot/2.0" "http://127.0.0.1:8787/mgallery/board/view/?id=sff&no=1719767"
```

### 테스트 픽스처

`test/fixtures/`의 HTML은 **직접 만든 합성 픽스처**입니다. 디시인사이드의 실제 마크업 구조는 그대로
재현했지만 내용은 창작이며, 실제 사용자 글은 저장소에 포함하지 않습니다.

합성 픽스처는 디시가 마크업을 바꿨을 때를 잡아내지 못하므로, 실제 사이트를 상대로 하는 스모크 테스트를
따로 두었습니다. 기본적으로는 건너뜁니다.

```bash
LIVE=1 pnpm test
```

## 배포

배포할 Cloudflare 계정은 `CLOUDFLARE_ACCOUNT_ID` 환경변수로 지정합니다. 계정 id는 저장소에
커밋하지 마세요.

```bash
# 1. 로그인 (대화형 터미널에서)
pnpm wrangler login

# 2. KV 네임스페이스 생성 - 출력된 id를 wrangler.jsonc의 kv_namespaces에 붙여넣기
pnpm wrangler kv namespace create CACHE

# 3. 바인딩이 바뀌었으니 타입 재생성
pnpm cf-typegen

# 4. 배포
pnpm deploy
```

배포 전에 `wrangler.jsonc`의 `vars`에서 `BRAND_NAME`, `BRAND_HOST`, `REPO_URL`을 실제 도메인에 맞게
바꾸세요. `BRAND_HOST`는 표시용이고, 이미지 프록시 주소는 요청이 들어온 오리진에서 자동으로 만들어집니다.

커스텀 도메인을 붙이려면 `wrangler.jsonc`에 라우트를 추가합니다.

```jsonc
"routes": [{ "pattern": "fixdcinside.com/*", "zone_name": "fixdcinside.com" }]
```

### GitHub Actions

`.github/workflows/ci.yml`이 PR마다 `pnpm check`를 돌리고, `main`에 푸시되면 배포합니다.
저장소 시크릿에 `CLOUDFLARE_API_TOKEN`(Workers 편집 권한)과 `CLOUDFLARE_ACCOUNT_ID`를 넣어주세요.

### 배포 후 확인

```bash
curl -A "Discordbot/2.0" -i "https://<도메인>/board/view/?id=cat&no=1958907" | head -30
```

`og:image`에 적힌 `/media/...` 주소가 `200`과 `image/jpeg`를 돌려주면 디스코드에서도 이미지가 뜹니다.
`X-Cache` 헤더로 KV 캐시가 붙었는지 확인할 수 있습니다.

## 알려진 한계

- **이미지 여러 장이 한 임베드에 안 나옵니다.** 디스코드는 링크 하나당 이미지 하나만 보여줍니다.
  FxEmbed는 여러 장을 한 장으로 합치는 별도 모자이크 서비스를 두는데, 이 워커는 첫 장만 싣고 나머지는
  본문 설명에 `🖼 이미지 N장`으로 표시합니다.
- **댓글은 가져오지 않습니다.** 댓글은 별도 POST 엔드포인트라 개수만 표시합니다.
- **성인 인증·로그인이 필요한 갤러리는 파싱할 수 없습니다.**
- 디시인사이드가 Cloudflare 대역을 차단하면 모바일 폴백까지 실패할 수 있습니다.

## 라이선스

MIT. 디시인사이드와 무관한 비공식 프로젝트이며, 원문의 저작권은 각 작성자에게 있습니다.
