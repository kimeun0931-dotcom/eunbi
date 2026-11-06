# 아침 5분 경제

## 보는 법
`fetch`로 JSON을 읽기 때문에 파일을 더블클릭하면 안 열려요. 폴더에서 로컬 서버를 켜세요.

    py -3.12 -m http.server 8000     # 그 후 http://localhost:8000

차트 바로 열기: `http://localhost:8000/?chart=us:AMD`, `?chart=kr:005930`

## 매일 업데이트
1. `data/editorial.json`에 이슈 한 줄 요약, 종목별 이유, 오늘의 용어 작성
   (Claude에게 "오늘 editorial.json 채워줘" 라고 시키면 뉴스를 검색해 쉬운 말로 채워요)
2. 최초 1회: `py -3.12 -m pip install yfinance requests lxml`
3. `py -3.12 scripts/update_data.py` → `data/today.json` 생성
   (지수·환율, 급등/급락 TOP5, 일봉 OHLCV 차트 데이터 포함)

## 완전 자동화 (매일 아침 06:30, 화~토)
`scripts/generate_editorial.py`가 Claude(웹 검색 포함)로 이슈·종목 이유·용어를 써서 `today.json`에 반영해요.
이유를 검색으로 못 찾으면 지어내지 않고 "개별 이유는 확인되지 않았어요"로 남겨요.

로컬에서: `pip install anthropic` → `$env:ANTHROPIC_API_KEY="sk-ant-..."` →
`py -3.12 scripts/update_data.py` → `py -3.12 scripts/generate_editorial.py`

서버 자동 실행(GitHub Actions, `.github/workflows/daily.yml`):
1. 이 폴더를 GitHub 저장소로 올리기
2. 저장소 Settings → Secrets and variables → Actions → `ANTHROPIC_API_KEY` 추가
3. Settings → Pages → 브랜치(main, / root)로 배포
4. Actions 탭에서 "매일 아침 업데이트"를 수동 실행해 한 번 확인

## 데이터 출처
- 한국: 네이버 증권 비공식 API (KRX는 접속이 막혀 pykrx를 쓰지 않아요). 구조가 바뀌면 `scripts/update_data.py`의 `_naver` 수정.
- 미국/지수/환율: yfinance (Yahoo Finance)
- 한국은 시총 5천억 미만·ETF/ETN 제외(`MIN_KR_CAP_EOK`), 미국은 S&P 500 종목 중에서 선정.

## 배포(무료)
이 폴더를 GitHub Pages / Netlify / Vercel 에 올리면 끝. 매일 자동 갱신은 GitHub Actions(cron)로 가능.

## 메모
- Python 3.15는 pandas 설치가 안 돼서 3.12를 사용해요.
- `"sample": true`면 노란 샘플 배너가 떠요 (현재는 실제 데이터).
