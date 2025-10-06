# Development Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Environment](#development-environment)
3. [Code Organization](#code-organization)
4. [MVVM Patterns](#mvvm-patterns)
5. [Database Development](#database-development)
6. [Testing Strategies](#testing-strategies)
7. [Performance Guidelines](#performance-guidelines)
8. [Common Patterns](#common-patterns)
9. [Troubleshooting](#troubleshooting)
10. [Contributing Guidelines](#contributing-guidelines)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- Modern web browser with IndexedDB support
- Basic understanding of JavaScript ES6+
- Familiarity with promises and async/await

### Initial Setup

1. **Clone and Install**
   ```bash
   # Navigate to project directory
   cd productivity-app
   
   # Install dependencies
   npm install
   ```

2. **Start Development Server**
   ```bash
   # Start with basic server
   npm start
   
   # Start with live reload (recommended)
   npm run dev
   ```

3. **Open in Browser**
   Navigate to `http://localhost:3000`

4. **Verify Installation**
   - Database should initialize automatically
   - Test interface should be visible
   - Console should show initialization messages

### Project Structure Overview

```
productivity-app/
├── index.html              # Entry point
├── package.json            # Dependencies
├── docs/                   # Documentation
│   ├── ARCHITECTURE.md     # System architecture
│   ├── API_REFERENCE.md    # API documentation
│   └── DEVELOPMENT.md      # This file
├── css/
│   └── main.css           # Styling
└── js/
    ├── app.js             # Application initialization
    ├── database/          # Database layer
    ├── models/            # Data access layer
    └── viewmodels/        # Business logic layer
```

## Development Environment

### Recommended Tools

#### Code Editor
- **VS Code** with extensions:
  - JavaScript (ES6) code snippets
  - Prettier - Code formatter
  - ESLint
  - Live Server

#### Browser DevTools
- Chrome DevTools for debugging
- Application tab for IndexedDB inspection
- Console for ViewModel testing

#### Optional Tools
- **Postman** for future API testing
- **DB Browser** for SQLite (when adding backend)

### Configuration Files

#### package.json Scripts
```json
{
  "scripts": {
    "start": "npx serve .",
    "dev": "npx serve . --live",
    "test": "echo \"No tests yet\" && exit 0"
  }
}
```

#### Development Dependencies
```json
{
  "dependencies": {
    "dexie": "^3.2.4"
  },
  "devDependencies": {
    "serve": "^14.2.1"
  }
}
```

### Browser Support

#### Minimum Requirements
- Chrome 58+
- Firefox 55+
- Safari 11+
- Edge 79+

#### Key Features Used
- IndexedDB
- ES6 Modules
- Promises/Async-Await
- Service Workers (future)

## Code Organization

### File Naming Conventions

```
kebab-case.js           # Files
PascalCase              # Classes
camelCase               # Variables, functions
UPPER_SNAKE_CASE        # Constants
```

### Directory Structure Rules

#### `/js/database/`
- **Purpose:** Database schema and connection management
- **Files:**
  - `schema.js` - Complete IndexedDB schema
  - `db.js` - Database initialization and connection

#### `/js/models/`
- **Purpose:** Pure data access layer
- **Rules:**
  - No business logic
  - Direct database operations only
  - Consistent error handling
  - No UI concerns

#### `/js/viewmodels/`
- **Purpose:** Business logic and state management
- **Rules:**
  - No direct DOM manipulation
  - Observable state patterns
  - Event-driven communication
  - Cross-ViewModel coordination

#### `/js/views/` (Future)
- **Purpose:** UI components and DOM manipulation
- **Rules:**
  - No business logic
  - Bind to ViewModel events
  - Handle user interactions only

### Import/Export Patterns

#### Module Exports
```javascript
// Models - export class
class EventModel {
    // ...
}
window.EventModel = EventModel;

// ViewModels - export class
class EventViewModel {
    // ...
}
window.EventViewModel = EventViewModel;

// Utilities - export functions
window.appDb = new ProductivityDatabase();
```

#### Module Dependencies
```javascript
// Models depend on:
// - Database connection (appDb)
// - Schema definitions

// ViewModels depend on:
// - Respective Models
// - Other ViewModels (for coordination)

// Views depend on:
// - ViewModels only
```

## MVVM Patterns

### Model Layer Guidelines

#### Responsibilities
- Database CRUD operations
- Data validation
- Relationship management
- Error handling

#### Implementation Pattern
```javascript
class ExampleModel {
    constructor() {
        this.db = appDb.getDb();
    }

    async create(data) {
        try {
            // Validate required fields
            if (!data.requiredField) {
                throw new Error('Required field missing');
            }

            // Set defaults
            const record = {
                user_id: appDb.getCurrentUserId(),
                ...data
            };

            // Create record
            const id = await this.db.tableName.add(record);
            
            // Return full record with relationships
            return await this.getById(id);
        } catch (error) {
            console.error('Failed to create:', error);
            throw error;
        }
    }

    async getById(id) {
        try {
            const record = await this.db.tableName.get(id);
            if (!record) return null;

            // Populate relationships
            record.related = await this.getRelatedData(id);
            
            return record;
        } catch (error) {
            console.error('Failed to get by ID:', error);
            throw error;
        }
    }

    // ... other CRUD methods
}
```

#### Model Best Practices
1. **Always validate input data**
2. **Use transactions for multi-table operations**
3. **Populate relationships consistently**
4. **Handle errors gracefully**
5. **Log operations for debugging**

### ViewModel Layer Guidelines

#### Responsibilities
- State management
- Business logic
- User input validation
- Cross-ViewModel coordination
- UI state tracking

#### Implementation Pattern
```javascript
class ExampleViewModel {
    constructor() {
        this.model = new ExampleModel();
        
        // Observable state
        this.state = {
            data: [],
            selectedItem: null,
            isLoading: false,
            filters: {},
            // ... other state
        };
        
        // Event listeners
        this.listeners = {
            stateChange: [],
            dataChange: [],
            // ... other events
        };
    }

    // State management
    setState(newState) {
        const previousState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        this.notifyListeners('stateChange', { 
            previousState, 
            currentState: this.state,
            changes: newState 
        });
    }

    getState() {
        return { ...this.state };
    }

    // Event system
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    notifyListeners(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }
    }

    // Business operations
    async loadData() {
        try {
            this.setState({ isLoading: true });
            
            const data = await this.model.query(this.state.filters);
            
            this.setState({ 
                data,
                isLoading: false
            });
            
            return data;
        } catch (error) {
            console.error('Failed to load data:', error);
            this.setState({ isLoading: false });
            throw error;
        }
    }

    // ... other business methods
}
```

#### ViewModel Best Practices
1. **Maintain immutable state updates**
2. **Use consistent error handling**
3. **Emit events for significant changes**
4. **Validate business rules**
5. **Coordinate with other ViewModels through AppViewModel**

### View Layer Guidelines (Future)

#### Responsibilities
- DOM manipulation
- User event handling
- UI state reflection
- ViewModel binding

#### Implementation Pattern
```javascript
class ExampleView {
    constructor(viewModel, containerElement) {
        this.viewModel = viewModel;
        this.container = containerElement;
        
        this.setupEventListeners();
        this.bindToViewModel();
    }

    setupEventListeners() {
        // Handle user interactions
        this.container.addEventListener('click', (e) => {
            if (e.target.matches('.action-button')) {
                this.handleAction(e.target.dataset.action);
            }
        });
    }

    bindToViewModel() {
        // React to ViewModel changes
        this.viewModel.on('stateChange', (data) => {
            this.updateUI(data.currentState);
        });
    }

    updateUI(state) {
        // Update DOM based on state
        if (state.isLoading) {
            this.showLoading();
        } else {
            this.hideLoading();
            this.renderData(state.data);
        }
    }

    handleAction(action) {
        // Delegate to ViewModel
        switch (action) {
            case 'create':
                this.viewModel.create(this.getFormData());
                break;
            // ... other actions
        }
    }
}
```

## Database Development

### Schema Evolution

#### Adding New Tables
1. **Update schema.js**
   ```javascript
   // Add to DB_SCHEMA.stores
   new_table: {
       keyPath: 'id',
       autoIncrement: true,
       indexes: {
           'user_id': {},
           'name': {},
           '[user_id+name]': { unique: true }
       }
   }
   ```

2. **Increment version**
   ```javascript
   const DB_SCHEMA = {
       version: 2, // Increment version
       // ...
   };
   ```

3. **Handle migration**
   ```javascript
   // In db.js
   this.db.version(2).stores({
       // ... existing stores
       new_table: '++id, user_id, name, [user_id+name]'
   });
   ```

#### Modifying Existing Tables
```javascript
// Version 2 - Add new field
this.db.version(2).stores({
    events: '++event_id, user_id, title, status, new_field' // Add new_field
});

// Version 3 - Add new index
this.db.version(3).stores({
    events: '++event_id, user_id, title, status, new_field, [user_id+new_field]'
});
```

### Query Optimization

#### Use Compound Indexes
```javascript
// Good - uses compound index
const events = await db.events
    .where('[user_id+status]')
    .equals([userId, 'todo'])
    .toArray();

// Bad - requires full table scan
const events = await db.events
    .where('user_id')
    .equals(userId)
    .and(event => event.status === 'todo')
    .toArray();
```

#### Optimize Polymorphic Queries
```javascript
// Good - uses polymorphic index
const assignments = await db.tag_assignments
    .where('[taggable_type+taggable_id]')
    .equals(['event', eventId])
    .toArray();

// Bad - less efficient
const assignments = await db.tag_assignments
    .where('taggable_id')
    .equals(eventId)
    .and(a => a.taggable_type === 'event')
    .toArray();
```

#### Batch Operations
```javascript
// Good - single transaction
await db.transaction('rw', db.events, db.tag_assignments, async () => {
    const eventId = await db.events.add(eventData);
    
    for (const tagId of tagIds) {
        await db.tag_assignments.add({
            tag_id: tagId,
            taggable_id: eventId,
            taggable_type: 'event'
        });
    }
});

// Bad - multiple transactions
const eventId = await db.events.add(eventData);
for (const tagId of tagIds) {
    await db.tag_assignments.add({...}); // Each is a separate transaction
}
```

### Performance Monitoring

#### Query Performance
```javascript
// Measure query performance
const start = performance.now();
const results = await db.events.where('status').equals('todo').toArray();
const duration = performance.now() - start;
console.log(`Query took ${duration}ms`);
```

#### Memory Usage
```javascript
// Monitor state size
const getStateSize = (obj) => {
    return new Blob([JSON.stringify(obj)]).size;
};

console.log(`ViewModel state: ${getStateSize(viewModel.getState())} bytes`);
```

## Testing Strategies

### Manual Testing with Console

#### ViewModel Testing
```javascript
// Get ViewModels
const eventVM = getEventVM();
const tagVM = getTagVM();
const itemVM = getItemVM();

// Test CRUD operations
await eventVM.createEvent({
    title: 'Test Event',
    content: 'Testing #test',
    tags: ['test']
});

// Test queries
const events = await eventVM.query({ status: 'todo' });
console.log('Todo events:', events.length);

// Test relationships
const tags = await tagVM.getAllTags();
console.log('All tags:', tags.map(t => t.tag_name));
```

#### Database Testing
```javascript
// Direct database access
const db = appDb.getDb();

// Test indexes
const indexedQuery = await db.events
    .where('[user_id+status]')
    .equals([1, 'todo'])
    .toArray();

// Test transactions
await db.transaction('rw', db.events, db.tags, async () => {
    // Multi-table operations
});
```

### Automated Testing Framework (Future)

#### Unit Test Structure
```javascript
// event-model.test.js
describe('EventModel', () => {
    let eventModel;
    
    beforeEach(async () => {
        await appDb.clearAllData();
        eventModel = new EventModel();
    });
    
    test('creates event with tags', async () => {
        const event = await eventModel.create({
            title: 'Test',
            content: 'Test #testing',
            tags: ['testing']
        });
        
        expect(event.title).toBe('Test');
        expect(event.tags).toHaveLength(1);
        expect(event.tags[0].tag_name).toBe('testing');
    });
});
```

#### Integration Test Structure
```javascript
// event-viewmodel.test.js
describe('EventViewModel Integration', () => {
    let eventVM;
    
    beforeEach(async () => {
        await appDb.clearAllData();
        eventVM = new EventViewModel();
        await eventVM.initialize();
    });
    
    test('quick capture creates event with parsed tags', async () => {
        const event = await eventVM.quickCapture('Buy milk #shopping #urgent');
        
        expect(event.title).toBe('Buy milk');
        expect(event.tags.map(t => t.tag_name)).toContain('shopping');
        expect(event.tags.map(t => t.tag_name)).toContain('urgent');
    });
});
```

### Performance Testing

#### Load Testing
```javascript
// Create large dataset
const createTestData = async (count) => {
    const events = [];
    for (let i = 0; i < count; i++) {
        events.push({
            title: `Event ${i}`,
            content: `Content for event ${i} #test`,
            tags: ['test', `batch${Math.floor(i/100)}`]
        });
    }
    
    const start = performance.now();
    for (const event of events) {
        await eventVM.createEvent(event);
    }
    const duration = performance.now() - start;
    
    console.log(`Created ${count} events in ${duration}ms`);
};

// Test with 1000 events
await createTestData(1000);
```

#### Memory Leak Testing
```javascript
// Monitor memory usage
const monitorMemory = () => {
    if (performance.memory) {
        console.log({
            used: performance.memory.usedJSHeapSize,
            total: performance.memory.totalJSHeapSize,
            limit: performance.memory.jsHeapSizeLimit
        });
    }
};

// Test for leaks
setInterval(monitorMemory, 5000);
```

## Performance Guidelines

### State Management Performance

#### Minimize State Changes
```javascript
// Good - single state change
this.setState({
    data: newData,
    isLoading: false,
    selectedItem: newData[0]
});

// Bad - multiple state changes
this.setState({ data: newData });
this.setState({ isLoading: false });
this.setState({ selectedItem: newData[0] });
```

#### Use Immutable Updates
```javascript
// Good - immutable update
const updatedEvents = this.state.events.map(event => 
    event.event_id === eventId ? { ...event, status: 'done' } : event
);
this.setState({ events: updatedEvents });

// Bad - mutating state
this.state.events.find(e => e.event_id === eventId).status = 'done';
this.setState({ events: this.state.events });
```

### Database Performance

#### Use Appropriate Indexes
```javascript
// Fast - uses index
await db.events.where('user_id').equals(userId).toArray();

// Slow - no index
await db.events.filter(event => event.title.includes('search')).toArray();
```

#### Optimize Relationships
```javascript
// Good - single query with joins
const eventsWithTags = await Promise.all(
    events.map(async event => ({
        ...event,
        tags: await getEventTags(event.event_id)
    }))
);

// Better - batch query
const eventIds = events.map(e => e.event_id);
const allTagAssignments = await db.tag_assignments
    .where('taggable_id')
    .anyOf(eventIds)
    .and(a => a.taggable_type === 'event')
    .toArray();

// Group by event_id for efficient lookup
const tagsByEvent = groupBy(allTagAssignments, 'taggable_id');
```

### Memory Management

#### Clean Up Event Listeners
```javascript
class ExampleViewModel {
    destructor() {
        // Remove all listeners to prevent memory leaks
        this.listeners = {};
    }
}
```

#### Lazy Load Large Data
```javascript
// Load basic data first
const events = await db.events
    .where('user_id')
    .equals(userId)
    .limit(50)
    .toArray();

// Load relationships on demand
const loadEventDetails = async (eventId) => {
    const tags = await getEventTags(eventId);
    const links = await getEventLinks(eventId);
    return { tags, links };
};
```

## Common Patterns

### Error Handling Pattern

#### Consistent Error Structure
```javascript
class BaseError extends Error {
    constructor(message, code, context) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.context = context;
        this.timestamp = new Date();
    }
}

class ValidationError extends BaseError {
    constructor(field, value, message) {
        super(message, 'VALIDATION_ERROR', { field, value });
    }
}

class DatabaseError extends BaseError {
    constructor(operation, table, message) {
        super(message, 'DATABASE_ERROR', { operation, table });
    }
}
```

#### Error Handling in Models
```javascript
async create(data) {
    try {
        // Validation
        if (!data.title) {
            throw new ValidationError('title', data.title, 'Title is required');
        }
        
        // Database operation
        const id = await this.db.events.add(data);
        return await this.getById(id);
        
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error; // Re-throw validation errors
        }
        
        // Wrap database errors
        throw new DatabaseError('create', 'events', error.message);
    }
}
```

#### Error Handling in ViewModels
```javascript
async createEvent(eventData) {
    try {
        this.setState({ isCreating: true });
        
        const event = await this.eventModel.create(eventData);
        
        await this.loadEvents();
        this.setState({ isCreating: false });
        this.notifyListeners('eventCreated', event);
        
        return event;
    } catch (error) {
        this.setState({ isCreating: false });
        
        // Let AppViewModel handle the error
        throw error;
    }
}
```

### Pagination Pattern

#### ViewModel Pagination State
```javascript
state = {
    currentPage: 1,
    pageSize: 50,
    totalCount: 0,
    hasNextPage: false,
    hasPreviousPage: false
}
```

#### Pagination Implementation
```javascript
async loadPage(page) {
    const offset = (page - 1) * this.state.pageSize;
    
    const [data, total] = await Promise.all([
        this.model.query({
            ...this.state.filters,
            limit: this.state.pageSize,
            offset: offset
        }),
        this.model.count(this.state.filters)
    ]);
    
    this.setState({
        data,
        currentPage: page,
        totalCount: total,
        hasNextPage: offset + this.state.pageSize < total,
        hasPreviousPage: page > 1
    });
}
```

### Search Pattern

#### Debounced Search
```javascript
class SearchMixin {
    constructor() {
        this.searchTimeout = null;
    }
    
    debouncedSearch(query, delay = 300) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, delay);
    }
    
    async performSearch(query) {
        this.setState({ searchQuery: query, isSearching: true });
        
        try {
            const results = await this.model.search(query);
            this.setState({ 
                searchResults: results,
                isSearching: false
            });
        } catch (error) {
            this.setState({ isSearching: false });
            throw error;
        }
    }
}
```

### Validation Pattern

#### Data Validation
```javascript
const validators = {
    required: (value, fieldName) => {
        if (!value) throw new ValidationError(fieldName, value, `${fieldName} is required`);
    },
    
    maxLength: (value, fieldName, max) => {
        if (value && value.length > max) {
            throw new ValidationError(fieldName, value, `${fieldName} must be ${max} characters or less`);
        }
    },
    
    email: (value, fieldName) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (value && !emailRegex.test(value)) {
            throw new ValidationError(fieldName, value, `${fieldName} must be a valid email`);
        }
    }
};

