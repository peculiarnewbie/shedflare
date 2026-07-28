import type { SyncServerEvent } from "./sync-types";

export type CommandHandlerResult = {
  events: SyncServerEvent[];
  followUp?: () => Promise<void>;
};

export type CommandHandlerFn<Ctx, Payload = unknown> = (
  opId: string,
  payload: Payload,
  ctx: Ctx,
) => CommandHandlerResult;

export class HandlerRegistry<Ctx> {
  private readonly handlers = new Map<string, CommandHandlerFn<Ctx>>();

  set(type: string, handler: CommandHandlerFn<Ctx>): void {
    this.handlers.set(type, handler);
  }

  get(type: string): CommandHandlerFn<Ctx> | undefined {
    return this.handlers.get(type);
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /** Iterate all registered command types (for diagnostics). */
  types(): string[] {
    return [...this.handlers.keys()];
  }
}
