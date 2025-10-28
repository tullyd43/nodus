# Project File Structure

This document provides a complete overview of the project structure, files, and their contents for easy navigation and understanding.

**Status**: ✅ Foundation Complete | 🚧 In Development | 📋 Planned

---

## 📁 Root Level

### Configuration Files
- **`package.json`** - Project dependencies and scripts
  - Dependencies: `dexie` (IndexedDB wrapper)
  - Dev Dependencies: `serve` (development server)
  - Scripts: `start`, `dev`

- **`README.md`** - Project overview, quick start guide, and feature summary
  - Quick start instructions
  - Testing guide
  - Smart capture examples
  - Links to detailed documentation

### Entry Point
- **`index.html`** ✅ - Main application entry point
  - Basic HTML structure
  - Script imports for all modules
  - Test interface for development
  - Quick capture input and controls

---

## 📁 `/docs/` - Documentation

Comprehensive documentation suite covering all aspects of the application.

### **`ARCHITECTURE.md`** ✅ (47 pages)
**Purpose**: Complete system architecture and design principles
- **System Overview**: Core principles, Event/Item dichotomy
- **Database Architecture**: Schema design, relationships, indexing
- **MVVM Implementation**: Pattern explanation, communication flow
- **Performance Considerations**: Optimization strategies
- **Future Extensibility**: Scaling and enhancement guidelines

### **`API_REFERENCE.md`** ✅ (32 pages)
**Purpose**: Detailed API documentation for all classes and methods
- **Data Models**: EventModel, ItemModel, TagModel - all methods with parameters/returns
- **ViewModels**: AppViewModel, EventViewModel, ItemViewModel, TagViewModel - complete API
- **Database Schema**: Table structures, indexes, relationships
- **Event System**: ViewModel communication patterns
- **Error Handling**: Error types and handling strategies

### **`DEVELOPMENT.md`** ✅ (28 pages)
**Purpose**: Development guidelines, patterns, and best practices
- **Getting Started**: Setup, environment, tools
- **MVVM Patterns**: Implementation guidelines
- **Database Development**: Schema evolution, optimization
- **Testing Strategies**: Manual and automated testing
- **Performance Guidelines**: Memory management, optimization
- **Troubleshooting**: Common issues and solutions

### **`FILE_STRUCTURE.md`** ✅ (This file)
**Purpose**: Live document describing project organization and file contents

---

## 📁 `/css/` - Styling

### **`main.css`** ✅
**Purpose**: Application styling and layout
- **Functions**:
  - Basic page layout and typography
  - Form styling for test interface
  - Button and input styles
  - Responsive design foundations
- **Status**: Basic styling for development interface

---

## 📁 `/js/` - JavaScript Application Code

### **`app.js`** ✅
**Purpose**: Application initialization and UI bindings
- **Class**: `App`
- **Functions**:
  - `initialize()` - Sets up AppViewModel and UI bindings
  - `setupUIBindings()` - Connects DOM events to ViewModel methods
  - `setupViewModelListeners()` - Listens to ViewModel state changes
  - `handleQuickCapture()` - Processes quick capture input
  - `handleTestInsert()` - Creates test data
  - `handleTestQuery()` - Displays query results
  - `showMessage()` - User notification system
- **Global Functions**:
  - `getAppVM()`, `getEventVM()`, `getTagVM()`, `getItemVM()` - Debug access

---

## 📁 `/js/database/` - Database Layer

### **`schema.js`** ✅
**Purpose**: Complete IndexedDB schema definition
- **Constants**:
  - `DB_NAME` - Database name
  - `DB_VERSION` - Schema version
  - `DB_SCHEMA` - Complete table definitions with indexes
- **Tables Defined** (15 total):
  - Core: `users`, `events`, `items`
  - Templates: `event_types`, `item_types`, `custom_fields`, `custom_field_values`
  - Organization: `project_phases`, `tags`, `tag_assignments`, `links`
  - Advanced: `routines`, `goals`, `collections`, `lists`
  - Audit: `audit_logs`

