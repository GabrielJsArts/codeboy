import type { SaveCartridgeV1, ShellColor } from './types';

const STORAGE_KEY = 'codeboy_advance_save_v1';

export function createDefaultCartridge(name = 'Jugador'): SaveCartridgeV1 {
  return {
    app: 'codeboy-advance',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    player: {
      name,
      shellColor: 'indigo',
    },
    settings: {
      muted: false,
      theme: 'light',
      teacherUnlockAll: false,
    },
    progress: {
      completedLevels: {},
      bossProjects: {},
    },
  };
}

export function loadLocalCartridge(): SaveCartridgeV1 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultCartridge();
    const parsed = JSON.parse(raw) as unknown;
    const validated = validateCartridgeObject(parsed);
    return validated || createDefaultCartridge();
  } catch {
    return createDefaultCartridge();
  }
}

export function saveLocalCartridge(data: SaveCartridgeV1): void {
  try {
    const payload: SaveCartridgeV1 = {
      ...data,
      exportedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignorar errores de cuota si el almacenamiento está restringido
  }
}

export function validateCartridgeObject(input: unknown): SaveCartridgeV1 | null {
  if (!input || typeof input !== 'object') return null;
  const obj = input as Partial<SaveCartridgeV1>;
  if (obj.app !== 'codeboy-advance' || obj.schemaVersion !== 1) return null;
  if (!obj.player || typeof obj.player.name !== 'string') return null;
  if (!obj.progress || typeof obj.progress !== 'object') return null;

  const validShells: ShellColor[] = ['indigo', 'arctic', 'spice'];
  const shellColor = validShells.includes(obj.player.shellColor as ShellColor)
    ? (obj.player.shellColor as ShellColor)
    : 'indigo';

  return {
    app: 'codeboy-advance',
    schemaVersion: 1,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    player: {
      name: obj.player.name.trim().slice(0, 24) || 'Jugador',
      shellColor,
    },
    settings: {
      muted: Boolean(obj.settings?.muted),
      theme: obj.settings?.theme === 'dark' ? 'dark' : 'light',
      teacherUnlockAll: Boolean(obj.settings?.teacherUnlockAll),
    },
    progress: {
      completedLevels: obj.progress.completedLevels && typeof obj.progress.completedLevels === 'object'
        ? obj.progress.completedLevels
        : {},
      bossProjects: obj.progress.bossProjects && typeof obj.progress.bossProjects === 'object'
        ? obj.progress.bossProjects
        : {},
    },
  };
}

// Codificación compacta UTF-8 segura en Base64 para compartir por WhatsApp o Correo sin perder caracteres
export function encodeShareCode(data: SaveCartridgeV1): string {
  const payload = JSON.stringify({
    ...data,
    exportedAt: new Date().toISOString(),
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'CB1:' + btoa(binary);
}

export function decodeCartridgeInput(rawInput: string): SaveCartridgeV1 | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  try {
    if (trimmed.startsWith('CB1:')) {
      const b64 = trimmed.slice(4).replace(/\s+/g, '');
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      return validateCartridgeObject(JSON.parse(jsonStr));
    }

    // Extraer si el usuario pegó todo un mensaje de WhatsApp que incluye CB1:...
    const match = trimmed.match(/CB1:[A-Za-z0-9+/=]+/);
    if (match) {
      return decodeCartridgeInput(match[0]);
    }

    return validateCartridgeObject(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function buildCartridgeFilename(playerName: string): string {
  const slug = playerName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'jugador';
  return `cartucho-codeboy-${slug}.json`;
}

export function createCartridgeFile(data: SaveCartridgeV1): File {
  const payload = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
  const filename = buildCartridgeFilename(data.player.name);
  return new File([payload], filename, { type: 'application/json' });
}

export function downloadCartridgeJson(data: SaveCartridgeV1): string {
  const filename = buildCartridgeFilename(data.player.name);
  const payload = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

export function getCartridgeSummary(data: SaveCartridgeV1): { levelsDone: number; totalStars: number; bossCount: number } {
  const entries = Object.values(data.progress.completedLevels);
  const levelsDone = entries.length;
  const totalStars = entries.reduce((acc, item) => acc + (item.stars || 0), 0);
  const bossCount = Object.values(data.progress.bossProjects).filter((b) => b.unlocked).length;
  return { levelsDone, totalStars, bossCount };
}

export function buildShareLinks(data: SaveCartridgeV1): {
  whatsappHref: string;
  emailHref: string;
  shareCode: string;
  summaryText: string;
} {
  const shareCode = encodeShareCode(data);
  const { levelsDone, totalStars } = getCartridgeSummary(data);
  const summaryText = `Cartucho CodeBoy Advance de ${data.player.name} (${levelsDone} niveles, ${totalStars} estrellas). Copia todo este código o adjunta el archivo .json para cargar la partida en otro dispositivo:\n\n${shareCode}`;

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(summaryText)}`;
  const subject = `Partida CodeBoy Advance - ${data.player.name}`;
  const emailHref = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(summaryText)}`;

  return { whatsappHref, emailHref, shareCode, summaryText };
}

export function canNativeShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}
