# Productivity App Architecture Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architectural Principles](#architectural-principles)
3. [Project Structure](#project-structure)
4. [Database Architecture](#database-architecture)
5. [MVVM Pattern Implementation](#mvvm-pattern-implementation)
6. [Data Models](#data-models)
7. [ViewModels](#viewmodels)
8. [View Layer](#view-layer)
9. [Development Workflow](#development-workflow)
10. [Testing & Debugging](#testing--debugging)
11. [Performance Considerations](#performance-considerations)
12. [Future Extensibility](#future-extensibility)

## Overview

This productivity application is built as an offline-first, vanilla JavaScript web application following strict MVVM (Model-View-ViewModel) architectural patterns. The foundation implements a sophisticated data management system using IndexedDB with a comprehensive schema that supports complex relationships, universal tagging, and bi-directional linking.

### Key Features

- **Offline-First Architecture**: Complete functionality without internet connection
- **Universal Tagging System**: Cross-context organization using polymorphic relationships
- **Event/Item Dichotomy**: Clean separation between actions (Events) and assets (Items)
- **MVVM Pattern**: Strict separation of concerns with reactive state management
- **Schema-Driven Design**: Extensible through Event Types and Item Types
- **Audit Logging**: Complete change tracking for data integrity
- **Smart Capture**: Intelligent parsing of user input with hashtag and date extraction

## Architectural Principles

### 1. Robust Simplicity
Complex functionality is encapsulated within specialized structures while maintaining a simple user interface. Default operations require minimal user input, with complexity introduced only when explicitly needed.

### 2. Event/Item Dichotomy
The entire data model is built on a fundamental distinction:
- **Events (Verbs)**: Actions, commitments, and occurrences (tasks, notes, appointments)
- **Items (Nouns)**: Quantifiable, trackable assets (inventory, tools, consumables)

This separation prevents data ambiguity and ensures automation rules operate on the correct object types.

### 3. Flat, Searchable Network
The architecture rejects rigid hierarchical storage in favor of a flat, universal indexing system using tags and links. This creates a flexible knowledge graph where objects exist at the intersection of multiple contexts.

### 4. Schema-Driven Objects
All core objects are governed by schema templates (Event Types and Item Types) that define structure, required fields, and behavior. This allows unlimited extensibility without altering the core database schema.

### 5. Data Integrity First
Every state-changing operation is logged for audit purposes. The system uses transaction-safe operations and maintains referential integrity through proper foreign key relationships.

## Project Structure

```
productivity-app/
├── index.html                 # Main application entry point
├── package.json              # Dependencies and scripts
├── README.md                 # Setup and usage guide
├── css/
│   └── main.css             # Application styling
└── js/
    ├── app.js               # Application initialization and UI bindings
    ├── database/
    │   ├── schema.js        # Complete IndexedDB schema definition
    │   └── db.js           # Database connection and initialization
    ├── models/              # Data access layer
    │   ├── event.js        # Event model (CRUD + relationships)
    │   ├── item.js         # Item model (CRUD + inventory)
    │   └── tag.js          # Tag model (universal tagging)
    └── viewmodels/          # Business logic layer
        ├── app-vm.js       # Main coordinator ViewModel
        ├── event-vm.js     # Event-specific state management
        ├── item-vm.js      # Item-specific state management
        └── tag-vm.js       # Tag-specific state management
```

## Database Architecture

### Core Tables Structure

The database implements 15 interconnected tables organized into logical layers:

#### Foundational Layer
- **users**: User accounts and authentication data
- **events**: Universal container for all actions and commitments
- **items**: Container for quantifiable, trackable assets

#### Templating System
- **event_types**: Schema definitions for Event behavior
- **item_types**: Schema definitions for Item behavior
- **custom_fields**: User-defined field definitions
- **custom_field_values**: Polymorphic value storage using EAV pattern

#### Organization Layer
- **project_phases**: Sequential structure for Project Events
- **tags**: Universal vocabulary for cross-context organization
- **tag_assignments**: Polymorphic many-to-many tag relationships
- **links**: Universal bi-directional object linking

#### Advanced Features
- **routines**: Automated Event generation templates
- **goals**: High-level objective tracking with metrics
- **collections**: Saved dynamic filters for data views
- **lists**: Hybrid checklist containers supporting both text and Item references

#### Audit Framework
- **audit_logs**: Immutable compliance-grade change tracking
- **operational_logs**: High-volume diagnostic logging

### Indexing Strategy

The schema implements compound indexes for optimal query performance:

```javascript
// Example compound indexes
'[user_id+status]'           // Fast user-specific status filtering
'[user_id+event_type_id]'    // Event type queries
'[taggable_type+taggable_id]' // Polymorphic relationship lookups
'[tag_id+taggable_type]'     // Cross-context tag queries
```

### Polymorphic Relationships

Two critical polymorphic tables enable universal organization:

1. **tag_assignments**: Links any object type to any tag
2. **links**: Creates bi-directional relationships between any two objects

This design allows a single tag to organize Events, Items, and future object types uniformly.

## MVVM Pattern Implementation

### Architecture Overview

The application follows strict MVVM separation:

```
View (UI) ←→ ViewModel (State) ←→ Model (Data)
```

- **Models**: Pure data access with no business logic
- **ViewModels**: Reactive state management and business logic
- **Views**: UI bindings that respond to ViewModel changes

### Communication Flow

1. **User Interaction**: View captures user input
2. **Command Delegation**: View calls ViewModel methods
3. **Business Logic**: ViewModel processes the request
4. **Data Access**: ViewModel calls appropriate Model methods
5. **State Update**: ViewModel updates its observable state
6. **UI Notification**: View receives state change events
7. **DOM Update**: View updates the user interface

### Event-Driven Communication

ViewModels communicate through a publisher-subscriber pattern:

```javascript
// ViewModels emit events
eventViewModel.on('eventCreated', (event) => {
    // Other ViewModels can react
});

// AppViewModel coordinates cross-cutting concerns
appViewModel.on('notification', (notification) => {
    // UI displays the notification
});
```

## Data Models

### EventModel

Handles all Event-related data operations following the "Verb" concept.

#### Key Methods

```javascript
// CRUD Operations
async create(eventData)           // Create new Event with tags
async getById(eventId)           // Get Event with full relationships
async update(eventId, updateData) // Update Event properties
async delete(eventId)            // Delete Event and cleanup relationships
async query(filters)             // Search Events with complex filters

// Relationship Management
async assignTags(eventId, tagNames)     // Add tags to Event
async getEventTags(eventId)             // Get all tags for Event
async getEventLinks(eventId)            // Get bi-directional links
async getEventCustomFields(eventId)     // Get custom field values

// Tag Operations
async getOrCreateTag(tagName)    // Find existing or create new tag
async removeAllTags(eventId)     // Cleanup on Event deletion
async removeAllLinks(eventId)    // Cleanup on Event deletion
```

#### Smart Tag Creation

The EventModel automatically handles tag normalization:

```javascript
// Input: "#Shopping", "shopping", "#SHOPPING"
// Output: Consistent "shopping" tag
const cleanTagName = tagName.toLowerCase().trim().replace(/^#/, '');
```

#### Query Performance

Events support compound filtering for optimal performance:

```javascript
const filters = {
    status: 'todo',
    event_type_id: 2,
    due_date_from: new Date('2024-01-01'),
    due_date_to: new Date('2024-12-31'),
    project_id: 123
};
```

### ItemModel

Handles all Item-related data operations following the "Noun" concept.

#### Key Methods

```javascript
// CRUD Operations
async create(itemData)           // Create new Item with tags
async getById(itemId)           // Get Item with full relationships
async update(itemId, updateData) // Update Item properties (inventory)
async delete(itemId)            // Delete Item and cleanup relationships
async query(filters)            // Search Items with inventory filters

// Inventory Specific
async assignTags(itemId, tagNames)  // Add tags to Item
async getItemTags(itemId)          // Get all tags for Item
async getItemTagCount(itemId)      // Performance-optimized tag count
```

#### Inventory Filtering

Items support inventory-specific query patterns:

```javascript
const filters = {
    item_type_id: 1,
    low_stock: true,
    low_stock_threshold: 5
};
```

### TagModel

Manages the universal tagging system that enables cross-context organization.

#### Key Methods

```javascript
// Tag Management
async getAllTags()              // Get all user tags
async searchTags(query)         // Search tags by name
async deleteTag(tagId)          // Delete tag and all assignments
async renameTag(tagId, newName) // Rename tag with duplicate checking
async mergeTags(sourceId, targetId) // Merge two tags

// Cross-Context Queries
async getObjectsWithTag(tagId)  // Get all Events AND Items with tag
async getTagStats(tagId)        // Usage statistics for tag
async getPopularTags(limit)     // Most frequently used tags
```

#### Universal Object Retrieval

The TagModel's most powerful feature is cross-context object retrieval:

```javascript
const results = await tagModel.getObjectsWithTag(tagId);
// Returns: { events: [...], items: [...], total: number }
```

This enables viewing all related content regardless of object type.

## ViewModels

### AppViewModel (Coordinator)

The top-level ViewModel that orchestrates all other ViewModels and manages global application state.

#### Responsibilities

- **Initialization**: Coordinates database and child ViewModel setup
- **Global State**: Manages app-wide UI state (current view, theme, etc.)
- **Cross-Cutting Concerns**: Handles notifications, errors, and global search
- **Command Delegation**: Provides simplified interface to child ViewModels
- **Event Coordination**: Manages communication between child ViewModels

#### Key State Properties

```javascript
state = {
    // App-wide state
    isInitialized: false,
    isLoading: false,
    currentView: 'list',          // 'list', 'timeline', 'kanban', 'cards'
    
    // Navigation
    currentRoute: 'events',       // Current section
    breadcrumbs: [],             // Navigation history
    
    // Global UI state
    sidebarOpen: true,
    theme: 'light',
    
    // Global search
    globalSearchQuery: '',
    globalSearchResults: [],
    
    // Notifications/Messages
    notifications: [],
    
    // Error handling
    errors: []
}
```

#### Global Search Implementation

The AppViewModel provides unified search across all data types:

```javascript
async globalSearch(query) {
    const [eventResults, tagResults, itemResults] = await Promise.all([
        this.eventViewModel.search(query),
        this.tagViewModel.searchTags(query),
        this.itemViewModel.search(query)
    ]);

    return {
        events: eventResults,
        tags: tagResults,
        items: itemResults,
        total: eventResults.length + tagResults.length + itemResults.length
    };
}
```

#### Notification System

Built-in notification system with automatic cleanup:

```javascript
showNotification(message, type = 'info', duration = 3000) {
    const notification = {
        id: Date.now(),
        message,
        type,
        timestamp: new Date(),
        duration
    };

    // Auto-remove after duration
    if (duration > 0) {
        setTimeout(() => {
            this.removeNotification(notification.id);
        }, duration);
    }

    return notification.id;
}
```

### EventViewModel

Manages all Event-related state and business logic.

#### Core State

```javascript
state = {
    // Data
    events: [],                  // Current Event list
    selectedEvent: null,         // Currently selected Event
    eventTypes: [],             // Available Event Types
    
    // UI State  
    isLoading: false,
    isCreating: false,
    isUpdating: false,
    
    // Filters
    filters: {
        status: null,            // Filter by Event status
        event_type_id: null,     // Filter by Event Type
        due_date_from: null,     // Date range filtering
        due_date_to: null,
        project_id: null         // Filter by parent Project
    },
    
    // Search
    searchQuery: '',
    searchResults: [],
    
    // Quick capture
    captureText: '',
    isCaptureProcessing: false,
    
    // Pagination
    currentPage: 1,
    pageSize: 50,
    totalCount: 0
}
```

#### Smart Capture Parsing

The EventViewModel includes intelligent text parsing for quick Event creation:

```javascript
parseCaptureText(text) {
    const eventData = {
        title: text.trim(),
        content: text.trim(),
        tags: []
    };

    // Extract hashtags
    const hashtagMatches = text.match(/#\w+/g);
    if (hashtagMatches) {
        eventData.tags = hashtagMatches.map(tag => tag.substring(1));
        eventData.title = text.replace(/#\w+/g, '').trim();
    }

    // Extract due dates
    const dueDatePatterns = [
        /due\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /by\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    ];

    for (const pattern of dueDatePatterns) {
        const match = text.match(pattern);
        if (match) {
            eventData.due_date = new Date(match[1]);
            eventData.title = text.replace(match[0], '').trim();
            break;
        }
    }

    return eventData;
}
```

#### Reactive Data Operations

All data operations automatically update the UI through reactive state changes:

```javascript
async createEvent(eventData) {
    this.setState({ isCreating: true });
    
    const newEvent = await this.eventModel.create(eventData);
    
    // Reload events to reflect the change
    await this.loadEvents();
    
    this.setState({ isCreating: false });
    this.notifyListeners('eventCreated', newEvent);
    
    return newEvent;
}
```

### ItemViewModel

Manages Item-related state with specialized inventory management features.

#### Inventory-Specific State

```javascript
state = {
    // Standard data
    items: [],
    selectedItem: null,
    itemTypes: [],
    
    // Inventory management
    lowStockItems: [],           // Items below threshold
    stockAlerts: [],            // Active stock warnings
    
    // Consumption tracking
    consumptionHistory: [],      // Usage history
    
    // Filters specific to items
    filters: {
        item_type_id: null,
        low_stock: false,
        low_stock_threshold: 5   // Configurable threshold
    }
}
```

#### Stock Management Operations

The ItemViewModel provides sophisticated inventory operations:

```javascript
async updateStock(itemId, newQuantity, reason = 'manual_update') {
    const item = await this.getItemById(itemId);
    const oldQuantity = item.stock_quantity;
    
    await this.updateItem(itemId, { 
        stock_quantity: newQuantity,
        last_stock_update: new Date(),
        last_stock_reason: reason
    });

    await this.logStockChange(itemId, oldQuantity, newQuantity, reason);
}

async consumeItem(itemId, quantity, reason = 'consumption') {
    const item = await this.getItemById(itemId);
    
    if (item.stock_quantity < quantity) {
        throw new Error('Insufficient stock');
    }

    const newQuantity = item.stock_quantity - quantity;
    return await this.updateStock(itemId, newQuantity, reason);
}
```

#### Automatic Stock Monitoring

The ItemViewModel automatically monitors stock levels and generates alerts:

```javascript
async checkStockLevels() {
    const lowStockItems = this.state.items.filter(item => 
        item.stock_quantity <= this.state.filters.low_stock_threshold
    );

    // Check for new low stock alerts
    const newAlerts = lowStockItems.filter(item => 
        !this.state.lowStockItems.find(existing => existing.item_id === item.item_id)
    );

    // Notify about new alerts
    newAlerts.forEach(item => {
        this.notifyListeners('stockAlert', {
            type: 'low_stock',
            item,
            message: `${item.name} is running low (${item.stock_quantity} remaining)`
        });
    });
}
```

#### Inventory Analytics

Built-in analytics for inventory insights:

```javascript
getInventoryStats() {
    const items = this.state.items;
    
    return {
        totalItems: items.length,
        totalStockValue: items.reduce((sum, item) => sum + (item.stock_quantity || 0), 0),
        lowStockCount: this.state.lowStockItems.length,
        outOfStockCount: items.filter(item => item.stock_quantity === 0).length,
        averageStockLevel: items.length > 0 ? 
            items.reduce((sum, item) => sum + (item.stock_quantity || 0), 0) / items.length : 0,
        itemsByType: this.groupItemsByType()
    };
}
```

### TagViewModel

Manages the universal tagging system with cross-context capabilities.

#### Tag-Specific State

```javascript
state = {
    // Data
    tags: [],                   // All user tags
    popularTags: [],           // Most frequently used tags
    selectedTag: null,         // Currently selected tag
    taggedObjects: null,       // Objects with the selected tag
    
    // Search & Filter
    searchQuery: '',
    searchResults: [],
    
    // Tag suggestions for autocomplete
    suggestions: [],
    
    // Statistics
    tagStats: {}               // Usage statistics by tag ID
}
```

#### Cross-Context Tag Analysis

The TagViewModel's signature feature is analyzing tag usage across all object types:

```javascript
async selectTag(tagId) {
    const tag = this.state.tags.find(t => t.tag_id === tagId);
    
    // Load objects with this tag
    const taggedObjects = await this.tagModel.getObjectsWithTag(tagId);
    const tagStats = await this.tagModel.getTagStats(tagId);

    this.setState({ 
        selectedTag: tag,
        taggedObjects,
        tagStats: { ...this.state.tagStats, [tagId]: tagStats }
    });

    return { tag, taggedObjects, tagStats };
}
```

#### Tag Maintenance Operations

Advanced tag management with integrity protection:

```javascript
async mergeTags(sourceTagId, targetTagId) {
    await this.tagModel.mergeTags(sourceTagId, targetTagId);
    await this.loadTags(); // Refresh to reflect the merge
}

async cleanupUnusedTags() {
    const insights = await this.getTagInsights();
    const unusedTagIds = insights.unusedTags.map(tag => tag.tag_id);
    
    if (unusedTagIds.length > 0) {
        await this.bulkDeleteTags(unusedTagIds);
    }
    
    return unusedTagIds.length;
}
```

## View Layer

### Application Entry Point (app.js)

The View layer is implemented in `app.js` as a single Application class that manages UI bindings and responds to ViewModel state changes.

#### Initialization Flow

```javascript
async initialize() {
    // Create the main AppViewModel (which handles database init and child ViewModels)
    this.appViewModel = new AppViewModel();
    
    // Initialize the app (database + all ViewModels)
    await this.appViewModel.initialize();

    // Set up UI bindings
    this.setupUIBindings();
    
    // Set up ViewModel listeners
    this.setupViewModelListeners();
}
```

#### UI Binding Pattern

The View layer follows a consistent pattern for UI interactions:

1. **Capture User Input**: Event listeners on DOM elements
2. **Validate Input**: Basic client-side validation
3. **Delegate to ViewModel**: Call appropriate ViewModel method
4. **Handle Response**: Show success/error feedback

```javascript
async handleQuickCapture() {
    try {
        const text = this.ui.captureInput.value.trim();
        if (!text) return;

        await this.appViewModel.quickCapture(text);
        // Success is handled by the notification system
        
    } catch (error) {
        console.error('Quick capture failed:', error);
        // Error is handled by the AppViewModel error system
    }
}
```

#### Reactive UI Updates

The View layer responds to ViewModel changes through event listeners:

```javascript
setupViewModelListeners() {
    // Listen for app-wide state changes
    this.appViewModel.on('stateChange', (data) => {
        this.handleAppStateChange(data);
    });

    // Listen for EventViewModel changes
    const eventVM = this.appViewModel.getEventViewModel();
    
    eventVM.on('stateChange', (data) => {
        this.handleEventStateChange(data);
    });

    eventVM.on('eventsChange', (events) => {
        this.updateStatus(`Ready! ${events.length} events in database`);
    });
}
```

#### Notification System Integration

The View layer integrates with the AppViewModel's notification system:

```javascript
showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        border-radius: 4px;
        color: white;
        font-weight: bold;
        z-index: 1000;
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
    `;

    document.body.appendChild(messageDiv);

    setTimeout(() => {
        if (document.body.contains(messageDiv)) {
            document.body.removeChild(messageDiv);
        }
    }, 3000);
}
```

## Development Workflow

### Phase 1: Local Development (Current)

The application is designed for "client-first" development:

1. **Complete Offline Functionality**: All features work without server connection
2. **IndexedDB as Primary Database**: Full data persistence in browser
3. **MVVM Architecture**: Clean separation enables easy testing and development
4. **Test Interface**: Built-in UI for testing all functionality

### Phase 2: Cloud Integration (Future)

When ready, the cloud sync can be "bolted on":

1. **Server Database**: PostgreSQL with identical schema
2. **Cloud Vault**: Markdown file storage for data portability
3. **Sync Engine**: Background synchronization between local and cloud
4. **Conflict Resolution**: Handling concurrent modifications

### Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Start with live reload
npm run dev
```

### File Organization Guidelines

1. **Models**: Pure data access, no business logic
2. **ViewModels**: Business logic and state management
3. **Views**: UI bindings and DOM manipulation only
4. **Database**: Schema and connection management
5. **Tests**: Co-located with source files

## Testing & Debugging

### Built-in Debug Functions

The application provides comprehensive debugging capabilities:

```javascript
// Access ViewModels in browser console
const appVM = getAppVM();      // Main coordinator
const eventVM = getEventVM();  // Events
const tagVM = getTagVM();      // Tags  
const itemVM = getItemVM();    // Items

// Quick operations
appVM.createTestData();        // Creates test events and items
eventVM.createTestEvent();     // Just events
itemVM.createTestItem();       // Just items

// Check state
eventVM.getState();            // See all event data
itemVM.getInventoryStats();    // Get analytics
tagVM.getTagInsights();        // Tag usage analysis

// Debug comprehensive state
appVM.getDebugInfo();          // Full application state dump
```

### Test Data Generation

Each ViewModel includes test data generators:

```javascript
// EventViewModel test data
const testEvents = [
    {
        title: 'Test Task',
        content: 'This is a test task #testing #important',
        tags: ['testing', 'important'],
        status: 'todo'
    },
    // ... more test events
];

// ItemViewModel test data
const testItems = [
    {
        name: 'Printer Paper',
        description: 'A4 white printer paper',
        stock_quantity: 50,
        tags: ['office', 'supplies']
    },
    // ... more test items
];
```

### Error Handling Strategy

The application implements comprehensive error handling:

1. **Model Level**: Database operation errors
2. **ViewModel Level**: Business logic validation errors
3. **App Level**: Global error handling and user notification
4. **View Level**: UI interaction errors

```javascript
// Example error handling in ViewModel
async createEvent(eventData) {
    try {
        this.setState({ isCreating: true });
        
        const newEvent = await this.eventModel.create(eventData);
        
        await this.loadEvents();
        this.setState({ isCreating: false });
        this.notifyListeners('eventCreated', newEvent);
        
        return newEvent;
    } catch (error) {
        console.error('Failed to create event:', error);
        this.setState({ isCreating: false });
        throw error; // Re-throw for higher-level handling
    }
}
```

### Performance Monitoring

Key performance metrics to monitor:

1. **Database Query Performance**: IndexedDB operation timing
2. **Memory Usage**: ViewModel state size and cleanup
3. **UI Responsiveness**: Event listener performance
4. **Search Performance**: Complex query execution time

## Performance Considerations

### Database Optimization

1. **Compound Indexes**: Optimized for common query patterns
2. **Lazy Loading**: Related data loaded only when needed
3. **Pagination**: Large result sets handled in chunks
4. **Connection Pooling**: Efficient Dexie connection management

### Memory Management

1. **State Cleanup**: Proper listener removal on component destruction
2. **Reference Management**: Avoiding memory leaks in ViewModels
3. **Efficient Updates**: Minimal state changes and re-renders

### Query Optimization

1. **Indexed Queries**: All filters use indexed columns
2. **Batch Operations**: Multiple changes in single transactions
3. **Result Caching**: Expensive queries cached in ViewModel state

### UI Performance

1. **Event Delegation**: Minimal event listener creation
2. **Debounced Operations**: Search and input handling
3. **Virtual Scrolling**: For large lists (future enhancement)

## Future Extensibility

### Adding New Object Types

The architecture supports new object types through the schema-driven design:

1. **Create New Model**: Following existing patterns
2. **Create New ViewModel**: Managing state and operations
3. **Update AppViewModel**: Integrate new ViewModel
4. **Add Database Tables**: Extend schema as needed
5. **Update Universal Systems**: Tags, links, custom fields automatically work

### Adding New ViewModels

New ViewModels can be added following the established pattern:

```javascript
class NewFeatureViewModel {
    constructor() {
        this.model = new NewFeatureModel();
        this.state = { /* initial state */ };
        this.listeners = { /* event listeners */ };
    }

    // Follow established patterns:
    // - setState() for state management
    // - on()/off() for event handling
    // - initialize() for setup
    // - Async operations with error handling
}
```

### Plugin Architecture (Future)

The foundation supports future plugin development:

1. **Model Extensions**: Additional data access methods
2. **ViewModel Extensions**: Custom business logic
3. **Custom Event Types**: New object schemas
4. **UI Components**: Custom views and interactions

### API Integration (Future)

The architecture supports external API integration:

1. **Model Layer**: API clients alongside database models
2. **Sync Layer**: Conflict resolution and data merging
3. **Offline Support**: Graceful degradation when APIs unavailable

This documentation provides a comprehensive understanding of the productivity app foundation, enabling effective development, maintenance, and future enhancement of the system.
