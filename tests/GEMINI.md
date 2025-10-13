# Testing Strategy Context

## Related Context

- [src/core/models/GEMINI.md](src/core/models/GEMINI.md)
- [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)
- [src/core/utils/GEMINI.md](src/core/utils/GEMINI.md)

## 🧪 Testing Philosophy

### Testing Principles
- **Event/Item Paradigm Testing**: All tests should validate both Event and Item entity types where applicable.
- **Performance-First Testing**: Include performance benchmarks in all database operation tests.
- **Universal Systems Testing**: Test that tags, collections, and templates work identically across Events and Items.
- **Real-World Data Testing**: Use realistic test data that mimics actual user input patterns.
- **Cross-Scale Testing**: Ensure tests work for both IndexedDB (client) and future PostgreSQL (server) implementations.

### Test Categories
1. **Unit Tests**: Individual functions, models, utilities.
2. **Integration Tests**: Model-ViewModel interactions, database operations.
3. **Performance Tests**: Query speed, memory usage, large dataset handling.
4. **End-to-End Tests**: Complete user workflows, natural language parsing.
5. **Universal Systems Tests**: Cross-entity functionality (tags, collections, etc.).

## 🚀 How to...

### Write a new test

1.  **Identify the test type**: Determine whether it's a unit, integration, performance, or end-to-end test.
2.  **Create a new test file**: Create a new file in the appropriate directory under `tests`.
3.  **Write the test**: Follow the patterns outlined in this document for the specific type of test.
4.  **Use mock data**: Use the mock data from `tests/fixtures` to ensure consistent results.
5.  **Run the tests**: Run the tests to ensure that they pass and that there are no regressions.

## 🏗️ Test Structure and Organization

### Test File Organization
```
tests/
├── unit/
│   ├── models/
│   │   ├── event.test.js
│   │   ├── item.test.js
│   │   ├── tag.test.js
│   │   └── base-entity.test.js
│   ├── viewmodels/
│   │   ├── event-vm.test.js
│   │   ├── item-vm.test.js
│   │   └── collection-vm.test.js
│   ├── utils/
│   │   ├── date-utils.test.js
│   │   ├── string-utils.test.js
│   │   ├── validation-utils.test.js
│   │   └── template-engine.test.js
│   └── database/
│       ├── schema.test.js
│       └── migrations.test.js
├── integration/
│   ├── crud-operations.test.js
│   ├── universal-systems.test.js
│   ├── natural-language.test.js
│   └── collection-queries.test.js
├── performance/
│   ├── query-performance.test.js
│   ├── batch-operations.test.js
│   └── memory-usage.test.js
├── e2e/
│   ├── user-workflows.test.js
│   └── cross-entity-operations.test.js
├── fixtures/
│   ├── test-data.js
│   ├── sample-events.js
│   └── sample-items.js
└── helpers/
    ├── test-database.js
    ├── mock-data.js
    └── assertions.js
```

## 🗃️ Database Testing Patterns

### Test Database Setup
```javascript
// tests/helpers/test-database.js
import Dexie from 'dexie';
import { schema } from '../../src/core/database/schema.js';

class TestDatabase {
  constructor() {
    this.db = new Dexie('TestOrganizationalEcosystem');
    this.db.version(1).stores(schema);
  }
  
  async setup() {
    // Delete the database before each test to ensure a clean state
    await this.db.delete();
    await this.db.open();
    return this.db;
  }
  
  async teardown() {
    await this.db.close();
    await this.db.delete();
  }
  
  async seedTestData() {
    // Add consistent test data for predictable results
    const testEvents = [
      {
        id: 1,
        title: 'Test Event 1',
        priority: 4,
        due_date: new Date('2024-12-31'),
        budget: 100.00,
        tags: ['work', 'urgent'],
        completed: false
      },
      {
        id: 2,
        title: 'Test Event 2',
        priority: 2,
        due_date: new Date('2025-01-15'),
        location: 'office',
        completed: true
      }
    ];
    
    const testItems = [
      {
        id: 1,
        name: 'Test Item 1',
        value: 999.99,
        quantity: 1,
        location: 'warehouse',
        tags: ['equipment', 'tech']
      },
      {
        id: 2,
        name: 'Test Item 2',
        value: 25.50,
        quantity: 10,
        category: 'supplies'
      }
    ];
    
    await this.db.events.bulkAdd(testEvents);
    await this.db.items.bulkAdd(testItems);
  }
}

export { TestDatabase };
```

