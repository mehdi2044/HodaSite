/** A runner deadline does not cancel an async test body. Never clean its rows early. */
export class FixtureLifecycle {
  private readonly bodies = new Set<Promise<unknown>>();
  private cleanup: Promise<void> = Promise.resolve();

  track<Args extends unknown[], Result>(
    body: (...args: Args) => Promise<Result>,
  ) {
    return (...args: Args) => {
      const result = body(...args);
      this.bodies.add(result);
      void result.then(
        () => this.bodies.delete(result),
        () => this.bodies.delete(result),
      );
      return result;
    };
  }

  async ready() {
    await this.cleanup;
    await Promise.allSettled([...this.bodies]);
  }

  finish(cleanup: () => Promise<void>) {
    const previous = this.cleanup;
    const bodies = [...this.bodies];
    this.cleanup = (async () => {
      await previous;
      await Promise.allSettled(bodies);
      await cleanup();
    })();
    return this.cleanup;
  }
}