### **`db.js`** ✅
**Purpose**: Database connection and initialization
- **Class**: `ProductivityDatabase`
- **Functions**:
  - `initialize()` - Creates database connection and seeds default data
  - `getDb()` - Returns Dexie database instance
  - `getCurrentUserId()` - Returns current user ID (hardcoded to 1)
  - `clearAllData()` - Clears database and reseeds defaults
  - `seedDefaultData()` - Creates default Event Types and Item Types
- **Global Instance**: `appDb` - Available throughout application

---

## 📁 `/js/models/` - Data Access Layer

Pure data access with no business logic. Each model handles CRUD operations for its respective entity.

### **`event.js`** ✅
**Purpose**: Event data access and relationship management
- **Class**: `EventModel`
- **Primary Functions**:
  - `create(eventData)` - Creates Event with tags and relationships
  - `getById(eventId)` - Retrieves Event with all relationships populated
  - `update(eventId, updateData)` - Updates Event properties
  - `delete(eventId)` - Deletes Event and cleans up relationships
  - `query(filters)` - Searches Events with complex filtering
- **Tag Management**:
  - `assignTags(eventId, tagNames)` - Assigns multiple tags to Event
  - `getEventTags(eventId)` - Retrieves all tags for Event
  - `removeAllTags(eventId)` - Cleanup helper for deletion
- **Relationship Management**:
  - `getEventLinks(eventId)` - Gets bi-directional links
  - `getEventCustomFields(eventId)` - Gets custom field values
- **Utilities**:
  - `getOrCreateTag(tagName)` - Finds or creates tag
  - `getDefaultEventTypeId()` - Returns default Event Type

### **`item.js`** ✅
**Purpose**: Item data access with inventory features
- **Class**: `ItemModel`
- **Primary Functions**:
  - `create(itemData)` - Creates Item with tags
  - `getById(itemId)` - Retrieves Item with relationships
  - `update(itemId, updateData)` - Updates Item (including stock)
  - `delete(itemId)` - Deletes Item and relationships
  - `query(filters)` - Searches Items with inventory filtering
- **Tag Management**:
  - `assignTags(itemId, tagNames)` - Assigns tags to Item
  - `getItemTags(itemId)` - Gets Item tags
  - `removeAllTags(itemId)` - Cleanup helper
- **Utilities**:
  - `getDefaultItemTypeId()` - Returns default Item Type

### **`tag.js`** ✅
**Purpose**: Universal tagging system across all object types
- **Class**: `TagModel`
- **Core Functions**:
  - `getAllTags()` - Retrieves all user tags
  - `searchTags(query)` - Searches tags by name
  - `deleteTag(tagId)` - Deletes tag and all assignments
  - `renameTag(tagId, newName)` - Renames tag with duplicate checking
  - `mergeTags(sourceTagId, targetTagId)` - Merges two tags
- **Cross-Context Queries**:
  - `getObjectsWithTag(tagId)` - Gets all Events AND Items with tag
  - `getTagStats(tagId)` - Usage statistics for tag
  - `getPopularTags(limit)` - Most frequently used tags
- **Analytics**:
  - `getTagUsageCount(tagId)` - Total usage count
  - Tag insights and analysis functions

---

## 📁 `/js/viewmodels/` - Business Logic Layer

ViewModels manage state and business logic following MVVM patterns. Each has reactive state and event emission.

### **`app-vm.js`** ✅
**Purpose**: Top-level coordinator ViewModel managing global state
- **Class**: `AppViewModel`
- **Child ViewModels**: Manages EventViewModel, TagViewModel, ItemViewModel
- **Global State Management**:
  - `setState(newState)` - Updates global state with notifications
  - `getState()` - Returns immutable state copy
  - View management: `setCurrentView()`, `setCurrentRoute()`
  - Theme management: `setTheme()`, `toggleSidebar()`
