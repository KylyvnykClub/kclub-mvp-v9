export interface Clock {
  now(): Date;
}

export interface IdSource {
  uuid(): string;
}

export const realClock: Clock = {
  now: () => new Date(),
};

export const realIdSource: IdSource = {
  uuid: () => crypto.randomUUID(),
};

export function deterministicClock(start: Date, stepMs = 1000): Clock {
  let tick = start.getTime();
  return {
    now() {
      const d = new Date(tick);
      tick += stepMs;
      return d;
    },
  };
}

export function deterministicIdSource(
  prefix = "00000000-0000-0000-0000",
): IdSource {
  let seq = 0;
  return {
    uuid() {
      seq++;
      return `${prefix}-${String(seq).padStart(12, "0")}`;
    },
  };
}