### Model Testing Pattern
```javascript
// tests/unit/models/event.test.js
import { EventModel } from '../../../src/core/models/Event.js';
import { TestDatabase } from '../../helpers/test-database.js';

describe('EventModel', () => {
  let eventModel;
  let testDb;
  
  beforeEach(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    await testDb.seedTestData();
    
    eventModel = new EventModel();
    // Inject the test database into the model
    eventModel.db = testDb.db;
  });
  
  afterEach(async () => {
    await testDb.teardown();
  });
  
  describe('CRUD Operations', () => {
    it('should create event with all properties', async () => {
      const eventData = {
        title: 'New Test Event',
        priority: 5,
        due_date: new Date('2024-12-25'),
        budget: 250.00,
        location: 'home',
        tags: ['personal', 'urgent']
      };
      
      const created = await eventModel.create(eventData);
      
      expect(created.id).toBeDefined();
      expect(created.title).toBe(eventData.title);
      expect(created.priority).toBe(eventData.priority);
      expect(created.budget).toBe(eventData.budget);
      expect(created.created_at).toBeInstanceOf(Date);
    });
    
    it('should validate required fields', () => {
      const invalidData = { priority: 4 }; // Missing title
      
      const errors = eventModel.validate(invalidData);
      
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe('Title is required');
    });
    
    it('should validate priority range', () => {
      const invalidData = { title: 'Test', priority: 6 };
      
      const errors = eventModel.validate(invalidData);
      
      expect(errors).toContain('Priority must be between 1 and 5');
    });
  });
  
  describe('Event-Specific Queries', () => {
    it('should get upcoming events', async () => {
      const upcoming = await eventModel.getUpcoming(5);
      
      expect(Array.isArray(upcoming)).toBe(true);
      expect(upcoming.length).toBeLessThanOrEqual(5);
      
      // All events should have future due dates
      upcoming.forEach(event => {
        expect(new Date(event.due_date)).toBeAfter(new Date());
      });
    });
    
    it('should get overdue events', async () => {
      const overdue = await eventModel.getOverdue();
      
      expect(Array.isArray(overdue)).toBe(true);
      
      // All events should be past due and incomplete
      overdue.forEach(event => {
        expect(new Date(event.due_date)).toBeBefore(new Date());
        expect(event.completed).toBe(false);
      });
    });
    
    it('should filter by priority', async () => {
      const highPriority = await eventModel.getByPriority(4);
      
      expect(Array.isArray(highPriority)).toBe(true);
      
      highPriority.forEach(event => {
        expect(event.priority).toBeGreaterThanOrEqual(4);
      });
    });
    
    it('should mark event complete', async () => {
      const event = await eventModel.findById(1);
      expect(event.completed).toBe(false);
      
      await eventModel.markComplete(1);
      
      const completedEvent = await eventModel.findById(1);
      expect(completedEvent.completed).toBe(true);
      expect(completedEvent.completed_at).toBeInstanceOf(Date);
    });
  });
  
  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      // Generate a large dataset for performance testing
      const largeDataset = Array.from({length: 1000}, (_, i) => ({
        title: `Event ${i}`,
        priority: Math.ceil(Math.random() * 5),
        due_date: new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000),
        budget: Math.random() * 1000
      }));
      
      const startTime = performance.now();
      await eventModel.bulkCreate(largeDataset);
      const createTime = performance.now() - startTime;
      
      expect(createTime).toBeLessThan(5000); // Should complete in under 5 seconds
      
      const queryStart = performance.now();
      const highPriorityEvents = await eventModel.getByPriority(4);
      const queryTime = performance.now() - queryStart;
      
      expect(queryTime).toBeLessThan(1000); // Should query in under 1 second
      expect(highPriorityEvents.length).toBeGreaterThan(0);
    });
  });
});
```

## 🎯 Universal Systems Testing