const validateEvent = (eventData) => {
    validators.required(eventData.title, 'title');
    validators.maxLength(eventData.title, 'title', 200);
    validators.required(eventData.content, 'content');
};
```

## Troubleshooting

### Common Issues

#### Database Connection Problems
```javascript
// Check if database is initialized
if (!appDb.getDb().isOpen()) {
    console.error('Database not initialized');
    await appDb.initialize();
}

// Check for schema version conflicts
console.log('Current DB version:', appDb.getDb().verno);
```

#### ViewModel State Issues
```javascript
// Debug state changes
viewModel.on('stateChange', (data) => {
    console.log('State changed:', data.changes);
    console.log('Full state:', data.currentState);
});

// Check for memory leaks
console.log('Active listeners:', Object.keys(viewModel.listeners).map(key => ({
    event: key,
    count: viewModel.listeners[key].length
})));
```

#### Performance Issues
```javascript
// Monitor query performance
const profileQuery = async (operation, ...args) => {
    const start = performance.now();
    const result = await operation(...args);
    const duration = performance.now() - start;
    console.log(`Query took ${duration}ms`);
    return result;
};

// Usage
const events = await profileQuery(
    eventModel.query.bind(eventModel),
    { status: 'todo' }
);
```

### Debugging Tools

#### Browser DevTools
1. **Application Tab**: Inspect IndexedDB data
2. **Console**: Execute ViewModel commands
3. **Network Tab**: Monitor future API calls
4. **Performance Tab**: Profile JavaScript execution

#### Custom Debug Functions
```javascript
// Global debug helpers
window.debugApp = {
    getState: () => ({
        app: getAppVM().getState(),
        event: getEventVM().getState(),
        tag: getTagVM().getState(),
        item: getItemVM().getState()
    }),
    
    clearData: () => appDb.clearAllData(),
    
    createTestData: (count = 10) => {
        for (let i = 0; i < count; i++) {
            getEventVM().createEvent({
                title: `Test Event ${i}`,
                content: `Test content ${i} #test`,
                tags: ['test', `batch${Math.floor(i/5)}`]
            });
        }
    },
    
    profileMemory: () => {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
            };
        }
        return 'Memory API not available';
    }
};
```

### Error Debugging

#### Enable Verbose Logging
```javascript
// In development, enable detailed logging
const DEBUG = true;

