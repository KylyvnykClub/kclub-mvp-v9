export interface PageParams {
  limit: number;
  offset: number;
}

export interface PageResult<T> {
  rows: T[];
  total: number;
}

export const DEFAULT_PAGE_SIZE = 20;

export function pageParamsFromSearchParam(
  page: string | number | undefined,
  limit: number = DEFAULT_PAGE_SIZE,
): PageParams {
  const pageNumber = Math.max(1, Number(page) || 1);
  return { limit, offset: (pageNumber - 1) * limit };
}
