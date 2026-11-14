import { complex, Complex, add, subtract, multiply, divide } from 'mathjs';
import {
  CircuitComponent,
  Wire,
  SimulationResult,
  ElectricalNode,
  ComponentSimulationResult,
  ValidationIssue,
  DigitalAnalysisResult,
  TruthTableRow,
  BodeAnalysis,
  BodePoint,
  DidacticSolution,
  TopologicalGroup,
  SymbolicFormulaItem,
  SIConversionStep,
  DerivationStep,
  ComplexValue,
  NE555Analysis,
  PinReference,
} from '../types/circuit';
import {
  SI_PREFIXES,
  toSIValue,
  formatPolishNumber,
  formatWithBestPrefix,
  formatComplexAlgebraicLatex,
  formatComplexExponentialLatex,
} from '../utils/units';
import { COMPONENT_CATALOG, getPinAbsolutePosition } from '../utils/componentCatalog';

const NODE_COLORS = [
  '#10b981', // GND (0 V) - emerald
  '#3b82f6', // Node 1 - blue
  '#f59e0b', // Node 2 - amber
  '#ec4899', // Node 3 - pink
  '#8b5cf6', // Node 4 - violet
  '#06b6d4', // Node 5 - cyan
  '#f97316', // Node 6 - orange
  '#14b8a6', // Node 7 - teal
  '#e11d48', // Node 8 - rose
  '#6366f1', // Node 9 - indigo
];

const DIGITAL_TYPES = new Set([
  'and_gate',
  'or_gate',
  'not_gate',
  'nand_gate',
  'nor_gate',
  'xor_gate',
  'logic_input',
  'clock',
  'logic_probe',
]);

const ANALOG_PASSIVE_TYPES = new Set(['resistor', 'inductor', 'capacitor']);

function toComplexValue(re: number, im: number): ComplexValue {
  const cleanRe = Math.abs(re) < 1e-14 ? 0 : re;
  const cleanIm = Math.abs(im) < 1e-14 ? 0 : im;
  const mag = Math.hypot(cleanRe, cleanIm);
  const phaseDeg = mag < 1e-14 ? 0 : (Math.atan2(cleanIm, cleanRe) * 180) / Math.PI;
  return { re: cleanRe, im: cleanIm, mag, phaseDeg };
}

function cFromMath(c: Complex): ComplexValue {
  return toComplexValue(c.re, c.im);
}

/**
 * Gaussian elimination with partial pivoting over mathjs Complex matrices.
 * Never throws: uses small diagonal regularization when encountering a singular sub-circuit.
 */
function solveComplexLinearSystem(A: Complex[][], b: Complex[]): Complex[] {
  const n = b.length;
  if (n === 0) return [];

  const M: Complex[][] = A.map((row) => row.map((val) => complex(val.re, val.im)));
  const rhs: Complex[] = b.map((val) => complex(val.re, val.im));

  for (let col = 0; col < n; col++) {
    // Find pivot with maximum magnitude
    let maxRow = col;
    let maxMag = Math.hypot(M[col][col].re, M[col][col].im);
    for (let row = col + 1; row < n; row++) {
      const mag = Math.hypot(M[row][col].re, M[row][col].im);
      if (mag > maxMag) {
        maxMag = mag;
        maxRow = row;
      }
    }

    if (maxRow !== col) {
      [M[col], M[maxRow]] = [M[maxRow], M[col]];
      [rhs[col], rhs[maxRow]] = [rhs[maxRow], rhs[col]];
    }

    // Regularize if pivot is near zero (singular / floating subcircuit)
    if (Math.hypot(M[col][col].re, M[col][col].im) < 1e-15) {
      M[col][col] = complex(1e-12, 0);
    }

    const pivot = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = divide(M[row][col], pivot) as Complex;
      if (Math.hypot(factor.re, factor.im) < 1e-18) continue;
      for (let k = col; k < n; k++) {
        M[row][k] = subtract(M[row][k], multiply(factor, M[col][k])) as Complex;
      }
      rhs[row] = subtract(rhs[row], multiply(factor, rhs[col])) as Complex;
    }
  }

  const x: Complex[] = Array.from({ length: n }, () => complex(0, 0));
  for (let row = n - 1; row >= 0; row--) {
    let sum = rhs[row];
    for (let col = row + 1; col < n; col++) {
      sum = subtract(sum, multiply(M[row][col], x[col])) as Complex;
    }
    const pivot = M[row][row];
    const pivotMag = Math.hypot(pivot.re, pivot.im);
    x[row] = pivotMag < 1e-18 ? complex(0, 0) : (divide(sum, pivot) as Complex);
  }

  return x;
}

/**
 * Builds electrical nodes using Disjoint Set (Union-Find) across all component pins and wires.
 */
function buildElectricalNodes(
  components: CircuitComponent[],
  wires: Wire[]
): {
  nodes: ElectricalNode[];
  pinToNodeId: Map<string, string>;
  hasExplicitGround: boolean;
  autoGroundPinKey: string | null;
} {
  const parent = new Map<string, string>();
  const pinRefMap = new Map<string, PinReference>();
  const posKeyToPinKeys = new Map<string, string[]>();

  const makeKey = (compId: string, pinId: string) => `${compId}:${pinId}`;

  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    let curr = k;
    while (curr !== root) {
      const nxt = parent.get(curr)!;
      parent.set(curr, root);
      curr = nxt;
    }
    return root;
  };

  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(rb, ra);
    }
  };

  for (const comp of components) {
    const meta = COMPONENT_CATALOG[comp.type];
    if (!meta) continue;
    for (const pin of meta.pins) {
      const key = makeKey(comp.id, pin.id);
      parent.set(key, key);
      pinRefMap.set(key, { componentId: comp.id, pinId: pin.id });

      // Also group pins that physically touch at the exact same grid coordinate
      const pos = getPinAbsolutePosition(comp, pin.id);
      const posKey = `${pos.x},${pos.y}`;
      const existing = posKeyToPinKeys.get(posKey) || [];
      existing.push(key);
      posKeyToPinKeys.set(posKey, existing);
    }
  }

  // Union pins touching at the exact same grid point
  for (const keys of Array.from(posKeyToPinKeys.values())) {
    for (let i = 1; i < keys.length; i++) {
      union(keys[0], keys[i]);
    }
  }

  // Union pins connected by wires
  for (const wire of wires) {
    const kFrom = makeKey(wire.from.componentId, wire.from.pinId);
    const kTo = makeKey(wire.to.componentId, wire.to.pinId);
    union(kFrom, kTo);
  }

  // Union all explicit 'ground' components together into a single common reference potential
  const groundCompPinKeys: string[] = [];
  for (const comp of components) {
    if (comp.type === 'ground') {
      groundCompPinKeys.push(makeKey(comp.id, 'gnd'));
    }
  }
  for (let i = 1; i < groundCompPinKeys.length; i++) {
    union(groundCompPinKeys[0], groundCompPinKeys[i]);
  }

  // Check if any NE555 GND pin is present when no explicit ground component exists
  const hasExplicitGround = groundCompPinKeys.length > 0;
  let groundRoot: string | null = hasExplicitGround ? find(groundCompPinKeys[0]) : null;
  let autoGroundPinKey: string | null = null;

  if (!groundRoot) {
    // Look for NE555 GND pin, or negative terminal of first voltage/current source
    const ne555 = components.find((c) => c.type === 'ne555');
    const vSource = components.find((c) => c.type === 'dc_voltage' || c.type === 'ac_voltage');
    const iSource = components.find((c) => c.type === 'current_source');
    if (vSource) {
      autoGroundPinKey = makeKey(vSource.id, 'neg');
      groundRoot = find(autoGroundPinKey);
    } else if (ne555) {
      autoGroundPinKey = makeKey(ne555.id, 'GND');
      groundRoot = find(autoGroundPinKey);
    } else if (iSource) {
      autoGroundPinKey = makeKey(iSource.id, 'in');
      groundRoot = find(autoGroundPinKey);
    } else if (components.length > 0) {
      const firstComp = components[0];
      const firstMeta = COMPONENT_CATALOG[firstComp.type];
      if (firstMeta && firstMeta.pins.length > 0) {
        autoGroundPinKey = makeKey(firstComp.id, firstMeta.pins[firstMeta.pins.length - 1].id);
        groundRoot = find(autoGroundPinKey);
      }
    }
  }

  // Group all pins by their root
  const rootGroups = new Map<string, PinReference[]>();
  for (const [key, ref] of Array.from(pinRefMap.entries())) {
    const r = find(key);
    const list = rootGroups.get(r) || [];
    list.push(ref);
    rootGroups.set(r, list);
  }

  const nodes: ElectricalNode[] = [];
  const pinToNodeId = new Map<string, string>();

  // First create node "0" if groundRoot exists
  if (groundRoot && rootGroups.has(groundRoot)) {
    const pins = rootGroups.get(groundRoot)!;
    nodes.push({
      id: '0',
      label: 'GND (0 V)',
      pins,
      isGround: true,
      potentialDC: 0,
      potentialAC: toComplexValue(0, 0),
      digitalState: '0',
      color: NODE_COLORS[0],
    });
    for (const p of pins) {
      pinToNodeId.set(makeKey(p.componentId, p.pinId), '0');
    }
  }

  let nextIdx = 1;
  for (const [root, pins] of Array.from(rootGroups.entries())) {
    if (root === groundRoot) continue;
    // Skip isolated single-pin nodes belonging to a standalone ground symbol (already handled)
    const id = String(nextIdx);
    const color = NODE_COLORS[nextIdx % NODE_COLORS.length];
    nodes.push({
      id,
      label: `Węzeł ${id}`,
      pins,
      isGround: false,
      potentialDC: 0,
      potentialAC: toComplexValue(0, 0),
      digitalState: null,
      color,
    });
    for (const p of pins) {
      pinToNodeId.set(makeKey(p.componentId, p.pinId), id);
    }
    nextIdx++;
  }

  return { nodes, pinToNodeId, hasExplicitGround, autoGroundPinKey };
}

/**
 * Determines simulation regime and operating frequency.
 */
function detectRegimeAndFrequency(components: CircuitComponent[]): {
  regime: 'DC' | 'AC' | 'DIGITAL' | 'MIXED' | 'EMPTY';
  frequencyHz: number;
  angularFrequencyOmega: number;
  periodSec: number;
} {
  if (components.length === 0) {
    return { regime: 'EMPTY', frequencyHz: 0, angularFrequencyOmega: 0, periodSec: 0 };
  }

  const hasDigital = components.some((c) => DIGITAL_TYPES.has(c.type));
  const hasAnalog = components.some(
    (c) =>
      !DIGITAL_TYPES.has(c.type) &&
      c.type !== 'ground' &&
      c.type !== 'voltmeter' &&
      c.type !== 'ammeter'
  );

  const acSources = components.filter((c) => c.type === 'ac_voltage');
  if (hasDigital && !hasAnalog) {
    const clk = components.find((c) => c.type === 'clock');
    const f = clk ? toSIValue(clk.value || 1, clk.prefix || '') : 0;
    return {
      regime: 'DIGITAL',
      frequencyHz: f,
      angularFrequencyOmega: 2 * Math.PI * f,
      periodSec: f > 0 ? 1 / f : 0,
    };
  }

  if (hasDigital && hasAnalog) {
    const ac = acSources[0];
    const f = ac ? toSIValue(ac.frequency ?? 50, ac.frequencyPrefix ?? '') : 0;
    return {
      regime: 'MIXED',
      frequencyHz: f,
      angularFrequencyOmega: 2 * Math.PI * f,
      periodSec: f > 0 ? 1 / f : 0,
    };
  }

  if (acSources.length > 0) {
    const ac = acSources[0];
    const f = Math.max(1e-6, toSIValue(ac.frequency ?? 50, ac.frequencyPrefix ?? ''));
    const omega = 2 * Math.PI * f;
    return {
      regime: 'AC',
      frequencyHz: f,
      angularFrequencyOmega: omega,
      periodSec: 1 / f,
    };
  }

  return {
    regime: 'DC',
    frequencyHz: 0,
    angularFrequencyOmega: 0,
    periodSec: 0,
  };
}

/**
 * Performs comprehensive didactic validation for common beginner mistakes.
 */
