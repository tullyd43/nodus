# Models Layer Development Context

## Related Context

- [src/core/database/GEMINI.md](src/core/database/GEMINI.md)
- [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)
- [tests/GEMINI.md](tests/GEMINI.md)

## 🏛️ Model Architecture Principles

### BaseModel Pattern
All models inherit from BaseModel to ensure consistent CRUD operations and data handling:

```javascript
// Abstract base class providing common functionality
class BaseModel {
  constructor() {
    // Direct reference to the Dexie database instance
    this.db = appDb;
    this.tableName = this.getTableName();
  }
  
  // Standardized CRUD operations
  async create(data) {
    // Ensure data is valid before saving
    this.validate(data);
    const id = await this.db[this.tableName].add(data);
    return await this.findById(id);
  }
  
  async findById(id) {
    return await this.db[this.tableName].get(id);
  }
  
  async update(id, data) {
    // Ensure data is valid before updating
    this.validate(data);
    await this.db[this.tableName].update(id, data);
    return await this.findById(id);
  }
  
  async delete(id) {
    return await this.db[this.tableName].delete(id);
  }
  
  // These methods must be implemented by child classes
  getTableName() { throw new Error('Must implement getTableName()'); }
  validate(data) { return []; }
}
```

### BaseEntity Pattern (Event/Item Detection)
```javascript
// Core abstraction for the Event/Item paradigm
class BaseEntity extends BaseModel {
  // Determines if an entity is an Event or an Item based on the presence of the `involves_action` flag
  static getType(data) {
    return data.involves_action ? 'event' : 'item';
  }
  
  static isEvent(data) {
    return this.getType(data) === 'event';
  }
  
  static isItem(data) {
    return this.getType(data) === 'item';
  }
  
  // Universal systems methods that work for both Events and Items
  async getTags(entityId) {
    return await this.db.tag_assignments
      .where({taggable_type: this.getEntityType(), taggable_id: entityId})
      .toArray();
  }
  
  async addTag(entityId, tagId) {
    return await this.db.tag_assignments.add({
      taggable_type: this.getEntityType(),
      taggable_id: entityId,
      tag_id: tagId
    });
  }
}
```

## 🚀 How to...

### Add a new model

1.  **Create a new file**: Create a new file in `src/core/models` (e.g., `NewModel.js`).
2.  **Extend `BaseModel` or `BaseEntity`**: Extend the appropriate base class.
3.  **Implement `getTableName`**: Return the name of the database table.
4.  **Implement `validate`**: Add validation logic for the model's data.
5.  **Add model-specific queries**: Add any queries that are specific to the new model.

### Add a new relationship

1.  **Update the schema**: Add a new table to `src/core/database/schema.js` to represent the relationship.
2.  **Create a model**: Create a new model for the relationship table.
3.  **Add methods to the related models**: Add methods to the related models to create and query the relationship.

## 📊 Event Model Implementation

### Core Event Operations
```javascript
class EventModel extends BaseEntity {
  getTableName() { return 'events'; }
  getEntityType() { return 'event'; }
  
  validate(data) {
    const errors = [];
    
    // Required fields
    if (!data.title) errors.push('Title is required');
    
    // Event-specific validation
    if (data.due_date && new Date(data.due_date) < new Date()) {
      errors.push('Due date cannot be in the past');
    }
    
    if (data.priority && (data.priority < 1 || data.priority > 5)) {
      errors.push('Priority must be between 1 and 5');
    }
    
    return errors;
  }
  
  // Event-specific queries
  async getUpcoming(limit = 10) {
    const today = new Date();
    return await this.db.events
      .where('due_date').above(today)
      .orderBy('due_date')
      .limit(limit)
      .toArray();
  }
  
  async getOverdue() {
    const today = new Date();
    return await this.db.events
      .where('due_date').below(today)
      .and('completed').equals(false)
      .toArray();
  }
  
  async getByPriority(minPriority = 4) {
    return await this.db.events
      .where('priority').aboveOrEqual(minPriority)
      .orderBy('priority')
      .reverse()
      .toArray();
  }
  
  async markComplete(id) {
    return await this.update(id, {
      completed: true,
      completed_at: new Date()
    });
  }
}
```

