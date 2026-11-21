import type { BlockOption, LevelDef, WorldDef } from './types';

export const WORLDS: WorldDef[] = [
  {
    id: 1,
    title: 'Mundo 1: Pueblo Pixel',
    theme: 'Secuencias y Coordenadas',
    description: 'Da tus primeros pasos ordenando instrucciones y crea el minijuego Atrapa la Estrella.',
    accentColor: '#0284C7',
    levelIds: ['1-1', '1-2', '1-3', '1-boss'],
  },
  {
    id: 2,
    title: 'Mundo 2: Bosque Lógico',
    theme: 'Variables y Decisiones if/else',
    description: 'Guarda datos en memoria, esquiva obstáculos con lógica y cuida a tu Mascota Byte.',
    accentColor: '#10B981',
    levelIds: ['2-1', '2-2', '2-3', '2-boss'],
  },
  {
    id: 3,
    title: 'Mundo 3: Fábrica de Sprites',
    theme: 'Bucles for y Patrones',
    description: 'Automatiza tareas repetitivas con bucles y programa una Lluvia de Meteoritos.',
    accentColor: '#F59E0B',
    levelIds: ['3-1', '3-2', '3-3', '3-boss'],
  },
  {
    id: 4,
    title: 'Mundo 4: Castillo Arcade',
    theme: 'Funciones, Eventos y Colisiones',
    description: 'Crea tus propios comandos y construye el juego final Defensor Espacial GBA.',
    accentColor: '#E11D48',
    levelIds: ['4-1', '4-2', '4-3', '4-boss'],
  },
];

const BLOCKS_WORLD_1: BlockOption[] = [
  { id: 'right', label: 'Mover derecha', code: 'moverDerecha();', kind: 'action' },
  { id: 'left', label: 'Mover izquierda', code: 'moverIzquierda();', kind: 'action' },
  { id: 'up', label: 'Mover arriba', code: 'moverArriba();', kind: 'action' },
  { id: 'down', label: 'Mover abajo', code: 'moverAbajo();', kind: 'action' },
  { id: 'pickup', label: 'Recoger objeto', code: 'recoger();', kind: 'action' },
];

const BLOCKS_WORLD_2: BlockOption[] = [
  ...BLOCKS_WORLD_1,
  { id: 'if_stone', label: 'Si hay piedra saltar, si no avanzar', code: 'if (hayPiedra()) {\n  saltar();\n} else {\n  avanzar();\n}', kind: 'logic' },
  { id: 'open_chest', label: 'Abrir cofre', code: 'abrirCofre();', kind: 'action' },
];

const BLOCKS_WORLD_3: BlockOption[] = [
  ...BLOCKS_WORLD_1,
  {
    id: 'repeat_right_pickup',
    label: 'Repetir mover derecha + recoger',
    code: 'for (let i = 0; i < {N}; i++) {\n  moverDerecha();\n  recoger();\n}',
    kind: 'control',
    hasArg: true,
    defaultArg: 4,
    minArg: 1,
    maxArg: 8,
    argLabel: 'Veces',
  },
  {
    id: 'repeat_stairs',
    label: 'Repetir subir escalera (derecha + arriba + recoger)',
    code: 'for (let i = 0; i < {N}; i++) {\n  moverDerecha();\n  moverArriba();\n  recoger();\n}',
    kind: 'control',
    hasArg: true,
    defaultArg: 4,
    minArg: 1,
    maxArg: 6,
    argLabel: 'Escalones',
  },
];

const BLOCKS_WORLD_4: BlockOption[] = [
  ...BLOCKS_WORLD_1,
  { id: 'shoot', label: 'Disparar rayo láser', code: 'dispararRayo();', kind: 'action' },
  {
    id: 'clear_loop',
    label: 'Repetir: si hay enemigo disparar + avanzar',
    code: 'for (let i = 0; i < {N}; i++) {\n  if (hayEnemigo()) {\n    dispararRayo();\n  }\n  moverDerecha();\n}',
    kind: 'logic',
    hasArg: true,
    defaultArg: 5,
    minArg: 1,
    maxArg: 7,
    argLabel: 'Pasos',
  },
];

