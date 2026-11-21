import type { ActionFrame, BossGameId, Direction, LevelDef, TileType } from './types';

export const LCD_WIDTH = 320;
export const LCD_HEIGHT = 214;

export interface GridRuntimeView {
  level: LevelDef;
  heroX: number;
  heroY: number;
  heroDir: Direction;
  tiles: Map<string, TileType>;
  laserTarget?: { x: number; y: number } | null;
  statusBanner?: string;
  isSuccess?: boolean;
  isError?: boolean;
}

export interface BossRuntimeView {
  bossId: BossGameId;
  score: number;
  highScore: number;
  timeLeft: number;
  lives: number;
  gameOver: boolean;
  // Star Catcher & Shared
  playerX: number;
  playerY: number;
  starX: number;
  starY: number;
  // Byte Pet
  petEnergy: number;
  petHappiness: number;
  petActionText: string;
  petBounceTicks: number;
  // Meteor Rain & Space Defender
  meteors: Array<{ x: number; y: number; speed: number }>;
  enemies: Array<{ x: number; y: number; alive: boolean }>;
  lasers: Array<{ x: number; y: number }>;
  tickCount: number;
}

function drawPixelRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawHudBar(ctx: CanvasRenderingContext2D, leftText: string, rightText: string) {
  drawPixelRect(ctx, 0, 0, LCD_WIDTH, 24, '#18181B');
  drawPixelRect(ctx, 0, 23, LCD_WIDTH, 1, '#3F3F46');
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 10px "Silkscreen", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(leftText, 10, 12);

  ctx.fillStyle = '#FBBF24';
  const rw = ctx.measureText(rightText).width;
  ctx.fillText(rightText, LCD_WIDTH - rw - 10, 12);
}

export function renderTitleScreen(ctx: CanvasRenderingContext2D, tick: number, playerName: string, totalStars: number) {
  // Fondo LCD Retro cálido-luminoso
  drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#1E1B4B');
  for (let y = 0; y < LCD_HEIGHT; y += 16) {
    drawPixelRect(ctx, 0, y, LCD_WIDTH, 1, 'rgba(255,255,255,0.04)');
  }
  for (let x = 0; x < LCD_WIDTH; x += 16) {
    drawPixelRect(ctx, x, 0, 1, LCD_HEIGHT, 'rgba(255,255,255,0.04)');
  }

  // Estrellas pixeladas de fondo
  const stars = [
    [28, 36], [70, 24], [260, 42], [290, 90], [40, 150], [270, 165],
  ];
  stars.forEach(([sx, sy], idx) => {
    const bright = (tick + idx * 7) % 30 < 15;
    drawPixelRect(ctx, sx, sy, 3, 3, bright ? '#FDE047' : '#6366F1');
  });

  // Cartucho Titulo
  drawPixelRect(ctx, 26, 36, 268, 64, '#312E81');
  drawPixelRect(ctx, 26, 36, 268, 3, '#818CF8');
  drawPixelRect(ctx, 26, 97, 268, 3, '#1E1B4B');

  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 20px "Silkscreen", monospace';
  const t1 = 'CODEBOY';
  ctx.fillText(t1, (LCD_WIDTH - ctx.measureText(t1).width) / 2, 62);

  ctx.fillStyle = '#38BDF8';
  ctx.font = 'bold 12px "Silkscreen", monospace';
  const t2 = 'ADVANCE EDITION';
  ctx.fillText(t2, (LCD_WIDTH - ctx.measureText(t2).width) / 2, 84);

  // Mascota PixelBot animada en el centro
  const bounce = Math.sin(tick * 0.14) * 3;
  drawHeroSprite(ctx, 144, 114 + bounce, 'down', 32);

  // Prompt Start
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '10px "JetBrains Mono", monospace';
  const pInfo = `JUGADOR: ${playerName.toUpperCase()}  |  ★ ${totalStars}`;
  ctx.fillText(pInfo, (LCD_WIDTH - ctx.measureText(pInfo).width) / 2, 164);

  if (Math.floor(tick / 18) % 2 === 0) {
    ctx.fillStyle = '#34D399';
    ctx.font = 'bold 11px "Silkscreen", monospace';
    const prompt = 'PULSA START O [A]';
    ctx.fillText(prompt, (LCD_WIDTH - ctx.measureText(prompt).width) / 2, 190);
  }
}

