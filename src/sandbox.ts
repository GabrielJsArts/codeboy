import type { ActionFrame, BossHandlers, Direction, LevelDef, SandboxResult, TileType } from './types';

class LoopGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopGuardError';
  }
}

class HazardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HazardError';
  }
}

function instrumentLoops(source: string): string {
  // Evitar acceso peligroso a window, document, fetch, eval, Function
  const forbidden = /\b(window|document|globalThis|fetch|XMLHttpRequest|eval|Function|localStorage|import|require)\b/;
  if (forbidden.test(source)) {
    throw new Error('Por seguridad, solo puedes usar los comandos del juego en este editor.');
  }

  // Inyectar __tick() en bucles for / while / do { ... }
  return source
    .replace(/\b(for\s*\([^)]*\)\s*\{)/g, '$1 __tick();')
    .replace(/\b(while\s*\([^)]*\)\s*\{)/g, '$1 __tick();')
    .replace(/\b(do\s*\{)/g, '$1 __tick();');
}

function translateError(err: unknown): string {
  if (err instanceof LoopGuardError || err instanceof HazardError) {
    return err.message;
  }
  const raw = err instanceof Error ? err.message : String(err);

  const notDefined = raw.match(/([a-zA-Z_$][\w$]*) is not defined/);
  if (notDefined) {
    return `El comando o variable «${notDefined[1]}» no existe. Revisa cómo se escribe o usa el teclado táctil.`;
  }
  if (/Unexpected token|Unexpected end of input/i.test(raw)) {
    return 'Hay un símbolo o llave «{ }» sin cerrar o fuera de lugar. Revisa tu código línea por línea.';
  }
  if (/missing \) after argument list/i.test(raw)) {
    return 'Falta cerrar un paréntesis «)» o falta un punto y coma «;».';
  }
  if (/Assignment to constant variable/i.test(raw)) {
    return 'Intentaste cambiar una constante. Usa «let» si el valor va a cambiar.';
  }
  return `Error en tu código: ${raw}`;
}

export interface LiveBossProxy {
  jugador: { x: number; y: number };
  mascota: { energia: number; felicidad: number; mensaje: string };
  nave: { x: number; disparar: () => void };
}

