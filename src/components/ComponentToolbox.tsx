import React, { useState, useMemo } from 'react';
import {
  ComponentType,
  ComponentCategory,
} from '../types/circuit';
import { COMPONENT_CATALOG, ComponentMetadata } from '../utils/componentCatalog';
import { MathFormula } from './MathFormula';
import {
  Cpu,
  Zap,
  Activity,
  Binary,
  Gauge,
  Info,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react';

interface ComponentToolboxProps {
  pendingComponentType: ComponentType | null;
  onSelectComponentType: (type: ComponentType) => void;
  onQuickAddComponent: (type: ComponentType) => void;
}

const CATEGORY_TABS: Array<{
  id: 'all' | ComponentCategory;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'all', label: 'Wszystkie', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'passive', label: 'Pasywne (R, L, C)', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'sources', label: 'Źródła i GND', icon: <Zap className="w-3.5 h-3.5" /> },
  { id: 'active', label: 'Scalone / 555', icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: 'digital', label: 'Cyfrowe', icon: <Binary className="w-3.5 h-3.5" /> },
  { id: 'probes', label: 'Mierniki', icon: <Gauge className="w-3.5 h-3.5" /> },
];

export const ComponentToolbox: React.FC<ComponentToolboxProps> = ({
  pendingComponentType,
  onSelectComponentType,
  onQuickAddComponent,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | ComponentCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredMeta, setHoveredMeta] = useState<ComponentMetadata | null>(null);

  const allItems = useMemo(() => Object.values(COMPONENT_CATALOG), []);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchesCategory) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.namePl.toLowerCase().includes(q) ||
        item.defaultLabelPrefix.toLowerCase().includes(q) ||
        item.unit.toLowerCase().includes(q) ||
        item.tooltipDescription.toLowerCase().includes(q)
      );
    });
  }, [allItems, selectedCategory, searchQuery]);

  return (
    <aside className="w-68 xl:w-72 shrink-0 h-full flex flex-col border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 select-none overflow-hidden z-10">
      {/* Header & Search */}
      <div className="p-2.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/60">
        <div className="flex items-center justify-between mb-2 px-0.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Przybornik Elementów
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
            {filteredItems.length}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Szukaj elementu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-sky-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/30 dark:bg-zinc-950 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {CATEGORY_TABS.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedCategory(tab.id)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1 shrink-0 ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable component list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredItems.length === 0 ? (
          <div className="py-8 px-4 text-center text-xs text-zinc-400">
            Brak elementów dla hasła &quot;{searchQuery}&quot;.
          </div>
        ) : (
          filteredItems.map((meta) => {
            const isSelected = pendingComponentType === meta.type;
            return (
              <div
                key={meta.type}
                onMouseEnter={() => setHoveredMeta(meta)}
                onMouseLeave={() => setHoveredMeta(null)}
                onClick={() => onSelectComponentType(meta.type)}
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'border-sky-500 bg-sky-50/80 dark:bg-sky-950/40 text-sky-900 dark:text-sky-200 ring-1 ring-sky-500/50'
                    : 'border-zinc-200/80 dark:border-zinc-850 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900/40 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-800 dark:text-zinc-200'
                }`}
              >
                <div className="min-w-0 pr-2">
                  <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate flex items-center gap-1.5">
                    <span>{meta.namePl}</span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      ({meta.defaultLabelPrefix})
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono flex items-center gap-1.5">
                    <MathFormula math={meta.symbolLatex} />
                    <span className="text-[10px] text-zinc-400 font-sans">
                      • {meta.category}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  title="Wstaw na środek (+)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuickAddComponent(meta.type);
                  }}
                  className="shrink-0 p-1 rounded-md text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors opacity-70 group-hover:opacity-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Compact Didactic Tooltip Footer */}
      <div className="p-2.5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs">
        {hoveredMeta ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1 truncate text-xs">
                <Info className="w-3 h-3 text-sky-500 shrink-0" />
                {hoveredMeta.namePl}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-200/60 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
                <MathFormula math={hoveredMeta.symbolLatex} />
              </span>
            </div>
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-snug">
              {hoveredMeta.tooltipDescription}
            </p>
            <p className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-900/40 truncate">
              💡 {hoveredMeta.didacticNote}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Info className="w-3 h-3 text-zinc-400 shrink-0" />
              Kliknij element i umieść na siatce
            </span>
            <span className="font-mono text-[10px] text-zinc-400">20px</span>
          </div>
        )}
      </div>
    </aside>
  );
};
