// SWTR Range Scanner — GitHub Actions edition
// Fetches daily candles for the full S&P 400 MidCap universe from Twelve Data,
// PACED to the free tier's 8-credits/minute limit (8 symbols/batch, one batch
// per minute → ~50 min for 399 names, well within a GitHub Actions run).
// Runs the validated ranging detector + candidate scorer, writes candidates.json
// for the app's Discover screen, and sends a push notification for Sunday prep.
//
// Env (GitHub Secrets): TWELVE_DATA_KEY, EXPO_PUSH_TOKEN

const fs = require('fs');

const ALL_TICKERS = [
  "AA","AAL","AAON","ACI","ACM","ADC","AEIS","AFG","AGCO","AHR","AIT","ALGM","ALK","ALLY","ALV",
  "AM","AMG","AMH","AMKR","AN","ANF","APG","APPF","AR","ARMK","ARW","ARWR","ASB","ASH","ATI","ATR",
  "AVAV","AVNT","AVT","AVTR","AXTA","AYI","BAH","BBWI","BC","BCO","BDC","BHF","BILL","BIO","BJ","BKH",
  "BLD","BLKB","BMRN","BRBR","BRKR","BROS","BRX","BSY","BURL","BWA","BWXT","BYD","CACI","CAR","CART",
  "CAVA","CBSH","CBT","CCK","CDP","CELH","CFR","CG","CGNX","CHDN","CHE","CHH","CHRD","CHWY","CLF","CLH",
  "CMC","CNH","CNM","CNO","CNX","CNXC","COKE","COLB","COLM","COTY","CPRI","CR","CRBG","CROX","CRS","CRUS",
  "CSL","CTRE","CUBE","CUZ","CVLT","CW","CXT","CYTK","DAR","DBX","DCI","DINO","DKS","DLB","DOCN","DOCS",
  "DOCU","DT","DTM","DUOL","DY","EEFT","EGP","EHC","ELAN","ELF","ELS","ENS","ENSG","ENTG","EPR","EQH",
  "ESAB","ESNT","EVR","EWBC","EXEL","EXLS","EXP","EXPO","FAF","FBIN","FCFS","FCN","FFIN","FHI","FHN",
  "FIVE","FLEX","FLG","FLO","FLR","FLS","FN","FNB","FND","FNF","FOUR","FR","FTI","G","GAP","GATX","GBCI",
  "GEF","GGG","GHC","GLPI","GME","GMED","GNTX","GPK","GT","GTLS","GWRE","GXO","H","HAE","HALO","HGV",
  "HIMS","HL","HLI","HLNE","HOG","HOMB","HQY","HR","HRB","HWC","HXL","IBOC","IDA","IDCC","ILMN","INGR",
  "IPGP","IRT","ITT","JAZZ","JEF","JHG","JLL","KBH","KBR","KD","KEX","KNF","KNSL","KNX","KRC","KRG",
  "KTOS","LAD","LAMR","LEA","LECO","LFUS","LIVN","LNTH","LOPE","LPX","LSCC","LSTR","M","MANH","MASI",
  "MAT","MEDP","MIDD","MKSI","MLI","MMS","MORN","MP","MSA","MSM","MTDR","MTG","MTN","MTSI","MTZ","MUR",
  "MUSA","MZTI","NBIX","NEU","NFG","NJR","NLY","NNN","NOV","NOVT","NSA","NTNX","NVST","NVT","NWE","NXST",
  "NXT","NYT","OC","OGE","OGS","OHI","OKTA","OLED","OLLI","OLN","ONB","ONTO","OPCH","ORA","ORI","OSK",
  "OVV","OZK","PAG","PATH","PB","PBF","PCTY","PEGA","PEN","PFGC","PII","PINS","PK","PLNT","PNFP","POR",
  "POST","PPC","PR","PRI","PSN","PSTG","PVH","QLYS","R","RBA","RBC","REXR","RGA","RGEN","RGLD","RH","RLI",
  "RMBS","RNR","ROIV","RPM","RRC","RRX","RS","RYAN","RYN","SAIA","SAIC","SAM","SARO","SBRA","SCI","SEIC",
  "SF","SFM","SGI","SHC","SIGI","SITM","SLAB","SLGN","SLM","SMG","SNX","SOLS","SON","SPXC","SR","SSB",
  "SSD","ST","STAG","STRL","STWD","SWX","SYNA","TCBI","TEX","THC","THG","THO","TKR","TLN","TMHC","TNL",
  "TOL","TREX","TRU","TTC","TTEK","TTMI","TWLO","TXNM","TXRH","UBSI","UFPI","UGI","ULS","UMBF","UNM",
  "USFD","UTHR","VAL","VC","VFC","VICR","VLY","VMI","VNO","VNOM","VNT","VOYA","VVV","WAL","WBS","WCC",
  "WEX","WFRD","WH","WHR","WING","WLK","WMG","WMS","WPC","WSO","WTFC","WTRG","WTS","WWD","XPO","XRAY",
  "YETI","ZION"
];

