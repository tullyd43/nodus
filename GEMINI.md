# Organizational Ecosystem Application - AI Development Context

## 🎯 Project Mission
Universal productivity system that simplifies complexity through a single principle: **"Everything is either an Event (verb) or an Item (noun)."** This application scales from personal productivity (1K records) to enterprise platform scale (1M+ records) while maintaining sub-second query performance.

## 💡 How to use this file and other GEMINI.md files
This file is the main context file for the AI agent. It provides a high-level overview of the project, its mission, architecture, and development patterns. For a more detailed guide on how to use the `GEMINI.md` files, please refer to [docs/development/GEMINI.md](docs/development/GEMINI.md).

## 🏗️ Core Architecture Philosophy

### The Event/Item Paradigm
```javascript
// Every entity in the system inherits from this base abstraction
class BaseEntity {
  static getType(data) {
    return data.involves_action ? 'event' : 'item';
  }
}

// Events: Actions that happen (verbs)
// - Tasks, meetings, workouts, phone calls, purchases
// - Have due_dates, completion_status, involve doing something

// Items: Things that exist (nouns)  
// - People, equipment, documents, budgets, locations
// - Have current_state, quantities, represent assets or resources
```

### Universal Systems Design
All major systems work identically across Events and Items:
- **Tags**: Polymorphic tagging works on any entity type
- **Collections**: Dynamic filtering with JSON query language
- **Custom Fields**: Flexible field definitions assigned to entity types
- **Templates**: Variable substitution and conditional logic
- **Relationships**: Links between any entities regardless of type

For more details on the universal systems, see [src/core/models/GEMINI.md](src/core/models/GEMINI.md).

## 📊 Performance Strategy

### Hybrid Column Architecture
```sql
-- Real columns for frequently queried fields (10x performance boost)
events: {
  priority: INTEGER,        // Real column: sub-second filtering
  budget: DECIMAL,          // Real column: fast range queries  
  location: VARCHAR,        // Real column: instant location lookup
  due_date: TIMESTAMP,      // Real column: optimized date ranges
  custom_fields: JSONB      // Only for truly custom, rarely-queried data
}
```

### Multi-Scale Database Strategy
- **Client-side (1K-10K)**: IndexedDB with Dexie.js for offline-first
- **Hybrid (10K-100K)**: Client + server sync with conflict resolution
- **Enterprise (100K-1M)**: PostgreSQL with JSONB optimization
- **Platform (1M+)**: Multi-tenant PostgreSQL with advanced indexing

For more details on the database strategy, see [src/core/database/GEMINI.md](src/core/database/GEMINI.md).

## 🛠️ Development Patterns

### MVVM Implementation
```javascript
// ViewModels handle ALL business logic
class EventViewModel extends BaseViewModel {
  constructor() {
    super();
    this.model = new EventModel();
    this.observableState = new ObservableState();
  }

  async createEvent(data) {
    // 1. Validate input
    // 2. Transform data
    // 3. Save via model
    // 4. Update observable state
    // 5. Trigger UI updates
  }
}
```
For more details on the MVVM pattern, see [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md).

### Universal Field System
```javascript
// Custom fields work identically for Events and Items
const workoutType = await EventType.create({
  name: "Workout",
  category: "health"
});

// Assign fields from the field library
await EntityField.assignFields(workoutType.id, [
  {field_name: "duration", display_name: "Duration (minutes)", is_required: true},
  {field_name: "workout_type", display_name: "Workout Type", is_required: true},
  {field_name: "calories", display_name: "Calories Burned"}
]);

// System auto-generates forms and validates input
```

### Collection Query Language
```json
{
  "entity_type": "event",
  "conditions": {
    "operator": "AND",
    "rules": [
      {"field": "priority", "operator": ">=", "value": 4},
      {"field": "due_date", "operator": "date_between", "value": ["2024-01-01", "2024-12-31"]},
      {"field": "tags", "operator": "contains_any", "value": ["work", "urgent"]}
    ]
  }
}
```

## 🎨 User Experience Patterns

### Quick Capture Natural Language
```bash
# Events (Actions) - Natural language parsing
"Call John tomorrow 2pm #work"               → Event with due_date, tags
"Buy groceries milk bread eggs $25"         → Event with description, budget  
"Workout @gym 45min #health priority:high"  → Event with location, duration, priority

# Items (Assets) - Natural language parsing
"iPhone 15 Pro $999 #tech #phone"           → Item with value, tags
"Conference Room A @building-2"             → Item with location
"Project budget $50000 #finance"            → Item with value, category
```

### Dynamic Collections (Auto-updating)
- **"Today"**: Events due today
- **"High Priority"**: Priority 4-5 events
- **"Work Inventory"**: Items tagged #work
- **"Overdue"**: Past due incomplete events
- **"This Week"**: Events due within 7 days

## 🔧 Technology Stack

### Current Implementation
- **Frontend**: Vanilla JavaScript with ES6 modules
- **Database**: IndexedDB via Dexie.js v3.2.4
- **State Management**: Custom Observable pattern
- **UI**: Component-based with template system
- **Build**: Modern ES6 imports, no bundler needed
- **Dev Server**: Live-server for development

### Future Scaling Technology
- **Backend**: Node.js with Express
- **Database**: PostgreSQL 15+ with JSONB optimization
- **API**: RESTful with JSON query language
- **Sync**: Operational transform for conflict resolution
- **Security**: JWT authentication, role-based permissions

