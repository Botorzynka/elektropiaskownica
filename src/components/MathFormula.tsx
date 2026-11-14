import React, { useMemo, useState } from 'react';
import katex from 'katex';
import { PHYSICAL_QUANTITIES_DICTIONARY } from '../utils/units';

interface MathFormulaProps {
  math: string;
  block?: boolean;
  className?: string;
}

export const MathFormula: React.FC<MathFormulaProps> = ({ math, block = false, className = '' }) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode: block,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return math;
    }
  }, [math, block]);

  return (
    <span
      className={`${block ? 'block my-1.5 overflow-x-auto py-1' : 'inline-block'} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface QuantityBadgeProps {
  quantityKey: keyof typeof PHYSICAL_QUANTITIES_DICTIONARY | string;
  valueLatex?: string;
  baseLatex?: string;
  labelOverride?: string;
  className?: string;
}

/**
 * Interactive badge displaying a physical quantity with its value and unit,
 * showing a rich Polish tooltip on hover explaining what the quantity and unit mean,
 * plus base SI value preview.
 */
export const QuantityWithTooltip: React.FC<QuantityBadgeProps> = ({
  quantityKey,
  valueLatex,
  baseLatex,
  labelOverride,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const info = PHYSICAL_QUANTITIES_DICTIONARY[quantityKey];

  return (
    <span
      className={`relative inline-flex items-center gap-1 cursor-help border-b border-dotted border-blue-400/70 hover:border-blue-400 transition-colors ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <MathFormula math={labelOverride ? `${labelOverride}${valueLatex ? ` = ${valueLatex}` : ''}` : valueLatex || info?.symbolLatex || quantityKey} />
      {open && info && (
        <div className="fixed sm:absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-xl shadow-2xl border border-slate-700 bg-slate-900/95 text-slate-100 text-xs pointer-events-none backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5 mb-1.5">
            <span className="font-bold text-blue-400">{info.namePl}</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono text-[11px]">
              [{info.unitSymbol}] ({info.unitNamePl})
            </span>
          </div>
          <p className="text-slate-200 leading-relaxed mb-1.5">{info.shortTooltip}</p>
          <div className="bg-slate-950/80 rounded-lg px-2 py-1 border border-slate-800 text-center my-1">
            <MathFormula math={info.formulaLatex} />
          </div>
          {baseLatex && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[11px] text-emerald-300 flex items-center justify-between">
              <span>W jednostce podstawowej SI:</span>
              <MathFormula math={baseLatex} />
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-1 italic">{info.detailedExplanation}</p>
        </div>
      )}
    </span>
  );
};
