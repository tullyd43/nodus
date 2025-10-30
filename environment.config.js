// src/config/environment.config.js
// Central source of truth for environment flags.

export const AppConfig = {
  demoMode: true, // or false in prod
  storageConfig: {
    dbName: "nodus_offline",
    version: 1,
    stores: {
      objects: {
        keyPath: "id",
        indexes: [
          { name: "entity_type", keyPath: "entity_type" },
          { name: "classification", keyPath: "classification" },
          { name: "updated_at", keyPath: "updated_at" }
        ]
      }
    }
  },
  sync: { enableSync: false, realtime: false }
};
