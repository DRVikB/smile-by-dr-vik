/** Safe, actionable messages only. Never expose upstream request bodies or credentials. */
export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly status = 502,
    public readonly code = "generation_failed",
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
