/**
 * `localStorage` de mentira para los tests: el store y la sincronización
 * persisten de verdad, así que probarlos sin esto sería probar solo la mitad
 * (todos los accesos caen en el catch y no se guarda nada).
 */
class MemoryStorage {
  private items = new Map<string, string>()
  get length() { return this.items.size }
  getItem(k: string) { return this.items.get(k) ?? null }
  setItem(k: string, v: string) { this.items.set(k, String(v)) }
  removeItem(k: string) { this.items.delete(k) }
  clear() { this.items.clear() }
  key(i: number) { return [...this.items.keys()][i] ?? null }
}

globalThis.localStorage = new MemoryStorage() as unknown as Storage
