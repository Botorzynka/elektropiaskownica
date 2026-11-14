import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  Trash2,
  Zap,
  AlertTriangle,
  Eye,
  Compass,
  MousePointer,
} from 'lucide-react';
import {
  CircuitComponent,
  Wire,
  SimulationResult,
  ComponentType,
  PinReference,
  Point,
  ElectricalNode,
} from '../types/circuit';
import {
  COMPONENT_CATALOG,
  getPinAbsolutePosition,
  getAllComponentPinsAbsolute,
} from '../utils/componentCatalog';
import {
  SI_PREFIXES,
  formatPolishNumber,
  formatWithBestPrefix,
} from '../utils/units';

export const GRID_SIZE = 20;

export interface CircuitCanvasProps {
  components: CircuitComponent[];
  wires: Wire[];
  selectedComponentId: string | null;
  selectedWireId: string | null;
  simulationResult: SimulationResult | null;
  activeTool: 'select' | 'wire' | 'pan' | 'delete';
  pendingComponentType: ComponentType | null;
  showCurrentAnimation: boolean; // np. włączone w Podpowiedzi 1 lub pełnym rozwiązaniu
  showNodePotentials: boolean;   // kolorowanie węzłów ekwipotencjalnych
  showSchematicValues: boolean;  // Krok 2: naniesienie obliczonych U [V], I [A], P [W], Q [var], S [VA] na schemat
  darkMode: boolean;
  onSelectComponent: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onAddComponent: (type: ComponentType, x: number, y: number) => void;
  onMoveComponent: (id: string, x: number, y: number) => void;
  onRotateComponent: (id: string) => void;
  onToggleInteractiveComponent: (id: string) => void; // dla switch (otwarty/zamknięty) oraz logic_input (0/1)
  onAddWire: (from: PinReference, to: PinReference, waypoints?: Point[]) => void;
  onSplitWireAndConnect: (wireId: string, sourcePin: PinReference, clickPoint: Point) => void;
  onDeleteComponent: (id: string) => void;
  onDeleteWire: (id: string) => void;
}

function snapToGrid(val: number): number {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

/**
 * Generates clean orthogonal (L-shape or Z-shape) points between start and end, snapped to 20px grid.
 */
function buildOrthogonalPathPoints(start: Point, end: Point, existingWaypoints?: Point[]): Point[] {
  if (existingWaypoints && existingWaypoints.length > 0) {
    return [start, ...existingWaypoints, end];
  }
  if (start.x === end.x || start.y === end.y) {
    return [start, end];
  }
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);

  if (dx >= dy) {
    const midX = snapToGrid((start.x + end.x) / 2);
    if (midX === start.x || midX === end.x) {
      return [start, { x: end.x, y: start.y }, end];
    }
    return [
      start,
      { x: midX, y: start.y },
      { x: midX, y: end.y },
      end,
    ];
  } else {
    const midY = snapToGrid((start.y + end.y) / 2);
    if (midY === start.y || midY === end.y) {
      return [start, { x: start.x, y: end.y }, end];
    }
    return [
      start,
      { x: start.x, y: midY },
      { x: end.x, y: midY },
      end,
    ];
  }
}

function pointsToSvgPath(pts: Point[]): string {
  if (pts.length === 0) return '';
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/**
 * Computes closest point on a segment AB to point P, and returns distance and snapped grid point.
 */
function closestPointOnSegment(p: Point, a: Point, b: Point): { point: Point; dist: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq === 0) {
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    return { point: { x: a.x, y: a.y }, dist: d };
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq));
  const projX = a.x + t * abx;
  const projY = a.y + t * aby;
  const dist = Math.hypot(p.x - projX, p.y - projY);

  // Snap the projected point onto the segment's grid line
  const snappedX = a.x === b.x ? a.x : snapToGrid(projX);
  const snappedY = a.y === b.y ? a.y : snapToGrid(projY);

  // Clamp snapped coordinates strictly inside segment bounds
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);

  return {
    point: {
      x: Math.max(minX, Math.min(maxX, snappedX)),
      y: Math.max(minY, Math.min(maxY, snappedY)),
    },
    dist,
  };
}

function formatComponentBadgeValue(comp: CircuitComponent): string {
  const prefixSymbol = SI_PREFIXES[comp.prefix]?.symbol || '';
  const valStr = formatPolishNumber(comp.value, 2);

  switch (comp.type) {
    case 'ground':
      return '0 V';
    case 'switch':
      return comp.switchClosed ? 'ZAMKNIĘTY' : 'OTWARTY';
    case 'logic_input':
      return `Stan: ${comp.logicState ?? 1}`;
    case 'logic_probe':
      return 'Sonda Y';
    case 'voltmeter':
      return 'Woltomierz';
    case 'ammeter':
      return 'Amperomierz';
    case 'opamp':
      return 'Op-Amp';
    case 'ne555':
      return 'Timer 555';
    case 'and_gate':
      return 'AND';
    case 'or_gate':
      return 'OR';
    case 'not_gate':
      return 'NOT';
    case 'nand_gate':
      return 'NAND';
    case 'nor_gate':
      return 'NOR';
    case 'xor_gate':
      return 'XOR';
    case 'ac_voltage': {
      const fPrefix = SI_PREFIXES[comp.frequencyPrefix || '']?.symbol || '';
      const fVal = formatPolishNumber(comp.frequency ?? 50, 1);
      const phase = comp.phaseDeg ? ` ∠${comp.phaseDeg}°` : '';
      return `${valStr} ${prefixSymbol}V (${fVal} ${fPrefix}Hz${phase})`;
    }
    default:
      return `${valStr} ${prefixSymbol}${comp.unit}`.trim();
  }
}