### Event Type Management
```javascript
class EventTypeModel extends BaseModel {
  getTableName() { return 'entity_types'; }
  
  async createEventType(name, category = null) {
    return await this.create({
      name,
      entity_class: 'event',
      category,
      created_at: new Date()
    });
  }
  
  async getEventTypes() {
    return await this.db.entity_types
      .where('entity_class').equals('event')
      .toArray();
  }
  
  async assignCustomFields(typeId, fieldIds) {
    const assignments = fieldIds.map(fieldId => ({
      entity_type_id: typeId,
      field_definition_id: fieldId
    }));
    
    return await this.db.entity_fields.bulkAdd(assignments);
  }
}
```

## 📦 Item Model Implementation

### Core Item Operations
```javascript
class ItemModel extends BaseEntity {
  getTableName() { return 'items'; }
  getEntityType() { return 'item'; }
  
  validate(data) {
    const errors = [];
    
    // Required fields
    if (!data.name) errors.push('Name is required');
    
    // Item-specific validation
    if (data.value && data.value < 0) {
      errors.push('Value cannot be negative');
    }
    
    if (data.quantity && data.quantity < 0) {
      errors.push('Quantity cannot be negative');
    }
    
    return errors;
  }
  
  // Item-specific queries
  async getByCategory(category) {
    return await this.db.items
      .where('category').equals(category)
      .toArray();
  }
  
  async getByValueRange(min, max) {
    return await this.db.items
      .where('value').between(min, max)
      .toArray();
  }
  
  async getInventory(location = null) {
    let query = this.db.items.where('quantity').above(0);
    
    if (location) {
      query = query.and('location').equals(location);
    }
    
    return await query.toArray();
  }
  
  async updateQuantity(id, newQuantity) {
    return await this.update(id, {
      quantity: newQuantity,
      last_updated: new Date()
    });
  }
}
```

## 🏷️ Tag Management Model

### Hierarchical Tagging System
```javascript
class TagModel extends BaseModel {
  getTableName() { return 'tags'; }
  
  validate(data) {
    const errors = [];
    if (!data.name) errors.push('Tag name is required');
    return errors;
  }
  
  async createTag(name, parentId = null, color = null) {
    return await this.create({
      name,
      parent_id: parentId,
      color: color || this.generateRandomColor(),
      created_at: new Date()
    });
  }
  
  async getHierarchy() {
    const allTags = await this.db.tags.toArray();
    return this.buildTagHierarchy(allTags);
  }
  
  buildTagHierarchy(tags, parentId = null) {
    return tags
      .filter(tag => tag.parent_id === parentId)
      .map(tag => ({
        ...tag,
        children: this.buildTagHierarchy(tags, tag.id)
      }));
  }
  
  async getTagsWithUsageCount() {
    const tags = await this.db.tags.toArray();
    const assignments = await this.db.tag_assignments.toArray();
    
    return tags.map(tag => ({
      ...tag,
      usage_count: assignments.filter(a => a.tag_id === tag.id).length
    }));
  }
  
  generateRandomColor() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}
```

### Tag Assignment Management
```javascript
class TagAssignmentModel extends BaseModel {
  getTableName() { return 'tag_assignments'; }
  
  async tagEntity(tagId, entityType, entityId) {
    // Check if already tagged to prevent duplicates
    const existing = await this.db.tag_assignments
      .where({tag_id: tagId, taggable_type: entityType, taggable_id: entityId})
      .first();
      
    if (existing) {
      return existing;
    }
    
    return await this.create({
      tag_id: tagId,
      taggable_type: entityType,
      taggable_id: entityId,
      created_at: new Date()
    });
  }
  
  async untagEntity(tagId, entityType, entityId) {
    return await this.db.tag_assignments
      .where({tag_id: tagId, taggable_type: entityType, taggable_id: entityId})
      .delete();
  }
  
  async getEntitiesByTag(tagId) {
    const assignments = await this.db.tag_assignments
      .where('tag_id').equals(tagId)
      .toArray();
    
    const results = {events: [], items: []};
    
    for (const assignment of assignments) {
      const entity = await this.db[assignment.taggable_type + 's'].get(assignment.taggable_id);
      if (entity) {
        results[assignment.taggable_type + 's'].push(entity);
      }
    }
    
    return results;
  }
}
```