- **Cross-ViewModel Coordination**:
  - `globalSearch(query)` - Searches across all ViewModels
  - `refreshAllData()` - Refreshes all child ViewModels
  - `setupChildViewModelListeners()` - Coordinates ViewModel communication
- **User Experience**:
  - `showNotification(message, type, duration)` - User notifications
  - `handleError(error)` - Global error handling
  - `clearAllData()` - Data management with confirmation
- **Quick Access**:
  - `quickCapture(text)` - Delegates to EventViewModel
  - `createTestData()` - Creates test events and items
  - Getter methods for child ViewModels and common data

### **`event-vm.js`** ✅
**Purpose**: Event-specific state and operations management
- **Class**: `EventViewModel`
- **State Management**:
  - Events array, selected event, event types
  - Loading states, filters, pagination
  - Search functionality, quick capture state
- **Data Operations**:
  - `loadEvents()` - Loads events based on current filters
  - `createEvent(eventData)` - Creates new Event with validation
  - `updateEvent(eventId, updateData)` - Updates existing Event
  - `deleteEvent(eventId)` - Deletes Event with cleanup
  - `getEventById(eventId)` - Retrieves specific Event
- **Selection Management**:
  - `selectEvent(eventId)` - Sets selected Event
  - `clearSelection()` - Clears current selection
- **Filtering & Search**:
  - `applyFilters(newFilters)` - Applies filters and reloads
  - `clearFilters()` - Resets all filters
  - `search(query)` - Searches Events by title/content
- **Quick Capture**:
  - `setCaptureText(text)` - Updates capture input
  - `quickCapture(text)` - Creates Event from parsed text
  - `parseCaptureText(text)` - Smart parsing (hashtags, dates)
- **Pagination**:
  - `goToPage(page)`, `nextPage()`, `previousPage()` - Navigation
- **Test Helpers**:
  - `createTestEvent()` - Generates sample Event data

### **`tag-vm.js`** ✅
**Purpose**: Universal tagging system management
- **Class**: `TagViewModel`
- **State Management**:
  - All tags, popular tags, selected tag
  - Tagged objects, search results, suggestions
  - Tag statistics and insights
- **Data Operations**:
  - `loadTags()` - Loads all user tags
  - `loadPopularTags(limit)` - Loads most used tags
  - `createTag(tagName)` - Creates new tag
  - `deleteTag(tagId)` - Deletes tag and assignments
  - `renameTag(tagId, newName)` - Renames with validation
  - `mergeTags(sourceTagId, targetTagId)` - Merges two tags
- **Tag Selection & Analysis**:
  - `selectTag(tagId)` - Selects tag and loads related objects
  - `clearTagSelection()` - Clears selection
  - `getTagStats(tagId)` - Gets usage statistics
- **Search & Suggestions**:
  - `searchTags(query)` - Searches tags by name
  - `generateSuggestions(input)` - Autocomplete suggestions
- **Tag Utilities**:
  - `extractTagsFromText(text)` - Parses hashtags from text
  - `cleanTagName(tagName)` - Normalizes tag names
  - `formatTagForDisplay(tagName)` - Formats for UI display
- **Analytics & Maintenance**:
  - `getTagInsights()` - Comprehensive tag analytics
  - `cleanupUnusedTags()` - Removes unused tags
  - `bulkDeleteTags(tagIds)` - Batch deletion

### **`item-vm.js`** ✅
**Purpose**: Item and inventory management
- **Class**: `ItemViewModel`
- **State Management**:
  - Items array, selected item, item types
  - Inventory-specific state: low stock items, stock alerts
  - Consumption history, filters, pagination
- **Data Operations**:
  - `loadItems()` - Loads items based on filters
  - `createItem(itemData)` - Creates new Item
  - `updateItem(itemId, updateData)` - Updates Item
  - `deleteItem(itemId)` - Deletes Item with cleanup
  - `getItemById(itemId)` - Retrieves specific Item