### Cross-Entity Testing Pattern
```javascript
// tests/integration/universal-systems.test.js
import { EventModel } from '../../src/core/models/Event.js';
import { ItemModel } from '../../src/core/models/Item.js';
import { TagModel } from '../../src/core/models/Tag.js';
import { TagAssignmentModel } from '../../src/core/models/TagAssignment.js';
import { TestDatabase } from '../helpers/test-database.js';

describe('Universal Systems Integration', () => {
  let testDb;
  let eventModel, itemModel, tagModel, tagAssignmentModel;
  
  beforeEach(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    
    eventModel = new EventModel();
    itemModel = new ItemModel();
    tagModel = new TagModel();
    tagAssignmentModel = new TagAssignmentModel();
    
    // Inject the test database into each model
    [eventModel, itemModel, tagModel, tagAssignmentModel].forEach(model => {
      model.db = testDb.db;
    });
  });
  
  afterEach(async () => {
    await testDb.teardown();
  });
  
  describe('Tagging System', () => {
    it('should tag both Events and Items with the same tag', async () => {
      // Create test entities
      const event = await eventModel.create({
        title: 'Test Event',
        priority: 4
      });
      
      const item = await itemModel.create({
        name: 'Test Item',
        value: 100
      });
      
      // Create a tag
      const tag = await tagModel.create({
        name: 'work',
        color: '#blue'
      });
      
      // Tag both entities with the same tag
      await tagAssignmentModel.tagEntity(tag.id, 'event', event.id);
      await tagAssignmentModel.tagEntity(tag.id, 'item', item.id);
      
      // Verify that both entities are tagged correctly
      const eventTags = await eventModel.getTags(event.id);
      const itemTags = await itemModel.getTags(item.id);
      
      expect(eventTags).toHaveLength(1);
      expect(itemTags).toHaveLength(1);
      expect(eventTags[0].tag_id).toBe(tag.id);
      expect(itemTags[0].tag_id).toBe(tag.id);
    });
    
    it('should find entities by tag across types', async () => {
      const tag = await tagModel.create({name: 'urgent'});
      
      const event = await eventModel.create({title: 'Urgent Event'});
      const item = await itemModel.create({name: 'Urgent Item'});
      
      await tagAssignmentModel.tagEntity(tag.id, 'event', event.id);
      await tagAssignmentModel.tagEntity(tag.id, 'item', item.id);
      
      const entitiesByTag = await tagAssignmentModel.getEntitiesByTag(tag.id);
      
      expect(entitiesByTag.events).toHaveLength(1);
      expect(entitiesByTag.items).toHaveLength(1);
      expect(entitiesByTag.events[0].title).toBe('Urgent Event');
      expect(entitiesByTag.items[0].name).toBe('Urgent Item');
    });
  });
  
  describe('Collection System', () => {
    it('should create collections that work across entity types', async () => {
      // Test the collection query language with both Events and Items
      const collectionModel = new CollectionModel();
      collectionModel.db = testDb.db;
      
      // Create test data
      await eventModel.create({title: 'High Priority Event', priority: 5});
      await itemModel.create({name: 'High Value Item', value: 1000});
      
      // Create collections for high priority/value
      const eventCollection = await collectionModel.createCollection(
        'High Priority Events',
        {
          entity_type: 'event',
          conditions: {
            operator: 'AND',
            rules: [{field: 'priority', operator: '>=', value: 4}]
          }
        }
      );
      
      const itemCollection = await collectionModel.createCollection(
        'High Value Items',
        {
          entity_type: 'item',
          conditions: {
            operator: 'AND',
            rules: [{field: 'value', operator: '>=', value: 500}]
          }
        }
      );
      
      // Execute the collections and verify the results
      const eventResults = await collectionModel.executeCollection(eventCollection.id);
      const itemResults = await collectionModel.executeCollection(itemCollection.id);
      
      expect(eventResults).toHaveLength(1);
      expect(itemResults).toHaveLength(1);
      expect(eventResults[0].priority).toBe(5);
      expect(itemResults[0].value).toBe(1000);
    });
  });
  
  describe('Custom Fields System', () => {
    it('should support custom fields for both entity types', async () => {
      const fieldDefinitionModel = new FieldDefinitionModel();
      const customFieldModel = new CustomFieldModel();
      
      [fieldDefinitionModel, customFieldModel].forEach(model => {
        model.db = testDb.db;
      });
      
      // Create custom field definitions
      const durationField = await fieldDefinitionModel.createField({
        field_name: 'duration',
        display_name: 'Duration (minutes)',
        field_type: 'integer',
        validation_rules: {min: 1, max: 480}
      });
      
      const conditionField = await fieldDefinitionModel.createField({
        field_name: 'condition',
        display_name: 'Condition',
        field_type: 'select',
        validation_rules: {options: ['new', 'good', 'fair', 'poor']}
      });
      
      // Create entities with custom fields
      const event = await eventModel.create({title: 'Workout Event'});
      const item = await itemModel.create({name: 'Exercise Equipment'});
      
      // Set custom field values
      await customFieldModel.setFieldValue('event', event.id, 'duration', 45);
      await customFieldModel.setFieldValue('item', item.id, 'condition', 'good');
      
      // Retrieve and verify the custom fields
      const eventFields = await customFieldModel.getEntityFields('event', event.id);
      const itemFields = await customFieldModel.getEntityFields('item', item.id);
      
      expect(eventFields.duration).toBe(45);
      expect(itemFields.condition).toBe('good');
    });
  });
});
```

