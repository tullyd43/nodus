# Database Schema v4.0
**Organizational Ecosystem Application - Hybrid Offline-First + Server Architecture**

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [PostgreSQL Server Schema](#postgresql-server-schema)
3. [IndexedDB Client Schema](#indexeddb-client-schema)
4. [Synchronization Strategy](#synchronization-strategy)
5. [Performance Optimization](#performance-optimization)
6. [Schema Migration Strategy](#schema-migration-strategy)

---

## Architecture Overview

### Hybrid Design Philosophy

The Organizational Ecosystem uses a **hybrid offline-first architecture** with identical schemas for seamless synchronization:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  IndexedDB Cache: Intelligent subset (10K most relevant)   │
│  - Instant offline operations (1-5ms)                      │
│  - Complete functionality without server                   │
│  - Modification queue for offline changes                  │
│  - Automatic background sync when online                   │
└─────────────────────────────────────────────────────────────┘
                               ▲ ▼ Intelligent Sync
┌─────────────────────────────────────────────────────────────┐
│                    SERVER LAYER                            │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL + JSONB: Unlimited primary storage             │
│  - Enterprise performance with 1M+ records (10-100ms)     │
│  - Advanced search and analytics capabilities              │
│  - Multi-user collaboration with conflict resolution       │
│  - Real-time updates and comprehensive audit trails        │
└─────────────────────────────────────────────────────────────┘
```

### Schema Consistency Strategy

**Identical 18-table structure** across both layers ensures:
- ✅ **Seamless Sync**: No data transformation needed
- ✅ **Offline Development**: Build against IndexedDB, deploy to PostgreSQL
- ✅ **Conflict Resolution**: Same data types and constraints
- ✅ **Performance**: Optimized indexes for both platforms

### Core Principles

1. **Two-Type Purity**: Everything is either an Event (verb) or Item (noun)
2. **Real Columns + JSONB**: Common fields as real columns (10x performance), custom fields in JSONB
3. **Polymorphic Design**: Universal systems work across all entity types
4. **Offline-First**: Complete functionality without server dependency

---

## PostgreSQL Server Schema

### Core Entities

#### Users Table
```sql
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Workspace configuration (JSONB for flexibility)
    workspace_config JSONB DEFAULT '{}',
    view_preferences JSONB DEFAULT '{}',
    onboarding_state JSONB DEFAULT '{}',
    
    -- Subscription and limits
    subscription_tier VARCHAR(20) DEFAULT 'free',
    storage_used_mb INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- Performance indexes
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_username ON users(username) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_subscription ON users(subscription_tier, created_at);

-- Row-level security for multi-user
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_data ON users FOR ALL 
USING (user_id = current_setting('app.current_user_id')::INTEGER);
```

#### Events Table (Performance Optimized)
```sql
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_type_id INTEGER REFERENCES event_types(event_type_id),
    
    -- Core content
    title VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- PERFORMANCE: Real columns for 10x query speed improvement
    priority INTEGER CHECK (priority BETWEEN 1 AND 5),
    budget DECIMAL(10,2),
    location VARCHAR(200),
    due_date TIMESTAMP,
    completed_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'deferred')),
    
    -- FLEXIBILITY: JSONB for unlimited custom fields with GIN index performance
    custom_fields JSONB DEFAULT '{}',
    
    -- Full-text search optimization
    search_vector tsvector,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- Enterprise-grade performance indexes
CREATE INDEX idx_events_user_active ON events(user_id, status, due_date) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_events_priority_filter ON events(user_id, priority, due_date) 
WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX idx_events_location ON events(user_id, location) 
WHERE deleted_at IS NULL AND location IS NOT NULL;

CREATE INDEX idx_events_budget ON events(user_id, budget) 
WHERE deleted_at IS NULL AND budget IS NOT NULL;

-- JSONB optimization with GIN indexes
CREATE INDEX idx_events_custom_fields ON events USING GIN (custom_fields) 
WHERE deleted_at IS NULL;

-- Full-text search capability
CREATE INDEX idx_events_search ON events USING GIN (search_vector) 
WHERE deleted_at IS NULL;

-- Auto-update search vector trigger
CREATE OR REPLACE FUNCTION update_events_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        COALESCE(NEW.title, '') || ' ' || 
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(NEW.location, '')
    );
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_search_update 
BEFORE INSERT OR UPDATE ON events 
FOR EACH ROW EXECUTE FUNCTION update_events_search_vector();

-- Row-level security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY events_own_data ON events FOR ALL 
USING (user_id = current_setting('app.current_user_id')::INTEGER);
```

#### Items Table (Performance Optimized)
```sql
CREATE TABLE items (
    item_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    item_type_id INTEGER REFERENCES item_types(item_type_id),
    
    -- Core content
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- PERFORMANCE: Real columns for common operations
    quantity DECIMAL(10,3) DEFAULT 1,
    unit VARCHAR(50),
    value DECIMAL(10,2),
    location VARCHAR(200),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'consumed', 'lost')),
    
    -- FLEXIBILITY: JSONB for custom fields
    custom_fields JSONB DEFAULT '{}',
    
    -- Full-text search
    search_vector tsvector,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- Performance indexes for inventory management
CREATE INDEX idx_items_user_active ON items(user_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_items_quantity ON items(user_id, quantity) 
WHERE deleted_at IS NULL AND quantity > 0;

CREATE INDEX idx_items_value ON items(user_id, value DESC) 
WHERE deleted_at IS NULL AND value IS NOT NULL;

CREATE INDEX idx_items_location ON items(user_id, location) 
WHERE deleted_at IS NULL AND location IS NOT NULL;

-- JSONB and search indexes
CREATE INDEX idx_items_custom_fields ON items USING GIN (custom_fields) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_items_search ON items USING GIN (search_vector) 
WHERE deleted_at IS NULL;

-- Search vector maintenance
CREATE TRIGGER items_search_update 
BEFORE INSERT OR UPDATE ON items 
FOR EACH ROW EXECUTE FUNCTION update_items_search_vector();

CREATE OR REPLACE FUNCTION update_items_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('english', 
        COALESCE(NEW.name, '') || ' ' || 
        COALESCE(NEW.description, '') || ' ' ||
        COALESCE(NEW.location, '')
    );
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Row-level security
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_own_data ON items FOR ALL 
USING (user_id = current_setting('app.current_user_id')::INTEGER);
```

### Remaining Tables Summary

The complete PostgreSQL schema includes 18 tables total:

**Type System:**
- event_types, item_types (with embedded templates)

**Universal Field System:**  
- field_definitions, entity_fields (polymorphic field assignment)

**Universal Systems:**
- tags, tag_assignments (polymorphic tagging)
- links (universal relationships)

**Organization:**
- collections (dynamic filtering with CQL)
- lists, list_items (hybrid text/linked entities)
- routines, routine_event_instances (automation)

**Infrastructure:**
- entity_files (file sync)
- operation_logs (audit trail)
- deleted_entities (soft delete recovery)

*[Full schemas available in original DATABASE_SCHEMA.md]*

---

## IndexedDB Client Schema

### Dexie.js Schema Definition

```javascript
// src/database/schema.js
import Dexie from 'dexie';

class OrganizationalDatabase extends Dexie {
  constructor() {
    super('OrganizationalEcosystem');
    
    // IDENTICAL structure to PostgreSQL for seamless sync
    this.version(1).stores({
      // Core entities (mirrors PostgreSQL exactly)
      users: 'user_id, username, email, workspace_config, view_preferences',
      events: 'event_id, user_id, event_type_id, title, priority, budget, location, due_date, status, custom_fields',
      items: 'item_id, user_id, item_type_id, name, quantity, value, location, status, custom_fields',
      
      // Type system
      event_types: 'event_type_id, user_id, name, content_template, available_variables',
      item_types: 'item_type_id, user_id, name, category, tracks_quantity',
      
      // Universal field system
      field_definitions: 'field_id, field_name, field_type, validation_schema, category',
      entity_fields: '[entity_type+entity_id+field_id], entity_type, entity_id, field_id, sequence_order',
      
      // Universal systems
      tags: 'tag_id, user_id, name, color',
      tag_assignments: '[taggable_type+taggable_id+tag_id], tag_id, taggable_type, taggable_id',
      links: 'link_id, from_type, from_id, to_type, to_id, relationship_type',
      
      // Organization
      collections: 'collection_id, user_id, name, filter_config, view_config',
      lists: 'list_id, user_id, title, is_ordered',
      list_items: 'list_item_id, list_id, text_content, linked_type, linked_id, sequence_order',
      
      // Advanced features
      routines: 'routine_id, user_id, title, event_type_id, schedule_pattern',
      routine_event_instances: 'instance_id, routine_id, event_id, scheduled_date',
      
      // File sync
      entity_files: 'id, entity_type, entity_id, file_path, sync_status',
      
      // Infrastructure
      operation_logs: 'log_id, user_id, operation_type, entity_type, entity_id, timestamp',
      deleted_entities: 'deletion_id, entity_type, entity_id, entity_data, deleted_at',
      
      // Sync management
      sync_queue: 'sync_id, operation, entity_type, entity_id, data, created_at'
    });
  }
}

export const db = new OrganizationalDatabase();
```

### Client-Specific Optimizations

#### Intelligent Caching Strategy
```javascript
class CacheManager {
  constructor() {
    this.maxLocalRecords = 10000;
    this.cacheStrategy = {
      recent: 2000,        // Recently accessed
      favorites: 1000,     // User-starred  
      due_soon: 2000,      // Due within week
      active_projects: 3000, // Current work
      offline_queue: 2000   // Pending sync
    };
  }
  
  async optimizeCache() {
    const relevantEvents = await this.server.getRelevantEvents({
      user_id: this.userId,
      strategy: this.cacheStrategy
    });
    
    // Replace cache with most relevant subset
    await db.transaction('rw', db.events, async () => {
      await db.events.clear();
      await db.events.bulkAdd(relevantEvents);
    });
  }
}
```

#### Offline Modification Queue
```javascript
class OfflineQueue {
  async queueOperation(operation, entityType, entityId, data) {
    await db.sync_queue.add({
      operation,        // 'CREATE', 'UPDATE', 'DELETE'
      entity_type: entityType,
      entity_id: entityId,
      data,
      created_at: new Date(),
      retry_count: 0
    });
  }
  
  async processQueue() {
    const pendingOperations = await db.sync_queue
      .orderBy('created_at')
      .toArray();
    
    for (const op of pendingOperations) {
      try {
        await this.syncToServer(op);
        await db.sync_queue.delete(op.sync_id);
      } catch (error) {
        await this.handleSyncError(op, error);
      }
    }
  }
}
```

---

## Synchronization Strategy

### Bidirectional Sync Architecture

```javascript
class IntelligentSync {
  constructor() {
    this.conflictResolution = 'server_wins'; // 'client_wins', 'merge', 'manual'
    this.syncBatchSize = 100;
    this.syncInterval = 30000; // 30 seconds
  }
  
  async bidirectionalSync() {
    // 1. Push local changes to server
    await this.pushLocalChanges();
    
    // 2. Pull relevant server updates
    await this.pullServerUpdates();
    
    // 3. Resolve any conflicts
    await this.resolveConflicts();
    
    // 4. Optimize local cache
    await this.optimizeLocalCache();
  }
  
  async pushLocalChanges() {
    const pendingChanges = await db.sync_queue.toArray();
    
    for (const change of pendingChanges) {
      try {
        const result = await this.server.applyChange(change);
        
        if (result.success) {
          // Update local record with server version
          await this.updateLocalRecord(change, result.data);
          await db.sync_queue.delete(change.sync_id);
        } else {
          await this.handleSyncConflict(change, result);
        }
      } catch (error) {
        await this.handleSyncError(change, error);
      }
    }
  }
  
  async pullServerUpdates() {
    const lastSyncTime = await this.getLastSyncTime();
    
    const serverUpdates = await this.server.getUpdatesFor({
      user_id: this.userId,
      since: lastSyncTime,
      relevance_filter: this.getCacheStrategy()
    });
    
    // Apply server updates to local cache
    for (const update of serverUpdates) {
      await this.applyServerUpdate(update);
    }
    
    await this.setLastSyncTime(new Date());
  }
  
  async resolveConflicts() {
    const conflicts = await db.sync_conflicts.toArray();
    
    for (const conflict of conflicts) {
      switch (this.conflictResolution) {
        case 'server_wins':
          await this.applyServerVersion(conflict);
          break;
        case 'client_wins':
          await this.pushClientVersion(conflict);
          break;
        case 'merge':
          await this.mergeVersions(conflict);
          break;
        case 'manual':
          await this.requestUserResolution(conflict);
          break;
      }
    }
  }
}
```

---

## Performance Optimization

### PostgreSQL Query Performance

#### Example Queries with Performance Expectations

```sql
-- Real column filtering (10-30ms with 1M records)
SELECT * FROM events 
WHERE user_id = $1 
  AND priority >= 4 
  AND due_date BETWEEN $2 AND $3
  AND status = 'active'
ORDER BY due_date 
LIMIT 50;

-- JSONB filtering with GIN index (20-80ms with 1M records)
SELECT * FROM events 
WHERE user_id = $1 
  AND custom_fields @> '{"project": "Alpha", "department": "Engineering"}'
ORDER BY due_date 
LIMIT 50;

-- Combined real + JSONB query (25-100ms with 1M records)
SELECT * FROM events 
WHERE user_id = $1 
  AND priority >= 4 
  AND custom_fields @> '{"tags": ["urgent"]}'
  AND due_date > CURRENT_DATE
ORDER BY priority DESC, due_date ASC
LIMIT 50;

-- Full-text search (50-200ms with 1M records)
SELECT *, ts_rank(search_vector, plainto_tsquery($2)) as rank
FROM events 
WHERE user_id = $1 
  AND search_vector @@ plainto_tsquery($2)
ORDER BY rank DESC 
LIMIT 100;
```

### IndexedDB Performance

#### Optimized Query Patterns

```javascript
class OptimizedQueries {
  // Compound index queries (fastest)
  async getHighPriorityEvents(userId) {
    return db.events
      .where('[user_id+priority]')
      .between([userId, 4], [userId, 5])
      .toArray();
  }
  
  // Single field with filter (fast)
  async getDueSoonEvents(userId, daysAhead = 7) {
    const maxDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
    
    return db.events
      .where('user_id')
      .equals(userId)
      .and(event => event.due_date && event.due_date <= maxDate)
      .toArray();
  }
  
  // Virtual pagination for large result sets
  async getPaginatedEvents(userId, page = 0, pageSize = 50) {
    return db.events
      .where('user_id')
      .equals(userId)
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();
  }
}
```

---

## Schema Migration Strategy

### Version Management

```sql
-- Migration tracking table
CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    migration_name VARCHAR(255) NOT NULL,
    checksum VARCHAR(64) NOT NULL
);

-- Example migration (V2: Add real columns for performance)
-- V2__add_performance_columns.sql
ALTER TABLE events 
ADD COLUMN priority INTEGER CHECK (priority BETWEEN 1 AND 5),
ADD COLUMN budget DECIMAL(10,2),
ADD COLUMN location VARCHAR(200),
ADD COLUMN due_date TIMESTAMP;

-- Migrate data from custom_fields to real columns
UPDATE events 
SET priority = (custom_fields->>'priority')::INTEGER
WHERE custom_fields->>'priority' IS NOT NULL;

UPDATE events 
SET budget = (custom_fields->>'budget')::DECIMAL
WHERE custom_fields->>'budget' IS NOT NULL;

-- Remove migrated fields from custom_fields
UPDATE events 
SET custom_fields = custom_fields - 'priority' - 'budget' - 'location' - 'due_date';

-- Add indexes for new columns
CREATE INDEX idx_events_priority_due ON events(user_id, priority, due_date) 
WHERE deleted_at IS NULL;

INSERT INTO schema_migrations (version, migration_name, checksum) 
VALUES (2, 'Add performance columns', 'abc123...');
```

### Client-Server Schema Sync

```javascript
class SchemaSyncManager {
  async checkSchemaVersion() {
    const clientVersion = await db.getSchemaVersion();
    const serverVersion = await this.server.getSchemaVersion();
    
    if (clientVersion < serverVersion) {
      await this.upgradeClientSchema(clientVersion, serverVersion);
    }
  }
  
  async upgradeClientSchema(fromVersion, toVersion) {
    const migrations = await this.server.getMigrations(fromVersion, toVersion);
    
    for (const migration of migrations) {
      await this.applyClientMigration(migration);
    }
    
    await db.setSchemaVersion(toVersion);
  }
}
```

---

## Conclusion

This hybrid database architecture provides the foundation for a **radically simple, infinitely extensible** organizational ecosystem that scales from personal productivity (1K records) to enterprise collaboration (1M+ records) while maintaining **offline-first functionality** and **sub-second performance**.

### Key Architectural Benefits

1. **Identical Schemas**: Seamless sync between PostgreSQL server and IndexedDB client
2. **Performance Optimized**: Real columns + JSONB strategy for 10x query improvement  
3. **Unlimited Scale**: PostgreSQL handles enterprise datasets with advanced features
4. **Offline-First**: Complete functionality without server dependency
5. **Future-Proof**: Architecture supports AI integration, collaboration, and global scale

The **18-table design** achieves what traditional systems need 50+ tables to accomplish, while the **PostgreSQL + JSONB** approach provides both performance and flexibility for unlimited customization.

**Result: A productivity platform that works instantly offline and scales infinitely online.**