export function renderWorldMapScreen(
  ctx: CanvasRenderingContext2D,
  selectedWorldIdx: number,
  worldStats: Array<{ title: string; done: number; total: number; stars: number; unlocked: boolean }>
) {
  drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#EEF2E6');
  drawHudBar(ctx, 'SELECCIONAR MUNDO', 'CRUCETA + A');

  const colors = ['#0284C7', '#10B981', '#D97706', '#E11D48'];

  worldStats.forEach((w, idx) => {
    const y = 34 + idx * 42;
    const isSel = idx === selectedWorldIdx;

    drawPixelRect(ctx, 14, y, LCD_WIDTH - 28, 36, isSel ? '#FFFFFF' : '#E2E8DF');
    drawPixelRect(ctx, 14, y, 6, 36, w.unlocked ? colors[idx] : '#94A3B8');
    if (isSel) {
      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 2;
      ctx.strokeRect(14, y, LCD_WIDTH - 28, 36);
    }

    ctx.fillStyle = w.unlocked ? '#0F172A' : '#64748B';
    ctx.font = 'bold 11px "Silkscreen", monospace';
    ctx.fillText(`${isSel ? '▶ ' : '  '}${w.title}`, 26, y + 14);

    ctx.fillStyle = '#475569';
    ctx.font = '10px "JetBrains Mono", monospace';
    const statusText = w.unlocked
      ? `Niveles: ${w.done}/${w.total}   ★ ${w.stars}`
      : 'BLOQUEADO · Completa el mundo anterior';
    ctx.fillText(statusText, 30, y + 28);
  });
}

function drawHeroSprite(ctx: CanvasRenderingContext2D, px: number, py: number, dir: Direction, size: number) {
  const s = size / 16;
  // Cuerpo robot GBA verde-azul
  drawPixelRect(ctx, px + 3 * s, py + 2 * s, 10 * s, 9 * s, '#2563EB');
  drawPixelRect(ctx, px + 4 * s, py + 1 * s, 8 * s, 2 * s, '#60A5FA');
  // Antena
  drawPixelRect(ctx, px + 7 * s, py, 2 * s, 2 * s, '#F59E0B');
  // Visor oscuro
  drawPixelRect(ctx, px + 4 * s, py + 4 * s, 8 * s, 4 * s, '#0F172A');
  // Ojos según dirección
  const eyeOffset = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  drawPixelRect(ctx, px + (5 + eyeOffset) * s, py + 5 * s, 2 * s, 2 * s, '#34D399');
  drawPixelRect(ctx, px + (9 + eyeOffset) * s, py + 5 * s, 2 * s, 2 * s, '#34D399');
  // Pies
  drawPixelRect(ctx, px + 4 * s, py + 11 * s, 3 * s, 3 * s, '#1E293B');
  drawPixelRect(ctx, px + 9 * s, py + 11 * s, 3 * s, 3 * s, '#1E293B');
}

