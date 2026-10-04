/** A typed set of callbacks. Errors in one listener do not stop the others. */
export class ListenerSet<Args extends unknown[]> {
  private readonly listeners = new Set<(...args: Args) => void>();

  add(listener: (...args: Args) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(...args: Args): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(...args);
      } catch (error) {
        console.error("Listener failed", error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
