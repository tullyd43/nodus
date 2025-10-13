# Database Development Context

## Related Context

- [src/core/models/GEMINI.md](src/core/models/GEMINI.md)
- [tests/GEMINI.md](tests/GEMINI.md)

## 🗃️ Schema Architecture

### Core Tables (18 Total)
```sql
-- Entity tables (polymorphic base)
events              -- Actions/tasks/meetings (involves_action = true)
items               -- Assets/people/resources (involves_action = false)
entity_types        -- Dynamic type definitions (WorkoutType, MeetingType, etc.)
custom_fields       -- User-defined field storage

-- Universal systems (work across all entities)
tags                -- Hierarchical tagging system
tag_assignments     -- Polymorphic tag relationships
collections         -- Dynamic filtering definitions
collection_items    -- Collection membership tracking

-- Relationships and metadata
links               -- Entity-to-entity relationships
templates           -- Content generation templates
field_definitions   -- Field library for reuse
routine_definitions -- Automated routine patterns

-- Operational and audit
operational_logs    -- Change tracking and audit trail
sync_queue         -- Server synchronization queue
user_preferences   -- Settings and customizations
```

### Event/Item Polymorphic Design
```javascript
// Base entity detection
const entityType = data.involves_action ? 'event' : 'item';

// Polymorphic relationships work across types
tag_assignments: {
  tag_id: INTEGER,
  taggable_type: 'event' | 'item',  // Polymorphic discriminator
  taggable_id: INTEGER,             // Points to events.id or items.id
  created_at: TIMESTAMP
}
```

## ⚡ Performance Optimization Strategy

### Real Columns vs JSONB Pattern
```sql
-- FAST: Real columns for common queries (10x performance improvement)
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  priority INTEGER DEFAULT 3,     -- Real column: sub-second filtering
  budget DECIMAL(10,2),           -- Real column: fast range queries
  location VARCHAR(255),          -- Real column: instant lookup
  due_date TIMESTAMP,             -- Real column: optimized date ranges
  
  -- Flexible storage for truly custom fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Composite indexes for common query patterns
CREATE INDEX idx_events_priority_due_date ON events(priority, due_date);
CREATE INDEX idx_events_location_priority ON events(location, priority);
CREATE INDEX idx_events_custom_fields_gin ON events USING GIN(custom_fields);
```

### Query Performance Guidelines
```javascript
// ✅ FAST: Use real columns for filtering
const highPriorityEvents = await db.events
  .where('priority').aboveOrEqual(4)
  .and('due_date').between(startDate, endDate)
  .toArray();
  
// ❌ SLOW: Don't query JSONB fields frequently
const badQuery = await db.events
  .where('custom_fields').equals('{"category": "work"}')
  .toArray();
  
// ✅ BETTER: Use real columns + JSONB for edge cases
const goodQuery = await db.events
  .where('category').equals('work')  // Real column
  .and('custom_fields').anyOf(['{"special": true}'])  // Occasional JSONB
  .toArray();
```

### IndexedDB Optimization (Current)
```javascript
// Dexie compound indexes for query performance
const schema = {
  events: '++id, title, priority, due_date, [priority+due_date], [location+priority]',
  items: '++id, name, value, location, [value+location]',
  tags: '++id, name, parent_id',
  tag_assignments: '++id, [taggable_type+taggable_id], tag_id'
};
```

### PostgreSQL Optimization (Future)
```sql
-- Partial indexes for common queries
CREATE INDEX idx_active_events ON events(due_date) WHERE completed = false;
CREATE INDEX idx_high_priority ON events(priority, due_date) WHERE priority >= 4;

-- GIN indexes for JSONB operations
CREATE INDEX idx_events_custom_fields_gin ON events USING GIN(custom_fields);
CREATE INDEX idx_tag_search ON events USING GIN(to_tsvector('english', title || ' ' || description));
```

## 🏗️ Data Modeling Patterns

### Dynamic Type System
```javascript
// Create new event/item types dynamically
const workoutType = await EntityType.create({
  name: "Workout",
  entity_class: "event",  // or "item"
  category: "health",
  default_fields: ["duration", "workout_type", "calories"]
});

// Types can have different field sets but same universal systems
const equipmentType = await EntityType.create({
  name: "Equipment", 
  entity_class: "item",
  category: "assets",
  default_fields: ["purchase_date", "warranty_expires", "condition"]
});
```

### Custom Fields Implementation
```javascript
// Field definitions are reusable across types
const durationField = await FieldDefinition.create({
  field_name: "duration",
  display_name: "Duration (minutes)",
  field_type: "integer",
  validation_rules: {min: 1, max: 480},
  is_required: true
});

// Assign fields to specific entity types
await EntityField.assignFields(workoutType.id, [
  durationField.id,
  workoutTypeField.id,
  caloriesField.id
]);
```

### Polymorphic Relationships
```javascript
// Universal tagging works across all entity types
const workTag = await Tag.create({name: "work", color: "#blue"});

// Tag any entity type
await TagAssignment.create({
  tag_id: workTag.id,
  taggable_type: "event",
  taggable_id: meetingEvent.id
});

await TagAssignment.create({
  tag_id: workTag.id,
  taggable_type: "item", 
  taggable_id: laptopItem.id
});
```

## 🔄 Database Migration Strategy

