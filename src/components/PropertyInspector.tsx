import React from 'react';
import {
  CircuitComponent,
  ComponentSimulationResult,
  SIPrefix,
  Wire,
} from '../types/circuit';
import { COMPONENT_CATALOG } from '../utils/componentCatalog';
import {
  ORDERED_PREFIXES,
  SI_PREFIXES,
  toSIValue,
  formatWithBestPrefix,
  formatPolishNumber,
  formatComplexAlgebraicLatex,
  formatComplexExponentialLatex,
} from '../utils/units';
import { MathFormula, QuantityWithTooltip } from './MathFormula';
import { NumericInput } from './NumericInput';
import {
  RotateCw,
  Trash2,
  Copy,
  Sliders,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Info,
} from 'lucide-react';

interface PropertyInspectorProps {
  selectedComponent: CircuitComponent | null;
  selectedWire: Wire | null;
  componentResult?: ComponentSimulationResult;
  onUpdateComponent: (id: string, patch: Partial<CircuitComponent>) => void;
  onRotateComponent: (id: string) => void;
  onDuplicateComponent: (id: string) => void;
  onDeleteComponent: (id: string) => void;
  onDeleteWire: (id: string) => void;
}

export const PropertyInspector: React.FC<PropertyInspectorProps> = ({
  selectedComponent,
  selectedWire,
  componentResult,
  onUpdateComponent,
  onRotateComponent,
  onDuplicateComponent,
  onDeleteComponent,
  onDeleteWire,
}) => {
  // 1. Wire selected view
  if (selectedWire && !selectedComponent) {
    return (
      <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-sky-600 dark:text-sky-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                Wybrany przewód połączeniowy
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Łączy pin <code className="font-mono font-medium text-sky-600 dark:text-sky-400">{selectedWire.from.pinId}</code> z pinem{' '}
                <code className="font-mono font-medium text-sky-600 dark:text-sky-400">{selectedWire.to.pinId}</code> (idealny przewodnik o oporze{' '}
                <MathFormula math="R = 0\,\Omega" />, wyrównujący potencjał węzła).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDeleteWire(selectedWire.id)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Usuń przewód</span>
          </button>
        </div>
      </div>
    );
  }

  // 2. Empty selection view
  if (!selectedComponent) {
    return (
      <div className="py-2 px-3 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <span>
            Kliknij element lub przewód na schemacie, aby edytować parametry i przedrostki SI (<MathFormula math="\text{p}, \text{n}, \mu, \text{m}, \text{k}, \text{M}" />) lub sprawdzić pomiary.
          </span>
        </span>
        <span className="text-[11px] font-mono text-zinc-400 hidden sm:inline">
          <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">R</kbd> obrót • <kbd className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300">Del</kbd> usuń
        </span>
      </div>
    );
  }

  // 3. Component selected view
  const meta = COMPONENT_CATALOG[selectedComponent.type];
  const hasNumericValue =
    selectedComponent.type === 'resistor' ||
    selectedComponent.type === 'inductor' ||
    selectedComponent.type === 'capacitor' ||
    selectedComponent.type === 'dc_voltage' ||
    selectedComponent.type === 'ac_voltage' ||
    selectedComponent.type === 'current_source' ||
    selectedComponent.type === 'clock' ||
    selectedComponent.type === 'ne555';

  const siVal = toSIValue(selectedComponent.value, selectedComponent.prefix);
  const prefixMeta = SI_PREFIXES[selectedComponent.prefix] || SI_PREFIXES[''];
  const unitLatex = selectedComponent.unit === 'Ω' ? '\\Omega' : `\\text{${selectedComponent.unit}}`;
  const conversionLatex =
    selectedComponent.prefix === ''
      ? `${selectedComponent.label} = ${formatPolishNumber(selectedComponent.value, 4)}\\,${unitLatex}`
      : `${selectedComponent.label} = ${formatPolishNumber(selectedComponent.value, 4)}\\,${prefixMeta.latexSymbol}${unitLatex} = ${formatPolishNumber(selectedComponent.value, 4)} \\cdot 10^{${prefixMeta.power}}\\,${unitLatex} = ${formatPolishNumber(siVal, 6)}\\,${unitLatex}`;

  return (
    <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs space-y-2.5">
      {/* Header & Quick actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 dark:border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded font-mono text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
            {selectedComponent.label}
          </span>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {meta.namePl}
            </h3>
            <span className="text-[11px] text-zinc-400">
              ({meta.tooltipDescription.split('–')[0]?.trim() || ''})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onRotateComponent(selectedComponent.id)}
            title="Obróć o 90° (Klawisz R)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <RotateCw className="w-3 h-3 text-sky-500" />
            <span>Obróć ({selectedComponent.rotation}°)</span>
          </button>
          <button
            type="button"
            onClick={() => onDuplicateComponent(selectedComponent.id)}
            title="Kopiuj element"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700/80 bg-zinc-50 dark:bg-zinc-800/70 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <Copy className="w-3 h-3 text-emerald-500" />
            <span>Duplikuj</span>
          </button>
          <button
            type="button"
            onClick={() => onDeleteComponent(selectedComponent.id)}
            title="Usuń element (Delete)"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Usuń</span>
          </button>
        </div>
      </div>

      {/* Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 items-center">
        {/* Label input */}
        <div>
          <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
            Oznaczenie:
          </label>
          <input
            type="text"
            value={selectedComponent.label}
            onChange={(e) => onUpdateComponent(selectedComponent.id, { label: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
            placeholder="np. R1"
          />
        </div>

        {/* Numeric Value with Free-Typing Support */}
        {hasNumericValue && (
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Wartość [{prefixMeta.symbol}{selectedComponent.unit}]:
            </label>
            <NumericInput
              key={`${selectedComponent.id}_val`}
              value={selectedComponent.value}
              onChange={(newVal) => onUpdateComponent(selectedComponent.id, { value: newVal })}
              min={
                selectedComponent.type === 'resistor' ||
                selectedComponent.type === 'inductor' ||
                selectedComponent.type === 'capacitor'
                  ? 0.0001
                  : undefined
              }
              className="w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
              placeholder="np. 20"
            />
          </div>
        )}

        {/* SI Prefix Select */}
        {hasNumericValue && (
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Przedrostek SI:
            </label>
            <select
              value={selectedComponent.prefix}
              onChange={(e) =>
                onUpdateComponent(selectedComponent.id, { prefix: e.target.value as SIPrefix })
              }
              className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              {ORDERED_PREFIXES.map((p) => {
                const pMeta = SI_PREFIXES[p];
                return (
                  <option key={p} value={p}>
                    {pMeta.symbol ? `${pMeta.symbol}${selectedComponent.unit} — ${pMeta.namePl} (10^${pMeta.power})` : `${selectedComponent.unit} — podstawowa (10^0)`}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Live SI Conversion Box */}
        {hasNumericValue && (
          <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 text-xs flex flex-col justify-center">
            <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5 text-amber-500" />
              W jednostce podstawowej SI:
            </span>
            <div className="font-mono text-zinc-800 dark:text-zinc-200 mt-0.5 truncate text-[11px]">
              <MathFormula math={conversionLatex} />
            </div>
          </div>
        )}

        {/* Switch controls */}
        {selectedComponent.type === 'switch' && (
          <div className="md:col-span-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onUpdateComponent(selectedComponent.id, {
                  switchClosed: selectedComponent.switchClosed === false ? true : false,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                selectedComponent.switchClosed !== false
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs'
                  : 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200'
              }`}
            >
              {selectedComponent.switchClosed !== false ? (
                <>
                  <ToggleRight className="w-4 h-4" />
                  Klucz ZAMKNIĘTY (zwarcie, R = 0 Ω) — kliknij aby otworzyć
                </>
              ) : (
                <>
                  <ToggleLeft className="w-4 h-4" />
                  Klucz OTWARTY (przerwa, I = 0 A) — kliknij aby zamknąć
                </>
              )}
            </button>
          </div>
        )}

        {/* Logic input controls */}
        {selectedComponent.type === 'logic_input' && (
          <div className="md:col-span-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                onUpdateComponent(selectedComponent.id, {
                  logicState: selectedComponent.logicState === 1 ? 0 : 1,
                  value: selectedComponent.logicState === 1 ? 0 : 1,
                })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                (selectedComponent.logicState ?? selectedComponent.value) === 1
                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-xs'
                  : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              Stan wejścia: {(selectedComponent.logicState ?? selectedComponent.value) === 1 ? '1 (HIGH / +5 V)' : '0 (LOW / 0 V)'} — kliknij, aby zmienić
            </button>
          </div>
        )}
      </div>

      {/* Extra controls for AC Voltage Source */}
      {selectedComponent.type === 'ac_voltage' && (
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Częstotliwość f [{SI_PREFIXES[selectedComponent.frequencyPrefix || ''].symbol}Hz]:
            </label>
            <NumericInput
              key={`${selectedComponent.id}_freq`}
              value={selectedComponent.frequency ?? 50}
              onChange={(val) => onUpdateComponent(selectedComponent.id, { frequency: val })}
              min={0.001}
              className="w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
              placeholder="np. 50"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Przedrostek częstotliwości:
            </label>
            <select
              value={selectedComponent.frequencyPrefix || ''}
              onChange={(e) =>
                onUpdateComponent(selectedComponent.id, {
                  frequencyPrefix: e.target.value as SIPrefix,
                })
              }
              className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              <option value="m">mHz (10^-3 Hz)</option>
              <option value="">Hz (podstawowa)</option>
              <option value="k">kHz (10^3 Hz)</option>
              <option value="M">MHz (10^6 Hz)</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Faza początkowa φ [°]:
            </label>
            <NumericInput
              key={`${selectedComponent.id}_phase`}
              value={selectedComponent.phaseDeg ?? 0}
              onChange={(val) => onUpdateComponent(selectedComponent.id, { phaseDeg: val })}
              className="w-full px-2.5 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-sky-500"
              placeholder="np. 0"
            />
          </div>

          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1">
              Typ napięcia:
            </label>
            <select
              value={selectedComponent.isRms === false ? 'amp' : 'rms'}
              onChange={(e) =>
                onUpdateComponent(selectedComponent.id, {
                  isRms: e.target.value === 'rms',
                })
              }
              className="w-full px-2 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-sky-500 font-medium"
            >
              <option value="rms">Wartość skuteczna U_sk [V]</option>
              <option value="amp">Amplituda U_max [V] (U_sk = U_m/√2)</option>
            </select>
          </div>
        </div>
      )}

      {/* Live simulation telemetry for the selected element */}
      {componentResult && (
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
            Pomiary telemetryczne na elemencie:
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
              <QuantityWithTooltip
                quantityKey="U"
                labelOverride="U"
                valueLatex={
                  componentResult.voltageDropAC
                    ? formatWithBestPrefix(componentResult.voltageDropAC.mag, 'V').latex
                    : formatWithBestPrefix(componentResult.voltageDropDC, 'V').latex
                }
                baseLatex={
                  componentResult.voltageDropAC
                    ? formatWithBestPrefix(componentResult.voltageDropAC.mag, 'V').baseLatex
                    : formatWithBestPrefix(componentResult.voltageDropDC, 'V').baseLatex
                }
              />
            </div>

            <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
              <QuantityWithTooltip
                quantityKey="I"
                labelOverride="I"
                valueLatex={
                  componentResult.currentAC
                    ? formatWithBestPrefix(componentResult.currentAC.mag, 'A').latex
                    : formatWithBestPrefix(componentResult.currentDC, 'A').latex
                }
                baseLatex={
                  componentResult.currentAC
                    ? formatWithBestPrefix(componentResult.currentAC.mag, 'A').baseLatex
                    : formatWithBestPrefix(componentResult.currentDC, 'A').baseLatex
                }
              />
            </div>

            <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
              <QuantityWithTooltip
                quantityKey="P"
                labelOverride="P"
                valueLatex={formatWithBestPrefix(componentResult.activePowerP, 'W').latex}
                baseLatex={formatWithBestPrefix(componentResult.activePowerP, 'W').baseLatex}
              />
            </div>

            {Math.abs(componentResult.reactivePowerQ) > 1e-9 && (
              <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
                <QuantityWithTooltip
                  quantityKey="Q"
                  labelOverride="Q"
                  valueLatex={formatWithBestPrefix(componentResult.reactivePowerQ, 'var').latex}
                  baseLatex={formatWithBestPrefix(componentResult.reactivePowerQ, 'var').baseLatex}
                />
              </div>
            )}

            {componentResult.apparentPowerS > 1e-9 && (
              <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
                <QuantityWithTooltip
                  quantityKey="S"
                  labelOverride="S"
                  valueLatex={formatWithBestPrefix(componentResult.apparentPowerS, 'VA').latex}
                  baseLatex={formatWithBestPrefix(componentResult.apparentPowerS, 'VA').baseLatex}
                />
              </div>
            )}

            {componentResult.reactanceXL !== undefined && (
              <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
                <QuantityWithTooltip
                  quantityKey="XL"
                  labelOverride="X_L"
                  valueLatex={formatWithBestPrefix(componentResult.reactanceXL, 'Ω').latex}
                  baseLatex={formatWithBestPrefix(componentResult.reactanceXL, 'Ω').baseLatex}
                />
              </div>
            )}

            {componentResult.reactanceXC !== undefined && (
              <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
                <QuantityWithTooltip
                  quantityKey="XC"
                  labelOverride="X_C"
                  valueLatex={formatWithBestPrefix(componentResult.reactanceXC, 'Ω').latex}
                  baseLatex={formatWithBestPrefix(componentResult.reactanceXC, 'Ω').baseLatex}
                />
              </div>
            )}

            {componentResult.impedanceZ && (
              <div className="px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200">
                <QuantityWithTooltip
                  quantityKey="Z"
                  labelOverride="\underline{Z}"
                  valueLatex={`${formatComplexAlgebraicLatex(componentResult.impedanceZ, 'Ω')} = ${formatComplexExponentialLatex(componentResult.impedanceZ, 'Ω')}`}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
