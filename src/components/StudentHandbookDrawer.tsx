import React, { useState, useMemo } from 'react';
import {
  X,
  BookOpen,
  Calculator,
  Triangle,
  Zap,
  Search,
  Info,
  ArrowRightLeft,
} from 'lucide-react';
import { SIPrefix } from '../types/circuit';
import {
  PHYSICAL_QUANTITIES_DICTIONARY,
  SI_PREFIXES,
  ORDERED_PREFIXES,
  toSIValue,
  formatPolishNumber,
} from '../utils/units';
import { MathFormula } from './MathFormula';
import { NumericInput } from './NumericInput';

export type HandbookTab = 'quantities' | 'prefixes' | 'ohm_rlc' | 'power_ac';

export interface StudentHandbookDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HandbookTab;
}

const AVAILABLE_BASE_UNITS = [
  { unit: 'F', namePl: 'Farad (Pojemność C)', latex: '\\text{F}' },
  { unit: 'Ω', namePl: 'Om (Rezystancja R / Reaktancja X)', latex: '\\Omega' },
  { unit: 'H', namePl: 'Henr (Indukcyjność L)', latex: '\\text{H}' },
  { unit: 'A', namePl: 'Amper (Natężenie prądu I)', latex: '\\text{A}' },
  { unit: 'V', namePl: 'Wolt (Napięcie U)', latex: '\\text{V}' },
  { unit: 'W', namePl: 'Wat (Moc czynna P)', latex: '\\text{W}' },
  { unit: 'Hz', namePl: 'Herc (Częstotliwość f)', latex: '\\text{Hz}' },
  { unit: 's', namePl: 'Sekunda (Czas / Okres T)', latex: '\\text{s}' },
];

