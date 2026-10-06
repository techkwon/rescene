# AGENTS.md — AI가 이 저장소를 읽을 때

이 문서는 Claude Code, Codex 같은 AI 코딩 도구가 읽으라고 쓴 안내입니다. 사람용 설명은 [README.md](README.md)(영어)와 [README.ko.md](README.ko.md)(한국어)에 있습니다.

## In English, in short

This file is the guide for AI coding tools; it is written in Korean, and this section is its summary.

- The repository is one Claude Code mod (plugin), `rescene`, and also its own marketplace. There is no build step and no network code.
- To install for a user who asks: `claude plugin marketplace add techkwon/rescene`, then `claude plugin install rescene@rescene`, then check with `claude plugin list`. `/rescene …` and `/plugin …` are typed by the person in the prompt; an AI cannot run them as tools.
- The mod runs in Korean or English (`language` setting: `auto`, `ko`, `en`; `/rescene lang` in a session). In English the members are WONI, LIV, MINAMI, MAY and ZENA, and the roles lead, build, review, research and scout.
- In a session with the mode on, the system prompt's "RESCENE mode" section is the rule. Start an Agent tool `description` with a member's name and a colon (`LIV: review the login form`) to hand her the task; who really took it is told by the `[RESCENE cast]` line after the tool result. The voice goes only on text the person reads, never in code, commands, files or tool input, and never blurs a fact. Use only the lines the mod lists, in Korean as written: do not translate them into quotes or invent new ones.
- To change the code: keep to the rules under "이 저장소의 코드를 고친다면" below. Every text the mod writes has both languages, as `t(ko, en)` from `hooks/lang.ts`; the three checks (`tsc -p . --noUnusedLocals`, `claude plugin validate .`, `claude plugin test .`) must pass.

## 이 저장소는 무엇인가

- Claude Code의 모드(mod, 플러그인) `rescene` 하나가 들어 있습니다. 저장소 뿌리가 곧 모드 폴더이고, 같은 폴더가 마켓플레이스(`.claude-plugin/marketplace.json`)이기도 합니다.
- 하는 일: 주 세션이 리센느(RESCENE) 리더 원이로서 지휘하고, 서브에이전트(Agent 도구)와 Orca `fleet-run` 작업자를 멤버(리브·미나미·메이·제나)에게 배정해 터미널 패널과 입력창 위 띠에 보여 줍니다.
- 한국어와 영어로 동작합니다. 기본(`auto`)은 한국어 사용자에게 한국어, 그 밖에는 영어입니다. 설정 `language`(`auto`·`ko`·`en`)나 `/rescene lang`으로 바꿉니다.
- 빌드 단계가 없습니다. Claude Code가 `hooks/register.tsx`를 직접 읽어 실행합니다. `npm install`이나 번들링을 하지 마세요.
- 팬이 만든 비공식 모드입니다. 네트워크로 보내는 코드가 없고, 그렇게 유지해야 합니다.

## 사용자가 "설치해 줘"라고 하면

설치는 사용자의 Claude Code 설정을 바꾸는 일입니다. 사용자가 부탁했을 때만 하고, 무엇이 설치되는지 한 줄로 알린 뒤 진행하세요.

1. Claude Code가 있는지와 버전을 확인합니다. 이 모드는 2.1.291에서 만들고 시험했습니다. 더 오래된 버전이면 `claude update`를 먼저 권합니다.

   ```
   claude --version
   ```

2. 셸에서 설치합니다(user 범위가 기본값).

   ```
   claude plugin marketplace add techkwon/rescene
   claude plugin install rescene@rescene
   ```

   사용자가 직접 하는 편을 원하면, 터미널의 Claude Code 입력창에 아래 한 줄을 넣으라고 안내합니다. `Add marketplace?`에는 `y`, 범위는 맨 위(user)에서 Enter입니다.

   ```
   /plugin install rescene --marketplace techkwon/rescene
   ```

3. 확인합니다.

   ```
   claude plugin list
   ```

   목록에 `rescene@rescene`이 있으면 설치된 것입니다. 이미 떠 있는 세션에는 다음에 시작할 때(또는 사용자가 `/reload-plugins`를 입력하면) 적용됩니다.

4. 사용자에게 다음을 알려 줍니다: 입력창에 `/rescene demo`를 입력하면 15초짜리 시연이 돌고, `/rescene`은 패널을 열고, `/rescene off`는 끕니다. 화면 언어가 맞지 않으면 `/rescene lang ko`나 `/rescene lang en`으로 바꿉니다.

알아 둘 것:

