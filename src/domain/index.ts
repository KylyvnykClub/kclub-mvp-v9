export type { Clock, IdSource } from "./context";
export {
  realClock,
  realIdSource,
  deterministicClock,
  deterministicIdSource,
} from "./context";

export type { Actor, ActorType, Role } from "./actor";
export {
  ROLES,
  isStaff,
  isAuthenticated,
  staffAtLeast,
  actorId,
} from "./actor";

export type { Action, Subject } from "./authorization";
export { can, assertCan } from "./authorization";

export type { RouteEntry } from "./route-registry";
export {
  registerRoute,
  getRegisteredRoutes,
  getMutatingStaffRoutes,
  clearRegistry,
} from "./route-registry";

export {
  DomainError,
  NotFound,
  Forbidden,
  Conflict,
  RateLimited,
  Validation,
  ExternalUnavailable,
} from "./errors";