- **Inventory Management**:
  - `updateStock(itemId, newQuantity, reason)` - Updates stock with audit
  - `consumeItem(itemId, quantity, reason)` - Reduces stock
  - `restockItem(itemId, quantity, reason)` - Increases stock
  - `logStockChange()` - Audit trail for stock changes
- **Stock Monitoring**:
  - `checkStockLevels()` - Monitors for low stock
  - Automatic stock alerts and notifications
  - Low stock threshold management
- **Selection & Search**:
  - `selectItem(itemId)` - Sets selected Item
  - `search(query)` - Searches Items by name/description
  - `applyFilters(newFilters)` - Inventory-specific filtering
- **Quick Actions**:
  - `quickAddItem(name, quantity)` - Fast Item creation
- **Analytics**:
  - `getInventoryStats()` - Comprehensive inventory analytics
  - `groupItemsByType()` - Categorization for reporting
- **Import/Export**:
  - `importItems(itemsData)` - Bulk import functionality
  - `exportItems()` - Export for backup/analysis
- **Test Helpers**:
  - `createTestItem()` - Generates sample Item data

---

## 🚧 Planned Additions

### **`/js/views/`** 📋 (Future)
**Purpose**: UI components and view logic
- **Planned Files**:
  - `event-list-view.js` - Event list interface
  - `kanban-view.js` - Kanban board interface
  - `timeline-view.js` - Timeline view
  - `search-view.js` - Advanced search interface

### **`/js/components/`** 📋 (Future)
**Purpose**: Reusable UI components
- **Planned Files**:
  - `tag-input.js` - Tag autocomplete input
  - `date-picker.js` - Custom date picker
  - `modal.js` - Modal dialog system
  - `notification.js` - Toast notification component

### **`/js/utils/`** 📋 (Future)
**Purpose**: Utility functions and helpers
- **Planned Files**:
  - `date-utils.js` - Date formatting and parsing
  - `text-utils.js` - Text processing utilities
  - `validation.js` - Input validation helpers
  - `export-utils.js` - Data export functionality

### **`/js/sync/`** 📋 (Future - Phase 4)
**Purpose**: Cloud synchronization functionality
- **Planned Files**:
  - `sync-engine.js` - Cloud sync coordination
  - `conflict-resolution.js` - Data conflict handling
  - `api-client.js` - Server communication
  - `offline-queue.js` - Offline operation queuing

---

## 📊 File Status Legend

- ✅ **Complete** - Fully implemented and documented
- 🚧 **In Development** - Currently being worked on
- 📋 **Planned** - Designed but not yet implemented
- 🔄 **Needs Update** - Exists but requires modification

---

## 🔄 Update Guidelines

This document should be updated whenever:

1. **New files are added** - Add to appropriate section with description
2. **File purposes change** - Update function descriptions
3. **New functions are added** - Update function lists
4. **Project structure evolves** - Reorganize sections as needed
5. **Status changes** - Update status indicators

**Last Updated**: Initial Creation - Foundation Complete  
**Next Review**: When UI development begins

---

## 🎯 Navigation Tips

### **For New Developers**:
1. Start with `README.md` for overview
2. Read `docs/ARCHITECTURE.md` for system understanding
3. Check this file for specific functionality locations
4. Use `docs/API_REFERENCE.md` for detailed method information

### **For Feature Development**:
1. Check existing ViewModels for related functionality
2. Follow MVVM patterns established in current files
3. Update this document when adding new files
4. Reference `docs/DEVELOPMENT.md` for best practices

### **For Debugging**:
1. Use browser console with `getEventVM()`, `getTagVM()`, etc.
2. Check ViewModel state with `.getState()` methods
3. Use `getAppVM().getDebugInfo()` for comprehensive state
4. Reference `docs/DEVELOPMENT.md` troubleshooting section

This living document will grow with the project, providing a roadmap for navigation and development.
