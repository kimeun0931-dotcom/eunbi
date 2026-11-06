"""매일 아침 실행: 급등/급락 TOP5 + 차트 데이터를 받아 data/today.json 을 만든다.

설치:  pip install yfinance requests lxml
실행:  python scripts/update_data.py

이슈 한 줄 요약 / 종목별 이유 / 오늘의 용어 는 data/editorial.json 에 적는다.
(Claude에게 "오늘 editorial.json 채워줘" 라고 시키면 됩니다.)
"""
import io, json, datetime as dt
from zoneinfo import ZoneInfo
from pathlib import Path

import yfinance as yf
import re, requests

ROOT = Path(__file__).resolve().parent.parent
TOP = 5
MIN_KR_CAP_EOK = 5000   # 시총 5000억원 미만 소형주 제외(잡주만 나오는 것 방지)
UA = {"User-Agent": "Mozilla/5.0"}
US_UNIVERSE = ("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")


def editorial():
    p = ROOT / "data" / "editorial.json"
    ed = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    # 어제 이유가 오늘 종목에 섞이지 않도록, 오늘 날짜로 작성된 것만 사용
    if ed.get("date") != dt.datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat():
        return {}
    return ed


def _naver(kind, market):
    """네이버 증권 모바일 API: kind=up|down, market=KOSPI|KOSDAQ"""
    out = []
    for page in (1, 2):
        r = requests.get(
            f"https://m.stock.naver.com/api/stocks/{kind}/{market}?page={page}&pageSize=60",
            headers=UA, timeout=20)
        r.raise_for_status()
        out += r.json()["stocks"]
    return out


def _kr_history(code):
    r = requests.get(
        f"https://fchart.stock.naver.com/sise.nhn?symbol={code}&timeframe=day&count=500&requestType=0",
        headers=UA, timeout=20)
    out = []
    for d, o, h, l, c, v in re.findall(r'data="(\d{8})\|(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)"', r.text):
        out.append([f"{d[:4]}-{d[4:6]}-{d[6:]}", int(o), int(h), int(l), int(c), int(v)])
    return out


def kr_movers(reasons):
    def pick(kind):
        rows = []
        for m in ("KOSPI", "KOSDAQ"):
            rows += _naver(kind, m)
        # 일반 주식만(ETF/ETN 제외), 시총(억원) 기준 소형주 제외
        rows = [x for x in rows if x.get("stockEndType") == "stock"
                and int(x["marketValue"].replace(",", "")) >= MIN_KR_CAP_EOK]
        rows.sort(key=lambda x: float(x["fluctuationsRatio"]), reverse=(kind == "up"))
        return rows[:TOP]

    def pack(rows):
        return [{
            "code": x["itemCode"], "name": x["stockName"],
            "price": int(x["closePrice"].replace(",", "")),
            "change": round(float(x["fluctuationsRatio"]), 2),
            "reason": reasons.get(x["itemCode"], "이유 확인 중"),
            "history": _kr_history(x["itemCode"]),
        } for x in rows]
    return {"up": pack(pick("up")), "down": pack(pick("down"))}


def us_movers(reasons):
    import pandas as pd
    tickers = pd.read_html(io.StringIO(requests.get(US_UNIVERSE, headers=UA, timeout=20).text))[0]["Symbol"].str.replace(".", "-", regex=False).tolist()
    px = yf.download(tickers, period="5d", progress=False)["Close"].dropna(how="all")
    chg = (px.iloc[-1] / px.iloc[-2] - 1) * 100
    chg = chg.dropna().sort_values()
    names = {}

    def pack(syms):
        out = []
        for s in syms:
            t = yf.Ticker(s)
            h = t.history(period="2y")
            names[s] = t.info.get("shortName", s)
            out.append({
                "code": s, "name": names[s], "price": round(float(px[s].iloc[-1]), 2),
                "change": round(float(chg[s]), 2), "reason": reasons.get(s, "이유 확인 중"),
                "history": [[i.strftime("%Y-%m-%d"), round(float(r.Open), 2), round(float(r.High), 2),
                             round(float(r.Low), 2), round(float(r.Close), 2), int(r.Volume)]
                            for i, r in h.dropna(subset=["Close"]).iterrows()],
            })
        return out
    return {"up": pack(chg.tail(TOP).index[::-1]), "down": pack(chg.head(TOP).index)}


def indices():
    out = []
    for code, name in (("KOSPI", "코스피"), ("KOSDAQ", "코스닥")):
        try:
            j = requests.get(f"https://m.stock.naver.com/api/index/{code}/basic", headers=UA, timeout=20).json()
            out.append({"name": name, "market": "kr", "value": float(j["closePrice"].replace(",", "")),
                        "change": float(j["fluctuationsRatio"])})
        except Exception as e:
            print("지수 실패", code, e)
    for sym, name, mk in (("^IXIC", "나스닥", "us"), ("^GSPC", "S&P 500", "us"), ("KRW=X", "원/달러", "fx")):
        try:
            h = yf.Ticker(sym).history(period="1mo")["Close"].dropna()
            out.append({"name": name, "market": mk, "value": round(float(h.iloc[-1]), 2),
                        "change": round(float((h.iloc[-1] / h.iloc[-2] - 1) * 100), 2),
                        "spark": [round(float(v), 2) for v in h.tail(20)]})
        except Exception as e:
            print("지수 실패", sym, e)
    return out


def main():
    ed = editorial()
    reasons = ed.get("reasons", {})
    kr = kr_movers(reasons)
    out = {
        "date": dt.datetime.now(ZoneInfo("Asia/Seoul")).date().isoformat(),
        "sample": False,
        "indices": indices(),
        "issues": ed.get("issues", {"kr": [], "us": []}),
        "term": ed.get("term"),
        "movers": {"kr": kr, "us": us_movers(reasons)},
    }
    (ROOT / "data" / "today.json").write_text(
        json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print("완료:", out["date"])


if __name__ == "__main__":
    main()
