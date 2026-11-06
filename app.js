(async function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let data;
  try {
    const r = await fetch("data/today.json?t=" + Date.now());
    data = await r.json();
  } catch (e) {
    document.querySelector("main").innerHTML =
      '<div class="card">데이터를 불러오지 못했어요. 파일을 더블클릭으로 열었다면 로컬 서버로 실행해 주세요 (README 참고).</div>';
    return;
  }

  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const sign = (c) => (c > 0 ? "up" : c < 0 ? "down" : "flat");
  const fmtChg = (c) => (c > 0 ? "+" : "") + c.toFixed(2) + "%";
  const fmtPrice = (m, p) => (m === "kr" ? Math.round(p).toLocaleString() + "원" : "$" + Number(p).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const cleanName = (n) => n.replace(/,? (Inc\.?|Corporation|Corp\.?|Holdings|Company|Co\.|Ltd\.?|plc|Group)\b\.?/gi, "").replace(/[ ,]+$/g, "").trim();
  const fmtVol = (v) => (v >= 1e8 ? (v / 1e8).toFixed(1) + "억" : v >= 1e4 ? Math.round(v / 1e4).toLocaleString() + "만" : v.toLocaleString());

  /* ---------- 헤더 ---------- */
  const d = new Date(data.date + "T00:00:00");
  $("date").textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${"일월화수목금토"[d.getDay()]}요일 아침`;
  if (data.sample) $("sample-banner").hidden = false;

  const idx = data.indices || [];
  const pick = (n) => idx.find((i) => i.name === n);
  const ref = [pick("코스피"), pick("나스닥")].filter(Boolean);
  if (ref.length) {
    const avg = ref.reduce((a, b) => a + b.change, 0) / ref.length;
    const mood = avg <= -3 ? "🌧️ 크게 흔들린 날" : avg <= -1 ? "☁️ 약세로 시작한 날" : avg < 1 ? "⛅ 잔잔한 날" : avg < 3 ? "🌤️ 오른 날" : "☀️ 크게 오른 날";
    $("mood-title").textContent = "오늘 시장은 " + mood;
  }
  const first = ((data.issues.kr || [])[0] || {}).text;
  if (first) $("hero-line").textContent = "오늘의 핵심 — " + first;

  /* ---------- 지수 ---------- */
  function spark(vals, color, w = 70, h = 26) {
    if (!vals || vals.length < 2) return "";
    const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - mn) / r) * (h - 4)).toFixed(1)}`).join(" ");
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }
  $("indices").innerHTML = idx.map((i) => {
    const s = sign(i.change);
    const val = i.market === "fx" ? i.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "원" : i.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    const col = s === "down" ? cssVar("--down") : cssVar("--up");
    return `<div class="idx"><div class="n">${esc(i.name)}</div><div class="v">${val}</div>
      <span class="pill ${s}">${s === "up" ? "▲" : s === "down" ? "▼" : ""} ${fmtChg(Math.abs(i.change) * (i.change < 0 ? -1 : 1))}</span>${spark(i.spark, col)}</div>`;
  }).join("");

  /* ---------- 이슈 / 용어 ---------- */
  for (const m of ["kr", "us"]) {
    const list = (data.issues || {})[m] || [];
    $("issues-" + m).innerHTML = list.length
      ? list.map((i) => `<li>${esc(i.text)}${i.detail ? `<span class="more">${esc(i.detail)}</span>` : ""}</li>`).join("")
      : `<li class="empty">오늘의 이슈 요약은 아직 작성 전이에요. 아래 주식 시세는 먼저 업데이트됐어요.</li>`;
  }
  $("term").innerHTML = data.term
    ? `<b>${esc(data.term.word)}</b><p>${esc(data.term.easy)}</p>`
    : `<b>작성 전이에요</b><p>오늘의 용어는 이슈 요약과 함께 올라와요.</p>`;

  /* ---------- 급등/급락 ---------- */
  const all = {};
  let market = "kr";
  function renderMovers() {
    const mv = (data.movers || {})[market] || {};
    $("movers").innerHTML = ["up", "down"].map((dir) => {
      const rows = (mv[dir] || []).map((s, n) => {
        const key = `${market}:${s.code}`;
        all[key] = { ...s, market };
        const closes = (s.history || []).slice(-30).map((r) => r[4]);
        const col = dir === "up" ? cssVar("--up") : cssVar("--down");
        return `<li class="${dir}"><button data-k="${esc(key)}">
          <span class="rank">${n + 1}</span>
          <span class="s-main"><span class="name">${esc(cleanName(s.name))}<i>${esc(s.code)}</i></span></span>
          <span class="s-right"><span class="pill ${dir}">${fmtChg(s.change)}</span>${spark(closes, col, 64, 22)}</span>
          <span class="why">${esc(s.reason)}</span></button></li>`;
      }).join("");
      return `<div class="card"><div class="mv-head"><h3 class="${dir}">${dir === "up" ? "📈 크게 오른 5" : "📉 크게 떨어진 5"}</h3><span>${market === "kr" ? "시총 5천억↑ 일반주식" : "S&P 500 종목"}</span></div><ul class="stocks">${rows}</ul></div>`;
    }).join("");
    $("mover-note").textContent = market === "kr"
      ? "한국 종목은 조회 시점(장중) 기준이에요. 작은 회사·ETF는 빼고 보여줘요."
      : "미국 종목은 가장 최근 마감일(한국 시간 아침 기준 어제) 종가 기준이에요.";
  }
  $("mkt-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    market = b.dataset.m;
    document.querySelectorAll("#mkt-tabs button").forEach((x) => x.classList.toggle("on", x === b));
    renderMovers();
  });
  renderMovers();

  /* ---------- 차트 (증권사 앱 스타일) ---------- */
  let chart, candle, vol, maSeries = [], cur = null, tf = "D";
  const MAS = [[5, "#1e9e57"], [20, "#e5383b"], [60, "#b23be0"], [120, "#f59e0b"]];

  function aggregate(rows, mode) { // rows: [date,o,h,l,c,v]
    if (mode === "D") return rows;
    const key = (dt) => {
      if (mode === "M") return dt.slice(0, 7);
      const x = new Date(dt + "T00:00:00Z"); const day = (x.getUTCDay() + 6) % 7; // 월요일 시작
      x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10);
    };
    const out = []; let k = null;
    for (const r of rows) {
      const kk = key(r[0]);
      if (kk !== k) { out.push([r[0], r[1], r[2], r[3], r[4], r[5]]); k = kk; }
      else { const o = out[out.length - 1]; o[2] = Math.max(o[2], r[2]); o[3] = Math.min(o[3], r[3]); o[4] = r[4]; o[5] += r[5]; }
    }
    return out;
  }
  const sma = (rows, n) => {
    const out = []; let sum = 0;
    rows.forEach((r, i) => { sum += r[4]; if (i >= n) sum -= rows[i - n][4]; if (i >= n - 1) out.push({ time: r[0], value: +(sum / n).toFixed(4) }); });
    return out;
  };

  let vchart, syncing = false;
  function buildChart(s) {
    $("chart-p").innerHTML = ""; $("chart-v").innerHTML = "";
    const up = cssVar("--up"), down = cssVar("--down"), text = cssVar("--muted"), line = cssVar("--line");
    const base = {
      autoSize: true,
      layout: { background: { color: "transparent" }, textColor: text, fontFamily: "Pretendard Variable, sans-serif" },
      grid: { vertLines: { color: line }, horzLines: { color: line } },
      rightPriceScale: { borderColor: line, minimumWidth: 74 },
      timeScale: { borderColor: line, rightOffset: 4, timeVisible: false },
      crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
    };
    chart = LightweightCharts.createChart($("chart-p"), { ...base, timeScale: { ...base.timeScale, visible: false } });
    vchart = LightweightCharts.createChart($("chart-v"), base);
    const pf = s.market === "kr" ? { type: "price", precision: 0, minMove: 1 } : { type: "price", precision: 2, minMove: 0.01 };
    candle = chart.addCandlestickSeries({
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, priceFormat: pf,
    });
    candle.priceScale().applyOptions({ scaleMargins: { top: 0.14, bottom: 0.06 } });
    maSeries = MAS.map(([, c]) => chart.addLineSeries({ color: c, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, priceFormat: pf }));
    vol = vchart.addHistogramSeries({ priceFormat: { type: "volume" }, lastValueVisible: true, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0 } });

    // 두 차트 가로 범위 동기화
    const link = (from, to) => from.timeScale().subscribeVisibleLogicalRangeChange((r) => {
      if (syncing || !r) return; syncing = true; to.timeScale().setVisibleLogicalRange(r); syncing = false;
    });
    link(chart, vchart); link(vchart, chart);

    chart.subscribeCrosshairMove((p) => {
      const c = p.seriesData && p.seriesData.get(candle);
      if (!c) { $("hover").textContent = ""; return; }
      const row = bars.find((r) => r[0] === p.time);
      const f = (x) => (s.market === "kr" ? Math.round(x).toLocaleString() : x.toFixed(2));
      $("hover").textContent = `${p.time}  시 ${f(c.open)}  고 ${f(c.high)}  저 ${f(c.low)}  종 ${f(c.close)}${row ? "  거래 " + fmtVol(row[5]) : ""}`;
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(updateMarkers);
  }

  let bars = [];
  function updateMarkers(range) {
    if (!bars.length || !candle) return;
    const from = Math.max(0, Math.floor(range ? range.from : 0)), to = Math.min(bars.length - 1, Math.ceil(range ? range.to : bars.length - 1));
    if (to < from) return;
    let hi = from, lo = from;
    for (let i = from; i <= to; i++) { if (bars[i][2] > bars[hi][2]) hi = i; if (bars[i][3] < bars[lo][3]) lo = i; }
    const s = cur, last = bars[bars.length - 1][4];
    const f = (x) => (s.market === "kr" ? Math.round(x).toLocaleString() : x.toFixed(2));
    const pct = (x) => { const p = ((x / last - 1) * 100); return (p > 0 ? "+" : "") + p.toFixed(1) + "%"; };
    const label = (r) => `${f(r)} (${pct(r)})`;
    const ms = [];
    if (hi === lo) return candle.setMarkers([]);
    ms.push({ time: bars[hi][0], position: "aboveBar", shape: "arrowDown", color: cssVar("--up"), text: "최고 " + label(bars[hi][2]) });
    ms.push({ time: bars[lo][0], position: "belowBar", shape: "arrowUp", color: cssVar("--down"), text: "최저 " + label(bars[lo][3]) });
    ms.sort((a, b) => (a.time < b.time ? -1 : 1));
    candle.setMarkers(ms);
  }

  function draw() {
    bars = aggregate(cur.history, tf);
    const up = cssVar("--up"), down = cssVar("--down");
    candle.setData(bars.map((r) => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] })));
    vol.setData(bars.map((r) => ({ time: r[0], value: r[5], color: (r[4] >= r[1] ? up : down) + "cc" })));
    const on = $("ma-on").checked;
    MAS.forEach(([n], i) => maSeries[i].setData(on ? sma(bars, n) : []));
    const show = tf === "D" ? 70 : tf === "W" ? 60 : 36;
    const n = bars.length;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - show), to: n + 8 });
    updateMarkers({ from: Math.max(0, n - show), to: n });
  }

  function open(key) {
    cur = all[key];
    if (!cur.history || !cur.history.length) return;
    const h = cur.history, last = h[h.length - 1], prev = h[h.length - 2] || last;
    const diff = last[4] - prev[4];
    const sg = sign(cur.change);
    $("m-title").textContent = cleanName(cur.name);
    $("m-code").textContent = cur.code;
    $("m-price").textContent = fmtPrice(cur.market, last[4]);
    $("m-price").className = "m-price " + sg;
    const dtxt = cur.market === "kr" ? Math.abs(Math.round(diff)).toLocaleString() : Math.abs(diff).toFixed(2);
    $("m-chg").textContent = `${sg === "up" ? "▲" : "▼"} ${dtxt}  (${fmtChg(cur.change)})`;
    $("m-chg").className = "m-chg " + sg;
    $("m-reason").textContent = cur.reason;
    tf = "D";
    document.querySelectorAll("#tf button").forEach((b) => b.classList.toggle("on", b.dataset.tf === "D"));
    $("modal").hidden = false;
    document.body.style.overflow = "hidden";
    buildChart(cur);
    draw();
  }
  function closeModal() {
    $("modal").hidden = true; document.body.style.overflow = "";
    if (chart) { chart.remove(); chart = null; }
    if (vchart) { vchart.remove(); vchart = null; }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".stocks button");
    if (b) open(b.dataset.k);
    const t = e.target.closest("#tf button");
    if (t && chart) {
      tf = t.dataset.tf;
      document.querySelectorAll("#tf button").forEach((x) => x.classList.toggle("on", x === t));
      draw();
    }
    if (e.target === $("modal") || e.target === $("close")) closeModal();
  });
  $("ma-on").addEventListener("change", () => chart && draw());

  // 공유/테스트용 바로가기: index.html?chart=us:AMD
  const q = new URLSearchParams(location.search).get("chart");
  if (q) {
    const [m, c] = q.split(":");
    if (m !== market) document.querySelector(`#mkt-tabs [data-m="${m}"]`)?.click();
    if (all[q]) open(q);
  }
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
})();
