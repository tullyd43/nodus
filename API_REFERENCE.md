# API Reference Documentation

## Table of Contents

1. [Data Models API](#data-models-api)
2. [ViewModels API](#viewmodels-api)
3. [Database Schema Reference](#database-schema-reference)
4. [Utility Functions](#utility-functions)
5. [Error Handling](#error-handling)
6. [Event System](#event-system)

## Data Models API

### EventModel

The EventModel handles all database operations for Events (actions, commitments, and occurrences).

#### Constructor

```javascript
const eventModel = new EventModel();
```

#### Methods

##### `async create(eventData)`

Creates a new Event with associated tags and relationships.

**Parameters:**
- `eventData` (Object): Event data object
  - `title` (string, required): Event title
  - `content` (string, required): Event content/description
  - `event_type_id` (number, optional): Event Type ID (defaults to Note type)
  - `status` (string, optional): Event status ('todo', 'in_progress', 'done') - defaults to 'todo'
  - `due_date` (Date, optional): Due date for the Event
  - `project_id` (number, optional): Parent Project Event ID
  - `phase_id` (number, optional): Project phase ID
  - `assigned_to_id` (number, optional): Assigned user ID
  - `tags` (string[], optional): Array of tag names to assign

**Returns:** `Promise<Object>` - Created Event with full relationships

**Example:**
```javascript
const event = await eventModel.create({
    title: 'Buy groceries',
    content: 'Milk, eggs, bread #shopping #errands',
    tags: ['shopping', 'errands'],
    due_date: new Date('2024-12-31'),
    status: 'todo'
});
```

##### `async getById(eventId)`

Retrieves an Event by ID with all related data populated.

**Parameters:**
- `eventId` (number): Event ID

**Returns:** `Promise<Object|null>` - Event with relationships or null if not found

**Populated Fields:**
- `event_type`: Complete Event Type object
- `tags`: Array of tag objects
- `links`: Object with `outgoing` and `incoming` link arrays
- `custom_fields`: Array of custom field values

**Example:**
```javascript
const event = await eventModel.getById(123);
console.log(event.tags); // [{ tag_id: 1, tag_name: 'shopping' }, ...]
```

##### `async update(eventId, updateData)`

Updates an existing Event with new data.

**Parameters:**
- `eventId` (number): Event ID to update
- `updateData` (Object): Fields to update (same as create, excluding required fields)

**Returns:** `Promise<Object>` - Updated Event with relationships

**Example:**
```javascript
const updatedEvent = await eventModel.update(123, {
    status: 'done',
    content: 'Updated content'
});
```

##### `async delete(eventId)`

Deletes an Event and all associated relationships.

**Parameters:**
- `eventId` (number): Event ID to delete

**Returns:** `Promise<boolean>` - Success status

**Cleanup Operations:**
- Removes all tag assignments
- Removes all bi-directional links
- Deletes custom field values
- Logs audit trail

**Example:**
```javascript
const success = await eventModel.delete(123);
```

##### `async query(filters)`

Queries Events with complex filtering options.

**Parameters:**
- `filters` (Object): Query filters
  - `status` (string, optional): Filter by status
  - `event_type_id` (number, optional): Filter by Event Type
  - `due_date_from` (Date, optional): Due date range start
  - `due_date_to` (Date, optional): Due date range end
  - `project_id` (number, optional): Filter by parent Project
  - `sort_by` (string, optional): Sort field (default: 'created_at')
  - `sort_order` (string, optional): Sort direction ('asc'|'desc', default: 'desc')

**Returns:** `Promise<Object[]>` - Array of Events with basic relationships

**Example:**
```javascript
const todoEvents = await eventModel.query({
    status: 'todo',
    due_date_to: new Date(),
    sort_by: 'due_date',
    sort_order: 'asc'
});
```

##### `async assignTags(eventId, tagNames)`

Assigns multiple tags to an Event.

**Parameters:**
- `eventId` (number): Event ID
- `tagNames` (string[]): Array of tag names (without # prefix)

**Returns:** `Promise<void>`

**Behavior:**
- Creates tags if they don't exist
- Avoids duplicate assignments
- Normalizes tag names (lowercase, no # prefix)

**Example:**
```javascript
await eventModel.assignTags(123, ['urgent', 'work', 'meeting']);
```

##### `async getEventTags(eventId)`

Retrieves all tags assigned to an Event.

**Parameters:**
- `eventId` (number): Event ID

**Returns:** `Promise<Object[]>` - Array of tag objects

**Example:**
```javascript
const tags = await eventModel.getEventTags(123);
// [{ tag_id: 1, tag_name: 'urgent', user_id: 1, created_at: '...' }, ...]
```

##### `async getEventLinks(eventId)`

Retrieves all bi-directional links for an Event.

**Parameters:**
- `eventId` (number): Event ID

**Returns:** `Promise<Object>` - Object with outgoing and incoming links

```javascript
{
    outgoing: [{ link_id: 1, target_id: 456, target_type: 'item' }, ...],
    incoming: [{ link_id: 2, source_id: 789, source_type: 'event' }, ...]
}
```

### ItemModel

The ItemModel handles all database operations for Items (quantifiable, trackable assets).

#### Constructor

```javascript
const itemModel = new ItemModel();
```

#### Methods

##### `async create(itemData)`

Creates a new Item with associated tags.

**Parameters:**
- `itemData` (Object): Item data object
  - `name` (string, required): Item name
  - `description` (string, optional): Item description
  - `item_type_id` (number, optional): Item Type ID (defaults to Consumable type)
  - `stock_quantity` (number, optional): Initial stock quantity (default: 0)
  - `metadata` (Object, optional): Additional metadata as JSON
  - `tags` (string[], optional): Array of tag names to assign

**Returns:** `Promise<Object>` - Created Item with relationships

**Example:**
```javascript
const item = await itemModel.create({
    name: 'Printer Paper',
    description: 'A4 white printer paper',
    stock_quantity: 50,
    tags: ['office', 'supplies']
});
```

##### `async getById(itemId)`

Retrieves an Item by ID with all related data.

**Parameters:**
- `itemId` (number): Item ID

**Returns:** `Promise<Object|null>` - Item with relationships or null

**Example:**
```javascript
const item = await itemModel.getById(123);
console.log(item.item_type.name); // 'Consumable'
```

##### `async update(itemId, updateData)`

Updates an existing Item.

**Parameters:**
- `itemId` (number): Item ID to update
- `updateData` (Object): Fields to update

**Returns:** `Promise<Object>` - Updated Item with relationships

##### `async delete(itemId)`

Deletes an Item and cleanup relationships.

**Parameters:**
- `itemId` (number): Item ID to delete

**Returns:** `Promise<boolean>` - Success status

##### `async query(filters)`

Queries Items with filtering options.

**Parameters:**
- `filters` (Object): Query filters
  - `item_type_id` (number, optional): Filter by Item Type
  - `low_stock` (boolean, optional): Filter items with low stock
  - `low_stock_threshold` (number, optional): Low stock threshold (default: 5)

**Returns:** `Promise<Object[]>` - Array of Items with relationships

**Example:**
```javascript
const lowStockItems = await itemModel.query({
    low_stock: true,
    low_stock_threshold: 10
});
```

### TagModel

The TagModel manages the universal tagging system across all object types.

#### Constructor

```javascript
const tagModel = new TagModel();
```

#### Methods

##### `async getAllTags()`

Retrieves all tags for the current user.

**Returns:** `Promise<Object[]>` - Array of tag objects sorted by name

**Example:**
```javascript
const tags = await tagModel.getAllTags();
// [{ tag_id: 1, tag_name: 'important', user_id: 1, created_at: '...' }, ...]
```

##### `async searchTags(query)`

Searches tags by name using partial matching.

**Parameters:**
- `query` (string): Search query (case-insensitive)

**Returns:** `Promise<Object[]>` - Matching tags sorted by name

**Example:**
```javascript
const tags = await tagModel.searchTags('shop');
// Returns tags like 'shopping', 'workshop', etc.
```

##### `async getObjectsWithTag(tagId)`

Retrieves all objects (Events and Items) that have a specific tag assigned.

**Parameters:**
- `tagId` (number): Tag ID

**Returns:** `Promise<Object>` - Object with categorized results

```javascript
{
    events: [/* Event objects with basic type info */],
    items: [/* Item objects with basic type info */],
    total: number
}
```

**Example:**
```javascript
const results = await tagModel.getObjectsWithTag(5);
console.log(`Found ${results.total} objects: ${results.events.length} events, ${results.items.length} items`);
```

##### `async getTagStats(tagId)`

Gets usage statistics for a specific tag.

**Parameters:**
- `tagId` (number): Tag ID

**Returns:** `Promise<Object>` - Usage statistics

```javascript
{
    total_usage: number,      // Total assignments
    events_tagged: number,    // Events with this tag
    items_tagged: number      // Items with this tag
}
```

##### `async getPopularTags(limit = 10)`

Gets the most frequently used tags.

**Parameters:**
- `limit` (number, optional): Maximum number of tags to return (default: 10)

**Returns:** `Promise<Object[]>` - Tags with usage counts, sorted by popularity

**Example:**
```javascript
const popular = await tagModel.getPopularTags(5);
// [{ tag_id: 1, tag_name: 'work', usage_count: 25 }, ...]
```

##### `async deleteTag(tagId)`

Deletes a tag and all its assignments across all object types.

**Parameters:**
- `tagId` (number): Tag ID to delete

**Returns:** `Promise<boolean>` - Success status

**Warning:** This is a destructive operation that removes the tag from all Events and Items.

##### `async renameTag(tagId, newName)`

Renames a tag with duplicate checking.

**Parameters:**
- `tagId` (number): Tag ID to rename
- `newName` (string): New tag name

**Returns:** `Promise<Object>` - Updated tag object

**Throws:** Error if new name already exists for the user

##### `async mergeTags(sourceTagId, targetTagId)`

Merges two tags by moving all assignments from source to target, then deleting source.

**Parameters:**
- `sourceTagId` (number): Tag to merge from (will be deleted)
- `targetTagId` (number): Tag to merge into (will receive all assignments)

**Returns:** `Promise<boolean>` - Success status

**Behavior:**
- Moves all tag assignments from source to target
- Avoids duplicate assignments
- Deletes the source tag
- Preserves all object relationships

## ViewModels API

### AppViewModel

The top-level coordinator ViewModel that manages global state and orchestrates child ViewModels.

#### Constructor

```javascript
const appViewModel = new AppViewModel();
```

#### Properties

##### `state`

Global application state object:

```javascript
{
    isInitialized: boolean,
    isLoading: boolean,
    currentView: string,          // 'list'|'timeline'|'kanban'|'cards'
    currentRoute: string,         // 'events'|'items'|'tags'|'collections'|'settings'
    sidebarOpen: boolean,
    theme: string,                // 'light'|'dark'
    globalSearchQuery: string,
    globalSearchResults: Object,
    notifications: Array,
    errors: Array
}
```

#### Methods

##### `async initialize()`

Initializes the database and all child ViewModels.

**Returns:** `Promise<void>`

**Operations:**
- Initializes IndexedDB connection
- Creates and initializes EventViewModel, TagViewModel, ItemViewModel
- Sets up cross-ViewModel communication
- Updates state to ready

**Example:**
```javascript
await appViewModel.initialize();
console.log(appViewModel.getState().isInitialized); // true
```

##### `setState(newState)`

Updates the global application state and notifies listeners.

**Parameters:**
- `newState` (Object): Partial state object to merge

**Event Emissions:**
- `stateChange`: Always emitted with change details
- `viewChange`: When `currentView` changes
- `routeChange`: When `currentRoute` changes

##### `on(event, callback)` / `off(event, callback)`

Event listener management for global app events.

**Events:**
- `stateChange`: Global state changes
- `viewChange`: View mode changes
- `routeChange`: Navigation changes
- `error`: Global error events
- `notification`: Notification events

**Example:**
```javascript
appViewModel.on('notification', (notification) => {
    console.log(`${notification.type}: ${notification.message}`);
});
```

##### `setCurrentView(viewName)`

Changes the current view mode.

**Parameters:**
- `viewName` (string): View name ('list'|'timeline'|'kanban'|'cards')

**Example:**
```javascript
appViewModel.setCurrentView('kanban');
```

##### `async globalSearch(query)`

Performs search across all ViewModels (Events, Items, Tags).

**Parameters:**
- `query` (string): Search query

**Returns:** `Promise<Object>` - Unified search results

```javascript
{
    events: Array,     // Matching events
    items: Array,      // Matching items
    tags: Array,       // Matching tags
    total: number      // Total result count
}
```

##### `showNotification(message, type, duration)`

Displays a notification to the user.

**Parameters:**
- `message` (string): Notification message
- `type` (string, optional): Notification type ('info'|'success'|'error'|'warning') - default: 'info'
- `duration` (number, optional): Auto-hide duration in ms (default: 3000, 0 = no auto-hide)

**Returns:** `number` - Notification ID for manual removal

**Example:**
```javascript
const id = appViewModel.showNotification('Operation completed successfully', 'success');
```

##### `handleError(error)`

Handles application errors with logging and user notification.

**Parameters:**
- `error` (Error): Error object

**Returns:** `number` - Error ID

**Behavior:**
- Logs error to console
- Adds to error state
- Shows error notification
- Emits 'error' event

##### `async quickCapture(text)`

Delegates quick capture to EventViewModel.

**Parameters:**
- `text` (string): Text to capture and parse

**Returns:** `Promise<Object>` - Created Event

##### `async refreshAllData()`

Refreshes data in all child ViewModels.

**Returns:** `Promise<void>`

##### `async clearAllData()`

Clears all application data with user confirmation.

**Returns:** `Promise<boolean>` - Whether data was cleared

#### Child ViewModel Access

##### `getEventViewModel()` / `getTagViewModel()` / `getItemViewModel()`

Returns child ViewModel instances for direct access.

**Returns:** Respective ViewModel instance

##### Convenience Getters

- `getEvents()`: Returns current Events array
- `getTags()`: Returns current Tags array  
- `getItems()`: Returns current Items array
- `getSelectedEvent()`: Returns currently selected Event
- `getSelectedTag()`: Returns currently selected Tag

### EventViewModel

Manages Event-related state and operations.

#### Constructor

```javascript
const eventViewModel = new EventViewModel();
```

#### Key Methods

##### `async loadEvents()`

Loads Events based on current filters.

**Returns:** `Promise<Object[]>` - Array of Events with relationships

##### `async createEvent(eventData)`

Creates a new Event.

**Parameters:**
- `eventData` (Object): Event data (see EventModel.create)

**Returns:** `Promise<Object>` - Created Event

**Side Effects:**
- Updates events state
- Emits 'eventCreated' event
- Refreshes event list

##### `async updateEvent(eventId, updateData)`

Updates an existing Event.

**Parameters:**
- `eventId` (number): Event ID
- `updateData` (Object): Fields to update

**Returns:** `Promise<Object>` - Updated Event

##### `async deleteEvent(eventId)`

Deletes an Event.

**Parameters:**
- `eventId` (number): Event ID

**Returns:** `Promise<boolean>` - Success status

##### `async applyFilters(newFilters)`

Applies new filters and reloads Events.

**Parameters:**
- `newFilters` (Object): Filter object (see EventModel.query)

**Returns:** `Promise<void>`

##### `async search(query)`

Searches Events by title and content.

**Parameters:**
- `query` (string): Search query

**Returns:** `Promise<Object[]>` - Matching Events

##### `selectEvent(eventId)` / `clearSelection()`

Manages Event selection state.

##### `async quickCapture(text)`

Creates Event from parsed text with smart recognition.

**Parameters:**
- `text` (string): Text to parse (hashtags, dates, etc.)

**Returns:** `Promise<Object>` - Created Event

**Smart Parsing:**
- Extracts `#hashtags` as tags
- Recognizes date patterns: "due 12/31/2024", "by 1/1/2025", "on 2/15/2024"
- Cleans title by removing parsed elements

##### Pagination Methods

- `async goToPage(page)`: Navigate to specific page
- `async nextPage()` / `async previousPage()`: Navigate pages

#### Events Emitted

- `stateChange`: When ViewModel state changes
- `eventsChange`: When events array changes
- `eventCreated`: When Event is created
- `eventUpdated`: When Event is updated
- `eventDeleted`: When Event is deleted
- `filtersChange`: When filters change

### ItemViewModel

Manages Item-related state with inventory capabilities.

#### Constructor

```javascript
const itemViewModel = new ItemViewModel();
```

#### Inventory Methods

##### `async updateStock(itemId, newQuantity, reason)`

Updates Item stock quantity with audit trail.

**Parameters:**
- `itemId` (number): Item ID
- `newQuantity` (number): New stock quantity
- `reason` (string, optional): Reason for change (default: 'manual_update')

**Returns:** `Promise<boolean>` - Success status

##### `async consumeItem(itemId, quantity, reason)`

Reduces Item stock by specified quantity.

**Parameters:**
- `itemId` (number): Item ID
- `quantity` (number): Quantity to consume
- `reason` (string, optional): Consumption reason (default: 'consumption')

**Returns:** `Promise<boolean>` - Success status

**Throws:** Error if insufficient stock

##### `async restockItem(itemId, quantity, reason)`

Increases Item stock by specified quantity.

**Parameters:**
- `itemId` (number): Item ID
- `quantity` (number): Quantity to add
- `reason` (string, optional): Restock reason (default: 'restock')

**Returns:** `Promise<boolean>` - Success status

##### `getInventoryStats()`

Returns current inventory statistics.

**Returns:** `Object` - Inventory statistics

```javascript
{
    totalItems: number,
    totalStockValue: number,
    lowStockCount: number,
    outOfStockCount: number,
    averageStockLevel: number,
    itemsByType: Object
}
```

#### Events Emitted

- `stateChange`: When ViewModel state changes
- `itemsChange`: When items array changes
- `itemCreated`: When Item is created
- `itemUpdated`: When Item is updated
- `itemDeleted`: When Item is deleted
- `stockAlert`: When low stock detected

### TagViewModel

Manages universal tagging system.

#### Constructor

```javascript
const tagViewModel = new TagViewModel();
```

#### Key Methods

##### `async selectTag(tagId)`

Selects a tag and loads all associated objects.

**Parameters:**
- `tagId` (number): Tag ID

**Returns:** `Promise<Object>` - Tag selection result

```javascript
{
    tag: Object,           // Tag object
    taggedObjects: Object, // All objects with this tag
    tagStats: Object       // Usage statistics
}
```

##### `async generateSuggestions(input)`

Generates tag suggestions for autocomplete.

**Parameters:**
- `input` (string, optional): Current input text

**Returns:** `Promise<Object[]>` - Suggested tags

**Behavior:**
- If input provided: Returns matching tags
- If no input: Returns popular tags

##### `async getTagInsights()`

Provides comprehensive tag analytics.

**Returns:** `Promise<Object>` - Tag insights

```javascript
{
    totalTags: number,
    mostUsedTags: Array,
    recentTags: Array,     // Created in last 7 days
    unusedTags: Array,     // Never assigned
    tagGrowth: Object
}
```

##### `async cleanupUnusedTags()`

Removes all unused tags.

**Returns:** `Promise<number>` - Number of tags deleted

## Database Schema Reference

### Core Tables

#### events
- `event_id` (PK, Auto-increment)
- `user_id` (FK to users)
- `event_type_id` (FK to event_types)
- `title` (TEXT)
- `content` (TEXT)
- `status` (VARCHAR(50))
- `due_date` (TIMESTAMP)
- `project_id` (FK to events, self-referencing)
- `phase_id` (FK to project_phases)
- `assigned_to_id` (FK to users)
- `created_at` (TIMESTAMP, auto)
- `updated_at` (TIMESTAMP, auto)

#### items
- `item_id` (PK, Auto-increment)
- `user_id` (FK to users)
- `item_type_id` (FK to item_types)
- `name` (TEXT)
- `description` (TEXT)
- `stock_quantity` (INTEGER)
- `metadata` (JSON)
- `created_at` (TIMESTAMP, auto)
- `updated_at` (TIMESTAMP, auto)

#### tags
- `tag_id` (PK, Auto-increment)
- `user_id` (FK to users)
- `tag_name` (TEXT)
- `created_at` (TIMESTAMP, auto)
- `updated_at` (TIMESTAMP, auto)

#### tag_assignments (Polymorphic)
- `assignment_id` (PK, Auto-increment)
- `tag_id` (FK to tags)
- `taggable_id` (INTEGER) - ID of tagged object
- `taggable_type` (VARCHAR(20)) - Type of tagged object ('event'|'item')

#### links (Polymorphic)
- `link_id` (PK, Auto-increment)
- `source_id` (INTEGER) - Source object ID
- `source_type` (VARCHAR(20)) - Source object type
- `target_id` (INTEGER) - Target object ID
- `target_type` (VARCHAR(20)) - Target object type

### Indexes

Key indexes for performance:

```javascript
// Compound indexes for Events
'[user_id+status]'           // Status filtering
'[user_id+event_type_id]'    // Type filtering
'[user_id+due_date]'         // Date queries

// Polymorphic relationship indexes
'[taggable_type+taggable_id]'     // Tag assignments lookup
'[tag_id+taggable_type]'          // Cross-type tag queries
'[source_type+source_id]'         // Outgoing links
'[target_type+target_id]'         // Incoming links
```

## Utility Functions

### Global Debug Functions

#### `getAppVM()` / `getEventVM()` / `getTagVM()` / `getItemVM()`

Returns ViewModel instances for console debugging.

**Returns:** ViewModel instance

**Example:**
```javascript
const events = getEventVM().getState().events;
const stats = getItemVM().getInventoryStats();
```

### Database Utilities

#### `appDb.getCurrentUserId()`

Returns current user ID (hardcoded to 1 in development).

#### `appDb.clearAllData()`

Clears entire database and reseeds default data.

**Returns:** `Promise<boolean>`

## Error Handling

### Error Types

#### DatabaseError
- **Cause:** IndexedDB operation failures
- **Handling:** Logged and re-thrown with context
- **Recovery:** Automatic retry for transient errors

#### ValidationError
- **Cause:** Invalid data provided to Models
- **Handling:** Immediate rejection with descriptive message
- **Recovery:** User input correction required

#### BusinessLogicError
- **Cause:** ViewModel business rule violations
- **Handling:** User notification with corrective guidance
- **Recovery:** User action required

### Error Propagation

```
Model Error → ViewModel Catch → AppViewModel Handle → User Notification
```

All errors are:
1. Logged to console with stack trace
2. Added to AppViewModel error state
3. Shown to user via notification system
4. Emitted as 'error' events for custom handling

## Event System

### ViewModel Events

All ViewModels implement a consistent event system:

#### Event Listener Methods
- `on(event, callback)`: Add event listener
- `off(event, callback)`: Remove event listener
- `notifyListeners(event, data)`: Emit event to all listeners

#### Common Events
- `stateChange`: Emitted on any state modification
- `dataChange`: Emitted when primary data arrays change
- `selectionChange`: Emitted when selection changes
- `error`: Emitted on operation failures

### Cross-ViewModel Communication

ViewModels communicate through the AppViewModel coordinator:

```javascript
// EventViewModel creates event
eventViewModel.notifyListeners('eventCreated', event);

// AppViewModel receives and coordinates
appViewModel.on('eventCreated', (event) => {
    // Show notification
    appViewModel.showNotification(`Event "${event.title}" created`);
    
    // Update related ViewModels if needed
    if (event.tags.length > 0) {
        tagViewModel.loadTags(); // Refresh tag counts
    }
});
```

This event-driven architecture ensures loose coupling while maintaining coordinated behavior across the application.
