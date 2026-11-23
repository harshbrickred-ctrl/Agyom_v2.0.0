import { get } from '../services/apiClient';

function extractItems(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

/**
 * Walk paginated list endpoints until all rows are loaded.
 * Requirements API caps pageSize at 100; candidates have no hard cap.
 */
export async function fetchAllPages(path, { pageSize = 100, maxPages = 50 } = {}) {
  const size = Math.max(1, Math.min(Number(pageSize) || 100, 100));
  const items = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages && page <= maxPages) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await get(`${path}${sep}page=${page}&pageSize=${size}`);
    const batch = extractItems(res);
    items.push(...batch);

    const total = Number(res?.total);
    const reportedPages = Number(res?.totalPages);
    if (Number.isFinite(reportedPages) && reportedPages > 0) {
      totalPages = reportedPages;
    } else if (Number.isFinite(total) && total >= 0) {
      totalPages = Math.max(1, Math.ceil(total / size));
    } else {
      totalPages = batch.length < size ? page : page + 1;
    }

    if (!batch.length) break;
    page += 1;
  }

  return items;
}
