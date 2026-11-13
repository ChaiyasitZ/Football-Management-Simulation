import React, { createContext, useContext, useState } from 'react';

export type AppLanguage = 'en' | 'th';

let currentGlobalLanguage: AppLanguage = 'en';

export function getCurrentLanguage(): AppLanguage {
  return currentGlobalLanguage;
}

export function setGlobalLanguage(lang: AppLanguage): void {
  currentGlobalLanguage = lang;
}

/**
 * Engine-safe bilingual helper that returns English by default ('en')
 * or Thai when the active language is 'th'.
 */
export function trText(enText: string, thText: string): string {
  return currentGlobalLanguage === 'en' ? enText : thText;
}

const EXACT_TH_TO_EN: Record<string, string> = {
  // Club Visions
  'คว้าแชมป์ลีกและครองความยิ่งใหญ่ในระดับทวีป': 'Win the league title and dominate continental football',
  'ติดท็อปโฟร์เพื่อโควตาฟุตบอลยุโรปและปั้นดาวรุ่งควบคู่กัน': 'Finish in the top four for European qualification while developing youth',
  'สร้างทีมที่มั่นคงในครึ่งบนของตารางและบริหารการเงินอย่างรัดกุม': 'Establish a stable top-half finish and maintain strict financial discipline',
  'รักษาสถานะในลีกสูงสุดและพัฒนานักเตะจากอคาเดมี': 'Secure top-flight survival and promote academy prospects',
  // Scout report strengths & weaknesses
  'ความเร็วและการกระชากหนีคู่แข่งยอดเยี่ยม': 'Exceptional pace and ability to beat defenders on the dribble',
  'การจ่ายบอลสร้างสรรค์เกมแม่นยำสูง': 'High-precision creative passing and playmaking vision',
  'จบสกอร์ในกรอบเขตโทษเฉียบคม': 'Clinical finishing inside the penalty box',
  'เข้าปะทะและแย่งบอลแข็งแกร่ง': 'Strong tackling and ball-winning ability',
  'ตัดสินใจในจังหวะสำคัญได้ฉลาด': 'Intelligent decision-making in key moments',
  'มีสมดุลค่าพลังพื้นฐานที่ดีและเล่นตามแท็กติกได้': 'Well-balanced core attributes and strong tactical discipline',
  'ความอึดในการยืนระยะ 90 นาทียังต้องพัฒนา': 'Stamina over a full 90 minutes still needs improvement',
  'อาจตื่นสนามเมื่อถูกบีบพื้นที่เร็ว': 'Can lose composure when pressed aggressively',
  'เสียเปรียบในการปะทะกับคู่แข่งรูปร่างใหญ่': 'Can be outmuscled in physical duels against stronger opponents',
  'ไม่มีจุดอ่อนร้ายแรงในการเล่นระดับลีกสูงสุด': 'No glaring weaknesses for top-flight competition',
  // Injury types
  'กล้ามเนื้อต้นขาตึง': 'Tight Hamstring',
  'ข้อเท้าแพลง': 'Sprained Ankle',
  'ฟกช้ำจากการปะทะ': 'Impact Bruising',
  // Initial Press Conference labels & media responses
  'เราพร้อมสู้เพื่อลุ้นความสำเร็จสูงสุดและสร้างฟุตบอลที่แฟนบอลภูมิใจ':
    'We are ready to compete for top honours and play football our supporters will be proud of',
  'สื่อชื่นชมความมุ่งมั่นและนักเตะในทีมรู้สึกฮึกเหิมกับเป้าหมายที่ชัดเจน':
    'The media praised your ambition and the squad feels energized by your clear targets',
  'เราจะโฟกัสทีละนัดและวางรากฐานระยะยาวให้กับสโมสรอย่างมั่นคง':
    'We will focus match by match and build a sustainable long-term foundation for the club',
  'บอร์ดบริหารพอใจกับแนวทางที่สุขุมและมีแบบแผนของคุณ':
    'The board of directors is pleased with your measured and structured approach',
  'ผมต้องการให้นักเตะทุกคนพิสูจน์ตัวเองในสนามซ้อมตั้งแต่วันแรก':
    'I expect every player to prove themselves on the training pitch from day one',
  'นักเตะรับรู้ถึงมาตรฐานวินัยที่เข้มข้นของทีมงานชุดใหม่':
    'The squad immediately recognizes the high disciplinary standards set by your coaching staff',
  'เรายังมีรายละเอียดแท็กติกที่ต้องยกระดับขึ้นอีกในนัดต่อไป':
    'We still have tactical details to refine ahead of the next match',
  'บอร์ดบริหารและสื่อมองว่าคุณมีมาตรฐานสูงและไม่ประมาท':
    'The board and media respect your high standards and refusal to become complacent',
  'นักเตะในห้องแต่งตัวรู้สึกภูมิใจที่คุณออกโรงปกป้องและชื่นชมทีมต่อหน้าสื่อ':
    'The dressing room is proud that you backed and praised the players in front of the press',
};

const EXACT_EN_TO_TH: Record<string, string> = Object.fromEntries(
  Object.entries(EXACT_TH_TO_EN).map(([th, en]) => [en, th])
);