function validateCircuit(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  pinToNodeId: Map<string, string>,
  hasExplicitGround: boolean,
  regime: 'DC' | 'AC' | 'DIGITAL' | 'MIXED' | 'EMPTY'
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (components.length === 0) return issues;

  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '';
  const nodeMap = new Map<string, ElectricalNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const hasAnalog = components.some((c) => !DIGITAL_TYPES.has(c.type) && c.type !== 'ground');

  // 1. Missing explicit Ground in analog circuit
  if (hasAnalog && !hasExplicitGround) {
    issues.push({
      id: 'missing-ground',
      severity: 'warning',
      title: 'Brak podłączonej masy odniesienia (GND = 0 V)',
      explanation:
        'W obwodzie nie umieszczono elementu Masa (GND). Solver automatycznie przyjął zacisk ujemny źródła jako punkt odniesienia 0 V, aby obliczenia mogły się wykonać.',
      didacticTip:
        'Napięcie elektryczne to różnica potencjałów (U = V_A - V_B). Aby określić potencjał pojedynczego węzła V_A, musimy zawsze wskazać jeden węzeł odniesienia (masę GND), któremu przypisujemy potencjał dokładnie 0 V.',
      affectedComponentIds: components.filter((c) => c.type === 'dc_voltage' || c.type === 'ac_voltage').map((c) => c.id),
      affectedNodeIds: ['0'],
    });
  }

  // Build adjacency of ideal zero-resistance elements (closed switches, ammeters, inductors in DC)
  const vSources = components.filter((c) => c.type === 'dc_voltage' || c.type === 'ac_voltage');
  const ammeters = components.filter((c) => c.type === 'ammeter');
  const voltmeters = components.filter((c) => c.type === 'voltmeter');
  const switches = components.filter((c) => c.type === 'switch' && c.switchClosed !== false);

  // 2. Ammeter in parallel with voltage source or self-shorted voltage source
  for (const vs of vSources) {
    const nPos = getPinNode(vs.id, 'pos');
    const nNeg = getPinNode(vs.id, 'neg');

    if (nPos && nPos === nNeg) {
      issues.push({
        id: `short-source-${vs.id}`,
        severity: 'error',
        title: `Zwarcie bezpośrednie zacisków źródła napięcia ${vs.label}!`,
        explanation: `Dodatni (+) i ujemny (-) zacisk źródła ${vs.label} są połączone bezpośrednio tym samym przewodem (należą do jednego węzła ekwipotencjalnego).`,
        didacticTip:
          'Zgodnie z Prawem Ohma I = U / R. Gdy opór przewodu R → 0 Ω, prąd zwarcia dąży do nieskończoności (I → ∞), co w rzeczywistości powoduje przepalenie bezpiecznika lub uszkodzenie zasilacza!',
        affectedComponentIds: [vs.id],
        affectedNodeIds: [nPos],
      });
    }

    // Check if an ammeter is directly across the voltage source
    for (const amm of ammeters) {
      const a1 = getPinNode(amm.id, 'pos');
      const a2 = getPinNode(amm.id, 'neg');
      if ((a1 === nPos && a2 === nNeg) || (a1 === nNeg && a2 === nPos)) {
        issues.push({
          id: `ammeter-parallel-${amm.id}-${vs.id}`,
          severity: 'error',
          title: `BŁĄD POMIAROWY: Amperomierz ${amm.label} włączony równolegle do źródła ${vs.label}!`,
          explanation: `Amperomierz ${amm.label} został podłączony bezpośrednio równolegle do zacisków źródła napięcia ${vs.label}, powodując groźne zwarcie!`,
          didacticTip:
            'Idealny amperomierz ma zerowy opór wewnętrzny (R_A ≈ 0 Ω). Amperomierz łączymy WYŁĄCZNIE SZEREGOWO (rozcinając gałąź), natomiast równolegle wolno podłączać wyłącznie woltomierz!',
          affectedComponentIds: [amm.id, vs.id],
          affectedNodeIds: [nPos, nNeg],
        });
      }
    }

    // Check if a closed switch shorts the voltage source directly
    for (const sw of switches) {
      const s1 = getPinNode(sw.id, 'p1');
      const s2 = getPinNode(sw.id, 'p2');
      if ((s1 === nPos && s2 === nNeg) || (s1 === nNeg && s2 === nPos)) {
        issues.push({
          id: `switch-short-${sw.id}-${vs.id}`,
          severity: 'error',
          title: `Zwarcie źródła ${vs.label} przez zamknięty wyłącznik ${sw.label}!`,
          explanation: `Zamknięty klucz ${sw.label} (R ≈ 0 Ω) łączy bezpośrednio zaciski + i - źródła napięciowego ${vs.label} bez żadnego odbiornika ograniczającego prąd.`,
          didacticTip:
            'W każdej zamkniętej pętli ze źródłem napięcia musi znajdować się element ograniczający prąd (np. rezystor R). Przy R → 0 Ω prąd I = E / R → ∞.',
          affectedComponentIds: [sw.id, vs.id],
          affectedNodeIds: [nPos, nNeg],
        });
      }
    }
  }

  // 3. Voltmeter connected in series as the only path
  for (const vm of voltmeters) {
    const v1 = getPinNode(vm.id, 'pos');
    const v2 = getPinNode(vm.id, 'neg');
    const node1 = nodeMap.get(v1);
    const node2 = nodeMap.get(v2);

    // If either pin of voltmeter shares a node with only 1 other component (degree 2 node) and neither node is ground with parallel path
    const deg1 = node1 ? node1.pins.length : 0;
    const deg2 = node2 ? node2.pins.length : 0;
    if (deg1 === 2 && deg2 === 2 && v1 !== v2) {
      const otherPin1 = node1!.pins.find((p) => p.componentId !== vm.id);
      const otherPin2 = node2!.pins.find((p) => p.componentId !== vm.id);
      if (otherPin1 && otherPin2 && otherPin1.componentId !== otherPin2.componentId) {
        issues.push({
          id: `voltmeter-series-${vm.id}`,
          severity: 'warning',
          title: `UWAGA: Woltomierz ${vm.label} włączony szeregowo w gałąź!`,
          explanation: `Woltomierz ${vm.label} został wpięty szeregowo pomiędzy elementy obwodu, blokując przepływ prądu w tej gałęzi (I ≈ 0 A).`,
          didacticTip:
            'Idealny woltomierz ma nieskończenie wielki opór wewnętrzny (R_V → ∞, w symulatorze 1 TΩ). Działa jak przerwa w obwodzie! Woltomierz podłączamy zawsze RÓWNOLEGLE do badanego elementu, a szeregowo włączamy amperomierz.',
          affectedComponentIds: [vm.id],
          affectedNodeIds: [v1, v2],
        });
      }
    }
  }

  // 4. Op-Amp floating inputs
  for (const comp of components) {
    if (comp.type === 'opamp') {
      const nPlus = getPinNode(comp.id, 'in_plus');
      const nMinus = getPinNode(comp.id, 'in_minus');
      const nodePlus = nodeMap.get(nPlus);
      const nodeMinus = nodeMap.get(nMinus);
      if (!nodePlus || nodePlus.pins.length < 2 || !nodeMinus || nodeMinus.pins.length < 2) {
        issues.push({
          id: `opamp-floating-${comp.id}`,
          severity: 'warning',
          title: `Niepodłączone wejście wzmacniacza operacyjnego ${comp.label}`,
          explanation: `Jedno z wejść sterujących (IN+ lub IN-) wzmacniacza ${comp.label} wisi w powietrzu (nie jest połączone z żadnym potencjałem).`,
          didacticTip:
            'Wzmacniacz operacyjny wzmacnia różnicę potencjałów między wejściami: U_wy = A_0 · (V_+ - V_-). Oba wejścia (IN+ oraz IN-) muszą mieć określony potencjał (np. przez podłączenie do masy, źródła sygnału lub pętli sprzężenia zwrotnego).',
          affectedComponentIds: [comp.id],
        });
      }
    }
  }

  // 5. Didactic info for Capacitor in DC regime
  if (regime === 'DC') {
    const caps = components.filter((c) => c.type === 'capacitor');
    if (caps.length > 0) {
      issues.push({
        id: 'dc-capacitor-info',
        severity: 'info',
        title: `Kondensator (${caps.map((c) => c.label).join(', ')}) w obwodzie prądu stałego (DC)`,
        explanation:
          'W stanie ustalonym dla prądu stałego (f = 0 Hz) po naładowaniu okładek kondensator stanowi PRZERWĘ (rozwarcie) w gałęzi, dlatego prąd stały przez niego nie płynie (I_C = 0 A).',
        didacticTip:
          'Ze wzoru na reaktancję pojemnościową X_C = 1 / (2π·f·C) widać, że gdy f → 0 Hz, opór bierny X_C → ∞ Ω. Na zaciskach kondensatora odkłada się jednak napięcie równe różnicy potencjałów węzłów, gromadząc ładunek Q_e = C · U.',
        affectedComponentIds: caps.map((c) => c.id),
      });
    }

    const inds = components.filter((c) => c.type === 'inductor');
    if (inds.length > 0) {
      issues.push({
        id: 'dc-inductor-info',
        severity: 'info',
        title: `Cewka indukcyjna (${inds.map((c) => c.label).join(', ')}) w obwodzie prądu stałego (DC)`,
        explanation:
          'W stanie ustalonym dla prądu stałego (f = 0 Hz) idealna cewka indukcyjna zachowuje się jak ZWARCIE (przewód bez oporu, X_L = 0 Ω), więc spadek napięcia stałego na niej wynosi U_L = 0 V.',
        didacticTip:
          'Napięcie na cewce wyraża się wzorem u_L(t) = L · di/dt (w ujęciu symbolicznym X_L = 2π·f·L). Dla prądu stałego (niezmiennego w czasie, di/dt = 0, f = 0 Hz) reaktancja indukcyjna X_L = 0 Ω, a w polu magnetycznym cewki gromadzi się energia E_L = ½·L·I².',
        affectedComponentIds: inds.map((c) => c.id),
      });
    }
  }

  return issues;
}

/**
 * Core MNA (Modified Nodal Analysis) solver for any frequency omega >= 0.
 */
function runMNASolverAtOmega(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  pinToNodeId: Map<string, string>,
  omega: number,
  isACRegime: boolean
): {
  nodePotentials: Map<string, Complex>;
  branchCurrents: Map<string, Complex>;
  matrixG: Complex[][];
  vectorI: Complex[];
  unknownLabels: string[];
} {
  const nonGroundNodes = nodes.filter((n) => !n.isGround);
  const nodeIdToMatrixIdx = new Map<string, number>();
  nonGroundNodes.forEach((n, idx) => {
    nodeIdToMatrixIdx.set(n.id, idx);
  });

  const getNodeIdx = (compId: string, pinId: string): number => {
    const nodeId = pinToNodeId.get(`${compId}:${pinId}`);
    if (!nodeId || nodeId === '0') return -1;
    return nodeIdToMatrixIdx.get(nodeId) ?? -1;
  };

  // Identify components requiring an extra branch current equation in MNA:
  // - dc_voltage, ac_voltage
  // - opamp (output pin voltage constraint)
  // - ammeter (0V drop measurement branch)
  // - switch (when closed: 0V drop branch)
  // - inductor (in DC omega === 0: 0V drop branch)
  interface ExtraEquation {
    comp: CircuitComponent;
    eqIndex: number;
    label: string;
  }

  const extraEquations: ExtraEquation[] = [];
  const N = nonGroundNodes.length;

  for (const comp of components) {
    if (
      comp.type === 'dc_voltage' ||
      comp.type === 'ac_voltage' ||
      comp.type === 'opamp' ||
      comp.type === 'ammeter' ||
      (comp.type === 'switch' && comp.switchClosed !== false) ||
      (comp.type === 'inductor' && omega === 0)
    ) {
      extraEquations.push({
        comp,
        eqIndex: N + extraEquations.length,
        label: `I_{${comp.label}}`,
      });
    }
  }

  const totalSize = N + extraEquations.length;
  const G: Complex[][] = Array.from({ length: totalSize }, () =>
    Array.from({ length: totalSize }, () => complex(0, 0))
  );
  const rhs: Complex[] = Array.from({ length: totalSize }, () => complex(0, 0));

  const unknownLabels: string[] = [
    ...nonGroundNodes.map((n) => `V_{${n.id}}`),
    ...extraEquations.map((eq) => eq.label),
  ];

  // Add tiny minimum conductance to ground on every node to prevent floating-node singularity
  for (let i = 0; i < N; i++) {
    G[i][i] = complex(1e-15, 0);
  }

  const stampAdmittance = (n1: number, n2: number, y: Complex) => {
    if (n1 >= 0) {
      G[n1][n1] = add(G[n1][n1], y) as Complex;
    }
    if (n2 >= 0) {
      G[n2][n2] = add(G[n2][n2], y) as Complex;
    }
    if (n1 >= 0 && n2 >= 0) {
      G[n1][n2] = subtract(G[n1][n2], y) as Complex;
      G[n2][n1] = subtract(G[n2][n1], y) as Complex;
    }
  };

  // Stamp passive elements, voltmeters, current sources, open switches, Op-Amp input leakage
  for (const comp of components) {
    const valSI = toSIValue(comp.value, comp.prefix);

    if (comp.type === 'resistor') {
      const r = Math.max(1e-9, valSI);
      const n1 = getNodeIdx(comp.id, 'p1');
      const n2 = getNodeIdx(comp.id, 'p2');
      stampAdmittance(n1, n2, complex(1 / r, 0));
    } else if (comp.type === 'capacitor') {
      const c = Math.max(1e-18, valSI);
      const n1 = getNodeIdx(comp.id, 'p1');
      const n2 = getNodeIdx(comp.id, 'p2');
      if (omega > 0) {
        // Y_C = j * omega * C
        stampAdmittance(n1, n2, complex(0, omega * c));
      } else {
        // DC steady state: open circuit (tiny conductance 1e-15 S so isolated nodes between series capacitors get well-defined potential division!)
        stampAdmittance(n1, n2, complex(1e-15, 0));
      }
    } else if (comp.type === 'inductor' && omega > 0) {
      const l = Math.max(1e-15, valSI);
      const n1 = getNodeIdx(comp.id, 'p1');
      const n2 = getNodeIdx(comp.id, 'p2');
      // Y_L = 1 / (j * omega * L) = -j / (omega * L)
      stampAdmittance(n1, n2, complex(0, -1 / (omega * l)));
    } else if (comp.type === 'voltmeter') {
      const n1 = getNodeIdx(comp.id, 'pos');
      const n2 = getNodeIdx(comp.id, 'neg');
      stampAdmittance(n1, n2, complex(1e-12, 0));
    } else if (comp.type === 'switch' && comp.switchClosed === false) {
      const n1 = getNodeIdx(comp.id, 'p1');
      const n2 = getNodeIdx(comp.id, 'p2');
      stampAdmittance(n1, n2, complex(1e-15, 0));
    } else if (comp.type === 'current_source') {
      const nOut = getNodeIdx(comp.id, 'out');
      const nIn = getNodeIdx(comp.id, 'in');
      const iVal = complex(valSI, 0);
      // Current flows from 'in' to 'out', so it enters node 'out' (+iVal) and leaves node 'in' (-iVal)
      if (nOut >= 0) rhs[nOut] = add(rhs[nOut], iVal) as Complex;
      if (nIn >= 0) rhs[nIn] = subtract(rhs[nIn], iVal) as Complex;
    } else if (comp.type === 'opamp') {
      const nPlus = getNodeIdx(comp.id, 'in_plus');
      const nMinus = getNodeIdx(comp.id, 'in_minus');
      stampAdmittance(nPlus, -1, complex(1e-12, 0));
      stampAdmittance(nMinus, -1, complex(1e-12, 0));
    }
  }

  // Stamp extra branch equations (voltage sources, opamps, ammeters, closed switches, DC inductors)
  for (const eq of extraEquations) {
    const { comp, eqIndex } = eq;
    const valSI = toSIValue(comp.value, comp.prefix);

    if (comp.type === 'dc_voltage' || comp.type === 'ac_voltage') {
      const nPos = getNodeIdx(comp.id, 'pos');
      const nNeg = getNodeIdx(comp.id, 'neg');

      // Convention: unknown x[eqIndex] is current I_branch flowing from nPos to nNeg through the source
      // (so current delivered out of '+' terminal is -x[eqIndex]).
      if (nPos >= 0) {
        G[nPos][eqIndex] = complex(1, 0);
        G[eqIndex][nPos] = complex(1, 0);
      }
      if (nNeg >= 0) {
        G[nNeg][eqIndex] = complex(-1, 0);
        G[eqIndex][nNeg] = complex(-1, 0);
      }
      // Small internal regularization (1e-9 Ohm) prevents singularity if parallel sources exist
      G[eqIndex][eqIndex] = complex(-1e-9, 0);

      if (comp.type === 'dc_voltage') {
        // In purely AC phasor analysis (if mixed), DC source is 0V AC phasor, otherwise valSI
        const vMag = isACRegime ? 0 : valSI;
        rhs[eqIndex] = complex(vMag, 0);
      } else {
        // ac_voltage: value can be RMS (default) or peak amplitude (if isRms === false -> convert to RMS by / sqrt(2))
        const rmsMag = comp.isRms === false ? valSI / Math.SQRT2 : valSI;
        const phaseRad = ((comp.phaseDeg || 0) * Math.PI) / 180;
        rhs[eqIndex] = complex(rmsMag * Math.cos(phaseRad), rmsMag * Math.sin(phaseRad));
      }
    } else if (comp.type === 'ammeter' || (comp.type === 'switch' && comp.switchClosed !== false) || (comp.type === 'inductor' && omega === 0)) {
      const pinA = comp.type === 'ammeter' ? 'pos' : 'p1';
      const pinB = comp.type === 'ammeter' ? 'neg' : 'p2';
      const n1 = getNodeIdx(comp.id, pinA);
      const n2 = getNodeIdx(comp.id, pinB);

      if (n1 >= 0) {
        G[n1][eqIndex] = complex(1, 0);
        G[eqIndex][n1] = complex(1, 0);
      }
      if (n2 >= 0) {
        G[n2][eqIndex] = complex(-1, 0);
        G[eqIndex][n2] = complex(-1, 0);
      }
      G[eqIndex][eqIndex] = complex(-1e-9, 0);
      rhs[eqIndex] = complex(0, 0);
    } else if (comp.type === 'opamp') {
      const nPlus = getNodeIdx(comp.id, 'in_plus');
      const nMinus = getNodeIdx(comp.id, 'in_minus');
      const nOut = getNodeIdx(comp.id, 'out');
      const aOL = comp.opAmpGain || 1e6;

      // Current leaving node nOut into opamp output pin
      if (nOut >= 0) {
        G[nOut][eqIndex] = complex(1, 0);
        G[eqIndex][nOut] = complex(1, 0);
      }
      if (nPlus >= 0) {
        G[eqIndex][nPlus] = complex(-aOL, 0);
      }
      if (nMinus >= 0) {
        G[eqIndex][nMinus] = complex(aOL, 0);
      }
      G[eqIndex][eqIndex] = complex(-1e-9, 0);
      rhs[eqIndex] = complex(0, 0);
    }
  }

  const sol = solveComplexLinearSystem(G, rhs);

  const nodePotentials = new Map<string, Complex>();
  nodePotentials.set('0', complex(0, 0));
  nonGroundNodes.forEach((n, idx) => {
    nodePotentials.set(n.id, sol[idx] || complex(0, 0));
  });

  const branchCurrents = new Map<string, Complex>();
  for (const eq of extraEquations) {
    const rawI = sol[eq.eqIndex] || complex(0, 0);
    if (eq.comp.type === 'dc_voltage' || eq.comp.type === 'ac_voltage') {
      // Source current: positive when flowing OUT of '+' terminal
      branchCurrents.set(eq.comp.id, multiply(rawI, -1) as Complex);
    } else {
      // Passive/ammeter/switch/opamp: current from pin1 (+) to pin2 (-)
      branchCurrents.set(eq.comp.id, rawI);
    }
  }

  return {
    nodePotentials,
    branchCurrents,
    matrixG: G,
    vectorI: rhs,
    unknownLabels,
  };
}