function drawTileIcon(ctx: CanvasRenderingContext2D, type: TileType, px: number, py: number, size: number) {
  const m = 4;
  if (type === 'wall') {
    drawPixelRect(ctx, px + 1, py + 1, size - 2, size - 2, '#475569');
    drawPixelRect(ctx, px + 3, py + 3, size - 6, 4, '#64748B');
    drawPixelRect(ctx, px + 3, py + 12, size - 6, 4, '#334155');
  } else if (type === 'water') {
    drawPixelRect(ctx, px, py, size, size, '#0284C7');
    drawPixelRect(ctx, px + 4, py + 8, 10, 2, '#7DD3FC');
    drawPixelRect(ctx, px + 14, py + 20, 10, 2, '#7DD3FC');
  } else if (type === 'lava') {
    drawPixelRect(ctx, px, py, size, size, '#DC2626');
    drawPixelRect(ctx, px + 5, py + 7, 8, 4, '#F97316');
    drawPixelRect(ctx, px + 16, py + 18, 9, 4, '#FACC15');
  } else if (type === 'bridge') {
    drawPixelRect(ctx, px, py, size, size, '#92400E');
    drawPixelRect(ctx, px + 2, py + 2, size - 4, size - 4, '#D97706');
    drawPixelRect(ctx, px + 2, py + 10, size - 4, 2, '#78350F');
    drawPixelRect(ctx, px + 2, py + 20, size - 4, 2, '#78350F');
  } else if (type === 'stone') {
    drawPixelRect(ctx, px + 5, py + 8, size - 10, size - 12, '#64748B');
    drawPixelRect(ctx, px + 8, py + 5, size - 16, 4, '#94A3B8');
  } else if (type === 'star') {
    drawPixelRect(ctx, px + 11, py + m, 10, 22, '#F59E0B');
    drawPixelRect(ctx, px + m, py + 11, 22, 10, '#F59E0B');
    drawPixelRect(ctx, px + 9, py + 9, 14, 14, '#FDE047');
  } else if (type === 'gem') {
    drawPixelRect(ctx, px + 8, py + 6, 16, 18, '#0EA5E9');
    drawPixelRect(ctx, px + 11, py + 9, 6, 6, '#BAE6FD');
  } else if (type === 'key') {
    drawPixelRect(ctx, px + 6, py + 10, 8, 8, '#FACC15');
    drawPixelRect(ctx, px + 14, py + 13, 12, 3, '#FACC15');
    drawPixelRect(ctx, px + 22, py + 16, 3, 4, '#FACC15');
  } else if (type === 'chest') {
    drawPixelRect(ctx, px + 4, py + 8, size - 8, size - 12, '#B45309');
    drawPixelRect(ctx, px + 4, py + 8, size - 8, 6, '#D97706');
    drawPixelRect(ctx, px + 13, py + 13, 6, 6, '#FDE047');
  } else if (type === 'enemy') {
    drawPixelRect(ctx, px + 6, py + 6, size - 12, size - 10, '#E11D48');
    drawPixelRect(ctx, px + 9, py + 10, 4, 4, '#FFFFFF');
    drawPixelRect(ctx, px + 19, py + 10, 4, 4, '#FFFFFF');
    drawPixelRect(ctx, px + 10, py + 18, 12, 3, '#18181B');
  }
}

export function renderGridScene(ctx: CanvasRenderingContext2D, view: GridRuntimeView) {
  drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#EEF2E6');
  drawHudBar(ctx, `MUNDO ${view.level.worldId} · NIVEL ${view.level.order}`, `POS (${view.heroX},${view.heroY})`);

  const tileSize = 32;
  const gridWidth = view.level.gridCols * tileSize;
  const gridHeight = view.level.gridRows * tileSize;
  const offsetX = Math.floor((LCD_WIDTH - gridWidth) / 2);
  const offsetY = 24 + Math.floor((LCD_HEIGHT - 24 - 22 - gridHeight) / 2);

  for (let row = 0; row < view.level.gridRows; row++) {
    for (let col = 0; col < view.level.gridCols; col++) {
      const px = offsetX + col * tileSize;
      const py = offsetY + row * tileSize;
      const isAlt = (row + col) % 2 === 0;
      drawPixelRect(ctx, px, py, tileSize, tileSize, isAlt ? '#DCE5D5' : '#CFDACA');

      const tile = view.tiles.get(`${col},${row}`);
      if (tile) {
        drawTileIcon(ctx, tile, px, py, tileSize);
      }
    }
  }

  // Rayo láser si disparó
  if (view.laserTarget) {
    const startPx = offsetX + view.heroX * tileSize + 24;
    const startPy = offsetY + view.heroY * tileSize + 14;
    const endPx = offsetX + view.laserTarget.x * tileSize + 16;
    drawPixelRect(ctx, startPx, startPy, Math.max(8, endPx - startPx), 4, '#F43F5E');
  }

  // Héroe
  drawHeroSprite(
    ctx,
    offsetX + view.heroX * tileSize,
    offsetY + view.heroY * tileSize,
    view.heroDir,
    tileSize
  );

  // Banner inferior dentro de la LCD
  const barColor = view.isSuccess ? '#059669' : view.isError ? '#DC2626' : '#1E293B';
  drawPixelRect(ctx, 0, LCD_HEIGHT - 22, LCD_WIDTH, 22, barColor);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '10px "JetBrains Mono", monospace';
  const msg = view.statusBanner || view.level.goalLabel;
  ctx.fillText(msg.slice(0, 44), 8, LCD_HEIGHT - 10);
}