## 🚀 Performance Testing Patterns

### Query Performance Testing
```javascript
// tests/performance/query-performance.test.js
import { PerformanceUtils } from '../../src/core/utils/performanceUtils.js';
import { TestDatabase } from '../helpers/test-database.js';

describe('Query Performance', () => {
  let testDb;
  let eventModel, itemModel;
  
  beforeAll(async () => {
    testDb = new TestDatabase();
    await testDb.setup();
    
    // Generate a large test dataset
    await generateLargeDataset(testDb.db);
    
    eventModel = new EventModel();
    itemModel = new ItemModel();
    [eventModel, itemModel].forEach(model => {
      model.db = testDb.db;
    });
  });
  
  afterAll(async () => {
    await testDb.teardown();
  });
  
  it('should execute priority queries under 1 second', async () => {
    const result = await PerformanceUtils.measureQueryPerformance(
      'high-priority-events',
      () => eventModel.getByPriority(4)
    );
    
    expect(result.length).toBeGreaterThan(0);
    
    const metrics = window.queryMetrics['high-priority-events'];
    expect(metrics.avgDuration).toBeLessThan(1000); // < 1 second
  });
  
  it('should handle compound index queries efficiently', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-12-31');
    
    const result = await PerformanceUtils.measureQueryPerformance(
      'priority-date-range',
      () => testDb.db.events
        .where('[priority+due_date]')
        .between([4, startDate], [5, endDate])
        .toArray()
    );
    
    const metrics = window.queryMetrics['priority-date-range'];
    expect(metrics.avgDuration).toBeLessThan(500); // < 0.5 seconds
  });
  
  it('should perform batch operations efficiently', async () => {
    const updates = Array.from({length: 100}, (_, i) => ({
      id: i + 1,
      updated_at: new Date()
    }));
    
    const startTime = performance.now();
    await testDb.db.events.bulkPut(updates);
    const duration = performance.now() - startTime;
    
    expect(duration).toBeLessThan(1000); // < 1 second for 100 updates
  });
  
  it('should monitor memory usage during large operations', async () => {
    const initialMemory = PerformanceUtils.getMemoryUsage();
    
    // Perform a memory-intensive operation
    const largeResults = await testDb.db.events.toArray();
    
    const finalMemory = PerformanceUtils.getMemoryUsage();
    
    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory.used - initialMemory.used;
      expect(memoryIncrease).toBeLessThan(100); // < 100MB increase
    }
  });
});

async function generateLargeDataset(db) {
  const events = Array.from({length: 10000}, (_, i) => ({
    title: `Event ${i}`,
    priority: Math.ceil(Math.random() * 5),
    due_date: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000),
    budget: Math.random() * 1000,
    completed: Math.random() > 0.7
  }));
  
  const items = Array.from({length: 5000}, (_, i) => ({
    name: `Item ${i}`,
    value: Math.random() * 1000,
    quantity: Math.ceil(Math.random() * 100),
    location: ['warehouse', 'office', 'home'][Math.floor(Math.random() * 3)]
  }));
  
  await db.events.bulkAdd(events);
  await db.items.bulkAdd(items);
}
```

## 🎭 Natural Language Testing