/**
 * Analyzes NE555 timer configuration (Astable / Monostable) dynamically from connected components.
 */
function analyzeNE555(
  ne555Comp: CircuitComponent,
  components: CircuitComponent[],
  pinToNodeId: Map<string, string>,
  nodePotentials: Map<string, Complex>
): NE555Analysis {
  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '';

  const nVCC = getPinNode(ne555Comp.id, 'VCC');
  const nGND = getPinNode(ne555Comp.id, 'GND');
  const nDIS = getPinNode(ne555Comp.id, 'DIS');
  const nTHR = getPinNode(ne555Comp.id, 'THR');
  const nTRIG = getPinNode(ne555Comp.id, 'TRIG');

  const vccNodePot = nodePotentials.get(nVCC)?.re ?? 0;
  const vccVolts = Math.abs(vccNodePot) > 0.5 ? Math.abs(vccNodePot) : toSIValue(ne555Comp.value || 5, ne555Comp.prefix || '');

  const resistors = components.filter((c) => c.type === 'resistor');
  const capacitors = components.filter((c) => c.type === 'capacitor');

  const connectsNodes = (comp: CircuitComponent, nodeA: string, nodeB: string) => {
    if (!nodeA || !nodeB) return false;
    const p1 = getPinNode(comp.id, 'p1');
    const p2 = getPinNode(comp.id, 'p2');
    return (p1 === nodeA && p2 === nodeB) || (p1 === nodeB && p2 === nodeA);
  };

  // Find timing capacitor C between THR (or TRIG) and GND
  const timingCap =
    capacitors.find((c) => connectsNodes(c, nTHR, nGND) || connectsNodes(c, nTRIG, nGND)) ||
    capacitors[0];

  // Find RA between VCC and DIS (or VCC and THR)
  const raComp =
    resistors.find((r) => connectsNodes(r, nVCC, nDIS)) ||
    resistors.find((r) => connectsNodes(r, nVCC, nTHR)) ||
    resistors[0];

  // Find RB between DIS and THR/TRIG
  const rbComp =
    resistors.find((r) => r.id !== raComp?.id && (connectsNodes(r, nDIS, nTHR) || connectsNodes(r, nDIS, nTRIG))) ||
    resistors.find((r) => r.id !== raComp?.id);

  if (raComp && rbComp && timingCap) {
    const ra = toSIValue(raComp.value, raComp.prefix);
    const rb = toSIValue(rbComp.value, rbComp.prefix);
    const c = toSIValue(timingCap.value, timingCap.prefix);

    const ln2 = Math.LN2; // ~0.693147
    const tHighSec = ln2 * (ra + rb) * c;
    const tLowSec = ln2 * rb * c;
    const periodSec = tHighSec + tLowSec;
    const frequencyHz = periodSec > 0 ? 1 / periodSec : 0;
    const dutyCyclePercent = periodSec > 0 ? (tHighSec / periodSec) * 100 : 50;

    const raFmt = formatWithBestPrefix(ra, 'Ω');
    const rbFmt = formatWithBestPrefix(rb, 'Ω');
    const cFmt = formatWithBestPrefix(c, 'F');
    const thFmt = formatWithBestPrefix(tHighSec, 's');
    const tlFmt = formatWithBestPrefix(tLowSec, 's');
    const tFmt = formatWithBestPrefix(periodSec, 's');
    const fFmt = formatWithBestPrefix(frequencyHz, 'Hz');

    return {
      mode: 'astable',
      raOhms: ra,
      rbOhms: rb,
      cFarads: c,
      raLabel: raComp.label,
      rbLabel: rbComp.label,
      cLabel: timingCap.label,
      vccVolts,
      frequencyHz,
      periodSec,
      tHighSec,
      tLowSec,
      dutyCyclePercent,
      explanation: `Układ NE555 pracuje jako generator astabilny (multiwibrator swobodny). Kondensator ${timingCap.label} (${cFmt.formatted}) ładuje się od 1/3 VCC (${formatPolishNumber(vccVolts / 3, 2)} V) do 2/3 VCC (${formatPolishNumber((2 * vccVolts) / 3, 2)} V) przez połączone szeregowo rezystory ${raComp.label} + ${rbComp.label} (stan wysoki t_H = ${thFmt.formatted}), a następnie rozładowuje się przez sam rezystor ${rbComp.label} do wyprowadzenia 7 (DIS) aż do progu 1/3 VCC (stan niski t_L = ${tlFmt.formatted}).`,
      formulasLatex: [
        `t_H = \\ln(2) \\cdot (${raComp.label} + ${rbComp.label}) \\cdot ${timingCap.label} \\approx 0{,}693 \\cdot (${raFmt.latex} + ${rbFmt.latex}) \\cdot ${cFmt.latex} = ${thFmt.latex}`,
        `t_L = \\ln(2) \\cdot ${rbComp.label} \\cdot ${timingCap.label} \\approx 0{,}693 \\cdot ${rbFmt.latex} \\cdot ${cFmt.latex} = ${tlFmt.latex}`,
        `T = t_H + t_L = \\ln(2) \\cdot (${raComp.label} + 2${rbComp.label}) \\cdot ${timingCap.label} = ${tFmt.latex}`,
        `f = \\frac{1}{T} = \\frac{1{,}44}{(${raComp.label} + 2${rbComp.label}) \\cdot ${timingCap.label}} = ${fFmt.latex}`,
        `D = \\frac{t_H}{T} \\cdot 100\\% = \\frac{${raComp.label} + ${rbComp.label}}{${raComp.label} + 2${rbComp.label}} \\cdot 100\\% = ${formatPolishNumber(dutyCyclePercent, 1)}\\%`,
      ],
    };
  }

  if (raComp && timingCap) {
    const ra = toSIValue(raComp.value, raComp.prefix);
    const c = toSIValue(timingCap.value, timingCap.prefix);
    const tHighSec = Math.log(3) * ra * c; // ~1.1 * R * C
    const raFmt = formatWithBestPrefix(ra, 'Ω');
    const cFmt = formatWithBestPrefix(c, 'F');
    const thFmt = formatWithBestPrefix(tHighSec, 's');

    return {
      mode: 'monostable',
      raOhms: ra,
      cFarads: c,
      raLabel: raComp.label,
      cLabel: timingCap.label,
      vccVolts,
      tHighSec,
      periodSec: tHighSec,
      explanation: `Układ NE555 w konfiguracji monostabilnej (odmierzanie pojedynczego impulsu wyzwalanego stanem niskim na wejściu TRIG). Czas trwania impulsu wysokiego zależy od stałej czasowej ${raComp.label} · ${timingCap.label} i trwa do momentu naładowania kondensatora od 0 V do 2/3 VCC.`,
      formulasLatex: [
        `t_w = \\ln(3) \\cdot ${raComp.label} \\cdot ${timingCap.label} \\approx 1{,}1 \\cdot ${raFmt.latex} \\cdot ${cFmt.latex} = ${thFmt.latex}`,
      ],
    };
  }

  return {
    mode: 'unconfigured',
    vccVolts,
    explanation:
      'Aby uruchomić układ NE555 jako generator astabilny, podłącz rezystor R_A między VCC (8) a DIS (7), rezystor R_B między DIS (7) a połączonymi THR (6) i TRIG (2), oraz kondensator C między THR/TRIG a masę GND (1).',
    formulasLatex: [
      `f = \\frac{1{,}44}{(R_A + 2R_B) \\cdot C}, \\quad D = \\frac{R_A + R_B}{R_A + 2R_B} \\cdot 100\\%`,
    ],
  };
}

/**
 * Simulates digital logic gates, derives boolean LaTeX formulas, and builds the complete Truth Table.
 */
