/**
 * Case library settings.
 *
 * RECENTLY_DELETED_DAYS: how long a deleted case stays in Recently Deleted
 * (restorable, still on this device only) before it is permanently removed.
 * This is a product setting, not a legal retention period — OWNER DECISION:
 * confirm it against the data-retention policy (docs/DATA_RETENTION.md).
 * "Delete permanently", "Delete all cases" and "Delete all data on this
 * device" always remove data immediately.
 */
export const RECENTLY_DELETED_DAYS = 30;
