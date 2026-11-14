import { SIPrefix, ComplexValue } from '../types/circuit';

export interface PrefixMeta {
  prefix: SIPrefix;
  symbol: string;
  latexSymbol: string;
  namePl: string;
  power: number;
  multiplier: number;
}

export const SI_PREFIXES: Record<SIPrefix, PrefixMeta> = {
  p: { prefix: 'p', symbol: 'p', latexSymbol: '\\text{p}', namePl: 'piko', power: -12, multiplier: 1e-12 },
  n: { prefix: 'n', symbol: 'n', latexSymbol: '\\text{n}', namePl: 'nano', power: -9, multiplier: 1e-9 },
  u: { prefix: 'u', symbol: 'μ', latexSymbol: '\\mu', namePl: 'mikro', power: -6, multiplier: 1e-6 },
  m: { prefix: 'm', symbol: 'm', latexSymbol: '\\text{m}', namePl: 'mili', power: -3, multiplier: 1e-3 },
  '': { prefix: '', symbol: '', latexSymbol: '', namePl: '(jednostka podstawowa)', power: 0, multiplier: 1 },
  k: { prefix: 'k', symbol: 'k', latexSymbol: '\\text{k}', namePl: 'kilo', power: 3, multiplier: 1e3 },
  M: { prefix: 'M', symbol: 'M', latexSymbol: '\\text{M}', namePl: 'mega', power: 6, multiplier: 1e6 },
  G: { prefix: 'G', symbol: 'G', latexSymbol: '\\text{G}', namePl: 'giga', power: 9, multiplier: 1e9 },
};

export const ORDERED_PREFIXES: SIPrefix[] = ['p', 'n', 'u', 'm', '', 'k', 'M', 'G'];

export function toSIValue(value: number, prefix: SIPrefix = ''): number {
  const meta = SI_PREFIXES[prefix] || SI_PREFIXES[''];
  return value * meta.multiplier;
}

export function formatPolishNumber(num: number, decimals = 3): string {
  if (!Number.isFinite(num)) return '∞';
  if (Math.abs(num) < 1e-15) return '0';
  const rounded = Number(num.toFixed(decimals));
  return rounded.toString().replace('.', ',');
}

/**
 * Automatically picks the best SI prefix for displaying a value in engineering notation
 * e.g. 0.0025 A -> "2,5 mA" (along with its base unit representation "0,0025 A")
 */
export function formatWithBestPrefix(
  siValue: number,
  unit: string,
  decimals = 2
): {
  formatted: string;
  baseFormatted: string;
  scaledValue: number;
  prefix: SIPrefix;
  prefixSymbol: string;
  latex: string;
  baseLatex: string;
} {
  const unitLatex = unit === 'Ω' ? '\\Omega' : `\\text{${unit}}`;

  if (!Number.isFinite(siValue)) {
    return {
      formatted: `∞ ${unit}`,
      baseFormatted: `∞ ${unit}`,
      scaledValue: Infinity,
      prefix: '',
      prefixSymbol: '',
      latex: `\\infty\\,${unitLatex}`,
      baseLatex: `\\infty\\,${unitLatex}`,
    };
  }

  const absVal = Math.abs(siValue);
  if (absVal < 1e-15) {
    return {
      formatted: `0 ${unit}`,
      baseFormatted: `0 ${unit}`,
      scaledValue: 0,
      prefix: '',
      prefixSymbol: '',
      latex: `0\\,${unitLatex}`,
      baseLatex: `0\\,${unitLatex}`,
    };
  }

  let chosenPrefix: SIPrefix = '';
  for (let i = ORDERED_PREFIXES.length - 1; i >= 0; i--) {
    const p = ORDERED_PREFIXES[i];
    const mult = SI_PREFIXES[p].multiplier;
    if (absVal >= mult * 0.9999) {
      chosenPrefix = p;
      break;
    }
  }
  if (absVal < 1e-12) {
    chosenPrefix = 'p';
  }

  const meta = SI_PREFIXES[chosenPrefix];
  const scaled = siValue / meta.multiplier;
  const scaledStr = formatPolishNumber(scaled, decimals);

  // Format base value cleanly
  let baseStr: string;
  let baseLatexNum: string;
  if (absVal >= 1e-3 && absVal < 1e5) {
    baseStr = formatPolishNumber(siValue, 4);
    baseLatexNum = baseStr;
  } else {
    const exp = Math.floor(Math.log10(absVal));
    const mantissa = siValue / Math.pow(10, exp);
    const mantissaStr = formatPolishNumber(mantissa, 2);
    baseStr = `${mantissaStr}·10^${exp}`;
    baseLatexNum = `${mantissaStr} \\cdot 10^{${exp}}`;
  }

  const fullUnitLatex = meta.latexSymbol ? `${meta.latexSymbol}${unitLatex}` : unitLatex;

  return {
    formatted: `${scaledStr} ${meta.symbol}${unit}`.trim(),
    baseFormatted: `${baseStr} ${unit}`.trim(),
    scaledValue: scaled,
    prefix: chosenPrefix,
    prefixSymbol: meta.symbol,
    latex: `${scaledStr}\\,${fullUnitLatex}`,
    baseLatex: `${baseLatexNum}\\,${unitLatex}`,
  };
}