export const CircuitCanvas: React.FC<CircuitCanvasProps> = ({
  components,
  wires,
  selectedComponentId,
  selectedWireId,
  simulationResult,
  activeTool,
  pendingComponentType,
  showCurrentAnimation,
  showNodePotentials,
  showSchematicValues,
  darkMode,
  onSelectComponent,
  onSelectWire,
  onAddComponent,
  onMoveComponent,
  onRotateComponent,
  onToggleInteractiveComponent,
  onAddWire,
  onSplitWireAndConnect,
  onDeleteComponent,
  onDeleteWire,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Viewport pan & zoom state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<Point>({ x: 60, y: 40 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStartClient, setPanStartClient] = useState<Point>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // Dragging component state
  const [draggingCompId, setDraggingCompId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

  // Wire drawing state
  const [wiringFromPin, setWiringFromPin] = useState<{
    componentId: string;
    pinId: string;
    absPos: Point;
  } | null>(null);

  // Cursor position in world coordinates
  const [cursorWorld, setCursorWorld] = useState<Point>({ x: 300, y: 240 });
  const [hoveredPin, setHoveredPin] = useState<{
    componentId: string;
    pinId: string;
    absPos: Point;
  } | null>(null);
  const [hoveredWireSnap, setHoveredWireSnap] = useState<{
    wireId: string;
    point: Point;
  } | null>(null);

  // Node legend toggle
  const [showNodeLegend, setShowNodeLegend] = useState<boolean>(true);
  const prevCompCountRef = useRef<number>(components.length);

  const fitCircuitToView = useCallback(() => {
    if (!svgRef.current || components.length === 0) {
      setZoom(1);
      setPan({ x: 60, y: 40 });
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const c of components) {
      minX = Math.min(minX, c.x - 90);
      maxX = Math.max(maxX, c.x + 90);
      minY = Math.min(minY, c.y - 80);
      maxY = Math.max(maxY, c.y + 80);
    }

    const bboxW = Math.max(240, maxX - minX);
    const bboxH = Math.max(200, maxY - minY);
    const padX = 80;
    const padY = 90;
    const scaleX = (rect.width - padX) / bboxW;
    const scaleY = (rect.height - padY) / bboxH;
    const idealZoom = Math.min(1.05, Math.max(0.55, Math.min(scaleX, scaleY)));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setZoom(Number(idealZoom.toFixed(2)));
    setPan({
      x: Math.round(rect.width / 2 - centerX * idealZoom),
      y: Math.round(rect.height / 2 - centerY * idealZoom - 15),
    });
  }, [components]);

  useEffect(() => {
    // Auto-fit when loading a preset (jump from 0 or different preset count >= 3)
    if (components.length >= 3 && Math.abs(components.length - prevCompCountRef.current) >= 2) {
      fitCircuitToView();
    }
    prevCompCountRef.current = components.length;
  }, [components.length, fitCircuitToView]);

  // Spacebar listener for effortless panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        setSpacePressed(true);
      } else if (e.key === 'Escape') {
        setWiringFromPin(null);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setSpacePressed(false);
        setIsPanning(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Convert screen mouse coordinates to world SVG coordinates
  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      const x = (clientX - rect.left - pan.x) / zoom;
      const y = (clientY - rect.top - pan.y) / zoom;
      return { x, y };
    },
    [pan, zoom]
  );

  // Precompute all pins on canvas for fast Snap-to-Pin
  const allPins = useMemo(() => {
    const list: Array<{
      componentId: string;
      pinId: string;
      label: string;
      absX: number;
      absY: number;
    }> = [];
    for (const comp of components) {
      const pins = getAllComponentPinsAbsolute(comp);
      for (const p of pins) {
        list.push({
          componentId: comp.id,
          pinId: p.id,
          label: p.label,
          absX: p.absX,
          absY: p.absY,
        });
      }
    }
    return list;
  }, [components]);

  // Precompute wire geometries
  const wireGeometries = useMemo(() => {
    return wires
      .map((w) => {
        const compFrom = components.find((c) => c.id === w.from.componentId);
        const compTo = components.find((c) => c.id === w.to.componentId);
        if (!compFrom || !compTo) return null;
        const start = getPinAbsolutePosition(compFrom, w.from.pinId);
        const end = getPinAbsolutePosition(compTo, w.to.pinId);
        const points = buildOrthogonalPathPoints(start, end, w.waypoints);
        return {
          wire: w,
          start,
          end,
          points,
          svgPath: pointsToSvgPath(points),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [wires, components]);

  // Map each pin ("compId:pinId") to its ElectricalNode
  const pinToNodeMap = useMemo(() => {
    const map = new Map<string, ElectricalNode>();
    if (!simulationResult?.nodes) return map;
    for (const node of simulationResult.nodes) {
      for (const p of node.pins) {
        map.set(`${p.componentId}:${p.pinId}`, node);
      }
    }
    return map;
  }, [simulationResult]);

  // Map affected component IDs to validation issues
  const componentValidationMap = useMemo(() => {
    const map = new Map<string, { severity: 'error' | 'warning' | 'info'; title: string }>();
    if (!simulationResult?.validationIssues) return map;
    for (const issue of simulationResult.validationIssues) {
      for (const cid of issue.affectedComponentIds) {
        const existing = map.get(cid);
        if (!existing || issue.severity === 'error') {
          map.set(cid, { severity: issue.severity, title: issue.title });
        }
      }
    }
    return map;
  }, [simulationResult]);

  // Compute soldering junction dots where >=3 wire segments or >=2 wires at a pin meet
  const junctionDots = useMemo(() => {
    const pointDegree = new Map<string, { x: number; y: number; count: number; color?: string }>();

    const addDegree = (x: number, y: number, inc: number, color?: string) => {
      const key = `${Math.round(x)},${Math.round(y)}`;
      const prev = pointDegree.get(key);
      if (prev) {
        prev.count += inc;
        if (!prev.color && color) prev.color = color;
      } else {
        pointDegree.set(key, { x: Math.round(x), y: Math.round(y), count: inc, color });
      }
    };

    for (const wg of wireGeometries) {
      const node = pinToNodeMap.get(`${wg.wire.from.componentId}:${wg.wire.from.pinId}`);
      const color = node?.color;
      addDegree(wg.start.x, wg.start.y, 1, color);
      addDegree(wg.end.x, wg.end.y, 1, color);
    }

    // Also check T-intersections where a wire endpoint lies in the interior of another wire segment
    for (const pin of allPins) {
      for (const wg of wireGeometries) {
        if (
          (wg.wire.from.componentId === pin.componentId && wg.wire.from.pinId === pin.pinId) ||
          (wg.wire.to.componentId === pin.componentId && wg.wire.to.pinId === pin.pinId)
        ) {
          continue;
        }
        for (let i = 0; i < wg.points.length - 1; i++) {
          const a = wg.points[i];
          const b = wg.points[i + 1];
          const { dist } = closestPointOnSegment({ x: pin.absX, y: pin.absY }, a, b);
          if (dist < 2) {
            addDegree(pin.absX, pin.absY, 2);
          }
        }
      }
    }

    return Array.from(pointDegree.values()).filter((d) => d.count >= 2);
  }, [wireGeometries, allPins, pinToNodeMap]);

  // Representative floating position for each equipotential node badge
  const nodeBadges = useMemo(() => {
    if (!simulationResult?.nodes) return [];
    const list: Array<{
      node: ElectricalNode;
      x: number;
      y: number;
      text: string;
    }> = [];

    for (const node of simulationResult.nodes) {
      if (node.pins.length === 0) continue;
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (const p of node.pins) {
        const comp = components.find((c) => c.id === p.componentId);
        if (!comp) continue;
        const pos = getPinAbsolutePosition(comp, p.pinId);
        sumX += pos.x;
        sumY += pos.y;
        count++;
      }
      if (count === 0) continue;

      let potStr = '';
      if (node.isGround) {
        potStr = 'GND = 0 V';
      } else if (simulationResult.regime === 'AC' && node.potentialAC) {
        const best = formatWithBestPrefix(node.potentialAC.mag, 'V', 2);
        potStr = `V_${node.id} = ${best.formatted} ∠${formatPolishNumber(node.potentialAC.phaseDeg, 1)}°`;
      } else if (simulationResult.regime === 'DIGITAL' && node.digitalState) {
        potStr = `W${node.id}: Stan ${node.digitalState}`;
      } else {
        const best = formatWithBestPrefix(node.potentialDC, 'V', 2);
        potStr = `V_${node.id} = ${best.formatted}`;
      }

      list.push({
        node,
        x: Math.round(sumX / count),
        y: Math.round(sumY / count) - 18,
        text: potStr,
      });
    }
    return list;
  }, [simulationResult, components]);

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    const nextZoom = Math.max(0.4, Math.min(2.5, zoom * zoomFactor));

    const nextPanX = mouseX - ((mouseX - pan.x) / zoom) * nextZoom;
    const nextPanY = mouseY - ((mouseY - pan.y) / zoom) * nextZoom;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
  };

  // Mouse Down on Canvas Background
  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const worldPos = clientToWorld(e.clientX, e.clientY);

    // Middle mouse button, spacebar, or pan tool starts panning
    if (e.button === 1 || spacePressed || activeTool === 'pan') {
      e.preventDefault();
      setIsPanning(true);
      setPanStartClient({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return;

    // If user is placing a pending component from palette
    if (pendingComponentType) {
      const snappedX = snapToGrid(worldPos.x);
      const snappedY = snapToGrid(worldPos.y);
      onAddComponent(pendingComponentType, snappedX, snappedY);
      return;
    }

    // If user is drawing a wire and clicked on a snapped wire segment (Snap-to-Wire)
    if (wiringFromPin && hoveredWireSnap) {
      onSplitWireAndConnect(
        hoveredWireSnap.wireId,
        { componentId: wiringFromPin.componentId, pinId: wiringFromPin.pinId },
        hoveredWireSnap.point
      );
      setWiringFromPin(null);
      setHoveredWireSnap(null);
      return;
    }

    // Cancel wire drawing if clicked on empty space
    if (wiringFromPin) {
      setWiringFromPin(null);
      return;
    }

    // Deselect components/wires when clicking empty space
    onSelectComponent(null);
    onSelectWire(null);
  };

  // Mouse Move on Canvas
  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStartClient.x,
        y: e.clientY - panStartClient.y,
      });
      return;
    }

    const worldPos = clientToWorld(e.clientX, e.clientY);
    setCursorWorld(worldPos);

    // Dragging an existing component
    if (draggingCompId) {
      const nextX = snapToGrid(worldPos.x - dragOffset.x);
      const nextY = snapToGrid(worldPos.y - dragOffset.y);
      onMoveComponent(draggingCompId, nextX, nextY);
      return;
    }

    // Check Snap-to-Pin (within 15px radius)
    let closestPin: { componentId: string; pinId: string; absPos: Point } | null = null;
    let bestPinDist = 15;
    for (const p of allPins) {
      const d = Math.hypot(worldPos.x - p.absX, worldPos.y - p.absY);
      if (d < bestPinDist) {
        bestPinDist = d;
        closestPin = {
          componentId: p.componentId,
          pinId: p.pinId,
          absPos: { x: p.absX, y: p.absY },
        };
      }
    }
    setHoveredPin(closestPin);

    // If drawing wire and not hovering a pin, check Snap-to-Wire (within 14px radius)
    if (wiringFromPin && !closestPin) {
      let bestWire: { wireId: string; point: Point } | null = null;
      let bestWireDist = 14;
      for (const wg of wireGeometries) {
        // Avoid snapping to a wire already attached to the source pin
        if (
          (wg.wire.from.componentId === wiringFromPin.componentId &&
            wg.wire.from.pinId === wiringFromPin.pinId) ||
          (wg.wire.to.componentId === wiringFromPin.componentId &&
            wg.wire.to.pinId === wiringFromPin.pinId)
        ) {
          continue;
        }
        for (let i = 0; i < wg.points.length - 1; i++) {
          const a = wg.points[i];
          const b = wg.points[i + 1];
          const { point, dist } = closestPointOnSegment(worldPos, a, b);
          if (dist < bestWireDist) {
            bestWireDist = dist;
            bestWire = { wireId: wg.wire.id, point };
          }
        }
      }
      setHoveredWireSnap(bestWire);
    } else {
      setHoveredWireSnap(null);
    }
  };

  const handleCanvasMouseUp = () => {
    setIsPanning(false);
    setDraggingCompId(null);
  };

  // Pin click handler (starts or completes wire)
  const handlePinMouseDown = (
    e: React.MouseEvent,
    componentId: string,
    pinId: string,
    absPos: Point
  ) => {
    e.stopPropagation();
    if (activeTool === 'delete') return;

    if (!wiringFromPin) {
      setWiringFromPin({ componentId, pinId, absPos });
      onSelectComponent(null);
      onSelectWire(null);
    } else {
      if (wiringFromPin.componentId === componentId && wiringFromPin.pinId === pinId) {
        setWiringFromPin(null);
        return;
      }
      onAddWire(
        { componentId: wiringFromPin.componentId, pinId: wiringFromPin.pinId },
        { componentId, pinId }
      );
      setWiringFromPin(null);
      setHoveredWireSnap(null);
    }
  };

  // Component mouse down handler
  const handleComponentMouseDown = (e: React.MouseEvent, comp: CircuitComponent) => {
    e.stopPropagation();
    if (spacePressed || activeTool === 'pan' || e.button === 1) return;

    if (activeTool === 'delete') {
      onDeleteComponent(comp.id);
      return;
    }

    // If user is currently drawing a wire and clicks a component, snap to its closest pin
    if (wiringFromPin) {
      const pins = getAllComponentPinsAbsolute(comp);
      if (pins.length > 0) {
        const worldPos = clientToWorld(e.clientX, e.clientY);
        let bestPin = pins[0];
        let minDist = Infinity;
        for (const p of pins) {
          const d = Math.hypot(worldPos.x - p.absX, worldPos.y - p.absY);
          if (d < minDist) {
            minDist = d;
            bestPin = p;
          }
        }
        if (!(wiringFromPin.componentId === comp.id && wiringFromPin.pinId === bestPin.id)) {
          onAddWire(
            { componentId: wiringFromPin.componentId, pinId: wiringFromPin.pinId },
            { componentId: comp.id, pinId: bestPin.id }
          );
          setWiringFromPin(null);
          return;
        }
      }
    }

    onSelectComponent(comp.id);
    onSelectWire(null);

    if (activeTool === 'select') {
      const worldPos = clientToWorld(e.clientX, e.clientY);
      setDraggingCompId(comp.id);
      setDragOffset({
        x: worldPos.x - comp.x,
        y: worldPos.y - comp.y,
      });
    }
  };

  // Wire click handler
  const handleWireClick = (e: React.MouseEvent, wireId: string) => {
    e.stopPropagation();
    if (activeTool === 'delete') {
      onDeleteWire(wireId);
      return;
    }

    // If currently drawing a wire, allow clicking directly on an existing wire to split & join!
    if (wiringFromPin) {
      const worldPos = clientToWorld(e.clientX, e.clientY);
      const snappedPt = hoveredWireSnap?.point || {
        x: snapToGrid(worldPos.x),
        y: snapToGrid(worldPos.y),
      };
      onSplitWireAndConnect(
        wireId,
        { componentId: wiringFromPin.componentId, pinId: wiringFromPin.pinId },
        snappedPt
      );
      setWiringFromPin(null);
      setHoveredWireSnap(null);
      return;
    }

    onSelectWire(wireId);
    onSelectComponent(null);
  };

  // Determine current flowing through a wire for animation
  const getWireFlowInfo = (wire: Wire): { hasFlow: boolean; reverse: boolean; isZeroBranch: boolean } => {
    if (!simulationResult || !simulationResult.isValid) {
      return { hasFlow: false, reverse: false, isZeroBranch: false };
    }
    const checkComp = (compId: string, pinId: string, isFromEnd: boolean) => {
      const comp = components.find((c) => c.id === compId);
      const res = simulationResult.componentResults[compId];
      if (!comp || !res) return null;
      const meta = COMPONENT_CATALOG[comp.type];
      if (meta.pins.length !== 2) return null;

      const currentMag =
        simulationResult.regime === 'AC' && res.currentAC
          ? res.currentAC.mag
          : Math.abs(res.currentDC);

      if (currentMag <= 1e-9) {
        return { hasFlow: false, reverse: false, isZeroBranch: true };
      }

      const signedI =
        simulationResult.regime === 'AC' && res.currentAC
          ? res.currentAC.mag * (Math.cos((res.currentAC.phaseDeg * Math.PI) / 180) >= 0 ? 1 : -1)
          : res.currentDC;

      // In solver convention, currentDC > 0 flows INTO pin[0] and OUT OF pin[1]
      const isPin0 = meta.pins[0].id === pinId;
      const flowsOutOfPin = (signedI > 0 && !isPin0) || (signedI < 0 && isPin0);
      const reverse = isFromEnd ? !flowsOutOfPin : flowsOutOfPin;
      return { hasFlow: true, reverse, isZeroBranch: false };
    };

    return (
      checkComp(wire.from.componentId, wire.from.pinId, true) ||
      checkComp(wire.to.componentId, wire.to.pinId, false) || {
        hasFlow: false,
        reverse: false,
        isZeroBranch: false,
      }
    );
  };

  /**
   * Renders the engineering SVG symbol for each of the 21 component types
   */
  const renderComponentGraphic = (comp: CircuitComponent, isGhost = false) => {
    const strokeColor = isGhost
      ? '#3b82f6'
      : selectedComponentId === comp.id
      ? '#38bdf8'
      : darkMode
      ? '#e2e8f0'
      : '#1e293b';

    const fillBg = darkMode ? '#0f172a' : '#ffffff';
    const subTextColor = darkMode ? '#94a3b8' : '#475569';
    const compResult = simulationResult?.componentResults[comp.id];
    const gateOutState = simulationResult?.digitalAnalysis?.gateStates[comp.id];

    // Upright counter-rotation for text inside rotated components
    const textRotation = comp.rotation === 180 ? 180 : 0;

    switch (comp.type) {
      case 'resistor':
        return (
          <g>
            <line x1={-40} y1={0} x2={-24} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <rect
              x={-24}
              y={-10}
              width={48}
              height={20}
              rx={2}
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <line x1={24} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <g transform={`rotate(${textRotation})`}>
              <text
                x={0}
                y={3.5}
                textAnchor="middle"
                className="text-[9px] font-mono font-bold fill-slate-400 select-none pointer-events-none"
              >
                R
              </text>
            </g>
          </g>
        );

      case 'inductor':
        return (
          <g>
            <line x1={-40} y1={0} x2={-24} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <path
              d="M -24 0 A 6 8 0 0 1 -12 0 A 6 8 0 0 1 0 0 A 6 8 0 0 1 12 0 A 6 8 0 0 1 24 0"
              fill="none"
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <line x1={24} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
          </g>
        );

      case 'capacitor':
        return (
          <g>
            <line x1={-40} y1={0} x2={-5} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <line x1={-5} y1={-15} x2={-5} y2={15} stroke={strokeColor} strokeWidth={3} />
            <line x1={5} y1={-15} x2={5} y2={15} stroke={strokeColor} strokeWidth={3} />
            <line x1={5} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
          </g>
        );

      case 'dc_voltage':
        return (
          <g>
            <line x1={0} y1={-40} x2={0} y2={-22} stroke={strokeColor} strokeWidth={2.4} />
            <circle
              cx={0}
              cy={0}
              r={22}
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <line x1={0} y1={22} x2={0} y2={40} stroke={strokeColor} strokeWidth={2.4} />
            {/* Plus sign at top */}
            <path d="M 0 -15 L 0 -7 M -4 -11 L 4 -11" stroke="#ef4444" strokeWidth={2.2} strokeLinecap="round" />
            {/* Minus sign at bottom */}
            <path d="M -4 11 L 4 11" stroke="#3b82f6" strokeWidth={2.2} strokeLinecap="round" />
            {/* Direct voltage source arrow */}
            <path d="M -10 4 L -10 -4 L -12 -1 M -10 -4 L -8 -1" fill="none" stroke={subTextColor} strokeWidth={1.3} />
          </g>
        );

      case 'ac_voltage':
        return (
          <g>
            <line x1={0} y1={-40} x2={0} y2={-22} stroke={strokeColor} strokeWidth={2.4} />
            <circle
              cx={0}
              cy={0}
              r={22}
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <line x1={0} y1={22} x2={0} y2={40} stroke={strokeColor} strokeWidth={2.4} />
            {/* Sine wave symbol */}
            <path
              d="M -11 0 Q -5.5 -10 0 0 T 11 0"
              fill="none"
              stroke="#f59e0b"
              strokeWidth={2.4}
              strokeLinecap="round"
            />
            <text x={8} y={-25} className="text-[10px] font-bold fill-red-400 select-none">+</text>
            <text x={8} y={33} className="text-[10px] font-bold fill-blue-400 select-none">−</text>
          </g>
        );

      case 'current_source':
        return (
          <g>
            <line x1={0} y1={-40} x2={0} y2={-22} stroke={strokeColor} strokeWidth={2.4} />
            <circle
              cx={0}
              cy={0}
              r={22}
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <line x1={0} y1={22} x2={0} y2={40} stroke={strokeColor} strokeWidth={2.4} />
            {/* Upward arrow toward 'out' pin (dy = -40) */}
            <line x1={0} y1={12} x2={0} y2={-11} stroke="#10b981" strokeWidth={2.4} strokeLinecap="round" />
            <polyline
              points="-6,-5 0,-12 6,-5"
              fill="none"
              stroke="#10b981"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );

      case 'ground':
        return (
          <g>
            <line x1={0} y1={-20} x2={0} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <line x1={-16} y1={0} x2={16} y2={0} stroke={strokeColor} strokeWidth={2.8} />
            <line x1={-10} y1={6} x2={10} y2={6} stroke={strokeColor} strokeWidth={2.4} />
            <line x1={-4} y1={12} x2={4} y2={12} stroke={strokeColor} strokeWidth={2} />
          </g>
        );

      case 'switch': {
        const isClosed = Boolean(comp.switchClosed);
        return (
          <g
            className="cursor-pointer"
            onClick={(e) => {
              if (!isGhost && activeTool !== 'delete') {
                e.stopPropagation();
                onToggleInteractiveComponent(comp.id);
              }
            }}
          >
            <rect x={-26} y={-20} width={52} height={36} fill="transparent" />
            <line x1={-40} y1={0} x2={-16} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <line x1={16} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <circle cx={-16} cy={0} r={3.5} fill={fillBg} stroke={strokeColor} strokeWidth={2} />
            <circle cx={16} cy={0} r={3.5} fill={fillBg} stroke={strokeColor} strokeWidth={2} />
            {/* Switch blade */}
            <line
              x1={-13}
              y1={0}
              x2={isClosed ? 14 : 11}
              y2={isClosed ? -1 : -15}
              stroke={isClosed ? '#10b981' : '#f59e0b'}
              strokeWidth={2.8}
              strokeLinecap="round"
            />
          </g>
        );
      }

      case 'opamp':
        return (
          <g>
            <line x1={-40} y1={-20} x2={-26} y2={-20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-40} y1={20} x2={-26} y2={20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={26} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polygon
              points="-26,-34 -26,34 26,0"
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
            {/* Inverting (-) at dy = -20 */}
            <line x1={-20} y1={-20} x2={-12} y2={-20} stroke="#3b82f6" strokeWidth={2.2} />
            {/* Non-inverting (+) at dy = +20 */}
            <path d="M -20 20 L -12 20 M -16 16 L -16 24" stroke="#ef4444" strokeWidth={2.2} />
            <text
              x={-4}
              y={3}
              textAnchor="middle"
              className="text-[8px] font-mono font-semibold fill-slate-400 select-none"
            >
              OA
            </text>
          </g>
        );

      case 'ne555':
        return (
          <g>
            {/* Leads to the 8 pins */}
            <line x1={-60} y1={-40} x2={-42} y2={-40} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-60} y1={-20} x2={-42} y2={-20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-60} y1={20} x2={-42} y2={20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-60} y1={40} x2={-42} y2={40} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={42} y1={0} x2={60} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-20} y1={-60} x2={-20} y2={-46} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={20} y1={-60} x2={20} y2={-46} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={20} y1={46} x2={20} y2={60} stroke={strokeColor} strokeWidth={2.2} />

            {/* IC DIP-8 Body */}
            <rect
              x={-42}
              y={-46}
              width={84}
              height={92}
              rx={6}
              fill={darkMode ? '#1e293b' : '#f8fafc'}
              stroke={strokeColor}
              strokeWidth={2.5}
            />
            {/* Top IC notch */}
            <path
              d="M -7 -46 A 7 7 0 0 0 7 -46"
              fill="none"
              stroke={strokeColor}
              strokeWidth={2}
            />
            <text
              x={0}
              y={4}
              textAnchor="middle"
              className="text-[11px] font-mono font-extrabold fill-amber-400 select-none"
            >
              NE555
            </text>
            {/* Pin labels inside IC */}
            <g className="text-[7.5px] font-mono fill-slate-400 select-none">
              <text x={-37} y={-37}>1:GND</text>
              <text x={-37} y={-17}>2:TRIG</text>
              <text x={-37} y={23}>6:THR</text>
              <text x={-37} y={43}>7:DIS</text>
              <text x={37} y={3} textAnchor="end">3:OUT</text>
              <text x={-20} y={-35} textAnchor="middle">4:RST</text>
              <text x={20} y={-35} textAnchor="middle">8:VCC</text>
              <text x={20} y={41} textAnchor="middle">5:CTRL</text>
            </g>
          </g>
        );

      case 'and_gate':
      case 'nand_gate': {
        const isNand = comp.type === 'nand_gate';
        return (
          <g>
            <line x1={-40} y1={-20} x2={-22} y2={-20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-40} y1={20} x2={-22} y2={20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={isNand ? 28 : 20} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <path
              d="M -22 -26 L 0 -26 A 22 26 0 0 1 0 26 L -22 26 Z"
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            {isNand && (
              <circle cx={24} cy={0} r={4} fill={fillBg} stroke={strokeColor} strokeWidth={2.2} />
            )}
            <text
              x={-5}
              y={3.5}
              textAnchor="middle"
              className="text-[9px] font-mono font-bold fill-purple-400 select-none"
            >
              {isNand ? 'NAND' : 'AND'}
            </text>
            {gateOutState && (
              <g transform="translate(28, -16)">
                <rect
                  x={-7}
                  y={-7}
                  width={14}
                  height={14}
                  rx={3}
                  fill={gateOutState === '1' ? '#10b981' : '#334155'}
                />
                <text x={0} y={3.5} textAnchor="middle" className="text-[9px] font-mono font-bold fill-white">
                  {gateOutState}
                </text>
              </g>
            )}
          </g>
        );
      }

      case 'or_gate':
      case 'nor_gate':
      case 'xor_gate': {
        const isNor = comp.type === 'nor_gate';
        const isXor = comp.type === 'xor_gate';
        return (
          <g>
            <line x1={-40} y1={-20} x2={-18} y2={-20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={-40} y1={20} x2={-18} y2={20} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={isNor ? 28 : 20} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            {isXor && (
              <path
                d="M -26 -26 Q -14 0 -26 26"
                fill="none"
                stroke={strokeColor}
                strokeWidth={2.4}
              />
            )}
            <path
              d="M -20 -26 Q 4 -26 20 0 Q 4 26 -20 26 Q -8 0 -20 -26 Z"
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            {isNor && (
              <circle cx={24} cy={0} r={4} fill={fillBg} stroke={strokeColor} strokeWidth={2.2} />
            )}
            <text
              x={-3}
              y={3.5}
              textAnchor="middle"
              className="text-[8.5px] font-mono font-bold fill-purple-400 select-none"
            >
              {isNor ? 'NOR' : isXor ? 'XOR' : 'OR'}
            </text>
            {gateOutState && (
              <g transform="translate(28, -16)">
                <rect
                  x={-7}
                  y={-7}
                  width={14}
                  height={14}
                  rx={3}
                  fill={gateOutState === '1' ? '#10b981' : '#334155'}
                />
                <text x={0} y={3.5} textAnchor="middle" className="text-[9px] font-mono font-bold fill-white">
                  {gateOutState}
                </text>
              </g>
            )}
          </g>
        );
      }

      case 'not_gate':
        return (
          <g>
            <line x1={-40} y1={0} x2={-18} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <line x1={24} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.2} />
            <polygon
              points="-18,-20 -18,20 15,0"
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
            <circle cx={19.5} cy={0} r={4} fill={fillBg} stroke={strokeColor} strokeWidth={2.2} />
            <text
              x={-6}
              y={3}
              textAnchor="middle"
              className="text-[8px] font-mono font-bold fill-purple-400 select-none"
            >
              1
            </text>
            {gateOutState && (
              <g transform="translate(28, -16)">
                <rect
                  x={-7}
                  y={-7}
                  width={14}
                  height={14}
                  rx={3}
                  fill={gateOutState === '1' ? '#10b981' : '#334155'}
                />
                <text x={0} y={3.5} textAnchor="middle" className="text-[9px] font-mono font-bold fill-white">
                  {gateOutState}
                </text>
              </g>
            )}
          </g>
        );

      case 'logic_input': {
        const isHigh = (comp.logicState ?? 1) === 1;
        return (
          <g
            className="cursor-pointer"
            onClick={(e) => {
              if (!isGhost && activeTool !== 'delete') {
                e.stopPropagation();
                onToggleInteractiveComponent(comp.id);
              }
            }}
          >
            <line x1={18} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <rect
              x={-22}
              y={-15}
              width={40}
              height={30}
              rx={6}
              fill={isHigh ? '#059669' : darkMode ? '#1e293b' : '#e2e8f0'}
              stroke={isHigh ? '#34d399' : strokeColor}
              strokeWidth={2.4}
            />
            <text
              x={-2}
              y={5}
              textAnchor="middle"
              className={`text-[14px] font-mono font-extrabold select-none ${
                isHigh ? 'fill-white' : darkMode ? 'fill-slate-300' : 'fill-slate-800'
              }`}
            >
              {isHigh ? '1' : '0'}
            </text>
          </g>
        );
      }

      case 'clock':
        return (
          <g>
            <line x1={18} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <rect
              x={-22}
              y={-15}
              width={40}
              height={30}
              rx={6}
              fill={fillBg}
              stroke={strokeColor}
              strokeWidth={2.4}
            />
            <polyline
              points="-14,5 -14,-5 -6,-5 -6,5 2,5 2,-5 10,-5"
              fill="none"
              stroke="#38bdf8"
              strokeWidth={2}
            />
          </g>
        );

      case 'logic_probe': {
        const state = compResult?.logicValue || gateOutState || '0';
        const isHigh = state === '1';
        const isUnknown = state === 'X';
        return (
          <g>
            <line x1={-40} y1={0} x2={-16} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <circle
              cx={2}
              cy={0}
              r={17}
              fill={isHigh ? '#10b981' : isUnknown ? '#f59e0b' : darkMode ? '#1e293b' : '#e2e8f0'}
              stroke={isHigh ? '#6ee7b7' : strokeColor}
              strokeWidth={2.5}
            />
            <text
              x={2}
              y={5}
              textAnchor="middle"
              className={`text-[14px] font-mono font-extrabold select-none ${
                isHigh || isUnknown ? 'fill-white' : darkMode ? 'fill-slate-300' : 'fill-slate-700'
              }`}
            >
              {state}
            </text>
          </g>
        );
      }

      case 'voltmeter':
      case 'ammeter': {
        const isVolt = comp.type === 'voltmeter';
        const measuredSI = compResult
          ? isVolt
            ? simulationResult?.regime === 'AC' && compResult.voltageDropAC
              ? compResult.voltageDropAC.mag
              : compResult.voltageDropDC
            : simulationResult?.regime === 'AC' && compResult.currentAC
            ? compResult.currentAC.mag
            : compResult.currentDC
          : 0;
        const formattedReading = formatWithBestPrefix(measuredSI, isVolt ? 'V' : 'A', 2).formatted;

        return (
          <g>
            <line x1={-40} y1={0} x2={-22} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <line x1={22} y1={0} x2={40} y2={0} stroke={strokeColor} strokeWidth={2.4} />
            <circle
              cx={0}
              cy={0}
              r={22}
              fill={fillBg}
              stroke={isVolt ? '#38bdf8' : '#f59e0b'}
              strokeWidth={2.5}
            />
            <text
              x={0}
              y={-3}
              textAnchor="middle"
              className={`text-[13px] font-extrabold select-none ${
                isVolt ? 'fill-sky-400' : 'fill-amber-400'
              }`}
            >
              {isVolt ? 'V' : 'A'}
            </text>
            {/* Mini LCD reading on meter face */}
            <rect
              x={-18}
              y={2}
              width={36}
              height={11}
              rx={2}
              fill={darkMode ? '#020617' : '#f1f5f9'}
            />
            <text
              x={0}
              y={10}
              textAnchor="middle"
              className="text-[7px] font-mono font-bold fill-emerald-400 select-none"
            >
              {formattedReading}
            </text>
            <text x={-28} y={-6} className="text-[9px] font-bold fill-red-400 select-none">+</text>
            <text x={24} y={-6} className="text-[9px] font-bold fill-blue-400 select-none">−</text>
          </g>
        );
      }
    }
  };

  // Ghost preview position
  const ghostX = snapToGrid(cursorWorld.x);
  const ghostY = snapToGrid(cursorWorld.y);

  // Active orthogonal wire preview points
  const previewWirePoints = useMemo(() => {
    if (!wiringFromPin) return [];
    const targetPoint =
      hoveredPin?.absPos ||
      hoveredWireSnap?.point || {
        x: snapToGrid(cursorWorld.x),
        y: snapToGrid(cursorWorld.y),
      };
    return buildOrthogonalPathPoints(wiringFromPin.absPos, targetPoint);
  }, [wiringFromPin, hoveredPin, hoveredWireSnap, cursorWorld]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden select-none ${
        darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
      {/* Inline keyframes for flowing current animation */}
      <style>{`
        @keyframes circuitFlowForward {
          from { stroke-dashoffset: 24; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes circuitFlowReverse {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 24; }
        }
        .animate-current-forward {
          animation: circuitFlowForward 0.75s linear infinite;
        }
        .animate-current-reverse {
          animation: circuitFlowReverse 0.75s linear infinite;
        }
      `}</style>

      {/* Top-Left Contextual Banner when placing a component or drawing a wire */}
      {(pendingComponentType || wiringFromPin) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-600/95 text-white text-xs font-medium shadow-lg backdrop-blur pointer-events-none">
          <Zap className="w-3.5 h-3.5 animate-pulse" />
          {pendingComponentType ? (
            <span>
              Tryb wstawiania: <strong>{COMPONENT_CATALOG[pendingComponentType].namePl}</strong> — kliknij na siatce, aby umieścić
            </span>
          ) : (
            <span>
              Prowadzenie przewodu — kliknij docelowy pin lub środek istniejącego przewodu (Snap-to-Wire), aby połączyć (ESC anuluje)
            </span>
          )}
        </div>
      )}

      {/* Main Interactive SVG Canvas */}
      <svg
        ref={svgRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        className={`w-full h-full ${
          isPanning || spacePressed || activeTool === 'pan'
            ? 'cursor-grabbing'
            : pendingComponentType || activeTool === 'wire' || wiringFromPin
            ? 'cursor-crosshair'
            : activeTool === 'delete'
            ? 'cursor-pointer'
            : 'cursor-default'
        }`}
      >
        <defs>
          {/* 20px Minor Grid Pattern */}
          <pattern
            id="minor-grid-20"
            width={GRID_SIZE}
            height={GRID_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx={0}
              cy={0}
              r={1}
              fill={darkMode ? 'rgba(148, 163, 184, 0.22)' : 'rgba(71, 85, 105, 0.25)'}
            />
          </pattern>

          {/* 100px Major Grid Pattern */}
          <pattern
            id="major-grid-100"
            width={GRID_SIZE * 5}
            height={GRID_SIZE * 5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={GRID_SIZE * 5} height={GRID_SIZE * 5} fill="url(#minor-grid-20)" />
            <path
              d={`M ${GRID_SIZE * 5} 0 L 0 0 0 ${GRID_SIZE * 5}`}
              fill="none"
              stroke={darkMode ? 'rgba(51, 65, 85, 0.4)' : 'rgba(203, 213, 225, 0.7)'}
              strokeWidth={0.8}
            />
          </pattern>
        </defs>

        {/* Infinite-like Transformed Viewport Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Background Engineering Grid */}
          <rect
            x={-4000}
            y={-4000}
            width={8000}
            height={8000}
            fill="url(#major-grid-100)"
          />

          {/* 1. WIRES LAYER */}
          {wireGeometries.map(({ wire, points, svgPath }) => {
            const isSelected = selectedWireId === wire.id;
            const node = pinToNodeMap.get(`${wire.from.componentId}:${wire.from.pinId}`);
            const flow = getWireFlowInfo(wire);

            const baseStroke = isSelected
              ? '#38bdf8'
              : showNodePotentials && node?.color
              ? node.color
              : darkMode
              ? '#94a3b8'
              : '#334155';

            // Midpoint for delete button or zero-current badge
            const midIdx = Math.floor(points.length / 2);
            const midPt = {
              x: (points[midIdx - 1].x + points[midIdx].x) / 2,
              y: (points[midIdx - 1].y + points[midIdx].y) / 2,
            };

            return (
              <g key={wire.id} className="group">
                {/* Invisible wide hit-area for easy wire selection & Snap-to-Wire */}
                <path
                  d={svgPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={14}
                  onClick={(e) => handleWireClick(e, wire.id)}
                  className="cursor-pointer"
                />

                {/* Equipotential subtle tint when showNodePotentials is active */}
                {showNodePotentials && node?.color && (
                  <path
                    d={svgPath}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={4.5}
                    strokeOpacity={0.18}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="pointer-events-none"
                  />
                )}

                {/* Main Wire Line */}
                <path
                  d={svgPath}
                  fill="none"
                  stroke={baseStroke}
                  strokeWidth={isSelected ? 3 : 2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  onClick={(e) => handleWireClick(e, wire.id)}
                  className="cursor-pointer transition-colors"
                />

                {/* Animated Current Flow Overlay (Hint 1 or Full Solution) */}
                {showCurrentAnimation && flow.hasFlow && (
                  <path
                    d={svgPath}
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth={2}
                    strokeDasharray="4 8"
                    strokeLinecap="round"
                    className={`pointer-events-none ${
                      flow.reverse ? 'animate-current-reverse' : 'animate-current-forward'
                    }`}
                  />
                )}

                {/* Delete button when wire is selected */}
                {isSelected && (
                  <g
                    transform={`translate(${midPt.x}, ${midPt.y})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteWire(wire.id);
                    }}
                    className="cursor-pointer"
                  >
                    <circle r={10} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
                    <path
                      d="M -3.5 -3.5 L 3.5 3.5 M -3.5 3.5 L 3.5 -3.5"
                      stroke="#ffffff"
                      strokeWidth={1.8}
                      strokeLinecap="round"
                    />
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. SOLDERING JUNCTION DOTS LAYER */}
          {junctionDots.map((dot, idx) => (
            <circle
              key={`jdot-${idx}`}
              cx={dot.x}
              cy={dot.y}
              r={4.2}
              fill={
                showNodePotentials && dot.color
                  ? dot.color
                  : darkMode
                  ? '#f8fafc'
                  : '#0f172a'
              }
              stroke={darkMode ? '#0f172a' : '#ffffff'}
              strokeWidth={1.2}
              className="pointer-events-none"
            />
          ))}

          {/* 3. EQUIPOTENTIAL NODE BADGES LAYER */}
          {showNodePotentials &&
            nodeBadges.map(({ node, x, y, text }) => (
              <g
                key={`node-badge-${node.id}`}
                transform={`translate(${x}, ${y})`}
                className="pointer-events-none"
              >
                <rect
                  x={-32}
                  y={-9}
                  width={64}
                  height={17}
                  rx={4}
                  fill={darkMode ? 'rgba(11, 15, 25, 0.94)' : 'rgba(255, 255, 255, 0.96)'}
                  stroke={node.color}
                  strokeWidth={1.2}
                />
                <text
                  x={0}
                  y={2.5}
                  textAnchor="middle"
                  fill={node.color}
                  className="text-[9px] font-mono font-bold"
                >
                  {node.isGround ? '0 V' : text.replace(/^V_\w+:\s*/, '').replace(/^V_\w+\s*=\s*/, '')}
                </text>
              </g>
            ))}

          {/* 4. COMPONENTS LAYER */}
          {components.map((comp) => {
            const isSelected = selectedComponentId === comp.id;
            const validationIssue = componentValidationMap.get(comp.id);
            const compRes = simulationResult?.componentResults[comp.id];
            const meta = COMPONENT_CATALOG[comp.type];

            // Check if component is in a zero-current branch for Hint 1
            const isZeroCurrentBranch =
              showCurrentAnimation &&
              simulationResult?.didacticSolution.hint1_flowAndNodes.zeroCurrentBranches.some(
                (z) => z.componentId === comp.id
              );

            // Check if current flows through component for internal animation
            const compCurrentMag = compRes
              ? simulationResult?.regime === 'AC' && compRes.currentAC
                ? compRes.currentAC.mag
                : Math.abs(compRes.currentDC)
              : 0;
            const compHasFlow = showCurrentAnimation && compCurrentMag > 1e-9;
            const compSignedCurrent = compRes
              ? simulationResult?.regime === 'AC' && compRes.currentAC
                ? compRes.currentAC.mag
                : compRes.currentDC
              : 0;

            return (
              <g key={comp.id} transform={`translate(${comp.x}, ${comp.y})`}>
                {/* Validation Error / Warning Pulsing Ring */}
                {validationIssue && (
                  <g className="pointer-events-none">
                    <rect
                      x={-meta.width / 2 - 8}
                      y={-meta.height / 2 - 8}
                      width={meta.width + 16}
                      height={meta.height + 16}
                      rx={10}
                      fill={
                        validationIssue.severity === 'error'
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(245, 158, 11, 0.12)'
                      }
                      stroke={validationIssue.severity === 'error' ? '#ef4444' : '#f59e0b'}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      className="animate-pulse"
                    />
                    <g transform={`translate(${meta.width / 2 + 4}, ${-meta.height / 2 - 4})`}>
                      <circle
                        r={8}
                        fill={validationIssue.severity === 'error' ? '#ef4444' : '#f59e0b'}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        className="text-[10px] font-extrabold fill-white"
                      >
                        !
                      </text>
                    </g>
                  </g>
                )}

                {/* Selection Highlight Box */}
                {isSelected && (
                  <rect
                    x={-meta.width / 2 - 6}
                    y={-meta.height / 2 - 6}
                    width={meta.width + 12}
                    height={meta.height + 12}
                    rx={8}
                    fill="rgba(56, 189, 248, 0.08)"
                    stroke="#38bdf8"
                    strokeWidth={1.6}
                    strokeDasharray="4 2"
                    className="pointer-events-none"
                  />
                )}

                {/* Rotated Symbol Group */}
                <g
                  transform={`rotate(${comp.rotation})`}
                  onMouseDown={(e) => handleComponentMouseDown(e, comp)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (comp.type === 'switch' || comp.type === 'logic_input') {
                      onToggleInteractiveComponent(comp.id);
                    } else {
                      onRotateComponent(comp.id);
                    }
                  }}
                  className="cursor-pointer"
                >
                  {/* Transparent bounding hit box */}
                  <rect
                    x={-meta.width / 2}
                    y={-meta.height / 2}
                    width={meta.width}
                    height={meta.height}
                    fill="transparent"
                  />

                  {renderComponentGraphic(comp)}

                  {/* Internal Current Flow Dots along 2-pin components */}
                  {compHasFlow && meta.pins.length === 2 && (
                    <line
                      x1={meta.pins[0].dx}
                      y1={meta.pins[0].dy}
                      x2={meta.pins[1].dx}
                      y2={meta.pins[1].dy}
                      stroke="#fbbf24"
                      strokeWidth={3}
                      strokeDasharray="4 8"
                      strokeLinecap="round"
                      className={`pointer-events-none ${
                        compSignedCurrent >= 0
                          ? 'animate-current-forward'
                          : 'animate-current-reverse'
                      }`}
                    />
                  )}
                </g>

                {/* Component Label & Nominal Value (always positioned without colliding with terminals!) */}
                {(() => {
                  const isVertical = comp.rotation === 90 || comp.rotation === 270;
                  const labelTrans =
                    comp.type === 'ne555'
                      ? 'translate(0, -68)'
                      : isVertical
                      ? 'translate(-34, -4)'
                      : 'translate(0, -22)';
                  const anchor = isVertical && comp.type !== 'ne555' ? 'end' : 'middle';

                  return (
                    <g transform={labelTrans} className="pointer-events-none">
                      <text
                        x={0}
                        y={0}
                        textAnchor={anchor}
                        className={`text-[11px] font-mono font-bold ${
                          isSelected
                            ? 'fill-sky-400'
                            : darkMode
                            ? 'fill-slate-100'
                            : 'fill-slate-900'
                        }`}
                      >
                        {comp.label}{' '}
                        <tspan className="font-normal fill-slate-400 text-[10px]">
                          ({formatComponentBadgeValue(comp)})
                        </tspan>
                      </text>
                    </g>
                  );
                })()}

                {/* Zero-current branch badge (Hint 1) */}
                {isZeroCurrentBranch && (
                  <g transform="translate(0, 24)" className="pointer-events-none">
                    <rect
                      x={-42}
                      y={-8}
                      width={84}
                      height={16}
                      rx={4}
                      fill="rgba(245, 158, 11, 0.22)"
                      stroke="#f59e0b"
                      strokeWidth={1}
                    />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      className="text-[8px] font-mono font-semibold fill-amber-300"
                    >
                      I = 0 A (przerwa)
                    </text>
                  </g>
                )}

                {/* STEP 2: Schematic Calculated Values Overlay (U, I, P, Q) */}
                {showSchematicValues &&
                  compRes &&
                  comp.type !== 'ground' &&
                  comp.type !== 'logic_input' &&
                  comp.type !== 'logic_probe' &&
                  (() => {
                    const isVertical = comp.rotation === 90 || comp.rotation === 270;
                    const telemetryTrans =
                      comp.type === 'ne555'
                        ? 'translate(0, 72)'
                        : isVertical
                        ? 'translate(36, 0)'
                        : 'translate(0, 24)';

                    const uVal =
                      simulationResult?.regime === 'AC' && compRes.voltageDropAC
                        ? compRes.voltageDropAC.mag
                        : Math.abs(compRes.voltageDropDC);
                    const iVal =
                      simulationResult?.regime === 'AC' && compRes.currentAC
                        ? compRes.currentAC.mag
                        : Math.abs(compRes.currentDC);
                    const uBest = formatWithBestPrefix(uVal, 'V', 1).formatted;
                    const iBest = formatWithBestPrefix(iVal, 'A', 1).formatted;
                    const pBest = formatWithBestPrefix(Math.abs(compRes.activePowerP), 'W', 1).formatted;
                    const qBest = formatWithBestPrefix(Math.abs(compRes.reactivePowerQ), 'var', 1).formatted;
                    const hasQ = compRes.reactivePowerQ && Math.abs(compRes.reactivePowerQ) > 1e-6;
                    const arrow = compRes.currentDC >= 0 ? '→' : '←';

                    const boxW = 84;
                    const boxH = hasQ ? 30 : 22;

                    return (
                      <g transform={telemetryTrans} className="pointer-events-none">
                        <rect
                          x={-boxW / 2}
                          y={-boxH / 2}
                          width={boxW}
                          height={boxH}
                          rx={5}
                          fill={darkMode ? 'rgba(11, 15, 25, 0.95)' : 'rgba(255, 255, 255, 0.96)'}
                          stroke={darkMode ? '#334155' : '#94a3b8'}
                          strokeWidth={1}
                        />
                        <text
                          x={0}
                          y={hasQ ? -3 : 2}
                          textAnchor="middle"
                          className="text-[8.5px] font-mono font-bold fill-sky-400"
                        >
                          {uBest} • {iBest} {arrow}
                        </text>
                        <text
                          x={0}
                          y={hasQ ? 9 : 8}
                          textAnchor="middle"
                          className="text-[7.5px] font-mono font-semibold fill-emerald-400"
                        >
                          {pBest}{hasQ ? ` • ${qBest}` : ''}
                        </text>
                      </g>
                    );
                  })()}

                {/* Quick Floating Action Toolbar when Component is Selected */}
                {isSelected && (
                  <g transform={`translate(${meta.width / 2 + 18}, -22)`}>
                    {/* Rotate 90° button */}
                    <g
                      onClick={(e) => {
                        e.stopPropagation();
                        onRotateComponent(comp.id);
                      }}
                      className="cursor-pointer"
                    >
                      <rect
                        x={-11}
                        y={-11}
                        width={22}
                        height={22}
                        rx={5}
                        fill={darkMode ? '#1e293b' : '#ffffff'}
                        stroke="#38bdf8"
                        strokeWidth={1.4}
                      />
                      <text x={0} y={4} textAnchor="middle" className="text-[11px] font-bold fill-sky-400">
                        ↻
                      </text>
                    </g>
                    {/* Delete button */}
                    <g
                      transform="translate(0, 26)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteComponent(comp.id);
                      }}
                      className="cursor-pointer"
                    >
                      <rect
                        x={-11}
                        y={-11}
                        width={22}
                        height={22}
                        rx={5}
                        fill="#ef4444"
                        stroke="#ffffff"
                        strokeWidth={1.2}
                      />
                      <text x={0} y={4} textAnchor="middle" className="text-[11px] font-bold fill-white">
                        ×
                      </text>
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* 5. INTERACTIVE PINS LAYER (Snap-to-Pin) */}
          {allPins.map((pin) => {
            const isHovered =
              hoveredPin?.componentId === pin.componentId && hoveredPin?.pinId === pin.pinId;
            const isSourcePin =
              wiringFromPin?.componentId === pin.componentId &&
              wiringFromPin?.pinId === pin.pinId;

            return (
              <g
                key={`${pin.componentId}:${pin.pinId}`}
                transform={`translate(${pin.absX}, ${pin.absY})`}
                onMouseDown={(e) =>
                  handlePinMouseDown(e, pin.componentId, pin.pinId, {
                    x: pin.absX,
                    y: pin.absY,
                  })
                }
                className="cursor-Crosshair"
              >
                {/* Larger invisible hit target */}
                <circle r={11} fill="transparent" />

                {/* Magnetic pulse ring when hovered or active source pin */}
                {(isHovered || isSourcePin) && (
                  <circle
                    r={9}
                    fill={isSourcePin ? 'rgba(56, 189, 248, 0.28)' : 'rgba(16, 185, 129, 0.3)'}
                    stroke={isSourcePin ? '#38bdf8' : '#10b981'}
                    strokeWidth={1.8}
                  />
                )}

                {/* Pin terminal circle */}
                <circle
                  r={isHovered || isSourcePin ? 4.5 : 3.2}
                  fill={
                    isSourcePin
                      ? '#38bdf8'
                      : isHovered
                      ? '#10b981'
                      : darkMode
                      ? '#cbd5e1'
                      : '#475569'
                  }
                  stroke={darkMode ? '#0f172a' : '#ffffff'}
                  strokeWidth={1.4}
                />
              </g>
            );
          })}

          {/* 6. SNAP-TO-WIRE MAGNETIC INDICATOR */}
          {wiringFromPin && hoveredWireSnap && (
            <g
              transform={`translate(${hoveredWireSnap.point.x}, ${hoveredWireSnap.point.y})`}
              className="pointer-events-none"
            >
              <circle
                r={10}
                fill="rgba(16, 185, 129, 0.25)"
                stroke="#10b981"
                strokeWidth={2}
              />
              <circle r={4.5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
              <rect
                x={12}
                y={-10}
                width={108}
                height={18}
                rx={4}
                fill="#065f46"
                stroke="#10b981"
                strokeWidth={1}
              />
              <text x={66} y={2} textAnchor="middle" className="text-[9px] font-mono font-bold fill-emerald-100">
                Węzeł na przewodzie
              </text>
            </g>
          )}

          {/* 7. ORTHOGONAL WIRE PREVIEW LINE */}
          {wiringFromPin && previewWirePoints.length > 1 && (
            <path
              d={pointsToSvgPath(previewWirePoints)}
              fill="none"
              stroke="#10b981"
              strokeWidth={2.5}
              strokeDasharray="6 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none"
            />
          )}

          {/* 8. GHOST PREVIEW FOR NEW COMPONENT PLACEMENT */}
          {pendingComponentType && (
            <g
              transform={`translate(${ghostX}, ${ghostY})`}
              opacity={0.65}
              className="pointer-events-none"
            >
              {renderComponentGraphic(
                {
                  id: 'ghost',
                  type: pendingComponentType,
                  label: COMPONENT_CATALOG[pendingComponentType].defaultLabelPrefix + '?',
                  x: ghostX,
                  y: ghostY,
                  rotation: 0,
                  value: COMPONENT_CATALOG[pendingComponentType].defaultValue,
                  prefix: COMPONENT_CATALOG[pendingComponentType].defaultPrefix,
                  unit: COMPONENT_CATALOG[pendingComponentType].unit,
                  switchClosed: false,
                  logicState: 1,
                },
                true
              )}
            </g>
          )}
        </g>
      </svg>

      {/* Bottom-Right Floating Zoom & View Controls */}
      <div
        className={`absolute bottom-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-xl border shadow-lg backdrop-blur-md ${
          darkMode
            ? 'bg-slate-900/90 border-slate-700/80 text-slate-200'
            : 'bg-white/90 border-slate-300 text-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
          title="Pomniejsz widok"
          className="p-1.5 rounded-lg hover:bg-slate-700/40 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-2 font-mono text-xs font-semibold min-w-[52px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.5, Number((z + 0.15).toFixed(2))))}
          title="Powiększ widok"
          className="p-1.5 rounded-lg hover:bg-slate-700/40 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-slate-700/50 mx-0.5" />
        <button
          type="button"
          onClick={fitCircuitToView}
          title="Dopasuj i wycentruj schemat na ekranie"
          className="p-1.5 rounded-lg hover:bg-slate-700/40 transition-colors flex items-center gap-1 text-xs"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom-Left Equipotential Nodes Mini-Legend & Shortcut Hints */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-2 max-w-xs">
        {showNodePotentials && simulationResult?.nodes && simulationResult.nodes.length > 0 && (
          <div
            className={`p-2.5 rounded-xl border shadow-lg backdrop-blur-md text-xs ${
              darkMode
                ? 'bg-slate-900/90 border-slate-700/80 text-slate-200'
                : 'bg-white/90 border-slate-300 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-4 mb-1.5">
              <span className="font-bold flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-sky-400">
                <Eye className="w-3.5 h-3.5" />
                Węzły ekwipotencjalne
              </span>
              <button
                type="button"
                onClick={() => setShowNodeLegend((v) => !v)}
                className="text-[10px] text-slate-400 hover:text-slate-200"
              >
                {showNodeLegend ? 'Ukryj' : 'Pokaż'}
              </button>
            </div>
            {showNodeLegend && (
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {simulationResult.nodes.map((n) => (
                  <div key={n.id} className="flex items-center justify-between gap-3 text-[11px] font-mono">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: n.color }}
                      />
                      <span>{n.label}:</span>
                    </span>
                    <span className="font-bold">
                      {simulationResult.regime === 'AC' && n.potentialAC
                        ? `${formatWithBestPrefix(n.potentialAC.mag, 'V', 2).formatted} ∠${formatPolishNumber(
                            n.potentialAC.phaseDeg,
                            1
                          )}°`
                        : formatWithBestPrefix(n.potentialDC, 'V', 2).formatted}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Subtle CAD Controls Hint Bar */}
        <div
          className={`px-3 py-1.5 rounded-lg border text-[11px] flex items-center gap-3 backdrop-blur-sm ${
            darkMode
              ? 'bg-slate-900/75 border-slate-800 text-slate-400'
              : 'bg-white/80 border-slate-200 text-slate-600'
          }`}
        >
          <span className="flex items-center gap-1">
            <MousePointer className="w-3 h-3 text-sky-400" /> Kliknij pin/przewód: łączenie
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <RotateCw className="w-3 h-3 text-amber-400" /> 2×Klik: przełącz/obróć
          </span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Compass className="w-3 h-3 text-emerald-400" /> Spacja+Mysz: przesuń
          </span>
        </div>
      </div>

      {/* Top-Right Selected Item Quick Actions Pill */}
      {(selectedComponentId || selectedWireId) && (
        <div
          className={`absolute top-3 right-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-md backdrop-blur-md text-xs ${
            darkMode
              ? 'bg-slate-900/90 border-slate-700 text-slate-200'
              : 'bg-white/90 border-slate-300 text-slate-800'
          }`}
        >
          {selectedComponentId && (
            <button
              type="button"
              onClick={() => onRotateComponent(selectedComponentId)}
              className="flex items-center gap-1 px-2 py-1 rounded bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 font-medium transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" /> Obróć 90° (R)
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (selectedComponentId) onDeleteComponent(selectedComponentId);
              if (selectedWireId) onDeleteWire(selectedWireId);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Usuń (Del)
          </button>
        </div>
      )}

      {/* Validation Warning Pill in Top-Left if Circuit Has Errors */}
      {simulationResult && simulationResult.validationIssues.length > 0 && (
        <div
          className={`absolute top-3 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-xl border shadow-md backdrop-blur-md text-xs max-w-md ${
            simulationResult.validationIssues.some((i) => i.severity === 'error')
              ? 'bg-red-950/90 border-red-500/60 text-red-200'
              : 'bg-amber-950/90 border-amber-500/60 text-amber-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span className="truncate font-medium">
            {simulationResult.validationIssues[0].title}
          </span>
        </div>
      )}
    </div>
  );
};

export default CircuitCanvas;