function runDigitalAnalysis(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  pinToNodeId: Map<string, string>
): DigitalAnalysisResult | undefined {
  const digitalComps = components.filter((c) => DIGITAL_TYPES.has(c.type));
  if (digitalComps.length === 0) return undefined;

  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '';

  const inputs = components.filter((c) => c.type === 'logic_input' || c.type === 'clock');
  const gates = components.filter((c) =>
    ['and_gate', 'or_gate', 'not_gate', 'nand_gate', 'nor_gate', 'xor_gate'].includes(c.type)
  );
  const probes = components.filter((c) => c.type === 'logic_probe');

  const evaluateGate = (type: string, a: '0' | '1' | 'X', b: '0' | '1' | 'X'): '0' | '1' | 'X' => {
    if (type === 'not_gate') {
      if (a === 'X') return 'X';
      return a === '1' ? '0' : '1';
    }
    if (type === 'and_gate') {
      if (a === '0' || b === '0') return '0';
      if (a === '1' && b === '1') return '1';
      return 'X';
    }
    if (type === 'nand_gate') {
      if (a === '0' || b === '0') return '1';
      if (a === '1' && b === '1') return '0';
      return 'X';
    }
    if (type === 'or_gate') {
      if (a === '1' || b === '1') return '1';
      if (a === '0' && b === '0') return '0';
      return 'X';
    }
    if (type === 'nor_gate') {
      if (a === '1' || b === '1') return '0';
      if (a === '0' && b === '0') return '1';
      return 'X';
    }
    if (type === 'xor_gate') {
      if (a === 'X' || b === 'X') return 'X';
      return a !== b ? '1' : '0';
    }
    return 'X';
  };

  const simulateForInputMap = (inputOverrides?: Record<string, 0 | 1>) => {
    const nodeState = new Map<string, '0' | '1' | 'X'>();
    for (const n of nodes) {
      nodeState.set(n.id, n.isGround ? '0' : 'X');
    }

    // DC voltage sources > 2.5V also act as logic HIGH (1)
    for (const comp of components) {
      if (comp.type === 'dc_voltage') {
        const nPos = getPinNode(comp.id, 'pos');
        const v = toSIValue(comp.value, comp.prefix);
        if (nPos) nodeState.set(nPos, v >= 2.5 ? '1' : '0');
      }
    }

    for (const inp of inputs) {
      const nOut = getPinNode(inp.id, 'out');
      const stateNum =
        inputOverrides && inp.label in inputOverrides
          ? inputOverrides[inp.label]
          : inp.logicState !== undefined
          ? inp.logicState
          : inp.value > 0
          ? 1
          : 0;
      if (nOut) nodeState.set(nOut, stateNum === 1 ? '1' : '0');
    }

    const gateOutState: Record<string, '0' | '1' | 'X'> = {};
    // Iterative relaxation up to depth of circuit
    for (let iter = 0; iter < gates.length + 2; iter++) {
      let changed = false;
      for (const g of gates) {
        const nA = getPinNode(g.id, 'inA');
        const nB = getPinNode(g.id, 'inB');
        const nOut = getPinNode(g.id, 'out');
        const sA = nodeState.get(nA) ?? 'X';
        const sB = nodeState.get(nB) ?? 'X';
        const out = evaluateGate(g.type, sA, sB);
        if (gateOutState[g.id] !== out) {
          gateOutState[g.id] = out;
          changed = true;
        }
        if (nOut && nodeState.get(nOut) !== out) {
          nodeState.set(nOut, out);
          changed = true;
        }
      }
      if (!changed) break;
    }

    for (const p of probes) {
      const nIn = getPinNode(p.id, 'in');
      gateOutState[p.id] = nodeState.get(nIn) ?? 'X';
    }

    return { nodeState, gateOutState };
  };

  // Current live simulation
  const currentSim = simulateForInputMap();
  for (const n of nodes) {
    const st = currentSim.nodeState.get(n.id);
    if (st) n.digitalState = st;
  }

  // Derive symbolic boolean expressions per node
  const nodeExpr = new Map<string, string>();
  for (const n of nodes) {
    if (n.isGround) nodeExpr.set(n.id, '0');
  }
  for (const inp of inputs) {
    const nOut = getPinNode(inp.id, 'out');
    if (nOut) nodeExpr.set(nOut, inp.label);
  }
  for (let iter = 0; iter < gates.length + 2; iter++) {
    for (const g of gates) {
      const nA = getPinNode(g.id, 'inA');
      const nB = getPinNode(g.id, 'inB');
      const nOut = getPinNode(g.id, 'out');
      const exprA = nodeExpr.get(nA) || 'A';
      const exprB = nodeExpr.get(nB) || 'B';
      let outExpr = '?';
      const wrap = (s: string) => (s.includes('+') || s.includes('\\oplus') ? `(${s})` : s);
      if (g.type === 'not_gate') outExpr = `\\overline{${exprA}}`;
      else if (g.type === 'and_gate') outExpr = `${wrap(exprA)} \\cdot ${wrap(exprB)}`;
      else if (g.type === 'nand_gate') outExpr = `\\overline{${wrap(exprA)} \\cdot ${wrap(exprB)}}`;
      else if (g.type === 'or_gate') outExpr = `${exprA} + ${exprB}`;
      else if (g.type === 'nor_gate') outExpr = `\\overline{${exprA} + ${exprB}}`;
      else if (g.type === 'xor_gate') outExpr = `${wrap(exprA)} \\oplus ${wrap(exprB)}`;
      if (nOut) nodeExpr.set(nOut, outExpr);
    }
  }

  const outputComponents = probes.length > 0 ? probes : gates;
  const outputLabels = outputComponents.map((c) => c.label);
  const booleanExpressions: Record<string, string> = {};
  for (const outComp of outputComponents) {
    const pinId = outComp.type === 'logic_probe' ? 'in' : 'out';
    const nId = getPinNode(outComp.id, pinId);
    booleanExpressions[outComp.label] = `${outComp.label} = ${nodeExpr.get(nId) || '?'}`;
  }

  // Build Truth Table for up to 6 inputs (2^6 = 64 rows max)
  const activeInputs = inputs.slice(0, 6);
  const inputLabels = activeInputs.map((i) => i.label);
  const truthTable: TruthTableRow[] = [];

  if (activeInputs.length > 0 && outputComponents.length > 0) {
    const numRows = 1 << activeInputs.length;
    for (let mask = 0; mask < numRows; mask++) {
      const rowIn: Record<string, 0 | 1> = {};
      activeInputs.forEach((inp, idx) => {
        const bit = ((mask >> (activeInputs.length - 1 - idx)) & 1) as 0 | 1;
        rowIn[inp.label] = bit;
      });
      const sim = simulateForInputMap(rowIn);
      const rowOut: Record<string, 0 | 1 | 'X'> = {};
      for (const outComp of outputComponents) {
        const st = sim.gateOutState[outComp.id] ?? 'X';
        rowOut[outComp.label] = st === '1' ? 1 : st === '0' ? 0 : 'X';
      }
      truthTable.push({ inputs: rowIn, outputs: rowOut });
    }
  }

  return {
    hasDigitalComponents: true,
    inputLabels,
    outputLabels,
    booleanExpressions,
    truthTable,
    gateStates: currentSim.gateOutState,
  };
}

/**
 * Computes Bode frequency response sweep if reactive elements (L or C) and a voltage source exist.
 */
function computeBodeAnalysis(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  pinToNodeId: Map<string, string>
): BodeAnalysis | undefined {
  const hasReactive = components.some((c) => c.type === 'capacitor' || c.type === 'inductor');
  const source = components.find((c) => c.type === 'ac_voltage' || c.type === 'dc_voltage');
  if (!hasReactive || !source) return undefined;

  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '';
  const sourcePosNode = getPinNode(source.id, 'pos');

  // Choose output node: first voltmeter positive node, or opamp output, or node between R and C/L
  const vm = components.find((c) => c.type === 'voltmeter');
  const opamp = components.find((c) => c.type === 'opamp');
  let outputNodeId = '';
  if (vm) {
    outputNodeId = getPinNode(vm.id, 'pos');
  } else if (opamp) {
    outputNodeId = getPinNode(opamp.id, 'out');
  } else {
    const candidate = nodes.find((n) => !n.isGround && n.id !== sourcePosNode);
    outputNodeId = candidate ? candidate.id : sourcePosNode;
  }

  if (!outputNodeId || outputNodeId === '0') return undefined;
  const outNodeObj = nodes.find((n) => n.id === outputNodeId);

  // Compute theoretical cutoff / resonant frequency if R, L, C present
  const rComp = components.find((c) => c.type === 'resistor');
  const lComp = components.find((c) => c.type === 'inductor');
  const cComp = components.find((c) => c.type === 'capacitor');

  let cutoffFreqHz: number | undefined;
  let resonantFreqHz: number | undefined;
  let filterType = 'Układ reaktancyjny';

  if (lComp && cComp) {
    const L = toSIValue(lComp.value, lComp.prefix);
    const C = toSIValue(cComp.value, cComp.prefix);
    if (L > 0 && C > 0) {
      resonantFreqHz = 1 / (2 * Math.PI * Math.sqrt(L * C));
      filterType = 'Obwód rezonansowy RLC';
    }
  } else if (rComp && cComp) {
    const R = toSIValue(rComp.value, rComp.prefix);
    const C = toSIValue(cComp.value, cComp.prefix);
    if (R > 0 && C > 0) {
      cutoffFreqHz = 1 / (2 * Math.PI * R * C);
      filterType = 'Filtr RC (dolno-/górnoprzepustowy)';
    }
  } else if (rComp && lComp) {
    const R = toSIValue(rComp.value, rComp.prefix);
    const L = toSIValue(lComp.value, lComp.prefix);
    if (R > 0 && L > 0) {
      cutoffFreqHz = R / (2 * Math.PI * L);
      filterType = 'Filtr RL';
    }
  }

  // Generate 41 logarithmic points from 1 Hz to 1 MHz (or centered around f_c / f_0)
  const centerF = resonantFreqHz || cutoffFreqHz || 1000;
  const minExp = Math.max(0, Math.floor(Math.log10(centerF)) - 3);
  const maxExp = minExp + 6;
  const numPts = 41;
  const points: BodePoint[] = [];

  const srcValSI = toSIValue(source.value, source.prefix);
  const inMag = Math.max(1e-9, source.type === 'ac_voltage' && source.isRms === false ? srcValSI / Math.SQRT2 : srcValSI);

  for (let i = 0; i < numPts; i++) {
    const exp = minExp + (i / (numPts - 1)) * (maxExp - minExp);
    const freqHz = Math.pow(10, exp);
    const omega = 2 * Math.PI * freqHz;

    const res = runMNASolverAtOmega(components, nodes, pinToNodeId, omega, source.type === 'ac_voltage');
    const vOut = res.nodePotentials.get(outputNodeId) || complex(0, 0);
    const outComplex = cFromMath(vOut);
    const gainMag = outComplex.mag / inMag;
    const gainDb = 20 * Math.log10(Math.max(1e-9, gainMag));

    points.push({
      freqHz,
      omegaRadSec: omega,
      gainMag,
      gainDb,
      phaseDeg: outComplex.phaseDeg,
    });
  }

  return {
    available: true,
    inputLabel: source.label,
    outputNodeId,
    outputNodeLabel: outNodeObj?.label || `Węzeł ${outputNodeId}`,
    cutoffFreqHz,
    resonantFreqHz,
    filterType,
    points,
  };
}

/**
 * Dynamically detects circuit topologies (series, parallel, voltage divider, current divider, op-amp configs, RLC).
 */
