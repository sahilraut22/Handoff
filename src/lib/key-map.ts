const KEY_MAP: Record<string, string> = {
  'enter': 'Enter',
  'return': 'Enter',
  'escape': 'Escape',
  'esc': 'Escape',
  'tab': 'Tab',
  'space': 'Space',
  'backspace': 'BSpace',
  'delete': 'DC',
  'up': 'Up',
  'down': 'Down',
  'left': 'Left',
  'right': 'Right',
  'home': 'Home',
  'end': 'End',
  'pageup': 'PageUp',
  'pagedown': 'PageDown',
  'ctrl+c': 'C-c',
  'ctrl+d': 'C-d',
  'ctrl+z': 'C-z',
  'ctrl+a': 'C-a',
  'ctrl+l': 'C-l',
  'ctrl+r': 'C-r',
};

export function resolveKey(keyName: string): string {
  const normalized = keyName.toLowerCase().replace(/\s+/g, '');
  return KEY_MAP[normalized] ?? keyName;
}

export function listKeys(): string[] {
  return Object.keys(KEY_MAP).sort();
}