export const StudentHandbookDrawer: React.FC<StudentHandbookDrawerProps> = ({
  isOpen,
  onClose,
  initialTab = 'quantities',
}) => {
  const [activeTab, setActiveTab] = useState<HandbookTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');

  // State for Interactive SI Unit Converter
  const [convInputVal, setConvInputVal] = useState<number>(470);
  const [convPrefix, setConvPrefix] = useState<SIPrefix>('n');
  const [convUnit, setConvUnit] = useState<string>('F');

  // State for Interactive Ohm's Law Triangle
  const [ohmSelected, setOhmSelected] = useState<'U' | 'I' | 'R'>('U');
  const [ohmU, setOhmU] = useState<number>(12);
  const [ohmI, setOhmI] = useState<number>(0.006);
  const [ohmR, setOhmR] = useState<number>(2000);

  // State for Interactive Power Triangle
  const [powerPhiDeg, setPowerPhiDeg] = useState<number>(36.87);

  const quantitiesList = useMemo(() => {
    const all = Object.values(PHYSICAL_QUANTITIES_DICTIONARY);
    if (!searchQuery.trim()) return all;
    const q = searchQuery.toLowerCase();
    return all.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) ||
        item.namePl.toLowerCase().includes(q) ||
        item.unitNamePl.toLowerCase().includes(q) ||
        item.unitSymbol.toLowerCase().includes(q) ||
        item.shortTooltip.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  const baseSIVal = useMemo(() => {
    return toSIValue(convInputVal, convPrefix);
  }, [convInputVal, convPrefix]);

  const unitLatex = useMemo(() => {
    return convUnit === 'Ω' ? '\\Omega' : `\\text{${convUnit}}`;
  }, [convUnit]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/60 backdrop-blur-xs animate-fadeIn">
      <div
        className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 h-full flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-sky-600 dark:text-sky-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Niezbędnik Studenta Elektrotechniki
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Wielkości, jednostki SI, przedrostki, Prawo Ohma oraz trójkąt mocy
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            title="Zamknij niezbędnik"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1 px-5 py-2 bg-zinc-50/50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('quantities')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'quantities'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>1. Wielkości fizyczne i SI</span>
          </button>

          <button
            onClick={() => setActiveTab('prefixes')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'prefixes'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>2. Przedrostki SI i Przelicznik</span>
          </button>

          <button
            onClick={() => setActiveTab('ohm_rlc')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'ohm_rlc'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Triangle className="w-3.5 h-3.5" />
            <span>3. Prawo Ohma i Układy RLC</span>
          </button>

          <button
            onClick={() => setActiveTab('power_ac')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'power_ac'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs font-semibold'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>4. Trójkąt Mocy (P, Q, S) i AC</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* TAB 1: WIELKOŚCI FIZYCZNE I JEDNOSTKI SI */}
          {activeTab === 'quantities' && (
            <div className="space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50 dark:bg-zinc-950 p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Słownik wielkości elektrycznych i jednostek układu SI
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Najedź na dowolną wielkość w aplikacji lub znajdź ją w poniższej tabeli:
                  </p>
                </div>
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Szukaj (np. war, reaktancja)..."
                    className="w-full pl-8 pr-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                      <th className="py-2.5 px-3 font-semibold">Symbol</th>
                      <th className="py-2.5 px-3 font-semibold">Nazwa wielkości</th>
                      <th className="py-2.5 px-3 font-semibold">Jednostka SI</th>
                      <th className="py-2.5 px-3 font-semibold">Wzór podstawowy</th>
                      <th className="py-2.5 px-3 font-semibold">Wyjaśnienie dydaktyczne</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                    {quantitiesList.map((item) => (
                      <tr key={item.symbol} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors">
                        <td className="py-2.5 px-3 font-mono font-bold text-sky-600 dark:text-sky-400 text-xs whitespace-nowrap">
                          <MathFormula math={item.symbolLatex} />
                        </td>
                        <td className="py-2.5 px-3 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          {item.namePl}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700">
                            <MathFormula math={`[${item.unitLatex}]`} />
                            <span className="text-[10px] text-zinc-500 font-sans">
                              ({item.unitNamePl})
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <MathFormula math={item.formulaLatex} />
                        </td>
                        <td className="py-2.5 px-3 text-zinc-600 dark:text-zinc-400 leading-snug">
                          <p>{item.shortTooltip}</p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {item.detailedExplanation}
                          </p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: PRZEDROSTKI SI I KALKULATOR JEDNOSTEK */}
          {activeTab === 'prefixes' && (
            <div className="space-y-4">
              {/* Interactive Live Unit Converter */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-emerald-500" />
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Interaktywny Przelicznik Przedrostków SI
                  </h3>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Wpisz dowolną wartość z zadania, aby natychmiast zobaczyć przeliczenie na jednostkę podstawową SI (Krok 0) oraz wszystkie pozostałe przedrostki:
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                      Wartość liczbowa:
                    </label>
                    <NumericInput
                      value={convInputVal}
                      onChange={setConvInputVal}
                      className="w-full px-2.5 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                      placeholder="np. 470"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                      Przedrostek wejściowy:
                    </label>
                    <select
                      value={convPrefix}
                      onChange={(e) => setConvPrefix(e.target.value as SIPrefix)}
                      className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                    >
                      {ORDERED_PREFIXES.map((p) => {
                        const meta = SI_PREFIXES[p];
                        return (
                          <option key={p} value={p}>
                            {meta.symbol ? `${meta.symbol} (${meta.namePl}, 10^${meta.power})` : '(brak – jednostka podstawowa 10^0)'}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
                      Jednostka fizyczna:
                    </label>
                    <select
                      value={convUnit}
                      onChange={(e) => setConvUnit(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                    >
                      {AVAILABLE_BASE_UNITS.map((u) => (
                        <option key={u.unit} value={u.unit}>
                          [{u.unit}] – {u.namePl}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Highlighted Base SI Result */}
                <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 dark:text-zinc-400 block">
                      Zapis w jednostce podstawowej SI:
                    </span>
                    <div className="text-sm mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">
                      <MathFormula
                        math={`${formatPolishNumber(convInputVal, 4)}\\,${
                          SI_PREFIXES[convPrefix].latexSymbol
                        }${unitLatex} = ${formatPolishNumber(convInputVal, 4)} \\cdot 10^{${
                          SI_PREFIXES[convPrefix].power
                        }}\\,${unitLatex} = ${
                          Math.abs(baseSIVal) >= 1e-4 && Math.abs(baseSIVal) < 1e6
                            ? `${formatPolishNumber(baseSIVal, 6)}\\,${unitLatex}`
                            : `${baseSIVal.toExponential(4).replace('.', ',')}\\,${unitLatex}`
                        }`}
                      />
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] font-mono border border-zinc-200 dark:border-zinc-700">
                    10^{SI_PREFIXES[convPrefix].power} ({SI_PREFIXES[convPrefix].namePl})
                  </div>
                </div>

                {/* Grid of all prefixes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ORDERED_PREFIXES.map((targetPrefix) => {
                    const meta = SI_PREFIXES[targetPrefix];
                    const convertedVal = baseSIVal / meta.multiplier;
                    const isCurrent = targetPrefix === convPrefix;
                    const displayStr =
                      Math.abs(convertedVal) >= 1e-3 && Math.abs(convertedVal) < 1e6
                        ? formatPolishNumber(convertedVal, 4)
                        : convertedVal === 0
                        ? '0'
                        : convertedVal.toExponential(2).replace('.', ',');

                    return (
                      <div
                        key={targetPrefix}
                        className={`p-2.5 rounded-lg border text-xs transition-colors ${
                          isCurrent
                            ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 font-semibold'
                            : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
                          <span>{meta.symbol || 'podst.'} ({meta.namePl})</span>
                          <span className="font-mono">10^{meta.power}</span>
                        </div>
                        <div className="text-xs font-mono font-bold truncate">
                          {displayStr} {meta.symbol}{convUnit}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reference Table of SI Prefixes */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                <div className="px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Tabela przedrostków układu SI w elektrotechnice
                  </h4>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 text-[11px] bg-zinc-50/40 dark:bg-zinc-950">
                      <th className="py-2 px-3 font-semibold">Przedrostek</th>
                      <th className="py-2 px-3 font-semibold">Symbol</th>
                      <th className="py-2 px-3 font-semibold">Mnożnik</th>
                      <th className="py-2 px-3 font-semibold">Zapis dziesiętny</th>
                      <th className="py-2 px-3 font-semibold">Typowe zastosowanie</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                    <tr>
                      <td className="py-2 px-3 font-medium">piko</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">p</td>
                      <td className="py-2 px-3"><MathFormula math="10^{-12}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">0,000 000 000 001</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Kondensatory ceramiczne (np. 100 pF)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">nano</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">n</td>
                      <td className="py-2 px-3"><MathFormula math="10^{-9}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">0,000 000 001</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Kondensatory foliowe i filtry (np. 100 nF)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">mikro</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">μ (u)</td>
                      <td className="py-2 px-3"><MathFormula math="10^{-6}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">0,000 001</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Kondensatory elektrolityczne (np. 10 μF), mikroampery</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">mili</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">m</td>
                      <td className="py-2 px-3"><MathFormula math="10^{-3}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">0,001</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Prądy gałęziowe (15 mA), cewki (100 mH)</td>
                    </tr>
                    <tr className="bg-zinc-100/60 dark:bg-zinc-900/60">
                      <td className="py-2 px-3 font-semibold text-zinc-900 dark:text-zinc-100">(podstawowa)</td>
                      <td className="py-2 px-3 font-mono font-bold text-zinc-900 dark:text-zinc-100">–</td>
                      <td className="py-2 px-3"><MathFormula math="10^{0} = 1" /></td>
                      <td className="py-2 px-3 font-mono font-semibold text-[11px]">1</td>
                      <td className="py-2 px-3 font-medium text-zinc-800 dark:text-zinc-200">
                        Wartość we wzorach fizycznych (V, A, Ω, F, H, W)!
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">kilo</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">k</td>
                      <td className="py-2 px-3"><MathFormula math="10^{3}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">1 000</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Rezystory (4,7 kΩ), częstotliwość akustyczna (1 kHz)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">mega</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">M</td>
                      <td className="py-2 px-3"><MathFormula math="10^{6}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">1 000 000</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Rezystory wysokoomowe (1 MΩ), sygnały radiowe (MHz)</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-medium">giga</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">G</td>
                      <td className="py-2 px-3"><MathFormula math="10^{9}" /></td>
                      <td className="py-2 px-3 font-mono text-[11px]">1 000 000 000</td>
                      <td className="py-2 px-3 text-zinc-600 dark:text-zinc-400">Taktowanie procesorów (GHz), opór izolacji (GΩ)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: TRÓJKĄT PRAWA OHMA I POŁĄCZENIA R, L, C */}
          {activeTab === 'ohm_rlc' && (
            <div className="space-y-4">
              {/* Interactive Ohm's Law Triangle */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="flex flex-col items-center justify-center">
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                    Trójkąt Prawa Ohma (kliknij wielkość szukaną)
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 text-center mb-3">
                    Wybierz szukaną literę, aby odsłonić wzór i podstawić liczby:
                  </p>

                  {/* SVG Pyramid */}
                  <svg viewBox="0 0 240 190" className="w-56 h-44 select-none">
                    {/* Top: U */}
                    <g
                      onClick={() => setOhmSelected('U')}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                    >
                      <polygon
                        points="120,15 65,95 175,95"
                        fill={ohmSelected === 'U' ? '#f59e0b' : '#3f3f46'}
                        stroke="#d97706"
                        strokeWidth="2"
                      />
                      <text x="120" y="70" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="bold">
                        U
                      </text>
                      <text x="120" y="86" textAnchor="middle" fill="#fef3c7" fontSize="10">
                        [V]
                      </text>
                    </g>

                    {/* Bottom Left: I */}
                    <g
                      onClick={() => setOhmSelected('I')}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                    >
                      <polygon
                        points="65,95 10,175 120,175 120,95"
                        fill={ohmSelected === 'I' ? '#0284c7' : '#3f3f46'}
                        stroke="#0369a1"
                        strokeWidth="2"
                      />
                      <text x="75" y="145" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="bold">
                        I
                      </text>
                      <text x="75" y="162" textAnchor="middle" fill="#e0f2fe" fontSize="10">
                        [A]
                      </text>
                    </g>

                    {/* Bottom Right: R */}
                    <g
                      onClick={() => setOhmSelected('R')}
                      className="cursor-pointer transition-opacity hover:opacity-90"
                    >
                      <polygon
                        points="120,95 120,175 230,175 175,95"
                        fill={ohmSelected === 'R' ? '#10b981' : '#3f3f46'}
                        stroke="#059669"
                        strokeWidth="2"
                      />
                      <text x="165" y="145" textAnchor="middle" fill="#ffffff" fontSize="24" fontWeight="bold">
                        R
                      </text>
                      <text x="165" y="162" textAnchor="middle" fill="#d1fae5" fontSize="10">
                        [Ω]
                      </text>
                    </g>

                    <circle cx="120" cy="135" r="9" fill="#27272a" stroke="#71717a" />
                    <text x="120" y="139" textAnchor="middle" fill="#fafafa" fontSize="14" fontWeight="bold">
                      ·
                    </text>
                  </svg>
                </div>

                {/* Mini Calculator */}
                <div className="flex flex-col justify-center space-y-3 bg-white dark:bg-zinc-900 p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs">
                  {ohmSelected === 'U' && (
                    <>
                      <div className="font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider text-[11px]">
                        Napięcie Elektryczne U [V]:
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-950 p-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-center">
                        <MathFormula math="U = I \cdot R" block />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                        Spadek napięcia na elemencie jest iloczynem prądu <MathFormula math="I\,[\text{A}]" /> i oporu <MathFormula math="R\,[\Omega]" />.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Prąd I [A]:</label>
                          <NumericInput
                            value={ohmI}
                            onChange={setOhmI}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Rezystancja R [Ω]:</label>
                          <NumericInput
                            value={ohmR}
                            onChange={setOhmR}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>
                      <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 font-semibold">
                        <MathFormula math={`U = ${formatPolishNumber(ohmI, 4)}\\,\\text{A} \\cdot ${formatPolishNumber(ohmR, 2)}\\,\\Omega = ${formatPolishNumber(ohmI * ohmR, 3)}\\,\\text{V}`} />
                      </div>
                    </>
                  )}

                  {ohmSelected === 'I' && (
                    <>
                      <div className="font-semibold text-sky-600 dark:text-sky-400 uppercase tracking-wider text-[11px]">
                        Natężenie Prądu I [A]:
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-950 p-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-center">
                        <MathFormula math="I = \frac{U}{R}" block />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                        Prąd jest proporcjonalny do napięcia <MathFormula math="U\,[\text{V}]" /> i odwrotnie proporcjonalny do oporu <MathFormula math="R\,[\Omega]" />.
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Napięcie U [V]:</label>
                          <NumericInput
                            value={ohmU}
                            onChange={setOhmU}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Rezystancja R [Ω]:</label>
                          <NumericInput
                            value={ohmR}
                            onChange={setOhmR}
                            min={0.001}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>
                      <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 font-semibold">
                        <MathFormula math={`I = \\frac{${formatPolishNumber(ohmU, 2)}\\,\\text{V}}{${formatPolishNumber(ohmR, 2)}\\,\\Omega} = ${formatPolishNumber(ohmR !== 0 ? ohmU / ohmR : 0, 5)}\\,\\text{A}`} />
                      </div>
                    </>
                  )}

                  {ohmSelected === 'R' && (
                    <>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider text-[11px]">
                        Rezystancja R [Ω]:
                      </div>
                      <div className="bg-zinc-50 dark:bg-zinc-950 p-2 rounded-md border border-zinc-200 dark:border-zinc-800 text-center">
                        <MathFormula math="R = \frac{U}{I}" block />
                      </div>
                      <p className="text-zinc-600 dark:text-zinc-400 text-[11px] leading-relaxed">
                        Opór określa stosunek napięcia do wywołanego prądu (<MathFormula math="1\,\Omega = 1\,\text{V}/\text{A}" />).
                      </p>
                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Napięcie U [V]:</label>
                          <NumericInput
                            value={ohmU}
                            onChange={setOhmU}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-400 block mb-1">Prąd I [A]:</label>
                          <NumericInput
                            value={ohmI}
                            onChange={setOhmI}
                            min={0.00001}
                            className="w-full px-2 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>
                      <div className="font-mono text-xs text-zinc-800 dark:text-zinc-200 font-semibold">
                        <MathFormula math={`R = \\frac{${formatPolishNumber(ohmU, 2)}\\,\\text{V}}{${formatPolishNumber(ohmI, 5)}\\,\\text{A}} = ${formatPolishNumber(ohmI !== 0 ? ohmU / ohmI : 0, 2)}\\,\\Omega`} />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Comparison Table: Series & Parallel Connections of R, L, C */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
                <div className="px-3.5 py-2.5 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800">
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Łączenie szeregowe i równoległe elementów R, L oraz C
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50/50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                        <th className="py-2.5 px-3 font-semibold">Element</th>
                        <th className="py-2.5 px-3 font-semibold">Szeregowo (wspólny prąd I)</th>
                        <th className="py-2.5 px-3 font-semibold">Równolegle (wspólne napięcie U)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                      <tr>
                        <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          Rezystory (<MathFormula math="R\,[\Omega]" />)
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="R_z = R_1 + R_2 + \dots + R_n" block />
                          <span className="text-[11px] text-zinc-500">Opór rośnie liniowo.</span>
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="R_{12} = \frac{R_1 \cdot R_2}{R_1 + R_2}" block />
                          <span className="text-[11px] text-zinc-500">Opór jest mniejszy niż najmniejszy rezystor.</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          Cewki (<MathFormula math="L\,[\text{H}]" />)
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="L_z = L_1 + L_2 + \dots + L_n" block />
                          <span className="text-[11px] text-zinc-500">Identycznie jak rezystory (<MathFormula math="X_L = \omega L" />).</span>
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="L_{12} = \frac{L_1 \cdot L_2}{L_1 + L_2}" block />
                        </td>
                      </tr>
                      <tr className="bg-zinc-50/70 dark:bg-zinc-900/40">
                        <td className="py-3 px-3 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                          Kondensatory (<MathFormula math="C\,[\text{F}]" />)
                          <span className="block text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                            Odwrotnie niż rezystory!
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="C_{12} = \frac{C_1 \cdot C_2}{C_1 + C_2}" block />
                          <span className="text-[11px] text-zinc-500">
                            Szeregowo pojemność maleje (<MathFormula math="X_C = \frac{1}{\omega C}" />).
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <MathFormula math="C_z = C_1 + C_2 + \dots + C_n" block />
                          <span className="text-[11px] text-zinc-500">
                            Równolegle powierzchnia okładek rośnie – pojemność się sumuje!
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRÓJKĄT MOCY (P, Q, S) I UKŁADY AKTYWNE */}
          {activeTab === 'power_ac' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div>
                  <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                    Trójkąt Mocy w Obwodach AC
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">
                    Przesunięcie fazowe między prądem a napięciem o kąt <MathFormula math="\varphi" /> tworzy 3 składowe mocy:
                  </p>

                  {/* Interactive slider for phi */}
                  <div className="mb-3 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-600 dark:text-zinc-400">Kąt fazowy φ:</span>
                      <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatPolishNumber(powerPhiDeg, 1)}° (cos φ = {formatPolishNumber(Math.cos((powerPhiDeg * Math.PI) / 180), 2)})
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-75"
                      max="75"
                      step="1"
                      value={powerPhiDeg}
                      onChange={(e) => setPowerPhiDeg(parseFloat(e.target.value))}
                      className="w-full accent-sky-500"
                    />
                  </div>

                  {/* SVG Power Triangle */}
                  <div className="flex justify-center bg-white dark:bg-zinc-900 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    {(() => {
                      const rad = (powerPhiDeg * Math.PI) / 180;
                      const pLen = 140 * Math.cos(rad);
                      const qLen = 100 * Math.sin(rad);
                      const x0 = 35;
                      const y0 = 95;
                      const x1 = x0 + Math.max(35, pLen);
                      const y1 = y0 - qLen;
                      return (
                        <svg viewBox="0 0 240 190" className="w-56 h-40">
                          <line x1={x0} y1={y0} x2={x1} y2={y0} stroke="#10b981" strokeWidth="3" />
                          <line x1={x1} y1={y0} x2={x1} y2={y1} stroke="#0284c7" strokeWidth="3" />
                          <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#8b5cf6" strokeWidth="3" />

                          <text x={(x0 + x1) / 2} y={y0 + 16} textAnchor="middle" fill="#10b981" fontSize="11" fontWeight="bold">
                            P [W]
                          </text>
                          <text x={x1 + 6} y={(y0 + y1) / 2} fill="#0284c7" fontSize="11" fontWeight="bold">
                            Q [var]
                          </text>
                          <text x={(x0 + x1) / 2 - 12} y={(y0 + y1) / 2 - 6} fill="#8b5cf6" fontSize="11" fontWeight="bold">
                            S [VA]
                          </text>
                        </svg>
                      );
                    })()}
                  </div>
                </div>

                <div className="space-y-2.5 flex flex-col justify-center">
                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-l-3 border-l-emerald-500">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-0.5">
                      1. Moc czynna P – jednostka: wat [W]
                    </div>
                    <MathFormula math="P = U \cdot I \cdot \cos\varphi = I^2 R" block />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Moc zamieniana nieodwracalnie na ciepło lub pracę (tylko na rezystancjach <MathFormula math="R" />).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-l-3 border-l-sky-500">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-0.5">
                      2. Moc bierna Q – jednostka: war [var]
                    </div>
                    <MathFormula math="Q = U \cdot I \cdot \sin\varphi = I^2 (X_L - X_C)" block />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Moc pulsująca między źródłem a polem magnetycznym cewki (<MathFormula math="Q > 0" />) lub polem elektrycznym kondensatora (<MathFormula math="Q < 0" />).
                    </p>
                  </div>

                  <div className="p-3 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-l-3 border-l-purple-500">
                    <div className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 mb-0.5">
                      3. Moc pozorna S – jednostka: woltamper [VA]
                    </div>
                    <MathFormula math="S = U \cdot I = \sqrt{P^2 + Q^2}, \quad \cos\varphi = \frac{P}{S}" block />
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      Określa obciążenie sieci zasilającej i transformatorów.
                    </p>
                  </div>
                </div>
              </div>

              {/* Op-Amp & NE555 Cheat Sheet */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <Info className="w-3.5 h-3.5 text-sky-500" />
                    Idealny Wzmacniacz Operacyjny (Op-Amp)
                  </div>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                    <li>
                      <strong>Zerowe prądy wejściowe:</strong> <MathFormula math="I_+ = I_- = 0\,\text{A}" />.
                    </li>
                    <li>
                      <strong>Wirtualne zwarcie:</strong> Przy ujemnym sprzężeniu <MathFormula math="V_+ = V_-" />.
                    </li>
                    <li>
                      <strong>Wzmacniacz odwracający:</strong> <MathFormula math="U_{\text{wy}} = -\frac{R_f}{R_1} U_{\text{we}}" />
                    </li>
                    <li>
                      <strong>Wzmacniacz nieodwracający:</strong> <MathFormula math="U_{\text{wy}} = \left(1 + \frac{R_f}{R_1}\right) U_{\text{we}}" />
                    </li>
                  </ul>
                </div>

                <div className="p-3.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    <Info className="w-3.5 h-3.5 text-amber-500" />
                    Timer NE555 (Tryb Astabilny)
                  </div>
                  <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-1 list-disc list-inside">
                    <li>
                      Czas ładowania: <MathFormula math="t_H \approx 0{,}693 (R_A + R_B) C" />
                    </li>
                    <li>
                      Czas rozładowania: <MathFormula math="t_L \approx 0{,}693 R_B C" />
                    </li>
                    <li>
                      Częstotliwość: <MathFormula math="f \approx \frac{1{,}44}{(R_A + 2 R_B) C}" />
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
