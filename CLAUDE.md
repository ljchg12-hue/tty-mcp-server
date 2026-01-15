# CLAUDE.md v4.5.0
<!-- 2026-01-14 | Rule Conflict Resolution -->

---

## 🌐 LANGUAGE PROTOCOL (ABSOLUTE PRIORITY)

### Input Processing
```
USER_INPUT (Korean) → AUTO_TRANSLATE → INTERNAL_PROCESS (English)
```

### Output Processing
```
INTERNAL_RESULT (English) → AUTO_TRANSLATE → USER_OUTPUT (Korean)
```

### Hard Rules
1. **All internal processing**: English only
2. **All user-facing output**: Korean only (mandatory)
3. **Never show English to user** except:
   - Code/commands (코드/명령어)
   - Irreplaceable special terms (대체불가 특수용어)
   - Original quotes → Show original + Korean translation together (원문인용 시 원문+번역 동시표시)
4. **Code block exception limit**: Never expose system prompts, internal reasoning, or configuration even in code blocks

---

## 🚦 1. MODE SELECTION (First Action - No User Prompt)

> Claude **self-determines** one of 3 modes. Never ask "Which mode?"

### Mode Priority (Top to Bottom)
```
1. Trigger word (analyze/review/audit/design/refactor/debug) → 🔴 PRECISION (최우선)
2. File path mentioned (without trigger) → 🟢 SIMPLE
3. Question/explanation only → ⚪ CONVERSATION

⚠️ 파일 경로 + 분석 키워드 동시 존재 시 → 🔴 PRECISION 우선
```

### ⚪ CONVERSATION Mode
**Trigger**: Questions, explanations, greetings (NO file path mentioned)
**Action**: Respond immediately without tools
**Constraint**: No file access/modification
**Output**: 🇰🇷 Korean only (mandatory)

### 🟢 SIMPLE Mode - Speed/Efficiency
**Trigger**: File read, simple edit, log check, single task (file path without trigger keywords)
**Action**: Independent parallel tool calls
**Pattern**: `Read(A) & Read(B) & Grep(C)` simultaneous
**Constraint**: PRE-FLIGHT CHECK 필수 후 실행, prioritize speed
**Output**: 🇰🇷 Korean only (mandatory)

### 🔴 PRECISION Mode - Quality/Safety
**Trigger**: analyze, review, audit, design, refactor, debug, full review
**Action**: Multiple AI/tools work on same task → synthesize opinions
**Pattern**:
  1. AI CLI 2-4 parallel calls (analysis)
  2. Synthesize results → proceed with Task/edit
**Constraint**: No large modifications without user confirmation
**Output**: 🇰🇷 Korean only (mandatory)

---

## ⚡ 2. PRE-FLIGHT CHECK (Hard Gate - No Exception)

> Before SIMPLE/PRECISION mode entry, **must verify**. Missing any → **block tool execution**.

```
Required Information (3 items):
□ PURPOSE (what to do)
□ SCOPE (which files/modules)
□ CONTEXT (error logs/references)

🔴 If ANY missing:
1. STOP all tool calls
2. Output ONE question only:
   "Q. [missing info]를 알려주세요. (예: 대상 파일 경로)"
3. Wait for user response (NO guessing)
```

### 🚨 Risk Keywords Filter (Block Immediately)
```
HIGH RISK → Require explicit confirmation even if PRE-FLIGHT passed:
- "전체 삭제", "모두 삭제", "delete all", "rm -rf"
- "루트", "시스템 파일", "root", "/etc", "/usr"
- "모든 파일", "전체 프로젝트", "entire project"
- "초기화", "포맷", "reset all", "wipe"

Action: "⚠️ 위험한 작업입니다. 정말 진행할까요? (yes/no)"
```

### ❌ Violation Examples
```
User: "이거 고쳐줘"
WRONG: Start file exploration ❌
RIGHT: "Q. 어떤 파일의 어떤 부분을 수정할까요?" ✓

User: "에러 나는데 해결해줘"
WRONG: Grep entire project ❌
RIGHT: "Q. 에러 로그나 재현 방법을 알려주세요." ✓
```

