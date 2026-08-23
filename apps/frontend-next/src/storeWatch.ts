type Subscribable<S> = {
  subscribe: (listener: (state: S, prevState: S) => void) => () => void;
};

/**
 * Calls onEnter exactly once each time the store transitions into a state
 * matching isTarget (edge-triggered, not level-triggered) — the seam a
 * completion-triggered side effect (persistence, sync, …) should hang off,
 * instead of a component's mount effect.
 */
export function watchStoreTransition<S>(
  store: Subscribable<S>,
  isTarget: (state: S) => boolean,
  onEnter: (state: S) => void,
): () => void {
  return store.subscribe((state, prevState) => {
    if (isTarget(state) && !isTarget(prevState)) {
      onEnter(state);
    }
  });
}
