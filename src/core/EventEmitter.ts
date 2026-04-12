export class EventEmitter<Events extends { [K in keyof Events]: unknown }> {
  private listeners = new Map<keyof Events, Set<(data: never) => void>>();

  on<K extends keyof Events>(event: K, fn: (data: Events[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(fn as (data: never) => void);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (data: Events[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (data: never) => void);
  }

  emit<K extends keyof Events>(event: K, data: Events[K]): void {
    this.listeners.get(event)?.forEach(fn => {
      try {
        (fn as (data: Events[K]) => void)(data);
      } catch (e) {
        console.error(`[WanderTable] Error in "${String(event)}" handler:`, e);
      }
    });
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
