export type GameScreen = 'TITLE_MENU' | 'WORLD_MAP' | 'PLAYING' | 'ARCADE_GALLERY';

export type ShellColor = 'indigo' | 'arctic' | 'spice';

export type EditorMode = 'blocks' | 'code' | 'split';

export type LevelKind = 'lesson' | 'challenge' | 'boss';

export type BossGameId = 'star_catcher' | 'byte_pet' | 'meteor_rain' | 'space_defender';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type GbaButton = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select' | 'l' | 'r';

export type TileType =
  | 'floor'
  | 'wall'
  | 'water'
  | 'lava'
  | 'stone'
  | 'star'
  | 'gem'
  | 'key'
  | 'chest'
  | 'enemy'
  | 'bridge';

export interface GridCoord {
  x: number;
  y: number;
}

export interface BlockOption {
  id: string;
  label: string;
  code: string;
  kind: 'action' | 'control' | 'logic';
  hasArg?: boolean;
  defaultArg?: number;
  minArg?: number;
  maxArg?: number;
  argLabel?: string;
}

export interface CodeBlockInstance {
  uid: string;
  blockId: string;
  arg?: number;
}

export interface ActionFrame {
  type: 'move' | 'jump' | 'pickup' | 'paint' | 'shoot' | 'open' | 'log' | 'fail';
  x: number;
  y: number;
  dir: Direction;
  message?: string;
  targetX?: number;
  targetY?: number;
}

export interface BossHandlers {
  velocidad?: number;
  cantidadMeteoritos?: number;
  velocidadCaida?: number;
  puntosPorImpacto?: number;
  energiaInicial?: number;
  alPresionarArriba?: () => void;
  alPresionarAbajo?: () => void;
  alPresionarIzquierda?: () => void;
  alPresionarDerecha?: () => void;
  alPresionarA?: () => void;
  alPresionarB?: () => void;
}

export interface SandboxResult {
  ok: boolean;
  frames: ActionFrame[];
  logs: string[];
  collected: number;
  openedChests: number;
  paintedCount: number;
  enemiesCleared: number;
  finalX: number;
  finalY: number;
  stepsUsed: number;
  errorMessage?: string;
  errorLine?: number;
  handlers: BossHandlers;
}

export interface LevelDef {
  id: string;
  worldId: number;
  order: number;
  kind: LevelKind;
  title: string;
  subtitle: string;
  explanation: string;
  goalLabel: string;
  defaultMode: EditorMode;
  allowBlocks: boolean;
  recommendedMaxSteps?: number;
  gridCols: number;
  gridRows: number;
  startX: number;
  startY: number;
  tiles: Array<{ x: number; y: number; type: TileType }>;
  blocks: BlockOption[];
  starterBlocks: Array<{ blockId: string; arg?: number }>;
  starterCode: string;
  hints: [string, string, string];
  bossGameId?: BossGameId;
  evaluateWin: (res: SandboxResult) => { won: boolean; feedback: string; stars: number };
}

export interface WorldDef {
  id: number;
  title: string;
  theme: string;
  description: string;
  accentColor: string;
  levelIds: string[];
}

export interface LevelProgressEntry {
  stars: number;
  savedCode?: string;
}

export interface BossProgressEntry {
  unlocked: boolean;
  code: string;
  highScore: number;
}

export interface SaveCartridgeV1 {
  app: 'codeboy-advance';
  schemaVersion: 1;
  exportedAt: string;
  player: {
    name: string;
    shellColor: ShellColor;
  };
  settings: {
    muted: boolean;
    theme: 'light' | 'dark';
    teacherUnlockAll: boolean;
  };
  progress: {
    completedLevels: Record<string, LevelProgressEntry>;
    bossProjects: Record<string, BossProgressEntry>;
  };
}
