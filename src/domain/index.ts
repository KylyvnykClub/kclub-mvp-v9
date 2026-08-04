export type { Clock, IdSource } from "./context.js";
export {
  realClock,
  realIdSource,
  deterministicClock,
  deterministicIdSource,
} from "./context.js";

export type { Actor, ActorType, Role } from "./actor.js";
export {
  ROLES,
  isStaff,
  isAuthenticated,
  staffAtLeast,
  actorId,
} from "./actor.js";

export type { Action, Subject } from "./authorization.js";
export { can, assertCan } from "./authorization.js";

export {
  DomainError,
  NotFound,
  Forbidden,
  Conflict,
  RateLimited,
  Validation,
  ExternalUnavailable,
} from "./errors.js";