export function formatComplexAlgebraicLatex(c: ComplexValue, unit: string, decimals = 2): string {
  const unitLatex = unit === 'Ω' ? '\\Omega' : `\\text{${unit}}`;
  const reStr = formatPolishNumber(c.re, decimals);
  const absIm = Math.abs(c.im);
  const imStr = formatPolishNumber(absIm, decimals);
  if (absIm < 1e-12) {
    return `${reStr}\\,${unitLatex}`;
  }
  if (Math.abs(c.re) < 1e-12) {
    const sign = c.im < 0 ? '-' : '';
    return `${sign}j${imStr}\\,${unitLatex}`;
  }
  const op = c.im >= 0 ? '+' : '-';
  return `(${reStr} ${op} j${imStr})\\,${unitLatex}`;
}

export function formatComplexExponentialLatex(c: ComplexValue, unit: string, decimals = 2): string {
  const bestMag = formatWithBestPrefix(c.mag, unit, decimals);
  const phaseStr = formatPolishNumber(c.phaseDeg, 1);
  return `${bestMag.latex} \\cdot e^{j${phaseStr}^\\circ}`;
}

/**
 * Physical Quantities Glossary for tooltips and Niezbędnik Studenta
 */
export interface PhysicalQuantityInfo {
  symbol: string;
  symbolLatex: string;
  namePl: string;
  unitNamePl: string;
  unitSymbol: string;
  unitLatex: string;
  formulaLatex: string;
  shortTooltip: string;
  detailedExplanation: string;
}

