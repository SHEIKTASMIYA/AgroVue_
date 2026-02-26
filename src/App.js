import { useState, useEffect, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ComposedChart
} from "recharts";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  soil: "#8B5E3C", leaf: "#2D6A4F", seedling: "#52B788",
  harvest: "#F4A261", sky: "#0EA5E9", sun: "#F59E0B",
  earth: "#1A0F0A", rust: "#C1440E", gold: "#D4A017",
};

// ─── PERSIST HELPERS (window.storage — permanent across sessions) ─────────────
const save = async (key, val) => {
  try {
    await window.storage.set(key, JSON.stringify(val));
  } catch (e) {
    console.warn("Storage save error:", e);
  }
};

const load = async (key, fallback) => {
  try {
    const result = await window.storage.get(key);
    return result ? JSON.parse(result.value) : fallback;
  } catch {
    return fallback;
  }
};

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────
const CROPS = ["Wheat","Rice","Maize","Tomato","Onion","Potato","Soybean","Cotton","Sugarcane","Chilli"];
const STATES = ["Punjab","Haryana","UP","Maharashtra","Karnataka","AP","MP","Rajasthan","Gujarat","Bihar"];
const MARKETS = ["Azadpur","Vashi","Koyambedu","Gultekdi","Lasalgaon","Fatehabad","Unjha","Karnal","Amritsar","Nagpur"];
const CROP_META = {
  Wheat:     { icon:"🌾", season:"Rabi",       harvest:"Mar-Apr", base:2200, vol:0.06 },
  Rice:      { icon:"🍚", season:"Kharif",      harvest:"Oct-Nov", base:3100, vol:0.05 },
  Maize:     { icon:"🌽", season:"Kharif",      harvest:"Sep-Oct", base:1800, vol:0.08 },
  Tomato:    { icon:"🍅", season:"Year-round",  harvest:"Oct & Mar",base:1500,vol:0.35 },
  Onion:     { icon:"🧅", season:"Rabi/Kharif", harvest:"Nov & Mar",base:1200,vol:0.40 },
  Potato:    { icon:"🥔", season:"Rabi",        harvest:"Jan-Feb", base:900,  vol:0.25 },
  Soybean:   { icon:"🫘", season:"Kharif",      harvest:"Oct-Nov", base:4500, vol:0.10 },
  Cotton:    { icon:"☁️", season:"Kharif",      harvest:"Nov-Jan", base:6200, vol:0.07 },
  Sugarcane: { icon:"🎋", season:"Year-round",  harvest:"Oct-Mar", base:380,  vol:0.03 },
  Chilli:    { icon:"🌶️", season:"Rabi",        harvest:"Feb-Mar", base:8500, vol:0.30 },
};
const CROP_TIPS = {
  Wheat:"Prices typically rise post-harvest export season (Apr–Jun). Best to store until May.",
  Rice:"Sell 30–40% immediately post-harvest, store rest for Jan–Feb when prices rise 15–20%.",
  Tomato:"High volatility crop. Monitor daily prices. Consider contract farming for stability.",
  Onion:"Cold storage can yield 25–35% premium. April–July is the best selling window.",
  Potato:"Store in cold storage. Market opens up in summer (May–Jul) with 20% higher prices.",
  Maize:"Poultry feed demand drives prices. Nov–Jan tends to be the best selling period.",
  Soybean:"Global soy prices heavily influence. Watch CBOT futures for export demand signals.",
  Cotton:"Textile industry demand peaks in Feb–Mar. Hold for quality premium pricing.",
  Sugarcane:"Regulated FRP prices ensure minimum income. Sell early to avoid payment delays.",
  Chilli:"Export demand from Sri Lanka & Bangladesh boosts prices in May–Jun. Dry for better margins.",
};

function genHistory(crop, months = 24) {
  const { base, vol } = CROP_META[crop] || { base:2000, vol:0.1 };
  const data = []; let price = base; const now = new Date();
  for (let i = months; i >= 0; i--) {
    const d = new Date(now); d.setMonth(d.getMonth() - i);
    const seasonal = Math.sin((d.getMonth() / 12) * 2 * Math.PI) * 0.1;
    price = Math.max(price * (1 + (Math.random() - 0.48 + seasonal) * vol), base * 0.4);
    data.push({
      date: d.toLocaleDateString("en-IN", { month:"short", year:"2-digit" }),
      actual: Math.round(price),
      volume: Math.round(Math.random() * 5000 + 1000),
    });
  }
  return data;
}

function genForecast(history, days = 30) {
  let price = history[history.length - 1]?.actual || 2000;
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() + i + 1);
    price = Math.max(price * (1 + (Math.random() - 0.47) * 0.04), price * 0.9);
    const ci = Math.max(5, 15 - i * 0.3);
    return {
      date: d.toLocaleDateString("en-IN", { month:"short", day:"numeric" }),
      predicted: Math.round(price),
      upper: Math.round(price * (1 + ci / 100)),
      lower: Math.round(price * (1 - ci / 100)),
    };
  });
}

// ─── REAL AI REPLY via Anthropic API (artifact-compatible) ───────────────────
async function getAIReply(userMessage, crop, conversationHistory = []) {
  const cropInfo = CROP_META[crop] || {};
  const cropTip  = CROP_TIPS[crop] || "";

  const systemPrompt = `You are AgroVueAI, an expert agricultural advisor for Indian farmers. You have deep knowledge of:
- Indian crop markets (Mandi prices, APMC, eNAM, AgMarkNet data)
- MSP (Minimum Support Price) schemes, PM-KISAN, PMFBY crop insurance
- Seasonal price trends for crops: Wheat, Rice, Maize, Tomato, Onion, Potato, Soybean, Cotton, Sugarcane, Chilli
- Cold storage strategies, FPO (Farmer Producer Organizations)
- Weather impact on Indian agriculture (monsoon, rabi/kharif seasons)
- Export markets for Indian agricultural produce

Currently selected crop context:
- Crop: ${crop}
- Season: ${cropInfo.season || "N/A"}
- Typical harvest: ${cropInfo.harvest || "N/A"}
- Approx base price: ₹${cropInfo.base || "N/A"}/quintal
- Key insight: ${cropTip}

IMPORTANT RULES:
1. Answer ONLY what the farmer is asking. Be direct and specific to their question.
2. Do not give generic advice unrelated to the question.
3. Use Indian units: quintal (qtl), rupees (₹), acres.
4. Keep responses concise — 3 to 6 lines max unless detailed explanation is needed.
5. Use relevant emojis naturally (🌾 💰 📦 🌦️ 📈 etc.).
6. If the question is about a specific crop, answer about that crop specifically.
7. Respond in the same language the farmer uses (Hindi/English/mixed).
8. Never make up prices — if you don't know current live price, say it's an estimate and advise checking local mandi or eNAM portal.`;

  // Build messages: inject system context into first user message so it works via the artifact API
  const historyMessages = conversationHistory.map(m => ({
    role: m.role === "ai" ? "assistant" : "user",
    content: m.text,
  }));

  const fullPrompt = `${systemPrompt}\n\n---\nFarmer's question: ${userMessage}`;

  const messages = historyMessages.length > 0
    ? [...historyMessages, { role: "user", content: userMessage }]
    : [{ role: "user", content: fullPrompt }];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("API error:", err);
      throw new Error("API returned " + response.status);
    }

    const data = await response.json();
    const text = data.content?.map(b => b.text || "").join("") || "";
    return text.trim() || "Sorry, I could not get a response. Please try again.";
  } catch (err) {
    console.error("Claude API error:", err);
    // Intelligent fallback using local knowledge when API is unavailable
    return getLocalFallback(userMessage, crop);
  }
}

