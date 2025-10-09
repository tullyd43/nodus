# Development Guide v4.0
**Organizational Ecosystem Application - Complete Developer Documentation**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [Project Structure](#project-structure)
4. [Database Development](#database-development)
5. [MVVM Implementation Patterns](#mvvm-implementation-patterns)
6. [Universal Systems Development](#universal-systems-development)
7. [Performance Optimization](#performance-optimization)
8. [UI Development Guidelines](#ui-development-guidelines)
9. [Testing Strategy](#testing-strategy)
10. [API Development](#api-development)
11. [File Synchronization](#file-synchronization)
12. [Security Implementation](#security-implementation)
13. [Deployment Guide](#deployment-guide)
14. [Contributing Guidelines](#contributing-guidelines)
15. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

```bash
# Required
Node.js 18+ 
npm 9+
Git 2.0+

# Recommended for development
VS Code with extensions:
- JavaScript/TypeScript support
- IndexedDB Explorer
- REST Client
- Git integration
```

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/your-org/organizational-ecosystem.git
cd organizational-ecosystem

# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
open http://localhost:3000
```

### Development Dependencies

```json
{
  "dependencies": {
    "dexie": "^3.2.4",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "serve": "^14.2.1",
    "eslint": "^8.45.0",
    "jest": "^29.6.1",
    "@types/jest": "^29.5.3",
    "live-server": "^1.2.2"
  }
}
```

### Environment Setup

```bash
# Create development environment file
cp .env.example .env.development

# Configure development settings
cat > .env.development << EOF
NODE_ENV=development
APP_NAME=Organizational Ecosystem
VERSION=4.0.0
DEBUG=true

# Database
DB_NAME=org_ecosystem_dev
DB_VERSION=1

# File Sync
SYNC_ENABLED=true
SYNC_DIRECTORY=./sync-files

# Performance
ENABLE_PERFORMANCE_MONITORING=true
LOG_LEVEL=debug
EOF
```

---

## Architecture Overview

### Core Philosophy

**Everything is either an Event (verb) or an Item (noun).** This fundamental principle drives all architectural decisions and simplifies the entire system.

```javascript
// Core abstraction
class Entity {
  static getType(data) {
    return data.involves_action ? 'event' : 'item';
  }
}

// Examples
"Buy groceries" → Event (action)
"MacBook Pro" → Item (thing)
"Meeting with team" → Event (action)
"Conference room" → Item (thing)
```

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                         │
├─────────────────────────────────────────────────────────────┤
│  Events Tab    │    Vault Tab    │    Templates Tab       │
│  - Quick Input │  - Collections  │  - Event Types         │
│  - Event List  │  - Tags        │  - Field Library       │
│  - Calendar    │  - Relationships│  - Content Templates   │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                    VIEWMODEL LAYER                         │
├─────────────────────────────────────────────────────────────┤
│  EventViewModel  │  ItemViewModel  │  CollectionViewModel   │
│  - State Mgmt    │  - Inventory    │  - Dynamic Filtering   │
│  - Validation    │  - Tracking     │  - Real-time Updates   │
│  - Offline Queue │  - Sync Status  │  - Conflict Resolution │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                     MODEL LAYER                            │
├─────────────────────────────────────────────────────────────┤
│    Event Model   │   Item Model    │   Universal Models     │
│    - Local CRUD  │   - Local CRUD  │   - Tag Model          │
│    - Sync Logic  │   - Sync Logic  │   - Link Model         │
│    - Conflict    │   - Conflict    │   - Collection Model   │
│    - Resolution  │   - Resolution  │   - Sync Queue Model   │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│              INTELLIGENT SYNC LAYER                        │
├─────────────────────────────────────────────────────────────┤
│  Bidirectional Sync │ Conflict Resolution │ Offline Queue   │
│  - Push changes     │ - Server wins       │ - CREATE ops    │
│  - Pull updates     │ - Client wins       │ - UPDATE ops    │
│  - Delta sync       │ - Smart merge       │ - DELETE ops    │
│  - Real-time        │ - Manual resolution │ - Retry logic   │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                CLIENT DATABASE LAYER                       │
├─────────────────────────────────────────────────────────────┤
│                IndexedDB Cache (10K records)               │
│  - Recent events (last 30 days)                            │
│  - Starred/pinned items                                     │
│  - Active projects and collections                          │
│  - 18 tables (mirrors server schema exactly)               │
│  Performance: 1-10ms queries, complete offline capability  │
└─────────────────────────────────────────────────────────────┘
                               ▲ ▼ Bidirectional Sync
┌─────────────────────────────────────────────────────────────┐
│               SERVER DATABASE LAYER                        │
├─────────────────────────────────────────────────────────────┤
│              PostgreSQL + JSONB (Unlimited)                │
│  - Full dataset with enterprise performance                │
│  - Real columns + JSONB custom fields                      │
│  - Advanced search and analytics                           │
│  - Multi-user collaboration with row-level security        │
│  - 18 tables (identical to client)                         │
│  Performance: 10-100ms queries, unlimited scale            │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│                   API SERVER LAYER                         │
├─────────────────────────────────────────────────────────────┤
│  Node.js + Express RESTful API                             │
│  - Authentication & Authorization                           │
│  - JSONB query optimization                                │
│  - Real-time updates (WebSocket)                           │
│  - Rate limiting & security                                │
│  Performance: Enterprise-grade with multi-user support     │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

```javascript
// Complete hybrid technology stack
const techStack = {
  // Client Development (Offline-First)
  frontend: {
    language: 'Vanilla JavaScript ES2022',
    architecture: 'MVVM (Model-View-ViewModel)',
    database: 'IndexedDB + Dexie.js (intelligent cache)',
    performance: 'Strategic compound indexes',
    offline: 'Complete functionality without server'
  },
  
  // Server Development (Unlimited Scale)
  backend: {
    language: 'Node.js + JavaScript',
    framework: 'Express.js RESTful API', 
    database: 'PostgreSQL + JSONB (primary storage)',
    authentication: 'JWT with row-level security',
    realtime: 'WebSocket for live updates',
    performance: '10-100ms queries with 1M+ records'
  },
  
  // Synchronization Layer
  sync: {
    strategy: 'Bidirectional intelligent sync',
    conflicts: 'Real-time conflict resolution',
    offline: 'Modification queue with retry logic',
    caching: '10K most relevant records locally'
  },
  
  // Development Environment
  development: {
    client: 'Live-server for IndexedDB development',
    server: 'Docker PostgreSQL + Express API',
    testing: 'Jest + integration test suites',
    debugging: 'IndexedDB inspector + PostgreSQL logs'
  },
  
  // Deployment
  production: {
    containerization: 'Docker + Docker Compose',
    database: 'PostgreSQL with optimized indexes',
    api: 'Node.js with PM2 process management',
    scaling: 'Horizontal scaling ready'
  }
};
```

---

## Project Structure

### Directory Organization

```
organizational-ecosystem/
├── docs/                          # Documentation
│   ├── FEATURE_MATRIX.md          # Complete feature specification
│   ├── DATABASE_SCHEMA.md         # Database design
│   ├── SYSTEM_ARCHITECTURE.md     # System architecture
│   └── API_REFERENCE.md           # API documentation
│
├── src/                           # Source code
│   ├── database/                  # Database layer
│   │   ├── schema.js              # Database schema definition
│   │   ├── connection.js          # IndexedDB connection
│   │   └── migrations.js          # Schema migrations
│   │
│   ├── models/                    # Data access layer
│   │   ├── base/                  
│   │   │   ├── BaseModel.js       # Abstract base model
│   │   │   ├── BaseEntity.js      # Event/Item base class
│   │   │   └── QueryBuilder.js    # Query construction
│   │   ├── Event.js               # Event model
│   │   ├── Item.js                # Item model
│   │   ├── Tag.js                 # Tag model
│   │   ├── Collection.js          # Collection model
│   │   ├── EventType.js           # Event type model
│   │   ├── ItemType.js            # Item type model
│   │   ├── FieldDefinition.js     # Field library model
│   │   └── Link.js                # Relationship model
│   │
│   ├── viewmodels/                # Business logic layer
│   │   ├── base/
│   │   │   ├── BaseViewModel.js   # Abstract base viewmodel
│   │   │   └── ObservableState.js # Reactive state management
│   │   ├── MainViewModel.js       # Primary application state
│   │   ├── EventViewModel.js      # Event management logic
│   │   ├── ItemViewModel.js       # Item management logic
│   │   ├── CollectionViewModel.js # Collection filtering logic
│   │   ├── QuickCaptureViewModel.js # Input parsing logic
│   │   └── WorkspaceViewModel.js  # UI state management
│   │
│   ├── views/                     # UI layer (future)
│   │   ├── components/
│   │   ├── pages/
│   │   └── templates/
│   │
│   ├── utils/                     # Utility functions
│   │   ├── dateUtils.js           # Date parsing and formatting
│   │   ├── stringUtils.js         # Text processing utilities
│   │   ├── validationUtils.js     # Input validation
│   │   ├── performanceUtils.js    # Performance monitoring
│   │   └── templateEngine.js      # Template variable substitution
│   │
│   ├── sync/                      # File synchronization (future)
│   │   ├── FileSync.js
│   │   ├── ConflictResolver.js
│   │   └── MarkdownParser.js
│   │
│   └── app.js                     # Application entry point
│
├── public/                        # Static assets
│   ├── index.html                 # Main HTML file
│   ├── styles/
│   │   ├── main.css               # Main stylesheet
│   │   ├── components.css         # Component styles
│   │   └── themes/                # Theme files
│   └── assets/
│       ├── icons/                 # Icon files
│       └── images/                # Image assets
│
├── tests/                         # Test files
│   ├── unit/                      # Unit tests
│   │   ├── models/
│   │   ├── viewmodels/
│   │   └── utils/
│   ├── integration/               # Integration tests
│   ├── e2e/                       # End-to-end tests
│   └── fixtures/                  # Test data
│
├── scripts/                       # Build and utility scripts
│   ├── setup-dev.js               # Development setup
│   ├── migrate-schema.js          # Database migrations
│   ├── seed-data.js               # Sample data generation
│   └── performance-test.js        # Performance benchmarking
│
├── config/                        # Configuration files
│   ├── database.js                # Database configuration
│   ├── performance.js             # Performance settings
│   └── sync.js                    # File sync configuration
│
├── package.json                   # Dependencies and scripts
├── README.md                      # Project overview
├── .env.example                   # Environment variables template
├── .gitignore                     # Git ignore rules
└── CHANGELOG.md                   # Version history
```

### File Naming Conventions

```javascript
// Models: PascalCase with descriptive names
Event.js, Item.js, EventType.js, FieldDefinition.js

// ViewModels: PascalCase ending with ViewModel
MainViewModel.js, EventViewModel.js, CollectionViewModel.js

// Utilities: camelCase ending with Utils
dateUtils.js, stringUtils.js, validationUtils.js

// Components: PascalCase ending with Component (future)
EventListComponent.js, QuickCaptureComponent.js

// Constants: UPPER_SNAKE_CASE
DATABASE_CONFIG.js, FIELD_TYPES.js, QUERY_OPERATORS.js
```

---

## Database Development

### IndexedDB Schema Setup

```javascript
// src/database/schema.js
import Dexie from 'dexie';

class OrganizationalDatabase extends Dexie {
  constructor() {
    super('OrganizationalEcosystem');
    
    // Define schema version 1.0
    this.version(1).stores({
      // Core entities
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
      deleted_entities: 'deletion_id, entity_type, entity_id, entity_data, deleted_at'
    });
    
    // Performance indexes
    this.events.hook('ready', () => {
      // Compound indexes for performance
      this.events.toCollection().primaryKeys().then(keys => {
        console.log(`Events table ready with ${keys.length} records`);
      });
    });
  }
}

export const db = new OrganizationalDatabase();
```

### Database Migration System

```javascript
// src/database/migrations.js
class MigrationManager {
  static migrations = [
    {
      version: 1,
      description: 'Initial schema',
      up: async (db) => {
        // Initial schema is defined in constructor
        console.log('Initial schema created');
      }
    },
    {
      version: 2,
      description: 'Add performance columns to events',
      up: async (db) => {
        // Migration will be handled by Dexie version upgrade
        await db.events.toCollection().modify(event => {
          // Migrate custom_fields data to real columns
          if (event.custom_fields?.priority) {
            event.priority = event.custom_fields.priority;
          }
          if (event.custom_fields?.budget) {
            event.budget = event.custom_fields.budget;
          }
          if (event.custom_fields?.location) {
            event.location = event.custom_fields.location;
          }
        });
      }
    }
  ];
  
  static async runMigrations() {
    const currentVersion = await this.getCurrentVersion();
    const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
    
    for (const migration of pendingMigrations) {
      console.log(`Running migration ${migration.version}: ${migration.description}`);
      await migration.up(db);
      await this.updateVersion(migration.version);
    }
  }
  
  static async getCurrentVersion() {
    try {
      const versionData = await db.operation_logs
        .where('operation_type')
        .equals('MIGRATION')
        .last();
      return versionData?.metadata?.version || 0;
    } catch {
      return 0;
    }
  }
  
  static async updateVersion(version) {
    await db.operation_logs.add({
      operation_type: 'MIGRATION',
      metadata: { version, timestamp: new Date().toISOString() },
      timestamp: new Date()
    });
  }
}

export { MigrationManager };
```

### Query Patterns

```javascript
// src/models/base/QueryBuilder.js
class QueryBuilder {
  constructor(table) {
    this.table = table;
    this.query = table.toCollection();
  }
  
  // Performance-optimized user filtering
  byUser(userId) {
    this.query = this.table.where('user_id').equals(userId);
    return this;
  }
  
  // Real column filtering (10x faster than JSONB)
  byPriority(minPriority) {
    this.query = this.query.and(item => item.priority >= minPriority);
    return this;
  }
  
  // Date range filtering
  dueBetween(startDate, endDate) {
    this.query = this.query.and(item => 
      item.due_date >= startDate && item.due_date <= endDate
    );
    return this;
  }
  
  // JSONB custom field filtering
  byCustomField(fieldName, value) {
    this.query = this.query.and(item => 
      item.custom_fields?.[fieldName] === value
    );
    return this;
  }
  
  // Tag filtering (polymorphic)
  withTags(tagNames) {
    return this.query.and(async (item) => {
      const assignments = await db.tag_assignments
        .where('[taggable_type+taggable_id]')
        .equals([this.table.name.slice(0, -1), item[`${this.table.name.slice(0, -1)}_id`]])
        .toArray();
      
      const itemTagIds = assignments.map(a => a.tag_id);
      const itemTags = await db.tags.where('tag_id').anyOf(itemTagIds).toArray();
      const itemTagNames = itemTags.map(t => t.name);
      
      return tagNames.some(tagName => itemTagNames.includes(tagName));
    });
  }
  
  // Execute query with pagination
  async paginate(offset = 0, limit = 50) {
    return this.query.offset(offset).limit(limit).toArray();
  }
  
  // Execute query and get count
  async count() {
    return this.query.count();
  }
}

// Usage example
const highPriorityWorkEvents = await new QueryBuilder(db.events)
  .byUser(currentUserId)
  .byPriority(4)
  .withTags(['work'])
  .dueBetween(new Date(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  .paginate(0, 25);
```

---

## MVVM Implementation Patterns

### Base Model Pattern

```javascript
// src/models/base/BaseModel.js
class BaseModel {
  constructor(tableName, primaryKey) {
    this.table = db[tableName];
    this.primaryKey = primaryKey;
    this.tableName = tableName;
  }
  
  // Standard CRUD operations
  async create(data) {
    const now = new Date();
    const record = {
      ...data,
      created_at: now,
      updated_at: now
    };
    
    const id = await this.table.add(record);
    await this.logOperation('CREATE', id, null, record);
    return await this.findById(id);
  }
  
  async findById(id) {
    return await this.table.get(id);
  }
  
  async update(id, data) {
    const oldRecord = await this.findById(id);
    const updatedData = {
      ...data,
      updated_at: new Date()
    };
    
    await this.table.update(id, updatedData);
    await this.logOperation('UPDATE', id, oldRecord, updatedData);
    return await this.findById(id);
  }
  
  async delete(id) {
    const record = await this.findById(id);
    
    // Soft delete - move to deleted_entities
    await db.deleted_entities.add({
      entity_type: this.tableName.slice(0, -1), // Remove 's' from table name
      entity_id: id,
      entity_data: record,
      deleted_by: await this.getCurrentUserId(),
      deleted_at: new Date(),
      deletion_reason: 'User initiated'
    });
    
    await this.table.delete(id);
    await this.logOperation('DELETE', id, record, null);
  }
  
  // Query builder
  query() {
    return new QueryBuilder(this.table);
  }
  
  // Audit logging
  async logOperation(operationType, entityId, oldValues, newValues) {
    await db.operation_logs.add({
      user_id: await this.getCurrentUserId(),
      operation_type: operationType,
      entity_type: this.tableName.slice(0, -1),
      entity_id: entityId,
      old_values: oldValues,
      new_values: newValues,
      timestamp: new Date()
    });
  }
  
  async getCurrentUserId() {
    // Implementation depends on auth system
    return 1; // Default user for now
  }
}

export { BaseModel };
```

### Event Model Implementation

```javascript
// src/models/Event.js
import { BaseModel } from './base/BaseModel.js';

class EventModel extends BaseModel {
  constructor() {
    super('events', 'event_id');
  }
  
  // Performance-optimized queries using real columns
  async findByPriorityAndDueDate(userId, minPriority, startDate, endDate) {
    return this.table
      .where('user_id').equals(userId)
      .and(event => event.priority >= minPriority)
      .and(event => event.due_date >= startDate && event.due_date <= endDate)
      .toArray();
  }
  
  async findByLocation(userId, location) {
    return this.table
      .where('user_id').equals(userId)
      .and(event => event.location === location)
      .toArray();
  }
  
  // Custom field queries (JSONB)
  async findByCustomField(userId, fieldName, value) {
    return this.table
      .where('user_id').equals(userId)
      .and(event => event.custom_fields?.[fieldName] === value)
      .toArray();
  }
  
  // Complex relationship queries
  async findWithRelationships(eventId, relationshipType = null) {
    const event = await this.findById(eventId);
    if (!event) return null;
    
    let relationships = db.links.where('from_type').equals('event').and(link => link.from_id === eventId);
    
    if (relationshipType) {
      relationships = relationships.and(link => link.relationship_type === relationshipType);
    }
    
    const links = await relationships.toArray();
    
    // Load related entities
    const relatedEvents = [];
    const relatedItems = [];
    
    for (const link of links) {
      if (link.to_type === 'event') {
        const relatedEvent = await db.events.get(link.to_id);
        if (relatedEvent) {
          relatedEvents.push({ ...relatedEvent, relationship: link.relationship_type });
        }
      } else if (link.to_type === 'item') {
        const relatedItem = await db.items.get(link.to_id);
        if (relatedItem) {
          relatedItems.push({ ...relatedItem, relationship: link.relationship_type });
        }
      }
    }
    
    return {
      ...event,
      related_events: relatedEvents,
      related_items: relatedItems
    };
  }
  
  // Tag-based queries
  async findByTags(userId, tagNames) {
    const events = await this.table.where('user_id').equals(userId).toArray();
    const eventsWithTags = [];
    
    for (const event of events) {
      const assignments = await db.tag_assignments
        .where('[taggable_type+taggable_id]')
        .equals(['event', event.event_id])
        .toArray();
      
      if (assignments.length > 0) {
        const tagIds = assignments.map(a => a.tag_id);
        const tags = await db.tags.where('tag_id').anyOf(tagIds).toArray();
        const eventTagNames = tags.map(t => t.name);
        
        if (tagNames.some(tagName => eventTagNames.includes(tagName))) {
          eventsWithTags.push({
            ...event,
            tags: tags
          });
        }
      }
    }
    
    return eventsWithTags;
  }
  
  // Collection query execution
  async executeCollectionQuery(collectionConfig) {
    const { entity_type, conditions, sort } = collectionConfig;
    
    if (entity_type && entity_type !== 'event') {
      return [];
    }
    
    let query = this.table.toCollection();
    
    // Apply conditions
    if (conditions) {
      query = await this.applyConditions(query, conditions);
    }
    
    let results = await query.toArray();
    
    // Apply sorting
    if (sort && sort.length > 0) {
      results.sort((a, b) => {
        for (const sortRule of sort) {
          const { field, direction } = sortRule;
          let aVal = this.getFieldValue(a, field);
          let bVal = this.getFieldValue(b, field);
          
          if (aVal < bVal) return direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    
    return results;
  }
  
  async applyConditions(query, conditions) {
    const { operator, rules } = conditions;
    
    if (operator === 'AND') {
      for (const rule of rules) {
        query = query.and(event => this.evaluateRule(event, rule));
      }
    } else if (operator === 'OR') {
      // For OR conditions, we need to evaluate all rules and combine results
      const results = [];
      for (const rule of rules) {
        const ruleResults = await this.table.toCollection()
          .and(event => this.evaluateRule(event, rule))
          .toArray();
        results.push(...ruleResults);
      }
      
      // Remove duplicates
      const uniqueResults = results.filter((event, index, self) =>
        index === self.findIndex(e => e.event_id === event.event_id)
      );
      
      // Convert back to query-like object
      return {
        toArray: async () => uniqueResults
      };
    }
    
    return query;
  }
  
  evaluateRule(event, rule) {
    const { field, operator, value } = rule;
    const fieldValue = this.getFieldValue(event, field);
    
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      case 'not_equals':
        return fieldValue !== value;
      case 'greater_than':
        return fieldValue > value;
      case 'less_than':
        return fieldValue < value;
      case 'greater_than_or_equal':
        return fieldValue >= value;
      case 'less_than_or_equal':
        return fieldValue <= value;
      case 'contains':
        return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
      case 'starts_with':
        return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
      case 'ends_with':
        return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue);
      case 'date_between':
        return fieldValue >= new Date(value[0]) && fieldValue <= new Date(value[1]);
      default:
        return true;
    }
  }
  
  getFieldValue(event, fieldPath) {
    if (fieldPath.includes('.')) {
      const parts = fieldPath.split('.');
      let value = event;
      for (const part of parts) {
        value = value?.[part];
      }
      return value;
    }
    return event[fieldPath];
  }
}

export const Event = new EventModel();
```

### ViewModel Pattern

```javascript
// src/viewmodels/base/BaseViewModel.js
class BaseViewModel {
  constructor() {
    this.state = new ObservableState();
    this.subscriptions = new Set();
  }
  
  // Subscribe to state changes
  subscribe(callback) {
    this.subscriptions.add(callback);
    return () => this.subscriptions.delete(callback);
  }
  
  // Notify subscribers of state changes
  notify(change) {
    this.subscriptions.forEach(callback => callback(change));
  }
  
  // Cleanup resources
  dispose() {
    this.subscriptions.clear();
  }
}

// src/viewmodels/base/ObservableState.js
class ObservableState {
  constructor(initialState = {}) {
    this._state = initialState;
    this._subscribers = new Set();
  }
  
  get(key) {
    return this._state[key];
  }
  
  set(key, value) {
    const oldValue = this._state[key];
    this._state[key] = value;
    
    this._notify({
      type: 'SET',
      key,
      oldValue,
      newValue: value
    });
  }
  
  update(updates) {
    const oldState = { ...this._state };
    Object.assign(this._state, updates);
    
    this._notify({
      type: 'UPDATE',
      oldState,
      newState: { ...this._state },
      updates
    });
  }
  
  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }
  
  _notify(change) {
    this._subscribers.forEach(callback => callback(change));
  }
}

export { BaseViewModel, ObservableState };
```

### Event ViewModel Implementation

```javascript
// src/viewmodels/EventViewModel.js
import { BaseViewModel } from './base/BaseViewModel.js';
import { Event } from '../models/Event.js';
import { EventType } from '../models/EventType.js';

class EventViewModel extends BaseViewModel {
  constructor() {
    super();
    
    this.state.update({
      events: [],
      selectedEvent: null,
      loading: false,
      error: null,
      filters: {
        search: '',
        priority: null,
        due_date_range: null,
        tags: [],
        status: 'active'
      },
      pagination: {
        page: 0,
        pageSize: 50,
        total: 0
      }
    });
  }
  
  // Load events with current filters
  async loadEvents() {
    this.state.set('loading', true);
    this.state.set('error', null);
    
    try {
      const userId = await this.getCurrentUserId();
      const { filters, pagination } = this.state._state;
      
      // Build query based on filters
      let query = Event.query().byUser(userId);
      
      // Apply filters
      if (filters.priority) {
        query = query.byPriority(filters.priority);
      }
      
      if (filters.due_date_range) {
        query = query.dueBetween(filters.due_date_range.start, filters.due_date_range.end);
      }
      
      if (filters.tags.length > 0) {
        query = query.withTags(filters.tags);
      }
      
      if (filters.search) {
        query = query.and(event => 
          event.title.toLowerCase().includes(filters.search.toLowerCase()) ||
          event.description?.toLowerCase().includes(filters.search.toLowerCase())
        );
      }
      
      // Execute query with pagination
      const events = await query.paginate(
        pagination.page * pagination.pageSize,
        pagination.pageSize
      );
      
      const total = await query.count();
      
      this.state.update({
        events,
        pagination: { ...pagination, total },
        loading: false
      });
      
      this.notify({ type: 'EVENTS_LOADED', events, total });
      
    } catch (error) {
      this.state.update({
        error: error.message,
        loading: false
      });
      
      this.notify({ type: 'ERROR', error });
    }
  }
  
  // Create new event
  async createEvent(eventData) {
    try {
      // Validate event data
      const validation = await this.validateEventData(eventData);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Create event
      const event = await Event.create({
        user_id: await this.getCurrentUserId(),
        ...eventData
      });
      
      // Add to current events list
      const events = this.state.get('events');
      this.state.set('events', [event, ...events]);
      
      this.notify({ type: 'EVENT_CREATED', event });
      
      return event;
      
    } catch (error) {
      this.state.set('error', error.message);
      this.notify({ type: 'ERROR', error });
      throw error;
    }
  }
  
  // Update existing event
  async updateEvent(eventId, updates) {
    try {
      const validation = await this.validateEventData(updates, eventId);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }
      
      const updatedEvent = await Event.update(eventId, updates);
      
      // Update in events list
      const events = this.state.get('events');
      const updatedEvents = events.map(event => 
        event.event_id === eventId ? updatedEvent : event
      );
      
      this.state.set('events', updatedEvents);
      
      // Update selected event if it's the one being updated
      if (this.state.get('selectedEvent')?.event_id === eventId) {
        this.state.set('selectedEvent', updatedEvent);
      }
      
      this.notify({ type: 'EVENT_UPDATED', event: updatedEvent });
      
      return updatedEvent;
      
    } catch (error) {
      this.state.set('error', error.message);
      this.notify({ type: 'ERROR', error });
      throw error;
    }
  }
  
  // Delete event
  async deleteEvent(eventId) {
    try {
      await Event.delete(eventId);
      
      // Remove from events list
      const events = this.state.get('events');
      const filteredEvents = events.filter(event => event.event_id !== eventId);
      this.state.set('events', filteredEvents);
      
      // Clear selected event if it was deleted
      if (this.state.get('selectedEvent')?.event_id === eventId) {
        this.state.set('selectedEvent', null);
      }
      
      this.notify({ type: 'EVENT_DELETED', eventId });
      
    } catch (error) {
      this.state.set('error', error.message);
      this.notify({ type: 'ERROR', error });
      throw error;
    }
  }
  
  // Validate event data
  async validateEventData(data, eventId = null) {
    const errors = [];
    
    // Required fields
    if (!data.title || data.title.trim().length === 0) {
      errors.push('Title is required');
    }
    
    if (data.title && data.title.length > 255) {
      errors.push('Title must be 255 characters or less');
    }
    
    // Priority validation
    if (data.priority !== undefined) {
      if (!Number.isInteger(data.priority) || data.priority < 1 || data.priority > 5) {
        errors.push('Priority must be an integer between 1 and 5');
      }
    }
    
    // Budget validation
    if (data.budget !== undefined) {
      if (typeof data.budget !== 'number' || data.budget < 0) {
        errors.push('Budget must be a non-negative number');
      }
    }
    
    // Due date validation
    if (data.due_date !== undefined) {
      if (!(data.due_date instanceof Date) && isNaN(new Date(data.due_date))) {
        errors.push('Due date must be a valid date');
      }
    }
    
    // Event type validation
    if (data.event_type_id) {
      const eventType = await EventType.findById(data.event_type_id);
      if (!eventType) {
        errors.push('Invalid event type');
      } else {
        // Validate custom fields against event type schema
        const fieldValidation = await this.validateCustomFields(data.custom_fields, eventType);
        errors.push(...fieldValidation.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // Validate custom fields against event type schema
  async validateCustomFields(customFields = {}, eventType) {
    const errors = [];
    
    // Get required fields for this event type
    const entityFields = await db.entity_fields
      .where('[entity_type+entity_id]')
      .equals(['event_type', eventType.event_type_id])
      .toArray();
    
    for (const entityField of entityFields) {
      const fieldDef = await db.field_definitions.get(entityField.field_id);
      const fieldValue = customFields[fieldDef.field_name];
      
      // Check required fields
      if (entityField.is_required && (fieldValue === undefined || fieldValue === null || fieldValue === '')) {
        errors.push(`${entityField.display_name || fieldDef.display_name} is required`);
        continue;
      }
      
      // Validate field type and schema
      if (fieldValue !== undefined && fieldValue !== null) {
        const validation = this.validateFieldValue(fieldValue, fieldDef);
        if (!validation.valid) {
          errors.push(`${entityField.display_name || fieldDef.display_name}: ${validation.error}`);
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  validateFieldValue(value, fieldDef) {
    const { field_type, validation_schema } = fieldDef;
    
    switch (field_type) {
      case 'text':
        if (typeof value !== 'string') return { valid: false, error: 'Must be text' };
        if (validation_schema.maxLength && value.length > validation_schema.maxLength) {
          return { valid: false, error: `Must be ${validation_schema.maxLength} characters or less` };
        }
        break;
        
      case 'number':
        if (typeof value !== 'number') return { valid: false, error: 'Must be a number' };
        if (validation_schema.min && value < validation_schema.min) {
          return { valid: false, error: `Must be at least ${validation_schema.min}` };
        }
        if (validation_schema.max && value > validation_schema.max) {
          return { valid: false, error: `Must be no more than ${validation_schema.max}` };
        }
        break;
        
      case 'date':
        if (!(value instanceof Date) && isNaN(new Date(value))) {
          return { valid: false, error: 'Must be a valid date' };
        }
        break;
        
      case 'select':
        if (validation_schema.options) {
          const validValues = validation_schema.options.map(opt => opt.value);
          if (!validValues.includes(value)) {
            return { valid: false, error: 'Must be one of the allowed options' };
          }
        }
        break;
        
      case 'currency':
        if (typeof value !== 'number' || value < 0) {
          return { valid: false, error: 'Must be a non-negative amount' };
        }
        break;
    }
    
    return { valid: true };
  }
  
  // Filter and search methods
  setFilter(filterName, value) {
    const filters = { ...this.state.get('filters') };
    filters[filterName] = value;
    this.state.set('filters', filters);
    
    // Reload events with new filters
    this.loadEvents();
  }
  
  clearFilters() {
    this.state.set('filters', {
      search: '',
      priority: null,
      due_date_range: null,
      tags: [],
      status: 'active'
    });
    
    this.loadEvents();
  }
  
  // Pagination
  nextPage() {
    const pagination = this.state.get('pagination');
    if ((pagination.page + 1) * pagination.pageSize < pagination.total) {
      this.state.set('pagination', {
        ...pagination,
        page: pagination.page + 1
      });
      this.loadEvents();
    }
  }
  
  previousPage() {
    const pagination = this.state.get('pagination');
    if (pagination.page > 0) {
      this.state.set('pagination', {
        ...pagination,
        page: pagination.page - 1
      });
      this.loadEvents();
    }
  }
  
  async getCurrentUserId() {
    // Implementation depends on auth system
    return 1; // Default user for now
  }
}

export { EventViewModel };
```

---

## Universal Systems Development

### Tag System Implementation

```javascript
// src/models/Tag.js
import { BaseModel } from './base/BaseModel.js';

class TagModel extends BaseModel {
  constructor() {
    super('tags', 'tag_id');
  }
  
  // Find or create tag by name
  async findOrCreate(userId, tagName, color = '#95a5a6') {
    const existing = await this.table
      .where('[user_id+name]')
      .equals([userId, tagName])
      .first();
    
    if (existing) {
      return existing;
    }
    
    return await this.create({
      user_id: userId,
      name: tagName,
      color: color
    });
  }
  
  // Get all tags for user with usage counts
  async findByUserWithCounts(userId) {
    const tags = await this.table.where('user_id').equals(userId).toArray();
    const tagsWithCounts = [];
    
    for (const tag of tags) {
      const usageCount = await db.tag_assignments
        .where('tag_id')
        .equals(tag.tag_id)
        .count();
      
      tagsWithCounts.push({
        ...tag,
        usage_count: usageCount
      });
    }
    
    return tagsWithCounts.sort((a, b) => b.usage_count - a.usage_count);
  }
  
  // Find entities by tag
  async findEntitiesByTag(tagId) {
    const assignments = await db.tag_assignments
      .where('tag_id')
      .equals(tagId)
      .toArray();
    
    const entities = { events: [], items: [] };
    
    for (const assignment of assignments) {
      if (assignment.taggable_type === 'event') {
        const event = await db.events.get(assignment.taggable_id);
        if (event) entities.events.push(event);
      } else if (assignment.taggable_type === 'item') {
        const item = await db.items.get(assignment.taggable_id);
        if (item) entities.items.push(item);
      }
    }
    
    return entities;
  }
}

export const Tag = new TagModel();
```

### Tag Assignment System

```javascript
// src/models/TagAssignment.js
class TagAssignmentModel {
  constructor() {
    this.table = db.tag_assignments;
  }
  
  // Assign tag to entity
  async assign(tagId, entityType, entityId) {
    try {
      await this.table.add({
        tag_id: tagId,
        taggable_type: entityType,
        taggable_id: entityId,
        created_at: new Date()
      });
    } catch (error) {
      // Handle duplicate key error (tag already assigned)
      if (error.name === 'ConstraintError') {
        return; // Already assigned, no action needed
      }
      throw error;
    }
  }
  
  // Remove tag from entity
  async unassign(tagId, entityType, entityId) {
    await this.table
      .where('[tag_id+taggable_type+taggable_id]')
      .equals([tagId, entityType, entityId])
      .delete();
  }
  
  // Get all tags for entity
  async getTagsForEntity(entityType, entityId) {
    const assignments = await this.table
      .where('[taggable_type+taggable_id]')
      .equals([entityType, entityId])
      .toArray();
    
    const tagIds = assignments.map(a => a.tag_id);
    return await db.tags.where('tag_id').anyOf(tagIds).toArray();
  }
  
  // Bulk assign tags from string array
  async assignTagsFromNames(userId, entityType, entityId, tagNames) {
    const assignments = [];
    
    for (const tagName of tagNames) {
      const tag = await Tag.findOrCreate(userId, tagName);
      assignments.push({
        tag_id: tag.tag_id,
        taggable_type: entityType,
        taggable_id: entityId
      });
    }
    
    // Remove existing assignments
    await this.table
      .where('[taggable_type+taggable_id]')
      .equals([entityType, entityId])
      .delete();
    
    // Add new assignments
    await this.table.bulkAdd(assignments);
  }
  
  // Extract hashtags from text and assign
  async extractAndAssignHashtags(userId, entityType, entityId, text) {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtags = [];
    let match;
    
    while ((match = hashtagRegex.exec(text)) !== null) {
      hashtags.push(match[1].toLowerCase());
    }
    
    if (hashtags.length > 0) {
      await this.assignTagsFromNames(userId, entityType, entityId, hashtags);
    }
    
    return hashtags;
  }
}

export const TagAssignment = new TagAssignmentModel();
```

### Quick Capture System

```javascript
// src/viewmodels/QuickCaptureViewModel.js
import { BaseViewModel } from './base/BaseViewModel.js';
import { Event } from '../models/Event.js';
import { Item } from '../models/Item.js';
import { TagAssignment } from '../models/TagAssignment.js';
import { parseDate, parseCurrency, parseLocation } from '../utils/parseUtils.js';

class QuickCaptureViewModel extends BaseViewModel {
  constructor() {
    super();
    
    this.state.update({
      input: '',
      parsing: false,
      preview: null,
      suggestions: []
    });
  }
  
  // Parse input and show preview
  async parseInput(input) {
    this.state.set('parsing', true);
    this.state.set('input', input);
    
    try {
      const parsed = await this.analyzeInput(input);
      this.state.set('preview', parsed);
      this.notify({ type: 'INPUT_PARSED', parsed });
    } catch (error) {
      this.state.set('error', error.message);
    } finally {
      this.state.set('parsing', false);
    }
  }
  
  // Analyze input and determine entity type and fields
  async analyzeInput(input) {
    const analysis = {
      original_input: input,
      entity_type: this.determineEntityType(input),
      title: '',
      description: '',
      tags: [],
      fields: {},
      confidence: 0
    };
    
    // Extract hashtags
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtags = [];
    let cleanText = input.replace(hashtagRegex, (match, tag) => {
      hashtags.push(tag.toLowerCase());
      return '';
    }).trim();
    
    analysis.tags = hashtags;
    
    // Extract due date
    const dateResult = parseDate(cleanText);
    if (dateResult.date) {
      analysis.fields.due_date = dateResult.date;
      cleanText = dateResult.remainingText;
    }
    
    // Extract currency/budget
    const currencyResult = parseCurrency(cleanText);
    if (currencyResult.amount) {
      analysis.fields.budget = currencyResult.amount;
      cleanText = currencyResult.remainingText;
    }
    
    // Extract location
    const locationResult = parseLocation(cleanText);
    if (locationResult.location) {
      analysis.fields.location = locationResult.location;
      cleanText = locationResult.remainingText;
    }
    
    // Extract priority
    const priorityMatch = cleanText.match(/priority:(\d+|low|medium|high)/i);
    if (priorityMatch) {
      const priorityValue = priorityMatch[1].toLowerCase();
      analysis.fields.priority = this.parsePriority(priorityValue);
      cleanText = cleanText.replace(priorityMatch[0], '').trim();
    }
    
    // Remaining text becomes title and description
    const words = cleanText.split(' ').filter(word => word.length > 0);
    if (words.length > 0) {
      // First part is title, rest is description
      if (words.length <= 5) {
        analysis.title = words.join(' ');
      } else {
        analysis.title = words.slice(0, 5).join(' ');
        analysis.description = words.slice(5).join(' ');
      }
    }
    
    // Calculate confidence based on extracted information
    analysis.confidence = this.calculateConfidence(analysis);
    
    return analysis;
  }
  
  // Determine if input represents an event or item
  determineEntityType(input) {
    const eventIndicators = [
      'call', 'meet', 'buy', 'do', 'complete', 'finish', 'start',
      'schedule', 'plan', 'review', 'check', 'visit', 'go to',
      'reminder', 'appointment', 'deadline', 'due:'
    ];
    
    const itemIndicators = [
      'book', 'laptop', 'chair', 'desk', 'phone', 'car',
      'tool', 'equipment', 'device', 'machine', 'software',
      'account', 'subscription', 'membership'
    ];
    
    const lowerInput = input.toLowerCase();
    
    const eventScore = eventIndicators.filter(indicator => 
      lowerInput.includes(indicator)
    ).length;
    
    const itemScore = itemIndicators.filter(indicator => 
      lowerInput.includes(indicator)
    ).length;
    
    // Check for action verbs (events) vs nouns (items)
    const hasActionVerb = /^(call|meet|buy|do|complete|finish|start|schedule|plan|review|check|visit|go|create|make|send|write|read|study)/i.test(input);
    
    if (hasActionVerb || eventScore > itemScore) {
      return 'event';
    } else if (itemScore > eventScore) {
      return 'item';
    }
    
    // Default to event for ambiguous cases
    return 'event';
  }
  
  parsePriority(value) {
    if (typeof value === 'number') return Math.max(1, Math.min(5, value));
    
    switch (value.toLowerCase()) {
      case 'low': return 2;
      case 'medium': return 3;
      case 'high': return 4;
      default: return parseInt(value) || 3;
    }
  }
  
  calculateConfidence(analysis) {
    let score = 0;
    
    // Title extracted
    if (analysis.title) score += 30;
    
    // Tags extracted
    if (analysis.tags.length > 0) score += 20;
    
    // Due date extracted
    if (analysis.fields.due_date) score += 20;
    
    // Budget/value extracted
    if (analysis.fields.budget) score += 15;
    
    // Location extracted
    if (analysis.fields.location) score += 10;
    
    // Priority extracted
    if (analysis.fields.priority) score += 5;
    
    return Math.min(100, score);
  }
  
  // Create entity from parsed input
  async createFromParsed(parsed) {
    try {
      const userId = await this.getCurrentUserId();
      
      let entity;
      if (parsed.entity_type === 'event') {
        entity = await Event.create({
          user_id: userId,
          title: parsed.title,
          description: parsed.description || null,
          due_date: parsed.fields.due_date || null,
          priority: parsed.fields.priority || 3,
          budget: parsed.fields.budget || null,
          location: parsed.fields.location || null,
          status: 'active'
        });
      } else {
        entity = await Item.create({
          user_id: userId,
          name: parsed.title,
          description: parsed.description || null,
          value: parsed.fields.budget || null,
          location: parsed.fields.location || null,
          quantity: 1,
          status: 'active'
        });
      }
      
      // Assign tags
      if (parsed.tags.length > 0) {
        await TagAssignment.assignTagsFromNames(
          userId,
          parsed.entity_type,
          entity[`${parsed.entity_type}_id`],
          parsed.tags
        );
      }
      
      this.state.set('input', '');
      this.state.set('preview', null);
      
      this.notify({ 
        type: 'ENTITY_CREATED', 
        entity, 
        entityType: parsed.entity_type 
      });
      
      return entity;
      
    } catch (error) {
      this.state.set('error', error.message);
      this.notify({ type: 'ERROR', error });
      throw error;
    }
  }
  
  async getCurrentUserId() {
    return 1; // Default user for now
  }
}

export { QuickCaptureViewModel };
```

---

## Performance Optimization

### Database Performance

```javascript
// src/utils/performanceUtils.js
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = process.env.ENABLE_PERFORMANCE_MONITORING === 'true';
  }
  
  // Time database operations
  async timeOperation(operationName, operation) {
    if (!this.enabled) {
      return await operation();
    }
    
    const startTime = performance.now();
    const result = await operation();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.recordMetric(operationName, duration);
    
    if (duration > 100) { // Log slow operations
      console.warn(`Slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }
  
  recordMetric(name, value) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    const values = this.metrics.get(name);
    values.push({
      value,
      timestamp: new Date()
    });
    
    // Keep only last 100 measurements
    if (values.length > 100) {
      values.shift();
    }
  }
  
  getMetrics(name) {
    const values = this.metrics.get(name) || [];
    if (values.length === 0) return null;
    
    const durations = values.map(v => v.value);
    return {
      count: durations.length,
      average: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      latest: durations[durations.length - 1]
    };
  }
  
  getAllMetrics() {
    const result = {};
    for (const [name, values] of this.metrics) {
      result[name] = this.getMetrics(name);
    }
    return result;
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Usage in models
class OptimizedEventModel extends BaseModel {
  async findByPriority(userId, minPriority) {
    return performanceMonitor.timeOperation('event_find_by_priority', async () => {
      return this.table
        .where('user_id').equals(userId)
        .and(event => event.priority >= minPriority)
        .toArray();
    });
  }
}
```

### Query Optimization Patterns

```javascript
// src/models/base/OptimizedQueries.js
class OptimizedQueries {
  // Use real columns for common filters (10x faster)
  static async findEventsByCommonCriteria(userId, criteria) {
    let query = db.events.where('user_id').equals(userId);
    
    // Priority filter (real column - very fast)
    if (criteria.minPriority) {
      query = query.and(event => event.priority >= criteria.minPriority);
    }
    
    // Due date range (real column - very fast)
    if (criteria.dueDateRange) {
      query = query.and(event => 
        event.due_date >= criteria.dueDateRange.start &&
        event.due_date <= criteria.dueDateRange.end
      );
    }
    
    // Location filter (real column - very fast)
    if (criteria.location) {
      query = query.and(event => event.location === criteria.location);
    }
    
    // Budget range (real column - very fast)
    if (criteria.budgetRange) {
      query = query.and(event => 
        event.budget >= criteria.budgetRange.min &&
        event.budget <= criteria.budgetRange.max
      );
    }
    
    // Status filter (real column - very fast)
    if (criteria.status) {
      query = query.and(event => event.status === criteria.status);
    }
    
    return query.toArray();
  }
  
  // Use JSONB only when necessary (slower but flexible)
  static async findEventsByCustomFields(userId, customCriteria) {
    return db.events
      .where('user_id').equals(userId)
      .and(event => {
        for (const [field, value] of Object.entries(customCriteria)) {
          if (event.custom_fields?.[field] !== value) {
            return false;
          }
        }
        return true;
      })
      .toArray();
  }
  
  // Combine real columns with JSONB for optimal performance
  static async findEventsOptimized(userId, criteria) {
    // First filter by real columns (fast)
    let events = await this.findEventsByCommonCriteria(userId, criteria);
    
    // Then filter by custom fields if needed (slower, but on smaller dataset)
    if (criteria.customFields && Object.keys(criteria.customFields).length > 0) {
      events = events.filter(event => {
        for (const [field, value] of Object.entries(criteria.customFields)) {
          if (event.custom_fields?.[field] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    return events;
  }
  
  // Optimized tag queries
  static async findEventsByTags(userId, tagNames) {
    // Get tag IDs first
    const tags = await db.tags
      .where('user_id').equals(userId)
      .and(tag => tagNames.includes(tag.name))
      .toArray();
    
    const tagIds = tags.map(t => t.tag_id);
    
    if (tagIds.length === 0) return [];
    
    // Get tagged event IDs
    const assignments = await db.tag_assignments
      .where('tag_id').anyOf(tagIds)
      .and(assignment => assignment.taggable_type === 'event')
      .toArray();
    
    const eventIds = [...new Set(assignments.map(a => a.taggable_id))];
    
    // Get events by IDs (fast)
    return db.events
      .where('event_id').anyOf(eventIds)
      .and(event => event.user_id === userId)
      .toArray();
  }
}

export { OptimizedQueries };
```

### Memory Management

```javascript
// src/utils/memoryManager.js
class MemoryManager {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 1000;
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutes
    
    // Periodic cleanup
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }
  
  // Intelligent caching for frequently accessed data
  async getCachedOrFetch(key, fetchFunction, ttl = 5 * 60 * 1000) {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    
    const data = await fetchFunction();
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
    
    return data;
  }
  
  // Cache event types (rarely change)
  async getEventTypes(userId) {
    return this.getCachedOrFetch(
      `event_types_${userId}`,
      () => db.event_types.where('user_id').equals(userId).toArray(),
      15 * 60 * 1000 // 15 minutes
    );
  }
  
  // Cache field definitions (rarely change)
  async getFieldDefinitions() {
    return this.getCachedOrFetch(
      'field_definitions',
      () => db.field_definitions.toArray(),
      30 * 60 * 1000 // 30 minutes
    );
  }
  
  // Cache user preferences (moderate change frequency)
  async getUserPreferences(userId) {
    return this.getCachedOrFetch(
      `user_preferences_${userId}`,
      () => db.users.get(userId),
      5 * 60 * 1000 // 5 minutes
    );
  }
  
  // Invalidate cache when data changes
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  
  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > cached.ttl) {
        this.cache.delete(key);
      }
    }
    
    // Limit cache size
    if (this.cache.size > this.maxCacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, this.cache.size - this.maxCacheSize);
      for (const [key] of toDelete) {
        this.cache.delete(key);
      }
    }
  }
  
  // Get memory usage statistics
  getStats() {
    return {
      cacheSize: this.cache.size,
      maxCacheSize: this.maxCacheSize,
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  estimateMemoryUsage() {
    let totalSize = 0;
    for (const cached of this.cache.values()) {
      totalSize += JSON.stringify(cached.data).length;
    }
    return totalSize;
  }
}

export const memoryManager = new MemoryManager();
```

---

## UI Development Guidelines

### Component Architecture (Future)

```javascript
// src/views/components/base/BaseComponent.js
class BaseComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.state = {};
    this.subscriptions = new Set();
  }
  
  connectedCallback() {
    this.render();
    this.bindEvents();
  }
  
  disconnectedCallback() {
    this.cleanup();
  }
  
  // State management
  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.render();
  }
  
  // Event binding
  bindEvents() {
    // Override in subclasses
  }
  
  // Cleanup
  cleanup() {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }
  
  // Rendering
  render() {
    this.shadowRoot.innerHTML = `
      <style>${this.getStyles()}</style>
      ${this.getTemplate()}
    `;
  }
  
  getStyles() {
    return ''; // Override in subclasses
  }
  
  getTemplate() {
    return ''; // Override in subclasses
  }
  
  // ViewModel integration
  connectToViewModel(viewModel) {
    const unsubscribe = viewModel.subscribe((change) => {
      this.onViewModelChange(change);
    });
    this.subscriptions.add(unsubscribe);
  }
  
  onViewModelChange(change) {
    // Override in subclasses
  }
}

// Example component
class EventListComponent extends BaseComponent {
  constructor() {
    super();
    this.state = {
      events: [],
      loading: false,
      selectedEvent: null
    };
  }
  
  connectedCallback() {
    super.connectedCallback();
    
    // Connect to EventViewModel
    this.connectToViewModel(window.app.eventViewModel);
  }
  
  onViewModelChange(change) {
    switch (change.type) {
      case 'EVENTS_LOADED':
        this.setState({ 
          events: change.events,
          loading: false 
        });
        break;
        
      case 'EVENT_CREATED':
        this.setState({
          events: [change.event, ...this.state.events]
        });
        break;
        
      case 'EVENT_UPDATED':
        this.setState({
          events: this.state.events.map(event =>
            event.event_id === change.event.event_id ? change.event : event
          )
        });
        break;
    }
  }
  
  bindEvents() {
    this.shadowRoot.addEventListener('click', (e) => {
      if (e.target.classList.contains('event-item')) {
        const eventId = parseInt(e.target.dataset.eventId);
        this.selectEvent(eventId);
      }
    });
  }
  
  selectEvent(eventId) {
    const event = this.state.events.find(e => e.event_id === eventId);
    this.setState({ selectedEvent: event });
    
    this.dispatchEvent(new CustomEvent('event-selected', {
      detail: { event },
      bubbles: true
    }));
  }
  
  getTemplate() {
    if (this.state.loading) {
      return '<div class="loading">Loading events...</div>';
    }
    
    return `
      <div class="event-list">
        ${this.state.events.map(event => `
          <div class="event-item" data-event-id="${event.event_id}">
            <div class="event-title">${event.title}</div>
            <div class="event-meta">
              ${event.due_date ? `<span class="due-date">${new Date(event.due_date).toLocaleDateString()}</span>` : ''}
              ${event.priority ? `<span class="priority priority-${event.priority}">P${event.priority}</span>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  getStyles() {
    return `
      .event-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .event-item {
        padding: 12px;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .event-item:hover {
        background-color: #f5f5f5;
      }
      
      .event-title {
        font-weight: 500;
        margin-bottom: 4px;
      }
      
      .event-meta {
        display: flex;
        gap: 8px;
        font-size: 0.875rem;
        color: #666;
      }
      
      .priority {
        padding: 2px 6px;
        border-radius: 2px;
        font-size: 0.75rem;
        font-weight: bold;
      }
      
      .priority-1, .priority-2 { background: #e8f5e8; color: #2e7d2e; }
      .priority-3 { background: #fff3cd; color: #856404; }
      .priority-4, .priority-5 { background: #f8d7da; color: #721c24; }
    `;
  }
}

customElements.define('event-list', EventListComponent);
```

### CSS Architecture

```css
/* public/styles/main.css */

/* CSS Custom Properties for Theming */
:root {
  /* Colors */
  --color-primary: #3498db;
  --color-secondary: #2ecc71;
  --color-accent: #e74c3c;
  --color-warning: #f39c12;
  --color-success: #27ae60;
  --color-error: #e74c3c;
  
  /* Grays */
  --color-gray-50: #f8f9fa;
  --color-gray-100: #e9ecef;
  --color-gray-200: #dee2e6;
  --color-gray-300: #ced4da;
  --color-gray-400: #adb5bd;
  --color-gray-500: #6c757d;
  --color-gray-600: #495057;
  --color-gray-700: #343a40;
  --color-gray-800: #212529;
  --color-gray-900: #000000;
  
  /* Typography */
  --font-family-base: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-family-mono: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;
  
  /* Spacing */
  --spacing-1: 0.25rem;
  --spacing-2: 0.5rem;
  --spacing-3: 0.75rem;
  --spacing-4: 1rem;
  --spacing-5: 1.25rem;
  --spacing-6: 1.5rem;
  --spacing-8: 2rem;
  --spacing-10: 2.5rem;
  --spacing-12: 3rem;
  
  /* Layout */
  --border-radius: 4px;
  --border-radius-lg: 8px;
  --border-width: 1px;
  --box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  --box-shadow-lg: 0 4px 6px rgba(0, 0, 0, 0.1);
  
  /* Animation */
  --transition-fast: 0.15s ease;
  --transition-base: 0.3s ease;
  --transition-slow: 0.5s ease;
}

/* Reset and Base Styles */
*, *::before, *::after {
  box-sizing: border-box;
}

html {
  font-family: var(--font-family-base);
  font-size: var(--font-size-base);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  padding: 0;
  color: var(--color-gray-800);
  background-color: var(--color-gray-50);
}

/* Typography */
h1, h2, h3, h4, h5, h6 {
  margin: 0 0 var(--spacing-4) 0;
  font-weight: 600;
  line-height: 1.3;
}

h1 { font-size: var(--font-size-3xl); }
h2 { font-size: var(--font-size-2xl); }
h3 { font-size: var(--font-size-xl); }
h4 { font-size: var(--font-size-lg); }
h5 { font-size: var(--font-size-base); }
h6 { font-size: var(--font-size-sm); }

p {
  margin: 0 0 var(--spacing-4) 0;
}

/* Layout Components */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-4);
}

.grid {
  display: grid;
  gap: var(--spacing-4);
}

.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.gap-4 {
  gap: var(--spacing-4);
}

/* Form Components */
.form-group {
  margin-bottom: var(--spacing-4);
}

.form-label {
  display: block;
  margin-bottom: var(--spacing-2);
  font-weight: 500;
  color: var(--color-gray-700);
}

.form-input {
  width: 100%;
  padding: var(--spacing-3);
  border: var(--border-width) solid var(--color-gray-300);
  border-radius: var(--border-radius);
  font-size: var(--font-size-base);
  transition: border-color var(--transition-fast);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.form-input:invalid {
  border-color: var(--color-error);
}

/* Button Components */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-3) var(--spacing-4);
  border: var(--border-width) solid transparent;
  border-radius: var(--border-radius);
  font-size: var(--font-size-base);
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #2980b9;
}

.btn-secondary {
  background-color: var(--color-gray-200);
  color: var(--color-gray-800);
}

.btn-secondary:hover:not(:disabled) {
  background-color: var(--color-gray-300);
}

.btn-success {
  background-color: var(--color-success);
  color: white;
}

.btn-danger {
  background-color: var(--color-error);
  color: white;
}

.btn-sm {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
}

.btn-lg {
  padding: var(--spacing-4) var(--spacing-6);
  font-size: var(--font-size-lg);
}

/* Card Component */
.card {
  background: white;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--box-shadow);
  overflow: hidden;
}

.card-header {
  padding: var(--spacing-4);
  border-bottom: var(--border-width) solid var(--color-gray-200);
  background-color: var(--color-gray-50);
}

.card-body {
  padding: var(--spacing-4);
}

.card-footer {
  padding: var(--spacing-4);
  border-top: var(--border-width) solid var(--color-gray-200);
  background-color: var(--color-gray-50);
}

/* Utility Classes */
.text-xs { font-size: var(--font-size-xs); }
.text-sm { font-size: var(--font-size-sm); }
.text-lg { font-size: var(--font-size-lg); }
.text-xl { font-size: var(--font-size-xl); }

.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-bold { font-weight: 700; }

.text-gray-500 { color: var(--color-gray-500); }
.text-gray-600 { color: var(--color-gray-600); }
.text-gray-700 { color: var(--color-gray-700); }

.bg-white { background-color: white; }
.bg-gray-50 { background-color: var(--color-gray-50); }
.bg-gray-100 { background-color: var(--color-gray-100); }

.border { border: var(--border-width) solid var(--color-gray-300); }
.border-t { border-top: var(--border-width) solid var(--color-gray-300); }
.border-b { border-bottom: var(--border-width) solid var(--color-gray-300); }

.rounded { border-radius: var(--border-radius); }
.rounded-lg { border-radius: var(--border-radius-lg); }

.shadow { box-shadow: var(--box-shadow); }
.shadow-lg { box-shadow: var(--box-shadow-lg); }

.hidden { display: none; }
.block { display: block; }
.inline { display: inline; }
.inline-block { display: inline-block; }

/* Responsive Design */
@media (min-width: 768px) {
  .md\:grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .md\:grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .lg\:grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Animation Classes */
.fade-in {
  animation: fadeIn var(--transition-base);
}

.slide-up {
  animation: slideUp var(--transition-base);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Loading States */
.loading {
  position: relative;
  color: transparent;
}

.loading::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-gray-300);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: translate(-50%, -50%) rotate(360deg); }
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  :root {
    --color-gray-50: #212529;
    --color-gray-100: #343a40;
    --color-gray-200: #495057;
    --color-gray-300: #6c757d;
    --color-gray-800: #f8f9fa;
    --color-gray-900: #ffffff;
  }
  
  body {
    background-color: var(--color-gray-50);
    color: var(--color-gray-800);
  }
  
  .card {
    background-color: var(--color-gray-100);
  }
}
```

---

## Testing Strategy

### Unit Testing Setup

```javascript
// tests/unit/models/Event.test.js
import { Event } from '../../../src/models/Event.js';
import { db } from '../../../src/database/schema.js';

describe('Event Model', () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.delete();
    await db.open();
    
    // Seed with test user
    await db.users.add({
      user_id: 1,
      username: 'testuser',
      email: 'test@example.com',
      password_hash: 'hashed_password'
    });
  });
  
  afterEach(async () => {
    await db.delete();
  });
  
  describe('create', () => {
    it('should create a new event with required fields', async () => {
      const eventData = {
        user_id: 1,
        title: 'Test Event',
        description: 'Test Description',
        priority: 3,
        status: 'active'
      };
      
      const event = await Event.create(eventData);
      
      expect(event).toMatchObject(eventData);
      expect(event.event_id).toBeDefined();
      expect(event.created_at).toBeInstanceOf(Date);
      expect(event.updated_at).toBeInstanceOf(Date);
    });
    
    it('should log the creation operation', async () => {
      const eventData = {
        user_id: 1,
        title: 'Test Event'
      };
      
      const event = await Event.create(eventData);
      
      const logs = await db.operation_logs
        .where('entity_id')
        .equals(event.event_id)
        .toArray();
      
      expect(logs).toHaveLength(1);
      expect(logs[0].operation_type).toBe('CREATE');
      expect(logs[0].entity_type).toBe('event');
    });
    
    it('should handle performance-optimized queries', async () => {
      // Create test events
      const events = [];
      for (let i = 1; i <= 5; i++) {
        events.push(await Event.create({
          user_id: 1,
          title: `Event ${i}`,
          priority: i,
          budget: i * 100,
          due_date: new Date(Date.now() + i * 24 * 60 * 60 * 1000)
        }));
      }
      
      // Test real column filtering
      const highPriorityEvents = await Event.findByPriorityAndDueDate(
        1,
        4,
        new Date(),
        new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      );
      
      expect(highPriorityEvents).toHaveLength(2);
      expect(highPriorityEvents.every(e => e.priority >= 4)).toBe(true);
    });
  });
  
  describe('relationships', () => {
    it('should find events with relationships', async () => {
      // Create events
      const event1 = await Event.create({
        user_id: 1,
        title: 'Main Event'
      });
      
      const event2 = await Event.create({
        user_id: 1,
        title: 'Dependent Event'
      });
      
      // Create relationship
      await db.links.add({
        from_type: 'event',
        from_id: event1.event_id,
        to_type: 'event',
        to_id: event2.event_id,
        relationship_type: 'depends_on'
      });
      
      // Test relationship query
      const eventWithRelationships = await Event.findWithRelationships(event1.event_id);
      
      expect(eventWithRelationships.related_events).toHaveLength(1);
      expect(eventWithRelationships.related_events[0].title).toBe('Dependent Event');
      expect(eventWithRelationships.related_events[0].relationship).toBe('depends_on');
    });
  });
});
```

### Integration Testing

```javascript
// tests/integration/quickCapture.test.js
import { QuickCaptureViewModel } from '../../src/viewmodels/QuickCaptureViewModel.js';
import { Event } from '../../src/models/Event.js';
import { Item } from '../../src/models/Item.js';
import { Tag } from '../../src/models/Tag.js';
import { db } from '../../src/database/schema.js';

describe('Quick Capture Integration', () => {
  let quickCapture;
  
  beforeEach(async () => {
    await db.delete();
    await db.open();
    
    // Seed test user
    await db.users.add({
      user_id: 1,
      username: 'testuser',
      email: 'test@example.com'
    });
    
    quickCapture = new QuickCaptureViewModel();
  });
  
  afterEach(async () => {
    quickCapture.dispose();
    await db.delete();
  });
  
  it('should parse and create event from natural language input', async () => {
    const input = 'Call John about project #work #urgent due:tomorrow $50 @office';
    
    // Parse input
    await quickCapture.parseInput(input);
    const parsed = quickCapture.state.get('preview');
    
    expect(parsed.entity_type).toBe('event');
    expect(parsed.title).toBe('Call John about project');
    expect(parsed.tags).toEqual(['work', 'urgent']);
    expect(parsed.fields.budget).toBe(50);
    expect(parsed.fields.location).toBe('office');
    expect(parsed.fields.due_date).toBeInstanceOf(Date);
    
    // Create entity
    const event = await quickCapture.createFromParsed(parsed);
    
    expect(event.title).toBe('Call John about project');
    expect(event.budget).toBe(50);
    expect(event.location).toBe('office');
    expect(event.due_date).toBeInstanceOf(Date);
    
    // Verify tags were created and assigned
    const tags = await Tag.findByUserWithCounts(1);
    expect(tags.map(t => t.name)).toEqual(expect.arrayContaining(['work', 'urgent']));
  });
  
  it('should handle item creation from input', async () => {
    const input = 'MacBook Pro 2023 $2499 #tech #equipment';
    
    await quickCapture.parseInput(input);
    const parsed = quickCapture.state.get('preview');
    
    expect(parsed.entity_type).toBe('item');
    expect(parsed.title).toBe('MacBook Pro 2023');
    expect(parsed.fields.budget).toBe(2499);
    expect(parsed.tags).toEqual(['tech', 'equipment']);
    
    const item = await quickCapture.createFromParsed(parsed);
    
    expect(item.name).toBe('MacBook Pro 2023');
    expect(item.value).toBe(2499);
  });
  
  it('should handle complex parsing scenarios', async () => {
    const testCases = [
      {
        input: 'Meeting with team @conference-room due:friday 2pm #work priority:high',
        expected: {
          entity_type: 'event',
          title: 'Meeting with team',
          tags: ['work'],
          fields: {
            location: 'conference-room',
            priority: 4
          }
        }
      },
      {
        input: 'Buy groceries milk bread eggs #shopping $25 due:today',
        expected: {
          entity_type: 'event',
          title: 'Buy groceries',
          description: 'milk bread eggs',
          tags: ['shopping'],
          fields: {
            budget: 25
          }
        }
      }
    ];
    
    for (const testCase of testCases) {
      await quickCapture.parseInput(testCase.input);
      const parsed = quickCapture.state.get('preview');
      
      expect(parsed.entity_type).toBe(testCase.expected.entity_type);
      expect(parsed.title).toBe(testCase.expected.title);
      
      if (testCase.expected.description) {
        expect(parsed.description).toBe(testCase.expected.description);
      }
      
      expect(parsed.tags).toEqual(testCase.expected.tags);
      
      for (const [field, value] of Object.entries(testCase.expected.fields)) {
        if (field === 'due_date') {
          expect(parsed.fields[field]).toBeInstanceOf(Date);
        } else {
          expect(parsed.fields[field]).toBe(value);
        }
      }
    }
  });
});
```

### End-to-End Testing (Future)

```javascript
// tests/e2e/userWorkflow.test.js
import { test, expect } from '@playwright/test';

test.describe('User Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Set up test data
    await page.evaluate(() => {
      window.testMode = true;
    });
  });
  
  test('should create event through quick capture', async ({ page }) => {
    // Navigate to quick capture
    await page.fill('[data-testid="quick-capture-input"]', 'Call John #work due:tomorrow');
    await page.press('[data-testid="quick-capture-input"]', 'Enter');
    
    // Verify event appears in list
    await expect(page.locator('[data-testid="event-list"]')).toContainText('Call John');
    
    // Verify tags were applied
    await expect(page.locator('[data-testid="event-item"]').first()).toContainText('work');
  });
  
  test('should filter events by tags', async ({ page }) => {
    // Create test events
    await page.evaluate(() => {
      window.app.createTestEvents();
    });
    
    // Apply tag filter
    await page.click('[data-testid="tag-filter-work"]');
    
    // Verify only work events are shown
    const eventItems = page.locator('[data-testid="event-item"]');
    await expect(eventItems).toHaveCount(3);
    
    // Verify all visible events have work tag
    for (let i = 0; i < 3; i++) {
      await expect(eventItems.nth(i)).toContainText('work');
    }
  });
  
  test('should create collection from current filters', async ({ page }) => {
    // Set up filters
    await page.selectOption('[data-testid="priority-filter"]', '4');
    await page.fill('[data-testid="search-input"]', 'project');
    
    // Save as collection
    await page.click('[data-testid="save-collection-btn"]');
    await page.fill('[data-testid="collection-name"]', 'High Priority Projects');
    await page.click('[data-testid="save-btn"]');
    
    // Verify collection was created
    await page.click('[data-testid="vault-tab"]');
    await expect(page.locator('[data-testid="collections-list"]')).toContainText('High Priority Projects');
    
    // Test collection functionality
    await page.click('[data-testid="collection-item"]:has-text("High Priority Projects")');
    await expect(page.locator('[data-testid="collection-results"]')).toBeVisible();
  });
});
```

---

## API Development

### REST API Structure (Future)

```javascript
// src/api/routes/events.js
class EventsController {
  // GET /api/events
  static async index(req, res) {
    try {
      const { user_id } = req.user;
      const { page = 0, limit = 50, ...filters } = req.query;
      
      const query = Event.query().byUser(user_id);
      
      // Apply filters
      if (filters.priority) {
        query.byPriority(parseInt(filters.priority));
      }
      
      if (filters.due_before) {
        query.dueBetween(new Date(), new Date(filters.due_before));
      }
      
      if (filters.tags) {
        query.withTags(filters.tags.split(','));
      }
      
      const events = await query.paginate(page * limit, limit);
      const total = await query.count();
      
      res.json({
        data: events,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/events
  static async create(req, res) {
    try {
      const { user_id } = req.user;
      const eventData = { ...req.body, user_id };
      
      // Validate input
      const validation = await EventValidator.validate(eventData);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }
      
      const event = await Event.create(eventData);
      
      // Handle tags if provided
      if (req.body.tags) {
        await TagAssignment.assignTagsFromNames(
          user_id,
          'event',
          event.event_id,
          req.body.tags
        );
      }
      
      res.status(201).json({ data: event });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // GET /api/events/:id
  static async show(req, res) {
    try {
      const { user_id } = req.user;
      const { id } = req.params;
      
      const event = await Event.findById(parseInt(id));
      
      if (!event || event.user_id !== user_id) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      // Include relationships and tags
      const eventWithRelationships = await Event.findWithRelationships(event.event_id);
      const tags = await TagAssignment.getTagsForEntity('event', event.event_id);
      
      res.json({
        data: {
          ...eventWithRelationships,
          tags
        }
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // PUT /api/events/:id
  static async update(req, res) {
    try {
      const { user_id } = req.user;
      const { id } = req.params;
      
      const existingEvent = await Event.findById(parseInt(id));
      
      if (!existingEvent || existingEvent.user_id !== user_id) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      // Validate updates
      const validation = await EventValidator.validate(req.body, parseInt(id));
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }
      
      const updatedEvent = await Event.update(parseInt(id), req.body);
      
      // Handle tags if provided
      if (req.body.tags) {
        await TagAssignment.assignTagsFromNames(
          user_id,
          'event',
          updatedEvent.event_id,
          req.body.tags
        );
      }
      
      res.json({ data: updatedEvent });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // DELETE /api/events/:id
  static async destroy(req, res) {
    try {
      const { user_id } = req.user;
      const { id } = req.params;
      
      const event = await Event.findById(parseInt(id));
      
      if (!event || event.user_id !== user_id) {
        return res.status(404).json({ error: 'Event not found' });
      }
      
      await Event.delete(parseInt(id));
      
      res.status(204).send();
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/events/search
  static async search(req, res) {
    try {
      const { user_id } = req.user;
      const { query, filters = {} } = req.body;
      
      let events;
      
      if (query) {
        // Full-text search
        events = await Event.searchByText(user_id, query);
      } else {
        // Filter-based search
        events = await Event.findByFilters(user_id, filters);
      }
      
      res.json({ data: events });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // POST /api/events/bulk
  static async bulkCreate(req, res) {
    try {
      const { user_id } = req.user;
      const { events } = req.body;
      
      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          error: 'Events array is required and must not be empty'
        });
      }
      
      const results = [];
      const errors = [];
      
      for (const [index, eventData] of events.entries()) {
        try {
          const validation = await EventValidator.validate({ ...eventData, user_id });
          
          if (!validation.valid) {
            errors.push({
              index,
              errors: validation.errors
            });
            continue;
          }
          
          const event = await Event.create({ ...eventData, user_id });
          results.push(event);
          
        } catch (error) {
          errors.push({
            index,
            error: error.message
          });
        }
      }
      
      res.status(201).json({
        data: results,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export { EventsController };
```

### API Middleware

```javascript
// src/api/middleware/auth.js
class AuthMiddleware {
  static async authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authorization token required' });
      }
      
      const token = authHeader.substring(7);
      const decoded = await TokenService.verify(token);
      
      req.user = decoded;
      next();
      
    } catch (error) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
  
  static async requirePermission(permission) {
    return (req, res, next) => {
      if (!req.user.permissions.includes(permission)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      next();
    };
  }
}

// src/api/middleware/validation.js
class ValidationMiddleware {
  static validate(schema) {
    return (req, res, next) => {
      const { error, value } = schema.validate(req.body);
      
      if (error) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.details.map(d => d.message)
        });
      }
      
      req.body = value;
      next();
    };
  }
}

// src/api/middleware/rateLimit.js
class RateLimitMiddleware {
  static create(options = {}) {
    const {
      windowMs = 15 * 60 * 1000, // 15 minutes
      maxRequests = 100,
      message = 'Too many requests'
    } = options;
    
    const requests = new Map();
    
    return (req, res, next) => {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old entries
      for (const [ip, timestamps] of requests.entries()) {
        const validTimestamps = timestamps.filter(t => t > windowStart);
        if (validTimestamps.length === 0) {
          requests.delete(ip);
        } else {
          requests.set(ip, validTimestamps);
        }
      }
      
      // Check current requests
      const userRequests = requests.get(key) || [];
      const recentRequests = userRequests.filter(t => t > windowStart);
      
      if (recentRequests.length >= maxRequests) {
        return res.status(429).json({ error: message });
      }
      
      recentRequests.push(now);
      requests.set(key, recentRequests);
      
      next();
    };
  }
}

export { AuthMiddleware, ValidationMiddleware, RateLimitMiddleware };
```

---

## File Synchronization

### Markdown Sync Implementation

```javascript
// src/sync/FileSync.js
class FileSync {
  constructor() {
    this.syncQueue = [];
    this.isProcessing = false;
    this.syncInterval = 5000; // 5 seconds
    
    this.startSyncWorker();
  }
  
  // Export entity to markdown file
  async exportToMarkdown(entityType, entityId) {
    try {
      const entity = await this.getEntity(entityType, entityId);
      if (!entity) {
        throw new Error(`${entityType} not found`);
      }
      
      const template = await this.getTemplate(entityType, entity);
      const markdown = await this.renderTemplate(template, entity);
      
      const filePath = this.generateFilePath(entityType, entity);
      await this.writeMarkdownFile(filePath, markdown);
      
      // Update sync status
      await this.updateSyncStatus(entityType, entityId, {
        last_db_export: new Date(),
        file_path: filePath,
        sync_conflicts: {}
      });
      
      return filePath;
      
    } catch (error) {
      console.error('Export to markdown failed:', error);
      throw error;
    }
  }
  
  // Import from markdown file to database
  async importFromMarkdown(filePath) {
    try {
      const markdown = await this.readMarkdownFile(filePath);
      const parsed = await this.parseMarkdown(markdown, filePath);
      
      if (!parsed.entity_id) {
        throw new Error('Could not determine entity ID from markdown');
      }
      
      const existingEntity = await this.getEntity(parsed.entity_type, parsed.entity_id);
      
      let entity;
      if (existingEntity) {
        entity = await this.updateEntity(parsed.entity_type, parsed.entity_id, parsed.data);
      } else {
        entity = await this.createEntity(parsed.entity_type, parsed.data);
      }
      
      // Update sync status
      await this.updateSyncStatus(parsed.entity_type, entity[`${parsed.entity_type}_id`], {
        last_file_import: new Date(),
        file_path: filePath
      });
      
      return entity;
      
    } catch (error) {
      console.error('Import from markdown failed:', error);
      throw error;
    }
  }
  
  // Bidirectional sync with conflict detection
  async bidirectionalSync() {
    try {
      const entityFiles = await db.entity_files.toArray();
      
      for (const entityFile of entityFiles) {
        await this.syncEntityFile(entityFile);
      }
      
    } catch (error) {
      console.error('Bidirectional sync failed:', error);
    }
  }
  
  async syncEntityFile(entityFile) {
    try {
      const { entity_type, entity_id, file_path, sync_status } = entityFile;
      
      // Check if file exists
      const fileExists = await this.fileExists(file_path);
      if (!fileExists) {
        // File was deleted, handle accordingly
        await this.handleFileDeleted(entityFile);
        return;
      }
      
      // Get file modification time
      const fileModTime = await this.getFileModificationTime(file_path);
      const lastFileImport = new Date(sync_status.last_file_import || 0);
      const lastDbExport = new Date(sync_status.last_db_export || 0);
      
      // Get database modification time
      const entity = await this.getEntity(entity_type, entity_id);
      const dbModTime = new Date(entity.updated_at);
      
      // Determine sync direction
      if (fileModTime > lastFileImport && dbModTime > lastDbExport) {
        // Both file and database have been modified - conflict!
        await this.handleSyncConflict(entityFile, fileModTime, dbModTime);
      } else if (fileModTime > lastFileImport) {
        // File is newer - import from file
        await this.importFromMarkdown(file_path);
      } else if (dbModTime > lastDbExport) {
        // Database is newer - export to file
        await this.exportToMarkdown(entity_type, entity_id);
      }
      // If neither is newer, no sync needed
      
    } catch (error) {
      console.error(`Sync failed for ${entityFile.file_path}:`, error);
      
      // Update sync status with error
      await this.updateSyncStatus(entityFile.entity_type, entityFile.entity_id, {
        sync_error: error.message,
        last_sync_attempt: new Date()
      });
    }
  }
  
  async handleSyncConflict(entityFile, fileModTime, dbModTime) {
    const { entity_type, entity_id, file_path } = entityFile;
    
    // Create backup of current file
    const backupPath = `${file_path}.backup.${Date.now()}`;
    await this.copyFile(file_path, backupPath);
    
    // Parse both versions
    const fileContent = await this.readMarkdownFile(file_path);
    const fileParsed = await this.parseMarkdown(fileContent, file_path);
    const dbEntity = await this.getEntity(entity_type, entity_id);
    
    // Create conflict resolution data
    const conflictData = {
      detected_at: new Date(),
      file_version: {
        content: fileContent,
        modified_at: fileModTime,
        parsed_data: fileParsed.data
      },
      db_version: {
        entity: dbEntity,
        modified_at: dbModTime
      },
      backup_path: backupPath,
      resolution_strategy: 'manual' // or 'db_wins', 'file_wins', 'merge'
    };
    
    // Update sync status with conflict info
    await this.updateSyncStatus(entity_type, entity_id, {
      sync_conflicts: conflictData,
      conflict_detected: true
    });
    
    // Notify user of conflict
    this.notifyConflict(entityFile, conflictData);
  }
  
  async resolveConflict(entityType, entityId, resolution) {
    const entityFile = await db.entity_files
      .where('[entity_type+entity_id]')
      .equals([entityType, entityId])
      .first();
    
    if (!entityFile || !entityFile.sync_status.conflict_detected) {
      throw new Error('No conflict found for this entity');
    }
    
    const conflictData = entityFile.sync_status.sync_conflicts;
    
    switch (resolution.strategy) {
      case 'use_db':
        // Export database version to file
        await this.exportToMarkdown(entityType, entityId);
        break;
        
      case 'use_file':
        // Import file version to database
        await this.importFromMarkdown(entityFile.file_path);
        break;
        
      case 'merge':
        // User-provided merged data
        await this.updateEntity(entityType, entityId, resolution.mergedData);
        await this.exportToMarkdown(entityType, entityId);
        break;
        
      default:
        throw new Error('Invalid resolution strategy');
    }
    
    // Clear conflict status
    await this.updateSyncStatus(entityType, entityId, {
      sync_conflicts: {},
      conflict_detected: false,
      conflict_resolved_at: new Date(),
      resolution_strategy: resolution.strategy
    });
    
    // Clean up backup file if desired
    if (resolution.deleteBackup && conflictData.backup_path) {
      await this.deleteFile(conflictData.backup_path);
    }
  }
  
  // Template rendering
  async renderTemplate(template, entity) {
    const templateEngine = new TemplateEngine();
    
    // Prepare template variables
    const variables = {
      ...entity,
      user: await this.getCurrentUser(),
      today: new Date(),
      tomorrow: new Date(Date.now() + 24 * 60 * 60 * 1000),
      this_week: this.getWeekRange(),
      next_week: this.getWeekRange(1)
    };
    
    return templateEngine.render(template.content_template, variables);
  }
  
  // Markdown parsing
  async parseMarkdown(markdown, filePath) {
    const parser = new MarkdownParser();
    
    // Extract metadata from frontmatter
    const { frontmatter, content } = parser.parseFrontmatter(markdown);
    
    // Determine entity type and ID
    const entityType = frontmatter.entity_type || this.inferEntityTypeFromPath(filePath);
    const entityId = frontmatter.entity_id || this.inferEntityIdFromPath(filePath);
    
    // Parse content based on entity type
    const parsedData = await parser.parseContent(content, entityType);
    
    return {
      entity_type: entityType,
      entity_id: parseInt(entityId),
      data: {
        ...parsedData,
        ...frontmatter
      }
    };
  }
  
  // File system operations (to be implemented based on environment)
  async writeMarkdownFile(filePath, content) {
    // Browser environment - use File System Access API or download
    if (typeof window !== 'undefined') {
      return this.writeFileBrowser(filePath, content);
    }
    
    // Node.js environment
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, content, 'utf8');
  }
  
  async readMarkdownFile(filePath) {
    if (typeof window !== 'undefined') {
      return this.readFileBrowser(filePath);
    }
    
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf8');
  }
  
  async writeFileBrowser(filePath, content) {
    // Use File System Access API if available
    if ('showSaveFilePicker' in window) {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: filePath.split('/').pop(),
        types: [{
          description: 'Markdown files',
          accept: { 'text/markdown': ['.md'] }
        }]
      });
      
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      
      return fileHandle.name;
    }
    
    // Fallback to download
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filePath.split('/').pop();
    a.click();
    URL.revokeObjectURL(url);
    
    return filePath;
  }
  
  // Sync worker
  startSyncWorker() {
    setInterval(() => {
      if (!this.isProcessing) {
        this.processSyncQueue();
      }
    }, this.syncInterval);
  }
  
  async processSyncQueue() {
    if (this.syncQueue.length === 0) return;
    
    this.isProcessing = true;
    
    try {
      while (this.syncQueue.length > 0) {
        const syncTask = this.syncQueue.shift();
        await this.executeSyncTask(syncTask);
      }
    } catch (error) {
      console.error('Sync queue processing failed:', error);
    } finally {
      this.isProcessing = false;
    }
  }
  
  queueSync(entityType, entityId, operation = 'bidirectional') {
    this.syncQueue.push({
      entity_type: entityType,
      entity_id: entityId,
      operation,
      queued_at: new Date()
    });
  }
  
  // Helper methods
  async getEntity(entityType, entityId) {
    switch (entityType) {
      case 'event':
        return await Event.findById(entityId);
      case 'item':
        return await Item.findById(entityId);
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }
  
  async getTemplate(entityType, entity) {
    if (entityType === 'event' && entity.event_type_id) {
      const eventType = await db.event_types.get(entity.event_type_id);
      if (eventType?.content_template) {
        return eventType;
      }
    }
    
    // Return default template
    return {
      content_template: `# {{title}}\n\n{{description}}\n\n## Details\n{{#each custom_fields}}\n**{{@key}}:** {{this}}\n{{/each}}`
    };
  }
  
  generateFilePath(entityType, entity) {
    const basePath = this.getBasePath();
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = this.sanitizeFileName(entity.title || entity.name);
    
    return `${basePath}/${entityType}s/${dateStr}-${fileName}.md`;
  }
  
  async updateSyncStatus(entityType, entityId, statusUpdates) {
    const existing = await db.entity_files
      .where('[entity_type+entity_id]')
      .equals([entityType, entityId])
      .first();
    
    if (existing) {
      await db.entity_files.update(existing.id, {
        sync_status: {
          ...existing.sync_status,
          ...statusUpdates
        },
        updated_at: new Date()
      });
    } else {
      await db.entity_files.add({
        entity_type: entityType,
        entity_id: entityId,
        file_path: this.generateFilePath(entityType, { title: 'Unknown' }),
        sync_status: statusUpdates,
        user_id: await this.getCurrentUserId(),
        created_at: new Date(),
        updated_at: new Date()
      });
    }
  }
}

export { FileSync };
```

---

## Security Implementation

### Data Validation

```javascript
// src/utils/validationUtils.js
class ValidationUtils {
  // SQL injection prevention
  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .replace(/['"\\]/g, '') // Remove quotes and backslashes
      .trim();
  }
  
  // XSS prevention
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // Input validation schemas
  static eventSchema = {
    title: {
      required: true,
      type: 'string',
      maxLength: 255,
      minLength: 1
    },
    description: {
      type: 'string',
      maxLength: 10000
    },
    priority: {
      type: 'integer',
      min: 1,
      max: 5
    },
    budget: {
      type: 'number',
      min: 0,
      max: 999999.99
    },
    due_date: {
      type: 'date'
    },
    status: {
      type: 'string',
      enum: ['active', 'completed', 'cancelled', 'deferred']
    },
    custom_fields: {
      type: 'object'
    }
  };
  
  static validateField(value, fieldSchema) {
    const errors = [];
    
    // Required check
    if (fieldSchema.required && (value === undefined || value === null || value === '')) {
      errors.push('This field is required');
      return { valid: false, errors };
    }
    
    // Skip other validations if not required and empty
    if (!fieldSchema.required && (value === undefined || value === null || value === '')) {
      return { valid: true, errors: [] };
    }
    
    // Type validation
    switch (fieldSchema.type) {
      case 'string':
        if (typeof value !== 'string') {
          errors.push('Must be a string');
        } else {
          if (fieldSchema.minLength && value.length < fieldSchema.minLength) {
            errors.push(`Must be at least ${fieldSchema.minLength} characters`);
          }
          if (fieldSchema.maxLength && value.length > fieldSchema.maxLength) {
            errors.push(`Must be no more than ${fieldSchema.maxLength} characters`);
          }
          if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
            errors.push('Invalid format');
          }
        }
        break;
        
      case 'integer':
        if (!Number.isInteger(value)) {
          errors.push('Must be an integer');
        } else {
          if (fieldSchema.min !== undefined && value < fieldSchema.min) {
            errors.push(`Must be at least ${fieldSchema.min}`);
          }
          if (fieldSchema.max !== undefined && value > fieldSchema.max) {
            errors.push(`Must be no more than ${fieldSchema.max}`);
          }
        }
        break;
        
      case 'number':
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push('Must be a number');
        } else {
          if (fieldSchema.min !== undefined && value < fieldSchema.min) {
            errors.push(`Must be at least ${fieldSchema.min}`);
          }
          if (fieldSchema.max !== undefined && value > fieldSchema.max) {
            errors.push(`Must be no more than ${fieldSchema.max}`);
          }
        }
        break;
        
      case 'date':
        if (!(value instanceof Date) && isNaN(new Date(value))) {
          errors.push('Must be a valid date');
        }
        break;
        
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push('Must be an object');
        }
        break;
        
      case 'array':
        if (!Array.isArray(value)) {
          errors.push('Must be an array');
        }
        break;
    }
    
    // Enum validation
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      errors.push(`Must be one of: ${fieldSchema.enum.join(', ')}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  static validateObject(obj, schema) {
    const errors = {};
    let isValid = true;
    
    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const fieldValue = obj[fieldName];
      const validation = this.validateField(fieldValue, fieldSchema);
      
      if (!validation.valid) {
        errors[fieldName] = validation.errors;
        isValid = false;
      }
    }
    
    return {
      valid: isValid,
      errors
    };
  }
  
  // Rate limiting
  static createRateLimiter(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    const attempts = new Map();
    
    return (identifier) => {
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean old attempts
      for (const [id, timestamps] of attempts.entries()) {
        const validTimestamps = timestamps.filter(t => t > windowStart);
        if (validTimestamps.length === 0) {
          attempts.delete(id);
        } else {
          attempts.set(id, validTimestamps);
        }
      }
      
      // Check current attempts
      const userAttempts = attempts.get(identifier) || [];
      const recentAttempts = userAttempts.filter(t => t > windowStart);
      
      if (recentAttempts.length >= maxAttempts) {
        return {
          allowed: false,
          retryAfter: Math.ceil((recentAttempts[0] + windowMs - now) / 1000)
        };
      }
      
      recentAttempts.push(now);
      attempts.set(identifier, recentAttempts);
      
      return {
        allowed: true,
        remaining: maxAttempts - recentAttempts.length
      };
    };
  }
}

export { ValidationUtils };
```

### Authentication System (Future)

```javascript
// src/auth/AuthService.js
class AuthService {
  constructor() {
    this.currentUser = null;
    this.tokenRefreshInterval = null;
  }
  
  async login(email, password) {
    try {
      // Validate input
      if (!email || !password) {
        throw new Error('Email and password are required');
      }
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Login failed');
      }
      
      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      
      // Set current user
      this.currentUser = data.user;
      
      // Start token refresh cycle
      this.startTokenRefresh();
      
      return data.user;
      
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  }
  
  async logout() {
    try {
      const token = localStorage.getItem('access_token');
      
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
      
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      // Clear local state regardless of API call result
      this.clearAuthData();
    }
  }
  
  async refreshToken() {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ refresh_token: refreshToken })
      });
      
      if (!response.ok) {
        throw new Error('Token refresh failed');
      }
      
      const data = await response.json();
      
      // Update stored tokens
      localStorage.setItem('access_token', data.access_token);
      if (data.refresh_token) {
        localStorage.setItem('refresh_token', data.refresh_token);
      }
      
      return data.access_token;
      
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearAuthData();
      throw error;
    }
  }
  
  async getCurrentUser() {
    if (this.currentUser) {
      return this.currentUser;
    }
    
    const token = localStorage.getItem('access_token');
    if (!token) {
      return null;
    }
    
    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to get current user');
      }
      
      const user = await response.json();
      this.currentUser = user;
      
      return user;
      
    } catch (error) {
      console.error('Get current user failed:', error);
      this.clearAuthData();
      return null;
    }
  }
  
  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  }
  
  getAuthHeader() {
    const token = localStorage.getItem('access_token');
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  }
  
  startTokenRefresh() {
    // Refresh token every 45 minutes (assuming 1 hour expiry)
    this.tokenRefreshInterval = setInterval(() => {
      this.refreshToken().catch(() => {
        // If refresh fails, user will be logged out
      });
    }, 45 * 60 * 1000);
  }
  
  clearAuthData() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.currentUser = null;
    
    if (this.tokenRefreshInterval) {
      clearInterval(this.tokenRefreshInterval);
      this.tokenRefreshInterval = null;
    }
  }
}

export const authService = new AuthService();
```

---

## Deployment Guide

### Development Deployment

```bash
# scripts/setup-dev.js
#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function setupDevelopment() {
  console.log('Setting up development environment...');
  
  // Create required directories
  const directories = [
    'src/models',
    'src/viewmodels', 
    'src/views',
    'src/utils',
    'tests/unit',
    'tests/integration',
    'public/styles',
    'public/assets'
  ];
  
  for (const dir of directories) {
    await fs.mkdir(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
  
  // Copy environment file
  try {
    await fs.access('.env.development');
  } catch {
    await fs.copyFile('.env.example', '.env.development');
    console.log('Created .env.development file');
  }
  
  // Install dependencies if needed
  try {
    await fs.access('node_modules');
  } catch {
    console.log('Installing dependencies...');
    const { spawn } = require('child_process');
    await new Promise((resolve, reject) => {
      const npm = spawn('npm', ['install'], { stdio: 'inherit' });
      npm.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`npm install failed with code ${code}`));
      });
    });
  }
  
  console.log('\n✅ Development environment ready!');
  console.log('Run "npm run dev" to start the development server.');
}

setupDevelopment().catch(console.error);
```

### Production Build

```json
{
  "scripts": {
    "dev": "live-server public --port=3000 --open=/",
    "build": "node scripts/build-production.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src/**/*.js",
    "lint:fix": "eslint src/**/*.js --fix",
    "migrate": "node scripts/migrate-schema.js",
    "seed": "node scripts/seed-data.js",
    "performance": "node scripts/performance-test.js"
  }
}
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY public/ ./public/
COPY config/ ./config/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S appuser -u 1001
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - DB_PORT=5432
      - DB_NAME=org_ecosystem
      - DB_USER=postgres
      - DB_PASSWORD=password
    depends_on:
      - postgres
    volumes:
      - ./sync-files:/app/sync-files
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=org_ecosystem
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

---

## Contributing Guidelines

### Code Style

```javascript
// .eslintrc.js
module.exports = {
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    // Code Quality
    'no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
    'no-console': ['warn', { 'allow': ['warn', 'error'] }],
    'no-debugger': 'error',
    
    // Formatting
    'indent': ['error', 2],
    'quotes': ['error', 'single'],
    'semi': ['error', 'always'],
    'comma-dangle': ['error', 'never'],
    
    // Best Practices
    'eqeqeq': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'prefer-arrow-callback': 'error',
    
    // ES6+
    'arrow-spacing': 'error',
    'template-curly-spacing': 'error'
  }
};
```

### Git Workflow

```bash
# Feature development workflow
git checkout main
git pull origin main
git checkout -b feature/event-management
# Make changes
git add .
git commit -m "feat: add event filtering by priority"
git push origin feature/event-management
# Create pull request

# Commit message format
feat: add new feature
fix: fix a bug
docs: update documentation
style: formatting changes
refactor: code refactoring
test: add tests
chore: maintenance tasks
```

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Refactoring

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Performance tested

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] Error handling implemented

## Screenshots (if applicable)

## Additional Notes
```

### Code Review Guidelines

1. **Architecture Compliance**
   - Follows MVVM pattern
   - Maintains Event/Item dichotomy
   - Uses proper separation of concerns

2. **Performance Considerations**
   - Uses real columns for common queries
   - Implements proper indexing
   - Avoids N+1 query problems

3. **Code Quality**
   - Proper error handling
   - Comprehensive validation
   - Clear variable names
   - Adequate comments

4. **Testing**
   - Unit tests for all new functionality
   - Integration tests for complex features
   - Performance tests for database operations

---

## Troubleshooting

### Common Issues

#### Database Connection Issues
```javascript
// Debug IndexedDB connection
async function debugDatabase() {
  try {
    await db.open();
    console.log('Database opened successfully');
    
    const tables = await Promise.all([
      db.users.count(),
      db.events.count(),
      db.items.count()
    ]);
    
    console.log('Table counts:', {
      users: tables[0],
      events: tables[1],
      items: tables[2]
    });
    
  } catch (error) {
    console.error('Database debug failed:', error);
    
    // Try to delete and recreate
    await db.delete();
    await db.open();
    console.log('Database recreated');
  }
}
```

#### Performance Issues
```javascript
// Monitor slow queries
const originalQuery = db.events.toCollection;
db.events.toCollection = function(...args) {
  const startTime = performance.now();
  const collection = originalQuery.apply(this, args);
  
  const originalToArray = collection.toArray;
  collection.toArray = async function() {
    const result = await originalToArray.call(this);
    const duration = performance.now() - startTime;
    
    if (duration > 100) {
      console.warn(`Slow query detected: ${duration.toFixed(2)}ms`);
    }
    
    return result;
  };
  
  return collection;
};
```

#### Memory Leaks
```javascript
// Monitor memory usage
class MemoryMonitor {
  static monitor() {
    if (!performance.memory) {
      console.warn('Memory monitoring not available');
      return;
    }
    
    const logMemory = () => {
      const memory = performance.memory;
      console.log('Memory usage:', {
        used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB',
        total: Math.round(memory.totalJSHeapSize / 1024 / 1024) + ' MB',
        limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
      });
    };
    
    setInterval(logMemory, 30000); // Log every 30 seconds
  }
}
```

### Debug Utilities

```javascript
// src/utils/debugUtils.js
class DebugUtils {
  static async exportDatabaseDump() {
    const dump = {
      users: await db.users.toArray(),
      events: await db.events.toArray(),
      items: await db.items.toArray(),
      tags: await db.tags.toArray(),
      collections: await db.collections.toArray(),
      operation_logs: await db.operation_logs.limit(100).reverse().toArray()
    };
    
    const blob = new Blob([JSON.stringify(dump, null, 2)], {
      type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `database-dump-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  static async importDatabaseDump(file) {
    const text = await file.text();
    const dump = JSON.parse(text);
    
    // Clear existing data
    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) {
        await table.clear();
      }
      
      // Import data
      for (const [tableName, records] of Object.entries(dump)) {
        if (db[tableName] && records.length > 0) {
          await db[tableName].bulkAdd(records);
        }
      }
    });
    
    console.log('Database dump imported successfully');
  }
  
  static enableVerboseLogging() {
    // Override console methods to add timestamps
    const originalLog = console.log;
    console.log = (...args) => {
      originalLog(`[${new Date().toISOString()}]`, ...args);
    };
    
    // Log all database operations
    db.on('ready', () => console.log('Database ready'));
    db.on('blocked', () => console.warn('Database blocked'));
    db.on('versionchange', () => console.warn('Database version change'));
  }
}

export { DebugUtils };
```

### Browser DevTools

```javascript
// Add debugging methods to window object for console access
if (process.env.NODE_ENV === 'development') {
  window.debugDB = {
    async clearAll() {
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
        }
      });
      console.log('All data cleared');
    },
    
    async createTestData() {
      // Create test user
      await db.users.add({
        user_id: 1,
        username: 'testuser',
        email: 'test@example.com'
      });
      
      // Create test events
      for (let i = 1; i <= 10; i++) {
        await db.events.add({
          user_id: 1,
          title: `Test Event ${i}`,
          priority: Math.ceil(Math.random() * 5),
          due_date: new Date(Date.now() + i * 24 * 60 * 60 * 1000),
          status: 'active'
        });
      }
      
      console.log('Test data created');
    },
    
    async showStats() {
      const stats = {};
      for (const table of db.tables) {
        stats[table.name] = await table.count();
      }
      console.table(stats);
    }
  };
}
```

---

## PostgreSQL Server Development

### Server Setup and Architecture

The PostgreSQL server provides unlimited scale and enterprise features while maintaining identical schema to the IndexedDB client for seamless synchronization.

#### Local Development Environment

```bash
# Option 1: Docker (Recommended)
docker run --name org-ecosystem-postgres \
  -e POSTGRES_DB=organizational_ecosystem \
  -e POSTGRES_USER=dev_user \
  -e POSTGRES_PASSWORD=dev_password \
  -p 5432:5432 \
  -d postgres:15

# Option 2: Local PostgreSQL Installation
# macOS
brew install postgresql@15
brew services start postgresql@15

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-15 postgresql-contrib-15

# Create development database
createdb organizational_ecosystem
```

#### Server Project Structure

```
server/
├── src/
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection config
│   │   ├── auth.js              # JWT configuration
│   │   └── cors.js              # CORS settings
│   ├── controllers/
│   │   ├── EventController.js   # Event CRUD operations
│   │   ├── ItemController.js    # Item CRUD operations
│   │   ├── SyncController.js    # Synchronization logic
│   │   └── AuthController.js    # Authentication endpoints
│   ├── middleware/
│   │   ├── auth.js              # JWT verification
│   │   ├── rateLimit.js         # Rate limiting
│   │   └── validation.js        # Request validation
│   ├── models/
│   │   ├── Event.js             # Event model with PostgreSQL
│   │   ├── Item.js              # Item model with PostgreSQL
│   │   └── User.js              # User model
│   ├── routes/
│   │   ├── events.js            # Event API routes
│   │   ├── items.js             # Item API routes
│   │   ├── sync.js              # Sync API routes
│   │   └── auth.js              # Auth API routes
│   ├── services/
│   │   ├── SyncService.js       # Bidirectional sync logic
│   │   ├── ConflictResolver.js  # Conflict resolution
│   │   └── CacheManager.js      # Server-side caching
│   └── app.js                   # Express app setup
├── database/
│   ├── migrations/              # Database migrations
│   ├── seeds/                   # Test data seeds
│   └── init.sql                 # Initial schema setup
├── tests/
│   ├── integration/             # API integration tests
│   ├── unit/                    # Unit tests
│   └── sync/                    # Sync functionality tests
├── package.json
├── Dockerfile
└── docker-compose.yml
```

#### Environment Configuration

```bash
# server/.env.development
NODE_ENV=development
PORT=3001

# PostgreSQL Configuration
DATABASE_URL=postgres://dev_user:dev_password@localhost:5432/organizational_ecosystem
DB_HOST=localhost
DB_PORT=5432
DB_NAME=organizational_ecosystem
DB_USER=dev_user
DB_PASSWORD=dev_password

# Security
JWT_SECRET=development_jwt_secret_key_change_in_production
JWT_EXPIRES_IN=7d

# CORS
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=debug
DB_LOGGING=true

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Express.js Server Setup

```javascript
// server/src/app.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Pool } = require('pg');

const app = express();

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api/', limiter);

// Database middleware
app.use((req, res, next) => {
  req.db = pool;
  next();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/items', require('./routes/items'));
app.use('/api/sync', require('./routes/sync'));

// Health check
app.get('/health', async (req, res) => {
  try {
    await req.db.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('API Error:', error);
  res.status(error.status || 500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
```

### PostgreSQL Models with Performance Optimization

```javascript
// server/src/models/Event.js
class Event {
  constructor(db) {
    this.db = db;
  }
  
  async create(userId, eventData) {
    const query = `
      INSERT INTO events (
        user_id, event_type_id, title, description,
        priority, budget, location, due_date, custom_fields
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const values = [
      userId,
      eventData.event_type_id,
      eventData.title,
      eventData.description,
      eventData.priority,
      eventData.budget,
      eventData.location,
      eventData.due_date,
      JSON.stringify(eventData.custom_fields || {})
    ];
    
    const result = await this.db.query(query, values);
    return result.rows[0];
  }
  
  async findByUser(userId, options = {}) {
    let query = `
      SELECT e.*, et.name as event_type_name,
             EXTRACT(EPOCH FROM (e.due_date - CURRENT_TIMESTAMP)) as seconds_until_due
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.event_type_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL
    `;
    
    const values = [userId];
    let paramCount = 1;
    
    // Performance: Use real column filters for 10x speed improvement
    if (options.priority) {
      query += ` AND e.priority >= $${++paramCount}`;
      values.push(options.priority);
    }
    
    if (options.due_after) {
      query += ` AND e.due_date >= $${++paramCount}`;
      values.push(options.due_after);
    }
    
    if (options.due_before) {
      query += ` AND e.due_date <= $${++paramCount}`;
      values.push(options.due_before);
    }
    
    if (options.location) {
      query += ` AND e.location ILIKE $${++paramCount}`;
      values.push(`%${options.location}%`);
    }
    
    // JSONB queries with GIN index optimization
    if (options.custom_fields) {
      query += ` AND e.custom_fields @> $${++paramCount}`;
      values.push(JSON.stringify(options.custom_fields));
    }
    
    // Full-text search
    if (options.search) {
      query += ` AND e.search_vector @@ plainto_tsquery($${++paramCount})`;
      values.push(options.search);
    }
    
    // Performance: Optimized ordering
    query += ` ORDER BY e.priority DESC, e.due_date ASC`;
    
    if (options.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(options.limit);
    }
    
    if (options.offset) {
      query += ` OFFSET $${++paramCount}`;
      values.push(options.offset);
    }
    
    const result = await this.db.query(query, values);
    return result.rows;
  }
  
  async getRelevantForSync(userId, lastSyncTime, maxRecords = 10000) {
    const query = `
      SELECT e.*, et.name as event_type_name
      FROM events e
      LEFT JOIN event_types et ON e.event_type_id = et.event_type_id
      WHERE e.user_id = $1 
        AND e.deleted_at IS NULL
        AND (
          e.updated_at > $2 OR  -- Recently modified
          e.due_date > CURRENT_DATE - INTERVAL '30 days' OR  -- Recent or upcoming
          e.priority >= 4 OR  -- High priority
          e.custom_fields @> '{"starred": true}'  -- User favorites
        )
      ORDER BY e.priority DESC, e.updated_at DESC
      LIMIT $3
    `;
    
    const result = await this.db.query(query, [userId, lastSyncTime, maxRecords]);
    return result.rows;
  }
  
  async updateWithConflictDetection(eventId, userId, updateData, clientTimestamp) {
    // Check for concurrent modifications
    const conflictCheck = await this.db.query(
      'SELECT updated_at FROM events WHERE event_id = $1 AND user_id = $2',
      [eventId, userId]
    );
    
    if (conflictCheck.rows.length === 0) {
      throw new Error('Event not found');
    }
    
    const serverTimestamp = new Date(conflictCheck.rows[0].updated_at);
    const clientTime = new Date(clientTimestamp);
    
    // If server was modified after client timestamp, we have a conflict
    if (serverTimestamp > clientTime) {
      return {
        success: false,
        conflict: true,
        server_version: conflictCheck.rows[0],
        client_version: updateData
      };
    }
    
    // No conflict, proceed with update
    const query = `
      UPDATE events 
      SET title = $3, description = $4, priority = $5, 
          budget = $6, location = $7, due_date = $8,
          custom_fields = $9, updated_at = CURRENT_TIMESTAMP
      WHERE event_id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING *
    `;
    
    const values = [
      eventId, userId,
      updateData.title, updateData.description, updateData.priority,
      updateData.budget, updateData.location, updateData.due_date,
      JSON.stringify(updateData.custom_fields || {})
    ];
    
    const result = await this.db.query(query, values);
    return {
      success: true,
      conflict: false,
      data: result.rows[0]
    };
  }
}

module.exports = Event;
```

### Synchronization API Implementation

```javascript
// server/src/controllers/SyncController.js
class SyncController {
  static async getUpdates(req, res) {
    try {
      const { since, relevance_filter } = req.query;
      const userId = req.user.user_id;
      
      const eventModel = new Event(req.db);
      const itemModel = new Item(req.db);
      
      // Get updates for each entity type
      const [events, items] = await Promise.all([
        eventModel.getRelevantForSync(userId, since, relevance_filter?.events || 5000),
        itemModel.getRelevantForSync(userId, since, relevance_filter?.items || 5000)
      ]);
      
      res.json({
        success: true,
        data: {
          events,
          items,
          sync_timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Sync getUpdates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve updates'
      });
    }
  }
  
  static async applyChanges(req, res) {
    try {
      const { operations } = req.body;
      const userId = req.user.user_id;
      const results = [];
      
      // Process operations in transaction
      await req.db.query('BEGIN');
      
      try {
        for (const operation of operations) {
          const result = await SyncController.processOperation(
            req.db, 
            userId, 
            operation
          );
          results.push(result);
        }
        
        await req.db.query('COMMIT');
        
        res.json({
          success: true,
          results
        });
        
      } catch (error) {
        await req.db.query('ROLLBACK');
        throw error;
      }
      
    } catch (error) {
      console.error('Sync applyChanges error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to apply changes'
      });
    }
  }
  
  static async processOperation(db, userId, operation) {
    const { type, entity_type, entity_id, data, client_timestamp } = operation;
    
    const Model = entity_type === 'event' ? Event : Item;
    const model = new Model(db);
    
    switch (type) {
      case 'CREATE':
        const created = await model.create(userId, data);
        return {
          operation_id: operation.id,
          success: true,
          server_data: created
        };
        
      case 'UPDATE':
        const updated = await model.updateWithConflictDetection(
          entity_id, 
          userId, 
          data, 
          client_timestamp
        );
        return {
          operation_id: operation.id,
          ...updated
        };
        
      case 'DELETE':
        const deleted = await model.softDelete(entity_id, userId);
        return {
          operation_id: operation.id,
          success: !!deleted,
          server_data: deleted
        };
        
      default:
        throw new Error(`Unknown operation type: ${type}`);
    }
  }
}

module.exports = SyncController;
```

### Development Workflow

#### Starting the Hybrid Development Environment

```bash
# Terminal 1: Start PostgreSQL database
docker-compose up postgres

# Terminal 2: Start API server with hot reload
cd server
npm install
npm run dev

# Terminal 3: Start client development server  
cd client
npm install
npm run dev

# Terminal 4: Run database setup and migrations
cd server
npm run db:migrate
npm run db:seed:dev
```

#### Database Management Commands

```bash
# Package.json scripts for server development
{
  "scripts": {
    "dev": "nodemon src/app.js",
    "start": "node src/app.js",
    "test": "jest",
    "test:integration": "jest --config jest.integration.config.js",
    "db:migrate": "node scripts/migrate.js",
    "db:seed": "node scripts/seed.js",
    "db:reset": "node scripts/reset.js",
    "db:backup": "pg_dump $DATABASE_URL > backup.sql",
    "db:restore": "psql $DATABASE_URL < backup.sql"
  }
}
```

#### Testing Strategy

```javascript
// tests/integration/sync.test.js
const request = require('supertest');
const app = require('../../src/app');

describe('Synchronization API', () => {
  let authToken;
  let userId;
  
  beforeAll(async () => {
    // Set up test user and authentication
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword123'
      });
      
    authToken = loginResponse.body.access_token;
    userId = loginResponse.body.user.user_id;
  });
  
  describe('GET /api/sync/updates', () => {
    it('should return relevant updates for sync', async () => {
      const response = await request(app)
        .get('/api/sync/updates')
        .query({ since: '2024-01-01T00:00:00Z' })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
        
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('events');
      expect(response.body.data).toHaveProperty('items');
      expect(response.body.data).toHaveProperty('sync_timestamp');
    });
  });
  
  describe('POST /api/sync/apply', () => {
    it('should process client operations and detect conflicts', async () => {
      const operations = [
        {
          id: 'client-op-1',
          type: 'CREATE',
          entity_type: 'event',
          data: {
            title: 'Test Event',
            priority: 3,
            due_date: '2024-12-31T23:59:59Z'
          }
        }
      ];
      
      const response = await request(app)
        .post('/api/sync/apply')
        .send({ operations })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
        
      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].success).toBe(true);
    });
  });
});
```

---

## API Development

### RESTful API Design

The API follows REST principles with PostgreSQL backend for unlimited scale and enterprise features.

#### Authentication Middleware

```javascript
// server/src/middleware/auth.js
const jwt = require('jsonwebtoken');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Set database context for row-level security
    await req.db.query('SET app.current_user_id = $1', [decoded.user_id]);
    
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken };
```

#### Event API Routes

```javascript
// server/src/routes/events.js
const express = require('express');
const router = express.Router();
const EventController = require('../controllers/EventController');
const { authenticateToken } = require('../middleware/auth');
const { validateEvent } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticateToken);

// GET /api/events - List events with filters
router.get('/', EventController.index);

// GET /api/events/:id - Get specific event
router.get('/:id', EventController.show);

// POST /api/events - Create new event
router.post('/', validateEvent, EventController.create);

// PUT /api/events/:id - Update event
router.put('/:id', validateEvent, EventController.update);

// DELETE /api/events/:id - Soft delete event
router.delete('/:id', EventController.destroy);

// POST /api/events/search - Full-text search
router.post('/search', EventController.search);

// POST /api/events/bulk - Bulk operations
router.post('/bulk', EventController.bulkOperation);

module.exports = router;
```

### Performance Monitoring

```javascript
// server/src/middleware/performance.js
const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      user_id: req.user?.user_id,
      timestamp: new Date().toISOString()
    };
    
    // Log slow queries (>100ms)
    if (duration > 100) {
      console.warn('Slow API request:', logData);
    }
    
    // Store performance metrics for analysis
    if (req.db) {
      req.db.query(
        'INSERT INTO api_performance_logs (method, url, status, duration_ms, user_id) VALUES ($1, $2, $3, $4, $5)',
        [req.method, req.url, res.statusCode, duration, req.user?.user_id]
      ).catch(console.error);
    }
  });
  
  next();
};

module.exports = { performanceMonitor };
```

---

This comprehensive development guide provides everything needed to understand, contribute to, and maintain the Organizational Ecosystem Application. The guide emphasizes the core architectural principles while providing practical implementation details for building a robust, scalable productivity platform.

The key to success with this architecture is maintaining the **radical simplicity** principle while leveraging the **infinite extensibility** that comes from the Event/Item dichotomy and configuration-driven approach.
