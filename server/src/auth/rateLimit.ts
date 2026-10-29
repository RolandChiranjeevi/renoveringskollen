// Enkel begränsning av misslyckade inloggningar, i minnet.
// Räcker för en server i hemmet; nollställs vid omstart.

export class FailureLimiter {
  private failures = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  private recent(key: string) {
    const cutoff = this.now() - this.windowMs;
    const list = (this.failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Sekunder kvar av spärren, eller 0 om nyckeln får försöka. */
  blockedFor(key: string): number {
    const list = this.recent(key);
    if (list.length < this.max) return 0;
    return Math.ceil((list[0]! + this.windowMs - this.now()) / 1000);
  }

  fail(key: string) {
    this.failures.set(key, [...this.recent(key), this.now()]);
  }

  reset(key: string) {
    this.failures.delete(key);
  }
}