## 🗂️ Collection Management Model

### Dynamic Collection Queries
```javascript
class CollectionModel extends BaseModel {
  getTableName() { return 'collections'; }
  
  async createCollection(name, queryDefinition, isSystem = false) {
    return await this.create({
      name,
      query_definition: JSON.stringify(queryDefinition),
      is_system: isSystem,
      created_at: new Date()
    });
  }
  
  async executeCollection(collectionId) {
    const collection = await this.findById(collectionId);
    if (!collection) return [];
    
    const queryDef = JSON.parse(collection.query_definition);
    return await this.executeQuery(queryDef);
  }
  
  async executeQuery(queryDefinition) {
    const {entity_type, conditions} = queryDefinition;
    const tableName = entity_type + 's';
    
    let query = this.db[tableName];
    
    // Apply conditions recursively
    query = this.applyConditions(query, conditions);
    
    return await query.toArray();
  }
  
  applyConditions(query, conditions) {
    if (!conditions || !conditions.rules) return query;
    
    // Handle different operators
    for (const rule of conditions.rules) {
      if (rule.operator === 'AND' || rule.operator === 'OR') {
        // Recursive handling of nested conditions
        query = this.applyConditions(query, rule);
      } else {
        // Apply individual field conditions
        query = this.applyFieldCondition(query, rule);
      }
    }
    
    return query;
  }
  
  applyFieldCondition(query, rule) {
    const {field, operator, value} = rule;
    
    switch (operator) {
      case '=':
      case 'equals':
        return query.where(field).equals(value);
      case '>':
        return query.where(field).above(value);
      case '>=':
        return query.where(field).aboveOrEqual(value);
      case '<':
        return query.where(field).below(value);
      case '<=':
        return query.where(field).belowOrEqual(value);
      case 'between':
        return query.where(field).between(value[0], value[1]);
      case 'contains':
        return query.where(field).startsWithIgnoreCase(value);
      default:
        return query;
    }
  }
}
```

## 🔧 Custom Fields Model

### Dynamic Field Management
```javascript
class FieldDefinitionModel extends BaseModel {
  getTableName() { return 'field_definitions'; }
  
  async createField(fieldData) {
    return await this.create({
      field_name: fieldData.field_name,
      display_name: fieldData.display_name,
      field_type: fieldData.field_type || 'text',
      validation_rules: fieldData.validation_rules || {},
      is_required: fieldData.is_required || false,
      default_value: fieldData.default_value || null,
      created_at: new Date()
    });
  }
  
  async getFieldsByType(fieldType = null) {
    if (fieldType) {
      return await this.db.field_definitions
        .where('field_type').equals(fieldType)
        .toArray();
    }
    return await this.db.field_definitions.toArray();
  }
}

class CustomFieldModel extends BaseModel {
  getTableName() { return 'custom_fields'; }
  
  async setFieldValue(entityType, entityId, fieldName, value) {
    const existing = await this.db.custom_fields
      .where({entity_type: entityType, entity_id: entityId, field_name: fieldName})
      .first();
    
    if (existing) {
      return await this.update(existing.id, {
        field_value: value,
        updated_at: new Date()
      });
    } else {
      return await this.create({
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName,
        field_value: value,
        created_at: new Date()
      });
    }
  }
  
  async getEntityFields(entityType, entityId) {
    const fields = await this.db.custom_fields
      .where({entity_type: entityType, entity_id: entityId})
      .toArray();
    
    // Convert to key-value object
    return fields.reduce((obj, field) => {
      obj[field.field_name] = field.field_value;
      return obj;
    }, {});
  }
}
```