- `/rescene …`과 `/plugin …`은 **사람이 입력창에 치는 명령**입니다. AI가 도구로 실행할 수 없으니, 필요하면 사용자에게 입력을 부탁하세요.
- 설치하지 않고 한 번만 써 보려면 저장소를 받은 뒤 `claude --plugin-dir <받은 폴더>`로 실행합니다.
- 설치할 때 설정을 함께 주려면 `claude plugin install rescene@rescene --config bandStyle=compact`처럼 씁니다(언어를 고정하려면 `--config language=en`). 설정 항목과 기본값은 README의 "설정" 표와 `.claude-plugin/plugin.json`의 `userConfig`에 있습니다. `keepScreen`은 사용자의 셸 명령을 바꾸는 기능이므로 사용자가 직접 원할 때만 켭니다.
- 삭제는 `claude plugin uninstall rescene@rescene`, 업데이트는 `claude plugin update rescene@rescene`(다시 시작해야 적용)입니다.

## 모드가 켜진 세션에서 일하는 AI라면

모드가 켜지면 시스템 프롬프트에 "리센느 모드" 절(영어일 때는 "RESCENE mode")이 붙습니다. 그 절이 기준이고, 아래는 요약입니다. 영어일 때 달라지는 이름은 괄호 안에 적었습니다.

- 주 세션은 원이로서 지휘합니다: 일을 나누고, 멤버에게 맡기고, 결과를 모아 사용자에게 전합니다.
- 멤버를 지정해 맡기려면 Agent 도구의 `description` 맨 앞에 멤버 이름과 쌍점을 씁니다. 이름을 안 쓰면 모드가 일의 성격을 보고 정합니다.

  ```
  리브: 로그인 폼 코드 검토
  LIV: review the login form
  ```

  한글 이름과 영문 이름은 어느 언어에서나 둘 다 통합니다.

  | 멤버 | 기본 역할 | 맡는 일 |
  |---|---|---|
  | 미나미 (MINAMI) | 구현 (build) | 구현, 수정 |
  | 리브 (LIV) | 검토 (review) | 검토, 검증, 테스트 |
  | 메이 (MAY) | 조사 (research) | 조사, 문서, 정리 |
  | 제나 (ZENA) | 탐색 (scout) | 코드 탐색, 위치 찾기, 심부름 |

- 실제로 누가 맡았는지는 도구 결과 뒤의 `[리센느 배정]`(`[RESCENE cast]`) 줄이 알려 줍니다(지정한 멤버가 바쁘면 손이 빈 멤버가 맡습니다). 그 줄을 보기 전에는 누가 맡았다고 말하지 마세요.
- 사용자가 역할을 바꿨거나(`/rescene role`) 받는 멤버를 골랐으면(`/rescene to`) 그 내용이 프롬프트에 붙어 옵니다. 붙어 온 내용을 따르세요.
- 말투는 **사용자에게 보이는 글에만** 입힙니다. 코드, 명령, 파일 내용, 커밋 메시지, 도구 입력에는 넣지 않습니다.
- 사실, 숫자, 경로, 오류 내용은 말투 때문에 바꾸거나 흐리지 않습니다. 안 된 것은 안 됐다고 씁니다.
- 대사는 모드가 준 목록에 있는 것만, 적힌 그대로 씁니다. 유행어를 지어내거나 멤버가 하지 않은 말을 멤버의 말처럼 인용하지 않습니다. 영어로 답할 때도 대사는 한국어 원문 그대로 인용하고, 필요하면 뜻을 덧붙입니다(번역문을 따옴표에 넣어 멤버의 말로 만들지 않습니다).
- 서브에이전트로 일을 받은 쪽은 작업 지시 끝의 `[리센느 멤버 배정]`(`[RESCENE member]`) 블록에 적힌 멤버로서 보고합니다.
- 간단한 일(파일 하나 읽기, 한 줄 수정)은 맡기지 말고 직접 처리하세요. 멤버에게 맡기면 멤버마다 토큰을 따로 씁니다.

## 이 저장소의 코드를 고친다면

### 파일

| 경로 | 내용 |
|---|---|
| `.claude-plugin/plugin.json` | 이름, 버전, `userConfig`(설정 항목) |
| `.claude-plugin/marketplace.json` | 마켓플레이스 파일. 이름 `rescene`, 플러그인 하나, `source: "./"` |
| `hooks/hooks.json` | 훅 모듈 경로 (`./register.tsx`) |
| `hooks/register.tsx` | 훅 전체: 세션 시작, 프롬프트 지시, 서브에이전트 배정, 도구 호출 기록, `/rescene` 명령, 사용량, Orca 연동, 타이머 |
| `hooks/view.tsx` | 그리는 코드: 패널(카드 3단계), 백스테이지, 역할 설정, 입력창 위 띠, 글자 폭 계산 |
| `hooks/lang.ts` | 언어: 지금 언어, 두 언어 가운데 고르는 `t(ko, en)`, 한국어 사용자인지 판단하는 규칙 |
| `hooks/members.ts` | 멤버, 역할, 대사, 조합 이름, 배정 규칙 (대사 쓰임 설명과 역할 이름은 두 언어) |
| `hooks/voice.ts` | 모델에게 주는 말투 지시 글 (한국어판·영어판) |
| `hooks/action.ts` | 도구 호출을 "읽는 중: …" 같은 문구로 바꾸는 표 |
| `hooks/orca.ts` | 셸 명령에서 `fleet-run` 실행을 찾아 읽는 코드 |
| `hooks/sprites.ts` | 픽셀 아이콘과 동작 |
| `types/index.d.ts` | `$.state` 값의 타입 계약 |
| `tests/*.test.ts(x)` | 테스트 115개 (`lang.test.tsx`가 영어 화면과 언어 판단을 봄) |
| `docs/screenshots/` | README 그림 (`en-`으로 시작하는 것은 영어 화면) |

