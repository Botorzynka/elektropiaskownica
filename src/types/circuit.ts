export type SIPrefix = 'p' | 'n' | 'u' | 'm' | '' | 'k' | 'M' | 'G';

export type ComponentCategory = 'passive' | 'sources' | 'active' | 'digital' | 'probes';

export type ComponentType =
  | 'resistor'
  | 'inductor'
  | 'capacitor'
  | 'dc_voltage'
  | 'ac_voltage'
  | 'current_source'
  | 'ground'
  | 'switch'
  | 'opamp'
  | 'and_gate'
  | 'or_gate'
  | 'not_gate'
  | 'nand_gate'
  | 'nor_gate'
  | 'xor_gate'
  | 'logic_input'
  | 'clock'
  | 'logic_probe'
  | 'ne555'
  | 'voltmeter'
  | 'ammeter';

export type Rotation = 0 | 90 | 180 | 270;

export interface PinDefinition {
  id: string;
  label: string;
  /** Offset relative to component center (at rotation 0) in grid/canvas pixels (grid step = 20px) */
  dx: number;
  dy: number;
  role?: 'passive' | 'positive' | 'negative' | 'in+' | 'in-' | 'out' | 'digital_in' | 'digital_out' | 'ic_pin';
}

export interface CircuitComponent {
  id: string;
  type: ComponentType;
  label: string; // e.g., R1, L1, C1, U1, E1, J1, IC1
  x: number; // Snapped to 20px grid
  y: number;
  rotation: Rotation;
  /** Numeric value in chosen prefix (e.g. 2.2 when prefix is 'k' -> 2200 in SI) */
  value: number;
  prefix: SIPrefix;
  unit: string; // 'Ω', 'H', 'F', 'V', 'A', 'Hz', ''
  // Extra parameters for AC sources, switches, logic inputs, clock
  frequency?: number; // Value in frequencyPrefix
  frequencyPrefix?: SIPrefix;
  phaseDeg?: number; // Phase in degrees [°]
  isRms?: boolean; // For AC source: whether value is RMS (wartość skuteczna) or amplitude (U_m)
  switchClosed?: boolean; // For switch
  logicState?: 0 | 1; // For logic_input
  dutyCycle?: number; // For clock (%)
  opAmpGain?: number; // Ideal open-loop gain (default 1e6)
}

export interface Point {
  x: number;
  y: number;
}

export interface PinReference {
  componentId: string;
  pinId: string;
}

export interface Wire {
  id: string;
  from: PinReference;
  to: PinReference;
  /** Optional intermediate orthogonal bend points */
  waypoints?: Point[];
}

export interface ComplexValue {
  re: number;
  im: number;
  mag: number;
  phaseDeg: number;
}

export interface ElectricalNode {
  id: string; // e.g. "0" (GND), "1", "2"...
  label: string; // "GND", "Węzeł 1", "Węzeł 2"...
  pins: PinReference[];
  isGround: boolean;
  potentialDC: number; // [V]
  potentialAC?: ComplexValue; // [V] complex phasor
  digitalState?: '0' | '1' | 'X' | null;
  color: string; // Equipotential highlight color
}

export interface NE555Analysis {
  mode: 'astable' | 'monostable' | 'unconfigured';
  raOhms?: number;
  rbOhms?: number;
  cFarads?: number;
  raLabel?: string;
  rbLabel?: string;
  cLabel?: string;
  vccVolts: number;
  frequencyHz?: number;
  periodSec?: number;
  tHighSec?: number;
  tLowSec?: number;
  dutyCyclePercent?: number;
  explanation: string;
  formulasLatex: string[];
}

export interface ComponentSimulationResult {
  componentId: string;
  label: string;
  type: ComponentType;
  nodePlus: string;
  nodeMinus: string;
  // DC quantities
  voltageDropDC: number; // U [V]
  currentDC: number; // I [A] (flowing from pin 0/positive to pin 1/negative)
  // AC quantities (phasors, RMS-based)
  voltageDropAC?: ComplexValue; // U [V]
  currentAC?: ComplexValue; // I [A]
  // Impedance / Admittance / Reactance / Conductance
  resistanceR?: number; // R [Ω]
  conductanceG?: number; // G [S]
  reactanceXL?: number; // X_L [Ω]
  reactanceXC?: number; // X_C [Ω]
  impedanceZ?: ComplexValue; // Z [Ω]
  admittanceY?: ComplexValue; // Y [S]
  // Power & Energy
  activePowerP: number; // P [W]
  reactivePowerQ: number; // Q [var]
  apparentPowerS: number; // S [VA]
  powerFactorCosPhi: number; // cos(φ) [-]
  storedEnergyJ?: number; // E [J] (1/2 C U^2 or 1/2 L I^2)
  electricChargeC?: number; // Q_e [C] (C * U)
  // Digital / IC results
  logicValue?: '0' | '1' | 'X';
  ne555Analysis?: NE555Analysis;
}

