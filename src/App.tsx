import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  CircuitComponent,
  Wire,
  ComponentType,
  PinReference,
  Point,
  CircuitState,
  Rotation,
} from './types/circuit';
import { COMPONENT_CATALOG, getPinAbsolutePosition } from './utils/componentCatalog';
import { solveCircuit } from './solver/mnaSolver';
import { CIRCUIT_PRESETS } from './data/presets';
import { ComponentToolbox } from './components/ComponentToolbox';
import { CircuitCanvas } from './components/CircuitCanvas';
import { PropertyInspector } from './components/PropertyInspector';
import { DidacticPanel } from './components/DidacticPanel';
import { StudentHandbookDrawer, HandbookTab } from './components/StudentHandbookDrawer';
import { AITutorPanel } from './components/AITutorPanel';
import {
  MousePointer,
  Cable,
  Hand,
  Trash2,
  Undo2,
  Redo2,
  FilePlus2,
  BookOpen,
  Bot,
  GraduationCap,
  Sun,
  Moon,
  ChevronDown,
  Sparkles,
  Activity,
  Layers,
  Eye,
} from 'lucide-react';

interface HistoryEntry {
  components: CircuitComponent[];
  wires: Wire[];
  name: string;
}

export const App: React.FC = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([
    {
      name: 'Własny obwód',
      components: [],
      wires: [],
    },
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const currentCircuit = history[historyIndex];
  const { components, wires, name: circuitName } = currentCircuit;

  // Selection & CAD tool states
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'wire' | 'pan' | 'delete'>('select');
  const [pendingComponentType, setPendingComponentType] = useState<ComponentType | null>(null);

  // Visual overlays on schematic
  const [showCurrentAnimation, setShowCurrentAnimation] = useState<boolean>(true);
  const [showNodePotentials, setShowNodePotentials] = useState<boolean>(true);
  const [showSchematicValues, setShowSchematicValues] = useState<boolean>(true);

  // Panels & Drawers
  const [rightPanelTab, setRightPanelTab] = useState<'didactic' | 'ai'>('didactic');
  const [rightPanelOpen, setRightPanelOpen] = useState<boolean>(true);
  const [handbookOpen, setHandbookOpen] = useState<boolean>(false);
  const [handbookTab, setHandbookTab] = useState<HandbookTab>('quantities');
  const [presetMenuOpen, setPresetMenuOpen] = useState<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(true);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Push new circuit state onto undo/redo history
  const commitCircuitState = useCallback(
    (nextComponents: CircuitComponent[], nextWires: Wire[], nextName?: string) => {
      setHistory((prev) => {
        const sliced = prev.slice(0, historyIndex + 1);
        const entry: HistoryEntry = {
          components: nextComponents,
          wires: nextWires,
          name: nextName ?? sliced[sliced.length - 1]?.name ?? 'Własny obwód',
        };
        return [...sliced.slice(-39), entry];
      });
      setHistoryIndex((prev) => Math.min(prev + 1, 39));
    },
    [historyIndex]
  );

  // Real-time universal MNA & Digital solver
  const simulationResult = useMemo(() => {
    return solveCircuit(components, wires);
  }, [components, wires]);

  // Undo & Redo handlers
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex((i) => i - 1);
      setSelectedComponentId(null);
      setSelectedWireId(null);
    }
  }, [historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex((i) => i + 1);
      setSelectedComponentId(null);
      setSelectedWireId(null);
    }
  }, [historyIndex, history.length]);

  // Generate unique label like R1, R2, C1, E1...
  const generateUniqueLabel = useCallback(
    (type: ComponentType, existing: CircuitComponent[]): string => {
      const prefix = COMPONENT_CATALOG[type].defaultLabelPrefix;
      let idx = 1;
      const used = new Set(existing.map((c) => c.label.toUpperCase()));
      while (used.has(`${prefix}${idx}`.toUpperCase())) {
        idx++;
      }
      return `${prefix}${idx}`;
    },
    []
  );

  // Add component at grid-snapped (x, y)
  const handleAddComponent = useCallback(
    (type: ComponentType, x: number, y: number) => {
      const meta = COMPONENT_CATALOG[type];
      const snappedX = Math.round(x / 20) * 20;
      const snappedY = Math.round(y / 20) * 20;
      const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const label = generateUniqueLabel(type, components);

      const newComp: CircuitComponent = {
        id,
        type,
        label,
        x: snappedX,
        y: snappedY,
        rotation: 0,
        value: meta.defaultValue,
        prefix: meta.defaultPrefix,
        unit: meta.unit,
        ...(type === 'ac_voltage'
          ? { frequency: 50, frequencyPrefix: '', phaseDeg: 0, isRms: true }
          : {}),
        ...(type === 'switch' ? { switchClosed: true } : {}),
        ...(type === 'logic_input' ? { logicState: 1 } : {}),
        ...(type === 'clock' ? { frequency: 1, frequencyPrefix: 'k', dutyCycle: 50 } : {}),
      };

      commitCircuitState([...components, newComp], wires);
      setSelectedComponentId(id);
      setSelectedWireId(null);
      setPendingComponentType(null);
      setActiveTool('select');
    },
    [components, wires, generateUniqueLabel, commitCircuitState]
  );

  // Quick add from toolbox (+) button
  const handleQuickAddComponent = useCallback(
    (type: ComponentType) => {
      const offset = (components.length % 6) * 40;
      handleAddComponent(type, 320 + offset, 240 + offset);
    },
    [components.length, handleAddComponent]
  );

  // Move component
  const handleMoveComponent = useCallback(
    (id: string, x: number, y: number) => {
      const snappedX = Math.round(x / 20) * 20;
      const snappedY = Math.round(y / 20) * 20;
      const next = components.map((c) =>
        c.id === id ? { ...c, x: snappedX, y: snappedY } : c
      );
      commitCircuitState(next, wires);
    },
    [components, wires, commitCircuitState]
  );

  // Rotate component by 90°
  const handleRotateComponent = useCallback(
    (id: string) => {
      const next = components.map((c) => {
        if (c.id !== id) return c;
        const nextRot = (((c.rotation + 90) % 360) as Rotation);
        return { ...c, rotation: nextRot };
      });
      commitCircuitState(next, wires);
    },
    [components, wires, commitCircuitState]
  );

  // Toggle switch or logic_input
  const handleToggleInteractiveComponent = useCallback(
    (id: string) => {
      const next = components.map((c) => {
        if (c.id !== id) return c;
        if (c.type === 'switch') {
          return { ...c, switchClosed: c.switchClosed === false ? true : false };
        }
        if (c.type === 'logic_input') {
          const nextLogic = (c.logicState ?? c.value) === 1 ? 0 : 1;
          return { ...c, logicState: nextLogic as 0 | 1, value: nextLogic };
        }
        return c;
      });
      commitCircuitState(next, wires);
    },
    [components, wires, commitCircuitState]
  );

  // Update component properties from Inspector
  const handleUpdateComponent = useCallback(
    (id: string, patch: Partial<CircuitComponent>) => {
      const next = components.map((c) => (c.id === id ? { ...c, ...patch } : c));
      commitCircuitState(next, wires);
    },
    [components, wires, commitCircuitState]
  );

  // Duplicate component
  const handleDuplicateComponent = useCallback(
    (id: string) => {
      const orig = components.find((c) => c.id === id);
      if (!orig) return;
      const newId = `${orig.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newLabel = generateUniqueLabel(orig.type, components);
      const copy: CircuitComponent = {
        ...orig,
        id: newId,
        label: newLabel,
        x: orig.x + 40,
        y: orig.y + 40,
      };
      commitCircuitState([...components, copy], wires);
      setSelectedComponentId(newId);
    },
    [components, wires, generateUniqueLabel, commitCircuitState]
  );

  // Delete component & attached wires
  const handleDeleteComponent = useCallback(
    (id: string) => {
      const nextComponents = components.filter((c) => c.id !== id);
      const nextWires = wires.filter(
        (w) => w.from.componentId !== id && w.to.componentId !== id
      );
      commitCircuitState(nextComponents, nextWires);
      if (selectedComponentId === id) setSelectedComponentId(null);
    },
    [components, wires, selectedComponentId, commitCircuitState]
  );

  // Add wire between two pins
  const handleAddWire = useCallback(
    (from: PinReference, to: PinReference, waypoints?: Point[]) => {
      if (from.componentId === to.componentId && from.pinId === to.pinId) return;
      const exists = wires.some(
        (w) =>
          (w.from.componentId === from.componentId &&
            w.from.pinId === from.pinId &&
            w.to.componentId === to.componentId &&
            w.to.pinId === to.pinId) ||
          (w.from.componentId === to.componentId &&
            w.from.pinId === to.pinId &&
            w.to.componentId === from.componentId &&
            w.to.pinId === from.pinId)
      );
      if (exists) return;

      const newWire: Wire = {
        id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        from,
        to,
        waypoints,
      };
      commitCircuitState(components, [...wires, newWire]);
    },
    [components, wires, commitCircuitState]
  );

  // Snap-to-Wire
  const handleSplitWireAndConnect = useCallback(
    (wireId: string, sourcePin: PinReference, clickPoint: Point) => {
      const targetWire = wires.find((w) => w.id === wireId);
      if (!targetWire) return;
      const sourceComp = components.find((c) => c.id === sourcePin.componentId);
      const targetFromComp = components.find((c) => c.id === targetWire.from.componentId);
      if (!sourceComp || !targetFromComp) return;

      const srcPos = getPinAbsolutePosition(sourceComp, sourcePin.pinId);
      const dstPos = getPinAbsolutePosition(targetFromComp, targetWire.from.pinId);

      const snappedClick: Point = {
        x: Math.round(clickPoint.x / 20) * 20,
        y: Math.round(clickPoint.y / 20) * 20,
      };

      const waypoints: Point[] = [
        { x: snappedClick.x, y: srcPos.y },
        snappedClick,
        { x: snappedClick.x, y: dstPos.y },
      ];

      const updatedWires = wires.map((w) => {
        if (w.id !== wireId) return w;
        const existingWps = w.waypoints || [];
        const hasPoint = existingWps.some(
          (pt) => pt.x === snappedClick.x && pt.y === snappedClick.y
        );
        return hasPoint
          ? w
          : { ...w, waypoints: [...existingWps, snappedClick] };
      });

      const newWire: Wire = {
        id: `wire_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        from: sourcePin,
        to: targetWire.from,
        waypoints,
      };

      commitCircuitState(components, [...updatedWires, newWire]);
    },
    [components, wires, commitCircuitState]
  );

  // Delete wire
  const handleDeleteWire = useCallback(
    (id: string) => {
      const nextWires = wires.filter((w) => w.id !== id);
      commitCircuitState(components, nextWires);
      if (selectedWireId === id) setSelectedWireId(null);
    },
    [components, wires, selectedWireId, commitCircuitState]
  );

  // Clear board
  const handleClearBoard = useCallback(() => {
    commitCircuitState([], [], 'Własny obwód');
    setSelectedComponentId(null);
    setSelectedWireId(null);
    setPendingComponentType(null);
  }, [commitCircuitState]);

  // Load starter preset
  const handleLoadPreset = useCallback(
    (presetState: CircuitState) => {
      const clonedComponents: CircuitComponent[] = presetState.components.map((c) => ({ ...c }));
      const clonedWires: Wire[] = presetState.wires.map((w) => ({
        ...w,
        from: { ...w.from },
        to: { ...w.to },
        waypoints: w.waypoints ? w.waypoints.map((pt) => ({ ...pt })) : undefined,
      }));
      commitCircuitState(clonedComponents, clonedWires, presetState.name);
      setSelectedComponentId(null);
      setSelectedWireId(null);
      setPendingComponentType(null);
      setPresetMenuOpen(false);
    },
    [commitCircuitState]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (e.key === 'Escape') {
        setPendingComponentType(null);
        setActiveTool('select');
        setPresetMenuOpen(false);
        return;
      }
      if (e.key.toLowerCase() === 'r' && selectedComponentId) {
        e.preventDefault();
        handleRotateComponent(selectedComponentId);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedComponentId) {
          e.preventDefault();
          handleDeleteComponent(selectedComponentId);
        } else if (selectedWireId) {
          e.preventDefault();
          handleDeleteWire(selectedWireId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedComponentId,
    selectedWireId,
    handleRotateComponent,
    handleDeleteComponent,
    handleDeleteWire,
    handleUndo,
    handleRedo,
  ]);

  const selectedComponent = useMemo(
    () => components.find((c) => c.id === selectedComponentId) || null,
    [components, selectedComponentId]
  );

  const selectedWire = useMemo(
    () => wires.find((w) => w.id === selectedWireId) || null,
    [wires, selectedWireId]
  );

  const errorCount = simulationResult.validationIssues.filter(
    (v) => v.severity === 'error'
  ).length;

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Sleek Minimalist Unified Header Bar */}
      <header className="h-12 shrink-0 px-3.5 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-between gap-3 z-30 select-none">
        {/* Left: Brand + Circuit Name & Presets Selector */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span className="w-6 h-6 rounded-md bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center font-bold text-xs">
              Ω
            </span>
            <span className="font-semibold text-xs tracking-tight hidden sm:inline">
              ElektroPiaskownica
            </span>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-1 shrink-0" />

          {/* Presets dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setPresetMenuOpen((o) => !o)}
              className="text-xs px-2.5 py-1 rounded-md text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 font-medium flex items-center gap-1.5 transition-colors border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
            >
              <span className="truncate max-w-[150px] md:max-w-[200px]">{circuitName}</span>
              <ChevronDown className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {presetMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-80 max-h-[70vh] overflow-y-auto rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl p-1.5 z-50 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                  <span>Przykłady dla studentów</span>
                  <span className="font-mono">8 układów</span>
                </div>
                <div className="pt-1 space-y-0.5">
                  {CIRCUIT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleLoadPreset(preset.state)}
                      className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs transition-colors flex items-center justify-between group"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 group-hover:text-sky-500 truncate">
                          {preset.title}
                        </div>
                        <div className="text-[10px] text-zinc-400 truncate">{preset.category}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* New / Clear board button */}
          <button
            type="button"
            onClick={handleClearBoard}
            title="Wyczyść planszę (Nowy projekt)"
            className="p-1.5 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors"
          >
            <FilePlus2 className="w-4 h-4" />
          </button>
        </div>

        {/* Center: CAD Tools Segmented Control */}
        <div className="flex items-center gap-0.5 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
          <button
            type="button"
            onClick={() => {
              setActiveTool('select');
              setPendingComponentType(null);
            }}
            title="Wybierz / Przesuń (V)"
            className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTool === 'select' && !pendingComponentType
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTool('wire');
              setPendingComponentType(null);
            }}
            title="Rysuj przewód (W)"
            className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTool === 'wire'
                ? 'bg-white dark:bg-zinc-800 text-sky-500 dark:text-sky-400 shadow-xs font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Cable className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTool('pan');
              setPendingComponentType(null);
            }}
            title="Przesuń widok (H / Spacja)"
            className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTool === 'pan'
                ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs font-bold'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Hand className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTool('delete');
              setPendingComponentType(null);
            }}
            title="Usuń (Gumka)"
            className={`p-1.5 rounded-md text-xs font-medium transition-colors ${
              activeTool === 'delete'
                ? 'bg-rose-500 text-white shadow-xs'
                : 'text-zinc-500 hover:text-rose-500'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          <button
            type="button"
            disabled={historyIndex <= 0}
            onClick={handleUndo}
            title="Cofnij (Ctrl+Z)"
            className="p-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={historyIndex >= history.length - 1}
            onClick={handleRedo}
            title="Ponów (Ctrl+Y)"
            className="p-1.5 rounded-md text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-30 transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right: Overlays, Panels toggles, Theme */}
        <div className="flex items-center gap-1.5">
          {/* Subtle Schematic Layers */}
          <div className="hidden lg:flex items-center gap-1 text-xs text-zinc-400 bg-zinc-100 dark:bg-zinc-900/60 p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800/60">
            <button
              type="button"
              onClick={() => setShowCurrentAnimation((v) => !v)}
              title="Włącz/wyłącz animację prądu"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                showCurrentAnimation
                  ? 'bg-white dark:bg-zinc-800 text-amber-500 dark:text-amber-400 font-bold shadow-xs'
                  : 'hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Activity className="w-3 h-3" />
              <span>Prąd</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNodePotentials((v) => !v)}
              title="Włącz/wyłącz kolory węzłów"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                showNodePotentials
                  ? 'bg-white dark:bg-zinc-800 text-emerald-500 dark:text-emerald-400 font-bold shadow-xs'
                  : 'hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Layers className="w-3 h-3" />
              <span>Węzły</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSchematicValues((v) => !v)}
              title="Włącz/wyłącz wartości pomiarowe przy elementach"
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors flex items-center gap-1 ${
                showSchematicValues
                  ? 'bg-white dark:bg-zinc-800 text-sky-500 dark:text-sky-400 font-bold shadow-xs'
                  : 'hover:text-zinc-700 dark:hover:text-zinc-300'
              }`}
            >
              <Eye className="w-3 h-3" />
              <span>Wartości</span>
            </button>
          </div>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5 hidden lg:block" />

          {/* Handbook Button */}
          <button
            type="button"
            onClick={() => setHandbookOpen(true)}
            className="px-2.5 py-1 text-xs font-medium rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors flex items-center gap-1.5"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Niezbędnik SI</span>
          </button>

          {/* AI Assistant Button */}
          <button
            type="button"
            onClick={() => {
              setRightPanelOpen(true);
              setRightPanelTab(rightPanelTab === 'ai' && rightPanelOpen ? 'didactic' : 'ai');
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
              rightPanelOpen && rightPanelTab === 'ai'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold'
                : 'text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Asystent</span>
          </button>

          {/* Didactic Solution Button */}
          <button
            type="button"
            onClick={() => {
              if (rightPanelOpen && rightPanelTab === 'didactic') {
                setRightPanelOpen(false);
              } else {
                setRightPanelOpen(true);
                setRightPanelTab('didactic');
              }
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
              rightPanelOpen && rightPanelTab === 'didactic'
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span>Rozwiązanie</span>
            {errorCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
          </button>

          <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

          {/* Theme Switcher */}
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            title={darkMode ? 'Jasny motyw' : 'Ciemny motyw'}
            className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
      </header>

      {/* Main 3-Column Engineering Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column: Component Toolbox */}
        <ComponentToolbox
          pendingComponentType={pendingComponentType}
          onSelectComponentType={(type) => {
            setPendingComponentType((prev) => (prev === type ? null : type));
            setActiveTool('select');
          }}
          onQuickAddComponent={handleQuickAddComponent}
        />

        {/* Center Column: Interactive Schematic Canvas + Bottom Property Inspector */}
        <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden relative">
          <div className="flex-1 relative min-h-0 bg-zinc-100 dark:bg-zinc-950">
            <CircuitCanvas
              components={components}
              wires={wires}
              selectedComponentId={selectedComponentId}
              selectedWireId={selectedWireId}
              simulationResult={simulationResult}
              activeTool={activeTool}
              pendingComponentType={pendingComponentType}
              showCurrentAnimation={showCurrentAnimation}
              showNodePotentials={showNodePotentials}
              showSchematicValues={showSchematicValues}
              darkMode={darkMode}
              onSelectComponent={(id) => {
                setSelectedComponentId(id);
                if (id) setSelectedWireId(null);
              }}
              onSelectWire={(id) => {
                setSelectedWireId(id);
                if (id) setSelectedComponentId(null);
              }}
              onAddComponent={handleAddComponent}
              onMoveComponent={handleMoveComponent}
              onRotateComponent={handleRotateComponent}
              onToggleInteractiveComponent={handleToggleInteractiveComponent}
              onAddWire={handleAddWire}
              onSplitWireAndConnect={handleSplitWireAndConnect}
              onDeleteComponent={handleDeleteComponent}
              onDeleteWire={handleDeleteWire}
            />

            {/* Minimalist onboarding helper when board is empty */}
            {components.length === 0 && !pendingComponentType && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-6">
                <div className="pointer-events-auto max-w-md w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md shadow-xl p-5 space-y-3.5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sky-500 flex items-center justify-center mx-auto">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                      Pusta plansza robocza
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      Wybierz element z przybornika po lewej stronie, aby rozpocząć budowę układu, lub wybierz gotowy przykład:
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {CIRCUIT_PRESETS.slice(0, 4).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleLoadPreset(preset.state)}
                        className="text-left px-2.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-sky-500 dark:hover:border-sky-500 bg-zinc-50 dark:bg-zinc-950/60 hover:bg-sky-500/5 transition-all text-xs"
                      >
                        <div className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                          {preset.title.replace(/^\d+\.\s*/, '')}
                        </div>
                        <div className="text-[10px] text-zinc-400">{preset.difficulty}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Property Inspector Bar */}
          <div className="shrink-0 p-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 max-h-56 overflow-y-auto">
            <PropertyInspector
              selectedComponent={selectedComponent}
              selectedWire={selectedWire}
              componentResult={
                selectedComponent
                  ? simulationResult.componentResults[selectedComponent.id]
                  : undefined
              }
              onUpdateComponent={handleUpdateComponent}
              onRotateComponent={handleRotateComponent}
              onDuplicateComponent={handleDuplicateComponent}
              onDeleteComponent={handleDeleteComponent}
              onDeleteWire={handleDeleteWire}
            />
          </div>
        </main>

        {/* Right Column: Didactic Panel OR AI Tutor */}
        {rightPanelOpen && (
          <aside className="w-[440px] xl:w-[480px] shrink-0 h-full border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden">
            {/* Minimalist Switcher Header */}
            <div className="h-10 shrink-0 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('didactic')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    rightPanelTab === 'didactic'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  Krok po kroku
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('ai')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                    rightPanelTab === 'ai'
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                  }`}
                >
                  Asystent AI
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRightPanelOpen(false)}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 px-1.5 py-0.5 rounded"
                title="Ukryj panel"
              >
                ✕
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto">
              {rightPanelTab === 'didactic' ? (
                <DidacticPanel
                  simulationResult={simulationResult}
                  components={components}
                  showCurrentAnimation={showCurrentAnimation}
                  onToggleCurrentAnimation={() => setShowCurrentAnimation((v) => !v)}
                  showNodeColors={showNodePotentials}
                  onToggleNodeColors={() => setShowNodePotentials((v) => !v)}
                  onSelectComponent={(id) => setSelectedComponentId(id)}
                />
              ) : (
                <AITutorPanel
                  components={components}
                  wires={wires}
                  simulationResult={simulationResult}
                  isOpen={true}
                  onClose={() => setRightPanelTab('didactic')}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Slide-out Student Handbook Drawer */}
      <StudentHandbookDrawer
        isOpen={handbookOpen}
        onClose={() => setHandbookOpen(false)}
        initialTab={handbookTab}
      />
    </div>
  );
};

export default App;