const log = (...args) => {
    if (DEBUG) {
        console.log('[DEBUG]', ...args);
    }
};

// Use throughout codebase
log('Creating event:', eventData);
```

#### Error Context
```javascript
// Capture error context
const captureError = (error, context) => {
    const errorReport = {
        message: error.message,
        stack: error.stack,
        context: context,
        timestamp: new Date(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        state: getAppVM().getDebugInfo()
    };
    
    console.error('Error Report:', errorReport);
    return errorReport;
};
```

## Contributing Guidelines

### Code Style

#### JavaScript Style
- Use ES6+ features
- Prefer `const` and `let` over `var`
- Use async/await over promises chains
- Use template literals for string interpolation
- Use destructuring for object properties

#### Naming Conventions
```javascript
// Classes: PascalCase
class EventViewModel { }

// Functions and variables: camelCase
const createEvent = async () => { };
let currentUser = null;

// Constants: UPPER_SNAKE_CASE
const MAX_TITLE_LENGTH = 200;

// Private methods: prefix with underscore
_internalMethod() { }
```

#### Documentation
```javascript
/**
 * Creates a new Event with tags and relationships
 * @param {Object} eventData - Event data object
 * @param {string} eventData.title - Event title (required)
 * @param {string} eventData.content - Event content (required)
 * @param {string[]} [eventData.tags] - Array of tag names
 * @returns {Promise<Object>} Created Event with relationships
 * @throws {ValidationError} When required fields are missing
 */
async create(eventData) {
    // Implementation
}
```

### Git Workflow

#### Commit Messages
```
feat: add inventory management to ItemViewModel
fix: resolve tag assignment duplicate issue
docs: update API documentation for EventModel
refactor: extract validation logic to utilities
test: add unit tests for TagModel
perf: optimize polymorphic queries with indexes
```

#### Branch Naming
```
feature/inventory-management
bugfix/tag-duplicate-assignment
docs/api-reference-update
refactor/validation-utilities
```

### Pull Request Process

1. **Create Feature Branch**
   ```bash
   git checkout -b feature/new-feature
   ```

2. **Implement Changes**
   - Follow code style guidelines
   - Add documentation
   - Include tests where applicable

3. **Test Changes**
   - Manual testing with browser
   - Console-based ViewModel testing
   - Performance validation

4. **Submit Pull Request**
   - Clear description of changes
   - Reference related issues
   - Include testing notes

### Documentation Updates

#### When to Update Documentation
- New API methods added
- Changed method signatures
- New patterns or best practices
- Architecture changes

#### Documentation Files to Maintain
- `ARCHITECTURE.md` - System design changes
- `API_REFERENCE.md` - API changes
- `DEVELOPMENT.md` - Process and pattern changes
- `README.md` - Setup and overview changes

This development guide provides the foundation for effective development on the productivity app. As the project evolves, these guidelines should be updated to reflect new patterns and best practices.
