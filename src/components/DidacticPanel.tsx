import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
  Eye,
  Compass,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Activity,
  Cpu,
  Clock,
  Layers,
  Zap,
} from 'lucide-react';
import {
  SimulationResult,
  CircuitComponent,
  NE555Analysis,
  BodeAnalysis,
} from '../types/circuit';
import {
  formatWithBestPrefix,
  formatPolishNumber,
  formatComplexAlgebraicLatex,
} from '../utils/units';
import { MathFormula, QuantityWithTooltip } from './MathFormula';

export interface DidacticPanelProps {
  simulationResult: SimulationResult;
  components: CircuitComponent[];
  showCurrentAnimation?: boolean;
  onToggleCurrentAnimation?: () => void;
  showNodeColors?: boolean;
  onToggleNodeColors?: () => void;
  onSelectComponent?: (componentId: string) => void;
}

/**
 * Minimalist SVG Bode Plot renderer (Magnitude [dB] and Phase [°] vs log10(f))
 */
const BodePlotSVG: React.FC<{ bode: BodeAnalysis }> = ({ bode }) => {
  const { points, cutoffFreqHz, resonantFreqHz, filterType, inputLabel, outputNodeLabel } = bode;
  if (!points || points.length < 2) return null;

  const width = 620;
  const height = 260;
  const padL = 50;
  const padR = 50;
  const padT = 24;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const logMin = Math.log10(points[0].freqHz);
  const logMax = Math.log10(points[points.length - 1].freqHz);

  const dbValues = points.map((p) => p.gainDb);
  const minDb = Math.min(-40, Math.floor(Math.min(...dbValues) / 10) * 10);
  const maxDb = Math.max(10, Math.ceil(Math.max(...dbValues) / 10) * 10);

  const xOfFreq = (f: number) => {
    const lf = Math.log10(Math.max(1e-3, f));
    return padL + ((lf - logMin) / (logMax - logMin || 1)) * plotW;
  };

  const yOfDb = (db: number) => {
    const clamped = Math.max(minDb, Math.min(maxDb, db));
    return padT + ((maxDb - clamped) / (maxDb - minDb || 1)) * plotH;
  };

  const yOfPhase = (deg: number) => {
    const clamped = Math.max(-180, Math.min(180, deg));
    return padT + ((180 - clamped) / 360) * plotH;
  };

  const magPolyline = points
    .map((p) => `${xOfFreq(p.freqHz).toFixed(1)},${yOfDb(p.gainDb).toFixed(1)}`)
    .join(' ');

  const phasePolyline = points
    .map((p) => `${xOfFreq(p.freqHz).toFixed(1)},${yOfPhase(p.phaseDeg).toFixed(1)}`)
    .join(' ');

  const decadeTicks: number[] = [];
  for (let exp = Math.ceil(logMin); exp <= Math.floor(logMax); exp++) {
    decadeTicks.push(Math.pow(10, exp));
  }

  return (
    <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 space-y-2.5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-sky-500" />
            <span>Charakterystyka Bodego ({filterType || 'AC'})</span>
          </h4>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            Od źródła {inputLabel} do wyjścia {outputNodeLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {cutoffFreqHz !== undefined && (
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700">
              f_c (-3 dB) ≈ {formatWithBestPrefix(cutoffFreqHz, 'Hz', 2).formatted}
            </span>
          )}
          {resonantFreqHz !== undefined && (
            <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 font-mono text-[11px] border border-zinc-200 dark:border-zinc-700">
              f_0 (rezonans) ≈ {formatWithBestPrefix(resonantFreqHz, 'Hz', 2).formatted}
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-2xl mx-auto select-none">
          <rect x={padL} y={padT} width={plotW} height={plotH} fill="#18181b" stroke="#27272a" />

          {decadeTicks.map((f) => {
            const x = xOfFreq(f);
            return (
              <g key={f}>
                <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="#27272a" strokeDasharray="2,2" />
                <text x={x} y={height - 10} textAnchor="middle" fill="#71717a" fontSize="9">
                  {formatWithBestPrefix(f, 'Hz', 0).formatted}
                </text>
              </g>
            );
          })}

          {[0, -3, -20, -40].map((db) => {
            if (db < minDb || db > maxDb) return null;
            const y = yOfDb(db);
            return (
              <g key={db}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke={db === -3 ? '#f59e0b' : '#27272a'}
                  strokeDasharray={db === -3 ? '4,4' : undefined}
                />
                <text x={padL - 6} y={y + 3} textAnchor="end" fill={db === -3 ? '#f59e0b' : '#38bdf8'} fontSize="9">
                  {db} dB
                </text>
              </g>
            );
          })}

          {[-90, -45, 0, 45, 90].map((deg) => {
            const y = yOfPhase(deg);
            return (
              <text key={deg} x={padL + plotW + 6} y={y + 3} textAnchor="start" fill="#c084fc" fontSize="9">
                {deg}°
              </text>
            );
          })}

          {/* Phase curve */}
          <polyline
            fill="none"
            stroke="#a855f7"
            strokeWidth="1.5"
            strokeDasharray="4,2"
            points={phasePolyline}
          />

          {/* Magnitude dB curve */}
          <polyline fill="none" stroke="#0284c7" strokeWidth="2" points={magPolyline} />

          {/* Legend */}
          <g transform={`translate(${padL + 10}, ${padT + 12})`}>
            <rect x="0" y="-8" width="200" height="18" rx="3" fill="#09090b" opacity="0.8" />
            <line x1="6" y1="1" x2="22" y2="1" stroke="#0284c7" strokeWidth="2" />
            <text x="26" y="4" fill="#e4e4e7" fontSize="9">
              Amplituda [dB]
            </text>
            <line x1="110" y1="1" x2="126" y2="1" stroke="#a855f7" strokeWidth="1.5" strokeDasharray="3,2" />
            <text x="130" y="4" fill="#e4e4e7" fontSize="9">
              Faza [°]
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
};

/**
 * Dedicated NE555 Timer Results Card + Waveform SVG
 */
const NE555Card: React.FC<{ label: string; analysis: NE555Analysis }> = ({ label, analysis }) => {
  const {
    mode,
    vccVolts,
    frequencyHz,
    periodSec,
    tHighSec,
    tLowSec,
    dutyCyclePercent,
    explanation,
    formulasLatex,
  } = analysis;

  const duty = dutyCyclePercent ?? 50;
  const v13 = formatPolishNumber(vccVolts / 3, 2);
  const v23 = formatPolishNumber((2 * vccVolts) / 3, 2);

  return (
    <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 space-y-3 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-amber-500">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              Timer NE555 ({label})
            </h4>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Tryb: {mode === 'astable' ? 'Generator astabilny (przebieg prostokątny)' : mode === 'monostable' ? 'Monostabilny' : 'Nieskonfigurowany'}
            </span>
          </div>
        </div>
        <div className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[11px] text-zinc-700 dark:text-zinc-300 font-mono">
          V_{'{'}CC{'}'} = {formatPolishNumber(vccVolts, 2)} V
        </div>
      </div>

      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{explanation}</p>

      {mode === 'astable' && frequencyHz !== undefined && periodSec !== undefined && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-medium">Częstotliwość f</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {formatWithBestPrefix(frequencyHz, 'Hz', 2).formatted}
              </span>
            </div>
            <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-medium">Okres T = 1/f</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {formatWithBestPrefix(periodSec, 's', 2).formatted}
              </span>
            </div>
            <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-medium">Wypełnienie D</span>
              <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                {formatPolishNumber(duty, 1)} %
              </span>
            </div>
            <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-medium">Czas t_H (stan 1)</span>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {formatWithBestPrefix(tHighSec || 0, 's', 2).formatted}
              </span>
            </div>
            <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
              <span className="text-[10px] text-zinc-400 block uppercase font-medium">Czas t_L (stan 0)</span>
              <span className="text-xs font-bold text-sky-600 dark:text-sky-400 font-mono">
                {formatWithBestPrefix(tLowSec || 0, 's', 2).formatted}
              </span>
            </div>
          </div>

          <div className="bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
            <div className="text-[10px] text-zinc-400 mb-1.5">
              Przebiegi: <span className="text-emerald-400">U_OUT(t)</span> oraz ładowanie kondensatora <span className="text-amber-400">U_C(t)</span> między {v13} V a {v23} V:
            </div>
            {(() => {
              const cycleW = 200;
              const highW = Math.max(30, Math.min(170, (duty / 100) * cycleW));
              const xStart = 50;
              const xMid1 = xStart + highW;
              const xEnd1 = xStart + cycleW;
              const xMid2 = xEnd1 + highW;
              const xEnd2 = xEnd1 + cycleW;

              return (
                <svg viewBox="0 0 500 160" className="w-full max-w-xl mx-auto select-none">
                  <line x1={xStart} y1={30} x2={470} y2={30} stroke="#3f3f46" strokeDasharray="2,2" />
                  <text x={xStart - 6} y={33} textAnchor="end" fill="#71717a" fontSize="8">
                    2/3 VCC
                  </text>
                  <line x1={xStart} y1={65} x2={470} y2={65} stroke="#3f3f46" strokeDasharray="2,2" />
                  <text x={xStart - 6} y={68} textAnchor="end" fill="#71717a" fontSize="8">
                    1/3 VCC
                  </text>

                  {/* Capacitor voltage */}
                  <path
                    d={`M ${xStart},65 Q ${xStart + highW * 0.45},36 ${xMid1},30 Q ${xMid1 + (cycleW - highW) * 0.45},58 ${xEnd1},65 Q ${xEnd1 + highW * 0.45},36 ${xMid2},30 Q ${xMid2 + (cycleW - highW) * 0.45},58 ${xEnd2},65`}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                  />

                  {/* Square wave output */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    points={`${xStart},135 ${xStart},95 ${xMid1},95 ${xMid1},135 ${xEnd1},135 ${xEnd1},95 ${xMid2},95 ${xMid2},135 ${xEnd2},135`}
                  />
                  <text x={xStart - 6} y={100} textAnchor="end" fill="#10b981" fontSize="8">
                    HIGH
                  </text>
                  <text x={xStart - 6} y={138} textAnchor="end" fill="#71717a" fontSize="8">
                    LOW
                  </text>
                </svg>
              );
            })()}
          </div>
        </>
      )}

      {formulasLatex.length > 0 && (
        <div className="space-y-1 bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
          <div className="text-[10px] font-semibold uppercase text-zinc-500 mb-1">
            Wzory timera NE555:
          </div>
          {formulasLatex.map((f, idx) => (
            <div key={idx} className="text-xs">
              <MathFormula math={f} block />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const DidacticPanel: React.FC<DidacticPanelProps> = ({
  simulationResult,
  components,
  showCurrentAnimation = true,
  onToggleCurrentAnimation,
  showNodeColors = false,
  onToggleNodeColors,
  onSelectComponent,
}) => {
  // Mode: 'guided' (3 Podpowiedzi) vs 'instant' (Pełny wynik)
  const [didacticMode, setDidacticMode] = useState<'guided' | 'instant'>('guided');
  const [unlockedStep, setUnlockedStep] = useState<number>(1);
  const [showMnaMatrix, setShowMnaMatrix] = useState<boolean>(false);

  const {
    regime,
    validationIssues,
    didacticSolution,
    componentResults,
    bodeAnalysis,
    digitalAnalysis,
  } = simulationResult;

  const ne555Components = useMemo(() => {
    return Object.values(componentResults).filter(
      (r) => r.type === 'ne555' && r.ne555Analysis
    );
  }, [componentResults]);

  const currentDigitalInputs = useMemo(() => {
    const map: Record<string, 0 | 1> = {};
    for (const c of components) {
      if (c.type === 'logic_input' || c.type === 'clock') {
        map[c.label] = c.logicState ?? 1;
      }
    }
    return map;
  }, [components]);

  const isStepVisible = (step: number) => didacticMode === 'instant' || unlockedStep >= step;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden">
      {/* Top Bar: Mode Switcher */}
      <div className="px-3.5 py-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-sky-600 dark:text-sky-400">
            <Lightbulb className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Rozwiązanie krok po kroku
              </h2>
              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                {regime}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Wskazówki inżynierskie i przeliczenia SI
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setDidacticMode('guided')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              didacticMode === 'guided'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>3 Podpowiedzi</span>
          </button>
          <button
            onClick={() => {
              setDidacticMode('instant');
              setUnlockedStep(4);
            }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              didacticMode === 'instant'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-semibold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            <span>Pełny wynik</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* VALIDATION ISSUES & DIDACTIC WARNINGS */}
        {validationIssues.length > 0 && (
          <div className="space-y-2">
            {validationIssues.map((issue) => {
              const isErr = issue.severity === 'error';
              const isWarn = issue.severity === 'warning';
              return (
                <div
                  key={issue.id}
                  className={`p-3 rounded-lg border flex items-start gap-2.5 text-xs ${
                    isErr
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200'
                      : isWarn
                      ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
                      : 'bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-900/50 text-sky-900 dark:text-sky-200'
                  }`}
                >
                  {isErr ? (
                    <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  ) : isWarn ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="font-semibold flex items-center justify-between">
                      <span>{issue.title}</span>
                      <span className="text-[10px] uppercase font-mono opacity-70">
                        {isErr ? 'Błąd' : isWarn ? 'Uwaga' : 'Wskazówka'}
                      </span>
                    </div>
                    <p className="leading-relaxed opacity-90">{issue.explanation}</p>
                    <div className="pt-1 border-t border-black/10 dark:border-white/10 text-[11px] font-medium flex items-center gap-1 opacity-95">
                      <Lightbulb className="w-3 h-3 shrink-0" />
                      <span>{issue.didacticTip}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PROGRESS BAR FOR GUIDED MODE */}
        {didacticMode === 'guided' && (
          <div className="bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex flex-wrap items-center gap-1">
              {[
                { step: 1, label: '1. Przepływ i Węzły' },
                { step: 2, label: '2. Topologia' },
                { step: 3, label: '3. Prawa i Wzory' },
                { step: 4, label: '4. Pełne Rozwiązanie' },
              ].map((item) => {
                const active = unlockedStep >= item.step;
                return (
                  <button
                    key={item.step}
                    onClick={() => setUnlockedStep(item.step)}
                    className={`px-2 py-1 rounded text-xs transition-colors ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {unlockedStep < 4 && (
              <div className="pt-1 border-t border-zinc-200/80 dark:border-zinc-800/80 flex justify-end">
                <button
                  onClick={() => setUnlockedStep((s) => Math.min(4, s + 1))}
                  className="px-3 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-white text-white dark:text-zinc-900 font-medium text-xs transition-colors shadow-xs"
                >
                  {unlockedStep === 3
                    ? 'Pokaż pełne rozwiązanie →'
                    : `Odkryj Podpowiedź ${unlockedStep + 1} →`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* HINT 1: FLOW VISUALIZATION & EQUIPOTENTIAL NODES */}
        {isStepVisible(1) && (
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5 text-sky-500" />
                <span>Podpowiedź 1: Przepływ prądu i węzły ekwipotencjalne</span>
              </div>
              <div className="flex items-center gap-1">
                {onToggleCurrentAnimation && (
                  <button
                    onClick={onToggleCurrentAnimation}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      showCurrentAnimation
                        ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 border-transparent hover:border-zinc-200'
                    }`}
                  >
                    Animacja: {showCurrentAnimation ? 'WŁ.' : 'WYŁ.'}
                  </button>
                )}
                {onToggleNodeColors && (
                  <button
                    onClick={onToggleNodeColors}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      showNodeColors
                        ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 border-transparent hover:border-zinc-200'
                    }`}
                  >
                    Węzły: {showNodeColors ? 'WŁ.' : 'WYŁ.'}
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {didacticSolution.hint1_flowAndNodes.summary}
            </p>

            {/* Equipotential Nodes List */}
            {didacticSolution.hint1_flowAndNodes.equipotentialNodes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {didacticSolution.hint1_flowAndNodes.equipotentialNodes.map((node) => (
                  <div
                    key={node.nodeId}
                    className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-start gap-2 text-xs"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5"
                      style={{ backgroundColor: node.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-zinc-800 dark:text-zinc-200 flex items-center justify-between">
                        <span>{node.label}</span>
                        {unlockedStep >= 4 && (
                          <span className="font-mono text-[11px] text-sky-600 dark:text-sky-400">{node.potentialStr}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">
                        {node.connectedLabels.join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Zero-current branches explanation */}
            {didacticSolution.hint1_flowAndNodes.zeroCurrentBranches.length > 0 && (
              <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                <div className="font-semibold text-zinc-800 dark:text-zinc-200 text-[11px]">
                  Gałęzie bezprądowe (I = 0 A):
                </div>
                <ul className="text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside text-[11px]">
                  {didacticSolution.hint1_flowAndNodes.zeroCurrentBranches.map((b) => (
                    <li key={b.componentId}>
                      <strong className="text-zinc-800 dark:text-zinc-200">{b.label}:</strong> {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* HINT 2: ENGINEERING INSIGHT & TOPOLOGY */}
        {isStepVisible(2) && (
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2.5 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              <Compass className="w-3.5 h-3.5 text-indigo-500" />
              <span>Podpowiedź 2: Wskazówka Inżynierska i Topologia</span>
            </div>

            <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1 text-xs">
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                {didacticSolution.hint2_engineeringInsights.headline}
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed text-[11px]">
                {didacticSolution.hint2_engineeringInsights.regimeExplanation}
              </p>
            </div>

            {/* Detected Topologies */}
            {didacticSolution.hint2_engineeringInsights.detectedTopologies.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Rozpoznane połączenia elementów:
                </div>
                <div className="space-y-1.5">
                  {didacticSolution.hint2_engineeringInsights.detectedTopologies.map((group, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1 text-xs"
                    >
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {group.componentLabels.join(', ')}: {group.description}
                      </div>
                      <div className="p-1.5 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-center">
                        <MathFormula math={group.equivalentFormulaLatex} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step-by-step strategy */}
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                Plan rozwiązania obwodu:
              </div>
              <ol className="text-[11px] text-zinc-600 dark:text-zinc-400 space-y-1 list-decimal list-inside bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-md border border-zinc-200 dark:border-zinc-800">
                {didacticSolution.hint2_engineeringInsights.stepByStepStrategy.map((st, i) => (
                  <li key={i} className="leading-relaxed">
                    {st}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* HINT 3: SYMBOLIC FORMULAS ONLY */}
        {isStepVisible(3) && (
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2.5 shadow-xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
              <BookMarked className="w-3.5 h-3.5 text-amber-500" />
              <span>Podpowiedź 3: Prawa elektrotechniki i wzory ogólne</span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Wzory ogólne wynikające z praw fizyki dla Twojego układu:
            </p>

            <div className="space-y-2">
              {didacticSolution.hint3_symbolicFormulas.map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.lawName}</span>
                    <span className="text-[10px] text-zinc-400">{item.category}</span>
                  </div>
                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400">{item.explanation}</p>
                  <div className="bg-white dark:bg-zinc-900 px-2 py-1.5 rounded border border-zinc-200 dark:border-zinc-800 text-center">
                    <MathFormula math={item.latex} block />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FULL SOLUTION: STEP 0, STEP 1, STEP 2 */}
        {isStepVisible(4) && (
          <div className="space-y-3.5 pt-1 border-t border-zinc-200 dark:border-zinc-800">
            {/* KROK 0: SPROWADZENIE DO JEDNOSTEK PODSTAWOWYCH SI */}
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Krok 0: Sprowadzenie do jednostek podstawowych SI</span>
                </h3>
              </div>

              {didacticSolution.fullSolution.step0_siConversions.length === 0 ? (
                <p className="text-[11px] text-zinc-400">
                  Brak elementów wymagających przeliczania jednostek.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                        <th className="py-2 px-2.5 font-medium">Element</th>
                        <th className="py-2 px-2.5 font-medium">Na schemacie</th>
                        <th className="py-2 px-2.5 font-medium">Przedrostek</th>
                        <th className="py-2 px-2.5 font-medium">Zapis podstawowy SI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                      {didacticSolution.fullSolution.step0_siConversions.map((conv, idx) => (
                        <tr key={`${conv.componentId}-${idx}`} className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40">
                          <td className="py-2 px-2.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100">{conv.label}</td>
                          <td className="py-2 px-2.5 font-mono text-zinc-700 dark:text-zinc-300">{conv.rawDisplay}</td>
                          <td className="py-2 px-2.5 text-zinc-600 dark:text-zinc-400 text-[11px]">
                            {conv.prefixSymbol ? `${conv.prefixSymbol} (${conv.prefixNamePl}, 10^${conv.multiplierPower})` : 'podstawowa (10^0)'}
                          </td>
                          <td className="py-2 px-2.5">
                            <MathFormula math={conv.latex} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* KROK 1: WZORY, PODSTAWIENIE LICZB I OBLICZENIA */}
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-500" />
                  <span>Krok 1: Obliczenia szczegółowe (Wzór → Podstawienie → Wynik)</span>
                </h3>
                {didacticSolution.fullSolution.mnaMatrixLatex && (
                  <button
                    onClick={() => setShowMnaMatrix((v) => !v)}
                    className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-[11px] text-zinc-700 dark:text-zinc-300 flex items-center gap-1 transition-colors"
                  >
                    <span>Macierz MNA</span>
                    {showMnaMatrix ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {showMnaMatrix && didacticSolution.fullSolution.mnaMatrixLatex && (
                <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 overflow-x-auto text-xs">
                  <div className="text-[10px] font-medium text-zinc-400 mb-1">
                    Układ równań Zmodyfikowanej Analizy Węzłowej (MNA):
                  </div>
                  <MathFormula math={didacticSolution.fullSolution.mnaMatrixLatex} block />
                </div>
              )}

              <div className="space-y-2.5">
                {didacticSolution.fullSolution.step1_calculations.map((step) => (
                  <div
                    key={step.stepNumber}
                    className="p-3 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-[11px] font-bold flex items-center justify-center shrink-0">
                        {step.stepNumber}
                      </span>
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{step.title}</h4>
                    </div>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 pl-7">{step.description}</p>

                    <div className="pl-7 space-y-1.5 pt-0.5">
                      <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <span className="text-[10px] uppercase text-zinc-400 font-semibold block mb-0.5">
                          1. Wzór ogólny:
                        </span>
                        <MathFormula math={step.symbolicLatex} />
                      </div>
                      <div className="p-2 rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                        <span className="text-[10px] uppercase text-zinc-400 font-semibold block mb-0.5">
                          2. Podstawienie wartości:
                        </span>
                        <MathFormula math={step.substitutionLatex} />
                      </div>
                      <div className="p-2 rounded bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
                        <span className="text-[10px] uppercase text-emerald-600 dark:text-emerald-400 font-semibold block mb-0.5">
                          3. Wynik:
                        </span>
                        <MathFormula math={step.resultLatex} />
                      </div>
                    </div>

                    {(step.algebraicComplexLatex || step.exponentialComplexLatex) && (
                      <div className="pl-7 flex flex-wrap gap-2 pt-1 text-[11px] text-zinc-700 dark:text-zinc-300">
                        {step.algebraicComplexLatex && (
                          <div className="bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
                            <span className="text-zinc-400 mr-1.5">Algebraiczna:</span>
                            <MathFormula math={step.algebraicComplexLatex} />
                          </div>
                        )}
                        {step.exponentialComplexLatex && (
                          <div className="bg-white dark:bg-zinc-900 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
                            <span className="text-zinc-400 mr-1.5">Wykładnicza:</span>
                            <MathFormula math={step.exponentialComplexLatex} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* KROK 2: TABELA WYNIKÓW I BILANS MOCY */}
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3 shadow-xs">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>Krok 2: Zestawienie wyników elementów i bilans mocy</span>
                </h3>
              </div>

              <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                      <th className="py-2 px-2.5 font-medium">Element</th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="U" labelOverride="U\,[V]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="I" labelOverride="I\,[A]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="Z" labelOverride="R / X\,[\Omega]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="P" labelOverride="P\,[W]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="Q" labelOverride="Q\,[var]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="S" labelOverride="S\,[VA]" />
                      </th>
                      <th className="py-2 px-2.5 font-medium">
                        <QuantityWithTooltip quantityKey="cosPhi" labelOverride="\cos\varphi" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                    {Object.values(componentResults)
                      .filter((r) => r.type !== 'ground')
                      .map((res) => {
                        const uVal =
                          regime === 'AC' && res.voltageDropAC
                            ? res.voltageDropAC.mag
                            : res.voltageDropDC;
                        const iVal =
                          regime === 'AC' && res.currentAC ? res.currentAC.mag : res.currentDC;

                        const uFmt = formatWithBestPrefix(uVal, 'V', 2);
                        const iFmt = formatWithBestPrefix(iVal, 'A', 2);
                        const pFmt = formatWithBestPrefix(res.activePowerP, 'W', 2);
                        const qFmt = formatWithBestPrefix(res.reactivePowerQ, 'var', 2);
                        const sFmt = formatWithBestPrefix(res.apparentPowerS, 'VA', 2);

                        return (
                          <tr
                            key={res.componentId}
                            onClick={() => onSelectComponent?.(res.componentId)}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-950/40 cursor-pointer transition-colors"
                          >
                            <td className="py-2 px-2.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                              {res.label}
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <QuantityWithTooltip
                                quantityKey="U"
                                valueLatex={uFmt.latex}
                                baseLatex={uFmt.baseLatex}
                              />
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <QuantityWithTooltip
                                quantityKey="I"
                                valueLatex={iFmt.latex}
                                baseLatex={iFmt.baseLatex}
                              />
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              {res.resistanceR !== undefined && (
                                <QuantityWithTooltip
                                  quantityKey="R"
                                  valueLatex={`R = ${formatWithBestPrefix(res.resistanceR, 'Ω', 2).latex}`}
                                  baseLatex={formatWithBestPrefix(res.resistanceR, 'Ω', 2).baseLatex}
                                />
                              )}
                              {res.reactanceXL !== undefined && (
                                <QuantityWithTooltip
                                  quantityKey="XL"
                                  valueLatex={`X_L = ${formatWithBestPrefix(res.reactanceXL, 'Ω', 2).latex}`}
                                  baseLatex={formatWithBestPrefix(res.reactanceXL, 'Ω', 2).baseLatex}
                                />
                              )}
                              {res.reactanceXC !== undefined && (
                                <QuantityWithTooltip
                                  quantityKey="XC"
                                  valueLatex={`X_C = ${formatWithBestPrefix(res.reactanceXC, 'Ω', 2).latex}`}
                                  baseLatex={formatWithBestPrefix(res.reactanceXC, 'Ω', 2).baseLatex}
                                />
                              )}
                              {res.impedanceZ &&
                                res.resistanceR === undefined &&
                                res.reactanceXL === undefined &&
                                res.reactanceXC === undefined && (
                                  <QuantityWithTooltip
                                    quantityKey="Z"
                                    valueLatex={formatComplexAlgebraicLatex(res.impedanceZ, 'Ω', 2)}
                                  />
                                )}
                              {!res.resistanceR &&
                                res.reactanceXL === undefined &&
                                res.reactanceXC === undefined &&
                                !res.impedanceZ && <span className="text-zinc-400">–</span>}
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <QuantityWithTooltip
                                quantityKey="P"
                                valueLatex={pFmt.latex}
                                baseLatex={pFmt.baseLatex}
                              />
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <QuantityWithTooltip
                                quantityKey="Q"
                                valueLatex={qFmt.latex}
                                baseLatex={qFmt.baseLatex}
                              />
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap">
                              <QuantityWithTooltip
                                quantityKey="S"
                                valueLatex={sFmt.latex}
                                baseLatex={sFmt.baseLatex}
                              />
                            </td>
                            <td className="py-2 px-2.5 whitespace-nowrap font-mono text-[11px]">
                              {formatPolishNumber(res.powerFactorCosPhi, 2)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Power Balance Summary */}
              {didacticSolution.fullSolution.powerBalanceLatex && (
                <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    Bilans mocy:
                  </span>
                  <div>
                    <MathFormula math={didacticSolution.fullSolution.powerBalanceLatex} />
                  </div>
                </div>
              )}
            </div>

            {/* BODE PLOT SECTION */}
            {bodeAnalysis && bodeAnalysis.available && <BodePlotSVG bode={bodeAnalysis} />}

            {/* DIGITAL TRUTH TABLE */}
            {digitalAnalysis && digitalAnalysis.hasDigitalComponents && (
              <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-3 shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                  <Cpu className="w-3.5 h-3.5 text-sky-500" />
                  <span>Układ cyfrowy: Równania i tablica prawdy</span>
                </div>

                {Object.keys(digitalAnalysis.booleanExpressions).length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {Object.entries(digitalAnalysis.booleanExpressions).map(([outLbl, expr]) => (
                      <div
                        key={outLbl}
                        className="p-2 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                      >
                        <span className="text-zinc-500 font-medium">
                          {outLbl} =
                        </span>
                        <MathFormula math={expr} />
                      </div>
                    ))}
                  </div>
                )}

                {digitalAnalysis.truthTable.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-center border-collapse text-xs">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 text-[11px]">
                          {digitalAnalysis.inputLabels.map((inLbl) => (
                            <th key={inLbl} className="py-2 px-2.5 font-mono">
                              {inLbl}
                            </th>
                          ))}
                          {digitalAnalysis.outputLabels.map((outLbl) => (
                            <th
                              key={outLbl}
                              className="py-2 px-2.5 font-mono font-semibold text-zinc-900 dark:text-zinc-100"
                            >
                              {outLbl}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/70">
                        {digitalAnalysis.truthTable.map((row, rIdx) => {
                          const isCurrentRow = digitalAnalysis.inputLabels.every(
                            (lbl) => row.inputs[lbl] === currentDigitalInputs[lbl]
                          );
                          return (
                            <tr
                              key={rIdx}
                              className={
                                isCurrentRow
                                  ? 'bg-sky-50 dark:bg-sky-950/40 font-bold text-sky-900 dark:text-sky-200'
                                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-950/40 text-zinc-700 dark:text-zinc-300'
                              }
                            >
                              {digitalAnalysis.inputLabels.map((inLbl) => (
                                <td key={inLbl} className="py-1.5 px-2.5 font-mono">
                                  {row.inputs[inLbl]}
                                </td>
                              ))}
                              {digitalAnalysis.outputLabels.map((outLbl) => (
                                <td
                                  key={outLbl}
                                  className={`py-1.5 px-2.5 font-mono font-bold ${
                                    row.outputs[outLbl] === 1
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-zinc-400'
                                  }`}
                                >
                                  {row.outputs[outLbl]}
                                  {isCurrentRow && (
                                    <span className="ml-1 text-[10px] text-sky-600 dark:text-sky-400 font-sans font-normal">
                                      (aktywny)
                                    </span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* NE555 CARDS */}
            {ne555Components.map((comp) => (
              <NE555Card
                key={comp.componentId}
                label={comp.label}
                analysis={comp.ne555Analysis!}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
