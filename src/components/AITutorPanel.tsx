import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  FileText,
  HelpCircle,
  Trash2,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  CircuitComponent,
  Wire,
  SimulationResult,
  SIPrefix,
} from '../types/circuit';
import {
  SI_PREFIXES,
  toSIValue,
  formatWithBestPrefix,
  formatPolishNumber,
} from '../utils/units';
import { MathFormula } from './MathFormula';

export interface AITutorPanelProps {
  components: CircuitComponent[];
  wires: Wire[];
  simulationResult: SimulationResult;
  isOpen?: boolean;
  onClose?: () => void;
}

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  title?: string;
  paragraphs: string[];
  formulas?: string[];
  timestamp: string;
}

/**
 * Renders text with inline $...$ LaTeX segments via MathFormula
 */
const RichTextWithMath: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          const math = part.slice(1, -1);
          return <MathFormula key={i} math={math} className="mx-0.5 text-sky-600 dark:text-sky-300 font-medium" />;
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </span>
  );
};

const QUICK_PROMPTS = [
  'Wyjaśnij mój obecny układ krok po kroku',
  'Czym różni się moc czynna [W], bierna [var] i pozorna [VA]?',
  'Jak działa cewka i kondensator w DC, a jak w AC?',
  'Co się stanie, gdy zmienię przedrostek z μF na nF?',
  'Dlaczego na rezystorach wydziela się taka moc?',
  'Wklej zadanie tekstowe do analizy',
];

const SAMPLE_WORD_PROBLEM =
  'Obwód szeregowy RLC zasilany jest napięciem przemiennym U = 230 V o częstotliwości f = 50 Hz. W skład obwodu wchodzi rezystor R = 30 Ω, cewka o indukcyjności L = 120 mH oraz kondensator o pojemności C = 150 uF. Oblicz reaktancje XL, XC, impedancję zastępczą Z, prąd I oraz moce P, Q, S.';

function parsePolishPrefixAndUnit(rawPrefix: string): SIPrefix {
  const p = rawPrefix.trim();
  if (p === 'p') return 'p';
  if (p === 'n') return 'n';
  if (p === 'u' || p === 'μ' || p === 'µ') return 'u';
  if (p === 'm') return 'm';
  if (p === 'k') return 'k';
  if (p === 'M') return 'M';
  if (p === 'G') return 'G';
  return '';
}

/**
 * Intelligent Polish Electrotechnics Didactic Engine
 * Analyzes live circuit netlist JSON, simulation results, "what-if" scenarios, and word problems.
 */