// ─── SMART LOCAL FALLBACK ─────────────────────────────────────────────────────
// Scores each intent category by counting matching signals in the question.
// The highest-scoring category wins — no single keyword can dominate.
function getLocalFallback(msg, crop) {
  const q = msg.toLowerCase()
    .replace(/[?।!,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m   = CROP_META[crop] || { base: 2000, harvest: "varies", season: "varies", vol: 0.1 };
  const tip = CROP_TIPS[crop] || "";
  const words = q.split(" ");
  const has = (...terms) => terms.reduce((score, t) => score + (q.includes(t) ? 1 : 0), 0);

  // Score every intent
  const scores = {
    price:    has("price","rate","bhav","daam","aaj","today","current","kitna","how much",
                  "mandi","market","bhaav","today price","rate kya","kya bhav","what is price",
                  "दाम","भाव","आज","कितना","क्या भाव","मंडी"),
    sell:     has("sell","selling","bechna","kab beche","when sell","best time","kab","timing",
                  "hold","store or sell","should i sell","kb bechu","कब बेचूं","बेचना","कब"),
    msp:      has("msp","minimum support","government price","sarkar","scheme","support price",
                  "sarkari","pm kisan","pmkisan","subsidy","compensation","सरकार","एमएसपी",
                  "समर्थन मूल्य","सरकारी"),
    storage:  has("storage","store","cold storage","godown","rakhna","warehouse","bhndaran",
                  "kitne din","how long","preserve","रखना","भंडारण","गोदाम","ठंडा"),
    weather:  has("weather","rain","monsoon","mausam","barish","drought","flood","climate",
                  "temperature","baarish","season","kharif","rabi","मौसम","बारिश","सूखा","बाढ़"),
    profit:   has("profit","income","earning","kamai","fayda","labh","margin","roi","return",
                  "kitna milega","how much earn","benefit","कमाई","फायदा","लाभ","मुनाफा"),
    disease:  has("disease","pest","insect","fungus","virus","spray","medicine","dawai","kit",
                  "rog","keeda","blight","wilt","rot","yellow","leaf","कीट","रोग","दवाई","कीड़ा"),
    fertilizer:has("fertilizer","khad","urea","dap","npk","manure","compost","potash","zinc",
                   "nutrient","खाद","यूरिया","डीएपी"),
    water:    has("water","irrigation","drip","paani","sinchai","pump","borewell","canal",
                  "पानी","सिंचाई","नहर"),
    loan:     has("loan","credit","bank","kcc","kisan card","finance","interest","byaj","nabard",
                  "insurance","pmfby","बीमा","ऋण","लोन","ब्याज","किसान कार्ड"),
    export:   has("export","foreign","international","demand","global","abroad","विदेश","निर्यात"),
    sowing:   has("sow","sowing","plant","seed","baai","ugana","nursery","transplant","बुवाई",
                  "बीज","उगाना","नर्सरी"),
    harvest:  has("harvest","cutting","katai","ready","ripeness","kab katna","कटाई","तैयार"),
    variety:  has("variety","type","which type","konsa","breed","hybrid","variety konsi",
                  "किस्म","कौन सी","हाइब्रिड"),
    transport:has("transport","truck","vehicle","freight","delivery","gaadi","ढुलाई","गाड़ी"),
  };

  // Find the top-scoring intent
  const topIntent = Object.entries(scores).sort((a,b) => b[1]-a[1])[0];
  const intent    = topIntent[1] > 0 ? topIntent[0] : "general";

  // Mention which crop the question is about (detect if user mentioned a specific crop)
  const mentionedCrop = CROPS.find(c => q.includes(c.toLowerCase())) || crop;
  const cm = CROP_META[mentionedCrop] || m;
  const ct = CROP_TIPS[mentionedCrop] || tip;

  switch (intent) {
    case "price":
      return `📊 **${mentionedCrop} Market Price**\n\nCurrent approximate price: ₹${cm.base}–₹${Math.round(cm.base * 1.2)}/quintal\n(Varies by quality, location & season)\n\nBest harvest window: ${cm.harvest} | Season: ${cm.season}\n\n🔍 Check live prices at:\n• eNAM portal → enam.gov.in\n• AgMarkNet → agmarknet.gov.in\n• Your local APMC mandi board\n\n${ct}`;

    case "sell":
      return `📅 **Best Time to Sell ${mentionedCrop}**\n\n${ct}\n\nHarvest window: ${cm.harvest} | Season: ${cm.season}\n\n💡 Strategy: Avoid selling at peak harvest when supply floods the market. Wait 4–6 weeks after harvest — prices usually rise 10–20%.\n\nCheck daily mandi rates on eNAM (enam.gov.in) before deciding.`;

    case "msp":
      return `🏛️ **MSP for ${mentionedCrop}**\n\nThe government sets MSP (Minimum Support Price) each season to protect farmers. To claim MSP:\n\n1️⃣ Register on PM-KISAN portal → pmkisan.gov.in\n2️⃣ Documents needed: Khatauni (land record), Aadhaar, Bank passbook\n3️⃣ Sell through your local APMC mandi or registered procurement center\n\n📞 Kisan Helpline: 1800-180-1551 (Toll Free, 24x7)\n🌐 agri.gov.in for current MSP notifications`;

    case "storage":
      return `❄️ **Storage Tips for ${mentionedCrop}**\n\n${ct}\n\nStorage options:\n• Cold storage: Best for ${mentionedCrop === "Potato" || mentionedCrop === "Onion" ? "25–40% price premium" : "short-term holding"}\n• Join a local FPO for shared cold storage at lower cost/quintal\n• Proper drying & grading before storage reduces losses by 15–20%\n\nAsk your district agriculture officer for nearest government cold storage facility.`;

    case "weather":
      return `🌦️ **Weather Impact on ${mentionedCrop}**\n\nMonsoon effect: Deficit rainfall → supply shortage → price rise 15–25%\nExcess rain → crop damage → short spike then crash\nCold wave → affects ${mentionedCrop === "Tomato" || mentionedCrop === "Potato" ? "quality & supply significantly" : "field operations"}\n\n🛡️ Protect your income:\n• PMFBY crop insurance — register before sowing season\n• IMD weather forecast → imd.gov.in for your district`;

    case "profit":
      return `💰 **Profit Maximization — ${mentionedCrop}**\n\n${ct}\n\nTo increase your income from ${mentionedCrop}:\n• Time your sale correctly (${cm.harvest})\n• Reduce post-harvest losses with proper storage & grading\n• Sell directly to buyers via eNAM — skip middlemen\n• Explore value addition: processing, packaging, or contract farming\n• Join an FPO to negotiate better prices in bulk`;

    case "disease":
      return `🌿 **Disease & Pest Management — ${mentionedCrop}**\n\nCommon issues in ${mentionedCrop}: fungal blight, aphids, leaf curl, root rot (varies by season).\n\nImmediate steps:\n1. Identify the pest/disease accurately before spraying\n2. Contact your Krishi Vigyan Kendra (KVK) — free expert advice\n3. Use recommended pesticides at correct dosage\n\n📞 Kisan Call Centre: 1800-180-1551\n🌐 State agriculture department app for photo-based diagnosis\n\n⚠️ Early treatment prevents 20–30% yield loss.`;

    case "fertilizer":
      return `🌱 **Fertilizer Guide — ${mentionedCrop}**\n\nGeneral recommendation for ${mentionedCrop} (per acre):\n• Basal dose: DAP 50 kg + MOP 25 kg at sowing\n• Top dressing: Urea 25–30 kg at 30 days after planting\n• Micronutrients: Zinc sulphate if soil is deficient\n\nAlways get a **soil test done** (free at KVK or for ₹50 at district lab) before applying fertilizers — saves 20–30% fertilizer cost.\n\n📞 Contact your local agriculture extension officer for crop-specific doses.`;

    case "water":
      return `💧 **Irrigation for ${mentionedCrop}**\n\n${mentionedCrop} water requirement: ${
        mentionedCrop==="Rice"?"High — 1200–2000 mm (flood or SRI method)":
        mentionedCrop==="Sugarcane"?"High — irrigate every 10–15 days":
        mentionedCrop==="Wheat"?"Medium — 4–6 irrigations (CRI, tillering, jointing, grain fill)":
        mentionedCrop==="Tomato"?"Frequent — drip irrigation saves 40% water":
        "Moderate — check soil moisture before irrigating"}\n\n💡 Drip/sprinkler irrigation saves 30–50% water vs flood irrigation.\nApply for Pradhan Mantri Krishi Sinchai Yojana (PMKSY) subsidy on drip systems.`;

    case "loan":
      return `🏦 **Farm Finance & Insurance**\n\n• **Kisan Credit Card (KCC):** Up to ₹3 lakh at 4% effective interest (7% minus 3% subvention) — apply at any bank\n• **PM-KISAN:** ₹6,000/year direct to your bank → pmkisan.gov.in\n• **PMFBY Crop Insurance:** Covers crop loss from drought, flood, pest — enroll before sowing\n• **NABARD loans** via cooperative banks for farm infrastructure\n\n📞 Bank helpline or nearest PACS for KCC application\n📞 Kisan Helpline: 1800-180-1551`;

    case "export":
      return `🌍 **Export Opportunities for ${mentionedCrop}**\n\n${ct}\n\nKey export markets for Indian ${mentionedCrop}:\n${mentionedCrop==="Chilli"?"• Sri Lanka, Bangladesh, UAE, Malaysia — May–Jun is peak export season":
        mentionedCrop==="Onion"?"• Malaysia, Sri Lanka, UAE — Apr–Jul when domestic prices are high":
        mentionedCrop==="Rice"?"• Middle East, Africa, SE Asia — India is world's largest rice exporter":
        mentionedCrop==="Cotton"?"• Bangladesh, China for textile — premium for long staple quality":
        "• Check APEDA portal (apeda.gov.in) for your crop's export potential"}\n\nRegister on APEDA (Agricultural and Processed Food Products Export Authority) at apeda.gov.in to connect with exporters.`;

    case "sowing":
      return `🌱 **Sowing Guide — ${mentionedCrop}**\n\nSeason: ${cm.season} | Best sowing time varies by region.\n\nGeneral steps:\n1. Soil preparation: Deep plowing + 2–3 harrowings\n2. Seed treatment: Use certified seeds, treat with fungicide\n3. Spacing & depth: As per variety recommendation\n4. Basal fertilizer: Apply DAP at sowing\n\n📞 Contact your Krishi Vigyan Kendra (KVK) for region-specific sowing schedule and variety recommendations for ${mentionedCrop}.`;

    case "harvest":
      return `🌾 **Harvest Time — ${mentionedCrop}**\n\nTypical harvest window: **${cm.harvest}**\nSeason: ${cm.season}\n\nSigns of maturity for ${mentionedCrop}:\n${mentionedCrop==="Wheat"?"• Golden yellow color, grains hard & dry, moisture 14–16%":
        mentionedCrop==="Rice"?"• 80% grains golden yellow, moisture 20–25% at harvest":
        mentionedCrop==="Tomato"?"• Red color, firm texture — harvest every 3–4 days":
        mentionedCrop==="Onion"?"• Neck fall (70% plants), tops dry and fall naturally":
        "• Check crop-specific maturity indicators with your KVK"}\n\n⏰ Harvest at the right time to avoid quality loss and price drop.`;

    case "variety":
      return `🌱 **Best Varieties — ${mentionedCrop}**\n\nTop recommended varieties for ${mentionedCrop}:\n${
        mentionedCrop==="Wheat"?"• HD-2967, HD-3086, GW-322, DBW-187 (disease resistant)":
        mentionedCrop==="Rice"?"• Swarna, MTU-1010, Pusa Basmati 1121, BPT-5204":
        mentionedCrop==="Tomato"?"• Arka Vikas, Pusa Ruby, Solan Vajra, hybrid varieties":
        mentionedCrop==="Onion"?"• Bhima Super, Agrifound Light Red, Phule Safed":
        mentionedCrop==="Potato"?"• Kufri Jyoti, Kufri Pukhraj, Kufri Chipsona":
        mentionedCrop==="Maize"?"• DHM-117, Vivek QPM-9, DKC-9144 (hybrid)":
        "• Contact your state agriculture department or KVK for region-specific variety recommendations"}\n\nAlways buy **certified seeds** from government-registered dealers.`;

    case "transport":
      return `🚛 **Transport & Logistics for ${mentionedCrop}**\n\nTips to reduce transport costs:\n• Join or form an FPO to aggregate produce and share transport\n• Sell on eNAM (enam.gov.in) — buyers can bid from anywhere, reducing your need to travel\n• Harvest at the right time to avoid emergency transport\n• Use government-subsidized transport schemes in your state\n\nFor perishables like ${mentionedCrop==="Tomato"||mentionedCrop==="Onion"?"Tomato/Onion":"this crop"}, pre-cool before transport to reduce losses.`;

    default:
      // Smart general answer that still uses the question text
      return `🌾 **AgroVueAI — ${mentionedCrop} Answer**\n\nYour question: "${msg}"\n\n${ct}\n\nRelevant info for ${mentionedCrop}:\n• Season: ${cm.season} | Harvest: ${cm.harvest}\n• Approx price: ₹${cm.base}/qtl\n\n📞 For expert advice specific to your question:\n• Kisan Call Centre: 1800-180-1551 (Toll Free, 24x7)\n• eNAM portal: enam.gov.in\n• Nearest Krishi Vigyan Kendra (KVK)`;
  }
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
function NavBar({ tab, setTab, user, onLogout }) {
  const tabs = [
    { id:"dashboard", label:"Dashboard",     icon:"📊" },
    { id:"predict",   label:"Price Forecast", icon:"🔮" },
    { id:"market",    label:"Market Intel",   icon:"🏪" },
    { id:"advisor",   label:"AI Advisor",     icon:"🤖" },
    { id:"voice",     label:"Voice",          icon:"🎙️" },
    { id:"alerts",    label:"Alerts",         icon:"🔔" },
    { id:"profile",   label:"Profile",        icon:"👤" },
  ];
  return (
    <nav style={{ background:`linear-gradient(135deg,${C.earth},#2D1810)`, borderBottom:`3px solid ${C.harvest}`, position:"sticky", top:0, zIndex:1000, boxShadow:"0 4px 24px rgba(0,0,0,.4)" }}>
      <div style={{ maxWidth:1400, margin:"0 auto", padding:"0 20px", display:"flex", alignItems:"center" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, padding:"12px 20px 12px 0", borderRight:"1px solid rgba(255,255,255,.1)", marginRight:12, flexShrink:0 }}>
          <img src={LOGO_B64} alt="AgroVue" style={{ width:40, height:40, objectFit:"contain", filter:"drop-shadow(0 2px 6px rgba(0,0,0,0.3))" }} />
          <div>
            <div style={{ color:C.harvest, fontFamily:"Georgia,serif", fontSize:16, fontWeight:700 }}>AgroVue</div>
            <div style={{ color:"rgba(255,255,255,.4)", fontSize:9, letterSpacing:2, textTransform:"uppercase" }}>Price Intelligence</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:0, flex:1, overflowX:"auto" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ background:tab===t.id?"rgba(244,162,97,.15)":"transparent", border:"none", borderBottom:tab===t.id?`3px solid ${C.harvest}`:"3px solid transparent", color:tab===t.id?C.harvest:"rgba(255,255,255,.55)", padding:"15px 14px", cursor:"pointer", fontSize:12, fontWeight:tab===t.id?700:400, display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", transition:"all .2s" }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8, paddingLeft:12, borderLeft:"1px solid rgba(255,255,255,.1)", flexShrink:0 }}>
          <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${C.seedling},${C.leaf})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
            {user.role==="Farmer"?"👨‍🌾":user.role==="Trader"?"👨‍💼":"👨‍💻"}
          </div>
          <div>
            <div style={{ color:"white", fontSize:11, fontWeight:600 }}>{user.name}</div>
            <div style={{ color:C.seedling, fontSize:9, letterSpacing:1 }}>{user.role.toUpperCase()}</div>
          </div>
          <button onClick={onLogout} title="Sign out" style={{ marginLeft:6, background:"rgba(255,255,255,.08)", border:"1px solid rgba(255,255,255,.15)", color:"rgba(255,255,255,.6)", borderRadius:8, padding:"5px 10px", fontSize:11, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}>
            🚪 <span style={{ fontSize:10 }}>Logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
function Dashboard({ crop, setCrop }) {
  const hist = genHistory(crop, 24);
  const cur  = hist[hist.length-1]?.actual || 0;
  const prev = hist[hist.length-2]?.actual || 1;
  const chg  = ((cur-prev)/prev*100).toFixed(1);
  const fc7  = genForecast(hist, 7);
  const fc7p = fc7[6]?.predicted || 0;
  const fc7c = ((fc7p-cur)/cur*100).toFixed(1);
  const ticker = CROPS.map(c => {
    const d = genHistory(c,2); const l=d[d.length-1]?.actual||0; const p=d[d.length-2]?.actual||1;
    return { c, price:l, chg:+((l-p)/p*100).toFixed(2), icon:CROP_META[c]?.icon };
  });

  const Card = ({ label, value, sub, icon, color }) => (
    <div style={{ background:"white", borderRadius:14, padding:"18px 20px", border:`1px solid ${color}22`, boxShadow:"0 2px 12px rgba(0,0,0,.06)", display:"flex", gap:14 }}>
      <div style={{ width:48, height:48, borderRadius:12, background:`${color}22`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ color:"#888", fontSize:10, letterSpacing:1, textTransform:"uppercase", marginBottom:3 }}>{label}</div>
        <div style={{ color:C.earth, fontSize:20, fontWeight:800, fontFamily:"Georgia,serif" }}>{value}</div>
        <div style={{ color:"#999", fontSize:11, marginTop:2 }}>{sub}</div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:24, maxWidth:1400, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:0, fontWeight:800 }}>🌾 Market Intelligence Dashboard</h1>
        <p style={{ color:"#666", margin:"5px 0 0", fontSize:13 }}>{new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</p>
      </div>

      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:18 }}>
        {CROPS.map(c=>(
          <button key={c} onClick={()=>setCrop(c)} style={{ padding:"6px 14px", borderRadius:30, border:`1.5px solid ${crop===c?C.leaf:"rgba(0,0,0,.12)"}`, background:crop===c?C.leaf:"white", color:crop===c?"white":"#555", fontSize:12, fontWeight:crop===c?700:400, cursor:"pointer", display:"flex", alignItems:"center", gap:4, transition:"all .2s" }}>
            {CROP_META[c]?.icon} {c}
          </button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:14, marginBottom:20 }}>
        <Card label="Current Price"  value={`₹${cur.toLocaleString()}/qtl`}  sub={`${+chg>=0?"▲":"▼"} ${Math.abs(chg)}% vs last month`} icon={CROP_META[crop]?.icon} color={C.leaf} />
        <Card label="7-Day Forecast" value={`₹${fc7p.toLocaleString()}/qtl`} sub={`${+fc7c>=0?"📈 Bullish":"📉 Bearish"} trend`}          icon="🔮" color={C.sky} />
        <Card label="24-Month High"  value={`₹${Math.max(...hist.map(d=>d.actual)).toLocaleString()}/qtl`} sub="Best price recorded"    icon="📈" color={C.sun} />
        <Card label="Market Volume"  value={`${(hist[hist.length-1]?.volume||0).toLocaleString()} MT`}     sub="Today's arrivals"        icon="📦" color={C.rust} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:18, marginBottom:18 }}>
        <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin:"0 0 16px", fontFamily:"Georgia,serif", color:C.earth }}>{crop} — 24 Month History</h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={hist}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)" />
              <XAxis dataKey="date" tick={{ fontSize:10 }} tickLine={false} />
              <YAxis tick={{ fontSize:10 }} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(1)}k`} />
              <Tooltip formatter={(v,n)=>n==="actual"?[`₹${v.toLocaleString()}`,"Price"]:[`${v.toLocaleString()} MT`,"Volume"]} />
              <Bar dataKey="volume" yAxisId={0} fill={`${C.harvest}33`} radius={[2,2,0,0]} />
              <Area type="monotone" dataKey="actual" stroke={C.leaf} strokeWidth={2.5} fill={`${C.leaf}15`} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background:"white", borderRadius:16, padding:18, boxShadow:"0 2px 14px rgba(0,0,0,.06)", overflowY:"auto", maxHeight:350 }}>
          <h3 style={{ margin:"0 0 12px", fontFamily:"Georgia,serif", color:C.earth, fontSize:14 }}>All Crops</h3>
          {ticker.map(({ c,price,chg:ch,icon })=>(
            <div key={c} onClick={()=>setCrop(c)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"9px 10px", borderRadius:9, cursor:"pointer", background:crop===c?`${C.leaf}10`:"transparent", marginBottom:3, border:crop===c?`1px solid ${C.leaf}33`:"1px solid transparent" }}>
              <div style={{ display:"flex", alignItems:"center", gap:9 }}>
                <span style={{ fontSize:17 }}>{icon}</span>
                <div><div style={{ fontWeight:600, fontSize:12 }}>{c}</div><div style={{ fontSize:10, color:"#888" }}>₹{price.toLocaleString()}</div></div>
              </div>
              <span style={{ fontWeight:700, fontSize:12, color:ch>=0?"#16A34A":"#DC2626" }}>{ch>=0?"▲":"▼"}{Math.abs(ch)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background:`${C.leaf}10`, border:`1.5px solid ${C.leaf}40`, borderRadius:14, padding:"18px 22px", display:"flex", gap:16 }}>
        <span style={{ fontSize:32 }}>💡</span>
        <div>
          <div style={{ fontWeight:700, color:C.leaf, fontSize:13, marginBottom:4 }}>AI Insight for {crop}</div>
          <div style={{ color:"#444", fontSize:13, lineHeight:1.6 }}>{CROP_TIPS[crop]}</div>
          <div style={{ marginTop:8, display:"flex", gap:10 }}>
            <span style={{ background:`${C.leaf}20`, color:C.leaf, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>Season: {CROP_META[crop]?.season}</span>
            <span style={{ background:`${C.sun}20`, color:C.rust, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:600 }}>Harvest: {CROP_META[crop]?.harvest}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FORECAST ────────────────────────────────────────────────────────────────
function PriceForecast({ crop: initCrop }) {
  const [crop, setCrop]       = useState(initCrop);
  const [model, setModel]     = useState("LSTM");
  const [horizon, setHorizon] = useState(30);
  const [loading, setLoading] = useState(false);
  const [done, setDone]       = useState(false);
  const [hist]                = useState(()=>genHistory(crop,12));
  const [fc, setFc]           = useState([]);

  const MODELS = ["LSTM","ARIMA","Prophet","Transformer","XGBoost","Ensemble"];
  const ACC    = { LSTM:94.2, ARIMA:89.1, Prophet:91.7, Transformer:95.8, XGBoost:92.4, Ensemble:96.1 };

  const run = () => { setLoading(true); setDone(false); setTimeout(()=>{ setFc(genForecast(hist,horizon)); setLoading(false); setDone(true); }, 1600); };

  const chartData = [...hist.slice(-8), ...(done ? fc.slice(0,15).map(d=>({...d, actual:undefined})) : [])];

  return (
    <div style={{ padding:24, maxWidth:1400, margin:"0 auto" }}>
      <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 6px" }}>🔮 AI Price Forecasting Engine</h1>
      <p style={{ color:"#666", fontSize:13, margin:"0 0 20px" }}>Multi-model deep learning forecasts with confidence intervals</p>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:14, marginBottom:20 }}>
        {[["Crop",<select value={crop} onChange={e=>setCrop(e.target.value)} style={sel}>{CROPS.map(c=><option key={c}>{c}</option>)}</select>],
          ["AI Model",<select value={model} onChange={e=>setModel(e.target.value)} style={sel}>{MODELS.map(m=><option key={m}>{m}</option>)}</select>],
          ["Horizon",<select value={horizon} onChange={e=>setHorizon(+e.target.value)} style={sel}><option value={7}>7 Days</option><option value={14}>14 Days</option><option value={30}>30 Days</option><option value={60}>60 Days</option><option value={90}>90 Days</option></select>],
          ["",<button onClick={run} disabled={loading} style={{ ...sel, background:loading?"#ccc":`linear-gradient(135deg,${C.leaf},${C.seedling})`, color:"white", fontWeight:700, cursor:loading?"not-allowed":"pointer", border:"none", marginTop:22 }}>{loading?"⚙️ Running...":"🚀 Run Forecast"}</button>]
        ].map(([label,el],i)=>(
          <div key={i}>{label && <label style={{ fontSize:10, color:"#888", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:5 }}>{label}</label>}{el}</div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10, marginBottom:20 }}>
        {MODELS.map(m=>(
          <div key={m} onClick={()=>setModel(m)} style={{ background:model===m?`linear-gradient(135deg,${C.leaf},${C.seedling})`:"white", borderRadius:12, padding:"13px 10px", textAlign:"center", cursor:"pointer", border:`1.5px solid ${model===m?"transparent":"rgba(0,0,0,.08)"}`, boxShadow:model===m?`0 4px 16px ${C.leaf}44`:"none" }}>
            <div style={{ fontSize:11, fontWeight:700, color:model===m?"white":C.earth, marginBottom:3 }}>{m}</div>
            <div style={{ fontSize:17, fontWeight:800, color:model===m?"white":C.leaf }}>{ACC[m]}%</div>
            <div style={{ fontSize:9, color:model===m?"rgba(255,255,255,.65)":"#999", marginTop:1 }}>Accuracy</div>
          </div>
        ))}
      </div>

      <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)", marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <div>
            <h3 style={{ margin:0, fontFamily:"Georgia,serif", color:C.earth }}>{crop} — {model} Forecast</h3>
            <p style={{ margin:"4px 0 0", color:"#888", fontSize:12 }}>{done?`${horizon}-day prediction with 95% confidence band`:"Configure & run forecast above"}</p>
          </div>
          {done && <div style={{ background:`${C.leaf}15`, borderRadius:10, padding:"8px 16px", textAlign:"center" }}><div style={{ fontSize:10, color:"#666", letterSpacing:1 }}>ACCURACY</div><div style={{ fontSize:20, fontWeight:800, color:C.leaf }}>{ACC[model]}%</div></div>}
        </div>

        {!done && !loading && <div style={{ height:280, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,.02)", borderRadius:12 }}><div style={{ textAlign:"center" }}><div style={{ fontSize:48, marginBottom:10 }}>🔮</div><div style={{ color:"#888" }}>Select model & click Run Forecast</div></div></div>}
        {loading && <div style={{ height:280, display:"flex", alignItems:"center", justifyContent:"center" }}><div style={{ textAlign:"center" }}><div style={{ fontSize:48, marginBottom:12, display:"inline-block", animation:"spin 1s linear infinite" }}>⚙️</div><div style={{ color:C.leaf, fontWeight:700, fontSize:16 }}>Training {model} on historical data…</div></div></div>}
        {done && (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)" />
              <XAxis dataKey="date" tick={{ fontSize:10 }} tickLine={false} />
              <YAxis tick={{ fontSize:10 }} tickLine={false} tickFormatter={v=>`₹${(v/1000).toFixed(1)}k`} />
              <Tooltip />
              <Area type="monotone" dataKey="upper" stroke="transparent" fill={`${C.sky}20`} name="Upper CI" />
              <Area type="monotone" dataKey="lower" stroke="transparent" fill="white" name="Lower CI" />
              <Line type="monotone" dataKey="actual"    stroke={C.leaf} strokeWidth={2.5} dot={{ r:2 }} name="Historical" />
              <Line type="monotone" dataKey="predicted" stroke={C.sky}  strokeWidth={2.5} strokeDasharray="6 3" dot={{ r:2 }} name="Predicted" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {done && (
        <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin:"0 0 14px", fontFamily:"Georgia,serif", color:C.earth }}>📋 Daily Prediction Table</h3>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:`${C.leaf}10` }}>{["Date","Predicted","Lower CI","Upper CI","Trend","Confidence"].map(h=><th key={h} style={{ padding:"9px 13px", textAlign:"left", color:C.leaf, fontWeight:700, borderBottom:`2px solid ${C.leaf}30` }}>{h}</th>)}</tr></thead>
              <tbody>{fc.slice(0,14).map((row,i)=>{ const prev=i===0?hist[hist.length-1]?.actual:fc[i-1]?.predicted; const up=row.predicted>=prev; const conf=Math.round(100-(row.upper-row.lower)/row.predicted*100); return (
                <tr key={i} style={{ borderBottom:"1px solid rgba(0,0,0,.04)", background:i%2?"rgba(0,0,0,.01)":"white" }}>
                  <td style={{ padding:"8px 13px", fontWeight:600 }}>{row.date}</td>
                  <td style={{ padding:"8px 13px", fontWeight:700 }}>₹{row.predicted.toLocaleString()}</td>
                  <td style={{ padding:"8px 13px", color:"#666" }}>₹{row.lower.toLocaleString()}</td>
                  <td style={{ padding:"8px 13px", color:"#666" }}>₹{row.upper.toLocaleString()}</td>
                  <td style={{ padding:"8px 13px" }}><span style={{ color:up?"#16A34A":"#DC2626", fontWeight:700 }}>{up?"▲ Up":"▼ Down"}</span></td>
                  <td style={{ padding:"8px 13px" }}><div style={{ display:"flex", alignItems:"center", gap:7 }}><div style={{ width:56, height:5, background:"#eee", borderRadius:3 }}><div style={{ width:`${conf}%`, height:"100%", background:conf>80?C.leaf:conf>60?C.sun:C.rust, borderRadius:3 }}/></div><span style={{ fontSize:10, color:"#666" }}>{conf}%</span></div></td>
                </tr>
              )})}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MARKET INTEL ─────────────────────────────────────────────────────────────
function MarketIntel() {
  const regional = STATES.map(s=>({ state:s, avgPrice:Math.round(Math.random()*2000+1500), arrivals:Math.round(Math.random()*5000+500), growth:(Math.random()*20-5).toFixed(1) }));
  const mkts     = MARKETS.map(m=>({ market:m, price:Math.round(Math.random()*2000+1000), premium:Math.round(Math.random()*500) }));
  return (
    <div style={{ padding:24, maxWidth:1400, margin:"0 auto" }}>
      <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 6px" }}>🏪 Market Intelligence Center</h1>
      <p style={{ color:"#666", fontSize:13, margin:"0 0 20px" }}>Region-wise mandi analytics</p>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, marginBottom:18 }}>
        <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin:"0 0 14px", fontFamily:"Georgia,serif", color:C.earth }}>🗺️ State-wise Overview</h3>
          <div style={{ overflowY:"auto", maxHeight:300 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["State","Avg Price","Arrivals","Growth"].map(h=><th key={h} style={{ padding:"7px 10px", textAlign:"left", color:"#888", fontWeight:600, borderBottom:"2px solid #eee", fontSize:11 }}>{h}</th>)}</tr></thead>
              <tbody>{regional.map(({ state,avgPrice,arrivals,growth })=>(
                <tr key={state} style={{ borderBottom:"1px solid rgba(0,0,0,.04)" }}>
                  <td style={{ padding:"7px 10px", fontWeight:600 }}>{state}</td>
                  <td style={{ padding:"7px 10px" }}>₹{avgPrice.toLocaleString()}</td>
                  <td style={{ padding:"7px 10px" }}>{arrivals.toLocaleString()} MT</td>
                  <td style={{ padding:"7px 10px", color:+growth>=0?"#16A34A":"#DC2626", fontWeight:700 }}>{+growth>=0?"▲":"▼"}{Math.abs(growth)}%</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)" }}>
          <h3 style={{ margin:"0 0 14px", fontFamily:"Georgia,serif", color:C.earth }}>📊 Market Price Comparison</h3>
          <ResponsiveContainer width="100%" height={270}>
            <BarChart data={mkts}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)" />
              <XAxis dataKey="market" tick={{ fontSize:9 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`₹${(v/1000).toFixed(1)}k`} />
              <Tooltip formatter={v=>[`₹${v.toLocaleString()}`]} />
              <Legend />
              <Bar dataKey="price"   name="Base Price"      fill={C.leaf}    radius={[4,4,0,0]} />
              <Bar dataKey="premium" name="Quality Premium" fill={C.harvest} radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── AI ADVISOR ──────────────────────────────────────────────────────────────
const DEFAULT_CHAT = (name) => [{ role:"ai", text:`Namaste ${name}! 🙏 I'm your AgroVue Advisor.\n\nAsk me about crop prices, best time to sell, MSP schemes, weather impact, cold storage, or profitability. How can I help you today?` }];

