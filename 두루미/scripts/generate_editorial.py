"""매일 아침: Claude가 웹 검색으로 뉴스를 찾아 이슈 한 줄 요약 / 종목별 이유 / 오늘의 용어를 작성한다.

사용:
    py -3.12 -m pip install anthropic
    set ANTHROPIC_API_KEY=sk-ant-...        (PowerShell: $env:ANTHROPIC_API_KEY="sk-ant-...")
    py -3.12 scripts/update_data.py          # 먼저 시세 수집 (today.json 생성)
    py -3.12 scripts/generate_editorial.py   # 그 다음 이슈/이유 작성 (today.json + editorial.json 갱신)

원칙: 검색으로 확인되지 않은 이유는 지어내지 않고 "이유 확인 중"으로 남긴다.
"""
import json, re, sys, datetime as dt
from pathlib import Path
from zoneinfo import ZoneInfo

import anthropic

ROOT = Path(__file__).resolve().parent.parent
MODEL = "claude-opus-5-5"
UNKNOWN = "개별 이유는 확인되지 않았어요"
MAX_SEARCHES = 20


def load_stocks(today):
    rows = []
    for m in ("kr", "us"):
        for d in ("up", "down"):
            for s in today["movers"][m][d]:
                rows.append({"market": m, "dir": d, "code": s["code"], "name": s["name"], "change": s["change"]})
    return rows


def build_prompt(today, stocks, now):
    idx = ", ".join(f'{i["name"]} {i["change"]:+.2f}%' for i in today.get("indices", []))
    lines = "\n".join(
        f'- [{s["market"].upper()}] {s["code"]} {s["name"]} {s["change"]:+.2f}% ({"급등" if s["dir"] == "up" else "급락"})'
        for s in stocks)
    return f"""오늘은 {now:%Y년 %m월 %d일} (한국 시간) 아침이야. 경제를 처음 공부하는 사람이 아침 5분 동안 읽는 '아침 5분 경제' 사이트의 오늘치 내용을 만들어줘.

시장 데이터(이미 수집됨): {idx}

오늘 크게 오르거나 떨어진 종목:
{lines}

웹 검색으로 최신 뉴스를 찾아서 아래를 작성해. 한국 뉴스는 한국어로, 미국 뉴스는 영어로 검색해도 좋아.

1. issues.kr / issues.us: 각각 오늘 가장 중요한 경제·시장 이슈 3개.
   - text: 한 줄 요약 (40자 안팎, 핵심 숫자 포함)
   - detail: 초보자를 위한 쉬운 설명 한 문장 (왜 중요한지, 나한테 무슨 영향인지)
2. reasons: 위 종목 각각의 "올랐거나 떨어진 이유" 한 줄(50자 안팎). 키는 종목 코드 그대로.
3. term: 오늘 이슈를 이해하는 데 도움이 되는 경제 용어 1개와 쉬운 설명(비유 포함, 2문장 이내).

규칙:
- 어려운 용어 없이 중학생도 알 만한 말로 써. 불가피한 용어는 바로 괄호로 풀어줘.
- 검색해서 근거를 찾은 내용만 써. 이유를 확인하지 못한 종목은 반드시 "{UNKNOWN}"라고 써. 추측하거나 지어내지 마.
- 특정 종목을 사라/팔라고 권유하지 마.
- 가격 숫자는 위 시장 데이터와 모순되지 않게 해.

마지막에 아래 JSON만 출력해 (코드블록 없이, 다른 설명 없이):
{{"issues":{{"kr":[{{"text":"","detail":""}}],"us":[{{"text":"","detail":""}}]}},"term":{{"word":"","easy":""}},"reasons":{{"종목코드":"이유"}}}}"""


def run_claude(client, prompt):
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": MAX_SEARCHES}]
    for _ in range(8):  # pause_turn 이어가기
        with client.messages.stream(
            model=MODEL, max_tokens=32000, tools=tools, messages=messages,
            output_config={"effort": "medium"},
        ) as stream:
            resp = stream.get_final_message()
        if resp.stop_reason == "refusal":
            raise RuntimeError(f"Claude가 응답을 거절했어요: {getattr(resp, 'stop_details', None)}")
        if resp.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": resp.content})
            continue
        return "".join(b.text for b in resp.content if b.type == "text")
    raise RuntimeError("검색이 너무 길어져 중단했어요")


def parse_json(text):
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < 0:
        raise ValueError("JSON을 찾지 못했어요")
    return json.loads(text[start:end + 1])


def validate(ed, stocks):
    for m in ("kr", "us"):
        items = ed.get("issues", {}).get(m)
        if not isinstance(items, list) or not items or not all(i.get("text") for i in items):
            raise ValueError(f"issues.{m} 형식 오류")
    if not ed.get("term", {}).get("word"):
        raise ValueError("term 누락")
    reasons = ed.get("reasons", {})
    for s in stocks:  # 빠진 종목은 정직하게 '확인 중'
        if not str(reasons.get(s["code"], "")).strip():
            reasons[s["code"]] = UNKNOWN
    ed["reasons"] = reasons
    return ed


def main():
    now = dt.datetime.now(ZoneInfo("Asia/Seoul"))
    tpath = ROOT / "data" / "today.json"
    today = json.loads(tpath.read_text(encoding="utf-8"))
    stocks = load_stocks(today)
    client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수 사용

    prompt = build_prompt(today, stocks, now)
    last_err = None
    for attempt in range(2):
        try:
            ed = validate(parse_json(run_claude(client, prompt)), stocks)
            break
        except (ValueError, json.JSONDecodeError) as e:
            last_err = e
            print(f"시도 {attempt + 1} 실패: {e}", file=sys.stderr)
    else:
        sys.exit(f"이슈 생성 실패 (기존 today.json 유지): {last_err}")

    # editorial.json 보관 + today.json 에 바로 반영
    ed["date"] = now.date().isoformat()
    (ROOT / "data" / "editorial.json").write_text(json.dumps(ed, ensure_ascii=False, indent=2), encoding="utf-8")
    today["issues"], today["term"] = ed["issues"], ed["term"]
    for m in ("kr", "us"):
        for d in ("up", "down"):
            for s in today["movers"][m][d]:
                s["reason"] = ed["reasons"][s["code"]]
    tpath.write_text(json.dumps(today, ensure_ascii=False), encoding="utf-8")
    print("완료: 이슈", {m: len(ed["issues"][m]) for m in ("kr", "us")}, "/ 용어:", ed["term"]["word"])


if __name__ == "__main__":
    main()