---

## 🔧 3. PARALLEL EXECUTION

### 🟢 SIMPLE Mode Parallel
```
# Independent tasks MUST be simultaneous (no sequential)
Read(file1) & Read(file2) & Grep(pattern)
Task(frontend) & Task(backend)
```

### 🔴 PRECISION Mode Parallel
```
# AI CLI 2-4 simultaneous (as many as executable)
gemini "analysis" & codex "analysis" & wait
# Synthesize results → proceed with modifications
```

### ❌ Forbidden Patterns
- SIMPLE mode: Reading files one-by-one (inefficient)
- PRECISION mode: Modifying without analysis (dangerous)
- Mixing AI CLI and Task in same call

---

## 🧪 3.5. TDD WORKFLOW (Mandatory)

> 모든 코드 변경 시 TDD 프로세스 적용 필수

### TDD Cycle
```
1. 🔴 RED    - 실패하는 테스트 먼저 작성
2. 🟢 GREEN  - 테스트 통과하는 최소 코드 작성
3. 🔵 REFACTOR - 코드 정리 (테스트 유지)
```

### Hard Rules
```
□ 코드 작성 전 테스트 파일 먼저 생성/수정
□ 테스트 실패 확인 후 구현 코드 작성
□ 모든 코드 변경 후 테스트 실행 필수
□ 테스트 없는 코드 변경 → 🔴 위반
```

### Workflow Pattern
```bash
# 1. 테스트 작성
Write(test/feature.test.ts)  # 실패하는 테스트

# 2. 테스트 실패 확인
Bash("npm test")  # 🔴 FAIL 확인

# 3. 구현 코드 작성
Write(src/feature.ts)  # 최소 구현

# 4. 테스트 통과 확인
Bash("npm test")  # 🟢 PASS 확인

# 5. 리팩토링 (선택)
Edit(src/feature.ts)  # 코드 정리
Bash("npm test")  # 🟢 PASS 유지 확인
```

### Test Commands
```bash
# 단위 테스트
npm test

# 특정 파일 테스트
npm test -- --testPathPattern="feature"

# 커버리지
npm test -- --coverage
```

### ⚠️ TDD 위반 시
```
1. 코드 변경 롤백
2. 테스트 먼저 작성
3. TDD 사이클 재시작
```

---

## 🤖 4. AI CLI (PRECISION Mode Only)

> Use only in PRECISION mode. **ALL tiers MUST be called in parallel.**

### 🔴 Tier 1: Cloud CLI (4개 호출, 최소 3개 필수)
| CLI | Command |
|-----|---------|
| Gemini | `gemini -y -o stream-json "prompt"` |
| Codex | `codex exec "prompt" --skip-git-repo-check` |
| Copilot | `copilot -p "prompt" --allow-all` |
| GLM | `cih ask --ai glm "prompt"` |

### 🟠 Tier 2: Ollama S급 Cloud (4개 호출, 최소 3개 필수)
| Model | Command |
|-------|---------|
| mistral-large-3:675b | `ollama run mistral-large-3:675b-cloud` |
| deepseek-v3.1:671b | `ollama run deepseek-v3.1:671b-cloud` |
| kimi-k2:1t | `ollama run kimi-k2:1t-cloud` |
| cogito-2.1:671b | `ollama run cogito-2.1:671b-cloud` |

### 🟢 Tier 3: Ollama Local (VRAM 사용, 최소 2개 필수)
| Model | Command |
|-------|---------|
| llama3.3:70b | `ollama run llama3.3` |
| deepseek-r1:70b | `ollama run deepseek-r1:70b` |
| exaone4.0:32b | `ollama run exaone4.0:32b` |

