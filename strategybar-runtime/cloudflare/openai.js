const ANALYSIS_SCHEMA = {
  type:"object",additionalProperties:false,
  properties:{regime:{type:"string",enum:["risk_on","neutral","risk_off"]},regimeLabel:{type:"string"},headline:{type:"string"},summary:{type:"string"},
    confirmations:{type:"array",items:{type:"string"},maxItems:4},risks:{type:"array",items:{type:"string"},maxItems:4},opportunities:{type:"array",items:{type:"string"},maxItems:4},
    confidence:{type:"integer",minimum:0,maximum:100},horizon:{type:"string",enum:["당일","수일","수주"]}},
  required:["regime","regimeLabel","headline","summary","confirmations","risks","opportunities","confidence","horizon"],
};

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output || []) for (const content of item.content || []) if (content.type === "output_text" && typeof content.text === "string") return content.text;
  return null;
}

function normalizeAnalysis(value) {
  if (!value || typeof value !== "object") throw new Error("분석 JSON이 비어 있습니다.");
  const regime = ["risk_on","neutral","risk_off"].includes(value.regime) ? value.regime : null;
  const horizon = ["당일","수일","수주"].includes(value.horizon) ? value.horizon : null;
  const strings = ["regimeLabel","headline","summary"];
  const lists = ["confirmations","risks","opportunities"];
  if (!regime || !horizon || strings.some((key)=>typeof value[key]!=="string") || lists.some((key)=>!Array.isArray(value[key]))) {
    throw new Error("분석 JSON 형식이 올바르지 않습니다.");
  }
  const confidence = Number(value.confidence);
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) throw new Error("분석 신뢰도 형식이 올바르지 않습니다.");
  return {regime,regimeLabel:value.regimeLabel,headline:value.headline,summary:value.summary,
    confirmations:value.confirmations.filter((x)=>typeof x==="string").slice(0,4),risks:value.risks.filter((x)=>typeof x==="string").slice(0,4),
    opportunities:value.opportunities.filter((x)=>typeof x==="string").slice(0,4),confidence,horizon};
}

function providerMessage(status) {
  if (status === 401 || status === 403) return "OpenAI API 키 또는 프로젝트 권한을 확인해 주세요.";
  if (status === 429) return "OpenAI API 사용 한도나 결제 상태를 확인해 주세요.";
  return "OpenAI가 요청을 거절해 규칙 기반 대체 판단을 표시합니다.";
}

async function requestAnalysis(env, model, input, instructions, mode) {
  const jsonInstruction = mode === "json_object"
    ? "반드시 설명이나 코드펜스 없이 JSON 객체만 출력한다. 키는 regime, regimeLabel, headline, summary, confirmations, risks, opportunities, confidence, horizon만 사용한다."
    : "";
  const format = mode === "json_schema"
    ? {type:"json_schema",name:"strategybar_assessment",strict:true,schema:ANALYSIS_SCHEMA}
    : {type:"json_object"};
  const response = await fetch("https://api.openai.com/v1/responses", {method:"POST",headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,"content-type":"application/json"},
    body:JSON.stringify({model,instructions:`${instructions} ${jsonInstruction}`.trim(),input:JSON.stringify(input),text:{format},store:false})});
  if (!response.ok) return {ok:false,status:response.status};
  const body=await response.json(), text=outputText(body);
  if (!text) throw new Error("OpenAI 응답 본문이 비어 있습니다.");
  return {ok:true,analysis:normalizeAnalysis(JSON.parse(text))};
}

