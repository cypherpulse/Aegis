/** Consistent API envelope + pagination shapes shared by the backend (§12). */

export interface ApiErrorBody {
  code: string;
  message: string;
  /** Field-level validation errors, when applicable. */
  fields?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorBody | null;
}

export interface Page<T> {
  items: T[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
  total?: number;
}

export function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

export function err(
  code: string,
  message: string,
  fields?: Record<string, string>,
): ApiResponse<never> {
  return {
    data: null,
    error: fields ? { code, message, fields } : { code, message },
  };
}
