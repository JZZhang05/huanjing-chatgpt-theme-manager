// Bound retained base64 data. Entries larger than the budget are served uncached.
export class AssetCache {
  #items = new Map();
  #bytes = 0;
  constructor(maxBytes) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new RangeError('Invalid cache budget');
    this.maxBytes = maxBytes;
  }
  get bytes() { return this.#bytes; }
  get size() { return this.#items.size; }
  get(key) {
    const value = this.#items.get(key);
    if (value === undefined) return undefined;
    this.#items.delete(key);
    this.#items.set(key, value);
    return value;
  }
  set(key, value) {
    const cost = Buffer.byteLength(value, 'utf8');
    if (this.#items.has(key)) {
      this.#bytes -= Buffer.byteLength(this.#items.get(key), 'utf8');
      this.#items.delete(key);
    }
    if (cost > this.maxBytes) return;
    while (this.#bytes + cost > this.maxBytes && this.#items.size) {
      const oldest = this.#items.keys().next().value;
      this.#bytes -= Buffer.byteLength(this.#items.get(oldest), 'utf8');
      this.#items.delete(oldest);
    }
    this.#items.set(key, value);
    this.#bytes += cost;
  }
}