### Input Parsing Tests
```javascript
// tests/integration/natural-language.test.js
import { StringUtils } from '../../src/core/utils/stringUtils.js';
import { DateUtils } from '../../src/core/utils/dateUtils.js';

describe('Natural Language Processing', () => {
  describe('Quick Capture Parsing', () => {
    it('should parse complex event input correctly', () => {
      const input = 'Call John tomorrow 2pm #work priority:high $25 @office';
      const parsed = StringUtils.parseQuickCapture(input);
      
      expect(parsed.title).toBe('Call John 2pm');
      expect(parsed.involves_action).toBe(true);
      expect(parsed.tags).toContain('work');
      expect(parsed.priority).toBe(5);
      expect(parsed.budget).toBe(25);
      expect(parsed.location).toBe('office');
    });
    
    it('should parse item input correctly', () => {
      const input = 'iPhone 15 Pro $999 #tech qty:2 @warehouse';
      const parsed = StringUtils.parseQuickCapture(input);
      
      expect(parsed.title).toBe('iPhone 15 Pro');
      expect(parsed.involves_action).toBe(false);
      expect(parsed.tags).toContain('tech');
      expect(parsed.budget).toBe(999);
      expect(parsed.quantity).toBe(2);
      expect(parsed.location).toBe('warehouse');
    });
    
    it('should detect action language patterns', () => {
      const actionInputs = [
        'Call John',
        'Buy groceries',
        'Schedule meeting',
        'Complete project',
        'Working on presentation',
        'Meet at 2pm'
      ];
      
      const itemInputs = [
        'MacBook Pro',
        'Office chair',
        'Conference room',
        'Budget allocation',
        'John Smith contact info'
      ];
      
      actionInputs.forEach(input => {
        expect(StringUtils.detectActionLanguage(input)).toBe(true);
      });
      
      itemInputs.forEach(input => {
        expect(StringUtils.detectActionLanguage(input)).toBe(false);
      });
    });
  });
  
  describe('Date Parsing', () => {
    it('should parse relative dates correctly', () => {
      const today = new Date();
      
      const tomorrow = DateUtils.parseNaturalDate('tomorrow');
      expect(tomorrow.getDate()).toBe(today.getDate() + 1);
      
      const nextWeek = DateUtils.parseNaturalDate('next week');
      expect(nextWeek.getDate()).toBe(today.getDate() + 7);
    });
    
    it('should parse time patterns', () => {
      const result = DateUtils.parseNaturalDate('tomorrow 2pm');
      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(0);
    });
    
    it('should handle various date formats', () => {
      const isoDate = DateUtils.parseNaturalDate('2024-12-31');
      expect(isoDate.getFullYear()).toBe(2024);
      expect(isoDate.getMonth()).toBe(11); // December (0-indexed)
      expect(isoDate.getDate()).toBe(31);
      
      const usDate = DateUtils.parseNaturalDate('12/31/2024');
      expect(usDate.getFullYear()).toBe(2024);
      expect(usDate.getMonth()).toBe(11);
      expect(usDate.getDate()).toBe(31);
    });
  });
});
```

## 🎨 Template Engine Testing

