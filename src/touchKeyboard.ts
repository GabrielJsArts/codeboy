export type KeyboardTab = 'commands' | 'symbols' | 'logic';

export interface TouchKeyItem {
  label: string;
  insert: string;
  title: string;
}

const COMMAND_KEYS: TouchKeyItem[] = [
  { label: 'moverDerecha();', insert: 'moverDerecha();\n', title: 'Avanzar a la derecha' },
  { label: 'moverIzquierda();', insert: 'moverIzquierda();\n', title: 'Avanzar a la izquierda' },
  { label: 'moverArriba();', insert: 'moverArriba();\n', title: 'Subir una casilla' },
  { label: 'moverAbajo();', insert: 'moverAbajo();\n', title: 'Bajar una casilla' },
  { label: 'recoger();', insert: 'recoger();\n', title: 'Recoger objeto' },
  { label: 'saltar();', insert: 'saltar();\n', title: 'Saltar piedra' },
  { label: 'avanzar();', insert: 'avanzar();\n', title: 'Avanzar paso' },
  { label: 'pintarBloque(x, 2);', insert: 'pintarBloque(x, 2);\n', title: 'Crear puente' },
  { label: 'dispararRayo();', insert: 'dispararRayo();\n', title: 'Disparar láser' },
  { label: 'abrirCofre();', insert: 'abrirCofre();\n', title: 'Abrir cofre dorado' },
];

const SYMBOL_KEYS: TouchKeyItem[] = [
  { label: '(', insert: '(', title: 'Abrir paréntesis' },
  { label: ')', insert: ')', title: 'Cerrar paréntesis' },
  { label: '{', insert: ' {\n  ', title: 'Abrir llave y sangría' },
  { label: '}', insert: '\n}', title: 'Cerrar llave' },
  { label: ';', insert: ';', title: 'Punto y coma' },
  { label: '=', insert: ' = ', title: 'Asignar valor' },
  { label: '+=', insert: ' += ', title: 'Sumar y guardar' },
  { label: '-=', insert: ' -= ', title: 'Restar y guardar' },
  { label: '===', insert: ' === ', title: 'Comparar igual' },
  { label: '>=', insert: ' >= ', title: 'Mayor o igual' },
  { label: '<=', insert: ' <= ', title: 'Menor o igual' },
  { label: '<', insert: ' < ', title: 'Menor que' },
  { label: '>', insert: ' > ', title: 'Mayor que' },
  { label: '++', insert: '++', title: 'Sumar 1' },
  { label: 'Enter', insert: '\n', title: 'Nueva línea' },
];

const LOGIC_KEYS: TouchKeyItem[] = [
  { label: 'let ', insert: 'let ', title: 'Crear variable' },
  { label: 'if () {}', insert: 'if () {\n  \n}\n', title: 'Condición si...' },
  { label: 'else {}', insert: ' else {\n  \n}\n', title: 'Si no...' },
  { label: 'for (i < 4)', insert: 'for (let i = 0; i < 4; i++) {\n  \n}\n', title: 'Bucle repetir 4 veces' },
  { label: 'function ()', insert: 'function miPoder() {\n  \n}\n', title: 'Crear función' },
  { label: 'hayPiedra()', insert: 'hayPiedra()', title: 'Detectar piedra adelante' },
  { label: 'hayEnemigo()', insert: 'hayEnemigo()', title: 'Detectar guardián adelante' },
  { label: '1', insert: '1', title: 'Número 1' },
  { label: '2', insert: '2', title: 'Número 2' },
  { label: '3', insert: '3', title: 'Número 3' },
  { label: '4', insert: '4', title: 'Número 4' },
  { label: '5', insert: '5', title: 'Número 5' },
];

export function getTouchKeys(tab: KeyboardTab): TouchKeyItem[] {
  if (tab === 'symbols') return SYMBOL_KEYS;
  if (tab === 'logic') return LOGIC_KEYS;
  return COMMAND_KEYS;
}

export function insertTokenAtCursor(textarea: HTMLTextAreaElement, token: string): string {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const nextValue = before + token + after;

  textarea.value = nextValue;
  const newPos = start + token.length;
  textarea.focus();
  textarea.setSelectionRange(newPos, newPos);
  return nextValue;
}