## 📁 Project Structure Understanding

```
src/
├── core/
│   ├── database/
│   │   ├── db.js              # Main database configuration (Dexie)
│   │   ├── schema.js          # 18-table schema definition
│   │   └── migrations.js      # Database version migrations
│   │
│   ├── models/                # Data access layer
│   │   ├── base/
│   │   │   ├── BaseModel.js   # Abstract CRUD operations
│   │   │   └── BaseEntity.js  # Event/Item type detection
│   │   ├── Event.js           # Event-specific operations
│   │   ├── Item.js            # Item-specific operations
│   │   └── [EntityType].js    # Other entity models
│   │
│   ├── viewmodels/            # Business logic layer (MVVM)
│   │   ├── base/
│   │   │   ├── BaseViewModel.js    # Abstract base viewmodel
│   │   │   └── ObservableState.js  # Reactive state management
│   │   ├── MainViewModel.js        # Application state coordination
│   │   ├── EventViewModel.js       # Event management logic
│   │   ├── ItemViewModel.js        # Item management logic
│   │   └── CollectionViewModel.js  # Dynamic collection filtering
│   │
│   └── utils/                 # Utility functions
│       ├── dateUtils.js       # Date parsing ("tomorrow 2pm")
│       ├── stringUtils.js     # Natural language processing
│       ├── performanceUtils.js # Query optimization
│       └── templateEngine.js  # Variable substitution
│
└── public/
    ├── index.html             # Single-page application entry
    └── styles/                # CSS organization
```

## 🧪 Testing Strategy
For a detailed testing strategy, see [tests/GEMINI.md](tests/GEMINI.md).

### Model Testing
```javascript
describe('EventModel', () => {
  it('should detect event type correctly', () => {
    const eventData = { title: "Call John", involves_action: true };
    expect(BaseEntity.getType(eventData)).toBe('event');
  });
});
```

### Performance Testing
- Query performance must be < 1 second for 10K records
- IndexedDB operations must be < 100ms
- UI updates must be < 16ms (60fps)

### Integration Testing
- Event/Item creation and retrieval
- Collection filtering accuracy
- Template variable substitution
- File synchronization integrity

## 🚀 Common Development Tasks

### Adding New Entity Types
1. **Extend BaseEntity**: Create new class inheriting base functionality
2. **Define Fields**: Add to field library with appropriate validations
3. **Create ViewModel**: Handle business logic and state management
4. **Update UI Components**: Add forms and display components
5. **Add Collection Filters**: Create default collections for the new type

### Performance Optimization
1. **Analyze Query Patterns**: Identify frequently filtered fields
2. **Consider Real Columns**: Move from JSONB to real columns for speed
3. **Add Indexes**: Create composite indexes for common queries
4. **Batch Operations**: Minimize database round trips
5. **Cache Results**: Implement intelligent caching strategies

### Scaling Considerations
1. **IndexedDB Limits**: ~2GB per origin, suitable for 1K-50K records
2. **Server Migration**: Plan PostgreSQL migration path for 100K+ records
3. **Sync Strategy**: Implement operational transform for multi-user scenarios
4. **Performance Monitoring**: Track query times and memory usage

## 🔒 Security Guidelines
- **Input Validation**: All user input must be validated and sanitized
- **XSS Prevention**: Escape all dynamic content in templates
- **Data Privacy**: Implement data encryption for sensitive information
- **Access Control**: Role-based permissions for multi-user scenarios

## 🔄 File Synchronization (Future)
- **Markdown Export**: Auto-generate `.md` files from events/items
- **Two-way Sync**: Changes in files update database
- **Conflict Resolution**: Timestamp-based conflict handling
- **Backup Integration**: Automatic backup before sync operations

## 💡 AI Agent Guidelines
As an AI agent working on this project, you must follow these guidelines:

1.  **Adhere to the Core Architecture**: Always respect the Event/Item paradigm and the universal systems design.
2.  **Prioritize Performance**: Propose solutions that are performant and scalable, considering both IndexedDB and PostgreSQL.
3.  **Follow Established Patterns**: Use the existing MVVM, model, and utility patterns. Do not introduce new patterns without explicit permission.
4.  **Write Testable Code**: Ensure that all new code is testable and follows the testing strategy outlined in [tests/GEMINI.md](tests-GEMINI.md).
5.  **Maintain Code Quality**: Write clean, readable, and well-documented code.
6.  **Be Proactive**: Identify potential issues and suggest improvements that align with the project's goals.
7.  **Ask for Clarification**: If a request is ambiguous, ask for more details before proceeding.

## 🎯 Current Development Priorities

1. **Universal Field System Enhancement**: Complete custom field implementation
2. **Template Engine**: Dynamic content generation with variable substitution
3. **Performance Optimization**: Query optimization for large datasets
4. **File Synchronization**: Markdown export/import functionality
5. **Server Architecture Planning**: PostgreSQL migration strategy

## 🤝 Contributing Guidelines

- **Code Style**: ES6+ syntax, consistent naming conventions
- **Performance First**: Always consider query performance implications
- **Universal Design**: Features must work for both Events and Items
- **Test Coverage**: Include unit tests for new functionality
- **Documentation**: Update relevant GEMINI.md files when changing architecture

---

*This context file enables the AI agent to understand the project's unique architecture, performance requirements, and development patterns. Reference this when asking for guidance on implementation, optimization, or architectural decisions.*