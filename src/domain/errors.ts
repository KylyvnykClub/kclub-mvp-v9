export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFound extends DomainError {
  constructor(entity: string, id?: string) {
    super(
      id ? `${entity} not found: ${id}` : `${entity} not found`,
      "NOT_FOUND",
    );
  }
}

export class Forbidden extends DomainError {
  constructor(message = "Not authorized") {
    super(message, "FORBIDDEN");
  }
}

export class Conflict extends DomainError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

export class RateLimited extends DomainError {
  constructor(
    message = "Rate limit exceeded",
    public readonly retryAfterMs?: number,
  ) {
    super(message, "RATE_LIMITED");
  }
}

export class Validation extends DomainError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "VALIDATION");
  }
}

export class ExternalUnavailable extends DomainError {
  constructor(service: string) {
    super(`${service} is currently unavailable`, "EXTERNAL_UNAVAILABLE");
  }
}
