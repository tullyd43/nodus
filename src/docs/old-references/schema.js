// schema.js
// Nodus V7.3 Dexie Schema (Domain-Aware, Temporal, Composable, Portable)

export const NodusSchema = {
  version: 8, // incremented for domain integration
  stores: {
    // Core tri-layer -----------------------------------------------------------
    objectTypes: `
      ++id,
      organizationId,
      name,
      domain,
      version,
      [organizationId+domain],
      updatedAt
    `,

    objects: `
      ++id,
      organizationId,
      typeId,
      domain,
      classification,
      updatedAt,
      sysStart,
      sysEnd,
      [organizationId+domain],
      [organizationId+typeId]
    `,

    events: `
      ++id,
      organizationId,
      objectId,
      domain,
      eventType,
      occurredAt,
      [organizationId+domain],
      [organizationId+occurredAt]
    `,

    // Config & policy ---------------------------------------------------------
    configurations: `
      ++id,
      organizationId,
      domain,
      key,
      updatedAt,
      [organizationId+domain],
      [organizationId+key]
    `,

    policies: `
      ++id,
      organizationId,
      name,
      domain,
      updatedAt,
      [organizationId+domain]
    `,

    // UI & compositional ------------------------------------------------------
    components: `
      ++id,
      organizationId,
      name,
      domain,
      updatedAt,
      [organizationId+domain]
    `,

    layouts: `
      ++id,
      organizationId,
      name,
      domain,
      updatedAt,
      [organizationId+domain]
    `,

    plugins: `
      ++id,
      organizationId,
      name,
      domain,
      updatedAt,
      [organizationId+domain]
    `,

    // Field library -----------------------------------------------------------
    fieldDefinitions: `
      ++id,
      organizationId,
      name,
      type,
      domain,
      updatedAt,
      [organizationId+domain]
    `,

    fieldValues: `
      ++id,
      organizationId,
      entityId,
      fieldId,
      domain,
      updatedAt,
      [organizationId+domain],
      [organizationId+entityId]
    `,

    // Analytics / AI ----------------------------------------------------------
    embeddings: `
      ++id,
      organizationId,
      tableName,
      rowId,
      domain,
      dim,
      model,
      createdAt,
      [organizationId+domain]
    `,

    metrics: `
      ++id,
      organizationId,
      metric,
      domain,
      ts,
      [organizationId+domain]
    `,

    audit: `
      ++id,
      tableName,
      rowId,
      organizationId,
      domain,
      operation,
      actorId,
      actorOrg,
      createdAt,
      [organizationId+domain]
    `,

    lineage: `
      ++id,
      orgId,
      domain,
      srcTable,
      srcId,
      dstTable,
      dstId,
      createdAt,
      [orgId+domain]
    `,
  },
};