### Version Management
```javascript
// Dexie version-based migrations
const db = new Dexie('OrganizationalEcosystem');

// Version 1: Initial schema
db.version(1).stores({
  events: '++id, title, priority, due_date',
  items: '++id, name, value, location'
});

// Version 2: Add custom fields
db.version(2).stores({
  events: '++id, title, priority, due_date, entity_type_id',
  items: '++id, name, value, location, entity_type_id',
  entity_types: '++id, name, entity_class',
  custom_fields: '++id, entity_id, field_name, field_value'
});

// Version 3: Add universal systems
db.version(3).stores({
  // ... existing tables
  tags: '++id, name, parent_id',
  tag_assignments: '++id, [taggable_type+taggable_id], tag_id',
  collections: '++id, name, query_definition'
});
```

### Client-to-Server Migration
```javascript
// Export IndexedDB data for PostgreSQL import
async function exportToPostgreSQL() {
  const data = {
    events: await db.events.toArray(),
    items: await db.items.toArray(),
    tags: await db.tags.toArray(),
    tag_assignments: await db.tag_assignments.toArray()
  };
  
  // Send to server API for PostgreSQL insertion
  await fetch('/api/import', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}
```

## 🚀 How to...

### Add a new table

1.  **Define the schema**: Add the new table to the `schema` object in `src/core/database/schema.js`.
2.  **Create a model**: Create a new model file in `src/core/models` that extends `BaseModel`.
3.  **Implement validation**: Add validation rules to the new model.
4.  **Update migrations**: If necessary, add a new version to the Dexie migration in `src/core/database/migrations.js`.

### Add a new index

1.  **Identify the query**: Find the query that needs to be optimized.
2.  **Choose the right index**: Decide whether to use a simple or compound index.
3.  **Update the schema**: Add the new index to the `schema` object in `src/core/database/schema.js`.
4.  **Test the performance**: Write a performance test to verify the improvement.

## 🔍 Query Patterns

### Collection Query Language
```javascript
// Complex filtering using JSON query definition
const query = {
  entity_type: "event",
  conditions: {
    operator: "AND",
    rules: [
      {field: "priority", operator: ">=", value: 4},
      {field: "due_date", operator: "date_range", value: ["today", "next_week"]},
      {field: "tags", operator: "contains_any", value: ["work", "urgent"]},
      {
        operator: "OR",
        rules: [
          {field: "budget", operator: ">", value: 1000},
          {field: "location", operator: "equals", value: "office"}
        ]
      }
    ]
  }
};

// Execute query using QueryBuilder
const results = await QueryBuilder.execute(query);
```

### Performance-Optimized Queries
```javascript
// Use compound indexes for multi-field queries
const todayHighPriority = await db.events
  .where('[priority+due_date]')
  .between([4, today], [5, tomorrow])
  .toArray();

// Batch operations for better performance
const batchUpdates = events.map(event => ({
  ...event,
  updated_at: new Date()
}));
await db.events.bulkPut(batchUpdates);
```

## 🚦 Data Validation

### Model-Level Validation
```javascript
class EventModel extends BaseModel {
  validate(data) {
    const errors = [];
    
    // Required fields
    if (!data.title) errors.push('Title is required');
    
    // Type validation
    if (data.priority && (data.priority < 1 || data.priority > 5)) {
      errors.push('Priority must be between 1 and 5');
    }
    
    // Date validation
    if (data.due_date && new Date(data.due_date) < new Date()) {
      errors.push('Due date cannot be in the past');
    }
    
    return errors;
  }
}
```

### Custom Field Validation
```javascript
// Validate against field definitions
async function validateCustomFields(entityTypeId, customFields) {
  const fieldDefs = await EntityField.getByEntityType(entityTypeId);
  
  for (const [fieldName, value] of Object.entries(customFields)) {
    const def = fieldDefs.find(f => f.field_name === fieldName);
    if (!def) continue;
    
    // Type validation
    if (def.field_type === 'integer' && !Number.isInteger(value)) {
      throw new Error(`${def.display_name} must be an integer`);
    }
    
    // Range validation
    if (def.validation_rules?.min && value < def.validation_rules.min) {
      throw new Error(`${def.display_name} must be at least ${def.validation_rules.min}`);
    }
  }
}
```

## 🔒 Data Security

### Audit Trail Implementation
```javascript
// Track all changes for audit purposes
async function logOperation(operation, entityType, entityId, oldValues, newValues) {
  await db.operational_logs.add({
    user_id: getCurrentUser().id,
    operation_type: operation,  // 'CREATE', 'UPDATE', 'DELETE'
    entity_type: entityType,
    entity_id: entityId,
    old_values: oldValues,
    new_values: newValues,
    timestamp: new Date(),
    metadata: {
      ip_address: await getClientIP(),
      user_agent: navigator.userAgent
    }
  });
}
```

### Data Encryption (Future)
```javascript
// Encrypt sensitive custom fields
const sensitiveFields = ['ssn', 'credit_card', 'password'];

function encryptSensitiveFields(customFields) {
  const encrypted = {...customFields};
  
  for (const field of sensitiveFields) {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  }
  
  return encrypted;
}
```

---

*This database context enables AI agents to understand the data architecture, performance implications, and provide guidance on schema design, query optimization, and data modeling following the project's Event/Item paradigm.*