function detectTopologies(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  pinToNodeId: Map<string, string>,
  compResults: Record<string, ComponentSimulationResult>,
  regime: 'DC' | 'AC' | 'DIGITAL' | 'MIXED' | 'EMPTY'
): TopologicalGroup[] {
  const groups: TopologicalGroup[] = [];
  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '';

  const passives = components.filter((c) => ANALOG_PASSIVE_TYPES.has(c.type));

  // 1. Detect Parallel groups: passive components sharing the exact same unordered pair of nodes
  const pairMap = new Map<string, CircuitComponent[]>();
  for (const p of passives) {
    const n1 = getPinNode(p.id, 'p1');
    const n2 = getPinNode(p.id, 'p2');
    if (!n1 || !n2 || n1 === n2) continue;
    const key = [n1, n2].sort().join('--');
    const list = pairMap.get(key) || [];
    list.push(p);
    pairMap.set(key, list);
  }

  for (const [, list] of Array.from(pairMap.entries())) {
    if (list.length >= 2) {
      const allResistors = list.every((c) => c.type === 'resistor');
      const labels = list.map((c) => c.label);
      if (allResistors) {
        const gSum = list.reduce((acc, c) => acc + 1 / Math.max(1e-9, toSIValue(c.value, c.prefix)), 0);
        const rEq = gSum > 0 ? 1 / gSum : 0;
        const rEqFmt = formatWithBestPrefix(rEq, 'Ω');
        const invTerms = labels.map((l) => `\\frac{1}{${l}}`).join(' + ');
        groups.push({
          type: 'parallel',
          componentIds: list.map((c) => c.id),
          componentLabels: labels,
          description: `Połączenie równoległe rezystorów (${labels.join(' ∥ ')}) – wspólne napięcie na wszystkich gałęziach, prąd rozpływa się odwrotnie proporcjonalnie do rezystancji.`,
          equivalentFormulaLatex: `\\frac{1}{R_z} = ${invTerms} \\implies R_z = ${rEqFmt.latex}`,
          equivalentValueSI: rEq,
          unit: 'Ω',
        });

        // Also register Current Divider insight
        groups.push({
          type: 'current_divider',
          componentIds: list.map((c) => c.id),
          componentLabels: labels,
          description: `Dzielnik prądu na gałęziach równoległych (${labels.join(', ')}) – przez mniejszy opór płynie proporcjonalnie większy prąd.`,
          equivalentFormulaLatex:
            list.length === 2
              ? `I_{${labels[0]}} = I_{\\text{całk}} \\cdot \\frac{${labels[1]}}{${labels[0]} + ${labels[1]}}, \\quad I_{${labels[1]}} = I_{\\text{całk}} \\cdot \\frac{${labels[0]}}{${labels[0]} + ${labels[1]}}`
              : `I_k = U \\cdot G_k = I_{\\text{całk}} \\cdot \\frac{G_k}{\\sum G_i}`,
        });
      } else {
        groups.push({
          type: 'parallel',
          componentIds: list.map((c) => c.id),
          componentLabels: labels,
          description: `Połączenie równoległe gałęzi (${labels.join(' ∥ ')}) włączonych między te same dwa węzły – sumujemy admitancje gałęzi.`,
          equivalentFormulaLatex: `\\underline{Y}_z = ${labels.map((l) => `\\underline{Y}_{${l}}`).join(' + ')}, \\quad \\underline{Z}_z = \\frac{1}{\\underline{Y}_z}`,
        });
      }
    }
  }

  // 2. Detect Series groups: passive components connected via nodes where only 2 passive/analog branches meet
  const nodeMap = new Map<string, ElectricalNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const visitedSeries = new Set<string>();
  for (const p of passives) {
    if (visitedSeries.has(p.id)) continue;
    const chain: CircuitComponent[] = [p];
    visitedSeries.add(p.id);

    // Expand chain in both directions across degree-2 non-ground nodes (ignoring voltmeters)
    let extended = true;
    while (extended) {
      extended = false;
      for (const endComp of [chain[0], chain[chain.length - 1]]) {
        for (const pinId of ['p1', 'p2']) {
          const nId = getPinNode(endComp.id, pinId);
          const node = nodeMap.get(nId);
          if (!node || node.isGround) continue;
          // Filter out voltmeter pins when counting active branch degree
          const activePins = node.pins.filter((pr) => {
            const c = components.find((x) => x.id === pr.componentId);
            return c && c.type !== 'voltmeter' && c.type !== 'ground';
          });
          if (activePins.length === 2) {
            const otherRef = activePins.find((pr) => pr.componentId !== endComp.id);
            const otherComp = otherRef ? components.find((c) => c.id === otherRef.componentId) : undefined;
            if (otherComp && ANALOG_PASSIVE_TYPES.has(otherComp.type) && !visitedSeries.has(otherComp.id)) {
              visitedSeries.add(otherComp.id);
              if (endComp === chain[0]) chain.unshift(otherComp);
              else chain.push(otherComp);
              extended = true;
            }
          }
        }
      }
    }

    if (chain.length >= 2) {
      const labels = chain.map((c) => c.label);
      const allResistors = chain.every((c) => c.type === 'resistor');
      if (allResistors) {
        const rSum = chain.reduce((acc, c) => acc + toSIValue(c.value, c.prefix), 0);
        const rSumFmt = formatWithBestPrefix(rSum, 'Ω');
        groups.push({
          type: 'series',
          componentIds: chain.map((c) => c.id),
          componentLabels: labels,
          description: `Połączenie szeregowe rezystorów (${labels.join(' + ')}) – przez wszystkie elementy płynie ten sam prąd I, a spadki napięć się sumują.`,
          equivalentFormulaLatex: `R_z = ${labels.join(' + ')} = ${rSumFmt.latex}`,
          equivalentValueSI: rSum,
          unit: 'Ω',
        });

        // Also register Voltage Divider insight
        groups.push({
          type: 'voltage_divider',
          componentIds: chain.map((c) => c.id),
          componentLabels: labels,
          description: `Dzielnik napięcia (${labels.join(', ')}) – napięcie zasilające dzieli się wprost proporcjonalnie do wartości poszczególnych rezystancji.`,
          equivalentFormulaLatex: `U_{${labels[0]}} = U_{\\text{we}} \\cdot \\frac{${labels[0]}}{${labels.join(' + ')}}`,
        });
      } else {
        const hasR = chain.some((c) => c.type === 'resistor');
        const hasL = chain.some((c) => c.type === 'inductor');
        const hasC = chain.some((c) => c.type === 'capacitor');
        if (regime === 'AC' && (hasL || hasC)) {
          let xlSum = 0;
          let xcSum = 0;
          let rSum = 0;
          for (const c of chain) {
            const res = compResults[c.id];
            if (res?.resistanceR) rSum += res.resistanceR;
            if (res?.reactanceXL) xlSum += res.reactanceXL;
            if (res?.reactanceXC) xcSum += res.reactanceXC;
          }
          const xNet = xlSum - xcSum;
          const zEq = toComplexValue(rSum, xNet);
          const charDesc =
            Math.abs(xlSum - xcSum) < 1e-3 && xlSum > 0
              ? 'STAN REZONANSU NAPIĘĆ (X_L = X_C, charakter czysto rezystancyjny!)'
              : xlSum > xcSum
              ? 'charakter indukcyjny (X_L > X_C, napięcie wyprzedza prąd)'
              : 'charakter pojemnościowy (X_C > X_L, prąd wyprzedza napięcie)';

          groups.push({
            type: 'rlc_series',
            componentIds: chain.map((c) => c.id),
            componentLabels: labels,
            description: `Szeregowy obwód ${hasR ? 'R' : ''}${hasL ? 'L' : ''}${hasC ? 'C' : ''} (${labels.join(', ')}) – ${charDesc}.`,
            equivalentFormulaLatex: `\\underline{Z}_z = R + j(X_L - X_C) = ${formatComplexAlgebraicLatex(zEq, 'Ω')} = ${formatComplexExponentialLatex(zEq, 'Ω')}`,
            equivalentValueSI: zEq.mag,
            equivalentComplex: zEq,
            unit: 'Ω',
          });
        } else {
          groups.push({
            type: 'series',
            componentIds: chain.map((c) => c.id),
            componentLabels: labels,
            description: `Połączenie szeregowe elementów (${labels.join(' — ')}) – wspólny prąd gałęziowy.`,
            equivalentFormulaLatex: `\\underline{Z}_z = ${labels.map((l) => `\\underline{Z}_{${l}}`).join(' + ')}`,
          });
        }
      }
    }
  }

  // 3. Detect Op-Amp configurations
  for (const op of components.filter((c) => c.type === 'opamp')) {
    const nMinus = getPinNode(op.id, 'in_minus');
    const nPlus = getPinNode(op.id, 'in_plus');
    const nOut = getPinNode(op.id, 'out');

    // Find feedback element between OUT and IN-
    const feedbackComp = passives.find((p) => {
      const a = getPinNode(p.id, 'p1');
      const b = getPinNode(p.id, 'p2');
      return (a === nOut && b === nMinus) || (a === nMinus && b === nOut);
    });

    const inputComp = passives.find((p) => {
      if (p.id === feedbackComp?.id) return false;
      const a = getPinNode(p.id, 'p1');
      const b = getPinNode(p.id, 'p2');
      return a === nMinus || b === nMinus;
    });

    if (nOut === nMinus) {
      groups.push({
        type: 'opamp_follower',
        componentIds: [op.id],
        componentLabels: [op.label],
        description: `Wtórnik napięciowy (bufor) na wzmacniaczu ${op.label}: bezpośrednie 100% ujemne sprzężenie zwrotne (OUT połączone z IN-). Dzięki zasadzie wirtualnego zwarcia U_wy = U_+ = U_we (wzmocnienie k_u = 1 V/V).`,
        equivalentFormulaLatex: `U_{\\text{wy}} = U_{\\text{we}}, \\quad k_u = \\frac{U_{\\text{wy}}}{U_{\\text{we}}} = 1`,
      });
    } else if (feedbackComp && inputComp) {
      if (feedbackComp.type === 'resistor' && inputComp.type === 'resistor') {
        const rf = toSIValue(feedbackComp.value, feedbackComp.prefix);
        const r1 = toSIValue(inputComp.value, inputComp.prefix);
        if (nPlus === '0') {
          const ku = -rf / r1;
          groups.push({
            type: 'opamp_inverting',
            componentIds: [op.id, inputComp.id, feedbackComp.id],
            componentLabels: [op.label, inputComp.label, feedbackComp.label],
            description: `Wzmacniacz odwracający na ${op.label}: wejście nieodwracające IN+ na masie (0 V), więc dzięki wirtualnemu zwarciu w węźle IN- panuje tzw. wirtualna masa (V_- ≈ 0 V). Sygnał wyjściowy jest odwrócony w fazie o 180°.`,
            equivalentFormulaLatex: `k_u = \\frac{U_{\\text{wy}}}{U_{\\text{we}}} = -\\frac{${feedbackComp.label}}{${inputComp.label}} = ${formatPolishNumber(ku, 2)}\\,\\text{V/V}`,
            equivalentValueSI: ku,
          });
        } else {
          const ku = 1 + rf / r1;
          groups.push({
            type: 'opamp_noninverting',
            componentIds: [op.id, inputComp.id, feedbackComp.id],
            componentLabels: [op.label, inputComp.label, feedbackComp.label],
            description: `Wzmacniacz nieodwracający na ${op.label}: sygnał podany na wejście IN+, a dzielnik (${feedbackComp.label}, ${inputComp.label}) w pętli ujemnego sprzężenia zwrotnego ustala wzmocnienie zawsze większe od jedności.`,
            equivalentFormulaLatex: `k_u = 1 + \\frac{${feedbackComp.label}}{${inputComp.label}} = ${formatPolishNumber(ku, 2)}\\,\\text{V/V}`,
            equivalentValueSI: ku,
          });
        }
      } else if (feedbackComp.type === 'capacitor' && inputComp.type === 'resistor') {
        groups.push({
          type: 'opamp_integrator',
          componentIds: [op.id, inputComp.id, feedbackComp.id],
          componentLabels: [op.label, inputComp.label, feedbackComp.label],
          description: `Układ całkujący (integrator RC) na wzmacniaczu ${op.label} z kondensatorem ${feedbackComp.label} w pętli sprzężenia zwrotnego.`,
          equivalentFormulaLatex: `u_{\\text{wy}}(t) = -\\frac{1}{${inputComp.label} \\cdot ${feedbackComp.label}} \\int u_{\\text{we}}(t)\\,dt, \\quad \\underline{H}(j\\omega) = -\\frac{1}{j\\omega ${inputComp.label} ${feedbackComp.label}}`,
        });
      } else if (feedbackComp.type === 'resistor' && inputComp.type === 'capacitor') {
        groups.push({
          type: 'opamp_differentiator',
          componentIds: [op.id, inputComp.id, feedbackComp.id],
          componentLabels: [op.label, inputComp.label, feedbackComp.label],
          description: `Układ różniczkujący na wzmacniaczu ${op.label} z kondensatorem ${inputComp.label} na wejściu.`,
          equivalentFormulaLatex: `u_{\\text{wy}}(t) = -${feedbackComp.label} \\cdot ${inputComp.label} \\frac{du_{\\text{we}}(t)}{dt}, \\quad \\underline{H}(j\\omega) = -j\\omega ${feedbackComp.label} ${inputComp.label}`,
        });
      }
    }
  }

  return groups;
}

/**
 * Generates the LaTeX representation of the MNA Matrix equation G * V = I for the student.
 */
function buildMNAMatrixLatex(
  matrixG: Complex[][],
  vectorI: Complex[],
  unknownLabels: string[],
  isAC: boolean
): string | undefined {
  const n = unknownLabels.length;
  if (n === 0 || n > 8) return undefined; // Keep readable for typical student circuits

  const fmtCell = (c: Complex) => {
    if (!isAC || Math.abs(c.im) < 1e-12) {
      if (Math.abs(c.re) < 1e-11) return '0';
      if (Math.abs(c.re) >= 1e5 || (Math.abs(c.re) < 1e-3 && Math.abs(c.re) > 0)) {
        const exp = Math.floor(Math.log10(Math.abs(c.re)));
        const mant = c.re / Math.pow(10, exp);
        return `${formatPolishNumber(mant, 1)}\\cdot 10^{${exp}}`;
      }
      return formatPolishNumber(c.re, 4);
    }
    const reS = formatPolishNumber(c.re, 3);
    const imS = formatPolishNumber(Math.abs(c.im), 3);
    const sign = c.im >= 0 ? '+' : '-';
    if (Math.abs(c.re) < 1e-11) return `${c.im < 0 ? '-' : ''}j${imS}`;
    return `${reS}${sign}j${imS}`;
  };

  const rowsG = matrixG.map((row) => row.map(fmtCell).join(' & ')).join(' \\\\ ');
  const rowsX = unknownLabels.join(' \\\\ ');
  const rowsI = vectorI.map(fmtCell).join(' \\\\ ');

  return `\\begin{bmatrix} ${rowsG} \\end{bmatrix} \\cdot \\begin{bmatrix} ${rowsX} \\end{bmatrix} = \\begin{bmatrix} ${rowsI} \\end{bmatrix}`;
}

/**
 * Builds the 3 Progressive Hints + Complete Step-by-Step Didactic Solution.
 */