/**
 * Dynamically localizes stored strings (e.g. inbox titles/bodies, clubVision,
 * transaction descriptions, scout report bullets) when switching languages mid-session.
 */
export function localizeDynamicText(text: string, lang: AppLanguage): string {
  if (!text) return text;

  if (lang === 'en') {
    if (EXACT_TH_TO_EN[text]) return EXACT_TH_TO_EN[text];

    // Pattern translations from Thai -> English for pre-existing state strings
    let out = text;
    out = out.replace(
      /^ยินดีต้อนรับสู่ (.+) — เป้าหมายฤดูกาล (.+)$/,
      'Welcome to $1 — $2 Season Objectives'
    );
    out = out.replace(
      /^บอร์ดบริหารของ (.+) ขอต้อนรับคุณสู่ถิ่น (.+) อย่างเป็นทางการ เป้าหมายหลักของฤดูกาลนี้คือการจบอันดับไม่ต่ำกว่าอันดับที่ (\d+) ในศึก (.+) โดยมีงบประมาณเสริมทัพเริ่มต้น €([\d.]+)M$/,
      'The Board of Directors at $1 officially welcomes you to $2. Your primary objective this season is to finish at least #$3 in the $4, backed by an initial transfer budget of €5M'.replace('€5M', '€$5M')
    );
    out = out.replace(
      /^งานแถลงข่าวเปิดตัวผู้จัดการทีมคนใหม่ของ (.+)$/,
      'Official Unveiling Press Conference — New $1 Manager'
    );
    out = out.replace(
      /^กองทัพสื่อมวลชนเดินทางมาร่วมงานแถลงข่าวเปิดตัวคุณในฐานะกุนซือคนใหม่ของ (.+) กรุณาเลือกแนวทางการตอบคำถามเพื่อสร้างบรรยากาศเริ่มต้นในห้องแต่งตัว$/,
      'Members of the press have gathered for your official unveiling as manager of $1. Select your response below to set the tone in the dressing room.'
    );
    out = out.replace(
      /^รายงานความพร้อมขุมกำลังและแท็กติกก่อนเปิดฤดูกาล$/,
      'Pre-Season Squad & Tactical Briefing'
    );
    out = out.replace(
      /^ทีมสตาฟฟ์โค้ชได้จัดวางแผนการเล่นเริ่มต้น (.+) พร้อมคัดเลือก 11 ตัวจริงชุดที่ดีที่สุดให้คุณเรียบร้อยแล้ว คุณสามารถปรับแต่ง Role, Mentality และคำสั่งรายบุคคลได้ที่เมนู Tactics$/,
      'Your coaching staff has prepared the initial $1 system and selected the strongest Starting XI. You can customize player roles, mentality, and individual instructions in the Tactics menu.'
    );
    out = out.replace(
      /^เงินสนับสนุนหลักจากสปอนเซอร์ต้นฤดูกาล (.+)$/,
      'Initial Season Sponsorship Installment ($1)'
    );
    out = out.replace(
      /^จ่ายค่าเหนื่อยนักเตะและทีมงานประจำสัปดาห์ \((.+)\)$/,
      'Weekly player and coaching staff wages ($1)'
    );
    out = out.replace(
      /^รายได้บัตรผ่านประตูเกมเหย้าพบ (.+) \((.+) คน\)$/,
      'Home matchday gate receipts vs $1 ($2 attendance)'
    );
    out = out.replace(
      /^สรุปผลหลังเกม: (.+)$/,
      'Post-Match Report: $1'
    );
    out = out.replace(
      /^เกมนัดที่ (\d+) จบลงด้วยสกอร์ (.+) \(xG: (.+), ครองบอล (.+)\) โดย Man of the Match ได้แก่ (.+)$/,
      'Matchday $1 finished $2 (xG: $3, Possession: $4). Man of the Match: $5'
    );
    out = out.replace(
      /^ชื่นชมความทุ่มเทของลูกทีมทุกคนในเกมพบ (.+)$/,
      'Praise the commitment and work rate of the entire squad against $1'
    );
    out = out.replace(
      /^รายงานแพทย์: (.+) บาดเจ็บพัก (\d+) วัน$/,
      'Medical Report: $1 ruled out for $2 days'
    );
    out = out.replace(
      /^ทีมแพทย์ของ (.+) ยืนยันว่า (.+) มีอาการ(.+)หลังจบเกมล่าสุด และต้องพักรักษาตัวประมาณ (\d+) วัน$/,
      'The $1 medical department confirmed that $2 suffered an injury after the recent match and will be sidelined for approximately $4 days.'
    );
    out = out.replace(
      /^(.+) หายเจ็บกลับมาซ้อมเต็มรูปแบบ$/,
      '$1 returns to full training'
    );
    out = out.replace(
      /^ข่าวดีสำหรับ (.+) เมื่อ (.+) ผ่านความฟิตจากทีมแพทย์และพร้อมกลับมาเป็นตัวเลือกในการจัดทัพ$/,
      'Good news for $1 as $2 has been cleared by the medical team and is available for selection again.'
    );
    out = out.replace(
      /^รายงานแมวมอง: พบเป้าหมายน่าสนใจ — (.+)$/,
      'Scouting Report: Promising Target Identified — $1'
    );
    out = out.replace(
      /^ทีมแมวมองส่งรายงานการวิเคราะห์ (.+) \((.+), (.+)\) ประเมินความเหมาะสมอยู่ที่ (\d+)\/100$/,
      'Your scouting network submitted an assessment on $1 ($2, $3) with a recommendation score of $4/100.'
    );
    out = out.replace(
      /^Matchday (\d+): พร้อมดวลศึก (.+) วันนี้!$/,
      'Matchday $1: Ready to face $2 today!'
    );
    out = out.replace(
      /^วันนี้เป็นวันแข่งขันนัดที่ (\d+) พบกับ (.+) \(แผนคู่แข่ง: (.+)\) กรุณาตรวจสอบความฟิตของ 11 ตัวจริงและเข้าสู่ Match Center เพื่อทำการแข่งขัน$/,
      'Today is Matchday $1 against $2 (Opponent Formation: $3). Check your Starting XI fitness and head to the Match Center for kick-off.'
    );
    out = out.replace(
      /^คว้าตัว (.+) จาก (.+) \((.+)\)$/,
      'Signed $1 from $2 ($3)'
    );
    out = out.replace(
      /^OFFICIAL: (.+) คว้าตัว (.+) ร่วมทัพ!$/,
      'OFFICIAL: $1 complete signing of $2!'
    );
    out = out.replace(
      /^(.+) บรรลุข้อตกลงคว้าตัว (.+) จาก (.+) ด้วยมูลค่ารวม €([\d.]+)M พร้อมสัญญาถึงปี (\d+) รับค่าเหนื่อย €(.+)\/สัปดาห์$/,
      '$1 have completed the signing of $2 from $3 for a total package of €$4M on a contract until $5 worth €$6/wk.'
    );
    out = out.replace(
      /^โบนัสต่อสัญญาฉบับใหม่ของ (.+) ถึงปี (\d+)$/,
      'Contract extension signing bonus for $1 until $2'
    );
    out = out.replace(
      /^(.+) ขยายสัญญากับ (.+) ถึงปี (\d+)$/,
      '$1 extends contract with $2 until $3'
    );
    out = out.replace(
      /^(.+) จรดปากกาต่อสัญญาฉบับใหม่กับสโมสร รับค่าเหนื่อย €(.+)\/สัปดาห์$/,
      '$1 has signed a new contract extension with the club worth €$2/wk.'
    );
    out = out.replace(
      /^อคาเดมีดันดาวรุ่งพรสวรรค์สูง: (.+) \((.+)\)$/,
      'Youth Academy High-Potential Prospect: $1 ($2)'
    );
    out = out.replace(
      /^หัวหน้าศูนย์ฝึกเยาวชนของ (.+) รายงานการค้นพบดาวรุ่งวัย 17 ปี (.+) \((.+)\) ที่มีศักยภาพสูงถึงระดับ (\d+)\/20$/,
      'The Head of Youth Development at $1 reports the emergence of 17-year-old prospect $2 ($3) with potential rated up to $4/20.'
    );
    out = out.replace(
      /^แต่งตั้ง (.+) เข้ารับตำแหน่ง (.+)$/,
      'Appointed $1 as $2'
    );
    return out;
  } else {
    if (EXACT_EN_TO_TH[text]) return EXACT_EN_TO_TH[text];
    return text;
  }
}

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  tr: (enText: string, thText: string) => string;
  trDynamic: (text: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'en',
  setLang: () => {},
  tr: (enText) => enText,
  trDynamic: (text) => text,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<AppLanguage>('en');

  const setLang = (nextLang: AppLanguage) => {
    currentGlobalLanguage = nextLang;
    setLangState(nextLang);
  };

  const tr = (enText: string, thText: string) => {
    if (lang === 'en') return enText;
    // Strip redundant trailing English parenthetical labels like "ขุมกำลัง (Squad)" -> "ขุมกำลัง"
    // while keeping numeric/unit parentheticals like "(U21)", "(25 คน)", "(€5.0M)", "(1-20)"
    return thText.replace(/\s*\([A-Za-z][A-Za-z\s/&,-]{3,}\)\s*$/, '').trim();
  };
  const trDynamic = (text: string) => localizeDynamicText(text, lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, tr, trDynamic }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

export const LanguageSwitcher: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { lang, setLang } = useLanguage();

  return (
    <div
      className={`inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 ${className}`}
      role="group"
      aria-label="Language Switcher"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-md transition-all cursor-pointer ${
          lang === 'en'
            ? 'bg-emerald-500 text-slate-950 shadow-sm'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        ENG
      </button>
      <button
        type="button"
        onClick={() => setLang('th')}
        className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-md transition-all cursor-pointer ${
          lang === 'th'
            ? 'bg-emerald-500 text-slate-950 shadow-sm'
            : 'text-slate-400 hover:text-white'
        }`}
      >
        THAI
      </button>
    </div>
  );
};