export async function createAnalysis(env, input, scope = "market") {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI API 연결 전입니다.");
  const preferred = scope === "symbol" ? (env.OPENAI_DEEP_MODEL || "gpt-5.6-sol") : (env.OPENAI_ROUTINE_MODEL || "gpt-5.6-luna");
  const models = [...new Set([preferred,env.OPENAI_ROUTINE_MODEL,"gpt-5.6-luna","gpt-5-mini"].filter(Boolean))];
  const instructions = [
    "당신은 전략바의 시장 판단 보조엔진이다.",
    "입력 JSON의 수치와 freshness만 근거로 한국어로 답한다. 존재하지 않는 뉴스, 실적, 가격을 추정하지 않는다.",
    "직접적인 매수·매도 지시, 수익 보장, 주문 실행은 하지 않는다. 확인 조건과 무효화 조건을 분리한다.",
    "신호 점수는 규칙 기반 선별값이며 예측 확률이 아니다. 지연되거나 누락된 값은 한계로 반영한다.",
    scope === "symbol" ? "선택 종목의 6개 헤드(추세·모멘텀·거래량·상대강도·시장·위험), MA/터틀, 유사패턴 성과와 지지/저항을 함께 평가한다." : "시장 체온과 상위 후보들의 6개 헤드, 동적 가중치, 유사패턴 성공률, 공통 위험을 함께 평가한다.",
    "유사패턴 성과는 과거 관측의 참고 통계일 뿐 미래 확률이나 보장 수익으로 해석하지 않는다. 표본 수가 작으면 불확실성을 명시한다.",
    "look-ahead 방지 원칙을 존중한다. 입력에 기록된 관측 시점 이후에 실제로 측정된 성과만 과거 성과로 취급한다.",
  ].join(" ");
  let lastStatus=400;
  for (const model of models) {
    for (const mode of ["json_schema","json_object"]) {
      try {
        const result=await requestAnalysis(env,model,input,instructions,mode);
        if (result.ok) return {...result.analysis,model,scope,generatedAt:new Date().toISOString(),providerStatus:"connected"};
        lastStatus=result.status;
        if ([401,403,429].includes(lastStatus)) throw Object.assign(new Error(providerMessage(lastStatus)),{providerStatus:lastStatus});
      } catch (error) {
        if (error?.providerStatus) throw error;
        lastStatus=400;
      }
    }
  }
  throw Object.assign(new Error(providerMessage(lastStatus)),{providerStatus:lastStatus});
}

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
const metric = (label,value,suffix="") => finite(value) ? `${label} ${Number(value).toFixed(1)}${suffix}` : null;

export function createRuleBasedAnalysis(input, scope = "symbol", reason = "OpenAI 연결을 확인할 수 없습니다.") {
  const rows = scope === "symbol" ? [input.security].filter(Boolean) : (input.candidates || []);
  const row = rows[0] || {};
  const scores = rows.map((x)=>Number(x.score)).filter(Number.isFinite);
  const score = scores.length ? scores.reduce((sum,x)=>sum+x,0)/scores.length : 50;
  const regime = score >= 65 ? "risk_on" : score <= 34 ? "risk_off" : "neutral";
  const regimeLabel = regime === "risk_on" ? "우호" : regime === "risk_off" ? "방어" : "중립";
  const confirmations = [
    finite(row.ma20Gap) && row.ma20Gap > 0 ? metric("20일선 상단",row.ma20Gap,"%") : null,
    finite(row.ma60Gap) && row.ma60Gap > 0 ? metric("60일선 상단",row.ma60Gap,"%") : null,
    finite(row.volumeRatio) && row.volumeRatio >= 1.1 ? metric("거래량",row.volumeRatio,"배") : null,
    finite(row.rsi) && row.rsi >= 45 && row.rsi <= 68 ? `RSI ${Number(row.rsi).toFixed(0)} 중립·강세 범위` : null,
  ].filter(Boolean);
  const risks = [
    finite(row.ma20Gap) && row.ma20Gap < 0 ? metric("20일선 하단",row.ma20Gap,"%") : null,
    finite(row.rsi) && row.rsi > 70 ? `RSI ${Number(row.rsi).toFixed(0)} 과열 구간` : null,
    finite(row.volatility20) && row.volatility20 > 60 ? metric("20일 변동성",row.volatility20,"%") : null,
    finite(row.support) ? `지지 ${Number(row.support).toFixed(2)} 이탈 여부 확인` : null,
  ].filter(Boolean);
  const opportunities = [
    finite(row.resistance) ? `저항 ${Number(row.resistance).toFixed(2)} 돌파·안착 확인` : "추세 전환 확인 후 후보 재평가",
    finite(row.volumeRatio) ? "가격 방향과 거래량 동행 여부 확인" : "거래량 데이터 확보 후 재평가",
  ];
  return {regime,regimeLabel,headline:scope === "symbol" ? `${row.symbol || "선택 종목"} · ${row.signal || "중립"} 신호, ${row.trend || "혼조"} 흐름` : `시장 후보군 평균 점수 ${Math.round(score)} · ${regimeLabel}`,
    summary:[metric("신호 점수",row.score),metric("RSI",row.rsi),metric("20일선 이격",row.ma20Gap,"%")].filter(Boolean).join(" · ") || "확인 가능한 규칙 기반 지표만 반영했습니다.",
    confirmations:confirmations.length?confirmations:["가격·거래량의 같은 방향 전환 확인"],risks:risks.length?risks:["단일 신호만으로 방향을 확정하지 않음"],opportunities,
    confidence:Math.max(45,Math.min(80,Math.round(50+Math.abs(score-50)/2))),horizon:"수일",model:"규칙 기반 대체 판단",scope,generatedAt:new Date().toISOString(),providerStatus:"fallback",providerMessage:reason};
}