function buildDidacticSolution(
  components: CircuitComponent[],
  nodes: ElectricalNode[],
  compResults: Record<string, ComponentSimulationResult>,
  regime: 'DC' | 'AC' | 'DIGITAL' | 'MIXED' | 'EMPTY',
  frequencyHz: number,
  omega: number,
  topologies: TopologicalGroup[],
  digitalAnalysis: DigitalAnalysisResult | undefined,
  mnaMatrixLatex: string | undefined
): DidacticSolution {
  // --- HINT 1: Flow & Equipotential Nodes ---
  const zeroCurrentBranches: { componentId: string; label: string; reason: string }[] = [];
  let activeBranchesCount = 0;

  for (const comp of components) {
    if (comp.type === 'ground' || DIGITAL_TYPES.has(comp.type)) continue;
    const res = compResults[comp.id];
    if (!res) continue;
    const iMag = regime === 'AC' ? res.currentAC?.mag ?? 0 : Math.abs(res.currentDC);

    if (comp.type === 'voltmeter') {
      zeroCurrentBranches.push({
        componentId: comp.id,
        label: comp.label,
        reason: 'Woltomierz idealny posiada nieskończenie wielki opór wewnętrzny (R_V → ∞), więc mierzy napięcie bez poboru prądu (I = 0 A).',
      });
    } else if (comp.type === 'capacitor' && regime === 'DC') {
      zeroCurrentBranches.push({
        componentId: comp.id,
        label: comp.label,
        reason: 'W stanie ustalonym dla prądu stałego (DC, f = 0 Hz) naładowany kondensator stanowi rozwarcie (X_C → ∞ Ω, I_C = 0 A).',
      });
    } else if (comp.type === 'switch' && comp.switchClosed === false) {
      zeroCurrentBranches.push({
        componentId: comp.id,
        label: comp.label,
        reason: 'Otwarty wyłącznik stanowi fizyczną przerwę powietrzna w gałęzi (R → ∞ Ω, I = 0 A).',
      });
    } else if (iMag < 1e-10) {
      zeroCurrentBranches.push({
        componentId: comp.id,
        label: comp.label,
        reason: 'Gałąź otwarta lub brak różnicy potencjałów między węzłami (U = 0 V ⇒ I = 0 A).',
      });
    } else {
      activeBranchesCount++;
    }
  }

  const equipotentialNodes = nodes.map((n) => {
    const connectedLabels = Array.from(
      new Set(
        n.pins.map((p) => {
          const c = components.find((x) => x.id === p.componentId);
          return c ? `${c.label}.${p.pinId}` : p.componentId;
        })
      )
    );
    const potentialStr =
      regime === 'AC' && n.potentialAC
        ? `${formatWithBestPrefix(n.potentialAC.mag, 'V').formatted} ∠ ${formatPolishNumber(n.potentialAC.phaseDeg, 1)}°`
        : formatWithBestPrefix(n.potentialDC, 'V').formatted;

    return {
      nodeId: n.id,
      label: n.label,
      potentialStr,
      color: n.color,
      connectedLabels,
    };
  });

  const hint1Summary =
    components.length === 0
      ? 'Schemat jest pusty – przeciągnij elementy z paska bocznego na tablicę.'
      : `W obwodzie wyodrębniono ${nodes.length} węzłów ekwipotencjalnych (w tym węzeł odniesienia GND = 0 V). Prąd płynie aktywnie w ${activeBranchesCount} gałęziach, natomiast ${zeroCurrentBranches.length} gałęzi jest bezprądowych (I = 0 A).`;

  // --- HINT 2: Engineering Insights & Strategy ---
  let regimeExplanation = '';
  if (regime === 'DC') {
    regimeExplanation =
      'Obwód pracuje w stanie ustalonym prądu stałego (DC, f = 0 Hz, ω = 0 rad/s). Wszystkie wielkości są stałe w czasie: kondensatory zachowują się jak rozwarcia (I_C = 0 A), a idealne cewki jak zwarcia (U_L = 0 V).';
  } else if (regime === 'AC') {
    regimeExplanation = `Obwód pracuje w stanie ustalonym prądu przemiennego sinusoidalnego (AC) o częstotliwości f = ${formatWithBestPrefix(frequencyHz, 'Hz').formatted} (pulsacja ω = 2πf = ${formatPolishNumber(omega, 2)} rad/s). Obliczenia wykonujemy metodą symboliczną (wskazową) na liczbach zespolonych dla wartości skutecznych.`;
  } else if (regime === 'DIGITAL') {
    regimeExplanation =
      'Układ cyfrowy (logika boolowska): sygnały przyjmują dwa dyskretne stany logiczne: 0 (LOW, 0 V) oraz 1 (HIGH, +5 V). Wyznaczamy równania algebry Boole’a i pełną tablicę prawdy.';
  } else if (regime === 'MIXED') {
    regimeExplanation = 'Układ mieszany (analogowo-cyfrowy): łączymy analizę węzłową MNA z propagacją stanów logicznych.';
  }

  const strategy: string[] = [
    'Krok 0: Zamień wszystkie wartości z przedrostkami SI (m, μ, n, p, k, M) na jednostki podstawowe układu SI (Ω, F, H, V, A, Hz).',
    'Krok 1: Zidentyfikuj węzły ekwipotencjalne oraz masę odniesienia (V_GND = 0 V) i odrzuć gałęzie bezprądowe (np. woltomierze, otwarte klucze, kondensatory w DC).',
  ];
  if (regime === 'AC') {
    strategy.push(
      'Krok 2: Wyznacz pulsację ω = 2πf oraz reaktancje elementów biernych: X_L = ωL (cewka) oraz X_C = 1/(ωC) (kondensator), zapisując impedancje zespolone Z = R + j(X_L - X_C).'
    );
  }
  if (topologies.length > 0) {
    strategy.push(
      `Krok 3: Wykorzystaj wykryte struktury topologiczne (${topologies.map((t) => t.type).join(', ')}) lub ułóż układ równań metody potencjałów węzłowych (MNA) G · V = I.`
    );
  } else {
    strategy.push('Krok 3: Ułóż układ równań z I Prawa Kirchhoffa dla węzłów niezależnych (metoda potencjałów węzłowych MNA: G · V = I).');
  }
  strategy.push(
    'Krok 4: Z obliczonych potencjałów węzłowych wyznacz spadki napięć U = V_A - V_B, prądy gałęziowe I = U / Z oraz bilans mocy (P, Q, S).'
  );

  // --- HINT 3: Symbolic Formulas ---
  const formulas: SymbolicFormulaItem[] = [];
  const hasR = components.some((c) => c.type === 'resistor');
  const hasL = components.some((c) => c.type === 'inductor');
  const hasC = components.some((c) => c.type === 'capacitor');
  const hasOpAmp = components.some((c) => c.type === 'opamp');
  const hasNE555 = components.some((c) => c.type === 'ne555');

  if (regime !== 'DIGITAL') {
    formulas.push(
      {
        id: 'kcl',
        category: 'Prawa Podstawowe',
        lawName: 'I Prawo Kirchhoffa (KCL – bilans prądów w węźle)',
        latex: '\\sum_{k=1}^{n} I_{\\text{wpływające},k} = \\sum_{m=1}^{p} I_{\\text{wypływające},m} \\iff \\sum I_k = 0',
        explanation: 'Suma algebraiczna prądów zbiegających się w każdym węźle obwodu w dowolnej chwili jest równa zeru (ładunek nie gromadzi się w węźle).',
      },
      {
        id: 'kvl',
        category: 'Prawa Podstawowe',
        lawName: 'II Prawo Kirchhoffa (KVL – bilans napięć w oczku)',
        latex: '\\sum_{k=1}^{n} E_k = \\sum_{m=1}^{p} U_m \\iff \\sum V_{\\text{oczka}} = 0',
        explanation: 'W każdym zamkniętym oczku suma sił elektromotorycznych (źródeł) jest równa sumie spadków napięć na odbiornikach.',
      }
    );
  }

  if (hasR) {
    formulas.push({
      id: 'ohm',
      category: 'Prawo Ohma',
      lawName: 'Prawo Ohma dla odcinka obwodu',
      latex: 'I = \\frac{U}{R} = U \\cdot G, \\quad U = I \\cdot R = V_A - V_B, \\quad G = \\frac{1}{R}',
      explanation: 'Natężenie prądu płynącego przez rezystor jest wprost proporcjonalne do napięcia i odwrotnie proporcjonalne do rezystancji.',
    });
  }

  if (topologies.some((t) => t.type === 'series' || t.type === 'voltage_divider')) {
    formulas.push({
      id: 'series-div',
      category: 'Łączenie elementów',
      lawName: 'Połączenie szeregowe i dzielnik napięcia',
      latex: 'R_z = \\sum_{i=1}^{n} R_i, \\quad U_k = U_{\\text{we}} \\cdot \\frac{R_k}{R_z}',
      explanation: 'W połączeniu szeregowym przez wszystkie elementy płynie ten sam prąd I, a napięcia dzielą się proporcjonalnie do rezystancji.',
    });
  }

  if (topologies.some((t) => t.type === 'parallel' || t.type === 'current_divider')) {
    formulas.push({
      id: 'parallel-div',
      category: 'Łączenie elementów',
      lawName: 'Połączenie równoległe i dzielnik prądu',
      latex: 'G_z = \\sum_{i=1}^{n} G_i \\implies \\frac{1}{R_z} = \\sum_{i=1}^{n} \\frac{1}{R_i}, \\quad R_{12} = \\frac{R_1 \\cdot R_2}{R_1 + R_2}',
      explanation: 'W połączeniu równoległym na wszystkich gałęziach panuje to samo napięcie U, a prądy rozpływają się proporcjonalnie do konduktancji.',
    });
  }

  if (hasL || hasC || regime === 'AC') {
    formulas.push({
      id: 'ac-impedance',
      category: 'Prąd Przemienny (AC)',
      lawName: 'Pulsacja, reaktancje i impedancja zespolona RLC',
      latex: '\\omega = 2\\pi f, \\quad X_L = \\omega L, \\quad X_C = \\frac{1}{\\omega C}, \\quad \\underline{Z} = R + j(X_L - X_C) = |Z|e^{j\\varphi}',
      explanation: 'W metodzie symbolicznej cewka wnosi dodatnią reaktancję (+jX_L, przesunięcie +90°), a kondensator ujemną (-jX_C, przesunięcie -90°).',
    });
  }

  if (hasC) {
    formulas.push({
      id: 'cap-energy',
      category: 'Pole Elektryczne',
      lawName: 'Ładunek i energia zgromadzona w kondensatorze',
      latex: 'Q_e = C \\cdot U\\,[\\text{C}], \\quad E_C = \\frac{1}{2} C U^2\\,[\\text{J}]',
      explanation: 'Kondensator magazynuje ładunek elektryczny na okładkach oraz energię w polu elektrycznym między okładkami.',
    });
  }

  if (hasL) {
    formulas.push({
      id: 'ind-energy',
      category: 'Pole Magnetyczne',
      lawName: 'Energia pola magnetycznego cewki i częstotliwość rezonansowa',
      latex: 'E_L = \\frac{1}{2} L I^2\\,[\\text{J}], \\quad f_0 = \\frac{1}{2\\pi\\sqrt{LC}}\\,[\\text{Hz}]',
      explanation: 'Cewka gromadzi energię w polu magnetycznym proporcjonalnie do kwadratu prądu. Przy X_L = X_C zachodzi rezonans.',
    });
  }

  if (hasOpAmp) {
    formulas.push({
      id: 'opamp-rules',
      category: 'Wzmacniacze Operacyjne',
      lawName: 'Zasada wirtualnego zwarcia idealnego wzmacniacza operacyjnego',
      latex: 'V_+ = V_-, \\quad I_+ = I_- = 0\\,\\text{A}, \\quad k_{u,\\text{odwr}} = -\\frac{R_f}{R_1}, \\quad k_{u,\\text{nieodwr}} = 1 + \\frac{R_f}{R_1}',
      explanation: 'Przy ujemnym sprzężeniu zwrotnym wzmacniacz operacyjny tak steruje swoim wyjściem, aby zrównać potencjały obu wejść (V_+ = V_-).',
    });
  }

  if (hasNE555) {
    formulas.push({
      id: 'ne555-formulas',
      category: 'Układ czasowy NE555',
      lawName: 'Czasy ładowania/rozładowania i częstotliwość generatora NE555',
      latex: 't_H = \\ln(2)(R_A + R_B)C, \\quad t_L = \\ln(2)R_B C, \\quad f = \\frac{1}{t_H + t_L} = \\frac{1{,}44}{(R_A + 2R_B)C}',
      explanation: 'Komparatory wewnętrzne NE555 przełączają przerzutnik RS przy progach napięciowych 1/3 VCC oraz 2/3 VCC (stąd współczynnik ln(2) ≈ 0,693).',
    });
  }

  if (digitalAnalysis?.hasDigitalComponents) {
    formulas.push({
      id: 'demorgan',
      category: 'Technika Cyfrowa (Algebra Boole’a)',
      lawName: 'Prawa De Morgana i podstawowe operacje logiczne',
      latex: '\\overline{A \\cdot B} = \\overline{A} + \\overline{B}, \\quad \\overline{A + B} = \\overline{A} \\cdot \\overline{B}, \\quad A \\oplus B = A\\cdot\\overline{B} + \\overline{A}\\cdot B',
      explanation: 'Pozwalają przekształcać bramki NAND i NOR oraz upraszczać wyrażenia logiczne.',
    });
  }

  if (regime !== 'DIGITAL') {
    formulas.push({
      id: 'power-triangle',
      category: 'Bilans Mocy',
      lawName: 'Trójkąt mocy: moc czynna P, bierna Q i pozorna S',
      latex: 'P = U I \\cos\\varphi = I^2 R\\,[\\text{W}], \\quad Q = U I \\sin\\varphi = I^2 X\\,[\\text{var}], \\quad S = U I = \\sqrt{P^2 + Q^2}\\,[\\text{VA}]',
      explanation: 'Moc czynna P wykonuje użyteczną pracę (ciepło), a moc bierna Q opisuje wymianę energii między źródłem a elementami L i C.',
    });
  }

  // --- FULL SOLUTION: Step 0 (SI Conversions) ---
  const step0_siConversions: SIConversionStep[] = [];
  for (const comp of components) {
    if (comp.type === 'ground' || comp.type === 'voltmeter' || comp.type === 'ammeter' || comp.type === 'switch' || DIGITAL_TYPES.has(comp.type)) {
      if (comp.type !== 'clock') continue;
    }
    const meta = SI_PREFIXES[comp.prefix] || SI_PREFIXES[''];
    const siVal = toSIValue(comp.value, comp.prefix);
    const unitLatex = comp.unit === 'Ω' ? '\\Omega' : `\\text{${comp.unit}}`;
    const qSym =
      comp.type === 'resistor'
        ? 'R'
        : comp.type === 'inductor'
        ? 'L'
        : comp.type === 'capacitor'
        ? 'C'
        : comp.type === 'current_source'
        ? 'J'
        : comp.type === 'clock'
        ? 'f'
        : 'U';

    const valStr = formatPolishNumber(comp.value, 4);
    const siStr =
      Math.abs(siVal) >= 1e-3 && Math.abs(siVal) < 1e6
        ? formatPolishNumber(siVal, 6)
        : `${formatPolishNumber(comp.value, 3)} \\cdot 10^{${meta.power}}`;

    const symbolWithSubscript = comp.label.toUpperCase().startsWith(qSym.toUpperCase())
      ? comp.label.replace(/^([A-Za-z]+)_?(\d+|\w+)$/, '$1_{$2}')
      : `${qSym}_{${comp.label}}`;

    const latex =
      comp.prefix === ''
        ? `${symbolWithSubscript} = ${valStr}\\,${unitLatex} \\quad \\text{(jednostka podstawowa SI)}`
        : `${symbolWithSubscript} = ${valStr}\\,${meta.latexSymbol}${unitLatex} = ${valStr} \\cdot 10^{${meta.power}}\\,${unitLatex} = ${siStr}\\,${unitLatex}`;

    step0_siConversions.push({
      componentId: comp.id,
      label: comp.label,
      quantitySymbol: qSym,
      rawDisplay: `${valStr} ${meta.symbol}${comp.unit}`,
      prefixSymbol: meta.symbol,
      prefixNamePl: meta.namePl,
      multiplierPower: meta.power,
      siValue: siVal,
      siUnit: comp.unit,
      latex,
    });

    if (comp.type === 'ac_voltage' && comp.frequency !== undefined) {
      const fMeta = SI_PREFIXES[comp.frequencyPrefix || ''] || SI_PREFIXES[''];
      const fSI = toSIValue(comp.frequency, comp.frequencyPrefix || '');
      const fValStr = formatPolishNumber(comp.frequency, 3);
      step0_siConversions.push({
        componentId: `${comp.id}_freq`,
        label: `f (${comp.label})`,
        quantitySymbol: 'f',
        rawDisplay: `${fValStr} ${fMeta.symbol}Hz`,
        prefixSymbol: fMeta.symbol,
        prefixNamePl: fMeta.namePl,
        multiplierPower: fMeta.power,
        siValue: fSI,
        siUnit: 'Hz',
        latex:
          (comp.frequencyPrefix || '') === ''
            ? `f_{${comp.label}} = ${fValStr}\\,\\text{Hz}, \\quad \\omega = 2\\pi f = 2\\pi \\cdot ${fValStr} \\approx ${formatPolishNumber(2 * Math.PI * fSI, 2)}\\,\\text{rad/s}`
            : `f_{${comp.label}} = ${fValStr}\\,${fMeta.latexSymbol}\\text{Hz} = ${fValStr} \\cdot 10^{${fMeta.power}}\\,\\text{Hz} = ${formatPolishNumber(fSI, 2)}\\,\\text{Hz}, \\quad \\omega = 2\\pi f \\approx ${formatPolishNumber(2 * Math.PI * fSI, 2)}\\,\\text{rad/s}`,
      });
    }
  }

  // --- FULL SOLUTION: Step 1 (Detailed Derivations) ---
  const step1_calculations: DerivationStep[] = [];
  let stepNo = 1;

  // Step 1A: Reactances & Impedances in AC
  if (regime === 'AC') {
    for (const comp of components) {
      const res = compResults[comp.id];
      if (!res) continue;
      if (comp.type === 'inductor' && res.reactanceXL !== undefined && res.impedanceZ) {
        const lSI = toSIValue(comp.value, comp.prefix);
        const lFmt = formatWithBestPrefix(lSI, 'H');
        const xlFmt = formatWithBestPrefix(res.reactanceXL, 'Ω');
        step1_calculations.push({
          stepNumber: stepNo++,
          title: `Reaktancja indukcyjna i impedancja cewki ${comp.label}`,
          description: `Obliczamy opór bierny cewki ${comp.label} przy częstotliwości f = ${formatPolishNumber(frequencyHz, 2)} Hz:`,
          symbolicLatex: `X_{L,${comp.label}} = \\omega \\cdot ${comp.label} = 2\\pi f \\cdot ${comp.label}`,
          substitutionLatex: `X_{L,${comp.label}} = 2\\pi \\cdot ${formatPolishNumber(frequencyHz, 2)}\\,\\text{Hz} \\cdot ${lFmt.baseLatex}`,
          resultLatex: `X_{L,${comp.label}} = ${xlFmt.latex} \\quad (${xlFmt.baseLatex})`,
          algebraicComplexLatex: `\\underline{Z}_{${comp.label}} = j X_{L,${comp.label}} = ${formatComplexAlgebraicLatex(res.impedanceZ, 'Ω')}`,
          exponentialComplexLatex: `\\underline{Z}_{${comp.label}} = ${formatComplexExponentialLatex(res.impedanceZ, 'Ω')}`,
        });
      } else if (comp.type === 'capacitor' && res.reactanceXC !== undefined && res.impedanceZ) {
        const cSI = toSIValue(comp.value, comp.prefix);
        const cFmt = formatWithBestPrefix(cSI, 'F');
        const xcFmt = formatWithBestPrefix(res.reactanceXC, 'Ω');
        step1_calculations.push({
          stepNumber: stepNo++,
          title: `Reaktancja pojemnościowa i impedancja kondensatora ${comp.label}`,
          description: `Obliczamy opór bierny kondensatora ${comp.label} przy częstotliwości f = ${formatPolishNumber(frequencyHz, 2)} Hz:`,
          symbolicLatex: `X_{C,${comp.label}} = \\frac{1}{\\omega \\cdot ${comp.label}} = \\frac{1}{2\\pi f \\cdot ${comp.label}}`,
          substitutionLatex: `X_{C,${comp.label}} = \\frac{1}{2\\pi \\cdot ${formatPolishNumber(frequencyHz, 2)}\\,\\text{Hz} \\cdot ${cFmt.baseLatex}}`,
          resultLatex: `X_{C,${comp.label}} = ${xcFmt.latex} \\quad (${xcFmt.baseLatex})`,
          algebraicComplexLatex: `\\underline{Z}_{${comp.label}} = -j X_{C,${comp.label}} = ${formatComplexAlgebraicLatex(res.impedanceZ, 'Ω')}`,
          exponentialComplexLatex: `\\underline{Z}_{${comp.label}} = ${formatComplexExponentialLatex(res.impedanceZ, 'Ω')}`,
        });
      }
    }
  }

  // Step 1B: Equivalent topological impedances if detected
  for (const top of topologies) {
    if (top.type === 'series' || top.type === 'parallel' || top.type === 'rlc_series' || top.type === 'opamp_inverting' || top.type === 'opamp_noninverting') {
      step1_calculations.push({
        stepNumber: stepNo++,
        title: `Redukcja topologiczna: ${top.description.split('–')[0].trim()}`,
        description: top.description,
        symbolicLatex: top.equivalentFormulaLatex,
        substitutionLatex: `\\text{Elementy grupy: } ${top.componentLabels.join(', ')}`,
        resultLatex: top.equivalentValueSI !== undefined && top.unit
          ? `Z_{\\text{zast}} = ${formatWithBestPrefix(top.equivalentValueSI, top.unit).latex}`
          : top.equivalentFormulaLatex,
        algebraicComplexLatex: top.equivalentComplex ? formatComplexAlgebraicLatex(top.equivalentComplex, 'Ω') : undefined,
        exponentialComplexLatex: top.equivalentComplex ? formatComplexExponentialLatex(top.equivalentComplex, 'Ω') : undefined,
      });
    }
  }

  // Step 1C: Nodal Potentials summary step
  const nonGndNodes = nodes.filter((n) => !n.isGround);
  if (nonGndNodes.length > 0 && regime !== 'DIGITAL') {
    const potListLatex = nonGndNodes
      .map((n) =>
        regime === 'AC' && n.potentialAC
          ? `\\underline{V}_{${n.id}} = ${formatComplexExponentialLatex(n.potentialAC, 'V')}`
          : `V_{${n.id}} = ${formatWithBestPrefix(n.potentialDC, 'V').latex}`
      )
      .join(', \\quad ');

    step1_calculations.push({
      stepNumber: stepNo++,
      title: 'Wyznaczenie potencjałów węzłowych względem masy GND (V_0 = 0 V)',
      description:
        'Rozwiązując układ równań metody potencjałów węzłowych (MNA) wyznaczamy potencjał każdego węzła obwodu:',
      symbolicLatex: '\\mathbf{G} \\cdot \\mathbf{V} = \\mathbf{I} \\implies \\mathbf{V} = \\mathbf{G}^{-1} \\cdot \\mathbf{I}',
      substitutionLatex: `V_{\\text{GND}} = V_0 = 0\\,\\text{V}`,
      resultLatex: potListLatex,
    });
  }

  // Step 1D: Individual Component Currents, Voltages, Powers & Energies
  let totalSourcePowerP = 0;
  let totalLoadPowerP = 0;
  let totalReactivePowerQ = 0;

  for (const comp of components) {
    const res = compResults[comp.id];
    if (!res) continue;

    if (comp.type === 'dc_voltage' || comp.type === 'ac_voltage' || comp.type === 'current_source') {
      totalSourcePowerP += Math.max(0, res.activePowerP);
    } else if (ANALOG_PASSIVE_TYPES.has(comp.type)) {
      totalLoadPowerP += Math.max(0, res.activePowerP);
      totalReactivePowerQ += res.reactivePowerQ;
    }

    if (ANALOG_PASSIVE_TYPES.has(comp.id ? comp.type : '') || comp.type === 'resistor' || comp.type === 'capacitor' || comp.type === 'inductor') {
      const uFmt = formatWithBestPrefix(regime === 'AC' ? res.voltageDropAC?.mag ?? 0 : res.voltageDropDC, 'V');
      const iFmt = formatWithBestPrefix(regime === 'AC' ? res.currentAC?.mag ?? 0 : res.currentDC, 'A');
      const pFmt = formatWithBestPrefix(res.activePowerP, 'W');

      if (comp.type === 'resistor') {
        const rFmt = formatWithBestPrefix(res.resistanceR || 1, 'Ω');
        step1_calculations.push({
          stepNumber: stepNo++,
          title: `Napięcie, prąd i moc czynna na rezystorze ${comp.label}`,
          description: `Z różnicy potencjałów węzłów (${res.nodePlus} → ${res.nodeMinus}) oraz Prawa Ohma wyznaczamy prąd i moc wydzielaną na ${comp.label}:`,
          symbolicLatex: `U_{${comp.label}} = V_{${res.nodePlus}} - V_{${res.nodeMinus}}, \\quad I_{${comp.label}} = \\frac{U_{${comp.label}}}{${comp.label}}, \\quad P_{${comp.label}} = U_{${comp.label}} \\cdot I_{${comp.label}} = I_{${comp.label}}^2 \\cdot ${comp.label}`,
          substitutionLatex: `I_{${comp.label}} = \\frac{${uFmt.baseLatex}}{${rFmt.baseLatex}}, \\quad P_{${comp.label}} = (${iFmt.baseLatex})^2 \\cdot ${rFmt.baseLatex}`,
          resultLatex: `U_{${comp.label}} = ${uFmt.latex}, \\quad I_{${comp.label}} = ${iFmt.latex} \\; (${iFmt.baseLatex}), \\quad P_{${comp.label}} = ${pFmt.latex}`,
          algebraicComplexLatex:
            regime === 'AC' && res.currentAC
              ? `\\underline{I}_{${comp.label}} = ${formatComplexAlgebraicLatex(res.currentAC, 'A')}`
              : undefined,
          exponentialComplexLatex:
            regime === 'AC' && res.currentAC
              ? `\\underline{I}_{${comp.label}} = ${formatComplexExponentialLatex(res.currentAC, 'A')}`
              : undefined,
        });
      } else if (comp.type === 'capacitor') {
        const cSI = toSIValue(comp.value, comp.prefix);
        const cFmt = formatWithBestPrefix(cSI, 'F');
        const qFmt = formatWithBestPrefix(res.electricChargeC || 0, 'C');
        const eFmt = formatWithBestPrefix(res.storedEnergyJ || 0, 'J');
        const qVarFmt = formatWithBestPrefix(Math.abs(res.reactivePowerQ), 'var');

        step1_calculations.push({
          stepNumber: stepNo++,
          title: `Analiza kondensatora ${comp.label} (napięcie, prąd, ładunek Q_e i energia E_C)`,
          description:
            regime === 'DC'
              ? `W stanie ustalonym DC kondensator ${comp.label} stanowi przerwę (I = 0 A), ale na jego okładkach pod napięciem ${uFmt.formatted} gromadzi się ładunek i energia pola elektrycznego:`
              : `W obwodzie AC przez kondensator ${comp.label} płynie prąd wyprzedzający napięcie o 90°:`,
          symbolicLatex: `Q_{e,${comp.label}} = ${comp.label} \\cdot U_{${comp.label}}, \\quad E_{C,${comp.label}} = \\frac{1}{2} ${comp.label} \\cdot U_{${comp.label}}^2`,
          substitutionLatex: `Q_{e,${comp.label}} = ${cFmt.baseLatex} \\cdot ${uFmt.baseLatex}, \\quad E_{C,${comp.label}} = 0{,}5 \\cdot ${cFmt.baseLatex} \\cdot (${uFmt.baseLatex})^2`,
          resultLatex: `U_{${comp.label}} = ${uFmt.latex}, \\; I_{${comp.label}} = ${iFmt.latex}, \\; Q_e = ${qFmt.latex}, \\; E_C = ${eFmt.latex}${regime === 'AC' ? `, \\; Q_C = -${qVarFmt.latex}` : ''}`,
          algebraicComplexLatex:
            regime === 'AC' && res.currentAC
              ? `\\underline{I}_{${comp.label}} = ${formatComplexAlgebraicLatex(res.currentAC, 'A')}`
              : undefined,
          exponentialComplexLatex:
            regime === 'AC' && res.currentAC
              ? `\\underline{I}_{${comp.label}} = ${formatComplexExponentialLatex(res.currentAC, 'A')}`
              : undefined,
        });
      } else if (comp.type === 'inductor') {
        const lSI = toSIValue(comp.value, comp.prefix);
        const lFmt = formatWithBestPrefix(lSI, 'H');
        const eFmt = formatWithBestPrefix(res.storedEnergyJ || 0, 'J');
        const qVarFmt = formatWithBestPrefix(res.reactivePowerQ, 'var');

        step1_calculations.push({
          stepNumber: stepNo++,
          title: `Analiza cewki indukcyjnej ${comp.label} (prąd, napięcie i energia magnetyczna E_L)`,
          description:
            regime === 'DC'
              ? `W stanie ustalonym DC idealna cewka ${comp.label} stanowi zwarcie (X_L = 0 Ω, U_L = 0 V) i gromadzi energię w polu magnetycznym:`
              : `W obwodzie AC napięcie na cewce ${comp.label} wyprzedza prąd w fazie o 90°:`,
          symbolicLatex: `E_{L,${comp.label}} = \\frac{1}{2} ${comp.label} \\cdot I_{${comp.label}}^2, \\quad Q_{L,${comp.label}} = I_{${comp.label}}^2 \\cdot X_{L,${comp.label}}`,
          substitutionLatex: `E_{L,${comp.label}} = 0{,}5 \\cdot ${lFmt.baseLatex} \\cdot (${iFmt.baseLatex})^2`,
          resultLatex: `I_{${comp.label}} = ${iFmt.latex}, \\; U_{${comp.label}} = ${uFmt.latex}, \\; E_L = ${eFmt.latex}${regime === 'AC' ? `, \\; Q_L = +${qVarFmt.latex}` : ''}`,
          algebraicComplexLatex:
            regime === 'AC' && res.voltageDropAC
              ? `\\underline{U}_{${comp.label}} = ${formatComplexAlgebraicLatex(res.voltageDropAC, 'V')}`
              : undefined,
          exponentialComplexLatex:
            regime === 'AC' && res.voltageDropAC
              ? `\\underline{U}_{${comp.label}} = ${formatComplexExponentialLatex(res.voltageDropAC, 'V')}`
              : undefined,
        });
      }
    } else if (comp.type === 'ne555' && res.ne555Analysis && res.ne555Analysis.mode !== 'unconfigured') {
      const a555 = res.ne555Analysis;
      step1_calculations.push({
        stepNumber: stepNo++,
        title: `Obliczenia czasowo-częstotliwościowe timera ${comp.label} (NE555 – tryb ${a555.mode === 'astable' ? 'astabilny' : 'monostabilny'})`,
        description: a555.explanation,
        symbolicLatex: a555.formulasLatex[0] || '',
        substitutionLatex: a555.formulasLatex.slice(1, 3).join(', \\quad '),
        resultLatex: a555.formulasLatex.slice(-2).join(', \\quad '),
      });
    }
  }

  // Digital boolean step if digital components exist
  if (digitalAnalysis?.hasDigitalComponents) {
    const exprs = Object.values(digitalAnalysis.booleanExpressions);
    if (exprs.length > 0) {
      step1_calculations.push({
        stepNumber: stepNo++,
        title: 'Synteza równań boolowskich sieci bramek logicznych',
        description: 'Śledząc propagację sygnałów od wejść logicznych przez kolejne bramki, wyznaczamy funkcję logiczną wyjścia:',
        symbolicLatex: exprs.join(', \\quad '),
        substitutionLatex: `\\text{Aktualne stany wejść: } ${digitalAnalysis.inputLabels.join(', ')}`,
        resultLatex: exprs.join(', \\quad '),
      });
    }
  }

  const totalApparentPowerS = Math.hypot(totalLoadPowerP, totalReactivePowerQ);
  const pLoadFmt = formatWithBestPrefix(totalLoadPowerP, 'W');
  const pSrcFmt = formatWithBestPrefix(totalSourcePowerP || totalLoadPowerP, 'W');
  const qTotFmt = formatWithBestPrefix(totalReactivePowerQ, 'var');
  const sTotFmt = formatWithBestPrefix(totalApparentPowerS, 'VA');

  const powerBalanceLatex =
    regime === 'AC'
      ? `\\sum P_{\\text{źr}} = \\sum P_{\\text{odb}} = ${pLoadFmt.latex}, \\quad Q_{\\text{całk}} = ${qTotFmt.latex}, \\quad S_{\\text{całk}} = \\sqrt{P^2 + Q^2} = ${sTotFmt.latex}`
      : `\\sum P_{\\text{źródeł}} = ${pSrcFmt.latex} \\; = \\; \\sum P_{\\text{odbiorników}} = ${pLoadFmt.latex}`;

  return {
    hint1_flowAndNodes: {
      summary: hint1Summary,
      activeBranchesCount,
      zeroCurrentBranches,
      equipotentialNodes,
    },
    hint2_engineeringInsights: {
      headline:
        topologies.length > 0
          ? `Wykryto ${topologies.length} charakterystycznych struktur układowych (${topologies.map((t) => t.componentLabels.join('+')).join(', ')})`
          : 'Ogólny obwód rozgałęziony rozwiązywany metodą potencjałów węzłowych (MNA)',
      regimeExplanation,
      detectedTopologies: topologies,
      stepByStepStrategy: strategy,
    },
    hint3_symbolicFormulas: formulas,
    fullSolution: {
      step0_siConversions,
      step1_calculations,
      mnaMatrixLatex,
      totalSourcePowerP: totalSourcePowerP || totalLoadPowerP,
      totalLoadPowerP,
      totalReactivePowerQ,
      totalApparentPowerS,
      powerBalanceLatex,
    },
  };
}