// ─── Detector helpers (ported from Python prototype) ─────────────────────────

function computeADX(highs, lows, closes, period = 14) {
  const n = closes.length;
  if (n < period + 1) return 0;
  const plusDM = [], minusDM = [], tr = [];
  for (let i = 1; i < n; i++) {
    const up = highs[i] - highs[i-1];
    const down = lows[i-1] - lows[i];
    plusDM.push((up > down && up > 0) ? up : 0);
    minusDM.push((down > up && down > 0) ? down : 0);
    tr.push(Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])));
  }
  const smooth = (arr, p) => {
    if (arr.length < p) return [];
    let out = [arr.slice(0, p).reduce((a,b)=>a+b,0)];
    for (let i = p; i < arr.length; i++) out.push(out[out.length-1] - out[out.length-1]/p + arr[i]);
    return out;
  };
  if (tr.length < period) return 0;
  const atr = smooth(tr, period), pdmS = smooth(plusDM, period), mdmS = smooth(minusDM, period);
  const dx = [];
  for (let i = 0; i < atr.length; i++) {
    if (atr[i] === 0) { dx.push(0); continue; }
    const pdi = 100 * pdmS[i] / atr[i], mdi = 100 * mdmS[i] / atr[i];
    const denom = pdi + mdi;
    dx.push(denom > 0 ? 100 * Math.abs(pdi - mdi) / denom : 0);
  }
  if (dx.length < period) return dx.length ? dx.reduce((a,b)=>a+b,0)/dx.length : 0;
  const last = dx.slice(-period);
  return last.reduce((a,b)=>a+b,0) / last.length;
}

function mean(a) { return a.reduce((x,y)=>x+y,0) / a.length; }
function median(a) { const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2); return s.length%2?s[m]:(s[m-1]+s[m])/2; }

function computeSlopePct(closes) {
  const n = closes.length;
  if (n < 2) return 0;
  const xbar = (n-1)/2, ybar = mean(closes);
  let num=0, den=0;
  for (let i=0;i<n;i++){ num+=(i-xbar)*(closes[i]-ybar); den+=(i-xbar)**2; }
  const slope = den ? num/den : 0;
  return ybar ? (slope/ybar)*100 : 0;
}

function computeContainment(closes) {
  const n = closes.length;
  if (n < 20) return [0,0,0];
  const s = [...closes].sort((a,b)=>a-b);
  const lo = s[Math.floor(n*0.10)], hi = s[Math.floor(n*0.90)];
  const bw = hi - lo;
  if (bw <= 0) return [0,0,0];
  const inside = closes.filter(c => c>=lo && c<=hi).length;
  const containment = inside/n*100;
  const tol = bw*0.10;
  let touches=0, wasNear=false;
  for (const c of closes){ const near=(Math.abs(c-lo)<=tol)||(Math.abs(c-hi)<=tol); if(near&&!wasNear)touches++; wasNear=near; }
  return [containment, touches, bw/lo*100];
}

function computeBBBalance(closes, period=20) {
  const n = closes.length;
  if (n < period) return 0;
  let up=0, low=0;
  for (let i=period;i<n;i++){
    const w = closes.slice(i-period,i);
    const m = mean(w);
    const sd = Math.sqrt(w.reduce((a,b)=>a+(b-m)**2,0)/w.length);
    if (sd===0) continue;
    if (closes[i] >= m+2*sd) up++;
    else if (closes[i] <= m-2*sd) low++;
  }
  const total = up+low;
  if (total===0) return 0.5;
  return 1 - Math.abs(up-low)/total;
}

function detectRanging(highs, lows, closes) {
  const adx = computeADX(highs, lows, closes);
  const slope = computeSlopePct(closes);
  const [containment, touches, bandPct] = computeContainment(closes);
  const bbBalance = computeBBBalance(closes);
  let score = 0;
  const aslope = Math.abs(slope);

  if (adx < 20) score += 30; else if (adx < 25) score += 20;
  if (aslope < 0.1) score += 25; else if (aslope < 0.2) score += 15;
  if (containment > 85) score += 20; else if (containment > 75) score += 12;
  if (touches >= 4) score += 15; else if (touches >= 2) score += 8;
  if (bbBalance > 0.6) score += 10;
  if (bandPct < 5) score -= 10; else if (bandPct > 60) score -= 20;
  score = Math.max(0, Math.min(100, score));

  const tooWide = bandPct > 55, tooTight = bandPct < 6;
  const trending = adx >= 25 || aslope >= 0.25, leaky = containment < 72;

  let verdict;
  if (trending) verdict = 'TRENDING';
  else if (tooWide) { verdict='REGIME_SHIFT'; score=Math.min(score,40); }
  else if (leaky)   { verdict='CHOPPY'; score=Math.min(score,40); }
  else if (tooTight){ verdict='TOO_TIGHT'; score=Math.min(score,55); }
  else if (score >= 62) verdict='RANGING';
  else verdict='CHOPPY';

  return { verdict, score, adx, slope, containment, touches, bandPct, bbBalance };
}