export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  explanation: string;
  didacticTip: string;
  affectedComponentIds: string[];
  affectedNodeIds?: string[];
}

export interface TruthTableRow {
  inputs: Record<string, 0 | 1>;
  outputs: Record<string, 0 | 1 | 'X'>;
}

export interface DigitalAnalysisResult {
  hasDigitalComponents: boolean;
  inputLabels: string[];
  outputLabels: string[];
  booleanExpressions: Record<string, string>; // outputLabel -> boolean expression in LaTeX or readable notation
  truthTable: TruthTableRow[];
  gateStates: Record<string, '0' | '1' | 'X'>; // componentId -> output state
}

export interface BodePoint {
  freqHz: number;
  omegaRadSec: number;
  gainMag: number;
  gainDb: number;
  phaseDeg: number;
}

export interface BodeAnalysis {
  available: boolean;
  inputLabel: string;
  outputNodeId: string;
  outputNodeLabel: string;
  cutoffFreqHz?: number;
  resonantFreqHz?: number;
  filterType?: string;
  points: BodePoint[];
}

export interface TopologicalGroup {
  type: 'series' | 'parallel' | 'voltage_divider' | 'current_divider' | 'opamp_inverting' | 'opamp_noninverting' | 'opamp_follower' | 'opamp_integrator' | 'opamp_differentiator' | 'rlc_series' | 'rlc_parallel' | 'ne555_astable';
  componentIds: string[];
  componentLabels: string[];
  description: string;
  equivalentFormulaLatex: string;
  equivalentValueSI?: number;
  equivalentComplex?: ComplexValue;
  unit?: string;
}

export interface SymbolicFormulaItem {
  id: string;
  category: string;
  lawName: string;
  latex: string;
  explanation: string;
}

export interface SIConversionStep {
  componentId: string;
  label: string;
  quantitySymbol: string;
  rawDisplay: string;
  prefixSymbol: string;
  prefixNamePl: string;
  multiplierPower: number;
  siValue: number;
  siUnit: string;
  latex: string;
}

export interface DerivationStep {
  stepNumber: number;
  title: string;
  description: string;
  symbolicLatex: string;
  substitutionLatex: string;
  resultLatex: string;
  algebraicComplexLatex?: string;
  exponentialComplexLatex?: string;
}

export interface DidacticSolution {
  /** Hint 1: Flow visualization & equipotential nodes */
  hint1_flowAndNodes: {
    summary: string;
    activeBranchesCount: number;
    zeroCurrentBranches: { componentId: string; label: string; reason: string }[];
    equipotentialNodes: { nodeId: string; label: string; potentialStr: string; color: string; connectedLabels: string[] }[];
  };
  /** Hint 2: Engineering insight & topological recognition */
  hint2_engineeringInsights: {
    headline: string;
    regimeExplanation: string;
    detectedTopologies: TopologicalGroup[];
    stepByStepStrategy: string[];
  };
  /** Hint 3: Laws and symbolic equations only (no numbers substituted yet) */
  hint3_symbolicFormulas: SymbolicFormulaItem[];
  /** Full solution (Step 0, Step 1, Step 2) */
  fullSolution: {
    step0_siConversions: SIConversionStep[];
    step1_calculations: DerivationStep[];
    mnaMatrixLatex?: string;
    totalSourcePowerP: number;
    totalLoadPowerP: number;
    totalReactivePowerQ: number;
    totalApparentPowerS: number;
    powerBalanceLatex: string;
  };
}

export interface SimulationResult {
  isValid: boolean;
  regime: 'DC' | 'AC' | 'DIGITAL' | 'MIXED' | 'EMPTY';
  angularFrequencyOmega: number; // ω = 2πf [rad/s]
  frequencyHz: number; // f [Hz]
  periodSec: number; // T = 1/f [s]
  nodes: ElectricalNode[];
  componentResults: Record<string, ComponentSimulationResult>;
  validationIssues: ValidationIssue[];
  digitalAnalysis?: DigitalAnalysisResult;
  bodeAnalysis?: BodeAnalysis;
  didacticSolution: DidacticSolution;
}

export interface CircuitState {
  name: string;
  description?: string;
  components: CircuitComponent[];
  wires: Wire[];
}