export function renderBossGame(ctx: CanvasRenderingContext2D, boss: BossRuntimeView) {
  if (boss.bossId === 'star_catcher') {
    drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#0F172A');
    drawHudBar(ctx, `PUNTOS: ${boss.score}`, `TIEMPO: ${Math.max(0, Math.ceil(boss.timeLeft))}s`);

    const cols = 7;
    const rows = 5;
    const tileSize = 32;
    const ox = Math.floor((LCD_WIDTH - cols * tileSize) / 2);
    const oy = 30;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        drawPixelRect(
          ctx,
          ox + c * tileSize,
          oy + r * tileSize,
          tileSize - 1,
          tileSize - 1,
          (r + c) % 2 === 0 ? '#1E293B' : '#172033'
        );
      }
    }

    drawTileIcon(ctx, 'star', ox + boss.starX * tileSize, oy + boss.starY * tileSize, tileSize);
    drawHeroSprite(ctx, ox + boss.playerX * tileSize, oy + boss.playerY * tileSize, 'down', tileSize);
  } else if (boss.bossId === 'byte_pet') {
    drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#EEF2E6');
    drawHudBar(ctx, 'MASCOTA BYTE', '[A] COMER  [B] JUGAR');

    // Barras de Energía y Felicidad
    ctx.fillStyle = '#0F172A';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText(`ENERGIA: ${boss.petEnergy}/10`, 18, 42);
    drawPixelRect(ctx, 18, 49, 120, 10, '#CBD5E1');
    drawPixelRect(ctx, 18, 49, (boss.petEnergy / 10) * 120, 10, boss.petEnergy <= 3 ? '#DC2626' : '#10B981');

    ctx.fillText(`ANIMO: ${boss.petHappiness}/10`, 176, 42);
    drawPixelRect(ctx, 176, 49, 120, 10, '#CBD5E1');
    drawPixelRect(ctx, 176, 49, (boss.petHappiness / 10) * 120, 10, '#0284C7');

    // Mascota Pixelada en el centro
    const jumpY = boss.petBounceTicks > 0 ? -Math.abs(Math.sin(boss.petBounceTicks * 0.4) * 14) : Math.sin(boss.tickCount * 0.1) * 2;
    const cx = 132;
    const cy = 92 + jumpY;

    // Orejas + cuerpo
    drawPixelRect(ctx, cx + 6, cy - 8, 10, 10, '#6366F1');
    drawPixelRect(ctx, cx + 40, cy - 8, 10, 10, '#6366F1');
    drawPixelRect(ctx, cx, cy, 56, 46, '#4F46E5');
    drawPixelRect(ctx, cx + 8, cy + 10, 40, 22, '#0F172A');

    // Ojos expresivos
    const eyeColor = boss.petEnergy <= 2 ? '#F59E0B' : '#34D399';
    drawPixelRect(ctx, cx + 15, cy + 16, 8, boss.petEnergy <= 2 ? 3 : 8, eyeColor);
    drawPixelRect(ctx, cx + 33, cy + 16, 8, boss.petEnergy <= 2 ? 3 : 8, eyeColor);

    // Mensaje de estado
    drawPixelRect(ctx, 16, 164, LCD_WIDTH - 32, 34, '#FFFFFF');
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 164, LCD_WIDTH - 32, 34);
    ctx.fillStyle = '#0F172A';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(boss.petActionText, 26, 182);
  } else if (boss.bossId === 'meteor_rain') {
    drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#090D16');
    drawHudBar(ctx, `PUNTOS: ${boss.score}`, `VIDAS: ${'♥'.repeat(Math.max(0, boss.lives))}`);

    const cols = 7;
    const colW = 36;
    const ox = Math.floor((LCD_WIDTH - cols * colW) / 2);

    // Líneas guía
    for (let c = 0; c <= cols; c++) {
      drawPixelRect(ctx, ox + c * colW, 24, 1, LCD_HEIGHT - 24, 'rgba(255,255,255,0.06)');
    }

    // Meteoritos
    boss.meteors.forEach((m) => {
      const mx = ox + m.x * colW + 6;
      drawPixelRect(ctx, mx, m.y, 24, 24, '#EA580C');
      drawPixelRect(ctx, mx + 4, m.y + 4, 10, 10, '#FDBA74');
    });

    // Jugador
    drawHeroSprite(ctx, ox + boss.playerX * colW + 2, LCD_HEIGHT - 44, 'up', 32);
  } else if (boss.bossId === 'space_defender') {
    drawPixelRect(ctx, 0, 0, LCD_WIDTH, LCD_HEIGHT, '#050814');
    drawHudBar(ctx, `PUNTOS: ${boss.score}`, `VIDAS: ${'♥'.repeat(Math.max(0, boss.lives))}`);

    const cols = 7;
    const colW = 38;
    const ox = Math.floor((LCD_WIDTH - cols * colW) / 2);

    // Estrellas de fondo espacial
    for (let i = 0; i < 14; i++) {
      const sx = (i * 47 + 15) % LCD_WIDTH;
      const sy = 28 + ((i * 31 + boss.tickCount) % (LCD_HEIGHT - 32));
      drawPixelRect(ctx, sx, sy, 2, 2, 'rgba(255,255,255,0.35)');
    }

    // Enemigos
    boss.enemies.forEach((e) => {
      if (!e.alive) return;
      const ex = ox + e.x * colW + 5;
      drawTileIcon(ctx, 'enemy', ex, e.y, 28);
    });

    // Láseres
    boss.lasers.forEach((l) => {
      const lx = ox + l.x * colW + 17;
      drawPixelRect(ctx, lx, l.y, 4, 12, '#38BDF8');
    });

    // Nave espacial del jugador
    const sx = ox + boss.playerX * colW + 4;
    const sy = LCD_HEIGHT - 38;
    drawPixelRect(ctx, sx + 12, sy, 6, 8, '#38BDF8');
    drawPixelRect(ctx, sx + 4, sy + 8, 22, 12, '#E2E8F0');
    drawPixelRect(ctx, sx, sy + 14, 30, 6, '#3B82F6');
  }

  if (boss.gameOver) {
    drawPixelRect(ctx, 36, 66, LCD_WIDTH - 72, 84, 'rgba(15, 23, 42, 0.94)');
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 66, LCD_WIDTH - 72, 84);
    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 14px "Silkscreen", monospace';
    const overTitle = 'FIN DE PARTIDA';
    ctx.fillText(overTitle, (LCD_WIDTH - ctx.measureText(overTitle).width) / 2, 90);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '11px "JetBrains Mono", monospace';
    const scoreTxt = `PUNTOS: ${boss.score}  ·  RECORD: ${boss.highScore}`;
    ctx.fillText(scoreTxt, (LCD_WIDTH - ctx.measureText(scoreTxt).width) / 2, 114);
    ctx.fillStyle = '#34D399';
    const retryTxt = 'PULSA [START] PARA REINTENTAR';
    ctx.fillText(retryTxt, (LCD_WIDTH - ctx.measureText(retryTxt).width) / 2, 136);
  }
}

export function buildTileMapFromLevel(level: LevelDef): Map<string, TileType> {
  const m = new Map<string, TileType>();
  for (const t of level.tiles) {
    m.set(`${t.x},${t.y}`, t.type);
  }
  return m;
}

export function applyFrameToView(view: GridRuntimeView, frame: ActionFrame): void {
  view.heroX = frame.x;
  view.heroY = frame.y;
  view.heroDir = frame.dir;
  view.laserTarget = null;

  if (frame.type === 'pickup' || frame.type === 'open') {
    view.tiles.delete(`${frame.x},${frame.y}`);
  } else if (frame.type === 'paint' && frame.targetX !== undefined && frame.targetY !== undefined) {
    view.tiles.set(`${frame.targetX},${frame.targetY}`, 'bridge');
  } else if (frame.type === 'shoot' && frame.targetX !== undefined && frame.targetY !== undefined) {
    view.laserTarget = { x: frame.targetX, y: frame.targetY };
    view.tiles.delete(`${frame.targetX},${frame.targetY}`);
  }
}
