import './index.css';
import { retroAudio } from './audio';
import {
  applyFrameToView,
  buildTileMapFromLevel,
  LCD_HEIGHT,
  LCD_WIDTH,
  renderBossGame,
  renderGridScene,
  renderTitleScreen,
  renderWorldMapScreen,
  type BossRuntimeView,
  type GridRuntimeView,
} from './canvasRenderer';
import {
  buildShareLinks,
  canNativeShareFile,
  createCartridgeFile,
  createDefaultCartridge,
  decodeCartridgeInput,
  downloadCartridgeJson,
  getCartridgeSummary,
  loadLocalCartridge,
  saveLocalCartridge,
} from './cartridge';
import { getLevelById, LEVELS, WORLDS } from './curriculum';
import { runLevelCode, type LiveBossProxy } from './sandbox';
import { getTouchKeys, insertTokenAtCursor, type KeyboardTab } from './touchKeyboard';
import type {
  BossGameId,
  BossHandlers,
  CodeBlockInstance,
  EditorMode,
  GameScreen,
  GbaButton,
  LevelDef,
  SaveCartridgeV1,
  ShellColor,
} from './types';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class CodeBoyApp {
  private root: HTMLElement;
  private cartridge: SaveCartridgeV1;
  private screen: GameScreen = 'TITLE_MENU';
  private selectedWorldIndex = 0;
  private currentLevel: LevelDef = LEVELS[0];

  // Estado del editor y bloques
  private editorMode: EditorMode = 'blocks';
  private blockSequence: CodeBlockInstance[] = [];
  private codeText = '';
  private showTouchKeyboard = true;
  private keyboardTab: KeyboardTab = 'commands';
  private activeHintIndex = 0; // 0 = oculto, 1..3 pistas
  private uidCounter = 1;

  // Estado de ejecución y retroalimentación
  private statusType: 'idle' | 'running' | 'success' | 'error' = 'idle';
  private statusText = 'Listo para ejecutar';
  private feedbackMessage = '';
  private levelWon = false;

  // Modales
  private activeModal: 'none' | 'cartridge' | 'cpanel' = 'none';
  private cartridgeTab: 'share' | 'load' = 'share';
  private pendingImportCartridge: SaveCartridgeV1 | null = null;
  private importError = '';
  private toastMessage = '';
  private toastTimer: number | null = null;

  // Runtime de Canvas LCD
  private canvasEl: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private rafId: number | null = null;
  private titleTick = 0;
  private playbackTimer: number | null = null;
  private gridView: GridRuntimeView | null = null;
  private showScreenControls = true;
  private expandedScreen = false;

  // Runtime de Juegos Jefe
  private bossActive = false;
  private bossHandlers: BossHandlers = {};
  private bossView: BossRuntimeView | null = null;
  private bossProxy: LiveBossProxy | null = null;
  private bossLastFrameTime = 0;
  private bossAccumulator = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.cartridge = loadLocalCartridge();
    retroAudio.muted = this.cartridge.settings.muted;
    this.applyThemeClass();
    this.loadLevelState(LEVELS[0]);
    this.bindGlobalKeyboard();
    this.render();
    this.startLoop();
  }

  private applyThemeClass(): void {
    document.documentElement.classList.toggle('dark', this.cartridge.settings.theme === 'dark');
  }

  private showToast(msg: string): void {
    this.toastMessage = msg;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.updateToastDom();
    this.toastTimer = window.setTimeout(() => {
      this.toastMessage = '';
      this.updateToastDom();
    }, 3400);
  }

  private updateToastDom(): void {
    const el = document.getElementById('cb-toast');
    if (!el) return;
    if (this.toastMessage) {
      el.textContent = this.toastMessage;
      el.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-2');
      el.classList.add('opacity-100', 'translate-y-0');
    } else {
      el.classList.add('opacity-0', 'pointer-events-none', 'translate-y-2');
      el.classList.remove('opacity-100', 'translate-y-0');
    }
  }

  private persistCartridge(): void {
    saveLocalCartridge(this.cartridge);
  }

  private isWorldUnlocked(worldId: number): boolean {
    if (this.cartridge.settings.teacherUnlockAll || worldId === 1) return true;
    const prevWorld = WORLDS.find((w) => w.id === worldId - 1);
    if (!prevWorld) return true;
    const prevBossId = prevWorld.levelIds[prevWorld.levelIds.length - 1];
    return Boolean(this.cartridge.progress.completedLevels[prevBossId]);
  }

  private isLevelUnlocked(level: LevelDef): boolean {
    if (this.cartridge.settings.teacherUnlockAll) return true;
    if (!this.isWorldUnlocked(level.worldId)) return false;
    const world = WORLDS.find((w) => w.id === level.worldId);
    if (!world) return true;
    const idx = world.levelIds.indexOf(level.id);
    if (idx <= 0) return true;
    const prevLevelId = world.levelIds[idx - 1];
    return Boolean(this.cartridge.progress.completedLevels[prevLevelId]);
  }

  private loadLevelState(level: LevelDef): void {
    this.stopTimers();
    this.bossActive = false;
    this.bossView = null;
    this.currentLevel = level;
    this.editorMode = level.defaultMode;
    this.activeHintIndex = 0;
    this.levelWon = Boolean(this.cartridge.progress.completedLevels[level.id]);
    this.statusType = 'idle';
    this.statusText = 'Listo para ejecutar';
    this.feedbackMessage = '';
    this.showTouchKeyboard = level.defaultMode !== 'blocks';

    const saved = this.cartridge.progress.completedLevels[level.id]?.savedCode;
    const bossSaved = level.bossGameId ? this.cartridge.progress.bossProjects[level.bossGameId]?.code : undefined;

    this.blockSequence = level.starterBlocks.map((b) => ({
      uid: `blk_${this.uidCounter++}`,
      blockId: b.blockId,
      arg: b.arg,
    }));

    this.codeText = bossSaved || saved || level.starterCode;

    this.gridView = {
      level,
      heroX: level.startX,
      heroY: level.startY,
      heroDir: 'right',
      tiles: buildTileMapFromLevel(level),
    };
  }

  private stopTimers(): void {
    if (this.playbackTimer) {
      window.clearTimeout(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  private syncBlocksToCode(): void {
    const lines = this.blockSequence.map((item) => {
      const def = this.currentLevel.blocks.find((b) => b.id === item.blockId);
      if (!def) return '';
      if (def.hasArg) {
        const val = item.arg ?? def.defaultArg ?? 1;
        return def.code.replace('{N}', String(val));
      }
      return def.code;
    });
    this.codeText = lines.join('\n');
  }

  private executeCurrentProgram(): void {
    this.stopTimers();
    this.bossActive = false;

    if (this.currentLevel.kind === 'boss' && this.currentLevel.bossGameId) {
      this.launchBossGame(this.currentLevel.bossGameId, this.codeText);
      return;
    }

    this.gridView = {
      level: this.currentLevel,
      heroX: this.currentLevel.startX,
      heroY: this.currentLevel.startY,
      heroDir: 'right',
      tiles: buildTileMapFromLevel(this.currentLevel),
      statusBanner: 'Ejecutando algoritmo...',
    };

    const result = runLevelCode(this.currentLevel, this.codeText);
    const frames = result.frames;

    if (frames.length === 0) {
      const evalRes = this.currentLevel.evaluateWin(result);
      this.finishExecution(result.ok, evalRes.won, evalRes.feedback, evalRes.stars);
      return;
    }

    this.statusType = 'running';
    this.statusText = 'Ejecutando pasos';
    this.feedbackMessage = 'Observa la pantalla de tu Game Boy Advance...';
    this.updateStatusUiOnly();

    let idx = 0;
    const stepNext = () => {
      if (!this.gridView || this.screen !== 'PLAYING') return;
      if (idx < frames.length) {
        const f = frames[idx];
        applyFrameToView(this.gridView, f);
        if (f.type === 'move' || f.type === 'jump') retroAudio.stepMove();
        else if (f.type === 'pickup' || f.type === 'open') retroAudio.pickup();
        else if (f.type === 'shoot') retroAudio.laser();
        else if (f.type === 'fail') retroAudio.error();

        if (f.message) {
          this.gridView.statusBanner = f.message;
        }
        idx += 1;
        this.playbackTimer = window.setTimeout(stepNext, 220);
      } else {
        const evalRes = this.currentLevel.evaluateWin(result);
        this.finishExecution(result.ok, evalRes.won, evalRes.feedback, evalRes.stars);
      }
    };

    stepNext();
  }

  private finishExecution(ok: boolean, won: boolean, feedback: string, stars: number): void {
    if (won && ok) {
      retroAudio.victory();
      this.statusType = 'success';
      this.statusText = `Completado · ${stars}/3 estrellas`;
      this.feedbackMessage = feedback;
      this.levelWon = true;

      if (this.gridView) {
        this.gridView.isSuccess = true;
        this.gridView.isError = false;
        this.gridView.statusBanner = '¡MISION COMPLETADA!';
      }

      const prev = this.cartridge.progress.completedLevels[this.currentLevel.id];
      this.cartridge.progress.completedLevels[this.currentLevel.id] = {
        stars: Math.max(prev?.stars ?? 0, stars),
        savedCode: this.codeText,
      };
      this.persistCartridge();
    } else {
      retroAudio.error();
      this.statusType = 'error';
      this.statusText = 'Revisa tu código';
      this.feedbackMessage = feedback;
      if (this.gridView) {
        this.gridView.isError = true;
        this.gridView.isSuccess = false;
        this.gridView.statusBanner = feedback;
      }
    }
    this.render();
  }

  private launchBossGame(bossId: BossGameId, code: string): void {
    const startEnergyMatch = code.match(/energiaInicial\s*=\s*(\d+)/);
    const initialEnergy = startEnergyMatch ? Math.min(10, Math.max(2, Number(startEnergyMatch[1]))) : 6;

    const proxy: LiveBossProxy = {
      jugador: { x: 3, y: 2 },
      mascota: { energia: initialEnergy, felicidad: 5, mensaje: '¡Listo para jugar!' },
      nave: {
        x: 3,
        disparar: () => {
          if (!this.bossView || this.bossView.gameOver) return;
          if (this.bossView.lasers.length < 4) {
            this.bossView.lasers.push({ x: this.bossView.playerX, y: LCD_HEIGHT - 38 });
            retroAudio.laser();
          }
        },
      },
    };

    const result = runLevelCode(this.currentLevel, code, proxy);
    const evalRes = this.currentLevel.evaluateWin(result);

    if (!result.ok || !evalRes.won) {
      retroAudio.error();
      this.statusType = 'error';
      this.statusText = 'Error al compilar juego';
      this.feedbackMessage = result.errorMessage || evalRes.feedback;
      this.render();
      return;
    }

    this.bossProxy = proxy;
    this.bossHandlers = result.handlers;
    this.bossActive = true;
    this.bossLastFrameTime = performance.now();
    this.bossAccumulator = 0;

    const prevHigh = this.cartridge.progress.bossProjects[bossId]?.highScore ?? 0;

    this.bossView = {
      bossId,
      score: 0,
      highScore: prevHigh,
      timeLeft: 25,
      lives: 3,
      gameOver: false,
      playerX: 3,
      playerY: bossId === 'star_catcher' ? 2 : 4,
      starX: 5,
      starY: 1,
      petEnergy: initialEnergy,
      petHappiness: 5,
      petActionText: 'Pulsa A (Comer) o B (Jugar)',
      petBounceTicks: 0,
      meteors: [],
      enemies:
        bossId === 'space_defender'
          ? [0, 1, 2, 3, 4, 5, 6].map((col) => ({ x: col, y: 34 + (col % 2) * 18, alive: true }))
          : [],
      lasers: [],
      tickCount: 0,
    };

    if (bossId === 'meteor_rain') {
      const count = Math.min(9, Math.max(2, Number(result.handlers.cantidadMeteoritos ?? 5)));
      const speed = Math.min(5, Math.max(1, Number(result.handlers.velocidadCaida ?? 2)));
      for (let i = 0; i < count; i++) {
        this.bossView.meteors.push({
          x: Math.floor(Math.random() * 7),
          y: -i * 38 - 10,
          speed,
        });
      }
    }

    retroAudio.victory();
    this.levelWon = true;
    this.statusType = 'success';
    this.statusText = 'Juego activo en GBA';
    this.feedbackMessage = evalRes.feedback;

    // Guardar progreso desbloqueado
    this.cartridge.progress.completedLevels[this.currentLevel.id] = {
      stars: 3,
      savedCode: code,
    };
    this.cartridge.progress.bossProjects[bossId] = {
      unlocked: true,
      code,
      highScore: prevHigh,
    };
    this.persistCartridge();
    this.render();
  }

  private handleGbaButton(btn: GbaButton): void {
    this.pulseHardwareButtonDom(btn);

    if (this.screen === 'TITLE_MENU') {
      if (btn === 'start' || btn === 'a') {
        retroAudio.bootChime();
        this.screen = 'WORLD_MAP';
        this.render();
      } else {
        retroAudio.dpadTick();
      }
      return;
    }

    if (this.screen === 'WORLD_MAP') {
      if (btn === 'up' || btn === 'left') {
        retroAudio.dpadTick();
        this.selectedWorldIndex = (this.selectedWorldIndex + WORLDS.length - 1) % WORLDS.length;
        this.render();
      } else if (btn === 'down' || btn === 'right') {
        retroAudio.dpadTick();
        this.selectedWorldIndex = (this.selectedWorldIndex + 1) % WORLDS.length;
        this.render();
      } else if (btn === 'a' || btn === 'start') {
        const w = WORLDS[this.selectedWorldIndex];
        if (this.isWorldUnlocked(w.id)) {
          retroAudio.buttonA();
          const firstLevel = getLevelById(w.levelIds[0]);
          this.loadLevelState(firstLevel);
          this.screen = 'PLAYING';
          this.render();
        } else {
          retroAudio.error();
          this.showToast('Completa el mundo anterior o activa Modo Libre.');
        }
      } else if (btn === 'b') {
        retroAudio.buttonB();
        this.screen = 'TITLE_MENU';
        this.render();
      }
      return;
    }

    if (this.screen === 'PLAYING' && this.bossActive && this.bossView && this.bossProxy) {
      if (btn === 'start' && this.bossView.gameOver) {
        retroAudio.buttonA();
        this.launchBossGame(this.bossView.bossId, this.codeText);
        return;
      }
      if (this.bossView.gameOver) return;

      const b = this.bossView;
      const p = this.bossProxy;
      p.jugador.x = b.playerX;
      p.jugador.y = b.playerY;
      p.nave.x = b.playerX;
      p.mascota.energia = b.petEnergy;
      p.mascota.felicidad = b.petHappiness;

      try {
        if (btn === 'up' && this.bossHandlers.alPresionarArriba) {
          this.bossHandlers.alPresionarArriba();
          retroAudio.dpadTick();
        } else if (btn === 'down' && this.bossHandlers.alPresionarAbajo) {
          this.bossHandlers.alPresionarAbajo();
          retroAudio.dpadTick();
        } else if (btn === 'left' && this.bossHandlers.alPresionarIzquierda) {
          this.bossHandlers.alPresionarIzquierda();
          retroAudio.dpadTick();
        } else if (btn === 'right' && this.bossHandlers.alPresionarDerecha) {
          this.bossHandlers.alPresionarDerecha();
          retroAudio.dpadTick();
        } else if (btn === 'a' && this.bossHandlers.alPresionarA) {
          this.bossHandlers.alPresionarA();
          if (b.bossId === 'byte_pet') {
            b.petBounceTicks = 16;
            b.petActionText = '¡Ñam! Energía recargada';
            retroAudio.pickup();
          } else {
            retroAudio.buttonA();
          }
        } else if (btn === 'b' && this.bossHandlers.alPresionarB) {
          this.bossHandlers.alPresionarB();
          if (b.bossId === 'byte_pet') {
            b.petBounceTicks = 20;
            b.petActionText = '¡Byte está súper feliz jugando!';
            retroAudio.victory();
          } else {
            retroAudio.buttonB();
          }
        }
      } catch {
        retroAudio.error();
      }

      if (b.bossId === 'star_catcher') {
        b.playerX = Math.max(0, Math.min(6, Math.round(p.jugador.x)));
        b.playerY = Math.max(0, Math.min(4, Math.round(p.jugador.y)));
        if (b.playerX === b.starX && b.playerY === b.starY) {
          b.score += 10;
          retroAudio.pickup();
          b.starX = Math.floor(Math.random() * 7);
          b.starY = Math.floor(Math.random() * 5);
          this.updateBossHighScore(b.bossId, b.score);
        }
      } else if (b.bossId === 'byte_pet') {
        b.petEnergy = Math.max(0, Math.min(10, Math.round(p.mascota.energia)));
        b.petHappiness = Math.max(0, Math.min(10, Math.round(p.mascota.felicidad)));
      } else if (b.bossId === 'meteor_rain') {
        b.playerX = Math.max(0, Math.min(6, Math.round(p.jugador.x)));
      } else if (b.bossId === 'space_defender') {
        b.playerX = Math.max(0, Math.min(6, Math.round(p.nave.x)));
      }
      return;
    }

    // En lecciones/retos normales, A ejecuta el programa y L/R cambian de nivel
    if (this.screen === 'PLAYING') {
      if (btn === 'a' || btn === 'start') {
        retroAudio.buttonA();
        this.executeCurrentProgram();
      } else if (btn === 'b') {
        retroAudio.buttonB();
        this.loadLevelState(this.currentLevel);
        this.render();
      } else if (btn === 'l') {
        retroAudio.dpadTick();
        this.navigateSiblingLevel(-1);
      } else if (btn === 'r') {
        retroAudio.dpadTick();
        this.navigateSiblingLevel(1);
      }
    }
  }

  private updateBossHighScore(bossId: BossGameId, score: number): void {
    const entry = this.cartridge.progress.bossProjects[bossId];
    if (entry && score > entry.highScore) {
      entry.highScore = score;
      if (this.bossView) this.bossView.highScore = score;
      this.persistCartridge();
    }
  }

  private navigateSiblingLevel(delta: number): void {
    const idx = LEVELS.findIndex((l) => l.id === this.currentLevel.id);
    const target = LEVELS[idx + delta];
    if (!target) return;
    if (!this.isLevelUnlocked(target)) {
      this.showToast('Completa el reto actual o activa Modo Libre para saltar.');
      return;
    }
    this.loadLevelState(target);
    this.render();
  }

  private pulseHardwareButtonDom(btn: GbaButton): void {
    const el = document.querySelector(`[data-gba-btn="${btn}"]`);
    if (!el) return;
    el.setAttribute('data-active', 'true');
    window.setTimeout(() => el.removeAttribute('data-active'), 140);
  }

  private bindGlobalKeyboard(): void {
    window.addEventListener('keydown', (ev) => {
      const target = ev.target as HTMLElement | null;
      const isTyping = target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT');
      if (isTyping || this.activeModal !== 'none') return;

      const map: Record<string, GbaButton> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
        z: 'a',
        Z: 'a',
        Enter: 'a',
        x: 'b',
        X: 'b',
        ' ': 'start',
      };
      const btn = map[ev.key];
      if (btn) {
        ev.preventDefault();
        this.handleGbaButton(btn);
      }
    });
  }

  private startLoop(): void {
    const frame = (now: number) => {
      this.titleTick += 1;

      if (this.bossActive && this.bossView && !this.bossView.gameOver) {
        const dt = Math.min(0.05, (now - this.bossLastFrameTime) / 1000);
        this.bossLastFrameTime = now;
        this.stepBossSimulation(dt);
      } else {
        this.bossLastFrameTime = now;
      }

      this.drawCanvas();
      this.rafId = window.requestAnimationFrame(frame);
    };
    this.rafId = window.requestAnimationFrame(frame);
  }

  private stepBossSimulation(dt: number): void {
    const b = this.bossView;
    if (!b) return;
    b.tickCount += 1;

    if (b.bossId === 'star_catcher') {
      b.timeLeft -= dt;
      if (b.timeLeft <= 0) {
        b.timeLeft = 0;
        b.gameOver = true;
        this.updateBossHighScore(b.bossId, b.score);
        retroAudio.victory();
      }
    } else if (b.bossId === 'byte_pet') {
      if (b.petBounceTicks > 0) b.petBounceTicks -= 1;
      this.bossAccumulator += dt;
      if (this.bossAccumulator >= 6) {
        this.bossAccumulator = 0;
        b.petEnergy = Math.max(0, b.petEnergy - 1);
        if (b.petEnergy <= 2) b.petActionText = '¡Byte tiene hambre! Pulsa A';
      }
    } else if (b.bossId === 'meteor_rain') {
      b.meteors.forEach((m) => {
        m.y += m.speed * 1.15;
        // Colisión en parte inferior
        if (m.y >= LCD_HEIGHT - 54 && m.y <= LCD_HEIGHT - 20 && m.x === b.playerX) {
          b.lives -= 1;
          m.y = -24;
          m.x = Math.floor(Math.random() * 7);
          retroAudio.error();
          if (b.lives <= 0) {
            b.gameOver = true;
            this.updateBossHighScore(b.bossId, b.score);
          }
        } else if (m.y > LCD_HEIGHT) {
          b.score += 10;
          m.y = -20;
          m.x = Math.floor(Math.random() * 7);
          this.updateBossHighScore(b.bossId, b.score);
        }
      });
    } else if (b.bossId === 'space_defender') {
      const pts = Math.max(10, Number(this.bossHandlers.puntosPorImpacto ?? 25));

      // Mover láseres hacia arriba
      b.lasers.forEach((l) => {
        l.y -= 4.5;
      });
      b.lasers = b.lasers.filter((l) => l.y > 20);

      // Mover enemigos lentamente hacia abajo
      this.bossAccumulator += dt;
      if (this.bossAccumulator >= 0.05) {
        this.bossAccumulator = 0;
        b.enemies.forEach((e) => {
          if (!e.alive) return;
          e.y += 0.38;
          if (e.y >= LCD_HEIGHT - 54) {
            e.alive = false;
            b.lives -= 1;
            retroAudio.error();
            if (b.lives <= 0) {
              b.gameOver = true;
              this.updateBossHighScore(b.bossId, b.score);
            }
          }
        });
      }

      // Colisiones láser -> enemigo
      for (const l of b.lasers) {
        for (const e of b.enemies) {
          if (e.alive && l.x === e.x && Math.abs(l.y - e.y) < 18) {
            e.alive = false;
            l.y = -50;
            b.score += pts;
            retroAudio.pickup();
            this.updateBossHighScore(b.bossId, b.score);
          }
        }
      }

      // Nueva oleada si todos fueron derrotados
      if (!b.gameOver && b.enemies.every((e) => !e.alive)) {
        b.enemies = [0, 1, 2, 3, 4, 5, 6].map((col) => ({
          x: col,
          y: 30 + Math.floor(Math.random() * 24),
          alive: true,
        }));
      }
    }
  }

  private drawCanvas(): void {
    if (!this.ctx) return;
    if (this.screen === 'TITLE_MENU') {
      const { totalStars } = getCartridgeSummary(this.cartridge);
      renderTitleScreen(this.ctx, this.titleTick, this.cartridge.player.name, totalStars);
    } else if (this.screen === 'WORLD_MAP' || this.screen === 'ARCADE_GALLERY') {
      const worldStats = WORLDS.map((w) => {
        let done = 0;
        let stars = 0;
        w.levelIds.forEach((lid) => {
          const entry = this.cartridge.progress.completedLevels[lid];
          if (entry) {
            done += 1;
            stars += entry.stars;
          }
        });
        return {
          title: w.title.replace(/^Mundo \d+: /, ''),
          done,
          total: w.levelIds.length,
          stars,
          unlocked: this.isWorldUnlocked(w.id),
        };
      });
      renderWorldMapScreen(this.ctx, this.selectedWorldIndex, worldStats);
    } else if (this.screen === 'PLAYING') {
      if (this.bossActive && this.bossView) {
        renderBossGame(this.ctx, this.bossView);
      } else if (this.gridView) {
        renderGridScene(this.ctx, this.gridView);
      }
    }
  }

  private updateStatusUiOnly(): void {
    const badge = document.getElementById('cb-status-label');
    const fb = document.getElementById('cb-feedback-text');
    if (badge) badge.textContent = this.statusText;
    if (fb) fb.textContent = this.feedbackMessage;
  }

  private render(): void {
    const shellClass: Record<ShellColor, string> = {
      indigo: 'gba-shell-indigo text-white',
      arctic: 'gba-shell-arctic text-slate-900',
      spice: 'gba-shell-spice text-white',
    };

    const summary = getCartridgeSummary(this.cartridge);

    this.root.innerHTML = `
      <div class="min-h-screen flex flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <!-- Barra superior estricta de 3 zonas -->
        <header class="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div class="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
            <button id="nav-brand" type="button" class="font-pixel text-base sm:text-lg tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-600 rounded">
              CodeBoy Advance
            </button>

            <nav class="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
              <button id="nav-home" type="button" class="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer ${this.screen === 'TITLE_MENU' ? 'text-slate-900 dark:text-white font-semibold' : ''}">Inicio</button>
              <button id="nav-worlds" type="button" class="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer ${this.screen === 'WORLD_MAP' ? 'text-slate-900 dark:text-white font-semibold' : ''}">Mapa de Mundos</button>
              <button id="nav-arcade" type="button" class="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer ${this.screen === 'ARCADE_GALLERY' ? 'text-slate-900 dark:text-white font-semibold' : ''}">Galería Arcade</button>
              <button id="nav-cpanel" type="button" class="hover:text-slate-900 dark:hover:text-white hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer">Despliegue cPanel</button>
            </nav>

            <div class="flex items-center gap-3 shrink-0">
              <button id="btn-open-cartridge" type="button" class="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
                Mi Cartucho JSON
              </button>
            </div>
          </div>
        </header>

        <!-- Navegación móvil compacta -->
        <div class="md:hidden border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto">
          <button data-mobile-nav="TITLE_MENU" type="button" class="px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${this.screen === 'TITLE_MENU' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}">Inicio</button>
          <button data-mobile-nav="WORLD_MAP" type="button" class="px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${this.screen === 'WORLD_MAP' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}">Mundos</button>
          <button data-mobile-nav="ARCADE_GALLERY" type="button" class="px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${this.screen === 'ARCADE_GALLERY' ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'text-slate-600 dark:text-slate-300'}">Arcade</button>
          <button id="mob-nav-cpanel" type="button" class="px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 text-slate-600 dark:text-slate-300">cPanel</button>
        </div>

        <!-- Área Principal de Dos Zonas -->
        <main class="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <!-- ZONA IZQUIERDA: CONSOLA GAME BOY ADVANCE CON PANTALLA MAXIMIZADA -->
          <section class="${this.expandedScreen ? 'lg:col-span-12 max-w-[960px] w-full mx-auto' : 'lg:col-span-7'} flex flex-col gap-3.5">
            <!-- Gatillos L y R -->
            <div class="flex items-center justify-between px-6 -mb-5 relative z-0">
              <button data-gba-btn="l" type="button" title="Nivel anterior (L)" class="gba-btn-press px-6 py-2 rounded-t-xl bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-pixel text-xs border border-b-0 border-slate-400 dark:border-slate-600 cursor-pointer">L</button>
              <button data-gba-btn="r" type="button" title="Siguiente nivel (R)" class="gba-btn-press px-6 py-2 rounded-t-xl bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-100 font-pixel text-xs border border-b-0 border-slate-400 dark:border-slate-600 cursor-pointer">R</button>
            </div>

            <!-- Carcasa GBA optimizada para pantalla gigante -->
            <div class="${shellClass[this.cartridge.player.shellColor]} relative z-10 rounded-[26px] p-3 sm:p-4 shadow-xl border border-black/15">
              <!-- Barra superior hardware: estado encendido -->
              <div class="flex items-center justify-between mb-2.5 px-2 text-xs font-medium opacity-90">
                <span>${escapeHtml(this.cartridge.player.name)} · ${summary.totalStars} Estrellas</span>
                <span class="flex items-center gap-1.5">
                  <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 border border-emerald-200" aria-hidden="true"></span>
                  <span>Encendida</span>
                </span>
              </div>

              <!-- Marco LCD al 100% del ancho con controles transparentes superpuestos -->
              <div class="bg-zinc-900 rounded-2xl p-2 sm:p-3 shadow-inner border border-zinc-800">
                <div class="relative w-full">
                  <canvas
                    id="gba-lcd"
                    width="${LCD_WIDTH}"
                    height="${LCD_HEIGHT}"
                    class="w-full aspect-[320/214] pixel-canvas rounded-lg bg-[#EEF2E6] border-2 border-zinc-950 block"
                  ></canvas>

                  ${
                    this.showScreenControls
                      ? `
                        <div class="pointer-events-none absolute inset-0 flex items-end justify-between p-2 sm:p-3.5 gap-2">
                          <!-- Cruceta transparente con sombra suave -->
                          <div class="pointer-events-auto grid grid-cols-3 grid-rows-3 w-24 h-24 sm:w-28 sm:h-28 select-none" aria-label="Cruceta direccional">
                            <div></div>
                            <button data-gba-btn="up" type="button" aria-label="Arriba" class="gba-btn-press gba-overlay-dpad text-white rounded-t-lg flex items-center justify-center text-xs sm:text-sm font-bold cursor-pointer">▲</button>
                            <div></div>
                            <button data-gba-btn="left" type="button" aria-label="Izquierda" class="gba-btn-press gba-overlay-dpad text-white rounded-l-lg flex items-center justify-center text-xs sm:text-sm font-bold cursor-pointer">◀</button>
                            <div class="gba-overlay-dpad flex items-center justify-center pointer-events-none">
                              <span class="w-2.5 h-2.5 rounded-full bg-white/30"></span>
                            </div>
                            <button data-gba-btn="right" type="button" aria-label="Derecha" class="gba-btn-press gba-overlay-dpad text-white rounded-r-lg flex items-center justify-center text-xs sm:text-sm font-bold cursor-pointer">▶</button>
                            <div></div>
                            <button data-gba-btn="down" type="button" aria-label="Abajo" class="gba-btn-press gba-overlay-dpad text-white rounded-b-lg flex items-center justify-center text-xs sm:text-sm font-bold cursor-pointer">▼</button>
                            <div></div>
                          </div>

                          <!-- Start y Select transparentes centrados abajo -->
                          <div class="pointer-events-auto flex items-center gap-1.5 sm:gap-2 mb-1">
                            <button data-gba-btn="select" type="button" class="gba-btn-press gba-overlay-pill px-2.5 py-1 rounded-full text-white font-pixel text-[9px] sm:text-[10px] tracking-wide cursor-pointer">SELECT</button>
                            <button data-gba-btn="start" type="button" class="gba-btn-press gba-overlay-pill px-2.5 py-1 rounded-full text-white font-pixel text-[9px] sm:text-[10px] tracking-wide cursor-pointer">START</button>
                          </div>

                          <!-- Botones B y A transparentes con sombra -->
                          <div class="pointer-events-auto flex items-center gap-2.5 sm:gap-3 mb-1">
                            <button data-gba-btn="b" type="button" aria-label="Botón B" class="gba-btn-press gba-overlay-ab w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white font-pixel text-sm sm:text-base translate-y-1.5 cursor-pointer">B</button>
                            <button data-gba-btn="a" type="button" aria-label="Botón A" class="gba-btn-press gba-overlay-ab w-11 h-11 sm:w-12 sm:h-12 rounded-full text-white font-pixel text-sm sm:text-base -translate-y-1.5 cursor-pointer">A</button>
                          </div>
                        </div>
                      `
                      : ''
                  }
                </div>

                <div class="mt-2 flex items-center justify-between text-[10px] font-pixel text-zinc-400 px-1">
                  <span>LCD RETRO 3:2</span>
                  <span>CODEBOY ADVANCE</span>
                </div>
              </div>
            </div>

            <!-- Controles de consola y visibilidad bajo el marco -->
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
              <div class="flex items-center gap-1.5">
                <span class="text-slate-500 dark:text-slate-400 font-medium">Carcasa:</span>
                <button data-shell="indigo" type="button" class="px-2.5 py-1 rounded-md cursor-pointer ${this.cartridge.player.shellColor === 'indigo' ? 'bg-indigo-600 text-white font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">Índigo</button>
                <button data-shell="arctic" type="button" class="px-2.5 py-1 rounded-md cursor-pointer ${this.cartridge.player.shellColor === 'arctic' ? 'bg-slate-800 text-white font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">Ártico</button>
                <button data-shell="spice" type="button" class="px-2.5 py-1 rounded-md cursor-pointer ${this.cartridge.player.shellColor === 'spice' ? 'bg-orange-600 text-white font-semibold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}">Naranja</button>
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <button id="btn-toggle-expand" type="button" class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  ${this.expandedScreen ? 'Vista dividida' : 'Ampliar pantalla'}
                </button>
                <button id="btn-toggle-overlay-controls" type="button" class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  ${this.showScreenControls ? 'Ocultar botones' : 'Mostrar botones'}
                </button>
                <button id="btn-toggle-audio" type="button" class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  ${this.cartridge.settings.muted ? 'Audio: Silencio' : 'Audio: Activo'}
                </button>
                <button id="btn-toggle-theme" type="button" class="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer whitespace-nowrap">
                  ${this.cartridge.settings.theme === 'dark' ? 'Modo Claro' : 'Modo Nocturno'}
                </button>
              </div>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 px-1">
              Teclado físico: Flechas mueven la cruceta · Z o Enter pulsa A · X pulsa B · Espacio pulsa Start.
            </p>
          </section>

          <!-- ZONA DERECHA: ESTACIÓN DE APRENDIZAJE, CÓDIGO Y MENÚS -->
          <section class="${this.expandedScreen ? 'lg:col-span-12' : 'lg:col-span-5'} bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm">
            ${this.renderRightPanel(summary)}
          </section>
        </main>

        <!-- Pie de página limpio -->
        <footer class="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mt-auto">
          <div class="max-w-[1360px] mx-auto px-4 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>CodeBoy Advance · Educación interactiva sin consumo de servidor</span>
            <span>Progreso guardado en este dispositivo y portable mediante cartucho JSON</span>
          </div>
        </footer>

        ${this.renderModal()}

        <!-- Notificación flotante -->
        <div id="cb-toast" class="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-sm font-medium shadow-lg transition-all duration-200 opacity-0 pointer-events-none translate-y-2"></div>
      </div>
    `;

    this.attachDomListeners();
    this.canvasEl = document.getElementById('gba-lcd') as HTMLCanvasElement | null;
    this.ctx = this.canvasEl ? this.canvasEl.getContext('2d') : null;
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = false;
    }
    this.drawCanvas();
  }

  private renderRightPanel(summary: { levelsDone: number; totalStars: number; bossCount: number }): string {
    if (this.screen === 'TITLE_MENU') {
      return `
        <div class="space-y-6">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Academia Retro · Español · Sin instalación</p>
            <h1 class="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white" style="text-wrap: balance;">
              Aprende a programar creando tus propios juegos GBA
            </h1>
            <p class="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Empieza ordenando bloques visuales, descubre cómo lucen en JavaScript real con ayuda del teclado táctil y cierra cada mundo programando un minijuego jugable en tu consola.
            </p>
          </div>

          <div class="grid grid-cols-3 gap-4 py-4 border-y border-slate-200 dark:border-slate-800">
            <div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Niveles</div>
              <div class="mt-1 text-xl font-bold tabular-nums text-slate-900 dark:text-white">${summary.levelsDone} / ${LEVELS.length}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Estrellas</div>
              <div class="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">${summary.totalStars}</div>
            </div>
            <div>
              <div class="text-xs text-slate-500 dark:text-slate-400">Juegos Jefe</div>
              <div class="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">${summary.bossCount} / 4</div>
            </div>
          </div>

          <div class="space-y-2">
            <label for="input-player-name" class="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              Nombre en tu cartucho
            </label>
            <div class="flex gap-2">
              <input
                id="input-player-name"
                type="text"
                maxlength="24"
                value="${escapeHtml(this.cartridge.player.name)}"
                class="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-2 focus:outline-sky-600"
                placeholder="Escribe tu nombre"
              />
              <button id="btn-save-name" type="button" class="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                Guardar
              </button>
            </div>
          </div>

          <div class="flex flex-wrap gap-3 pt-2">
            <button id="btn-start-adventure" type="button" class="px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold cursor-pointer whitespace-nowrap">
              Comenzar aventura
            </button>
            <button id="btn-load-other-device" type="button" class="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold cursor-pointer whitespace-nowrap">
              Cargar partida de otro dispositivo
            </button>
          </div>
        </div>
      `;
    }

    if (this.screen === 'WORLD_MAP') {
      const selectedWorld = WORLDS[this.selectedWorldIndex];
      const worldLevels = selectedWorld.levelIds.map((id) => getLevelById(id));
      const worldUnlocked = this.isWorldUnlocked(selectedWorld.id);

      return `
        <div class="space-y-5">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p class="text-xs text-slate-500 dark:text-slate-400">Ruta de aprendizaje · 4 Mundos</p>
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Selecciona un Mundo y Nivel</h2>
            </div>
            <label class="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input id="chk-teacher-unlock" type="checkbox" ${this.cartridge.settings.teacherUnlockAll ? 'checked' : ''} class="w-4 h-4 accent-sky-600 cursor-pointer" />
              <span>Modo Libre (desbloquear todo)</span>
            </label>
          </div>

          <!-- Pestañas de los 4 mundos -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${WORLDS.map((w, idx) => {
              const active = idx === this.selectedWorldIndex;
              const unlocked = this.isWorldUnlocked(w.id);
              return `
                <button data-select-world="${idx}" type="button" class="p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-sky-600 bg-sky-50 dark:bg-sky-950/50 text-slate-900 dark:text-white'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/70 text-slate-600 dark:text-slate-300'
                }">
                  <div class="text-xs font-bold">Mundo ${w.id}</div>
                  <div class="text-[11px] truncate">${unlocked ? w.theme : 'Bloqueado'}</div>
                </button>
              `;
            }).join('')}
          </div>

          <!-- Descripción del mundo activo -->
          <div class="pt-2 border-t border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">${escapeHtml(selectedWorld.title)}</h3>
              <span class="text-xs font-medium ${worldUnlocked ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}">
                ${worldUnlocked ? 'Disponible' : 'Bloqueado'}
              </span>
            </div>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">${escapeHtml(selectedWorld.description)}</p>
          </div>

          <!-- Lista de niveles del mundo -->
          <div class="space-y-2.5">
            ${worldLevels
              .map((lvl) => {
                const unlocked = this.isLevelUnlocked(lvl);
                const done = this.cartridge.progress.completedLevels[lvl.id];
                const kindText = lvl.kind === 'boss' ? 'Proyecto Jefe' : lvl.kind === 'lesson' ? 'Lección' : 'Reto';
                return `
                  <div class="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 ${unlocked ? 'bg-slate-50/70 dark:bg-slate-800/40' : 'opacity-60'}">
                    <div class="min-w-0">
                      <div class="text-xs text-slate-500 dark:text-slate-400">
                        ${kindText} · ${done ? `Completado (${done.stars}/3 estrellas)` : unlocked ? 'Pendiente' : 'Bloqueado'}
                      </div>
                      <div class="font-semibold text-sm text-slate-900 dark:text-white truncate">${escapeHtml(lvl.title)}</div>
                    </div>
                    <button
                      data-open-level="${lvl.id}"
                      type="button"
                      ${unlocked ? '' : 'disabled'}
                      class="px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                        unlocked
                          ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-sky-600 dark:hover:bg-sky-700 cursor-pointer'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                      }"
                    >
                      ${lvl.kind === 'boss' ? 'Crear juego' : 'Abrir'}
                    </button>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    if (this.screen === 'ARCADE_GALLERY') {
      const bossLevels = LEVELS.filter((l) => l.kind === 'boss' && l.bossGameId);
      return `
        <div class="space-y-5">
          <div>
            <p class="text-xs text-slate-500 dark:text-slate-400">Tus creaciones jugables · Galería Arcade</p>
            <h2 class="text-xl font-bold text-slate-900 dark:text-white">Aplicaciones y Juegos de Cierre</h2>
            <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Cada mundo termina con un proyecto propio. Puedes jugar aquí los cartuchos que ya desbloqueaste o editar su código.
            </p>
          </div>

          <div class="space-y-3">
            ${bossLevels
              .map((lvl) => {
                const bid = lvl.bossGameId!;
                const entry = this.cartridge.progress.bossProjects[bid];
                const canPlay = Boolean(entry?.unlocked) || this.cartridge.settings.teacherUnlockAll;
                const highScore = entry?.highScore ?? 0;

                return `
                  <div class="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div class="text-xs text-slate-500 dark:text-slate-400">
                        Mundo ${lvl.worldId} · Récord: <span class="tabular-nums font-semibold">${highScore}</span> pts
                      </div>
                      <div class="text-base font-bold text-slate-900 dark:text-white">${escapeHtml(lvl.title)}</div>
                      <p class="text-xs text-slate-600 dark:text-slate-300 mt-0.5">${escapeHtml(lvl.subtitle)}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        data-play-boss="${lvl.id}"
                        type="button"
                        ${canPlay ? '' : 'disabled'}
                        class="px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap ${
                          canPlay
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer'
                            : 'bg-slate-200 dark:bg-slate-800 text-slate-500 cursor-not-allowed'
                        }"
                      >
                        ${canPlay ? 'Jugar en GBA' : 'Bloqueado'}
                      </button>
                      <button
                        data-open-level="${lvl.id}"
                        type="button"
                        ${canPlay ? '' : 'disabled'}
                        class="px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-700 whitespace-nowrap ${
                          canPlay ? 'hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                        }"
                      >
                        Editar código
                      </button>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    }

    // PANTALLA DE LECCIÓN / RETO / PROYECTO JEFE (PLAYING)
    const lvl = this.currentLevel;
    const lvlIndex = LEVELS.findIndex((l) => l.id === lvl.id);
    const hasNext = lvlIndex >= 0 && lvlIndex < LEVELS.length - 1;
    const statusClass =
      this.statusType === 'success'
        ? 'text-emerald-700 dark:text-emerald-400'
        : this.statusType === 'error'
        ? 'text-rose-700 dark:text-rose-400'
        : this.statusType === 'running'
        ? 'text-sky-700 dark:text-sky-400'
        : 'text-slate-600 dark:text-slate-400';

    const linesCount = Math.max(4, this.codeText.split('\n').length);

    return `
      <div class="space-y-4">
        <!-- Cabecera de misión -->
        <div class="flex flex-wrap items-start justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div class="text-xs text-slate-500 dark:text-slate-400">
              ${escapeHtml(lvl.subtitle)} · ${this.levelWon ? 'Completado' : 'En curso'}
            </div>
            <h2 class="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">${escapeHtml(lvl.title)}</h2>
          </div>
          <button id="btn-back-map" type="button" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
            Volver a mundos
          </button>
        </div>

        <!-- Explicación breve y objetivo -->
        <div class="space-y-1.5">
          <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">${escapeHtml(lvl.explanation)}</p>
          <p class="text-xs font-semibold text-sky-700 dark:text-sky-400">Meta: ${escapeHtml(lvl.goalLabel)}</p>
        </div>

        <!-- Selector de Modo (Bloques / Mixto / Código JS) -->
        <div class="flex flex-wrap items-center justify-between gap-3">
          ${
            lvl.allowBlocks
              ? `
                <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <button data-mode="blocks" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${this.editorMode === 'blocks' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}">Bloques</button>
                  <button data-mode="split" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${this.editorMode === 'split' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}">Mixto</button>
                  <button data-mode="code" type="button" class="px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer whitespace-nowrap ${this.editorMode === 'code' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}">Código JS</button>
                </div>
              `
              : `<span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Editor JavaScript guiado + teclado táctil</span>`
          }

          <div class="flex items-center gap-2">
            <button id="btn-next-hint" type="button" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer whitespace-nowrap">
              ${this.activeHintIndex === 0 ? 'Ver pista' : `Otra pista (${this.activeHintIndex}/3)`}
            </button>
            ${
              this.editorMode !== 'blocks'
                ? `<button id="btn-toggle-kb" type="button" class="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap">
                    ${this.showTouchKeyboard ? 'Ocultar teclado' : 'Teclado táctil'}
                  </button>`
                : ''
            }
          </div>
        </div>

        ${
          this.activeHintIndex > 0
            ? `
              <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
                <span class="font-semibold">Pista ${this.activeHintIndex}:</span> ${escapeHtml(lvl.hints[this.activeHintIndex - 1])}
              </div>
            `
            : ''
        }

        <!-- Constructor de Bloques Visuales -->
        ${
          lvl.allowBlocks && (this.editorMode === 'blocks' || this.editorMode === 'split')
            ? `
              <div class="space-y-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <div class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Toca un bloque para añadirlo:</div>
                  <div class="flex flex-wrap gap-1.5">
                    ${lvl.blocks
                      .map((b) => {
                        const color =
                          b.kind === 'control'
                            ? 'bg-amber-600 hover:bg-amber-700 text-white'
                            : b.kind === 'logic'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-sky-600 hover:bg-sky-700 text-white';
                        return `<button data-add-block="${b.id}" type="button" class="${color} px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer whitespace-nowrap">+ ${escapeHtml(b.label)}</button>`;
                      })
                      .join('')}
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Secuencia actual (${this.blockSequence.length} bloques)</span>
                    <button id="btn-clear-blocks" type="button" class="text-xs text-rose-600 hover:underline cursor-pointer">Vaciar</button>
                  </div>
                  ${
                    this.blockSequence.length === 0
                      ? `<div class="text-xs text-slate-500 py-3 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">Aún no hay bloques. Toca cualquiera arriba para empezar.</div>`
                      : `
                        <div class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                          ${this.blockSequence
                            .map((inst, i) => {
                              const def = lvl.blocks.find((b) => b.id === inst.blockId);
                              if (!def) return '';
                              return `
                                <div class="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs">
                                  <span class="font-medium text-slate-800 dark:text-slate-100 truncate">
                                    <span class="tabular-nums text-slate-400 mr-1.5">${i + 1}.</span>${escapeHtml(def.label)}
                                  </span>
                                  <div class="flex items-center gap-1 shrink-0">
                                    ${
                                      def.hasArg
                                        ? `
                                          <button data-arg-delta="-1" data-uid="${inst.uid}" type="button" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">-</button>
                                          <span class="px-1.5 font-code tabular-nums font-semibold">${inst.arg ?? def.defaultArg ?? 1}</span>
                                          <button data-arg-delta="1" data-uid="${inst.uid}" type="button" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 font-bold cursor-pointer">+</button>
                                        `
                                        : ''
                                    }
                                    <button data-move-block="-1" data-uid="${inst.uid}" type="button" title="Subir" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 cursor-pointer">↑</button>
                                    <button data-move-block="1" data-uid="${inst.uid}" type="button" title="Bajar" class="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 cursor-pointer">↓</button>
                                    <button data-del-block="${inst.uid}" type="button" title="Quitar" class="w-6 h-6 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 font-bold cursor-pointer">×</button>
                                  </div>
                                </div>
                              `;
                            })
                            .join('')}
                        </div>
                      `
                  }
                </div>
              </div>
            `
            : ''
        }

        <!-- Editor JavaScript (Editable en modo Code/Split, o lectura en Mixto) -->
        ${
          this.editorMode === 'code' || this.editorMode === 'split'
            ? `
              <div class="rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-950 text-slate-100">
                <div class="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-code text-slate-400">
                  <span>JavaScript · ${this.editorMode === 'split' ? 'Sincronizado (editable)' : 'Editor libre'}</span>
                  <span class="tabular-nums">${linesCount} líneas</span>
                </div>
                <div class="flex">
                  <div class="py-3 px-2.5 text-right select-none font-code text-xs leading-6 text-slate-500 bg-slate-900/60 border-r border-slate-800 tabular-nums" aria-hidden="true">
                    ${Array.from({ length: linesCount }, (_, i) => `<div>${i + 1}</div>`).join('')}
                  </div>
                  <textarea
                    id="js-code-editor"
                    spellcheck="false"
                    rows="${Math.min(13, Math.max(6, linesCount))}"
                    class="w-full p-3 bg-transparent text-slate-100 font-code text-xs sm:text-sm leading-6 focus:outline-none resize-y"
                  >${escapeHtml(this.codeText)}</textarea>
                </div>
              </div>
            `
            : ''
        }

        <!-- Teclado Táctil de Programación -->
        ${
          this.editorMode !== 'blocks' && this.showTouchKeyboard
            ? `
              <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Teclado táctil de código</span>
                  <div class="flex items-center gap-1 p-0.5 bg-slate-200/70 dark:bg-slate-900 rounded-md">
                    <button data-kb-tab="commands" type="button" class="px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${this.keyboardTab === 'commands' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}">Comandos</button>
                    <button data-kb-tab="symbols" type="button" class="px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${this.keyboardTab === 'symbols' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}">Símbolos</button>
                    <button data-kb-tab="logic" type="button" class="px-2.5 py-1 text-[11px] font-semibold rounded cursor-pointer ${this.keyboardTab === 'logic' ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}">Lógica</button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  ${getTouchKeys(this.keyboardTab)
                    .map(
                      (k, idx) => `
                        <button
                          data-kb-insert-idx="${idx}"
                          type="button"
                          title="${escapeHtml(k.title)}"
                          class="min-h-[40px] px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-sky-500 text-xs font-code font-medium text-slate-800 dark:text-slate-100 cursor-pointer shadow-2xs active:scale-95 transition-transform"
                        >${escapeHtml(k.label)}</button>
                      `
                    )
                    .join('')}
                </div>
              </div>
            `
            : ''
        }

        <!-- Barra de ejecución y diagnóstico -->
        <div class="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div class="flex flex-wrap items-center gap-2.5">
            <button id="btn-run-code" type="button" class="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold cursor-pointer whitespace-nowrap">
              ${lvl.kind === 'boss' ? 'Ejecutar y Jugar' : 'Ejecutar código'}
            </button>
            <button id="btn-reset-level" type="button" class="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium cursor-pointer whitespace-nowrap">
              Reiniciar
            </button>
            ${
              this.levelWon && hasNext
                ? `<button id="btn-next-level" type="button" class="ml-auto px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold cursor-pointer whitespace-nowrap">Siguiente reto →</button>`
                : ''
            }
          </div>

          <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
            <div id="cb-status-label" class="font-bold uppercase tracking-wide ${statusClass}">${escapeHtml(this.statusText)}</div>
            <div id="cb-feedback-text" class="text-slate-700 dark:text-slate-300">
              ${escapeHtml(this.feedbackMessage || 'Presiona «Ejecutar código» o el botón [A] de la consola para probar tu solución.')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderModal(): string {
    if (this.activeModal === 'none') return '';

    if (this.activeModal === 'cpanel') {
      return `
        <div class="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Guía de despliegue cPanel">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">Despliegue Ligero con Git en cPanel</h3>
              <button id="btn-close-modal" type="button" class="px-3 py-1 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Cerrar</button>
            </div>
            <div class="space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              <p>Este juego está compilado a archivos estáticos puros sin base de datos ni procesos Node.js activos en producción, cuidando al máximo el medidor de <strong>Uso de Recursos</strong> de tu hosting compartido.</p>

              <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <div class="text-xs font-bold text-slate-900 dark:text-white">Descargas listas para GitHub y cPanel</div>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <a href="./descargas/codeboy-advance-github-cpanel.zip" download="codeboy-advance-github-cpanel.zip" class="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold text-center whitespace-nowrap">
                    Paquete GitHub (.zip)
                  </a>
                  <a href="./descargas/GUIA_DESPLIEGUE_GITHUB_CPANEL.md" download="GUIA_DESPLIEGUE_GITHUB_CPANEL.md" class="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 text-white text-xs font-semibold text-center whitespace-nowrap">
                    Guía Técnica (.md)
                  </a>
                  <a href="./descargas/GUIA_PASO_A_PASO_CPANEL.pdf" download="GUIA_PASO_A_PASO_CPANEL.pdf" class="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold text-center whitespace-nowrap">
                    Manual Fácil (.pdf)
                  </a>
                </div>
              </div>

              <ol class="list-decimal pl-5 space-y-2 text-xs sm:text-sm">
                <li><strong>Descarga y descomprime el paquete ZIP:</strong> ya incluye la carpeta compilada <code class="font-code text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">dist/</code> con <code class="font-code text-xs">.htaccess</code>, el código fuente y ambos manuales.</li>
                <li><strong>Edita <code class="font-code text-xs">.cpanel.yml</code>:</strong> apunta <code class="font-code text-xs">DEPLOYPATH</code> a un subdominio limpio (ej. <code class="font-code text-xs">/home/usuario/arcade.tudominio.com/</code>) para aislarlo de WordPress.</li>
                <li><strong>Sube a GitHub y conecta en cPanel:</strong> en <em>Git™ Version Control → Manage → Pull or Deploy</em>, pulsa <em>Update from Remote</em> y luego <em>Deploy HEAD Commit</em>.</li>
                <li><strong>Caché instantánea:</strong> el archivo <code class="font-code text-xs">.htaccess</code> evita que LiteSpeed muestre versiones antiguas de <code class="font-code text-xs">index.html</code>.</li>
              </ol>
            </div>
          </div>
        </div>
      `;
    }

    // Modal de Cartucho JSON (Exportar / WhatsApp / Correo / Cargar en otro dispositivo)
    const links = buildShareLinks(this.cartridge);
    const summary = getCartridgeSummary(this.cartridge);

    return `
      <div class="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Cartucho de Guardado JSON">
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white">Mi Cartucho de Guardado (.json)</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">${escapeHtml(this.cartridge.player.name)} · ${summary.levelsDone} niveles · ${summary.totalStars} estrellas</p>
            </div>
            <button id="btn-close-modal" type="button" class="px-3 py-1 rounded-lg text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">Cerrar</button>
          </div>

          <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button data-cart-tab="share" type="button" class="flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer ${this.cartridgeTab === 'share' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}">Guardar y Compartir</button>
            <button data-cart-tab="load" type="button" class="flex-1 py-2 text-xs font-semibold rounded-md cursor-pointer ${this.cartridgeTab === 'load' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-300'}">Cargar en este dispositivo</button>
          </div>

          ${
            this.cartridgeTab === 'share'
              ? `
                <div class="space-y-4 text-sm">
                  <p class="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">
                    Descarga tu partida como archivo <strong>.json</strong> o envíala por <strong>WhatsApp</strong> o <strong>Correo electrónico</strong> para continuarla en otro teléfono, tableta o computadora.
                  </p>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button id="btn-download-json" type="button" class="px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer">
                      Descargar archivo .json
                    </button>
                    <button id="btn-copy-code" type="button" class="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer">
                      Copiar código de partida
                    </button>
                  </div>

                  <div class="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div class="text-xs font-semibold text-slate-700 dark:text-slate-300">Enviar directamente:</div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <a
                        id="link-share-whatsapp"
                        href="${escapeHtml(links.whatsappHref)}"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex items-center justify-center px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold text-center"
                      >
                        Enviar por WhatsApp
                      </a>
                      <a
                        id="link-share-email"
                        href="${escapeHtml(links.emailHref)}"
                        class="flex items-center justify-center px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white text-white text-xs font-semibold text-center"
                      >
                        Enviar por Correo
                      </a>
                    </div>
                    <p class="text-[11px] text-slate-500 dark:text-slate-400">
                      En celulares compatibles se adjuntará el archivo <strong>.json</strong> automáticamente; en PC se descarga el archivo y se incluye el código compacto en el mensaje.
                    </p>
                  </div>
                </div>
              `
              : `
                <div class="space-y-4 text-sm">
                  <div>
                    <label for="input-json-file" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      1. Selecciona tu archivo .json guardado:
                    </label>
                    <input
                      id="input-json-file"
                      type="file"
                      accept=".json,application/json"
                      class="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label for="input-paste-code" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      2. O pega el código recibido por WhatsApp / Correo (o contenido JSON):
                    </label>
                    <textarea
                      id="input-paste-code"
                      rows="4"
                      placeholder="Pega aquí el mensaje con CB1:... o el texto del archivo .json"
                      class="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-code text-xs focus:outline-2 focus:outline-sky-600"
                    ></textarea>
                    <button id="btn-validate-paste" type="button" class="mt-2 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer">
                      Verificar código pegado
                    </button>
                  </div>

                  ${
                    this.importError
                      ? `<div class="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">${escapeHtml(this.importError)}</div>`
                      : ''
                  }

                  ${
                    this.pendingImportCartridge
                      ? (() => {
                          const s = getCartridgeSummary(this.pendingImportCartridge);
                          return `
                            <div class="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-2">
                              <div class="text-xs font-bold text-emerald-800 dark:text-emerald-300">Partida válida lista para cargar</div>
                              <div class="text-xs text-slate-700 dark:text-slate-200">
                                Jugador: <strong>${escapeHtml(this.pendingImportCartridge.player.name)}</strong> · ${s.levelsDone} niveles · ${s.totalStars} estrellas · ${s.bossCount} juegos jefe
                              </div>
                              <button id="btn-confirm-import" type="button" class="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer">
                                Confirmar y cargar esta partida
                              </button>
                            </div>
                          `;
                        })()
                      : ''
                  }

                  <div class="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <span class="text-xs text-slate-500">¿Empezar desde cero?</span>
                    <button id="btn-reset-all-progress" type="button" class="text-xs text-rose-600 hover:underline font-medium cursor-pointer">Reiniciar progreso local</button>
                  </div>
                </div>
              `
          }
        </div>
      </div>
    `;
  }

  private attachDomListeners(): void {
    // Navegación superior y móvil
    document.getElementById('nav-brand')?.addEventListener('click', () => {
      this.bossActive = false;
      this.screen = 'TITLE_MENU';
      this.render();
    });
    document.getElementById('nav-home')?.addEventListener('click', () => {
      this.bossActive = false;
      this.screen = 'TITLE_MENU';
      this.render();
    });
    document.getElementById('nav-worlds')?.addEventListener('click', () => {
      this.bossActive = false;
      this.screen = 'WORLD_MAP';
      this.render();
    });
    document.getElementById('nav-arcade')?.addEventListener('click', () => {
      this.bossActive = false;
      this.screen = 'ARCADE_GALLERY';
      this.render();
    });
    document.getElementById('nav-cpanel')?.addEventListener('click', () => {
      this.activeModal = 'cpanel';
      this.render();
    });
    document.getElementById('mob-nav-cpanel')?.addEventListener('click', () => {
      this.activeModal = 'cpanel';
      this.render();
    });
    document.getElementById('btn-open-cartridge')?.addEventListener('click', () => {
      this.activeModal = 'cartridge';
      this.cartridgeTab = 'share';
      this.pendingImportCartridge = null;
      this.importError = '';
      this.render();
    });

    document.querySelectorAll('[data-mobile-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        const target = el.getAttribute('data-mobile-nav') as GameScreen;
        this.bossActive = false;
        this.screen = target;
        this.render();
      });
    });

    // Botones físicos GBA
    document.querySelectorAll('[data-gba-btn]').forEach((el) => {
      el.addEventListener('click', () => {
        const btn = el.getAttribute('data-gba-btn') as GbaButton;
        this.handleGbaButton(btn);
      });
    });

    // Selector de carcasa, audio y tema
    document.querySelectorAll('[data-shell]').forEach((el) => {
      el.addEventListener('click', () => {
        const color = el.getAttribute('data-shell') as ShellColor;
        this.cartridge.player.shellColor = color;
        this.persistCartridge();
        retroAudio.blockSnap();
        this.render();
      });
    });

    document.getElementById('btn-toggle-expand')?.addEventListener('click', () => {
      this.expandedScreen = !this.expandedScreen;
      retroAudio.dpadTick();
      this.render();
    });

    document.getElementById('btn-toggle-overlay-controls')?.addEventListener('click', () => {
      this.showScreenControls = !this.showScreenControls;
      retroAudio.dpadTick();
      this.render();
    });

    document.getElementById('btn-toggle-audio')?.addEventListener('click', () => {
      this.cartridge.settings.muted = !this.cartridge.settings.muted;
      retroAudio.muted = this.cartridge.settings.muted;
      this.persistCartridge();
      if (!retroAudio.muted) retroAudio.buttonA();
      this.render();
    });

    document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
      this.cartridge.settings.theme = this.cartridge.settings.theme === 'dark' ? 'light' : 'dark';
      this.applyThemeClass();
      this.persistCartridge();
      this.render();
    });

    // Pantalla de Título
    document.getElementById('btn-save-name')?.addEventListener('click', () => {
      const inp = document.getElementById('input-player-name') as HTMLInputElement | null;
      if (inp) {
        this.cartridge.player.name = inp.value.trim().slice(0, 24) || 'Jugador';
        this.persistCartridge();
        retroAudio.buttonA();
        this.showToast(`Cartucho guardado para ${this.cartridge.player.name}`);
        this.render();
      }
    });
    document.getElementById('btn-start-adventure')?.addEventListener('click', () => {
      const inp = document.getElementById('input-player-name') as HTMLInputElement | null;
      if (inp && inp.value.trim()) {
        this.cartridge.player.name = inp.value.trim().slice(0, 24);
        this.persistCartridge();
      }
      retroAudio.bootChime();
      this.screen = 'WORLD_MAP';
      this.render();
    });
    document.getElementById('btn-load-other-device')?.addEventListener('click', () => {
      this.activeModal = 'cartridge';
      this.cartridgeTab = 'load';
      this.pendingImportCartridge = null;
      this.importError = '';
      this.render();
    });

    // Mapa de Mundos
    document.getElementById('chk-teacher-unlock')?.addEventListener('change', (ev) => {
      const checked = (ev.target as HTMLInputElement).checked;
      this.cartridge.settings.teacherUnlockAll = checked;
      this.persistCartridge();
      this.render();
    });

    document.querySelectorAll('[data-select-world]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedWorldIndex = Number(el.getAttribute('data-select-world'));
        retroAudio.dpadTick();
        this.render();
      });
    });

    document.querySelectorAll('[data-open-level]').forEach((el) => {
      el.addEventListener('click', () => {
        const lid = el.getAttribute('data-open-level');
        if (!lid) return;
        retroAudio.buttonA();
        this.loadLevelState(getLevelById(lid));
        this.screen = 'PLAYING';
        this.render();
      });
    });

    document.querySelectorAll('[data-play-boss]').forEach((el) => {
      el.addEventListener('click', () => {
        const lid = el.getAttribute('data-play-boss');
        if (!lid) return;
        const lvl = getLevelById(lid);
        this.loadLevelState(lvl);
        this.screen = 'PLAYING';
        this.executeCurrentProgram();
      });
    });

    // Controles dentro de PLAYING
    document.getElementById('btn-back-map')?.addEventListener('click', () => {
      this.stopTimers();
      this.bossActive = false;
      this.screen = 'WORLD_MAP';
      this.render();
    });

    document.querySelectorAll('[data-mode]').forEach((el) => {
      el.addEventListener('click', () => {
        const mode = el.getAttribute('data-mode') as EditorMode;
        this.editorMode = mode;
        if (mode !== 'blocks') this.showTouchKeyboard = true;
        retroAudio.dpadTick();
        this.render();
      });
    });

    document.getElementById('btn-next-hint')?.addEventListener('click', () => {
      this.activeHintIndex = (this.activeHintIndex % 3) + 1;
      retroAudio.dpadTick();
      this.render();
    });

    document.getElementById('btn-toggle-kb')?.addEventListener('click', () => {
      this.showTouchKeyboard = !this.showTouchKeyboard;
      this.render();
    });

    // Bloques visuales
    document.querySelectorAll('[data-add-block]').forEach((el) => {
      el.addEventListener('click', () => {
        const bid = el.getAttribute('data-add-block');
        const def = this.currentLevel.blocks.find((b) => b.id === bid);
        if (!def) return;
        this.blockSequence.push({
          uid: `blk_${this.uidCounter++}`,
          blockId: def.id,
          arg: def.defaultArg,
        });
        this.syncBlocksToCode();
        retroAudio.blockSnap();
        this.render();
      });
    });

    document.getElementById('btn-clear-blocks')?.addEventListener('click', () => {
      this.blockSequence = [];
      this.syncBlocksToCode();
      retroAudio.buttonB();
      this.render();
    });

    document.querySelectorAll('[data-del-block]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.getAttribute('data-del-block');
        this.blockSequence = this.blockSequence.filter((b) => b.uid !== uid);
        this.syncBlocksToCode();
        retroAudio.buttonB();
        this.render();
      });
    });

    document.querySelectorAll('[data-move-block]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.getAttribute('data-uid');
        const delta = Number(el.getAttribute('data-move-block'));
        const idx = this.blockSequence.findIndex((b) => b.uid === uid);
        const nextIdx = idx + delta;
        if (idx < 0 || nextIdx < 0 || nextIdx >= this.blockSequence.length) return;
        const copy = [...this.blockSequence];
        const [item] = copy.splice(idx, 1);
        copy.splice(nextIdx, 0, item);
        this.blockSequence = copy;
        this.syncBlocksToCode();
        retroAudio.dpadTick();
        this.render();
      });
    });

    document.querySelectorAll('[data-arg-delta]').forEach((el) => {
      el.addEventListener('click', () => {
        const uid = el.getAttribute('data-uid');
        const delta = Number(el.getAttribute('data-arg-delta'));
        const inst = this.blockSequence.find((b) => b.uid === uid);
        const def = inst ? this.currentLevel.blocks.find((b) => b.id === inst.blockId) : null;
        if (!inst || !def) return;
        const min = def.minArg ?? 1;
        const max = def.maxArg ?? 9;
        inst.arg = Math.max(min, Math.min(max, (inst.arg ?? def.defaultArg ?? 1) + delta));
        this.syncBlocksToCode();
        retroAudio.dpadTick();
        this.render();
      });
    });

    // Editor JS
    const editor = document.getElementById('js-code-editor') as HTMLTextAreaElement | null;
    editor?.addEventListener('input', () => {
      this.codeText = editor.value;
    });

    // Teclado Táctil
    document.querySelectorAll('[data-kb-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.keyboardTab = el.getAttribute('data-kb-tab') as KeyboardTab;
        retroAudio.dpadTick();
        this.render();
      });
    });

    document.querySelectorAll('[data-kb-insert-idx]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = Number(el.getAttribute('data-kb-insert-idx'));
        const keys = getTouchKeys(this.keyboardTab);
        const item = keys[idx];
        const ta = document.getElementById('js-code-editor') as HTMLTextAreaElement | null;
        if (!item || !ta) return;
        this.codeText = insertTokenAtCursor(ta, item.insert);
        retroAudio.dpadTick();
      });
    });

    // Ejecución
    document.getElementById('btn-run-code')?.addEventListener('click', () => {
      this.executeCurrentProgram();
    });

    document.getElementById('btn-reset-level')?.addEventListener('click', () => {
      retroAudio.buttonB();
      this.loadLevelState(this.currentLevel);
      this.render();
    });

    document.getElementById('btn-next-level')?.addEventListener('click', () => {
      retroAudio.buttonA();
      this.navigateSiblingLevel(1);
    });

    // Modales
    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
      this.activeModal = 'none';
      this.render();
    });

    document.querySelectorAll('[data-cart-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        this.cartridgeTab = el.getAttribute('data-cart-tab') as 'share' | 'load';
        this.importError = '';
        this.render();
      });
    });

    document.getElementById('btn-download-json')?.addEventListener('click', () => {
      const filename = downloadCartridgeJson(this.cartridge);
      retroAudio.pickup();
      this.showToast(`Archivo descargado: ${filename}`);
    });

    document.getElementById('btn-copy-code')?.addEventListener('click', async () => {
      const { shareCode } = buildShareLinks(this.cartridge);
      try {
        await navigator.clipboard.writeText(shareCode);
        retroAudio.pickup();
        this.showToast('Código de cartucho copiado al portapapeles.');
      } catch {
        this.showToast('No se pudo copiar automáticamente; usa Enviar por WhatsApp o Descargar.');
      }
    });

    // Enlaces WhatsApp y Correo con soporte nativo de adjunto .json en móvil + descarga en PC
    const handleHybridShare = async (ev: Event) => {
      const file = createCartridgeFile(this.cartridge);
      if (canNativeShareFile(file)) {
        ev.preventDefault();
        try {
          await navigator.share({
            title: `Partida CodeBoy Advance - ${this.cartridge.player.name}`,
            text: 'Aquí tienes mi archivo de partida .json de CodeBoy Advance.',
            files: [file],
          });
          this.showToast('Partida compartida con éxito.');
        } catch {
          // Si canceló o falló, no bloquear
        }
      } else {
        // En escritorio descargamos también el .json para que lo tenga a mano al abrir WhatsApp Web / Correo
        downloadCartridgeJson(this.cartridge);
        this.showToast('Archivo .json descargado. El mensaje también incluye tu código de respaldo.');
      }
    };

    document.getElementById('link-share-whatsapp')?.addEventListener('click', handleHybridShare);
    document.getElementById('link-share-email')?.addEventListener('click', handleHybridShare);

    // Importación desde archivo .json
    document.getElementById('input-json-file')?.addEventListener('change', (ev) => {
      const input = ev.target as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        const decoded = decodeCartridgeInput(text);
        if (!decoded) {
          this.pendingImportCartridge = null;
          this.importError = 'El archivo seleccionado no corresponde a una partida válida de CodeBoy Advance.';
          retroAudio.error();
        } else {
          this.pendingImportCartridge = decoded;
          this.importError = '';
          retroAudio.pickup();
        }
        this.render();
      };
      reader.readAsText(file);
    });

    // Importación desde texto / código CB1 pegado
    document.getElementById('btn-validate-paste')?.addEventListener('click', () => {
      const ta = document.getElementById('input-paste-code') as HTMLTextAreaElement | null;
      const raw = ta?.value || '';
      const decoded = decodeCartridgeInput(raw);
      if (!decoded) {
        this.pendingImportCartridge = null;
        this.importError = 'No pudimos reconocer un código CB1 o archivo JSON válido. Verifica que lo hayas copiado completo.';
        retroAudio.error();
      } else {
        this.pendingImportCartridge = decoded;
        this.importError = '';
        retroAudio.pickup();
      }
      this.render();
    });

    document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
      if (!this.pendingImportCartridge) return;
      this.cartridge = this.pendingImportCartridge;
      retroAudio.muted = this.cartridge.settings.muted;
      this.applyThemeClass();
      this.persistCartridge();
      this.pendingImportCartridge = null;
      this.activeModal = 'none';
      this.screen = 'WORLD_MAP';
      retroAudio.victory();
      this.showToast(`Partida de ${this.cartridge.player.name} cargada correctamente.`);
      this.render();
    });

    document.getElementById('btn-reset-all-progress')?.addEventListener('click', () => {
      this.cartridge = createDefaultCartridge(this.cartridge.player.name);
      this.persistCartridge();
      this.pendingImportCartridge = null;
      this.activeModal = 'none';
      this.screen = 'TITLE_MENU';
      this.loadLevelState(LEVELS[0]);
      this.showToast('Progreso local reiniciado.');
      this.render();
    });
  }
}

const mountEl = document.getElementById('app');
if (mountEl) {
  new CodeBoyApp(mountEl);
}