### 검사

타입 파일(`.claude-plugin/types/`)은 저장소에 없습니다. Claude Code가 모드를 한 번 불러오면 깔아 줍니다. 처음이라면 `claude --plugin-dir .`로 한 번 실행했다가 끄고, 그 뒤에 검사를 돌립니다. 셋 다 통과해야 합니다.

```
tsc -p . --noUnusedLocals
claude plugin validate .
claude plugin test .
```

### 규칙

- **대사는 실제 발언만.** `hooks/members.ts`의 대사는 기록(나무위키, 2026-10-06 열람)에 있는 것입니다. 새 대사는 출처를 확인한 것만 넣고, 지어내지 않습니다. `tests/parts.test.ts`가 화면에 나오는 대사를 목록과 대조합니다.
- **공식 자료를 넣지 않습니다.** 로고, 사진, 공식 캐릭터 그림을 저장소에 넣지 않습니다. 아이콘은 직접 그린 픽셀 그림입니다.
- **사용자의 명령을 바꾸지 않습니다.** 셸 명령을 고쳐 쓰는 곳은 `keepScreen`(기본 꺼짐)과 Orca 말투 사본(`--spec` 경로만 바꿈) 둘뿐입니다. 늘리지 마세요.
- **훅은 실패해도 길을 막지 않습니다.** 도구 호출과 프롬프트를 지나가는 훅은 안에서 오류가 나도 `next(e)`의 결과를 그대로 돌려줘야 합니다. `await`에는 `.catch`를 붙입니다.
- **확신할 수 없으면 보여 주지 않습니다.** 어느 작업자의 화면인지, 작업이 끝났는지 확실하지 않으면 추측해서 표시하지 않습니다.
- **폭을 지킵니다.** 한글과 이모지는 두 칸입니다. 글자 폭은 `view.tsx`의 `cells`·`fit`으로 재고, 받은 폭과 줄 수를 넘겨 그리지 않습니다.
- **외부로 보내지 않습니다.** 네트워크 호출, 원격 기록, 분석 코드를 넣지 않습니다. 개인정보와 키 값을 코드·테스트·문서에 넣지 않습니다.
- 동작을 고치면 그 동작을 잡는 테스트를 함께 넣고, `plugin.json`의 버전을 올리고, 두 README와 이 문서의 해당 부분(테스트 개수 포함)을 맞춥니다.
- **화면에 나오는 글은 두 언어 모두.** 사용자나 모델이 읽는 글은 `t('한국어', 'English')`로 두 언어를 함께 적습니다. 모듈 맨 위 상수에 글을 담아 두면 언어가 바뀌어도 따라가지 않으니, 그릴 때 `t`를 부릅니다. 내부 값(역할 `구현`·`검토`·`조사`·`탐색`, 저장되는 상태의 키)은 한국어 그대로 두고, 보여 줄 때만 `roleName`·`nameOf`로 바꿉니다.
- **대사는 번역하지 않습니다.** 영어 화면에서도 대사는 한국어 원문입니다. 영어로는 쓰임 설명(`LINES_EN`)만 적습니다. `tests/lang.test.tsx`가 영어 화면에 대사·이름·조합 이름 말고 한글이 남지 않았는지 확인합니다.
- 기존 테스트는 `{ options: { language: 'ko' } }`로 한국어에 고정돼 있습니다. 언어를 고정하지 않은 테스트는 돌리는 컴퓨터에 따라 결과가 달라집니다.
- 코드의 주석과 테스트 이름은 영어입니다. 문서는 `README.md`(영어)와 `README.ko.md`(한국어)를 함께 고칩니다.

### 스크린샷을 다시 만들 때

README의 그림은 실제 화면을 찍은 것이 아니라, 화면 밖 터미널(tmux, `CLAUDE_CODE_TMUX_TRUECOLOR=1`)에서 `claude --plugin-dir .`로 돌린 실제 세션의 출력(`tmux capture-pane -e -p`)을 글자와 색 그대로 그림으로 옮긴 것입니다. 영어 화면은 `--settings`로 `language`를 `en`으로 준 세션에서 `/rescene demo`를 돌려 받았습니다(모델 호출 없음). 다시 만들 때도 예제 폴더에서 돌리고, 계정 정보·개인 경로·요금제 이름이 그림에 들어가지 않게 잘라 냅니다.