export function runLevelCode(
  level: LevelDef,
  code: string,
  liveBossProxy?: LiveBossProxy
): SandboxResult {
  const frames: ActionFrame[] = [];
  const logs: string[] = [];
  let x = level.startX;
  let y = level.startY;
  let dir: Direction = 'right';
  let collected = 0;
  let openedChests = 0;
  let paintedCount = 0;
  let enemiesCleared = 0;
  let stepsUsed = 0;
  let ticks = 0;

  // Copia mutable del mapa de casillas
  const tileMap = new Map<string, TileType>();
  for (const t of level.tiles) {
    tileMap.set(`${t.x},${t.y}`, t.type);
  }
  const keyOf = (cx: number, cy: number) => `${cx},${cy}`;

  const __tick = () => {
    ticks += 1;
    if (ticks > 1500) {
      throw new LoopGuardError(
        '¡Bucle demasiado largo! Se detuvo después de 1,500 repeticiones para proteger tu consola.'
      );
    }
  };

  const checkTileAt = (nx: number, ny: number) => {
    if (nx < 0 || nx >= level.gridCols || ny < 0 || ny >= level.gridRows) {
      frames.push({ type: 'fail', x, y, dir, message: '¡Te saliste del borde del mapa!' });
      throw new HazardError('¡Te saliste del borde del mapa!');
    }
    const tile = tileMap.get(keyOf(nx, ny));
    if (tile === 'wall') {
      frames.push({ type: 'fail', x, y, dir, message: '¡Chocaste contra un muro de piedra!' });
      throw new HazardError('¡Chocaste contra un muro de piedra!');
    }
    if (tile === 'water') {
      frames.push({ type: 'fail', x: nx, y: ny, dir, message: '¡Splash! Caíste al agua. Busca el puente.' });
      throw new HazardError('¡Splash! Caíste al agua. Busca el puente.');
    }
    if (tile === 'lava') {
      frames.push({ type: 'fail', x: nx, y: ny, dir, message: '¡Caliente! Tocaste lava sin construir un puente primero.' });
      throw new HazardError('¡Caliente! Tocaste lava sin construir un puente primero.');
    }
    if (tile === 'stone') {
      frames.push({ type: 'fail', x, y, dir, message: '¡Tropezaste con una piedra! Usa saltar() cuando hayPiedra().' });
      throw new HazardError('¡Tropezaste con una piedra! Usa saltar() cuando hayPiedra().');
    }
    if (tile === 'enemy') {
      frames.push({ type: 'fail', x: nx, y: ny, dir, message: '¡Un guardián bloquea esa casilla! Usa dispararRayo().' });
      throw new HazardError('¡Un guardián bloquea esa casilla! Usa dispararRayo().');
    }
  };

  const moveDelta = (dx: number, dy: number, newDir: Direction) => {
    __tick();
    stepsUsed += 1;
    dir = newDir;
    const nx = x + dx;
    const ny = y + dy;
    checkTileAt(nx, ny);
    x = nx;
    y = ny;
    frames.push({ type: 'move', x, y, dir });
  };

  const moverDerecha = () => moveDelta(1, 0, 'right');
  const moverIzquierda = () => moveDelta(-1, 0, 'left');
  const moverArriba = () => moveDelta(0, -1, 'up');
  const moverAbajo = () => moveDelta(0, 1, 'down');

  const avanzar = () => moverDerecha();

  const saltar = () => {
    __tick();
    stepsUsed += 1;
    dir = 'right';
    const nx = x + 2;
    checkTileAt(nx, y);
    x = nx;
    frames.push({ type: 'jump', x, y, dir });
  };

  const hayPiedra = (): boolean => {
    return tileMap.get(keyOf(x + 1, y)) === 'stone';
  };

  const hayEnemigo = (): boolean => {
    return tileMap.get(keyOf(x + 1, y)) === 'enemy';
  };

  const dispararRayo = () => {
    __tick();
    stepsUsed += 1;
    const tx = x + 1;
    const ty = y;
    if (tileMap.get(keyOf(tx, ty)) === 'enemy') {
      tileMap.delete(keyOf(tx, ty));
      enemiesCleared += 1;
      frames.push({ type: 'shoot', x, y, dir: 'right', targetX: tx, targetY: ty, message: '¡Enemigo neutralizado!' });
    } else {
      frames.push({ type: 'shoot', x, y, dir: 'right', targetX: tx, targetY: ty });
    }
  };

  const recoger = () => {
    __tick();
    stepsUsed += 1;
    const tile = tileMap.get(keyOf(x, y));
    if (tile === 'star' || tile === 'gem' || tile === 'key') {
      tileMap.delete(keyOf(x, y));
      collected += 1;
      frames.push({ type: 'pickup', x, y, dir, message: `¡Recogiste ${tile === 'star' ? 'estrella' : tile === 'key' ? 'llave' : 'gema'}!` });
    } else {
      frames.push({ type: 'log', x, y, dir, message: 'No hay ningún objeto en esta casilla.' });
    }
  };

  const abrirCofre = () => {
    __tick();
    stepsUsed += 1;
    const tile = tileMap.get(keyOf(x, y));
    if (tile === 'chest') {
      if (collected >= 1) {
        tileMap.delete(keyOf(x, y));
        openedChests += 1;
        frames.push({ type: 'open', x, y, dir, message: '¡Cofre abierto con éxito!' });
      } else {
        frames.push({ type: 'fail', x, y, dir, message: 'El cofre está cerrado. Recoge la llave primero.' });
        throw new HazardError('El cofre está cerrado. Recoge la llave primero.');
      }
    } else {
      frames.push({ type: 'log', x, y, dir, message: 'Debes estar sobre el cofre para abrirlo.' });
    }
  };

  const pintarBloque = (px: number, py: number) => {
    __tick();
    stepsUsed += 1;
    if (px >= 0 && px < level.gridCols && py >= 0 && py < level.gridRows) {
      const current = tileMap.get(keyOf(px, py));
      if (current === 'lava' || current === 'water' || !current) {
        tileMap.set(keyOf(px, py), 'bridge');
        paintedCount += 1;
        frames.push({ type: 'paint', x, y, dir, targetX: px, targetY: py });
      }
    }
  };

  const imprimir = (msg: unknown) => {
    const text = String(msg);
    logs.push(text);
    frames.push({ type: 'log', x, y, dir, message: text });
  };

  const handlers: BossHandlers = {};

  const jugador = liveBossProxy?.jugador ?? { x: level.startX, y: level.startY };
  const mascota = liveBossProxy?.mascota ?? { energia: 6, felicidad: 5, mensaje: '' };
  const nave = liveBossProxy?.nave ?? { x: level.startX, disparar: () => {} };

  try {
    const safeSource = instrumentLoops(code);
    const wrapped = `
      "use strict";
      ${safeSource}
      return {
        velocidad: typeof velocidad !== "undefined" ? velocidad : undefined,
        cantidadMeteoritos: typeof cantidadMeteoritos !== "undefined" ? cantidadMeteoritos : undefined,
        velocidadCaida: typeof velocidadCaida !== "undefined" ? velocidadCaida : undefined,
        puntosPorImpacto: typeof puntosPorImpacto !== "undefined" ? puntosPorImpacto : undefined,
        energiaInicial: typeof energiaInicial !== "undefined" ? energiaInicial : undefined,
        alPresionarArriba: typeof alPresionarArriba === "function" ? alPresionarArriba : undefined,
        alPresionarAbajo: typeof alPresionarAbajo === "function" ? alPresionarAbajo : undefined,
        alPresionarIzquierda: typeof alPresionarIzquierda === "function" ? alPresionarIzquierda : undefined,
        alPresionarDerecha: typeof alPresionarDerecha === "function" ? alPresionarDerecha : undefined,
        alPresionarA: typeof alPresionarA === "function" ? alPresionarA : undefined,
        alPresionarB: typeof alPresionarB === "function" ? alPresionarB : undefined
      };
    `;

    const runner = new Function(
      '__tick',
      'moverDerecha',
      'moverIzquierda',
      'moverArriba',
      'moverAbajo',
      'avanzar',
      'saltar',
      'hayPiedra',
      'hayEnemigo',
      'dispararRayo',
      'recoger',
      'abrirCofre',
      'pintarBloque',
      'imprimir',
      'jugador',
      'mascota',
      'nave',
      wrapped
    );

    const exported = runner(
      __tick,
      moverDerecha,
      moverIzquierda,
      moverArriba,
      moverAbajo,
      avanzar,
      saltar,
      hayPiedra,
      hayEnemigo,
      dispararRayo,
      recoger,
      abrirCofre,
      pintarBloque,
      imprimir,
      jugador,
      mascota,
      nave
    ) as BossHandlers;

    Object.assign(handlers, exported);

    return {
      ok: true,
      frames,
      logs,
      collected,
      openedChests,
      paintedCount,
      enemiesCleared,
      finalX: x,
      finalY: y,
      stepsUsed,
      handlers,
    };
  } catch (err) {
    return {
      ok: false,
      frames,
      logs,
      collected,
      openedChests,
      paintedCount,
      enemiesCleared,
      finalX: x,
      finalY: y,
      stepsUsed,
      errorMessage: translateError(err),
      handlers,
    };
  }
}