// ─── Level detection + candidate scoring (ported) ────────────────────────────

function detectLevels(highs, lows, closes) {
  const n = closes.length;
  if (n < 40) return [null, null];
  const sl = [...lows].sort((a,b)=>a-b), sh = [...highs].sort((a,b)=>a-b);
  const support = sl[Math.floor(n*0.10)], resistance = sh[Math.floor(n*0.90)];
  if (resistance <= support) return [null, null];
  return [support, resistance];
}

function countTouches(prices, level, tolPct=2.0) {
  const tol = level*tolPct/100;
  let touches=0, wasNear=false;
  for (const p of prices){ const near=Math.abs(p-level)<=tol; if(near&&!wasNear)touches++; wasNear=near; }
  return touches;
}

function bandCleanliness(closes, support, resistance) {
  const n = closes.length, band = resistance - support;
  if (band <= 0) return 0;
  const nearS = closes.filter(c => c <= support + band*0.25).length;
  const nearR = closes.filter(c => c >= resistance - band*0.25).length;
  const edgeTime = (nearS + nearR)/n;
  const balance = (nearS+nearR>0) ? 1 - Math.abs(nearS-nearR)/(nearS+nearR) : 0;
  return Math.min(100, (edgeTime*70 + balance*30) * 1.4);
}

function countBreaks(closes, support, resistance) {
  const below = support*0.95, above = resistance*1.05;
  return closes.filter(c => c<=below || c>=above).length;
}

function scoreCandidate(ticker, highs, lows, closes) {
  const r = detectRanging(highs, lows, closes);
  if (r.verdict !== 'RANGING') {
    return { ticker, isCandidate:false, score:r.score, verdict:r.verdict, support:null, resistance:null };
  }
  const [support, resistance] = detectLevels(highs, lows, closes);
  if (support === null) {
    return { ticker, isCandidate:false, score:0, verdict:'NO_LEVELS', support:null, resistance:null };
  }
  const rangePct = (resistance-support)/support*100;
  const sT = countTouches(lows, support), rT = countTouches(highs, resistance);
  const clean = bandCleanliness(closes, support, resistance);
  const breaks = countBreaks(closes, support, resistance);
  const breakRate = breaks/closes.length*100;

  // ── De-saturated, width-aware scoring (0-100) ──────────────────────────────
  // The detector already gated RANGING above; this score RANKS the survivors by
  // how tradeable the range is, so the best genuinely separate from the good.
  const totalTouches = sT + rT;
  const balanced = sT >= 3 && rT >= 3;

  // Touch quality (0-30): more touches = better-tested range; saturates ~16.
  let score = Math.min(26, totalTouches * 1.7) + (balanced ? 4 : 0);
  // Cleanliness (0-25): share of time price respected the band, continuous.
  score += (clean / 100) * 25;
  // Break discipline (0-25): 0% breaks = 25, decays fast.
  score += Math.max(0, 25 - breakRate * 5);
  // Range-width fitness (0-20): peaked on tradeable widths (~10-20%).
  let widthFit;
  if      (rangePct >= 10 && rangePct <= 20) widthFit = 20;
  else if (rangePct >=  8 && rangePct <  10) widthFit = 13;
  else if (rangePct >  20 && rangePct <= 24) widthFit = 13;
  else if (rangePct >  24 && rangePct <= 28) widthFit = 6;
  else                                        widthFit = 0;   // <8% too tight, >28% too wide / volatile
  score += widthFit;
  score = Math.max(0, Math.min(100, score));

  // Tighter gate: tradeable width, well-tested, disciplined, quality score.
  const isCandidate =
    rangePct >= 8 && rangePct <= 28 &&
    totalTouches >= 6 &&
    breakRate <= 5 &&
    score >= 70;
  return {
    ticker, isCandidate, score: Math.round(score), verdict:r.verdict,
    support: +support.toFixed(2), resistance: +resistance.toFixed(2),
    rangePct: +rangePct.toFixed(1), supportTouches:sT, resistTouches:rT,
    bandClean: Math.round(clean), breakCount:breaks, breakRate: +breakRate.toFixed(0),
  };
}

// ─── Twelve Data fetch ────────────────────────────────────────────────────────