function generateTutorResponse(
  query: string,
  components: CircuitComponent[],
  wires: Wire[],
  sim: SimulationResult
): { title: string; paragraphs: string[]; formulas: string[] } {
  const qLower = query.toLowerCase();

  // 1. Word problem parser if query contains multiple numerical quantities like U = ..., R = ...
  const hasEqualsNumbers =
    (qLower.match(/[uierlcf]\d*\s*=\s*\d+/g) || []).length >= 2 ||
    qLower.includes('oblicz') ||
    qLower.includes('zadanie:');

  if (hasEqualsNumbers) {
    const extractVal = (regex: RegExp): { val: number; prefix: SIPrefix; raw: string } | null => {
      const m = query.match(regex);
      if (!m) return null;
      const num = parseFloat(m[1].replace(',', '.'));
      if (!Number.isFinite(num)) return null;
      const pref = parsePolishPrefixAndUnit(m[2] || '');
      return { val: num, prefix: pref, raw: `${m[1]} ${m[2] || ''}`.trim() };
    };

    const uMatch = extractVal(/(?:U|E)\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*V/i);
    const iMatch = extractVal(/(?:I|J)\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*A/i);
    const fMatch = extractVal(/f\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*Hz/i);
    const lMatch = extractVal(/L\d*\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*H/i);
    const cMatch = extractVal(/C\d*\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*F/i);

    // Find all resistors R1, R2, R...
    const rMatches = [...query.matchAll(/R(\d*)\s*=\s*(\d+(?:[.,]\d+)?)\s*([pnumkMGμµ])?\s*(?:Ω|om|ohm)/gi)];
    const resistors = rMatches.map((m, idx) => {
      const num = parseFloat(m[2].replace(',', '.'));
      const pref = parsePolishPrefixAndUnit(m[3] || '');
      return {
        label: m[1] ? `R_${m[1]}` : idx === 0 ? 'R' : `R_${idx + 1}`,
        si: toSIValue(num, pref),
        raw: `${m[2]} ${m[3] || ''}Ω`,
      };
    });

    const paragraphs: string[] = [];
    const formulas: string[] = [];

    paragraphs.push(
      'Rozpoznałem wklejoną treść zadania z elektrotechniki! Przeprowadźmy pełną analizę inżynierską krok po kroku (od Kroku 0 – przeliczenia jednostek SI, przez dobór wzorów, aż do wyniku końcowego).'
    );

    const siList: string[] = [];
    const U_si = uMatch ? toSIValue(uMatch.val, uMatch.prefix) : undefined;
    const I_si = iMatch ? toSIValue(iMatch.val, iMatch.prefix) : undefined;
    const f_si = fMatch ? toSIValue(fMatch.val, fMatch.prefix) : undefined;
    const L_si = lMatch ? toSIValue(lMatch.val, lMatch.prefix) : undefined;
    const C_si = cMatch ? toSIValue(cMatch.val, cMatch.prefix) : undefined;

    if (U_si !== undefined) siList.push(`U = ${formatPolishNumber(U_si, 4)}\\,\\text{V}`);
    if (I_si !== undefined) siList.push(`I = ${formatPolishNumber(I_si, 4)}\\,\\text{A}`);
    if (f_si !== undefined) siList.push(`f = ${formatPolishNumber(f_si, 2)}\\,\\text{Hz}`);
    resistors.forEach((r) => siList.push(`${r.label} = ${formatPolishNumber(r.si, 4)}\\,\\Omega`));
    if (L_si !== undefined) siList.push(`L = ${formatPolishNumber(L_si, 5)}\\,\\text{H}`);
    if (C_si !== undefined) siList.push(`C = ${C_si.toExponential(3).replace('.', ',')}\\,\\text{F}`);

    if (siList.length > 0) {
      formulas.push(`\\text{Krok 0 (SI): } ${siList.join(', \\quad ')}`);
    }

    // AC RLC calculation if frequency f is given
    if (f_si !== undefined && f_si > 0) {
      const omega = 2 * Math.PI * f_si;
      const R_total = resistors.reduce((acc, r) => acc + r.si, 0);
      const XL = L_si ? omega * L_si : 0;
      const XC = C_si ? 1 / (omega * C_si) : 0;
      const X = XL - XC;
      const Z_mag = Math.sqrt(R_total * R_total + X * X);
      const phiDeg = (Math.atan2(X, R_total) * 180) / Math.PI;

      paragraphs.push(
        `1. Ponieważ w zadaniu występuje częstotliwość $f = ${formatPolishNumber(f_si, 1)}\\,\\text{Hz}$, mamy do czynienia z obwodem prądu przemiennego (AC). Wyznaczamy pulsację $\\omega = 2\\pi f = ${formatPolishNumber(omega, 2)}\\,\\text{rad/s}$ oraz reaktancje elementów biernych:`
      );

      if (L_si) {
        formulas.push(
          `X_L = 2\\pi f L = ${formatPolishNumber(omega, 2)} \\cdot ${formatPolishNumber(L_si, 4)} = ${formatPolishNumber(XL, 2)}\\,\\Omega`
        );
      }
      if (C_si) {
        formulas.push(
          `X_C = \\frac{1}{2\\pi f C} = \\frac{1}{${formatPolishNumber(omega, 2)} \\cdot ${C_si.toExponential(2).replace('.', ',')}} = ${formatPolishNumber(XC, 2)}\\,\\Omega`
        );
      }

      formulas.push(
        `|Z| = \\sqrt{R^2 + (X_L - X_C)^2} = \\sqrt{${formatPolishNumber(R_total, 2)}^2 + (${formatPolishNumber(XL, 2)} - ${formatPolishNumber(XC, 2)})^2} = ${formatPolishNumber(Z_mag, 2)}\\,\\Omega, \\quad \\varphi = ${formatPolishNumber(phiDeg, 1)}^\\circ`
      );

      if (U_si !== undefined && Z_mag > 0) {
        const I_calc = U_si / Z_mag;
        const cosPhi = Math.cos((phiDeg * Math.PI) / 180);
        const P = U_si * I_calc * cosPhi;
        const Q = I_calc * I_calc * X;
        const S = U_si * I_calc;

        paragraphs.push(
          `2. Z uogólnionego Prawa Ohma dla obwodów AC obliczamy wartość skuteczną prądu $I = U / |Z|$ oraz pełny trójkąt mocy ($P, Q, S$):`
        );
        formulas.push(
          `I = \\frac{U}{|Z|} = \\frac{${formatPolishNumber(U_si, 2)}\\,\\text{V}}{${formatPolishNumber(Z_mag, 2)}\\,\\Omega} = ${formatWithBestPrefix(I_calc, 'A', 3).latex}`
        );
        formulas.push(
          `P = I^2 R = ${formatWithBestPrefix(P, 'W', 2).latex}, \\quad Q = I^2 (X_L - X_C) = ${formatWithBestPrefix(Q, 'var', 2).latex}, \\quad S = U \\cdot I = ${formatWithBestPrefix(S, 'VA', 2).latex}`
        );
      }
    } else if (resistors.length > 0 && (U_si !== undefined || I_si !== undefined)) {
      const isParallel = qLower.includes('równoleg');
      const R_eq = isParallel
        ? 1 / resistors.reduce((acc, r) => acc + 1 / r.si, 0)
        : resistors.reduce((acc, r) => acc + r.si, 0);

      paragraphs.push(
        `1. Wyznaczamy rezystancję zastępczą $R_z$ dla połączenia ${isParallel ? 'równoległego' : 'szeregowego'} rezystorów:`
      );
      formulas.push(`R_z = ${formatWithBestPrefix(R_eq, 'Ω', 3).latex}`);

      if (U_si !== undefined && R_eq > 0) {
        const I_calc = U_si / R_eq;
        const P_calc = U_si * I_calc;
        paragraphs.push(
          `2. Stosujemy Prawo Ohma $I = U / R_z$ oraz wzór na moc czynną $P = U \\cdot I$:`
        );
        formulas.push(
          `I = \\frac{U}{R_z} = \\frac{${formatPolishNumber(U_si, 2)}\\,\\text{V}}{${formatPolishNumber(R_eq, 2)}\\,\\Omega} = ${formatWithBestPrefix(I_calc, 'A', 3).latex}, \\quad P = U \\cdot I = ${formatWithBestPrefix(P_calc, 'W', 2).latex}`
        );
      }
    } else {
      paragraphs.push(
        'Podaj w treści zadania wartości napięcia (np. U = 24 V), rezystancji (np. R1 = 2 kΩ) lub częstotliwości (f = 50 Hz), a wyliczę wszystkie szukane wielkości!'
      );
    }

    return {
      title: 'Rozwiązanie wklejonego zadania tekstowego krok po kroku',
      paragraphs,
      formulas,
    };
  }

  // 2. Question about active power [W], reactive power [var], apparent power [VA]
  if (qLower.includes('moc') && (qLower.includes('var') || qLower.includes('va') || qLower.includes('bierna') || qLower.includes('pozorna'))) {
    const { totalLoadPowerP, totalReactivePowerQ, totalApparentPowerS } =
      sim.didacticSolution.fullSolution;
    return {
      title: 'Różnica między mocą czynną P [W], bierną Q [var] i pozorną S [VA]',
      paragraphs: [
        'Choć wszystkie trzy moce są iloczynem napięcia i prądu, w elektrotechnice przypisujemy im inne jednostki, aby od razu wiedzieć, o jakim zjawisku fizycznym mówimy:',
        '• Moc czynna $P\\,[\\text{W – wat}]$: to jedyna moc, która wykonuje użyteczną pracę (wydziela ciepło w rezystorach, napędza wał silnika). Wydziela się wyłącznie na oporze czynnym $R$.',
        '• Moc bierna $Q\\,[\\text{var – war}]$: opisuje energię, która w każdym okresie prądu przemiennego jest na przemian pobierana ze źródła do pola magnetycznego cewki ($Q > 0$) lub pola elektrycznego kondensatora ($Q < 0$), a po chwili zwracana z powrotem do sieci. Nie wykonuje pracy użytecznej, ale jej przepływ obciąża kable!',
        '• Moc pozorna $S\\,[\\text{VA – woltamper}]$: geometryczna suma (przeciwprostokątna trójkąta mocy) określająca całkowite napięciowo-prądowe obciążenie źródła zasilania lub transformatora.',
        `W Twoim obecnym układzie na płótnie całkowita moc czynna wynosi $P = ${formatWithBestPrefix(totalLoadPowerP, 'W', 2).latex}$, moc bierna $Q = ${formatWithBestPrefix(totalReactivePowerQ, 'var', 2).latex}$, a moc pozorna $S = ${formatWithBestPrefix(totalApparentPowerS, 'VA', 2).latex}$.`,
      ],
      formulas: [
        'P = U \\cdot I \\cdot \\cos\\varphi = I^2 R \\quad [\\text{W}]',
        'Q = U \\cdot I \\cdot \\sin\\varphi = I^2 (X_L - X_C) \\quad [\\text{var}]',
        'S = U \\cdot I = \\sqrt{P^2 + Q^2} \\quad [\\text{VA}]',
      ],
    };
  }

  // 3. Question about Inductor & Capacitor in DC vs AC
  if (qLower.includes('cewk') || qLower.includes('kondensator')) {
    return {
      title: 'Zachowanie cewki (L) i kondensatora (C) w obwodach DC oraz AC',
      paragraphs: [
        'Cewka i kondensator to elementy reaktancyjne (magazynujące energię), których zachowanie zależy fundamentalnie od tego, czy prąd jest stały (DC, $f = 0\\,\\text{Hz}$), czy przemienny (AC, $f > 0\\,\\text{Hz}$):',
        '1. Kondensator $C\\,[\\text{F}]$: zbudowany jest z dwóch okładek rozdzielonych dielektrykiem (izolatorem). Dla prądu stałego (DC) po naładowaniu stanowi PRZERWĘ W OBWODZIE ($X_C \\to \\infty$, prąd ustalony $I_C = 0\\,\\text{A}$). Dla prądu przemiennego (AC) okładki cyklicznie się przeładowują, a kondensator stawia opór bierny malejący ze wzrostem częstotliwości!',
        '2. Cewka indukcyjna $L\\,[\\text{H}]$: to zwinięty drut przewodzący. Dla ustalonego prądu stałego (DC) pole magnetyczne nie zmienia się w czasie, więc idealna cewka stanowi ZWARCIE ($X_L = 0\\,\\Omega$, napięcie $U_L = 0\\,\\text{V}$). Dla prądu przemiennego (AC) zmienne pole magnetyczne indukuje siłę elektromotoryczną samoindukcji, która dławi prąd tym mocniej, im wyższa jest częstotliwość!',
      ],
      formulas: [
        'X_L = 2\\pi f L \\;\\xrightarrow{f=0\\text{ (DC)}}\\; 0\\,\\Omega \\text{ (zwarcie)}',
        'X_C = \\frac{1}{2\\pi f C} \\;\\xrightarrow{f=0\\text{ (DC)}}\\; \\infty\\,\\Omega \\text{ (rozwarcie, } I_C = 0\\,\\text{A)}',
      ],
    };
  }

  // 4. Question about changing SI prefixes (e.g. uF to nF, kOhm to Ohm)
  if (qLower.includes('przedrost') || qLower.includes('nf') || qLower.includes('uf') || qLower.includes('μf')) {
    const cap = components.find((c) => c.type === 'capacitor');
    const capExample = cap
      ? `W Twoim układzie znajduje się kondensator ${cap.label} o wartości ${cap.value} ${SI_PREFIXES[cap.prefix].symbol}F.`
      : 'Rozważmy kondensator w obwodzie prądu przemiennego lub w timerze NE555.';

    return {
      title: 'Wpływ zmiany przedrostka SI (np. z μF na nF) na działanie obwodu',
      paragraphs: [
        capExample,
        'Przedrostek mikro ($\\mu = 10^{-6}$) jest dokładnie $1000$ razy większy niż przedrostek nano ($\\text{n} = 10^{-9}$). Jeśli zmienisz pojemność kondensatora z $10\\,\\mu\\text{F}$ na $10\\,\\text{nF}$, zmniejszasz jego pojemność tysiąckrotnie ($1000\\times$)!',
        '• W obwodzie prądu przemiennego (AC): ponieważ pojemność $C$ stoi w mianowniku wzoru na reaktancję $X_C = \\frac{1}{2\\pi f C}$, tysiąckrotne zmniejszenie pojemności spowoduje TYSIĄCKROTNY WZROST oporu biernego $X_C$! Prąd w gałęzi gwałtownie zmaleje.',
        '• W filtrze RC lub układzie NE555: częstotliwość graniczna i częstotliwość generacji $f = \\frac{1}{\\dots \\cdot C}$ wzrośnie $1000$ razy (kondensator $1000\\times$ mniejszy ładuje się i rozładowuje $1000\\times$ szybciej!).',
      ],
      formulas: [
        '\\frac{1\\,\\mu\\text{F}}{1\\,\\text{nF}} = \\frac{10^{-6}\\,\\text{F}}{10^{-9}\\,\\text{F}} = 10^3 = 1000',
        'C \\downarrow 1000\\times \\quad \\Longrightarrow \\quad X_C = \\frac{1}{2\\pi f C} \\uparrow 1000\\times, \\quad f_{\\text{NE555}} \\uparrow 1000\\times',
      ],
    };
  }

  // 5. Question about power dissipated on resistors in current circuit
  if (qLower.includes('rezystor') && qLower.includes('moc')) {
    const resistorResults = Object.values(sim.componentResults).filter(
      (r) => r.type === 'resistor'
    );
    if (resistorResults.length === 0) {
      return {
        title: 'Moc wydzielana na rezystorach',
        paragraphs: [
          'W Twoim obecnym układzie nie ma jeszcze żadnego rezystora. Na rezystorze energia elektryczna zamienia się w ciepło zgodnie z prawem Joule’a-Lenza: $P = U \\cdot I = I^2 R = U^2 / R$.',
        ],
        formulas: ['P = I^2 \\cdot R = \\frac{U^2}{R}'],
      };
    }

    const lines = resistorResults.map((r) => {
      const iVal = sim.regime === 'AC' && r.currentAC ? r.currentAC.mag : Math.abs(r.currentDC);
      const uVal = sim.regime === 'AC' && r.voltageDropAC ? r.voltageDropAC.mag : Math.abs(r.voltageDropDC);
      return `• Rezystor ${r.label} ($R = ${formatWithBestPrefix(r.resistanceR || 0, 'Ω', 2).formatted}$): płynie przez niego prąd $I = ${formatWithBestPrefix(iVal, 'A', 2).latex}$ przy spadku napięcia $U = ${formatWithBestPrefix(uVal, 'V', 2).latex}$, co daje moc czynną $P = ${formatWithBestPrefix(r.activePowerP, 'W', 2).latex}$.`;
    });

    return {
      title: 'Dlaczego na rezystorach w Twoim układzie wydziela się taka moc?',
      paragraphs: [
        'Moc czynna $P\\,[\\text{W}]$ wydzielana na każdym rezystorze w postaci ciepła zależy od kwadratu płynącego przez niego prądu ($P = I^2 R$) lub kwadratu spadku napięcia ($P = U^2 / R$):',
        ...lines,
        'Zauważ: przy połączeniu szeregowym przez wszystkie rezystory płynie ten sam prąd $I$, więc większa moc wydziela się na rezystorze o WIĘKSZYM oporze ($P \\propto R$). Natomiast przy połączeniu równoległym na rezystorach panuje to samo napięcie $U$, więc większa moc wydziela się na rezystorze o MNIEJSZYM oporze ($P = U^2/R$)!',
      ],
      formulas: ['P_k = U_k \\cdot I_k = I_k^2 \\cdot R_k = \\frac{U_k^2}{R_k} \\quad [\\text{W}]'],
    };
  }

  // 6. Default: Live step-by-step explanation of the student's current circuit on the canvas
  if (components.length === 0) {
    return {
      title: 'Twój schemat jest obecnie pusty',
      paragraphs: [
        'Przeciągnij elementy z lewego przybornika na siatkę roboczą lub wybierz jeden z 8 gotowych układów z menu „Przykłady Startowe” u góry ekranu, a przeanalizuję każdy węzeł, prąd i napięcie!',
      ],
      formulas: [],
    };
  }

  const compSummary = components
    .map((c) => {
      if (c.type === 'ground') return 'Masa (GND = 0 V)';
      const prefSym = SI_PREFIXES[c.prefix]?.symbol || '';
      return `${c.label} (${c.value} ${prefSym}${c.unit})`;
    })
    .join(', ');

  const resultLines = Object.values(sim.componentResults)
    .filter((r) => r.type !== 'ground')
    .slice(0, 6)
    .map((r) => {
      const u = sim.regime === 'AC' && r.voltageDropAC ? r.voltageDropAC.mag : r.voltageDropDC;
      const i = sim.regime === 'AC' && r.currentAC ? r.currentAC.mag : r.currentDC;
      return `• ${r.label}: napięcie $U = ${formatWithBestPrefix(u, 'V', 2).latex}$, prąd $I = ${formatWithBestPrefix(i, 'A', 2).latex}$, moc czynna $P = ${formatWithBestPrefix(r.activePowerP, 'W', 2).latex}$`;
    });

  const formulas = sim.didacticSolution.fullSolution.step1_calculations
    .slice(0, 3)
    .map((s) => `${s.symbolicLatex} \\implies ${s.resultLatex}`);

  return {
    title: `Analiza Twojego aktualnego układu (${sim.regime}, ${components.length} elementów, ${wires.length} połączeń)`,
    paragraphs: [
      `Twój układ zawiera elementy: ${compSummary}.`,
      sim.didacticSolution.hint2_engineeringInsights.headline +
        ' ' +
        sim.didacticSolution.hint2_engineeringInsights.regimeExplanation,
      'Najważniejsze wyniki wyznaczone przez solver dla poszczególnych elementów:',
      ...resultLines,
      sim.validationIssues.length > 0
        ? `Uwaga dydaktyczna: ${sim.validationIssues[0].title} – ${sim.validationIssues[0].didacticTip}`
        : 'Układ jest poprawnie skonfigurowany pod względem topologicznym i posiada odniesienie masy GND.',
    ],
    formulas,
  };
}