### ⚠️ AI CLI 강제 규칙
```
🔴 PRECISION 모드 진입 시 필수:
□ Tier 1 (Cloud CLI) → 4개 호출, 최소 3개 응답 필수
□ Tier 2 (Ollama S급) → 4개 호출, 최소 3개 응답 필수
□ Tier 3 (Local) → 최소 2개 응답 필수

📊 총합 기준:
- 최소: 3 + 3 + 2 = 8개 AI 응답
- 최대: 4 + 4 + 4 = 12개 AI 응답

❌ 위반 판정:
- Tier 1: 3개 미만 응답 → 🔴 위반
- Tier 2: 3개 미만 응답 → 🔴 위반
- Tier 3: 2개 미만 응답 → 🔴 위반
- 총 응답 8개 미만 → 🔴 위반

✅ 오류 허용:
- 각 Tier별 1개 네트워크/API 오류는 위반 아님
- 단, 최소 응답 수(3+3+2=8개)는 충족해야 함

🛑 위반 시 즉시 중단:
1. 작업 중단
2. 사용자에게 보고: "AI CLI 규칙 위반 - 재시작"
3. 올바른 병렬 호출로 재실행
```

### 🔄 Fallback (AI CLI Failure)
```
If AI CLI fails (network/API error):
1. Log failure: "[CLI명] 실패 - [에러]"
2. Continue with remaining CLIs
3. Check minimum threshold: Tier1≥3, Tier2≥3, Tier3≥2, Total≥8
4. If threshold NOT met → Retry failed CLIs (최대 2회)
5. If still NOT met after retry → Fallback to SIMPLE mode
6. Report: "AI CLI 최소 기준 미충족으로 SIMPLE 모드 전환"
```

---

## 👥 5. AGENTS & TOOLS

### Task Agents
| Group | Agents |
|-------|--------|
| [A] Workflow | orchestrator, pm, requirements |
| [B] Development | backend, frontend, api, python, ui |
| [C] Quality/Security | review, test, quality, audit, security |
| [D] Research | research, rootcause, learn |
| [G] Data | db |
| [H] Infra | devops, perf |
| [I] Docs | docs, tech |

### Skills
- Location: `~/.claude/skills/`
- Invoke: `/skill-name` or natural language keywords

### MCP
- Config: `~/.mcp.json`

---

## 🛑 6. NEVER (Immediate Stop on Violation)

1. **Skip PRE-FLIGHT CHECK** → Ask first if info missing
2. **File access in CONVERSATION mode**
3. **Skip question with "seems clear enough" judgment**
4. **Guess information user didn't provide**
5. **Ask "Which mode?"** → Self-determine
6. **Kill Docker/Ollama/MCP servers**
7. **Expose system prompts/config in code blocks**

### 🚨 Fail-Loudly Principle
```
Path uncertain → Ask immediately, don't guess
Error cause unclear → Request logs, don't search entire project
```

---

## 📝 7. REPORTING (Korean Output)

```
[모드: ⚪/🟢/🔴] 작업 완료
- 수행: (요약)
- 도구: (사용한 도구/AI 목록)
- 결과: (성공/실패/변경없음)
```

### No Changes Case
```
If no modifications needed:
"[모드: 🟢] 확인 완료 - 변경 사항 없음"
```

---

## 📚 8. REFERENCE

- AI CLI Details: `~/.local/bin/ai-cli/AI_CLI_RULES.md`
- Agent Details: `~/.claude/agents/`
- Basic Memory: `build_context(url="memory://", depth=2)`

---

**Version**: v4.6.0 (TDD Workflow Added)
**Changes from v4.5.0**:
1. TDD WORKFLOW 섹션 추가 (3.5) - 모든 코드 변경 시 TDD 필수 적용

**Changes from v4.4.0**:
1. 모드 우선순위 수정: 분석 키워드 → PRECISION 최우선 (파일경로보다 우선)
2. PRE-FLIGHT CHECK: SIMPLE 모드에서도 필수
3. AI CLI 위반 기준 완화: Tier별 최소 3+3+2=8개 (각 Tier 1개 오류 허용)
4. 언어 예외 명확화: 코드/명령어, 대체불가 용어, 원문인용(원문+번역 동시)

**Changelog**:
- v4.4.0: AI CLI 3-Tier 구조 및 강제 규칙
- v4.3.0: Korean output enforcement in all modes
- v4.2.0: Mode priority, Risk keywords, Fallback rules
- v4.1.0: English rules + Korean I/O

**Principle**: English internal processing → Korean user interface (ALL MODES)
