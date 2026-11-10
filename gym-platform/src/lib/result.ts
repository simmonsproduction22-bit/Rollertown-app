import { ZodError } from "zod";
import { log } from "./log";

/** Standard response envelope for server actions and the REST API. */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}

export class AppError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "BAD_REQUEST") {
    super(message);
    this.name = "AppError";
  }
}

export const ok = <T>(data: T, meta?: ApiResponse<T>["meta"]): ApiResponse<T> => ({ success: true, data, ...(meta ? { meta } : {}) });

/** Converts any thrown error into a safe, user-facing message. */
export function fail(error: unknown): ApiResponse<never> {
  if (error instanceof AppError) return { success: false, error: error.message };
  if (error instanceof ZodError) return { success: false, error: error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  log.error("unexpected error", { error: error instanceof Error ? error.message : String(error) });
  return { success: false, error: "Something went wrong. Please try again." };
}

export async function attempt<T>(fn: () => Promise<T>): Promise<ApiResponse<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}