### Template Rendering Tests
```javascript
// tests/unit/utils/template-engine.test.js
import { TemplateEngine } from '../../../src/core/utils/templateEngine.js';

describe('TemplateEngine', () => {
  const testData = {
    event: {
      title: 'Important Meeting',
      priority: 4,
      due_date: new Date('2024-12-31T14:00:00'),
      budget: 250.75,
      tags: ['work', 'urgent']
    },
    user: {
      name: 'John Doe',
      email: 'john@example.com'
    }
  };
  
  describe('Variable Substitution', () => {
    it('should substitute simple variables', () => {
      const template = 'Hello {{user.name}}, you have an event: {{event.title}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('Hello John Doe, you have an event: Important Meeting');
    });
    
    it('should handle missing variables gracefully', () => {
      const template = 'Event: {{event.title}} | Missing: {{event.missing}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('Event: Important Meeting | Missing: ');
    });
  });
  
  describe('Filter Application', () => {
    it('should apply date filters', () => {
      const template = 'Due: {{event.due_date | date}} | Relative: {{event.due_date | relative_time}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toContain('Due: ');
      expect(result).toContain('Relative: ');
    });
    
    it('should apply currency filters', () => {
      const template = 'Budget: {{event.budget | currency:USD}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('Budget: $250.75');
    });
    
    it('should apply priority badge filter', () => {
      const template = 'Priority: {{event.priority | priority_badge}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('Priority: 🟠 High');
    });
    
    it('should apply default filter', () => {
      const template = 'Location: {{event.location | default:"No location set"}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('Location: No location set');
    });
    
    it('should chain multiple filters', () => {
      const template = '{{event.title | uppercase | truncate:10}}';
      const result = TemplateEngine.render(template, testData);
      
      expect(result).toBe('IMPORTANT...');
    });
  });
  
  describe('Conditional Logic', () => {
    it('should render conditional blocks', () => {
      const template = `
        {{#if event.budget}}
        Budget allocated: {{event.budget | currency}}
        {{/if}}
      `;
      
      const result = TemplateEngine.render(template, testData);
      expect(result).toContain('Budget allocated: $250.75');
    });
    
    it('should handle comparison conditions', () => {
      const template = `
        {{#if event.priority >= 4}}
        High priority event!
        {{/if}}
      `;
      
      const result = TemplateEngine.render(template, testData);
      expect(result).toContain('High priority event!');
    });
  });
  
  describe('Loop Processing', () => {
    it('should render loops correctly', () => {
      const template = `
        Tags: {{#each event.tags}}#{{this}}{{/each}}
      `;
      
      const result = TemplateEngine.render(template, testData);
      expect(result.trim()).toBe('Tags: #work#urgent');
    });
    
    it('should provide loop context variables', () => {
      const template = `
        {{#each event.tags}}
        {{@index}}: {{this}} {{#if @last}}(last){{/if}}
        {{/each}}
      `;
      
      const result = TemplateEngine.render(template, testData);
      expect(result).toContain('0: work');
      expect(result).toContain('1: urgent (last)');
    });
  });
});
```

## 📊 Test Fixtures and Helpers

### Shared Test Data
```javascript
// tests/fixtures/test-data.js
export const sampleEvents = [
  {
    id: 1,
    title: 'Team Meeting',
    priority: 3,
    due_date: new Date('2024-12-31T10:00:00'),
    location: 'conference-room-a',
    budget: 0,
    tags: ['work', 'meeting'],
    completed: false,
    involves_action: true
  },
  {
    id: 2,
    title: 'Buy Christmas Gifts',
    priority: 4,
    due_date: new Date('2024-12-20T18:00:00'),
    budget: 500.00,
    tags: ['personal', 'shopping'],
    completed: false,
    involves_action: true
  },
  {
    id: 3,
    title: 'Workout Session',
    priority: 2,
    due_date: new Date('2024-12-15T07:00:00'),
    location: 'gym',
    duration: 60,
    tags: ['health', 'routine'],
    completed: true,
    involves_action: true
  }
];

export const sampleItems = [
  {
    id: 1,
    name: 'MacBook Pro 16"',
    value: 2499.00,
    quantity: 1,
    location: 'office',
    category: 'electronics',
    tags: ['tech', 'equipment'],
    serial_number: 'MBP2024001',
    involves_action: false
  },
  {
    id: 2,
    name: 'Office Supplies',
    value: 150.00,
    quantity: 25,
    location: 'supply-room',
    category: 'supplies',
    tags: ['office', 'consumable'],
    involves_action: false
  },
  {
    id: 3,
    name: 'Conference Room B',
    value: 0,
    quantity: 1,
    location: 'building-2-floor-3',
    category: 'facility',
    capacity: 12,
    tags: ['meeting', 'space'],
    involves_action: false
  }
];
```

### Custom Test Matchers
```javascript
// tests/helpers/assertions.js
export const customMatchers = {
  toBeAfter(received, expected) {
    const pass = new Date(received) > new Date(expected);
    return {
      pass,
      message: () => `Expected ${received} to be after ${expected}`
    };
  },
  
  toBeBefore(received, expected) {
    const pass = new Date(received) < new Date(expected);
    return {
      pass,
      message: () => `Expected ${received} to be before ${expected}`
    };
  },
  
  toHaveValidEntityStructure(received, entityType) {
    const requiredFields = entityType === 'event' 
      ? ['title', 'priority', 'created_at']
      : ['name', 'created_at'];
    
    const pass = requiredFields.every(field => 
      received.hasOwnProperty(field) && received[field] !== undefined
    );
    
    return {
      pass,
      message: () => `Expected ${entityType} to have valid structure`
    };
  },
  
  toBeWithinPerformanceThreshold(received, threshold) {
    const pass = received < threshold;
    return {
      pass,
      message: () => `Expected ${received}ms to be under ${threshold}ms threshold`
    };
  }
};

// Setup for Jest
beforeEach(() => {
  expect.extend(customMatchers);
});
```

---

*This testing context enables AI agents to understand testing patterns, performance benchmarks, universal system validation, and provides guidance on writing comprehensive tests that validate the Event/Item paradigm across all application layers.*