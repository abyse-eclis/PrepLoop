/**
 * Classify incoming rows against existing DB rows into
 * created / updated / unchanged, purely (no IO). Callers pass a `signature`
 * function that returns a stable string of the comparable fields.
 */
export interface EntityChangeCounts {
  created: number;
  updated: number;
  unchanged: number;
}

export function classifyChanges<TIncoming, TExisting>(params: {
  incoming: TIncoming[];
  existing: Map<string, TExisting>;
  keyOf: (row: TIncoming) => string;
  signatureIncoming: (row: TIncoming) => string;
  signatureExisting: (row: TExisting) => string;
}): EntityChangeCounts {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  for (const row of params.incoming) {
    const key = params.keyOf(row);
    const existing = params.existing.get(key);
    if (!existing) {
      created++;
    } else if (
      params.signatureIncoming(row) === params.signatureExisting(existing)
    ) {
      unchanged++;
    } else {
      updated++;
    }
  }
  return { created, updated, unchanged };
}

export interface EntityImportSummary extends EntityChangeCounts {
  entity: string;
  duplicatesRemoved: number;
}

export interface LearningSourceImportSummary {
  catalogVersion: number;
  entities: EntityImportSummary[];
  skippedInvalid: number;
  /** Human-readable duplicate notes for the UI. */
  duplicateNotes: string[];
}