export const LEVELS: LevelDef[] = [
  // MUNDO 1
  {
    id: '1-1',
    worldId: 1,
    order: 1,
    kind: 'lesson',
    title: '¿Qué es un algoritmo?',
    subtitle: 'Lección 1.1 · Orden de instrucciones',
    explanation:
      'Un algoritmo es una lista ordenada de pasos. Enciende el camino de PixelBot usando bloques o código para caminar a la derecha y recoger la estrella.',
    goalLabel: 'Recoge la estrella dorada (1/1)',
    defaultMode: 'blocks',
    allowBlocks: true,
    recommendedMaxSteps: 5,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [{ x: 4, y: 2, type: 'star' }],
    blocks: BLOCKS_WORLD_1,
    starterBlocks: [
      { blockId: 'right' },
      { blockId: 'right' },
      { blockId: 'right' },
      { blockId: 'pickup' },
    ],
    starterCode: 'moverDerecha();\nmoverDerecha();\nmoverDerecha();\nrecoger();',
    hints: [
      'PixelBot está a 3 casillas a la izquierda de la estrella.',
      'Necesitas tres bloques moverDerecha() seguidos y al final recoger().',
      'Comprueba que el bloque recoger() esté al final de tu secuencia.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tus instrucciones.', stars: 0 };
      if (res.collected >= 1) {
        return { won: true, feedback: '¡Excelente! Completaste tu primer algoritmo paso a paso.', stars: 3 };
      }
      return { won: false, feedback: 'PixelBot se movió, pero faltó llegar a la estrella y usar recoger().', stars: 0 };
    },
  },
  {
    id: '1-2',
    worldId: 1,
    order: 2,
    kind: 'challenge',
    title: 'El Puente del Río',
    subtitle: 'Reto 1.2 · Secuencia sin caer al agua',
    explanation:
      'Hay agua bloqueando el camino directo. Sube al puente seguro, cruza 4 casillas hacia la derecha y recoge la estrella.',
    goalLabel: 'Cruza el puente y recoge la estrella (1/1)',
    defaultMode: 'split',
    allowBlocks: true,
    recommendedMaxSteps: 7,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 3,
    tiles: [
      { x: 2, y: 3, type: 'water' },
      { x: 3, y: 3, type: 'water' },
      { x: 4, y: 3, type: 'water' },
      { x: 1, y: 1, type: 'water' },
      { x: 2, y: 1, type: 'water' },
      { x: 3, y: 1, type: 'water' },
      { x: 4, y: 1, type: 'water' },
      { x: 5, y: 2, type: 'star' },
    ],
    blocks: BLOCKS_WORLD_1,
    starterBlocks: [{ blockId: 'up' }, { blockId: 'right' }],
    starterCode: 'moverArriba();\nmoverDerecha();\n// Añade más pasos para llegar a la estrella',
    hints: [
      'Primero sube una casilla con moverArriba() para evitar el agua.',
      'Desde la fila del puente, avanza 4 veces con moverDerecha().',
      'Termina con recoger() justo sobre la estrella.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Cuidado con el agua.', stars: 0 };
      if (res.collected >= 1) {
        const stars = res.stepsUsed <= 7 ? 3 : 2;
        return { won: true, feedback: '¡Cruzaste el puente sin mojarte ni una bota!', stars };
      }
      return { won: false, feedback: 'Aún no recoges la estrella del otro lado del puente.', stars: 0 };
    },
  },
  {
    id: '1-3',
    worldId: 1,
    order: 3,
    kind: 'challenge',
    title: 'Doble Tesoro',
    subtitle: 'Reto 1.3 · Coordenadas y ruta',
    explanation:
      'Recoge las 2 gemas del pueblo rodeando el muro de piedra. Observa cómo cambia tu código JavaScript al agregar cada bloque.',
    goalLabel: 'Recoge las 2 gemas del mapa (2/2)',
    defaultMode: 'split',
    allowBlocks: true,
    recommendedMaxSteps: 7,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 1,
    tiles: [
      { x: 3, y: 1, type: 'gem' },
      { x: 4, y: 1, type: 'wall' },
      { x: 2, y: 2, type: 'wall' },
      { x: 3, y: 3, type: 'gem' },
    ],
    blocks: BLOCKS_WORLD_1,
    starterBlocks: [{ blockId: 'right' }],
    starterCode: 'moverDerecha();\n// Llega a (3,1), recoge, baja a (3,3) y recoge la segunda gema',
    hints: [
      'Avanza 2 pasos a la derecha para tomar la primera gema.',
      'Después de recoger(), baja 2 veces con moverAbajo().',
      'No olvides llamar a recoger() también sobre la segunda gema.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Chocaste contra un muro.', stars: 0 };
      if (res.collected >= 2) {
        const stars = res.stepsUsed <= 7 ? 3 : 2;
        return { won: true, feedback: '¡Ruta perfecta! Recogiste ambos tesoros.', stars };
      }
      return {
        won: false,
        feedback: `Recogiste ${res.collected} de 2 gemas. ¡Falta una!`,
        stars: 0,
      };
    },
  },
  {
    id: '1-boss',
    worldId: 1,
    order: 4,
    kind: 'boss',
    title: 'Jefe 1: Atrapa la Estrella',
    subtitle: 'Proyecto Final · Tu primer juego GBA',
    explanation:
      'Conecta los botones de la cruceta de tu Game Boy Advance modificando la velocidad del personaje. Pulsa Ejecutar y juega usando la cruceta o las flechas.',
    goalLabel: 'Programa los 4 controles y prueba tu juego en la consola',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 3,
    startY: 2,
    tiles: [],
    blocks: [],
    starterBlocks: [],
    starterCode: `let velocidad = 1;

function alPresionarArriba() {
  jugador.y -= velocidad;
}

function alPresionarAbajo() {
  jugador.y += velocidad;
}

function alPresionarIzquierda() {
  jugador.x -= velocidad;
}

function alPresionarDerecha() {
  jugador.x += velocidad;
}`,
    hints: [
      'Puedes aumentar "let velocidad = 2;" para moverte más rápido por la pantalla.',
      'Asegúrate de mantener las cuatro funciones: alPresionarArriba, Abajo, Izquierda y Derecha.',
      'Pulsa "Ejecutar y Jugar" y usa la cruceta de la GBA para atrapar estrellas durante 25 segundos.',
    ],
    bossGameId: 'star_catcher',
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tu código.', stars: 0 };
      const h = res.handlers;
      if (h.alPresionarArriba && h.alPresionarAbajo && h.alPresionarIzquierda && h.alPresionarDerecha) {
        return {
          won: true,
          feedback: '¡Juego compilado en tu cartucho! Usa la cruceta de la consola para atrapar estrellas.',
          stars: 3,
        };
      }
      return { won: false, feedback: 'Falta definir alguna de las 4 funciones de dirección.', stars: 0 };
    },
  },

  // MUNDO 2
  {
    id: '2-1',
    worldId: 2,
    order: 1,
    kind: 'lesson',
    title: 'Variables: Cajas de Memoria',
    subtitle: 'Lección 2.1 · Guardar valores con let',
    explanation:
      'Una variable guarda un dato con nombre, como los pasos que dará tu personaje. Cambia el valor de "pasos" a 4 para alcanzar la estrella al final del sendero.',
    goalLabel: 'Ajusta la variable pasos y recoge la estrella',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [{ x: 5, y: 2, type: 'star' }],
    blocks: [],
    starterBlocks: [],
    starterCode: `let pasos = 2;

for (let i = 0; i < pasos; i++) {
  moverDerecha();
}
recoger();`,
    hints: [
      'Busca la línea 1 donde dice "let pasos = 2;".',
      'La estrella está a 4 casillas de distancia.',
      'Cambia el número 2 por 4 para que quede "let pasos = 4;".',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa la sintaxis.', stars: 0 };
      if (res.collected >= 1) {
        return { won: true, feedback: '¡Genial! Cambiaste una variable y controlaste el programa.', stars: 3 };
      }
      return { won: false, feedback: 'Cambia el valor de "pasos" a 4 para llegar hasta la estrella.', stars: 0 };
    },
  },
  {
    id: '2-2',
    worldId: 2,
    order: 2,
    kind: 'challenge',
    title: 'El Guardián del Sendero',
    subtitle: 'Reto 2.2 · Decisiones con if / else',
    explanation:
      'Hay una piedra en mitad del camino. Usa "if (hayPiedra()) { saltar(); } else { avanzar(); }" 3 veces para cruzar sin tropezar y recoger la estrella.',
    goalLabel: 'Supera la piedra con if/else y recoge la estrella',
    defaultMode: 'split',
    allowBlocks: true,
    recommendedMaxSteps: 5,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [
      { x: 3, y: 2, type: 'stone' },
      { x: 5, y: 2, type: 'star' },
    ],
    blocks: BLOCKS_WORLD_2,
    starterBlocks: [{ blockId: 'if_stone' }, { blockId: 'if_stone' }],
    starterCode: `for (let turno = 0; turno < 2; turno++) {
  if (hayPiedra()) {
    saltar();
  } else {
    avanzar();
  }
}
recoger();`,
    hints: [
      'Con 2 turnos llegas hasta la casilla 4, justo antes de la estrella.',
      'Necesitas repetir la decisión if/else un total de 3 veces (o añadir 1 bloque más).',
      'Cambia "turno < 2" por "turno < 3" antes de llamar a recoger().',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Tropezaste con una piedra.', stars: 0 };
      if (res.collected >= 1) {
        return { won: true, feedback: '¡Lógica impecable! Decidiste cuándo saltar y cuándo avanzar.', stars: 3 };
      }
      return { won: false, feedback: 'Falta un paso más para quedar sobre la estrella y recogerla.', stars: 0 };
    },
  },
  {
    id: '2-3',
    worldId: 2,
    order: 3,
    kind: 'challenge',
    title: 'La Llave del Cofre',
    subtitle: 'Reto 2.3 · Variables + Condición',
    explanation:
      'Declara una variable "llaves = 0", camina hasta la llave para recogerla y súmale 1. Luego avanza al cofre y ábrelo solo si "llaves >= 1".',
    goalLabel: 'Recoge la llave y abre el cofre dorado',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [
      { x: 3, y: 2, type: 'key' },
      { x: 5, y: 2, type: 'chest' },
    ],
    blocks: [],
    starterBlocks: [],
    starterCode: `let llaves = 0;

moverDerecha();
moverDerecha();
recoger();
llaves = llaves + 1;

// Ahora muévete 2 veces más y usa: if (llaves >= 1) { abrirCofre(); }
`,
    hints: [
      'Después de recoger la llave en la casilla 3, el cofre está 2 casillas a la derecha.',
      'Agrega dos veces moverDerecha(); después de sumar la llave.',
      'Al final escribe: if (llaves >= 1) { abrirCofre(); }',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tu código.', stars: 0 };
      if (res.openedChests >= 1) {
        return { won: true, feedback: '¡Cofre desbloqueado! Combinaste variables y condiciones.', stars: 3 };
      }
      return { won: false, feedback: 'Recoge primero la llave, avanza al cofre y usa abrirCofre().', stars: 0 };
    },
  },
  {
    id: '2-boss',
    worldId: 2,
    order: 4,
    kind: 'boss',
    title: 'Jefe 2: Mascota Byte',
    subtitle: 'Proyecto Final · App Tamagotchi Retro',
    explanation:
      'Programa los botones A (Alimentar) y B (Jugar) de tu consola para cuidar a Mascota Byte manteniendo su energía equilibrada con variables.',
    goalLabel: 'Configura los botones A y B y cuida a tu mascota',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 3,
    startY: 2,
    tiles: [],
    blocks: [],
    starterBlocks: [],
    starterCode: `let energiaInicial = 6;

function alPresionarA() {
  // Alimentar sube la energía hasta un máximo de 10
  if (mascota.energia < 10) {
    mascota.energia += 2;
    mascota.felicidad += 1;
  }
}

function alPresionarB() {
  // Jugar sube mucho la felicidad si tiene energía
  if (mascota.energia >= 2) {
    mascota.felicidad += 3;
    mascota.energia -= 1;
  }
}`,
    hints: [
      'Puedes ajustar energiaInicial entre 4 y 10 para probar distintos comienzos.',
      'Botón A alimenta a Byte y Botón B juega con él.',
      'Pulsa "Ejecutar y Jugar" y presiona A o B en la consola GBA.',
    ],
    bossGameId: 'byte_pet',
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa la sintaxis.', stars: 0 };
      if (res.handlers.alPresionarA && res.handlers.alPresionarB) {
        return {
          won: true,
          feedback: '¡Mascota Byte está viva en tu pantalla! Usa los botones A y B para cuidarla.',
          stars: 3,
        };
      }
      return { won: false, feedback: 'Debes definir alPresionarA() y alPresionarB().', stars: 0 };
    },
  },

  // MUNDO 3
  {
    id: '3-1',
    worldId: 3,
    order: 1,
    kind: 'lesson',
    title: 'El Poder de Repetir (for)',
    subtitle: 'Lección 3.1 · Bucles automáticos',
    explanation:
      'En vez de escribir 8 líneas iguales, un bucle "for" repite acciones por ti. Cambia el límite del bucle para recoger las 4 gemas de la cinta transportadora.',
    goalLabel: 'Recoge las 4 gemas usando un bucle for',
    defaultMode: 'split',
    allowBlocks: true,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [
      { x: 2, y: 2, type: 'gem' },
      { x: 3, y: 2, type: 'gem' },
      { x: 4, y: 2, type: 'gem' },
      { x: 5, y: 2, type: 'gem' },
    ],
    blocks: BLOCKS_WORLD_3,
    starterBlocks: [{ blockId: 'repeat_right_pickup', arg: 2 }],
    starterCode: `for (let i = 0; i < 2; i++) {
  moverDerecha();
  recoger();
}`,
    hints: [
      'El bucle actual solo se repite 2 veces (i < 2).',
      'Hay 4 gemas alineadas frente a PixelBot.',
      'Cambia el número de repeticiones a 4: "for (let i = 0; i < 4; i++)".',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tu bucle.', stars: 0 };
      if (res.collected >= 4) {
        return { won: true, feedback: '¡Fábrica automatizada! Ahorraste código con un bucle for.', stars: 3 };
      }
      return { won: false, feedback: `Recogiste ${res.collected} de 4 gemas. Ajusta el límite del bucle.`, stars: 0 };
    },
  },
  {
    id: '3-2',
    worldId: 3,
    order: 2,
    kind: 'challenge',
    title: 'La Escalera de Oro',
    subtitle: 'Reto 3.2 · Patrones en diagonal',
    explanation:
      'Sube la escalera de la fábrica combinando moverDerecha(), moverArriba() y recoger() dentro de un bucle for para tomar las 3 gemas y la estrella.',
    goalLabel: 'Recoge los 4 tesoros de la escalera (4/4)',
    defaultMode: 'code',
    allowBlocks: true,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 4,
    tiles: [
      { x: 2, y: 3, type: 'gem' },
      { x: 3, y: 2, type: 'gem' },
      { x: 4, y: 1, type: 'gem' },
      { x: 5, y: 0, type: 'star' },
    ],
    blocks: BLOCKS_WORLD_3,
    starterBlocks: [{ blockId: 'repeat_stairs', arg: 1 }],
    starterCode: `for (let i = 0; i < 1; i++) {
  moverDerecha();
  moverArriba();
  recoger();
}`,
    hints: [
      'Cada escalón requiere ir 1 vez a la derecha y 1 vez arriba.',
      'Hay 4 escalones diagonales en total.',
      'Cambia "i < 1" por "i < 4" para completar la escalera entera.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Te saliste del mapa.', stars: 0 };
      if (res.collected >= 4) {
        return { won: true, feedback: '¡Subiste hasta la cima usando patrones repetitivos!', stars: 3 };
      }
      return { won: false, feedback: `Recogiste ${res.collected} de 4 tesoros de la escalera.`, stars: 0 };
    },
  },
  {
    id: '3-3',
    worldId: 3,
    order: 3,
    kind: 'challenge',
    title: 'Pintor de Puentes',
    subtitle: 'Reto 3.3 · Bucles con coordenadas',
    explanation:
      'La lava bloquea las columnas x = 2 hasta x = 5 en la fila 2. Usa pintarBloque(x, 2) dentro de un bucle for para construir el puente y luego cruza hasta la estrella.',
    goalLabel: 'Construye el puente sobre la lava y toma la estrella',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [
      { x: 2, y: 2, type: 'lava' },
      { x: 3, y: 2, type: 'lava' },
      { x: 4, y: 2, type: 'lava' },
      { x: 5, y: 2, type: 'lava' },
      { x: 6, y: 2, type: 'star' },
    ],
    blocks: [],
    starterBlocks: [],
    starterCode: `for (let x = 2; x <= 5; x++) {
  pintarBloque(x, 2);
}

// Ahora cruza 5 casillas a la derecha con otro bucle for y llama a recoger();
`,
    hints: [
      'El primer bucle ya fabrica el puente sobre la lava.',
      'Añade debajo un bucle: for (let i = 0; i < 5; i++) { moverDerecha(); }',
      'Después del segundo bucle escribe: recoger();',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || '¡Cuidado con la lava!', stars: 0 };
      if (res.collected >= 1 && res.paintedCount >= 4) {
        return { won: true, feedback: '¡Ingeniería pura! Construiste el puente y cruzaste con éxito.', stars: 3 };
      }
      return { won: false, feedback: 'Asegúrate de pintar las 4 casillas de lava, cruzar y recoger la estrella.', stars: 0 };
    },
  },
  {
    id: '3-boss',
    worldId: 3,
    order: 4,
    kind: 'boss',
    title: 'Jefe 3: Lluvia de Meteoritos',
    subtitle: 'Proyecto Final · Arcade de Esquive',
    explanation:
      'Define cuántos meteoritos genera el bucle en pantalla y programa el movimiento lateral para esquivarlos en tiempo real.',
    goalLabel: 'Configura la lluvia de meteoritos y sobrevive',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 3,
    startY: 4,
    tiles: [],
    blocks: [],
    starterBlocks: [],
    starterCode: `let cantidadMeteoritos = 5;
let velocidadCaida = 2;

function alPresionarIzquierda() {
  jugador.x -= 1;
}

function alPresionarDerecha() {
  jugador.x += 1;
}`,
    hints: [
      'Prueba cambiar cantidadMeteoritos entre 3 y 8 para ajustar la dificultad.',
      'Mantén las funciones alPresionarIzquierda y alPresionarDerecha.',
      'Pulsa "Ejecutar y Jugar" y esquiva los meteoritos con la cruceta izquierda/derecha.',
    ],
    bossGameId: 'meteor_rain',
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Error en el código.', stars: 0 };
      if (res.handlers.alPresionarIzquierda && res.handlers.alPresionarDerecha) {
        return {
          won: true,
          feedback: '¡Lluvia activada! Esquiva los meteoritos moviéndote con izquierda y derecha.',
          stars: 3,
        };
      }
      return { won: false, feedback: 'Define alPresionarIzquierda() y alPresionarDerecha().', stars: 0 };
    },
  },

  // MUNDO 4
  {
    id: '4-1',
    worldId: 4,
    order: 1,
    kind: 'lesson',
    title: 'Tus Superpoderes (function)',
    subtitle: 'Lección 4.1 · Crear funciones reutilizables',
    explanation:
      'Una función agrupa varias órdenes bajo un nombre nuevo que tú inventas. Completa "doblePaso()" y llámala 2 veces para cruzar el puente del castillo.',
    goalLabel: 'Crea y ejecuta tu función doblePaso() dos veces',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [{ x: 5, y: 2, type: 'star' }],
    blocks: [],
    starterBlocks: [],
    starterCode: `function doblePaso() {
  moverDerecha();
  moverDerecha();
}

doblePaso();
// Llama una vez más a doblePaso() y luego a recoger();
`,
    hints: [
      'doblePaso() avanza 2 casillas cada vez que la llamas.',
      'Como estás a 4 casillas, llama a doblePaso(); otra vez.',
      'Termina escribiendo recoger(); al final.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tu función.', stars: 0 };
      if (res.collected >= 1) {
        return { won: true, feedback: '¡Creaste tu propio comando reutilizable!', stars: 3 };
      }
      return { won: false, feedback: 'Llama a doblePaso() dos veces y después usa recoger().', stars: 0 };
    },
  },
  {
    id: '4-2',
    worldId: 4,
    order: 2,
    kind: 'challenge',
    title: 'Escudo Láser',
    subtitle: 'Reto 4.2 · Funciones + Detección de enemigos',
    explanation:
      'Dos guardianes bloquean el pasillo del castillo. Completa la función "limpiarPaso()" para disparar si hay enemigo antes de avanzar.',
    goalLabel: 'Derrota a los 2 enemigos y recoge la estrella',
    defaultMode: 'split',
    allowBlocks: true,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 2,
    tiles: [
      { x: 3, y: 2, type: 'enemy' },
      { x: 5, y: 2, type: 'enemy' },
      { x: 6, y: 2, type: 'star' },
    ],
    blocks: BLOCKS_WORLD_4,
    starterBlocks: [{ blockId: 'clear_loop', arg: 3 }],
    starterCode: `function limpiarPaso() {
  if (hayEnemigo()) {
    dispararRayo();
  }
  moverDerecha();
}

for (let i = 0; i < 3; i++) {
  limpiarPaso();
}
recoger();`,
    hints: [
      'La estrella está 5 casillas a la derecha del punto de inicio.',
      'El bucle solo repite limpiarPaso() 3 veces.',
      'Cambia "i < 3" por "i < 5" para llegar hasta la estrella.',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Un enemigo te bloqueó el paso.', stars: 0 };
      if (res.collected >= 1 && res.enemiesCleared >= 2) {
        return { won: true, feedback: '¡Pasillo despejado! Dominaste funciones y condicionales.', stars: 3 };
      }
      return { won: false, feedback: 'Asegúrate de despejar a los 2 enemigos y recoger la estrella.', stars: 0 };
    },
  },
  {
    id: '4-3',
    worldId: 4,
    order: 3,
    kind: 'challenge',
    title: 'Radar de Colisión',
    subtitle: 'Reto 4.3 · Parámetros en funciones',
    explanation:
      'Programa una función "irAlObjetivo(pasosDerecha, pasosArriba)" con dos parámetros para guiar al robot desde (1, 3) hasta la gema maestra en (5, 1).',
    goalLabel: 'Usa parámetros para llegar a (5, 1) y recoger la gema',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 1,
    startY: 3,
    tiles: [
      { x: 3, y: 2, type: 'wall' },
      { x: 5, y: 1, type: 'gem' },
    ],
    blocks: [],
    starterBlocks: [],
    starterCode: `function irAlObjetivo(pasosDerecha, pasosArriba) {
  for (let i = 0; i < pasosDerecha; i++) {
    moverDerecha();
  }
  for (let j = 0; j < pasosArriba; j++) {
    moverArriba();
  }
  recoger();
}

// Llama a la función con los números exactos:
irAlObjetivo(1, 1);`,
    hints: [
      'De la columna 1 a la columna 5 hay 4 pasos a la derecha.',
      'De la fila 3 a la fila 1 hay 2 pasos hacia arriba.',
      'Cambia la última línea a: irAlObjetivo(4, 2);',
    ],
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa los parámetros.', stars: 0 };
      if (res.collected >= 1) {
        return { won: true, feedback: '¡Radar calibrado! Entiendes cómo funcionan los parámetros.', stars: 3 };
      }
      return { won: false, feedback: 'Ajusta los dos números dentro de irAlObjetivo(?, ?).', stars: 0 };
    },
  },
  {
    id: '4-boss',
    worldId: 4,
    order: 4,
    kind: 'boss',
    title: 'Jefe Final: Defensor Espacial',
    subtitle: 'Gran Proyecto · Shooter Arcade GBA',
    explanation:
      '¡El reto definitivo! Configura los controles de tu nave espacial (Izquierda, Derecha y Disparo con botón A) y defiende la galaxia.',
    goalLabel: 'Compila tu juego final y derrota oleadas alienígenas',
    defaultMode: 'code',
    allowBlocks: false,
    gridCols: 7,
    gridRows: 5,
    startX: 3,
    startY: 4,
    tiles: [],
    blocks: [],
    starterBlocks: [],
    starterCode: `let puntosPorImpacto = 25;

function alPresionarIzquierda() {
  nave.x -= 1;
}

function alPresionarDerecha() {
  nave.x += 1;
}

function alPresionarA() {
  nave.disparar();
}`,
    hints: [
      'Puedes cambiar puntosPorImpacto a 50 o 100 si quieres puntajes épicos.',
      'Botón A (o tecla Z/Enter) dispara el rayo láser hacia arriba.',
      'Pulsa "Ejecutar y Jugar" y usa Cruceta + Botón A para defender el castillo.',
    ],
    bossGameId: 'space_defender',
    evaluateWin: (res) => {
      if (!res.ok) return { won: false, feedback: res.errorMessage || 'Revisa tu código.', stars: 0 };
      if (res.handlers.alPresionarIzquierda && res.handlers.alPresionarDerecha && res.handlers.alPresionarA) {
        return {
          won: true,
          feedback: '¡Cartucho Maestro completado! Mueve con cruceta y dispara con el botón A.',
          stars: 3,
        };
      }
      return { won: false, feedback: 'Define alPresionarIzquierda, alPresionarDerecha y alPresionarA.', stars: 0 };
    },
  },
];

export function getLevelById(id: string): LevelDef {
  return LEVELS.find((l) => l.id === id) || LEVELS[0];
}