## 🔗 Relationship Model

### Entity Linking System
```javascript
class LinkModel extends BaseModel {
  getTableName() { return 'links'; }
  
  async createLink(fromType, fromId, toType, toId, relationship = 'related') {
    return await this.create({
      from_type: fromType,
      from_id: fromId,
      to_type: toType,
      to_id: toId,
      relationship_type: relationship,
      created_at: new Date()
    });
  }
  
  async getLinkedEntities(entityType, entityId) {
    const outgoingLinks = await this.db.links
      .where({from_type: entityType, from_id: entityId})
      .toArray();
    
    const incomingLinks = await this.db.links
      .where({to_type: entityType, to_id: entityId})
      .toArray();
    
    const linkedEntities = [];
    
    // Process outgoing links
    for (const link of outgoingLinks) {
      const entity = await this.db[link.to_type + 's'].get(link.to_id);
      if (entity) {
        linkedEntities.push({
          ...entity,
          entity_type: link.to_type,
          relationship: link.relationship_type,
          direction: 'outgoing'
        });
      }
    }
    
    // Process incoming links
    for (const link of incomingLinks) {
      const entity = await this.db[link.from_type + 's'].get(link.from_id);
      if (entity) {
        linkedEntities.push({
          ...entity,
          entity_type: link.from_type,
          relationship: link.relationship_type,
          direction: 'incoming'
        });
      }
    }
    
    return linkedEntities;
  }
}
```

## 🧪 Model Testing Patterns

### Unit Testing Models
```javascript
describe('EventModel', () => {
  let eventModel;
  
  beforeEach(() => {
    eventModel = new EventModel();
  });
  
  it('should create event with validation', async () => {
    const eventData = {
      title: 'Test Event',
      priority: 4,
      due_date: new Date('2024-12-31')
    };
    
    const created = await eventModel.create(eventData);
    expect(created.title).toBe('Test Event');
    expect(created.id).toBeDefined();
  });
  
  it('should validate required fields', () => {
    const invalidData = {priority: 4};
    const errors = eventModel.validate(invalidData);
    expect(errors).toContain('Title is required');
  });
  
  it('should get upcoming events', async () => {
    const upcoming = await eventModel.getUpcoming(5);
    expect(Array.isArray(upcoming)).toBe(true);
    expect(upcoming.length).toBeLessThanOrEqual(5);
  });
});
```

## 📈 Performance Optimization

### Efficient Query Patterns
```javascript
// ✅ Good: Use compound indexes for faster queries on multiple fields
const highPriorityToday = await this.db.events
  .where('[priority+due_date]')
  .between([4, startOfDay], [5, endOfDay])
  .toArray();

// ✅ Good: Use batch operations for creating or updating multiple records at once
async bulkCreateEvents(eventsData) {
  const validatedEvents = eventsData.map(data => {
    const errors = this.validate(data);
    if (errors.length > 0) throw new Error(errors.join(', '));
    return {...data, created_at: new Date()};
  });
  
  return await this.db.events.bulkAdd(validatedEvents);
}

// ✅ Good: Use transactions for atomic operations to ensure data consistency
async transferItemOwnership(itemId, fromUserId, toUserId) {
  return await this.db.transaction('rw', this.db.items, this.db.operational_logs, async () => {
    await this.db.items.update(itemId, {owner_id: toUserId});
    await this.db.operational_logs.add({
      operation_type: 'TRANSFER',
      entity_type: 'item',
      entity_id: itemId,
      metadata: {from_user: fromUserId, to_user: toUserId}
    });
  });
}
```

---

*This models context enables AI agents to understand data access patterns, CRUD operations, model relationships, and provides guidance on implementing consistent, performant data models following the Event/Item paradigm.*