export const PHYSICAL_QUANTITIES_DICTIONARY: Record<string, PhysicalQuantityInfo> = {
  U: {
    symbol: 'U',
    symbolLatex: 'U',
    namePl: 'Napięcie elektryczne (spadek napięcia)',
    unitNamePl: 'wolt',
    unitSymbol: 'V',
    unitLatex: '\\text{V}',
    formulaLatex: 'U = V_A - V_B = I \\cdot R',
    shortTooltip: 'Napięcie elektryczne [V] (wolt) – różnica potencjałów elektrycznych między dwoma punktami obwodu; „ciśnienie elektryczne” wymuszające przepływ prądu.',
    detailedExplanation: 'Napięcie określa pracę wykonaną przy przenoszeniu jednostkowego ładunku 1 kulomba (1 V = 1 J/C). Mierzymy je woltomierzem podłączonym równolegle do badanego elementu.',
  },
  I: {
    symbol: 'I',
    symbolLatex: 'I',
    namePl: 'Natężenie prądu elektrycznego',
    unitNamePl: 'amper',
    unitSymbol: 'A',
    unitLatex: '\\text{A}',
    formulaLatex: 'I = \\frac{Q_e}{t} = \\frac{U}{R}',
    shortTooltip: 'Natężenie prądu [A] (amper) – ilość ładunku elektrycznego (w kulombach), jaka przepływa przez przekrój poprzeczny przewodnika w ciągu 1 sekundy (1 A = 1 C/s).',
    detailedExplanation: 'Umowny kierunek prądu przyjmuje się od potencjału wyższego (+) do niższego (-). Mierzymy je amperomierzem włączonym szeregowo w gałąź.',
  },
  R: {
    symbol: 'R',
    symbolLatex: 'R',
    namePl: 'Rezystancja (opór czynny)',
    unitNamePl: 'om',
    unitSymbol: 'Ω',
    unitLatex: '\\Omega',
    formulaLatex: 'R = \\frac{U}{I}',
    shortTooltip: 'Rezystancja [Ω] (om) – opór elektryczny przeciwstawiany przepływowi prądu stałego i przemiennego; zamienia energię elektryczną bezpowrotnie w ciepło.',
    detailedExplanation: 'Zgodnie z Prawem Ohma opór 1 oma występuje wtedy, gdy napięcie 1 V wywołuje przepływ prądu o natężeniu 1 A.',
  },
  G: {
    symbol: 'G',
    symbolLatex: 'G',
    namePl: 'Konduktancja (przewodność czynna)',
    unitNamePl: 'simens',
    unitSymbol: 'S',
    unitLatex: '\\text{S}',
    formulaLatex: 'G = \\frac{1}{R} = \\frac{I}{U}',
    shortTooltip: 'Konduktancja [S] (simens) – odwrotność rezystancji (1 S = 1/Ω). Określa, jak dobrze element przewodzi prąd elektryczny.',
    detailedExplanation: 'Szczególnie przydatna przy obliczaniu połączeń równoległych oraz w metodzie potencjałów węzłowych (gdzie sumujemy konduktancje zbiegające się w węźle).',
  },
  L: {
    symbol: 'L',
    symbolLatex: 'L',
    namePl: 'Indukcyjność',
    unitNamePl: 'henr',
    unitSymbol: 'H',
    unitLatex: '\\text{H}',
    formulaLatex: 'u_L(t) = L \\frac{di_L(t)}{dt}',
    shortTooltip: 'Indukcyjność [H] (henr) – zdolność cewki do gromadzenia energii w polu magnetycznym i przeciwstawiania się zmianom natężenia prądu.',
    detailedExplanation: 'W stanie ustalonym dla prądu stałego (DC) idealna cewka stanowi zwarcie (XL = 0 Ω). Dla prądu przemiennego (AC) wykazuje opór bierny rosnący z częstotliwością.',
  },
  XL: {
    symbol: 'X_L',
    symbolLatex: 'X_L',
    namePl: 'Reaktancja indukcyjna (opór bierny cewki)',
    unitNamePl: 'om',
    unitSymbol: 'Ω',
    unitLatex: '\\Omega',
    formulaLatex: 'X_L = \\omega L = 2\\pi f L',
    shortTooltip: 'Reaktancja indukcyjna [Ω] (om) – opór bierny stawiany przez cewkę prądowi przemiennemu. Rośnie liniowo ze wzrostem częstotliwości f.',
    detailedExplanation: 'Na idealnej cewce napięcie wyprzedza prąd w fazie o 90° (+π/2 rad). Impedancja zespolona cewki wynosi Z_L = j·X_L.',
  },
  C: {
    symbol: 'C',
    symbolLatex: 'C',
    namePl: 'Pojemność elektryczna',
    unitNamePl: 'farad',
    unitSymbol: 'F',
    unitLatex: '\\text{F}',
    formulaLatex: 'C = \\frac{Q_e}{U}, \\quad i_C(t) = C \\frac{du_C(t)}{dt}',
    shortTooltip: 'Pojemność [F] (farad) – zdolność kondensatora do gromadzenia ładunku elektrycznego i energii w polu elektrycznym przy zadanym napięciu.',
    detailedExplanation: 'W stanie ustalonym DC idealny kondensator stanowi rozwarcie (przerwę w obwodzie, I_C = 0 A). W obwodach AC przewodzi prąd przemienny dzięki cyklicznemu przeładowywaniu okładek.',
  },
  XC: {
    symbol: 'X_C',
    symbolLatex: 'X_C',
    namePl: 'Reaktancja pojemnościowa (opór bierny kondensatora)',
    unitNamePl: 'om',
    unitSymbol: 'Ω',
    unitLatex: '\\Omega',
    formulaLatex: 'X_C = \\frac{1}{\\omega C} = \\frac{1}{2\\pi f C}',
    shortTooltip: 'Reaktancja pojemnościowa [Ω] (om) – opór bierny kondensatora w obwodzie AC. Maleje wraz ze wzrostem częstotliwości f (dla DC dąży do nieskończoności).',
    detailedExplanation: 'Na idealnym kondensatorze prąd wyprzedza napięcie o 90° (napięcie opóźnia się względem prądu o 90°). Impedancja zespolona wynosi Z_C = -j·X_C = 1/(jωC).',
  },
  Z: {
    symbol: 'Z',
    symbolLatex: '\\underline{Z}',
    namePl: 'Impedancja zespolona (opór pozorny)',
    unitNamePl: 'om',
    unitSymbol: 'Ω',
    unitLatex: '\\Omega',
    formulaLatex: '\\underline{Z} = R + jX = |Z|e^{j\\varphi}, \\quad |Z| = \\sqrt{R^2 + X^2}',
    shortTooltip: 'Impedancja [Ω] (om) – całkowity, uogólniony opór elementu lub obwodu dla prądu przemiennego AC, uwzględniający część czynną (R) i bierną (X = X_L - X_C).',
    detailedExplanation: 'Moduł impedancji |Z| = U_sk / I_sk mówi o stosunku skutecznych wartości napięcia i prądu, a argument φ określa przesunięcie fazowe między napięciem a prądem.',
  },
  Y: {
    symbol: 'Y',
    symbolLatex: '\\underline{Y}',
    namePl: 'Admitancja zespolona (przewodność pozorna)',
    unitNamePl: 'simens',
    unitSymbol: 'S',
    unitLatex: '\\text{S}',
    formulaLatex: '\\underline{Y} = \\frac{1}{\\underline{Z}} = G + jB',
    shortTooltip: 'Admitancja [S] (simens) – odwrotność impedancji zespolonej (Y = 1/Z). Składa się z konduktancji G (część rzeczywista) i susceptancji B (część urojona).',
    detailedExplanation: 'Podstawa analizy obwodów AC metodą potencjałów węzłowych (MNA) oraz przy łączeniu równoległym gałęzi prądu przemiennego.',
  },
  f: {
    symbol: 'f',
    symbolLatex: 'f',
    namePl: 'Częstotliwość',
    unitNamePl: 'herc',
    unitSymbol: 'Hz',
    unitLatex: '\\text{Hz}',
    formulaLatex: 'f = \\frac{1}{T}',
    shortTooltip: 'Częstotliwość [Hz] (herc) – liczba pełnych okresów zmian sygnału przypadająca na 1 sekundę (1 Hz = 1/s). W sieci energetycznej w Polsce f = 50 Hz.',
    detailedExplanation: 'Dla prądu stałego (DC) częstotliwość wynosi 0 Hz.',
  },
  T: {
    symbol: 'T',
    symbolLatex: 'T',
    namePl: 'Okres przebiegu',
    unitNamePl: 'sekunda',
    unitSymbol: 's',
    unitLatex: '\\text{s}',
    formulaLatex: 'T = \\frac{1}{f}',
    shortTooltip: 'Okres [s] (sekunda) – czas trwania jednego pełnego cyklu sygnału okresowego. Dla f = 50 Hz okres wynosi T = 20 ms.',
    detailedExplanation: 'Odwrotność częstotliwości.',
  },
  omega: {
    symbol: 'ω',
    symbolLatex: '\\omega',
    namePl: 'Pulsacja (częstość kątowa)',
    unitNamePl: 'radian na sekundę',
    unitSymbol: 'rad/s',
    unitLatex: '\\text{rad/s}',
    formulaLatex: '\\omega = 2\\pi f = \\frac{2\\pi}{T}',
    shortTooltip: 'Pulsacja [rad/s] – prędkość kątowa obracającego się wektora (wskazu) sinusoidalnego. Dla 50 Hz wynosi ok. 314,16 rad/s.',
    detailedExplanation: 'Łączy częstotliwość f z argumentem funkcji trygonometrycznej sin(ωt + φ) oraz ze wzorami na reaktancję X_L = ωL i X_C = 1/(ωC).',
  },
  P: {
    symbol: 'P',
    symbolLatex: 'P',
    namePl: 'Moc czynna',
    unitNamePl: 'wat',
    unitSymbol: 'W',
    unitLatex: '\\text{W}',
    formulaLatex: 'P = U \\cdot I \\cdot \\cos\\varphi = I^2 R',
    shortTooltip: 'Moc czynna [W] (wat) – moc użyteczna, która zamienia się nieodwracalnie w pracę mechaniczną, ciepło lub światło na elementach rezystancyjnych.',
    detailedExplanation: 'W obwodach DC moc wynosi po prostu P = U · I. W obwodach AC zależy także od współczynnika mocy cos(φ).',
  },
  Q: {
    symbol: 'Q',
    symbolLatex: 'Q',
    namePl: 'Moc bierna',
    unitNamePl: 'war',
    unitSymbol: 'var',
    unitLatex: '\\text{var}',
    formulaLatex: 'Q = U \\cdot I \\cdot \\sin\\varphi = I^2 X',
    shortTooltip: 'Moc bierna [var] (war – woltamper reaktancyjny) – opisuje oscylację energii krążącej między źródłem a polem magnetycznym cewki (Q > 0) lub elektrycznym kondensatora (Q < 0).',
    detailedExplanation: 'Moc bierna nie wykonuje użytecznej pracy, ale obciąża przewody przesyłowe dodatkowym prądem. Jednostką jest war [var], aby odróżnić ją od mocy czynnej [W] i pozornej [VA].',
  },
  S: {
    symbol: 'S',
    symbolLatex: 'S',
    namePl: 'Moc pozorna',
    unitNamePl: 'woltamper',
    unitSymbol: 'VA',
    unitLatex: '\\text{VA}',
    formulaLatex: 'S = U \\cdot I = \\sqrt{P^2 + Q^2}',
    shortTooltip: 'Moc pozorna [VA] (woltamper) – iloczyn wartości skutecznych napięcia i prądu; stanowi przeciwprostokątną w trójkącie mocy i określa całkowite obciążenie prądowo-napięciowe źródła.',
    detailedExplanation: 'Na transformatorach i generatorach podaje się moc znamionową właśnie w VA (lub kVA/MVA), ponieważ uzwojenia muszą wytrzymać całkowity prąd I oraz napięcie U niezależnie od kąta fazowego.',
  },
  cosPhi: {
    symbol: 'cos φ',
    symbolLatex: '\\cos\\varphi',
    namePl: 'Współczynnik mocy',
    unitNamePl: 'wielkość bezwymiarowa',
    unitSymbol: '-',
    unitLatex: '\\text{–}',
    formulaLatex: '\\cos\\varphi = \\frac{P}{S} = \\frac{R}{|Z|} \\in [0, 1]',
    shortTooltip: 'Współczynnik mocy cos(φ) [bezwymiarowy] – stosunek mocy czynnej P do mocy pozornej S. Mówi, jaka część mocy dostarczanej przez źródło jest zamieniana w pracę użyteczną.',
    detailedExplanation: 'Dla czystego rezystora cos(φ) = 1 (najkorzystniejszy przypadek). Dla idealnej cewki lub kondensatora cos(φ) = 0 (prąd i napięcie przesunięte o 90°, brak mocy czynnej).',
  },
  Qe: {
    symbol: 'Q_e',
    symbolLatex: 'Q_e',
    namePl: 'Ładunek elektryczny',
    unitNamePl: 'kulomb',
    unitSymbol: 'C',
    unitLatex: '\\text{C}',
    formulaLatex: 'Q_e = C \\cdot U = I \\cdot t',
    shortTooltip: 'Ładunek elektryczny [C] (kulomb) – podstawowa właściwość materii; 1 kulomb to ładunek przenoszony przez prąd 1 ampera w czasie 1 sekundy (1 C = 1 A·s).',
    detailedExplanation: 'Na okładkach kondensatora o pojemności C pod napięciem U gromadzi się ładunek Q_e = C · U.',
  },
  E: {
    symbol: 'E',
    symbolLatex: 'E',
    namePl: 'Energia elektryczna / magnetyczna',
    unitNamePl: 'dżul',
    unitSymbol: 'J',
    unitLatex: '\\text{J}',
    formulaLatex: 'E_C = \\frac{1}{2} C U^2, \\quad E_L = \\frac{1}{2} L I^2, \\quad E = P \\cdot t',
    shortTooltip: 'Energia [J] (dżul) – zdolność do wykonania pracy (1 J = 1 W·s). Kondensator gromadzi energię w polu elektrycznym (½CU²), a cewka w polu magnetycznym (½LI²).',
    detailedExplanation: 'Pozwala ocenić, ile energii zostało zmagazynowane w elementach reaktancyjnych układu.',
  },
};
