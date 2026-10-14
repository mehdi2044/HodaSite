/** Expected revision no longer matches; caller must reload and reconcile. */
export class RevisionConflictError extends Error {
  constructor() {
    super("revision_conflict");
  }
}