export const AITutorPanel: React.FC<AITutorPanelProps> = ({
  components,
  wires,
  simulationResult,
  isOpen = true,
  onClose,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      title: 'Cześć! Jestem Twoim wirtualnym korepetytorem z Elektrotechniki.',
      paragraphs: [
        'Widzę na żywo Twój schemat na płótnie, wszystkie wartości elementów ($R, L, C, E, U$) oraz wyniki obliczeń solvera.',
        'Kliknij jedno z gotowych pytań poniżej, zapytaj własnymi słowami o dowolny element na schemacie lub wklej treść zadania z zeszytu, a rozwiążę je krok po kroku!',
      ],
      formulas: ['U = I \\cdot R, \\quad \\underline{Z} = R + j(\\omega L - \\frac{1}{\\omega C}), \\quad S = \\sqrt{P^2 + Q^2}'],
      timestamp: 'Teraz',
    },
  ]);

  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  const handleSend = (customQuery?: string) => {
    const q = (customQuery ?? inputText).trim();
    if (!q) return;

    if (q === 'Wklej zadanie tekstowe do analizy') {
      setInputText(SAMPLE_WORD_PROBLEM);
      return;
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      paragraphs: [q],
      timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
    };

    const reply = generateTutorResponse(q, components, wires, simulationResult);
    const botMsg: ChatMessage = {
      id: `bot-${Date.now() + 1}`,
      role: 'assistant',
      title: reply.title,
      paragraphs: reply.paragraphs,
      formulas: reply.formulas,
      timestamp: new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg, botMsg]);
    if (!customQuery) {
      setInputText('');
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-900 text-sky-600 dark:text-sky-400">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <span>Asystent AI – Korepetytor</span>
              <Sparkles className="w-3 h-3 text-amber-500" />
            </h3>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Analizuje obwód ({components.length} el.) i zadania tekstowe
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setMessages((prev) => [prev[0]])}
            className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Wyczyść historię rozmowy"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              title="Zamknij panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="px-3 py-2 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-950">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 flex items-center gap-1">
          <HelpCircle className="w-3 h-3 text-zinc-400" />
          <span>Szybkie pytania (kliknij):</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleSend(prompt)}
              className="px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 transition-colors text-left"
            >
              {prompt === 'Wklej zadanie tekstowe do analizy' ? (
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                  <FileText className="w-3 h-3" />
                  {prompt}
                </span>
              ) : (
                prompt
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[92%] rounded-xl p-3 text-xs space-y-1.5 ${
                msg.role === 'user'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-tr-xs shadow-xs'
                  : 'bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 rounded-tl-xs'
              }`}
            >
              {msg.title && (
                <div className="font-semibold text-zinc-900 dark:text-zinc-100 text-xs flex items-center gap-1.5 border-b border-zinc-200 dark:border-zinc-800 pb-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{msg.title}</span>
                </div>
              )}

              <div className="space-y-1 leading-relaxed">
                {msg.paragraphs.map((p, idx) => (
                  <p key={idx}>
                    <RichTextWithMath text={p} />
                  </p>
                ))}
              </div>

              {msg.formulas && msg.formulas.length > 0 && (
                <div className="space-y-1 pt-1">
                  {msg.formulas.map((f, fIdx) => (
                    <div
                      key={fIdx}
                      className="p-2 rounded-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-center"
                    >
                      <MathFormula math={f} block />
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`text-[10px] text-right ${
                  msg.role === 'user' ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400'
                }`}
              >
                {msg.timestamp}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-2.5 bg-zinc-50/50 dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800">
        <div className="flex items-end gap-1.5">
          <textarea
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Zadaj pytanie lub wklej zadanie (np. U = 230 V, f = 50 Hz, R = 30 Ω)..."
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-sky-500 resize-none transition-colors"
          />
          <button
            onClick={() => handleSend()}
            className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium text-xs flex items-center gap-1 transition-colors shrink-0 shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Wyślij</span>
          </button>
        </div>
      </div>
    </div>
  );
};