/**
 * Main entry point: solves any analog (DC/AC), Op-Amp, NE555, or Digital circuit and generates full didactic guidance.
 */
export function solveCircuit(components: CircuitComponent[], wires: Wire[]): SimulationResult {
  const { regime, frequencyHz, angularFrequencyOmega, periodSec } = detectRegimeAndFrequency(components);
  const { nodes, pinToNodeId, hasExplicitGround } = buildElectricalNodes(components, wires);
  const validationIssues = validateCircuit(components, nodes, pinToNodeId, hasExplicitGround, regime);

  const isAC = regime === 'AC';
  const mnaResult = runMNASolverAtOmega(components, nodes, pinToNodeId, angularFrequencyOmega, isAC);

  // Populate node potentials
  for (const node of nodes) {
    const pot = mnaResult.nodePotentials.get(node.id) || complex(0, 0);
    const cv = cFromMath(pot);
    if (isAC) {
      node.potentialAC = cv;
      node.potentialDC = cv.mag;
    } else {
      node.potentialDC = cv.re;
      node.potentialAC = cv;
    }
  }

  // Run Digital logic simulation if applicable
  const digitalAnalysis = runDigitalAnalysis(components, nodes, pinToNodeId);

  const getPinNode = (compId: string, pinId: string) => pinToNodeId.get(`${compId}:${pinId}`) || '0';
  const getNodeComplex = (nodeId: string) => mnaResult.nodePotentials.get(nodeId) || complex(0, 0);

  const componentResults: Record<string, ComponentSimulationResult> = {};

  for (const comp of components) {
    const meta = COMPONENT_CATALOG[comp.type];
    const pin1Id = meta?.pins[0]?.id || 'p1';
    const pin2Id = meta?.pins[1]?.id || pin1Id;
    const nodePlus = getPinNode(comp.id, pin1Id);
    const nodeMinus = getPinNode(comp.id, pin2Id);

    const vPlus = getNodeComplex(nodePlus);
    const vMinus = getNodeComplex(nodeMinus);
    const vDropComplex = cFromMath(subtract(vPlus, vMinus) as Complex);

    const valSI = toSIValue(comp.value, comp.prefix);

    let currentComplex: ComplexValue = toComplexValue(0, 0);
    let resistanceR: number | undefined;
    let conductanceG: number | undefined;
    let reactanceXL: number | undefined;
    let reactanceXC: number | undefined;
    let impedanceZ: ComplexValue | undefined;
    let admittanceY: ComplexValue | undefined;
    let storedEnergyJ: number | undefined;
    let electricChargeC: number | undefined;
    let ne555AnalysisResult: NE555Analysis | undefined;

    if (comp.type === 'resistor') {
      const r = Math.max(1e-9, valSI);
      resistanceR = r;
      conductanceG = 1 / r;
      impedanceZ = toComplexValue(r, 0);
      admittanceY = toComplexValue(1 / r, 0);
      currentComplex = toComplexValue(vDropComplex.re / r, vDropComplex.im / r);
    } else if (comp.type === 'capacitor') {
      const c = Math.max(1e-18, valSI);
      if (angularFrequencyOmega > 0) {
        const xc = 1 / (angularFrequencyOmega * c);
        reactanceXC = xc;
        impedanceZ = toComplexValue(0, -xc);
        admittanceY = toComplexValue(0, angularFrequencyOmega * c);
        const iMath = multiply(subtract(vPlus, vMinus), complex(0, angularFrequencyOmega * c)) as Complex;
        currentComplex = cFromMath(iMath);
      } else {
        reactanceXC = Infinity;
        impedanceZ = toComplexValue(Infinity, 0);
        admittanceY = toComplexValue(0, 0);
        currentComplex = toComplexValue(0, 0);
      }
      const uEff = isAC ? vDropComplex.mag : Math.abs(vDropComplex.re);
      electricChargeC = c * uEff;
      storedEnergyJ = 0.5 * c * uEff * uEff;
    } else if (comp.type === 'inductor') {
      const l = Math.max(1e-15, valSI);
      if (angularFrequencyOmega > 0) {
        const xl = angularFrequencyOmega * l;
        reactanceXL = xl;
        impedanceZ = toComplexValue(0, xl);
        admittanceY = toComplexValue(0, -1 / xl);
        const iMath = divide(subtract(vPlus, vMinus), complex(0, xl)) as Complex;
        currentComplex = cFromMath(iMath);
      } else {
        reactanceXL = 0;
        resistanceR = 0;
        impedanceZ = toComplexValue(0, 0);
        const brI = mnaResult.branchCurrents.get(comp.id) || complex(0, 0);
        currentComplex = cFromMath(brI);
      }
      const iEff = isAC ? currentComplex.mag : Math.abs(currentComplex.re);
      storedEnergyJ = 0.5 * l * iEff * iEff;
    } else if (
      comp.type === 'dc_voltage' ||
      comp.type === 'ac_voltage' ||
      comp.type === 'ammeter' ||
      (comp.type === 'switch' && comp.switchClosed !== false)
    ) {
      const brI = mnaResult.branchCurrents.get(comp.id) || complex(0, 0);
      currentComplex = cFromMath(brI);
    } else if (comp.type === 'current_source') {
      currentComplex = toComplexValue(valSI, 0);
    } else if (comp.type === 'opamp') {
      const nOut = getPinNode(comp.id, 'out');
      const vOut = cFromMath(getNodeComplex(nOut));
      const brI = mnaResult.branchCurrents.get(comp.id) || complex(0, 0);
      currentComplex = cFromMath(brI);
      componentResults[comp.id] = {
        componentId: comp.id,
        label: comp.label,
        type: comp.type,
        nodePlus: getPinNode(comp.id, 'in_plus'),
        nodeMinus: getPinNode(comp.id, 'in_minus'),
        voltageDropDC: vOut.re,
        currentDC: currentComplex.re,
        voltageDropAC: vOut,
        currentAC: currentComplex,
        activePowerP: Math.abs(vOut.re * currentComplex.re),
        reactivePowerQ: 0,
        apparentPowerS: vOut.mag * currentComplex.mag,
        powerFactorCosPhi: 1,
      };
      continue;
    } else if (comp.type === 'ne555') {
      ne555AnalysisResult = analyzeNE555(comp, components, pinToNodeId, mnaResult.nodePotentials);
    }

    // Power calculations: S = U * I*, P = Re(U * I*), Q = Im(U * I*)
    let activePowerP = 0;
    let reactivePowerQ = 0;
    let apparentPowerS = 0;
    let powerFactorCosPhi = 1;

    if (isAC) {
      const phiRad = ((vDropComplex.phaseDeg - currentComplex.phaseDeg) * Math.PI) / 180;
      apparentPowerS = vDropComplex.mag * currentComplex.mag;
      activePowerP = apparentPowerS * Math.cos(phiRad);
      reactivePowerQ = apparentPowerS * Math.sin(phiRad);
      if (comp.type === 'resistor') {
        activePowerP = Math.abs(activePowerP);
        reactivePowerQ = 0;
        powerFactorCosPhi = 1;
      } else if (comp.type === 'capacitor' || comp.type === 'inductor') {
        activePowerP = 0;
        powerFactorCosPhi = 0;
      } else {
        powerFactorCosPhi = apparentPowerS > 1e-12 ? Math.min(1, Math.abs(activePowerP) / apparentPowerS) : 1;
      }
    } else {
      activePowerP =
        comp.type === 'resistor'
          ? Math.abs(vDropComplex.re * currentComplex.re)
          : vDropComplex.re * currentComplex.re;
      reactivePowerQ = 0;
      apparentPowerS = Math.abs(activePowerP);
      powerFactorCosPhi = 1;
    }

    componentResults[comp.id] = {
      componentId: comp.id,
      label: comp.label,
      type: comp.type,
      nodePlus,
      nodeMinus,
      voltageDropDC: isAC ? vDropComplex.mag : vDropComplex.re,
      currentDC: isAC ? currentComplex.mag : currentComplex.re,
      voltageDropAC: vDropComplex,
      currentAC: currentComplex,
      resistanceR,
      conductanceG,
      reactanceXL,
      reactanceXC,
      impedanceZ,
      admittanceY,
      activePowerP,
      reactivePowerQ,
      apparentPowerS,
      powerFactorCosPhi,
      storedEnergyJ,
      electricChargeC,
      logicValue: digitalAnalysis?.gateStates[comp.id],
      ne555Analysis: ne555AnalysisResult,
    };
  }

  const topologies = detectTopologies(components, nodes, pinToNodeId, componentResults, regime);
  const bodeAnalysis = computeBodeAnalysis(components, nodes, pinToNodeId);
  const mnaMatrixLatex = buildMNAMatrixLatex(mnaResult.matrixG, mnaResult.vectorI, mnaResult.unknownLabels, isAC);

  const didacticSolution = buildDidacticSolution(
    components,
    nodes,
    componentResults,
    regime,
    frequencyHz,
    angularFrequencyOmega,
    topologies,
    digitalAnalysis,
    mnaMatrixLatex
  );

  const hasFatalError = validationIssues.some((i) => i.severity === 'error');

  return {
    isValid: !hasFatalError,
    regime,
    angularFrequencyOmega,
    frequencyHz,
    periodSec,
    nodes,
    componentResults,
    validationIssues,
    digitalAnalysis,
    bodeAnalysis,
    didacticSolution,
  };
}
