/** An error that should be reported to the client with a specific HTTP status instead of a generic 500. */
export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