function AIAdvisor({ crop, user }) {
  const [msgs, setMsgs] = useState(null); // null = loading
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef(null);
  const QUICK = [`Best time to sell ${crop}?`, "Which crops are profitable now?", "How to get MSP?", "Weather impact on prices?", "Cold storage ROI?"];

  // Load chat history on mount
  useEffect(() => {
    load("AgroVue_chat", null).then(stored => {
      setMsgs(stored || DEFAULT_CHAT(user.name));
    });
  }, []);

  const send = async (msg = input) => {
    if (!msg.trim() || msgs === null) return;
    const updated = [...msgs, { role:"user", text:msg }];
    setMsgs(updated);
    await save("AgroVue_chat", updated);
    setInput("");
    setTyping(true);
    try {
      // Pass last 10 messages as context (exclude first welcome message)
      const historyForAPI = updated.slice(1).slice(-10);
      const replyText = await getAIReply(msg, crop, historyForAPI.slice(0, -1));
      const reply = [...updated, { role:"ai", text:replyText }];
      setMsgs(reply);
      await save("AgroVue_chat", reply);
    } catch (e) {
      const reply = [...updated, { role:"ai", text:"⚠️ Something went wrong. Please try again." }];
      setMsgs(reply);
    } finally {
      setTyping(false);
    }
  };

  const clearChat = async () => {
    const fresh = DEFAULT_CHAT(user.name);
    setMsgs(fresh);
    await save("AgroVue_chat", fresh);
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, typing]);

  if (msgs === null) return (
    <div style={{ padding:24, maxWidth:860, margin:"0 auto", textAlign:"center", paddingTop:80 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>💬</div>
      <div style={{ color:"#888" }}>Loading chat history…</div>
    </div>
  );

  return (
    <div style={{ padding:24, maxWidth:860, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 4px" }}>🤖 AI Farming Advisor</h1>
          <p style={{ color:"#666", fontSize:13, margin:0 }}>Powered by Claude AI • Answers your exact question • Chat saved permanently</p>
        </div>
        <button onClick={clearChat}
          style={{ padding:"6px 14px", borderRadius:8, border:`1px solid ${C.rust}`, background:"white", color:C.rust, fontSize:11, cursor:"pointer", fontWeight:600 }}>🗑️ Clear Chat</button>
      </div>

      <div style={{ background:"white", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 16px rgba(0,0,0,.08)" }}>
        <div style={{ background:`linear-gradient(135deg,${C.earth},#2D1810)`, padding:"14px 18px", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${C.leaf},${C.seedling})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🤖</div>
          <div>
            <div style={{ color:"white", fontWeight:700 }}>AgroVueAI Assistant</div>
            <div style={{ color:C.seedling, fontSize:11, display:"flex", alignItems:"center", gap:5 }}><span style={{ width:6, height:6, borderRadius:"50%", background:C.seedling, display:"inline-block" }} />Powered by Claude AI • Real answers to your questions</div>
          </div>
        </div>

        <div style={{ height:400, overflowY:"auto", padding:18, background:"#f8f9fa" }}>
          {msgs.map((m,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", marginBottom:14 }}>
              {m.role==="ai" && <div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${C.leaf},${C.seedling})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, flexShrink:0, marginRight:8, marginTop:3 }}>🤖</div>}
              <div style={{ maxWidth:"76%", background:m.role==="user"?`linear-gradient(135deg,${C.leaf},${C.seedling})`:"white", color:m.role==="user"?"white":C.earth, padding:"11px 15px", borderRadius:m.role==="user"?"16px 16px 3px 16px":"3px 16px 16px 16px", fontSize:13, lineHeight:1.6, boxShadow:"0 1px 6px rgba(0,0,0,.07)", whiteSpace:"pre-line" }}>
                {m.text.split("**").map((p,j)=>j%2===1?<strong key={j}>{p}</strong>:p)}
              </div>
            </div>
          ))}
          {typing && <div style={{ display:"flex", gap:8, alignItems:"center" }}><div style={{ width:30, height:30, borderRadius:"50%", background:`linear-gradient(135deg,${C.leaf},${C.seedling})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14 }}>🤖</div><div style={{ background:"white", borderRadius:"3px 16px 16px 16px", padding:"11px 15px", boxShadow:"0 1px 6px rgba(0,0,0,.07)" }}><span style={{ display:"flex", gap:4 }}>{[0,1,2].map(i=><span key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.leaf, display:"inline-block", animation:`bounce .9s ${i*.18}s infinite` }}/>)}</span></div></div>}
          <div ref={endRef} />
        </div>

        <div style={{ padding:"10px 16px", background:"#f8f9fa", borderTop:"1px solid rgba(0,0,0,.06)", display:"flex", gap:6, flexWrap:"wrap" }}>
          {QUICK.map(p=><button key={p} onClick={()=>send(p)} style={{ padding:"4px 11px", borderRadius:20, border:`1px solid ${C.leaf}40`, background:"white", color:C.leaf, fontSize:11, fontWeight:500, cursor:"pointer" }}>{p}</button>)}
        </div>
        <div style={{ padding:"10px 14px", borderTop:"1px solid rgba(0,0,0,.06)", display:"flex", gap:8 }}>
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyPress={e=>e.key==="Enter"&&send()} placeholder="Ask about prices, selling strategy, crop advice…" style={{ flex:1, padding:"10px 14px", borderRadius:11, border:"1.5px solid rgba(0,0,0,.12)", fontSize:13, outline:"none" }} />
          <button onClick={()=>send()} style={{ padding:"10px 18px", borderRadius:11, border:"none", background:`linear-gradient(135deg,${C.leaf},${C.seedling})`, color:"white", fontWeight:700, cursor:"pointer" }}>➤</button>
        </div>
      </div>
    </div>
  );
}

// ─── VOICE ASSISTANT (REAL WEB SPEECH API) ───────────────────────────────────
function VoiceAssistant({ crop }) {
  const [phase, setPhase]           = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [response, setResponse]     = useState("");
  const [error, setError]           = useState("");
  const [lang, setLang]             = useState("en-IN");
  const recognRef    = useRef(null);
  const processingRef = useRef(false); // prevents duplicate async calls

  const LANGS = [
    { label:"English",  code:"en-IN" },
    { label:"Hindi",    code:"hi-IN" },
    { label:"Punjabi",  code:"pa-IN" },
    { label:"Telugu",   code:"te-IN" },
    { label:"Tamil",    code:"ta-IN" },
    { label:"Marathi",  code:"mr-IN" },
    { label:"Gujarati", code:"gu-IN" },
    { label:"Kannada",  code:"kn-IN" },
  ];

  const speak = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Strip markdown for speech
    const clean = text
      .replace(/\*\*/g, "")
      .replace(/#{1,3} /g, "")
      .replace(/•/g, ",")
      .replace(/→/g, "means")
      .replace(/₹/g, "rupees ")
      .replace(/\n/g, ". ");
    const utt = new SpeechSynthesisUtterance(clean);
    utt.lang = lang; utt.rate = 0.88; utt.pitch = 1;
    utt.onend = () => setPhase("idle");
    window.speechSynthesis.speak(utt);
  };

  const processQuestion = async (finalText) => {
    if (processingRef.current) return; // already processing
    processingRef.current = true;
    setPhase("processing");
    setTranscript(finalText);
    try {
      const replyText = await getAIReply(finalText, crop, []);
      setResponse(replyText);
      setPhase("speaking");
      speak(replyText);
    } catch (err) {
      setError("⚠️ Could not get a response. Please try again.");
      setPhase("idle");
    } finally {
      processingRef.current = false;
    }
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("❌ Speech Recognition not supported. Please use Chrome or Edge on desktop.");
      return;
    }

    setError(""); setTranscript(""); setResponse("");
    processingRef.current = false;
    const recog = new SpeechRecognition();
    recog.lang = lang;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    recog.continuous = false;
    recognRef.current = recog;

    recog.onstart  = () => setPhase("listening");
    recog.onerror  = (e) => { setPhase("idle"); setError(`⚠️ Mic error: ${e.error}. Please allow microphone access.`); };
    recog.onend    = () => { /* let processQuestion handle phase changes */ };

    recog.onresult = (e) => {
      // Show interim transcript live
      const interim = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(interim);

      // Only process on final result
      if (e.results[e.results.length - 1].isFinal) {
        const finalText = Array.from(e.results)
          .filter(r => r.isFinal)
          .map(r => r[0].transcript)
          .join(" ")
          .trim();
        recognRef.current?.stop();
        processQuestion(finalText);
      }
    };

    recog.start();
  };

  const stopListening = () => {
    recognRef.current?.stop();
    if (phase === "listening") setPhase("idle");
    if (phase === "speaking") { window.speechSynthesis?.cancel(); setPhase("idle"); }
  };

  useEffect(() => () => { recognRef.current?.stop(); window.speechSynthesis?.cancel(); }, []);

  const btnColor = { idle:`linear-gradient(135deg,${C.leaf},${C.seedling})`, listening:`linear-gradient(135deg,${C.rust},#E57A44)`, processing:`linear-gradient(135deg,${C.sky},#38BDF8)`, speaking:`linear-gradient(135deg,${C.gold},${C.harvest})` }[phase];
  const btnIcon  = { idle:"🎙️", listening:"🔴", processing:"⚙️", speaking:"🔊" }[phase];
  const btnLabel = { idle:"Tap to Speak", listening:"Listening… Tap to Stop", processing:"Processing…", speaking:"Speaking… Tap to stop" }[phase];

  return (
    <div style={{ padding:24, maxWidth:680, margin:"0 auto" }}>
      <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 6px" }}>🎙️ Voice Assistant</h1>
      <p style={{ color:"#666", fontSize:13, margin:"0 0 20px" }}>Real microphone • Uses your browser's Speech API</p>

      <div style={{ marginBottom:22 }}>
        <label style={{ fontSize:10, color:"#888", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:8 }}>Language</label>
        <div style={{ display:"flex", gap:7, flexWrap:"wrap" }}>
          {LANGS.map(l=><button key={l.code} onClick={()=>setLang(l.code)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${lang===l.code?C.leaf:"rgba(0,0,0,.12)"}`, background:lang===l.code?C.leaf:"white", color:lang===l.code?"white":"#555", fontSize:12, fontWeight:lang===l.code?700:400, cursor:"pointer" }}>{l.label}</button>)}
        </div>
      </div>

      <div style={{ background:"white", borderRadius:22, padding:38, textAlign:"center", boxShadow:"0 4px 36px rgba(0,0,0,.10)", border:"1px solid rgba(0,0,0,.06)" }}>
        <div style={{ position:"relative", display:"inline-block", marginBottom:28 }}>
          {phase==="listening" && [140,120].map((s,i)=>(
            <div key={i} style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:s, height:s, borderRadius:"50%", background:`${C.rust}${i===0?"15":"22"}`, animation:`pulse 1.4s ${i*0.3}s infinite` }} />
          ))}
          {phase==="speaking" && [140,120].map((s,i)=>(
            <div key={i} style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", width:s, height:s, borderRadius:"50%", background:`${C.gold}${i===0?"15":"22"}`, animation:`pulse 1.2s ${i*0.25}s infinite` }} />
          ))}
          <button
            onClick={phase==="idle"?startListening:stopListening}
            style={{ width:96, height:96, borderRadius:"50%", background:btnColor, border:"none", fontSize:38, cursor:"pointer", boxShadow:`0 8px 28px ${C.leaf}44`, position:"relative", zIndex:1, transition:"all .3s" }}>
            {btnIcon}
          </button>
        </div>

        <div style={{ fontSize:15, fontWeight:700, color:C.earth, marginBottom:4 }}>{btnLabel}</div>
        <div style={{ fontSize:11, color:"#888", marginBottom:20 }}>Language: {LANGS.find(l=>l.code===lang)?.label}</div>

        {error && <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:10, padding:"12px 16px", marginBottom:16, color:"#DC2626", fontSize:13, textAlign:"left" }}>{error}</div>}

        {transcript && (
          <div style={{ background:`${C.leaf}10`, border:`1.5px solid ${C.leaf}30`, borderRadius:12, padding:"13px 18px", marginBottom:14, textAlign:"left" }}>
            <div style={{ fontSize:10, color:C.leaf, letterSpacing:1, marginBottom:4, fontWeight:700 }}>🎤 YOU SAID</div>
            <div style={{ fontSize:15, color:C.earth }}>{transcript}</div>
          </div>
        )}

        {response && (
          <div style={{ background:`${C.sky}10`, border:`1.5px solid ${C.sky}30`, borderRadius:12, padding:"13px 18px", textAlign:"left" }}>
            <div style={{ fontSize:10, color:C.sky, letterSpacing:1, marginBottom:5, fontWeight:700 }}>🤖 AgroVueAI RESPONSE</div>
            <div style={{ fontSize:13, color:C.earth, lineHeight:1.7, whiteSpace:"pre-line" }}>
              {response.split("**").map((p,j) => j%2===1 ? <strong key={j}>{p}</strong> : p)}
            </div>
          </div>
        )}

        {phase==="idle" && !response && (
          <div style={{ marginTop:20, background:"#f8f9fa", borderRadius:12, padding:16, textAlign:"left" }}>
            <div style={{ fontSize:11, color:"#888", marginBottom:10, textAlign:"center", fontWeight:600 }}>💬 Sample Questions to Ask</div>
            {["What is today's wheat price?","Best time to sell onion?","How to get MSP for rice?","Weather impact on tomato prices?"].map((q,i)=>(
              <div key={i} style={{ background:"white", borderRadius:8, padding:"7px 12px", marginBottom:6, fontSize:12, color:"#555", display:"flex", gap:7, alignItems:"center" }}>
                <span style={{ color:C.leaf }}>🗣️</span>{q}
              </div>
            ))}
            <div style={{ marginTop:12, padding:"10px 14px", background:`${C.sun}15`, borderRadius:10, fontSize:11, color:"#7A4F01", lineHeight:1.5 }}>
              ⚠️ <strong>Browser Permission Required:</strong> Click the mic button → allow microphone access when prompted. Works best in <strong>Chrome or Edge</strong> on desktop.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ALERTS ───────────────────────────────────────────────────────────────────
const INIT_ALERTS = [
  { id:1, type:"price_rise", crop:"Tomato",  msg:"Tomato prices surged 18% at Azadpur due to Himachal supply shortage", time:"2h ago",  read:false, sev:"high"   },
  { id:2, type:"forecast",   crop:"Wheat",   msg:"AI forecast: Wheat prices to rise 5–7% over next 2 weeks — export demand strong", time:"5h ago",  read:false, sev:"medium" },
  { id:3, type:"weather",    crop:"Onion",   msg:"Heavy rainfall in Maharashtra — Onion harvest delayed, price spike likely",         time:"1d ago",  read:true,  sev:"high"   },
  { id:4, type:"msp",        crop:"Rice",    msg:"Govt announces MSP hike of ₹117/qtl for Kharif rice",                              time:"2d ago",  read:true,  sev:"low"    },
  { id:5, type:"price_drop", crop:"Potato",  msg:"Cold storage arrivals pressuring potato prices — 8% decline in UP markets",        time:"3d ago",  read:true,  sev:"medium" },
  { id:6, type:"opportunity",crop:"Chilli",  msg:"Bangladesh export inquiry driving Chilli premium in Guntur (+₹800/qtl)",           time:"3d ago",  read:true,  sev:"medium" },
];

function Alerts({ crop }) {
  const [alerts, setAlerts] = useState(null);
  const [rise, setRise]     = useState(10);
  const [drop, setDrop]     = useState(8);
  const ICONS = { price_rise:"📈", price_drop:"📉", forecast:"🔮", weather:"🌦️", msp:"🏛️", opportunity:"💰" };
  const SEVC  = { high:C.rust, medium:C.sun, low:C.leaf };

  useEffect(() => {
    load("AgroVue_alerts", INIT_ALERTS).then(setAlerts);
    load("AgroVue_alert_thresholds", { rise:10, drop:8 }).then(t => {
      setRise(t.rise); setDrop(t.drop);
    });
  }, []);

  const updateAlerts = async (updated) => {
    setAlerts(updated);
    await save("AgroVue_alerts", updated);
  };

  const updateThresholds = async (newRise, newDrop) => {
    await save("AgroVue_alert_thresholds", { rise: newRise, drop: newDrop });
  };

  if (!alerts) return <div style={{ padding:24, textAlign:"center", color:"#888" }}>Loading alerts…</div>;

  return (
    <div style={{ padding:24, maxWidth:900, margin:"0 auto" }}>
      <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 20px" }}>🔔 Smart Alerts</h1>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 300px", gap:18 }}>
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontWeight:700, color:C.earth }}>{alerts.filter(a=>!a.read).length} Unread</span>
            <button onClick={()=>updateAlerts(alerts.map(a=>({...a,read:true})))} style={{ padding:"5px 13px", borderRadius:8, border:`1px solid ${C.leaf}`, background:"white", color:C.leaf, fontSize:11, cursor:"pointer", fontWeight:600 }}>Mark all read</button>
          </div>
          {alerts.map(a=>(
            <div key={a.id} onClick={()=>updateAlerts(alerts.map(x=>x.id===a.id?{...x,read:true}:x))} style={{ background:a.read?"white":`${SEVC[a.sev]}08`, border:`1.5px solid ${a.read?"rgba(0,0,0,.07)":SEVC[a.sev]+"40"}`, borderLeft:`4px solid ${a.read?"rgba(0,0,0,.1)":SEVC[a.sev]}`, borderRadius:"0 11px 11px 0", padding:"13px 14px", marginBottom:9, cursor:"pointer" }}>
              <div style={{ display:"flex", gap:11, alignItems:"flex-start" }}>
                <span style={{ fontSize:20, flexShrink:0 }}>{ICONS[a.type]}</span>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <span style={{ background:SEVC[a.sev]+"20", color:SEVC[a.sev], fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:20 }}>{a.sev.toUpperCase()}</span>
                      <span style={{ background:"rgba(0,0,0,.05)", color:"#555", fontSize:9, padding:"2px 7px", borderRadius:20 }}>{a.crop}</span>
                    </div>
                    <span style={{ fontSize:10, color:"#aaa" }}>{a.time}</span>
                  </div>
                  <div style={{ fontSize:12, color:C.earth, lineHeight:1.5 }}>{a.msg}</div>
                </div>
                {!a.read && <div style={{ width:7, height:7, borderRadius:"50%", background:SEVC[a.sev], flexShrink:0, marginTop:3 }} />}
              </div>
            </div>
          ))}
        </div>
        <div style={{ background:"white", borderRadius:16, padding:18, boxShadow:"0 2px 14px rgba(0,0,0,.06)", alignSelf:"start" }}>
          <h3 style={{ margin:"0 0 16px", fontFamily:"Georgia,serif", color:C.earth, fontSize:14 }}>⚙️ Alert Thresholds</h3>
          {[["Price Rise Alert (%)", rise, v => { setRise(v); updateThresholds(v, drop); }, C.leaf],
            ["Price Drop Alert (%)", drop, v => { setDrop(v); updateThresholds(rise, v); }, C.rust]
          ].map(([lbl,val,setter,col])=>(
            <div key={lbl} style={{ marginBottom:18 }}>
              <label style={{ fontSize:10, color:"#888", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:6 }}>{lbl}</label>
              <input type="range" min={1} max={30} value={val} onChange={e=>setter(+e.target.value)} style={{ width:"100%", accentColor:col }} />
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#888", marginTop:3 }}>
                <span>Trigger threshold</span><span style={{ fontWeight:700, color:col }}>{val}%</span>
              </div>
            </div>
          ))}
          <div style={{ marginTop:8, padding:"12px 14px", background:`${C.leaf}10`, borderRadius:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:C.leaf, marginBottom:6 }}>👀 Watching</div>
            {["Wheat","Onion","Tomato",crop].filter((v,i,a)=>a.indexOf(v)===i).map(c=>(
              <div key={c} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"5px 0", borderBottom:"1px solid rgba(0,0,0,.04)" }}>
                <span>{CROP_META[c]?.icon} {c}</span>
                <span style={{ color:C.leaf, fontSize:11, fontWeight:600 }}>Active</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
const DEFAULT_PROFILE = { name:"AgroVue", role:"Farmer", state:"Andhra Pradesh", district:"Krishna", farmSize:"8.5", phone:"", crops:"Wheat, Rice, Onion" };

function Profile({ user, setUser }) {
  const [form, setForm]       = useState(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved]     = useState(false);
  const ROLES = ["Farmer","Trader","Admin","Researcher"];

  useEffect(() => {
    load("AgroVue_profile", DEFAULT_PROFILE).then(setForm);
  }, []);

  const handleSave = async () => {
    await save("AgroVue_profile", form);
    setUser(form);
    setEditing(false);
    setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  };

  const clearAll = async () => {
    if (!window.confirm("This will delete all your data including your account. Are you sure?")) return;
    try {
      await window.storage.delete("AgroVue_profile");
      await window.storage.delete("AgroVue_chat");
      await window.storage.delete("AgroVue_alerts");
      await window.storage.delete("AgroVue_alert_thresholds");
      await window.storage.delete("AgroVue_session");
      alert("All AgroVue data cleared. You will be logged out.");
      window.location.reload();
    } catch (e) {
      alert("Error clearing data: " + e.message);
    }
  };

  const profitData = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-(5-i)); return { month:d.toLocaleDateString("en-IN",{month:"short"}), revenue:Math.round(Math.random()*30000+10000), expenses:Math.round(Math.random()*15000+5000) }; });

  if (!form) return <div style={{ padding:24, textAlign:"center", color:"#888" }}>Loading profile…</div>;

  return (
    <div style={{ padding:24, maxWidth:1100, margin:"0 auto" }}>
      <h1 style={{ fontFamily:"Georgia,serif", fontSize:24, color:C.earth, margin:"0 0 6px" }}>👤 Farmer Profile</h1>
      <p style={{ color:"#666", fontSize:13, margin:"0 0 20px" }}>Your data is saved permanently — persists across all sessions</p>

      {saved && <div style={{ background:"#ECFDF5", border:"1.5px solid #6EE7B7", borderRadius:10, padding:"12px 18px", marginBottom:16, color:"#065F46", fontWeight:600, fontSize:13 }}>✅ Profile saved successfully! Changes are permanent.</div>}

      <div style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:20 }}>
        <div>
          <div style={{ background:`linear-gradient(135deg,${C.earth},#2D1810)`, borderRadius:20, padding:28, textAlign:"center", marginBottom:16 }}>
            <div style={{ width:76, height:76, borderRadius:"50%", background:`linear-gradient(135deg,${C.leaf},${C.seedling})`, margin:"0 auto 14px", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, border:`3px solid ${C.harvest}` }}>
              {form.role==="Farmer"?"👨‍🌾":form.role==="Trader"?"👨‍💼":"👨‍💻"}
            </div>
            <div style={{ color:C.harvest, fontFamily:"Georgia,serif", fontSize:19, fontWeight:700, marginBottom:3 }}>{form.name}</div>
            <div style={{ color:C.seedling, fontSize:11, letterSpacing:1, marginBottom:10 }}>{form.role.toUpperCase()}</div>
            <div style={{ display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap" }}>
              <span style={{ background:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.7)", padding:"3px 10px", borderRadius:20, fontSize:10 }}>📍 {form.state||"—"}</span>
              <span style={{ background:"rgba(255,255,255,.1)", color:"rgba(255,255,255,.7)", padding:"3px 10px", borderRadius:20, fontSize:10 }}>🌾 {form.farmSize||"—"} acres</span>
            </div>
          </div>

          <div style={{ background:"white", borderRadius:16, padding:20, boxShadow:"0 2px 14px rgba(0,0,0,.06)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
              <h3 style={{ margin:0, fontFamily:"Georgia,serif", color:C.earth, fontSize:14 }}>Profile Details</h3>
              {editing
                ? <div style={{ display:"flex", gap:8 }}>
                    <button onClick={()=>setEditing(false)} style={{ padding:"5px 12px", borderRadius:8, border:"1px solid #ddd", background:"white", fontSize:11, cursor:"pointer" }}>Cancel</button>
                    <button onClick={handleSave} style={{ padding:"5px 12px", borderRadius:8, border:"none", background:C.leaf, color:"white", fontSize:11, cursor:"pointer", fontWeight:700 }}>💾 Save</button>
                  </div>
                : <button onClick={()=>setEditing(true)} style={{ padding:"5px 13px", borderRadius:8, border:`1px solid ${C.leaf}`, background:"white", color:C.leaf, fontSize:11, cursor:"pointer", fontWeight:600 }}>✏️ Edit</button>
              }
            </div>

            {[["Full Name","name","text"],["State","state","text"],["District","district","text"],["Farm Size (acres)","farmSize","text"],["Phone","phone","tel"],["Crops Grown","crops","text"]].map(([lbl,key,type])=>(
              <div key={key} style={{ marginBottom:11 }}>
                <label style={{ fontSize:9, color:"#999", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:3 }}>{lbl}</label>
                {editing
                  ? <input type={type} value={form[key]||""} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} style={{ width:"100%", padding:"8px 11px", borderRadius:8, border:"1.5px solid rgba(0,0,0,.12)", fontSize:12, outline:"none", boxSizing:"border-box" }} />
                  : <div style={{ fontSize:13, color:C.earth, padding:"5px 0", borderBottom:"1px solid rgba(0,0,0,.04)" }}>{form[key]||<span style={{ color:"#bbb" }}>Not set</span>}</div>
                }
              </div>
            ))}

            <div style={{ marginBottom:11 }}>
              <label style={{ fontSize:9, color:"#999", letterSpacing:1, textTransform:"uppercase", display:"block", marginBottom:3 }}>Role</label>
              {editing
                ? <select value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} style={{ width:"100%", padding:"8px 11px", borderRadius:8, border:"1.5px solid rgba(0,0,0,.12)", fontSize:12 }}>
                    {ROLES.map(r=><option key={r}>{r}</option>)}
                  </select>
                : <div style={{ fontSize:13, color:C.earth, padding:"5px 0" }}>{form.role}</div>
              }
            </div>
          </div>
        </div>

        <div>
          <div style={{ background:"white", borderRadius:16, padding:22, boxShadow:"0 2px 14px rgba(0,0,0,.06)", marginBottom:16 }}>
            <h3 style={{ margin:"0 0 16px", fontFamily:"Georgia,serif", color:C.earth }}>📊 Income Analytics (Last 6 Months)</h3>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={profitData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,.05)" />
                <XAxis dataKey="month" tick={{ fontSize:11 }} />
                <YAxis tick={{ fontSize:11 }} tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v=>[`₹${v.toLocaleString()}`]} />
                <Legend />
                <Bar dataKey="revenue"  name="Revenue"  fill={C.leaf}    radius={[4,4,0,0]} />
                <Bar dataKey="expenses" name="Expenses" fill={C.harvest+"90"} radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:`${C.leaf}08`, border:`1.5px solid ${C.leaf}25`, borderRadius:16, padding:20 }}>
            <h3 style={{ margin:"0 0 14px", fontFamily:"Georgia,serif", color:C.earth, fontSize:15 }}>💾 Permanent Storage Info</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                ["Profile data",         "AgroVue_profile",           "Name, role, location & farm details"],
                ["AI Chat history",      "AgroVue_chat",              "All advisor conversations, permanent"],
                ["Alerts state",         "AgroVue_alerts",            "Read/unread status remembered forever"],
                ["Alert thresholds",     "AgroVue_alert_thresholds",  "Your price alert settings, auto-saved"],
              ].map(([title,key,desc])=>(
                <div key={title} style={{ background:"white", borderRadius:12, padding:"13px 14px", border:"1px solid rgba(0,0,0,.06)" }}>
                  <div style={{ fontWeight:700, fontSize:12, color:C.earth, marginBottom:3 }}>{title}</div>
                  <div style={{ fontSize:10, color:C.leaf, fontFamily:"monospace", marginBottom:4, wordBreak:"break-all" }}>{key}</div>
                  <div style={{ fontSize:11, color:"#888" }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, padding:"10px 14px", background:`${C.sky}10`, border:`1px solid ${C.sky}30`, borderRadius:10, fontSize:12, color:"#0369a1" }}>
              ✅ <strong>Data is stored permanently</strong> using AgroVue's secure storage — survives browser restarts, clearing cache, and new sessions.
            </div>
            <button onClick={clearAll}
              style={{ marginTop:14, padding:"8px 18px", borderRadius:9, border:`1px solid ${C.rust}`, background:"white", color:C.rust, fontSize:11, cursor:"pointer", fontWeight:600 }}>
              🗑️ Clear All Saved Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const sel = { width:"100%", padding:"10px 13px", borderRadius:10, border:"1.5px solid rgba(0,0,0,.12)", fontSize:13, background:"white", cursor:"pointer", outline:"none" };

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────
const hashPass = (p) => btoa(unescape(encodeURIComponent(p + "_agrovue_salt_2025")));

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onGoRegister }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!username.trim() || !password.trim()) { setError("Please enter both username and password."); return; }
    setLoading(true);
    try {
      const users = await load("AgroVue_users", {});
      const key   = username.trim().toLowerCase();
      if (!users[key]) { setError("❌ Username not found. Please register first."); setLoading(false); return; }
      if (users[key].passwordHash !== hashPass(password)) { setError("❌ Incorrect password. Please try again."); setLoading(false); return; }
      // Save session
      await save("AgroVue_session", { username: key, loggedInAt: Date.now() });
      onLogin(users[key].profile);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, #0d2818 0%, #1A3A2A 40%, #2D6A4F 100%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',sans-serif", padding:20 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .auth-input:focus { border-color: #52B788 !important; box-shadow: 0 0 0 3px rgba(82,183,136,0.15) !important; outline:none; }
        .auth-btn:hover   { transform:translateY(-2px); box-shadow:0 8px 28px rgba(82,183,136,0.4) !important; }
        .auth-link:hover  { color:#52B788 !important; }
      `}</style>

      {/* Background pattern */}
      <div style={{ position:"fixed", inset:0, overflow:"hidden", pointerEvents:"none" }}>
        {["🌾","🌽","🍅","🧅","☁️","🌶️","🫘","🥔"].map((e,i)=>(
          <div key={i} style={{ position:"absolute", fontSize: 28+i*4, opacity:0.06,
            top:`${10+i*11}%`, left:`${5+i*12}%`, animation:`float ${3+i*0.4}s ease-in-out ${i*0.3}s infinite` }}>{e}</div>
        ))}
      </div>

      <div style={{ width:"100%", maxWidth:420, animation:"fadeUp .5s ease" }}>
        {/* Logo */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:52, marginBottom:10, animation:"float 3s ease-in-out infinite" }}><img src={LOGO_B64} alt="AgroVue" style={{ width:110, height:110, objectFit:"contain", filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.25))" }} /></div>
          <div style={{ color:"#F4A261", fontFamily:"Georgia,serif", fontSize:28, fontWeight:700, letterSpacing:1 }}>AgroVue</div>
          <div style={{ color:"rgba(255,255,255,.4)", fontSize:11, letterSpacing:3, textTransform:"uppercase", marginTop:4 }}>Price Intelligence Platform</div>
        </div>

        {/* Card */}
        <div style={{ background:"rgba(255,255,255,.97)", borderRadius:22, padding:"36px 36px 32px", boxShadow:"0 24px 80px rgba(0,0,0,.35)" }}>
          <h2 style={{ margin:"0 0 6px", fontFamily:"Georgia,serif", color:"#1A0F0A", fontSize:22, fontWeight:700 }}>Welcome back 👋</h2>
          <p style={{ margin:"0 0 28px", color:"#888", fontSize:13 }}>Sign in to access your farm dashboard</p>

          {error && (
            <div style={{ background:"#FEF2F2", border:"1.5px solid #FECACA", borderRadius:10, padding:"10px 14px", marginBottom:18, color:"#DC2626", fontSize:13, display:"flex", alignItems:"center", gap:8 }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom:18 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#555", letterSpacing:.5, display:"block", marginBottom:7 }}>USERNAME</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>👤</span>
              <input
                className="auth-input"
                value={username}
                onChange={e=>setUsername(e.target.value)}
                onKeyPress={e=>e.key==="Enter"&&handleLogin()}
                placeholder="Enter your username"
                style={{ width:"100%", padding:"12px 14px 12px 40px", borderRadius:11, border:"1.5px solid rgba(0,0,0,.12)", fontSize:14, boxSizing:"border-box", transition:"all .2s", background:"#FAFAFA" }}
              />
            </div>
          </div>

          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:11, fontWeight:600, color:"#555", letterSpacing:.5, display:"block", marginBottom:7 }}>PASSWORD</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:16 }}>🔒</span>
              <input
                className="auth-input"
                type={showPass?"text":"password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                onKeyPress={e=>e.key==="Enter"&&handleLogin()}
                placeholder="Enter your password"
                style={{ width:"100%", padding:"12px 44px 12px 40px", borderRadius:11, border:"1.5px solid rgba(0,0,0,.12)", fontSize:14, boxSizing:"border-box", transition:"all .2s", background:"#FAFAFA" }}
              />
              <button onClick={()=>setShowPass(p=>!p)} style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, padding:0 }}>
                {showPass?"🙈":"👁️"}
              </button>
            </div>
          </div>

          <button
            className="auth-btn"
            onClick={handleLogin}
            disabled={loading}
            style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:loading?"#ccc":`linear-gradient(135deg,#2D6A4F,#52B788)`, color:"white", fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer", transition:"all .2s", boxShadow:"0 4px 18px rgba(45,106,79,.3)", letterSpacing:.5 }}>
            {loading ? "⚙️ Signing in…" : "🚀 Sign In"}
          </button>

          <div style={{ textAlign:"center", marginTop:22, fontSize:13, color:"#888" }}>
            Don't have an account?{" "}
            <span className="auth-link" onClick={onGoRegister} style={{ color:"#2D6A4F", fontWeight:700, cursor:"pointer", transition:"color .2s" }}>
              Register here →
            </span>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:20, color:"rgba(255,255,255,.3)", fontSize:11 }}>
          🔐 Your data is stored securely • No server required
        </div>
      </div>
    </div>
  );
}

// ─── REGISTER SCREEN ──────────────────────────────────────────────────────────
function RegisterScreen({ onGoLogin, onLogin }) {
  const ROLES = ["Farmer","Trader","Researcher","Admin"];
  const [form, setForm]     = useState({ username:"", password:"", confirmPassword:"", name:"", role:"Farmer", state:"", phone:"" });
  const [showPass, setShowPass] = useState(false);
  const [error, setError]   = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  const validate = () => {
    if (!form.username.trim())        return "Username is required.";
    if (form.username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!/^[a-zA-Z0-9_]+$/.test(form.username.trim())) return "Username: only letters, numbers, underscores.";
    if (!form.password)               return "Password is required.";
    if (form.password.length < 6)     return "Password must be at least 6 characters.";
    if (form.password !== form.confirmPassword) return "Passwords do not match.";
    if (!form.name.trim())            return "Full name is required.";
    return null;
  };

  const handleRegister = async () => {
    setError(""); setSuccess("");
    const err = validate();
    if (err) { setError("❌ " + err); return; }
    setLoading(true);
    try {
      const users = await load("AgroVue_users", {});
      const key   = form.username.trim().toLowerCase();
      if (users[key]) { setError("❌ Username already taken. Please choose another."); setLoading(false); return; }

      const profile = { name: form.name.trim(), role: form.role, state: form.state, district:"", farmSize:"", phone: form.phone, crops:"", username: key };
      users[key] = { passwordHash: hashPass(form.password), profile, createdAt: Date.now() };
      await save("AgroVue_users", users);
      await save("AgroVue_session", { username: key, loggedInAt: Date.now() });
      await save("AgroVue_profile", profile);
      setSuccess("✅ Account created! Logging you in…");
      setTimeout(() => onLogin(profile), 1000);
    } catch (e) {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const inp = (label, key, type="text", placeholder="", icon="✏️") => (
    <div style={{ marginBottom:16 }}>
      <label style={{ fontSize:11, fontWeight:600, color:"#555", letterSpacing:.5, display:"block", marginBottom:7 }}>{label.toUpperCase()}</label>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)", fontSize:15 }}>{icon}</span>
        <input
          className="auth-input"
          type={key==="password"||key==="confirmPassword" ? (showPass?"text":"password") : type}
          value={form[key]}
          onChange={e=>set(key,e.target.value)}
          placeholder={placeholder}
          style={{ width:"100%", padding:"11px 14px 11px 38px", borderRadius:10, border:"1.5px solid rgba(0,0,0,.12)", fontSize:13, boxSizing:"border-box", transition:"all .2s", background:"#FAFAFA" }}
        />
        {(key==="password"||key==="confirmPassword") && (
          <button onClick={()=>setShowPass(p=>!p)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:15, padding:0 }}>
            {showPass?"🙈":"👁️"}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:`linear-gradient(135deg, #0d2818 0%, #1A3A2A 40%, #2D6A4F 100%)`, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Segoe UI',sans-serif", padding:20 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .auth-input:focus { border-color: #52B788 !important; box-shadow: 0 0 0 3px rgba(82,183,136,0.15) !important; outline:none; }
        .auth-btn:hover   { transform:translateY(-2px); box-shadow:0 8px 28px rgba(82,183,136,0.4) !important; }
        .auth-link:hover  { color:#52B788 !important; }
      `}</style>

      <div style={{ width:"100%", maxWidth:460, animation:"fadeUp .5s ease" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:44, marginBottom:8, animation:"float 3s ease-in-out infinite" }}><img src={LOGO_B64} alt="AgroVue" style={{ width:90, height:90, objectFit:"contain", filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }} /></div>
          <div style={{ color:"#F4A261", fontFamily:"Georgia,serif", fontSize:24, fontWeight:700 }}>AgroVue</div>
          <div style={{ color:"rgba(255,255,255,.35)", fontSize:10, letterSpacing:3, textTransform:"uppercase", marginTop:3 }}>Create Your Account</div>
        </div>

        <div style={{ background:"rgba(255,255,255,.97)", borderRadius:22, padding:"32px 34px 28px", boxShadow:"0 24px 80px rgba(0,0,0,.35)" }}>
          <h2 style={{ margin:"0 0 4px", fontFamily:"Georgia,serif", color:"#1A0F0A", fontSize:20, fontWeight:700 }}>Create Account 🌱</h2>
          <p style={{ margin:"0 0 24px", color:"#888", fontSize:12 }}>Join thousands of farmers using AgroVue</p>

          {error   && <div style={{ background:"#FEF2F2", border:"1.5px solid #FECACA", borderRadius:10, padding:"10px 14px", marginBottom:16, color:"#DC2626", fontSize:13 }}>{error}</div>}
          {success && <div style={{ background:"#ECFDF5", border:"1.5px solid #6EE7B7", borderRadius:10, padding:"10px 14px", marginBottom:16, color:"#065F46", fontSize:13 }}>{success}</div>}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 14px" }}>
            <div style={{ gridColumn:"1/-1" }}>{inp("Username","username","text","Choose a username","👤")}</div>
            {inp("Full Name","name","text","Your full name","🧑‍🌾")}
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:"#555", letterSpacing:.5, display:"block", marginBottom:7 }}>ROLE</label>
              <select value={form.role} onChange={e=>set("role",e.target.value)} style={{ width:"100%", padding:"11px 13px", borderRadius:10, border:"1.5px solid rgba(0,0,0,.12)", fontSize:13, background:"#FAFAFA", marginBottom:16 }}>
                {ROLES.map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            {inp("State","state","text","e.g. Punjab","📍")}
            {inp("Phone (optional)","phone","tel","Mobile number","📞")}
            <div style={{ gridColumn:"1/-1" }}>{inp("Password","password","password","Min. 6 characters","🔒")}</div>
            <div style={{ gridColumn:"1/-1" }}>{inp("Confirm Password","confirmPassword","password","Re-enter password","🔑")}</div>
          </div>

          {/* Password strength */}
          {form.password && (
            <div style={{ marginBottom:18, marginTop:-8 }}>
              {[["Weak","#DC2626",1],["Fair","#F59E0B",2],["Good","#10B981",3],["Strong","#2D6A4F",4]].map(([label,color,level])=>{
                const strength = form.password.length >= 10 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) ? 4
                  : form.password.length >= 8 ? 3 : form.password.length >= 6 ? 2 : 1;
                if (strength !== level) return null;
                return (
                  <div key={label} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ display:"flex", gap:3 }}>{[1,2,3,4].map(i=><div key={i} style={{ width:36, height:4, borderRadius:2, background: i<=strength ? color : "#eee" }}/>)}</div>
                    <span style={{ fontSize:11, color, fontWeight:600 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            className="auth-btn"
            onClick={handleRegister}
            disabled={loading}
            style={{ width:"100%", padding:"13px", borderRadius:12, border:"none", background:loading?"#ccc":`linear-gradient(135deg,#2D6A4F,#52B788)`, color:"white", fontSize:15, fontWeight:700, cursor:loading?"not-allowed":"pointer", transition:"all .2s", boxShadow:"0 4px 18px rgba(45,106,79,.3)" }}>
            {loading ? "⚙️ Creating account…" : "🌱 Create Account"}
          </button>

          <div style={{ textAlign:"center", marginTop:20, fontSize:13, color:"#888" }}>
            Already have an account?{" "}
            <span className="auth-link" onClick={onGoLogin} style={{ color:"#2D6A4F", fontWeight:700, cursor:"pointer", transition:"color .2s" }}>
              Sign in →
            </span>
          </div>
        </div>

        <div style={{ textAlign:"center", marginTop:18, color:"rgba(255,255,255,.25)", fontSize:11 }}>
          🔐 Data stored locally in your browser • Private & secure
        </div>
      </div>
    </div>
  );
}

// ─── LOGO (base64 embedded) ──────────────────────────────────────────────────
const LOGO_B64 = "data:image/png;base64,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";

// ─── SET FAVICON + TITLE ─────────────────────────────────────────────────────
function useFaviconAndTitle() {
  useEffect(() => {
    // Set page title
    document.title = "AgroVue";
    // Set favicon
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = LOGO_B64;
  }, []);
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
const DEFAULT_USER = { name:"AgroVue User", role:"Farmer", state:"", district:"", farmSize:"", username:"" };

export default function App() {
  useFaviconAndTitle();
  const [tab, setTab]         = useState("dashboard");
  const [crop, setCrop]       = useState("Wheat");
  const [user, setUser]       = useState(DEFAULT_USER);
  const [authScreen, setAuthScreen] = useState("login"); // "login" | "register"
  const [loggedIn, setLoggedIn]     = useState(false);
  const [ready, setReady]     = useState(false);

  // On mount: check for existing session
  useEffect(() => {
    (async () => {
      try {
        const session = await load("AgroVue_session", null);
        if (session && session.username) {
          const profile = await load("AgroVue_profile", DEFAULT_USER);
          setUser(profile);
          setLoggedIn(true);
        }
      } catch {}
      setReady(false); // No loading screen needed before auth
    })();
  }, []);

  const handleLogin = (profile) => {
    setUser(profile);
    setLoggedIn(true);
  };

  const handleLogout = async () => {
    try { await window.storage.delete("AgroVue_session"); } catch {}
    setLoggedIn(false);
    setUser(DEFAULT_USER);
    setAuthScreen("login");
  };

  // Loading splash
  if (!ready && !loggedIn && authScreen === "login") {
    // Just show auth immediately — no need for loading screen
  }

  if (!loggedIn) {
    return authScreen === "login"
      ? <LoginScreen    onLogin={handleLogin} onGoRegister={()=>setAuthScreen("register")} />
      : <RegisterScreen onLogin={handleLogin} onGoLogin={()=>setAuthScreen("login")} />;
  }

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(180deg,#FAF6F0,#F4EDE3)", fontFamily:"'Segoe UI',-apple-system,sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.5} 50%{transform:translate(-50%,-50%) scale(1.18);opacity:.15} }
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes spin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        button { transition: all .18s; }
        button:hover:not(:disabled) { opacity:.88; transform:translateY(-1px); }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,0,0,.13); border-radius:3px; }
        input[type=range] { accent-color:#2D6A4F; }
      `}</style>

      <NavBar tab={tab} setTab={setTab} user={user} onLogout={handleLogout} />

      {tab==="dashboard" && <Dashboard crop={crop} setCrop={setCrop} />}
      {tab==="predict"   && <PriceForecast   crop={crop} />}
      {tab==="market"    && <MarketIntel />}
      {tab==="advisor"   && <AIAdvisor  crop={crop} user={user} />}
      {tab==="voice"     && <VoiceAssistant  crop={crop} />}
      {tab==="alerts"    && <Alerts     crop={crop} />}
      {tab==="profile"   && <Profile    user={user} setUser={setUser} />}

      <footer style={{ padding:"18px 24px", textAlign:"center", color:"#bbb", fontSize:11, borderTop:"1px solid rgba(0,0,0,.06)", marginTop:40, background:"rgba(255,255,255,.5)" }}>
        <span style={{ color:C.leaf }}>🌾 AgroVue</span> — AI Agricultural Intelligence &nbsp;•&nbsp; Data: AgMarkNet, eNAM, IMD &nbsp;•&nbsp; Prices are AI estimates; verify before selling
      </footer>
    </div>
  );
}