// Parse one symbol's time_series block into candle arrays
function parseCandles(block) {
  if (!block || block.status === 'error' || !block.values || block.values.length < 60) return null;
  const rows = [...block.values].reverse();
  return {
    highs: rows.map(r => parseFloat(r.high)),
    lows: rows.map(r => parseFloat(r.low)),
    closes: rows.map(r => parseFloat(r.close)),
  };
}

// Fetch a BATCH of up to ~50 symbols in one call. Returns { SYMBOL: candles }.
async function fetchBatch(tickers, apiKey) {
  const symbolParam = tickers.join(',');
  const url = `https://api.twelvedata.com/time_series?symbol=${symbolParam}&interval=1day&outputsize=180&apikey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) { console.log(`  HTTP ${res.status} on batch [${symbolParam}]`); return {}; }
  const d = await res.json();

  const out = {};
  // Multi-symbol response is keyed by ticker; single-symbol is flat.
  if (d.status === 'error') { console.log(`  API error: ${d.message}`); return {}; }
  if (d.values) {
    // single symbol came back flat (batch of 1)
    out[tickers[0]] = parseCandles(d);
  } else {
    for (const t of tickers) {
      if (d[t]) out[t] = parseCandles(d[t]);
    }
  }
  return out;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────


// ─── Push notification (ported from step2_notify) ────────────────────────────

async function sendPush(result) {
  const EXPO_TOKEN = process.env.EXPO_PUSH_TOKEN;
  if (!EXPO_TOKEN) { console.log('No EXPO_PUSH_TOKEN set — skipping push.'); return; }
  const { scanned, errors, totalCandidates, top } = result;
  const time = new Date().toLocaleDateString('en-IL', {
    weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Jerusalem'
  });

  let body;
  if (!top || top.length === 0) {
    body = `Scanned ${scanned} stocks — no clean range candidates this week. Market may be trending. (${errors} skipped)`;
  } else {
    const lines = top.map(c => {
      const star = c.score >= 75 ? '⭐' : '·';
      return `${star} ${c.ticker}  $${c.support}–$${c.resistance} (${c.rangePct}%)  score ${c.score} · ${c.supportTouches}+${c.resistTouches} touches · ${c.breakRate}% brk`;
    });
    body = `${totalCandidates} range candidates found. Top ${top.length} for validation:\n\n${lines.join('\n')}\n\nHand-validate before adding to watchlist.`;
  }

  const notification = {
    to: EXPO_TOKEN,
    title: `SWTR — Weekly Range Scan · ${time}`,
    body, sound: 'default', priority: 'high',
    data: { type: 'range_scan', candidates: JSON.stringify(top || []), scannedAt: new Date().toISOString() },
  };

  const r = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notification),
  });
  console.log('Push response:', JSON.stringify(await r.json()));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const KEY = process.env.TWELVE_DATA_KEY;
  if (!KEY) throw new Error('TWELVE_DATA_KEY env var not set');

  const candidates = [];
  let scanned = 0, errors = 0;

  // 8 symbols = 8 credits = the free-tier per-minute cap. One batch per minute.
  const BATCH_SIZE = 8;
  const SLEEP_MS   = 65000;  // 65s guarantees each batch lands in a fresh minute

  const batches = [];
  for (let i = 0; i < ALL_TICKERS.length; i += BATCH_SIZE) {
    batches.push(ALL_TICKERS.slice(i, i + BATCH_SIZE));
  }
  console.log(`Scanning ${ALL_TICKERS.length} symbols in ${batches.length} batches of ${BATCH_SIZE} (~${Math.round(batches.length * SLEEP_MS / 60000)} min)...`);

  for (let b = 0; b < batches.length; b++) {
    try {
      const results = await fetchBatch(batches[b], KEY);
      for (const ticker of batches[b]) {
        const candles = results[ticker];
        if (candles) {
          const result = scoreCandidate(ticker, candles.highs, candles.lows, candles.closes);
          if (result.isCandidate) candidates.push(result);
          scanned++;
        } else {
          errors++;
        }
      }
      console.log(`Batch ${b + 1}/${batches.length} · scanned ${scanned} · candidates ${candidates.length} · errors ${errors}`);
    } catch (e) {
      errors += batches[b].length;
      console.log(`Batch ${b + 1} threw: ${e.message}`);
    }
    if (b < batches.length - 1) await sleep(SLEEP_MS);
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 8);
  const payload = { scannedAt: new Date().toISOString(), scanned, errors, totalCandidates: candidates.length, top };

  fs.writeFileSync('candidates.json', JSON.stringify(payload, null, 2));
  console.log(`Wrote candidates.json — ${top.length} top of ${candidates.length} candidates (${scanned} scanned, ${errors} errors).`);

  await sendPush(payload);
}

main().catch(e => { console.error(e); process.exit(1); });
