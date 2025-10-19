# AI Project Context

This file is auto-generated to provide context to AI assistants. Do not edit it manually, as your changes will be overwritten.

Last updated: 2025-10-19T01:37:04.275Z

---


--- START OF FILE: README.md ---

> **Note for AI Agents:** For a deeper understanding of the project's structure and conventions, please review the `GEMINI.md` files located throughout the repository. These files provide specific instructions and context for development.

**-- GEMINI.md files --**

.
├── [GEMINI.md](d:\Development Files\repositories\nodus\GEMINI.md)
├── docs
│   └── development
│       └── [GEMINI.md](d:\Development Files\repositories\nodus\docs\development\GEMINI.md)
├── src
│   ├── core
│   │   ├── database
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\database\GEMINI.md)
│   │   ├── models
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\models\GEMINI.md)
│   │   ├── utils
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\utils\GEMINI.md)
│   │   └── viewmodels
│   │       └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\viewmodels\GEMINI.md)
│   └── ui
│       └── components
│           └── [GEMINI.md](d:\Development Files\repositories\nodus\src\ui\components\GEMINI.md)
└── tests
    └── [GEMINI.md](d:\Development Files\repositories\nodus\tests\GEMINI.md)



# Organizational Ecosystem
**A radically simple, infinitely extensible productivity platform**

[![Version](https://img.shields.io/badge/version-4.0.0-blue.svg)](https://github.com/your-org/organizational-ecosystem)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Database](https://img.shields.io/badge/database-PostgreSQL+IndexedDB-orange.svg)](docs/DATABASE_SCHEMA.md)
[![Architecture](https://img.shields.io/badge/architecture-MVVM-purple.svg)](docs/SYSTEM_ARCHITECTURE.md)

---

## 🎯 Vision

**Everything in digital organization is either an Event (action) or an Item (asset).** 

Through this elegant abstraction and a simplified 18-table database schema, users can create unlimited organizational modules while maintaining sub-second performance and architectural simplicity that scales from personal productivity to enterprise collaboration.

### The Philosophy

```
"Radical Simplicity + Universal Extensibility"

• 18 tables achieve what traditional systems need 50+ tables for
• Real columns + strategic JSONB = 10x query performance  
• Users create infinite types through configuration, not code
• Every system works with every other system (polymorphic design)
```

---

## ✨ Key Features

### 🚀 **Universal Quick Capture**
Transform natural language into structured data instantly:

```
"Call John about project #work #urgent due:tomorrow $50 @office"
→ Event: title="Call John about project"
→ tags=["work", "urgent"] 
→ due_date=tomorrow, budget=$50, location="office"
```

### 🏗️ **Infinite Type Creation**
Users create unlimited event and item types without touching code:
- **Events**: Workouts, Meetings, Projects, Purchases, Routines
- **Items**: Equipment, Books, Accounts, Inventory, Collections
- **Custom Fields**: Pick from field library or define new ones
- **Templates**: Auto-generate content with variables

### 🏷️ **Universal Systems**
Polymorphic systems that work across all content:
- **Tags**: Flat network design, cross-context tagging
- **Relationships**: Link any entity to any other entity
- **Collections**: Dynamic views with real-time filtering
- **File Sync**: Bidirectional markdown synchronization

### ⚡ **Performance Optimized**
```sql
-- 10x faster queries using real columns
SELECT * FROM events 
WHERE user_id = ? AND priority >= 4 AND due_date BETWEEN ? AND ?;

-- Strategic JSONB only for truly custom data
WHERE custom_fields @> '{"project_code": "PROJ-2024"}';
```

---

## 🏛️ Architecture Overview

### Core Abstraction: Events vs Items

| **Events (Verbs/Actions)** | **Items (Nouns/Assets)** |
|---------------------------|-------------------------|
| ✅ Tasks, meetings, projects | ✅ Equipment, books, tools |
| ✅ Notes, purchases, calls | ✅ Accounts, subscriptions |
| ✅ Workouts, routines | ✅ Inventory, consumables |
| ✅ Goals, milestones | ✅ Collections, references |

### Simplified Database Schema

```
18 Total Tables = Maximum Power + Minimum Complexity
(Identical schema for both PostgreSQL server & IndexedDB cache)

Foundation (3):     users, events, items
Types (2):          event_types, item_types  
Fields (2):         field_definitions, entity_fields
Universal (3):      tags, tag_assignments, links
Organization (4):   collections, lists, list_items, routines
Infrastructure (4): routine_instances, entity_files, operation_logs, deleted_entities
```

### Hybrid Architecture: Offline-First + Server Scale

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (OFFLINE-FIRST)                 │
├─────────────────────────────────────────────────────────────┤
│  IndexedDB Cache: 10K most relevant records                │
│  - Recent events (last 30 days)                            │
│  - Starred/pinned items                                     │
│  - Active projects and collections                          │
│  - Offline modification queue                               │
└─────────────────────────────────────────────────────────────┘
                               ▲ ▼ Intelligent Sync
┌─────────────────────────────────────────────────────────────┐
│                  SERVER (UNLIMITED SCALE)                  │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL + JSONB: Unlimited records (1M+)               │
│  - Full dataset with enterprise performance                │
│  - Advanced search and analytics                           │
│  - Multi-user collaboration                                │
│  - Real-time conflict resolution                           │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

```javascript
Frontend:    Vanilla JavaScript ES2022 + MVVM Architecture
Client DB:   IndexedDB + Dexie.js (intelligent local cache)
Server DB:   PostgreSQL + JSONB (primary storage, unlimited scale)
Storage:     18-table schema optimized for both client and server
Sync:        Bidirectional intelligent sync + markdown file sync
API:         RESTful Node.js with JSONB query optimization
Deployment:  Docker + PostgreSQL + intelligent offline-first caching
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Modern browser with IndexedDB support

### Installation

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

### First Steps

1. **Create Your First Event**
   ```
   Type: "Meeting with team tomorrow 2pm #work"
   → Auto-creates event with due date and work tag
   ```

2. **Add Some Items**
   ```
   Type: "MacBook Pro 2023 $2499 #tech #equipment"
   → Creates item with value and categorization
   ```

3. **Explore Collections**
   - Visit the Vault tab
   - See dynamic collections like "Today", "High Priority", "Work Items"
   - Create custom collections with complex filters

4. **Try File Sync**
   - Export events to markdown files
   - Edit in your favorite editor
   - Sync changes back to database

---

## 📊 Current Implementation Status

### ✅ **Phase 1: Offline-First Client** (Complete)
- [x] 18-table IndexedDB schema (mirrors server schema)
- [x] MVVM architecture with reactive ViewModels
- [x] Event and Item models with CRUD operations
- [x] Universal tagging and linking systems
- [x] Basic collections and list management
- [x] Quick capture with natural language parsing
- [x] Comprehensive audit logging
- [x] Offline-first development environment

### 🚀 **Phase 2: Server Architecture** (Next - 2-3 weeks)
- [ ] PostgreSQL server with identical 18-table schema
- [ ] Real column optimization (priority, budget, location, due_date)
- [ ] JSONB custom fields with GIN indexing
- [ ] RESTful API with JSONB query optimization
- [ ] Universal field system (field_definitions, entity_fields)
- [ ] Performance benchmarking (1M+ record capability)

### 🔧 **Phase 3: Intelligent Sync** (4-6 weeks)
- [ ] Bidirectional client-server synchronization
- [ ] Conflict resolution with user preferences
- [ ] Intelligent caching strategy (10K most relevant records)
- [ ] Real-time updates via WebSocket
- [ ] File synchronization with markdown export/import
- [ ] Background sync optimization

### 📋 **Phase 4: Enterprise Features** (4-6 weeks)
- [ ] Multi-user collaboration with permissions
- [ ] Advanced analytics on unlimited datasets
- [ ] Template system with server-side rendering
- [ ] Routine automation with server scheduling
- [ ] Advanced search with PostgreSQL full-text
- [ ] Mobile-responsive design with offline sync

---

## 🏗️ Architecture Highlights

### Performance Strategy
```javascript
// Real columns for common queries (10x performance improvement)
events: {
  priority: INTEGER,      // Real column - sub-second filtering
  budget: DECIMAL,        // Real column - fast range queries  
  location: VARCHAR,      // Real column - instant location lookup
  due_date: TIMESTAMP,    // Real column - optimized date ranges
  custom_fields: JSONB    // Only for truly custom, rarely-queried data
}
```

### Universal Systems Design
```javascript
// Polymorphic tagging works across ALL entity types
TagAssignment: {
  tag_id: INTEGER,
  taggable_type: 'event' | 'item',  // Polymorphic design
  taggable_id: INTEGER
}

// One system, infinite applications
#work → events AND items
#urgent → events AND items  
#health → events AND items
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

---

## 🎨 User Experience

### Quick Capture Examples

```bash
# Events (Actions)
"Call John tomorrow 2pm #work"               → Event with due_date, tags
"Buy groceries milk bread eggs $25"         → Event with description, budget  
"Workout @gym 45min #health priority:high"  → Event with location, duration, priority

# Items (Assets)  
"iPhone 15 Pro $999 #tech #phone"           → Item with value, tags
"Conference Room A @building-2"             → Item with location
"Project budget $50000 #finance"            → Item with value, category
```

### Dynamic Collections

```javascript
// Collections auto-update as data changes
"Today"           → Events due today
"High Priority"   → Priority 4-5 events  
"Work Inventory"  → Items tagged #work
"Overdue"         → Past due incomplete events
"This Week"       → Events due within 7 days

// Users create unlimited custom collections
"Q1 Projects"     → Events with custom_fields.quarter = "Q1"
"Equipment"       → Items with item_type = "Equipment"  
"Team Meetings"   → Events tagged #team with event_type = "Meeting"
```

### File Synchronization

```markdown
<!-- Auto-generated from database -->
# Call John about Project Alpha

**Due:** Jan 15, 2024
**Priority:** High (4/5)
**Budget:** $500
**Location:** Office

## Description
Discuss Q1 roadmap and budget allocation for Project Alpha initiative.

## Notes
- Prepare financial projections
- Review team capacity
- Confirm timeline milestones

---
*Last synced: 2024-01-10 14:30:00*
```

---

## 🔧 Development

### Project Structure
```
src/
├── database/           # IndexedDB schema and migrations
├── models/            # Data access layer (Event, Item, Tag, etc.)
├── viewmodels/        # Business logic layer (MVVM pattern)
├── views/             # UI components (future)
├── utils/             # Utilities (parsing, validation, performance)
└── sync/              # File synchronization system

docs/
├── FEATURE_MATRIX.md      # Complete feature specification
├── SYSTEM_ARCHITECTURE.md # Technical architecture details  
├── DATABASE_SCHEMA.md     # Database design and optimization
└── DEVELOPMENT_GUIDE.md   # Comprehensive developer handbook
```

### Key Development Commands
```bash
npm run dev          # Start development server
npm run test         # Run unit tests
npm run test:watch   # Watch mode testing
npm run lint         # Code quality checks
npm run migrate      # Run database migrations
npm run seed         # Generate sample data
npm run performance  # Performance benchmarking
```

### Example: Creating a Custom Event Type
```javascript
// 1. Create the event type
const workoutType = await EventType.create({
  name: "Workout",
  color: "#e74c3c",
  icon: "dumbbell",
  content_template: "# {{title}}\n**Duration:** {{custom_fields.duration}} min\n**Type:** {{custom_fields.workout_type}}"
});

// 2. Add fields from library  
await EntityField.assignFields(workoutType.id, [
  {field_name: "duration", display_name: "Duration (minutes)", is_required: true},
  {field_name: "workout_type", display_name: "Workout Type", is_required: true},
  {field_name: "calories", display_name: "Calories Burned"}
]);

// 3. System auto-generates forms and validates input
// 4. Users can now create "Workout" events with custom fields
```

---

## 📚 Documentation

| Document | Purpose | Audience |
|----------|---------|----------|
| [**README.md**](README.md) | Project overview and quick start | Everyone |
| [**FEATURE_MATRIX.md**](docs/FEATURE_MATRIX.md) | Complete feature specification | Product, Development |
| [**SYSTEM_ARCHITECTURE.md**](docs/SYSTEM_ARCHITECTURE.md) | Technical architecture details | Developers, Architects |
| [**DATABASE_SCHEMA.md**](docs/DATABASE_SCHEMA.md) | Database design and performance | Database, Backend |
| [**DEVELOPMENT_GUIDE.md**](docs/DEVELOPMENT_GUIDE.md) | Comprehensive developer handbook | Developers |

---

## 🎯 Use Cases

### Personal Productivity (Client: 1K-10K records)
- **Task Management**: GTD, priority-based workflows, project tracking
- **Habit Tracking**: Routines, streaks, progress monitoring  
- **Inventory Management**: Home inventory, equipment tracking, consumables
- **Knowledge Management**: Notes, research, idea capture with file sync
- **Offline-first**: Full functionality without internet connection

### Small Business (Hybrid: 10K-100K records)
- **Project Management**: Client projects, deadlines, resource allocation
- **Asset Tracking**: Equipment, software licenses, office supplies
- **Customer Relations**: Contact management, interaction history
- **Financial Tracking**: Expenses, budgets, invoice management
- **Team Coordination**: Shared collections, collaborative workflows

### Enterprise Scale (Server: 100K-1M+ records)
- **Department Management**: Multi-team projects, resource optimization
- **Advanced Analytics**: Performance metrics, trend analysis, reporting
- **Compliance Tracking**: Audit trails, regulatory requirements
- **Integration Hub**: API-first design for enterprise tool integration
- **Real-time Collaboration**: Multi-user editing, instant synchronization

### Platform Scale (PostgreSQL: Unlimited)
- **Multi-tenant SaaS**: Thousands of organizations, millions of records
- **Advanced Search**: Full-text search across unlimited datasets
- **AI Integration**: Pattern recognition, smart suggestions, automation
- **Enterprise Security**: Role-based permissions, data encryption, compliance
- **Global Distribution**: Multi-region deployment, edge caching

---

## 🚀 Roadmap

### Version 4.0 (Current) - Offline-First Foundation
- ✅ Core 18-table IndexedDB client architecture
- ✅ MVVM implementation with reactive state
- ✅ Universal systems (tags, links, collections) 
- ✅ Quick capture with natural language processing
- 🚀 Real column optimization for performance
- 🚀 Universal field system implementation

### Version 4.1 (Q2 2024) - Server Architecture
- 🔧 PostgreSQL server with identical schema
- 🔧 RESTful API with JSONB optimization
- 🔧 Authentication and multi-user support
- 🔧 Intelligent sync strategy implementation
- 🔧 Advanced search with PostgreSQL full-text

### Version 4.2 (Q3 2024) - Enterprise Features
- 📋 Real-time collaboration via WebSocket
- 📋 Advanced analytics on unlimited datasets
- 📋 File synchronization (Obsidian, markdown)
- 📋 Template system with server-side rendering
- 📋 Mobile-responsive design with offline sync

### Version 5.0 (Q4 2024) - Platform Scale
- 🚀 Multi-tenant SaaS architecture
- 🚀 Global deployment with edge caching
- 🚀 AI integration (smart suggestions, automation)
- 🚀 Plugin architecture and marketplace
- 🚀 Mobile applications (React Native)

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md).

### Development Philosophy
1. **Maintain the Event/Item dichotomy** - Everything fits into this model
2. **Optimize for performance** - Real columns for common queries, strategic JSONB
3. **Universal systems** - Design once, work everywhere (polymorphic)
4. **Configuration over code** - Users create types through UI, not development
5. **Radical simplicity** - Achieve more with less complexity

### Quick Contribution Setup
```bash
git clone https://github.com/your-org/organizational-ecosystem.git
cd organizational-ecosystem
npm install
npm run dev
npm test
```

See [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for comprehensive development instructions.

---

## 💡 Philosophy

### Why This Approach?

**Traditional productivity apps force users to adapt to rigid structures.** Our approach inverts this - the application adapts to users through infinite configuration possibilities while maintaining architectural simplicity that ensures performance and maintainability.

### Core Principles

1. **Everything is Event or Item** - Fundamental abstraction that encompasses all digital organization
2. **Configuration over Code** - Users create unlimited types without developer intervention  
3. **Universal Systems** - Tags, links, collections work across all entity types
4. **Performance First** - Sub-second queries even with 100K+ records
5. **Offline First** - Complete functionality without network dependency
6. **Radical Simplicity** - 18 tables achieve infinite extensibility

### The Result

**A productivity platform that adapts to users, rather than forcing users to adapt to the platform.**

---

## 📈 Performance Strategy

### Offline-First Performance
```
Client (IndexedDB Cache):
├── Local queries: 1-10ms (10K cached records)
├── Offline operations: Instant (queue for sync)
├── Quick capture: <5ms (local processing)
└── UI responsiveness: 60fps (local data)

Server (PostgreSQL + JSONB):
├── Simple queries: 10-50ms (1M+ records)
├── JSONB filtering: 20-100ms (GIN indexed)
├── Full-text search: 50-200ms (enterprise scale)
├── Complex analytics: 200ms-2s (unlimited data)
└── Real-time sync: 100-500ms (intelligent deltas)

Hybrid Benefits:
├── Works completely offline
├── Scales to enterprise (unlimited server storage)
├── Sub-second performance for all common operations
└── Intelligent sync minimizes data transfer
```

### PostgreSQL + JSONB Advantages
```sql
-- Real column performance (10x faster than pure JSONB)
SELECT * FROM events 
WHERE user_id = ? AND priority >= 4 AND due_date BETWEEN ? AND ?;
-- Performance: ~15ms with 1M records

-- JSONB flexibility with GIN index performance  
SELECT * FROM events 
WHERE custom_fields @> '{"project": "Alpha", "department": "Engineering"}';
-- Performance: ~40ms with 1M records

-- Combined real + JSONB queries (best of both worlds)
SELECT * FROM events 
WHERE user_id = ? AND priority >= 4 
  AND custom_fields @> '{"tags": ["urgent"]}'
ORDER BY due_date LIMIT 50;
-- Performance: ~25ms with 1M records
```

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **IndexedDB/Dexie.js** - Enabling robust offline-first data storage
- **MVVM Pattern** - Clean separation of concerns and reactive programming
- **Polymorphic Design** - Universal systems that scale infinitely
- **Markdown Ecosystem** - Interoperability with knowledge management tools

---

## 📞 Support & Community

- **Documentation**: [docs/](docs/) folder contains comprehensive guides
- **Issues**: [GitHub Issues](https://github.com/your-org/organizational-ecosystem/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/organizational-ecosystem/discussions)
- **Development**: See [DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)

---

<div align="center">

**[🚀 Get Started](#-quick-start) | [📚 Documentation](docs/) | [🤝 Contributing](#-contributing) | [🐛 Issues](https://github.com/your-org/organizational-ecosystem/issues)**

*Built with ❤️ for people who believe productivity software should adapt to them, not the other way around.*

</div>


--- END OF FILE: README.md ---


--- START OF FILE: package.json ---

{
	"scripts": {
		"dev": "live-server --port=3000 --entry-file=index.html",
		"test": "jest",
		"lint": "eslint src/",
		"docs:generate": "jsdoc -c jsdoc.json",
		"docs:todos": "node scripts/extract-todos.js",
		"docs:validate": "node scripts/validate-docs.js",
		"docs:readme": "node scripts/generate-readme.js",
		"ai:sync": "node scripts/sync-ai-documentation.js",
		"ai:status": "node -e \"console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('.ai-sync-state.json', 'utf8')), null, 2))\"",
		"ai:summary": "cat docs/AI_SYNC_LATEST.md",
		"ai:reset": "rm -f .ai-sync-state.json .project-knowledge.json docs/AI_SYNC_LATEST.md",
		"setup:hooks": "chmod +x .git/hooks/post-commit .git/hooks/post-merge && echo 'Git hooks activated'",
		"setup:ai-docs": "npm run ai:sync && npm run setup:hooks && echo 'AI documentation system ready'",
		"full-docs": "npm run docs:generate && npm run docs:todos && npm run docs:readme && npm run ai:sync"
	},
	"husky": {
		"hooks": {
			"pre-commit": "npm run lint",
			"prepare-commit-msg": "node scripts/prepare-commit-msg.js"
		}
	},
	"dependencies": {
		"dexie": "^3.2.4",
		"date-fns": "^2.30.0"
	},
	"devDependencies": {
		"serve": "^14.2.1",
		"eslint": "^8.45.0",
		"jest": "^29.6.1",
		"@types/jest": "^29.5.3",
		"live-server": "^1.2.2",
		"husky": "^8.0.3"
	}
}


--- END OF FILE: package.json ---


--- START OF FILE: docs/architecture/SYSTEM_ARCHITECTURE.md ---

# System Architecture Document
**Organizational Ecosystem Application - Hybrid Offline-First + Server Architecture**

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Hybrid Architecture Overview](#hybrid-architecture-overview)
3. [PostgreSQL Server Architecture](#postgresql-server-architecture)
4. [IndexedDB Client Architecture](#indexeddb-client-architecture)
5. [Synchronization Architecture](#synchronization-architecture)
6. [Application Layer Architecture](#application-layer-architecture)
7. [Performance & Scalability](#performance--scalability)
8. [Security & Multi-User Architecture](#security--multi-user-architecture)
9. [Development Architecture](#development-architecture)
10. [Deployment Architecture](#deployment-architecture)
11. [Future Platform Architecture](#future-platform-architecture)

---

## Executive Summary

The Organizational Ecosystem Application represents a paradigm shift in productivity software architecture, built on the foundation of **radical simplicity** and **universal extensibility** with a **hybrid offline-first + server architecture**. The system employs a dual-entity data model where everything is either an **Event** (actions, commitments, temporal data) or an **Item** (quantifiable assets), creating a unified framework that scales from personal task management (1K records) to enterprise collaboration (1M+ records) while maintaining complete offline functionality.

### Key Architectural Achievements

1. **Hybrid Offline-First Design** - Complete functionality without server dependency + unlimited server scale
2. **PostgreSQL + JSONB Performance** - Real columns for common queries (10x faster) + JSONB flexibility
3. **Identical Schema Strategy** - Seamless sync between PostgreSQL server and IndexedDB client
4. **Clean, Simple, Pure Data Structures** - Optimized for scalability, speed, maintainability, and extendibility
5. **DRY (Don't Repeat Yourself)** - Universal systems eliminate duplication across modules
6. **Schema-Driven Flexibility** - User configurations stored as data, not code
7. **Enterprise-Ready Security** - Row-level security, multi-user collaboration, real-time conflict resolution
8. **Radically Simplified Schema** - 18 tables achieving infinite customization through configuration

---

## Hybrid Architecture Overview

### Core Philosophy: Offline-First + Server Scale

**Everything is either an Event or an Item.** This fundamental principle drives all architectural decisions across both client and server layers.

The hybrid architecture provides the best of both worlds:
- **Complete offline functionality** via IndexedDB intelligent cache
- **Unlimited server scale** via PostgreSQL + JSONB backend
- **Seamless synchronization** with identical schemas
- **Enterprise collaboration** with real-time conflict resolution

### Architectural Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │   Events Tab    │ │   Vault Tab     │ │ Templates Tab   │ │
│  │ - Quick Input   │ │ - Collections   │ │ - Event Types   │ │
│  │ - Event List    │ │ - Tags          │ │ - Field Library │ │
│  │ - Calendar      │ │ - Relationships │ │ - Content Tmpl  │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
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
│ ┌─────────────────┐           ┌─────────────────────────────┐ │
│ │ Offline Queue   │ ◄────────► │    Conflict Resolution    │ │
│ │ - CREATE ops    │           │ - Server wins             │ │
│ │ - UPDATE ops    │           │ - Client wins             │ │
│ │ - DELETE ops    │           │ - Smart merge             │ │
│ │ - Retry logic   │           │ - Manual resolution       │ │
│ └─────────────────┘           └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                               │
┌─────────────────────────────────────────────────────────────┐
│              CLIENT DATABASE LAYER                         │
├─────────────────────────────────────────────────────────────┤
│                IndexedDB Cache (10K records)               │
│  - Recent events (last 30 days)                            │
│  - Starred/pinned items                                     │
│  - Active projects and collections                          │
│  - Offline modification queue                               │
│  - 18 tables (mirrors server schema exactly)               │
└─────────────────────────────────────────────────────────────┘
                               ▲ ▼ Bidirectional Sync
┌─────────────────────────────────────────────────────────────┐
│               SERVER DATABASE LAYER                        │
├─────────────────────────────────────────────────────────────┤
│              PostgreSQL + JSONB (Unlimited)                │
│  - Full dataset with enterprise performance                │
│  - Real columns + JSONB custom fields                      │
│  - Advanced search and analytics                           │
│  - Multi-user collaboration                                │
│  - Row-level security                                      │
│  - 18 tables (identical to client)                         │
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
│  - Multi-tenant support                                    │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

```javascript
// Complete hybrid technology stack
const architecture = {
  // Client Layer
  frontend: {
    language: 'Vanilla JavaScript ES2022',
    architecture: 'MVVM (Model-View-ViewModel)',
    database: 'IndexedDB + Dexie.js (intelligent cache)',
    ui: 'CSS3 with custom properties',
    performance: 'Strategic compound indexes'
  },
  
  // Server Layer  
  backend: {
    language: 'Node.js + JavaScript',
    framework: 'Express.js RESTful API',
    database: 'PostgreSQL + JSONB (primary storage)',
    authentication: 'JWT with row-level security',
    realtime: 'WebSocket for live updates'
  },
  
  // Synchronization
  sync: {
    strategy: 'Bidirectional intelligent sync',
    conflicts: 'Real-time conflict resolution',
    offline: 'Complete offline functionality',
    caching: '10K most relevant records locally'
  },
  
  // Deployment
  infrastructure: {
    containerization: 'Docker + Docker Compose',
    database: 'PostgreSQL with optimized indexes',
    caching: 'Intelligent client-side caching',
    scaling: 'Horizontal server scaling ready'
  }
};
```

---

## PostgreSQL Server Architecture

### Enterprise Database Design

The PostgreSQL server provides unlimited scale, advanced features, and enterprise performance while maintaining the same 18-table structure as the IndexedDB client.

#### Core Performance Strategy

```sql
-- Example: Events table optimized for 1M+ records
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_type_id INTEGER REFERENCES event_types(event_type_id),
    
    -- PERFORMANCE: Real columns for 10x faster queries
    priority INTEGER CHECK (priority BETWEEN 1 AND 5),
    budget DECIMAL(10,2),
    location VARCHAR(200),
    due_date TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    
    -- FLEXIBILITY: JSONB for unlimited custom fields
    custom_fields JSONB DEFAULT '{}',
    
    -- Full-text search optimization
    search_vector tsvector,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL
);

-- Enterprise-grade performance indexes
CREATE INDEX idx_events_user_priority_due ON events(user_id, priority, due_date) 
WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX idx_events_custom_fields ON events USING GIN (custom_fields) 
WHERE deleted_at IS NULL;

CREATE INDEX idx_events_search ON events USING GIN (search_vector) 
WHERE deleted_at IS NULL;
```

#### Multi-User Security Architecture

```sql
-- Row-level security for multi-tenant collaboration
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_own_data ON events FOR ALL 
USING (user_id = current_setting('app.current_user_id')::INTEGER);

-- Advanced policies for team collaboration
CREATE POLICY events_team_access ON events FOR SELECT
USING (user_id IN (
    SELECT team_member_id FROM team_members 
    WHERE team_id = current_setting('app.current_team_id')::INTEGER
));
```

#### Advanced Query Capabilities

```sql
-- Real column performance (10-30ms with 1M records)
SELECT * FROM events 
WHERE user_id = $1 
  AND priority >= 4 
  AND due_date BETWEEN $2 AND $3
ORDER BY priority DESC, due_date ASC 
LIMIT 50;

-- JSONB flexibility with GIN index (20-80ms with 1M records)
SELECT * FROM events 
WHERE user_id = $1 
  AND custom_fields @> '{"project": "Alpha", "department": "Engineering"}'
ORDER BY due_date LIMIT 50;

-- Full-text search (50-200ms across unlimited data)
SELECT *, ts_rank(search_vector, plainto_tsquery($2)) as rank
FROM events 
WHERE user_id = $1 
  AND search_vector @@ plainto_tsquery($2)
ORDER BY rank DESC LIMIT 100;

-- Advanced analytics (200ms-2s for complex reports)
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  AVG(priority) as avg_priority,
  SUM(budget) as total_budget
FROM events 
WHERE user_id = $1 AND created_at >= $2
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY month;
```

---

## IndexedDB Client Architecture

### Intelligent Caching Strategy

The IndexedDB client maintains a smart subset of the most relevant data for complete offline functionality.

#### Cache Management

```javascript
class IntelligentCache {
  constructor() {
    this.maxRecords = 10000;
    this.cacheStrategy = {
      recent: 2000,        // Recently accessed records
      favorites: 1000,     // User-starred items
      due_soon: 2000,      // Due within 2 weeks
      active_projects: 3000, // Current work context
      offline_queue: 2000   // Pending sync operations
    };
  }
  
  async optimizeCache() {
    // Get most relevant records from server
    const relevantData = await this.server.getRelevantRecords({
      user_id: this.userId,
      strategy: this.cacheStrategy,
      last_sync: this.lastSyncTime
    });
    
    // Replace cache with optimized subset
    await db.transaction('rw', db.events, db.items, async () => {
      await db.events.clear();
      await db.items.clear();
      await db.events.bulkAdd(relevantData.events);
      await db.items.bulkAdd(relevantData.items);
    });
  }
}
```

#### Offline Operation Queue

```javascript
class OfflineQueue {
  async queueOperation(operation, entityType, entityId, data) {
    await db.sync_queue.add({
      sync_id: generateUUID(),
      operation,        // 'CREATE', 'UPDATE', 'DELETE'
      entity_type: entityType,
      entity_id: entityId,
      data: data,
      created_at: new Date(),
      retry_count: 0,
      last_attempt: null,
      status: 'pending'
    });
    
    // Trigger background sync if online
    if (navigator.onLine) {
      this.backgroundSync();
    }
  }
  
  async processQueue() {
    const pendingOps = await db.sync_queue
      .where('status').equals('pending')
      .orderBy('created_at')
      .toArray();
    
    for (const op of pendingOps) {
      try {
        await this.syncToServer(op);
        await db.sync_queue.update(op.sync_id, { status: 'completed' });
      } catch (error) {
        await this.handleSyncError(op, error);
      }
    }
  }
}
```

#### Performance Optimization

```javascript
// Optimized IndexedDB queries for client performance
class ClientQueries {
  // Compound index query (1-5ms)
  async getHighPriorityEvents(userId) {
    return db.events
      .where('[user_id+priority]')
      .between([userId, 4], [userId, 5])
      .and(event => !event.deleted_at)
      .toArray();
  }
  
  // Date range with filters (2-10ms)
  async getDueSoonEvents(userId, days = 7) {
    const maxDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    
    return db.events
      .where('user_id').equals(userId)
      .and(event => event.due_date && event.due_date <= maxDate)
      .and(event => event.status === 'active')
      .toArray();
  }
  
  // Pagination for large result sets (1-5ms)
  async getPaginatedEvents(userId, page = 0, pageSize = 50) {
    return db.events
      .where('user_id').equals(userId)
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();
  }
}
```

---

## Synchronization Architecture

### Bidirectional Intelligent Sync

The synchronization layer handles seamless data flow between client and server with conflict resolution.

#### Sync Process Flow

```javascript
class SynchronizationEngine {
  constructor() {
    this.conflictResolution = 'server_wins'; // 'client_wins', 'merge', 'manual'
    this.syncInterval = 30000; // 30 seconds
    this.batchSize = 100;
  }
  
  async executeSync() {
    try {
      // Phase 1: Push local changes to server
      await this.pushLocalChanges();
      
      // Phase 2: Pull server updates
      await this.pullServerUpdates();
      
      // Phase 3: Resolve conflicts
      await this.resolveConflicts();
      
      // Phase 4: Optimize local cache
      await this.optimizeCache();
      
      // Phase 5: Update sync metadata
      await this.updateSyncState();
      
    } catch (error) {
      await this.handleSyncError(error);
    }
  }
  
  async pushLocalChanges() {
    const pendingChanges = await db.sync_queue
      .where('status').equals('pending')
      .limit(this.batchSize)
      .toArray();
    
    for (const change of pendingChanges) {
      try {
        const result = await this.api.applyChange({
          operation: change.operation,
          entity_type: change.entity_type,
          entity_id: change.entity_id,
          data: change.data,
          client_timestamp: change.created_at
        });
        
        if (result.success) {
          // Update local record with server response
          await this.updateLocalRecord(change, result.data);
          await db.sync_queue.update(change.sync_id, { 
            status: 'completed',
            server_timestamp: result.timestamp
          });
        } else {
          // Handle conflicts
          await this.handleConflict(change, result);
        }
        
      } catch (error) {
        await this.retryOrFail(change, error);
      }
    }
  }
  
  async pullServerUpdates() {
    const lastSync = await this.getLastSyncTime();
    
    const updates = await this.api.getUpdates({
      user_id: this.userId,
      since: lastSync,
      relevance_filter: this.getCacheRelevanceFilter()
    });
    
    for (const update of updates) {
      await this.applyServerUpdate(update);
    }
  }
  
  async resolveConflicts() {
    const conflicts = await db.sync_conflicts.toArray();
    
    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict);
      await this.applyResolution(conflict, resolution);
      await db.sync_conflicts.delete(conflict.conflict_id);
    }
  }
}
```

#### Conflict Resolution Strategies

```javascript
class ConflictResolver {
  async detectConflict(localRecord, serverRecord) {
    if (!localRecord || !serverRecord) return null;
    
    const localModified = new Date(localRecord.updated_at);
    const serverModified = new Date(serverRecord.updated_at);
    const lastSync = new Date(this.lastSyncTime);
    
    // Concurrent modification detection
    if (localModified > lastSync && serverModified > lastSync) {
      return {
        type: 'concurrent_modification',
        local_version: localRecord,
        server_version: serverRecord,
        detected_at: new Date(),
        entity_type: localRecord.constructor.name.toLowerCase(),
        entity_id: localRecord.id
      };
    }
    
    return null;
  }
  
  async resolveConflict(conflict) {
    switch (this.conflictResolution) {
      case 'server_wins':
        return {
          action: 'use_server',
          data: conflict.server_version
        };
        
      case 'client_wins':
        return {
          action: 'use_client',
          data: conflict.local_version
        };
        
      case 'merge':
        return {
          action: 'merge',
          data: await this.smartMerge(conflict)
        };
        
      case 'manual':
        return {
          action: 'request_user_input',
          data: conflict
        };
        
      default:
        throw new Error(`Unknown conflict resolution strategy: ${this.conflictResolution}`);
    }
  }
  
  async smartMerge(conflict) {
    const merged = {
      ...conflict.server_version,
      updated_at: new Date(),
      conflict_resolved: true,
      merge_strategy: 'smart_merge'
    };
    
    // Field-specific merge strategies
    if (conflict.local_version.title !== conflict.server_version.title) {
      merged.title = await this.chooseBestTitle(conflict);
    }
    
    if (conflict.local_version.custom_fields) {
      merged.custom_fields = {
        ...conflict.server_version.custom_fields,
        ...conflict.local_version.custom_fields
      };
    }
    
    return merged;
  }
}
```

---

## Application Layer Architecture

### MVVM Pattern Implementation

The application layer uses the Model-View-ViewModel (MVVM) pattern optimized for the hybrid offline-first + server architecture.

#### Enhanced ViewModels for Sync

```javascript
class EventViewModel {
  constructor() {
    this.events = observable([]);
    this.syncStatus = observable('idle'); // 'syncing', 'conflict', 'error', 'idle'
    this.offlineQueue = observable([]);
    this.lastSyncTime = observable(null);
  }
  
  async createEvent(eventData) {
    // Immediately add to local cache
    const localEvent = await EventModel.create(eventData);
    this.events.push(localEvent);
    
    // Queue for server sync
    await this.offlineQueue.add({
      operation: 'CREATE',
      entity_type: 'event',
      data: eventData,
      local_id: localEvent.event_id
    });
    
    // Attempt immediate sync if online
    if (navigator.onLine) {
      await this.syncToServer();
    }
    
    return localEvent;
  }
  
  async syncToServer() {
    this.syncStatus.set('syncing');
    
    try {
      const syncEngine = new SynchronizationEngine();
      await syncEngine.executeSync();
      
      this.syncStatus.set('idle');
      this.lastSyncTime.set(new Date());
      
    } catch (error) {
      this.syncStatus.set('error');
      console.error('Sync failed:', error);
    }
  }
  
  async handleConflict(conflict) {
    this.syncStatus.set('conflict');
    
    // Show conflict resolution UI
    const resolution = await this.showConflictResolutionDialog(conflict);
    
    // Apply resolution
    await this.applyConflictResolution(conflict, resolution);
    
    this.syncStatus.set('idle');
  }
}
```

#### Reactive State Management

```javascript
class StateManager {
  constructor() {
    this.state = reactive({
      user: null,
      workspace: {},
      syncStatus: 'idle',
      offlineMode: false,
      conflictQueue: [],
      notifications: []
    });
    
    // Auto-detect online/offline status
    window.addEventListener('online', () => {
      this.state.offlineMode = false;
      this.triggerSync();
    });
    
    window.addEventListener('offline', () => {
      this.state.offlineMode = true;
    });
  }
  
  async triggerSync() {
    if (!this.state.offlineMode) {
      await Promise.all([
        eventViewModel.syncToServer(),
        itemViewModel.syncToServer(),
        collectionViewModel.syncToServer()
      ]);
    }
  }
}
```

---

## Performance & Scalability

### Hybrid Performance Architecture

The system provides optimal performance at every scale through intelligent architecture decisions.

#### Client Performance (IndexedDB)

```javascript
// Performance metrics for client operations
const clientPerformance = {
  'Local queries (10K cache)': '1-5ms',
  'Compound index queries': '2-10ms', 
  'Full-text search (cached)': '5-20ms',
  'Offline operations': '<1ms (queued)',
  'UI responsiveness': '60fps consistent',
  'Memory usage': '50-150MB total',
  'Cache optimization': 'Auto-cleanup at 12K records'
};

// Example optimized query
async function getHighPriorityDueToday(userId) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  
  return db.events
    .where('[user_id+priority+due_date]')
    .between([userId, 4, today], [userId, 5, tomorrow])
    .toArray();
  // Performance: 2-5ms with 10K cached events
}
```

#### Server Performance (PostgreSQL)

```javascript
// Performance metrics for server operations  
const serverPerformance = {
  'Simple queries (1M records)': '10-50ms',
  'JSONB queries with GIN index': '20-100ms',
  'Full-text search': '50-200ms',
  'Complex analytics': '200ms-2s',
  'Concurrent users': '1000+ simultaneous',
  'Data throughput': '10K+ operations/minute',
  'Storage capacity': 'Unlimited (TB+ datasets)'
};

// Example server query optimization
const getEventsWithComplexFilter = `
  SELECT e.*, et.name as event_type_name
  FROM events e
  LEFT JOIN event_types et ON e.event_type_id = et.event_type_id
  WHERE e.user_id = $1
    AND e.priority >= $2
    AND e.due_date BETWEEN $3 AND $4
    AND e.custom_fields @> $5
    AND e.search_vector @@ plainto_tsquery($6)
  ORDER BY e.priority DESC, e.due_date ASC
  LIMIT $7;
`;
// Performance: 25-100ms with 1M+ records
```

#### Scalability Patterns

```javascript
class ScalabilityManager {
  constructor() {
    this.cacheLimits = {
      personal: 10000,      // 10K records
      team: 50000,          // 50K records  
      enterprise: 100000    // 100K records
    };
    
    this.syncStrategies = {
      personal: 'full_sync',
      team: 'relevance_based',
      enterprise: 'priority_based'
    };
  }
  
  async optimizeForScale(userType, dataSize) {
    const cacheLimit = this.cacheLimits[userType];
    const syncStrategy = this.syncStrategies[userType];
    
    if (dataSize > cacheLimit) {
      await this.enableIntelligentCaching(syncStrategy);
      await this.optimizeServerQueries();
      await this.enableBackgroundSync();
    }
  }
  
  async enableIntelligentCaching(strategy) {
    switch (strategy) {
      case 'relevance_based':
        await this.cacheByRelevanceScore();
        break;
      case 'priority_based':
        await this.cacheHighPriorityOnly();
        break;
      case 'full_sync':
      default:
        await this.cacheAllRecentData();
        break;
    }
  }
}
```

---

## Security & Multi-User Architecture

### Row-Level Security Implementation

```sql
-- Enable RLS on all user data tables
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

-- Basic user isolation policy
CREATE POLICY user_data_isolation ON events
FOR ALL USING (user_id = current_setting('app.current_user_id')::INTEGER);

-- Team collaboration policies
CREATE POLICY team_read_access ON events
FOR SELECT USING (
  user_id = current_setting('app.current_user_id')::INTEGER
  OR user_id IN (
    SELECT team_member_id FROM team_memberships 
    WHERE team_id = current_setting('app.current_team_id')::INTEGER
    AND member_id = current_setting('app.current_user_id')::INTEGER
  )
);

-- Hierarchical organization access
CREATE POLICY org_access ON events
FOR ALL USING (
  user_id = current_setting('app.current_user_id')::INTEGER
  OR EXISTS (
    SELECT 1 FROM organization_access oa
    WHERE oa.user_id = current_setting('app.current_user_id')::INTEGER
    AND oa.can_access_user_id = events.user_id
  )
);
```

### Authentication & Authorization

```javascript
class SecurityManager {
  constructor() {
    this.tokenStorage = new SecureTokenStorage();
    this.permissions = new PermissionManager();
  }
  
  async authenticateUser(credentials) {
    const response = await this.api.authenticate(credentials);
    
    if (response.success) {
      await this.tokenStorage.store(response.token);
      await this.permissions.loadUserPermissions(response.user);
      
      // Set database context for RLS
      await this.setDatabaseContext(response.user);
      
      return response.user;
    }
    
    throw new Error('Authentication failed');
  }
  
  async setDatabaseContext(user) {
    // Set PostgreSQL session variables for RLS
    await this.db.query('SET app.current_user_id = $1', [user.user_id]);
    
    if (user.current_team_id) {
      await this.db.query('SET app.current_team_id = $1', [user.current_team_id]);
    }
    
    if (user.organization_id) {
      await this.db.query('SET app.current_org_id = $1', [user.organization_id]);
    }
  }
  
  async enforcePermissions(operation, entityType, entityData) {
    const hasPermission = await this.permissions.check(
      operation, 
      entityType, 
      entityData
    );
    
    if (!hasPermission) {
      throw new Error(`Permission denied: ${operation} on ${entityType}`);
    }
  }
}
```

---

## Development Architecture

### Hybrid Development Environment

```javascript
// Development configuration
const developmentConfig = {
  client: {
    database: 'IndexedDB (local development)',
    server: 'Live-server on localhost:3000',
    sync: 'Mock server responses for offline development',
    debugging: 'Console logging + IndexedDB inspector'
  },
  
  server: {
    database: 'PostgreSQL (Docker container)',
    api: 'Express.js on localhost:3001', 
    authentication: 'JWT with development keys',
    debugging: 'PostgreSQL query logging + API request logging'
  },
  
  integration: {
    sync_testing: 'Automated conflict simulation',
    performance: 'Client + server benchmark suites',
    e2e: 'Full offline-to-online workflows'
  }
};
```

### Testing Strategy

```javascript
class TestingFramework {
  async runFullTestSuite() {
    // Client-only tests (offline development)
    await this.runClientTests();
    
    // Server-only tests (API + database)
    await this.runServerTests();
    
    // Integration tests (sync functionality)
    await this.runSyncTests();
    
    // Performance tests (both layers)
    await this.runPerformanceTests();
    
    // E2E tests (complete workflows)
    await this.runE2ETests();
  }
  
  async runSyncTests() {
    // Test conflict scenarios
    await this.testConcurrentModification();
    await this.testOfflineOperations();
    await this.testConflictResolution();
    await this.testDataConsistency();
    
    // Test performance under load
    await this.testLargeDatasetSync();
    await this.testMultiUserConflicts();
  }
}
```

---

## Deployment Architecture

### Production Infrastructure

```yaml
# docker-compose.production.yml
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: organizational_ecosystem
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"
    
  api_server:
    build: ./server
    environment:
      DATABASE_URL: postgres://app_user:secure_password@postgres:5432/organizational_ecosystem
      JWT_SECRET: production_jwt_secret
      NODE_ENV: production
    ports:
      - "3001:3001"
    depends_on:
      - postgres
    
  web_server:
    build: ./client
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl
    environment:
      API_URL: https://api.yourdomain.com
```

### Scaling Architecture

```javascript
const scalingStrategy = {
  horizontal_scaling: {
    load_balancer: 'Nginx with multiple API server instances',
    database: 'PostgreSQL read replicas for scaling reads',
    caching: 'Redis for session and query caching',
    cdn: 'CloudFlare for static asset delivery'
  },
  
  vertical_scaling: {
    database_optimization: 'Connection pooling + query optimization',
    server_resources: 'Auto-scaling based on CPU/memory usage',
    intelligent_caching: 'Dynamic cache sizing based on user count'
  },
  
  global_distribution: {
    multi_region: 'Regional PostgreSQL instances',
    edge_caching: 'CDN with intelligent cache invalidation',
    data_locality: 'User data stored in nearest region'
  }
};
```

---

## Future Platform Architecture

### Platform Evolution Strategy

```javascript
const platformRoadmap = {
  'v4.1_server_foundation': {
    timeline: 'Q2 2024',
    features: [
      'PostgreSQL server with identical schema',
      'RESTful API with authentication',
      'Bidirectional synchronization',
      'Basic multi-user support'
    ]
  },
  
  'v4.2_enterprise_features': {
    timeline: 'Q3 2024', 
    features: [
      'Advanced collaboration tools',
      'Real-time updates via WebSocket',
      'Enterprise security & compliance',
      'Advanced analytics & reporting'
    ]
  },
  
  'v5.0_platform_scale': {
    timeline: 'Q4 2024',
    features: [
      'Multi-tenant SaaS architecture',
      'Global deployment with edge caching',
      'AI integration for smart suggestions',
      'Plugin marketplace & ecosystem'
    ]
  }
};
```

---

## Conclusion

This hybrid system architecture provides the foundation for a **radically simple, infinitely extensible** organizational ecosystem that scales from personal productivity (1K records) to enterprise collaboration (1M+ records) while maintaining **complete offline functionality** and **sub-second performance**.

### Architectural Benefits Summary

1. **Hybrid Offline-First**: Complete functionality without server + unlimited server scale
2. **Identical Schemas**: Seamless sync between PostgreSQL and IndexedDB  
3. **Performance Optimized**: Real columns + JSONB for 10x query improvement
4. **Enterprise Ready**: Row-level security, multi-user collaboration, conflict resolution
5. **Future-Proof**: Architecture supports AI integration, global scale, and platform evolution

The **18-table design** achieves what traditional systems need 50+ tables to accomplish, while the **PostgreSQL + JSONB** approach provides both performance and flexibility for unlimited customization.

**Result: A productivity platform that works instantly offline and scales infinitely online.**

**Due:** {{event.due_date | date('MMM DD, YYYY')}}
**Priority:** {{event.custom_fields.priority | priority_label}}
**Location:** {{event.custom_fields.location | default("TBD")}}

## Description
{{event.description | default("No description provided")}}

## Time Remaining
{{event.time_until_due}}
```

---

## Simplified Relationship System

### Universal Linking (No Separate Tables)
The simplified relationship system uses the existing **links table** with string-based relationship types, eliminating the need for a separate relationship_types table while maintaining full functionality.

### Simplified Architecture
```sql
-- Existing links table handles all relationships
CREATE TABLE links (
    link_id SERIAL PRIMARY KEY,
    from_type VARCHAR(10) NOT NULL,
    from_id INTEGER NOT NULL,
    to_type VARCHAR(10) NOT NULL,
    to_id INTEGER NOT NULL,
    relationship_type VARCHAR(50) NOT NULL,  -- Simple string values
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Standard relationship vocabulary (no table needed)
-- 'depends_on', 'part_of', 'related_to', 'follows', 'requires', 'assigned_to'
```

### Usage Examples
```javascript
// Create relationships with simple strings
await Link.create({
    from_type: 'event', from_id: 123,
    to_type: 'event', to_id: 456,
    relationship_type: 'depends_on'
});

// Query relationships  
const dependencies = await Link.findByRelationship('event', 123, 'depends_on');
```

**Benefits**: Radical simplicity, no additional tables, infinite relationship types through configuration.

---

## Application Architecture

### MVVM Pattern Implementation

The application follows a strict Model-View-ViewModel (MVVM) architecture that separates concerns and enables sophisticated UI patterns.

#### Models (Data Access Layer)
```javascript
class EventModel {
    static async findByCollection(collectionId) {
        const collection = await db.collections.get(collectionId);
        return this.executeQuery(collection.filter_config);
    }
    
    static async findWithRelationships(eventId, relationshipType) {
        return db.links
            .where({from_type: 'event', from_id: eventId, relationship_type})
            .toArray();
    }
}
```

#### ViewModels (Business Logic Layer)
```javascript
class CollectionViewModel {
    constructor(collectionId) {
        this.collectionId = collectionId;
        this.filters = new ObservableFilters();
        this.results = new ObservableResults();
    }
    
    async applyFilter(filterConfig) {
        const cql = new CollectionQueryLanguage(filterConfig);
        this.results.update(await cql.execute());
    }
    
    async addToWorkspace(eventId) {
        await WorkspaceModel.pin(eventId);
        this.notifyWorkspaceUpdate();
    }
}
```

#### Views (UI Components)
```javascript
class CollectionView {
    constructor(viewModel) {
        this.viewModel = viewModel;
        this.bindEvents();
        this.observeChanges();
    }
    
    render() {
        return `
            <div class="collection-view">
                ${this.renderFilters()}
                ${this.renderResults()}
                ${this.renderActions()}
            </div>
        `;
    }
}
```

---

## UI Integration Architecture

### Workspace-Centric Design
The UI architecture centers around a persistent workspace that maintains user context across all application interactions.

#### Enhanced User Preferences
```sql
ALTER TABLE users ADD COLUMN workspace_config JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN view_preferences JSONB DEFAULT '{}';
ALTER TABLE users ADD COLUMN onboarding_state JSONB DEFAULT '{}';

-- Example workspace_config
{
  "pinned_events": [123, 456, 789],
  "active_collections": [1, 3, 7],
  "workspace_layout": "split-view",
  "default_view_mode": "list"
}

-- Example view_preferences  
{
  "events_view": {
    "columns": ["title", "due_date", "priority", "tags"],
    "sort_by": "due_date",
    "sort_order": "asc",
    "page_size": 25
  },
  "collections_view": {
    "display_mode": "grid",
    "show_counts": true
  }
}

-- Example onboarding_state
{
  "first_event_created": true,
  "first_collection_created": false,
  "views_tab_unlocked": true,
  "templates_introduced": false
}
```

#### Progressive Disclosure Logic
```javascript
class OnboardingManager {
    static shouldShowFeature(featureName) {
        const state = UserModel.getOnboardingState();
        return OnboardingRules[featureName](state);
    }
    
    static unlockFeature(featureName) {
        UserModel.updateOnboardingState({
            [featureName]: true
        });
        UINotifications.showFeatureUnlocked(featureName);
    }
}

const OnboardingRules = {
    collections_tab: (state) => state.first_event_created,
    templates_tab: (state) => state.first_collection_created,
    graph_view: (state) => state.collections_tab && state.events_count > 10
};
```

### Tabbed Navigation System
- **EVENTS** - Primary workspace with filtering, creation, and management
- **VAULT** - Collections, saved filters, and organizational structures  
- **TEMPLATES** - Content templates, automation rules, and customization

---

## File Synchronization System

### Bidirectional Markdown Sync
The file synchronization system enables seamless integration between structured database records and unstructured markdown files.

#### Entity Files Table
```sql
CREATE TABLE entity_files (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(10) NOT NULL CHECK (entity_type IN ('event', 'item')),
    entity_id INTEGER NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    last_markdown_sync TIMESTAMP,
    last_db_sync TIMESTAMP,
    sync_conflicts JSONB DEFAULT '{}',
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_entity_files_lookup ON entity_files(entity_type, entity_id);
CREATE INDEX idx_entity_files_user ON entity_files(user_id);
CREATE INDEX idx_entity_files_path ON entity_files(file_path);
```

#### Sync Architecture
```javascript
class FileSync {
    static async syncEntityToFile(entityType, entityId) {
        const entity = await this.getEntity(entityType, entityId);
        const template = await this.getTemplate(entity.type);
        const markdown = template.render(entity);
        
        await this.writeMarkdownFile(entity.file_path, markdown);
        await this.updateSyncTimestamp(entityType, entityId, 'last_db_sync');
    }
    
    static async syncFileToEntity(filePath) {
        const markdown = await this.readMarkdownFile(filePath);
        const entity = await this.parseMarkdown(markdown);
        
        await this.updateEntity(entity);
        await this.updateSyncTimestamp(entity.type, entity.id, 'last_markdown_sync');
    }
    
    static async detectConflicts() {
        return db.entity_files
            .where('last_markdown_sync')
            .below(db.entity_files.last_db_sync)
            .toArray();
    }
}
```

#### Conflict Resolution
- **Timestamp Comparison** - Detect when file and database are out of sync
- **Merge Strategies** - User-configurable conflict resolution rules
- **Version History** - Maintain change history for rollback capabilities
- **User Notification** - Alert users to conflicts with resolution options

---

## Performance & Scalability

### Indexing Strategy
```sql
-- Core performance indexes
CREATE INDEX idx_events_user_type ON events(user_id, event_type_id);
CREATE INDEX idx_events_due_date ON events(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_events_custom_fields ON events USING GIN (custom_fields);

-- Polymorphic relationship performance
CREATE INDEX idx_tag_assignments_lookup ON tag_assignments(taggable_type, taggable_id, tag_id);
CREATE INDEX idx_links_lookup ON links(from_type, from_id, relationship_type_id);

-- Collection query optimization
CREATE INDEX idx_events_status_priority ON events(status, (custom_fields->>'priority'));
CREATE INDEX idx_items_category ON items(item_type_id, (custom_fields->>'category'));

-- Field library performance
CREATE INDEX idx_field_library_category ON field_library(category, is_system) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_type_fields_type ON event_type_fields(event_type_id, sequence_order);
```

### Query Optimization Patterns
```javascript
// Efficient collection filtering
class CollectionQueryOptimizer {
    static optimizeQuery(filterConfig) {
        // Use compound indexes for common filter patterns
        if (filterConfig.hasUserAndType()) {
            return this.useUserTypeIndex(filterConfig);
        }
        
        // Leverage JSONB GIN indexes for custom fields
        if (filterConfig.hasCustomFieldFilters()) {
            return this.useJsonbIndex(filterConfig);
        }
        
        return this.buildStandardQuery(filterConfig);
    }
}
```

### Memory Management
- **Lazy Loading** - Load entity relationships on demand
- **Result Pagination** - Limit query results to prevent memory bloat
- **Cache Invalidation** - Smart cache invalidation based on entity relationships
- **IndexedDB Optimization** - Efficient use of browser storage APIs

---

## Security & Privacy

### Data Protection
- **Client-Side Encryption** - Sensitive data encrypted before storage
- **Session Management** - Secure session handling with automatic timeout
- **Audit Logging** - Comprehensive audit trail for all operations
- **Data Isolation** - User data strictly isolated in multi-tenant scenarios

### Privacy by Design
```javascript
class PrivacyManager {
    static async anonymizeUser(userId) {
        // Remove personally identifiable information
        await db.users.update(userId, {
            email: '[ANONYMIZED]',
            name: '[ANONYMIZED]',
            metadata: {}
        });
        
        // Maintain data relationships for analytics
        await this.updateAuditLogs(userId, 'USER_ANONYMIZED');
    }
    
    static async exportUserData(userId) {
        // Complete data export for GDPR compliance
        return {
            user: await db.users.get(userId),
            events: await db.events.where('user_id').equals(userId).toArray(),
            items: await db.items.where('user_id').equals(userId).toArray(),
            // ... all related data
        };
    }
}
```

---

## Development Strategy

### Implementation Phases

#### Phase 1: Core Foundation ✅ (Complete)
- [x] Database schema with 15 tables implemented
- [x] MVVM architecture with Models and ViewModels
- [x] Basic event and item management
- [x] Tagging and collection systems
- [x] Quick capture functionality

#### Phase 2: Enhanced Schema 🚀 (Next)
- [ ] Field Library System implementation
- [ ] Template Engine development
- [ ] Relationship Types system
- [ ] Enhanced user preferences
- [ ] File synchronization foundation

#### Phase 3: UI Integration 🔧 (Following)
- [ ] Tabbed navigation interface
- [ ] Collection dashboards
- [ ] Workspace management
- [ ] Progressive disclosure logic
- [ ] Template-driven content generation

#### Phase 4: Advanced Features 📋 (Future)
- [ ] Graph view implementation
- [ ] Advanced automation rules
- [ ] Collaboration features
- [ ] Mobile responsiveness
- [ ] Performance optimization

### Migration Strategy

#### Database Evolution
```javascript
class MigrationManager {
    static migrations = [
        {
            version: '2.0',
            description: 'Add Field Library System',
            up: async () => {
                await this.createTable('validation_types', validationTypesSchema);
                await this.createTable('field_library', fieldLibrarySchema);
                await this.createTable('event_type_fields', eventTypeFieldsSchema);
                await this.createTable('item_type_fields', itemTypeFieldsSchema);
            }
        },
        {
            version: '2.1', 
            description: 'Add Template Engine',
            up: async () => {
                await this.createTable('template_variables', templateVariablesSchema);
                await this.createTable('template_filters', templateFiltersSchema);
            }
        }
    ];
    
    static async runMigrations() {
        const currentVersion = await this.getCurrentSchemaVersion();
        const pendingMigrations = this.migrations.filter(m => m.version > currentVersion);
        
        for (const migration of pendingMigrations) {
            await migration.up();
            await this.updateSchemaVersion(migration.version);
        }
    }
}
```

---

## Future Roadmap

### Collaboration Features
- **Shared Collections** - Multi-user collections with permission management
- **Real-time Sync** - Live collaboration on events and files
- **Team Workspaces** - Organizational-level data management
- **Permission System** - Granular access control for shared resources

### Advanced Intelligence
- **Smart Suggestions** - AI-powered event type recommendations based on patterns
- **Predictive Automation** - Machine learning-driven routine optimization
- **Analytics Dashboard** - Usage patterns and productivity insights
- **Natural Language Processing** - Smart parsing of quick capture input

### Platform Expansion
- **Mobile Applications** - Native iOS/Android apps with offline sync
- **Browser Extensions** - Web clipper and quick capture tools
- **API Platform** - Third-party integrations and developer tools
- **Desktop Integration** - File system integration and native notifications

### Advanced Customization
- **Custom Field Types** - User-defined validation and UI components
- **Workflow Automation** - Complex business logic automation
- **Custom Views** - User-designed interface layouts
- **Plugin Architecture** - Extensible functionality through plugins

---

## Conclusion

This system architecture successfully balances the core principles of **clean, simple, and pure data structures** with the sophistication required for a comprehensive organizational ecosystem. The configuration-driven approach enables infinite user customization while maintaining architectural integrity.

**Key Architectural Wins:**

1. **Radical Simplicity** - 18 tables achieving infinite extensibility (vs 26 planned)
2. **Performance Optimized** - Real columns + strategic JSONB for sub-second queries
3. **UI-Integrated** - Database designed specifically to support sophisticated user interfaces
4. **DRY Architecture** - Single polymorphic systems eliminate duplication
5. **Future-Proof** - Architecture supports collaboration, AI, and platform expansion

The simplified schema with **Universal Field System**, **Embedded Templates**, and **File Synchronization** provides a robust foundation for building a next-generation productivity application that can scale from personal use to enterprise deployment without fundamental architectural changes.

**Final Schema Statistics:**
- **18 Production Tables** - Radically simple organizational ecosystem
- **30% Complexity Reduction** - Simplified from 26 to 18 tables while maintaining all functionality
- **10x Performance Boost** - Real columns for common fields vs pure JSONB approach
- **2-Table Field System** - Universal field definitions + polymorphic mapping
- **Embedded Templates** - No separate template engine tables needed

This architecture achieves the perfect balance: **maximum power through minimum complexity**. Users can create unlimited organizational modules through pure configuration, with sub-second query performance and a radically simple underlying architecture that maintains your core philosophies of clean, simple, pure data structures.




**-- GEMINI --**

.
├── [GEMINI.md](d:\Development Files\repositories\nodus\GEMINI.md)
├── docs
│   └── development
│       └── [GEMINI.md](d:\Development Files\repositories\nodus\docs\development\GEMINI.md)
├── src
│   ├── core
│   │   ├── database
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\database\GEMINI.md)
│   │   ├── models
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\models\GEMINI.md)
│   │   ├── utils
│   │   │   └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\utils\GEMINI.md)
│   │   └── viewmodels
│   │       └── [GEMINI.md](d:\Development Files\repositories\nodus\src\core\viewmodels\GEMINI.md)
│   └── ui
│       └── components
│           └── [GEMINI.md](d:\Development Files\repositories\nodus\src\ui\components\GEMINI.md)
└── tests
    └── [GEMINI.md](d:\Development Files\repositories\nodus\tests\GEMINI.md)

--- END OF FILE: docs/architecture/SYSTEM_ARCHITECTURE.md ---


--- START OF FILE: docs/development/GEMINI.md ---

# GEMINI.md Context Files Guide

This guide explains the purpose and structure of the `GEMINI.md` context files in this project. These files provide the AI agent with the necessary context to understand the project's architecture, coding patterns, and development guidelines.

## Table of Contents

- [GEMINI.md (Root)](#geminimd-root)
- [src/core/database/GEMINI.md](#srccoredatabasegeminimd)
- [src/core/models/GEMINI.md](#srccoremodelsgeminimd)
- [src/core/viewmodels/GEMINI.md](#srccoreviewmodelsgeminimd)
- [src/core/utils/GEMINI.md](#srccoreutilsgeminimd)
- [tests/GEMINI.md](#testsgeminimd)

---

## GEMINI.md (Root)

**Purpose**: This is the main context file for the project. It provides a high-level overview of the project's mission, architecture, and development patterns.

**AI Agent Usage**:

-   Understand the Event/Item paradigm.
-   Make project-wide architectural decisions.
-   Get guidance on the performance strategy.
-   Understand the technology stack.
-   Know the current development priorities.

**Related Context**:

-   [docs/development/GEMINI.md](docs/development/GEMINI.md) (this file)

---

## src/core/database/GEMINI.md

**Purpose**: This file provides context on the database schema, performance optimization, and data modeling.

**AI Agent Usage**:

-   Make schema design decisions.
-   Get guidance on query optimization.
-   Understand migration strategies.
-   Get recommendations on indexing.
-   Decide between JSONB and real columns.

**Related Context**:

-   [src/core/models/GEMINI.md](src/core/models/GEMINI.md)

---

## src/core/models/GEMINI.md

**Purpose**: This file provides context on data access patterns, CRUD operations, and model relationships.

**AI Agent Usage**:

-   Implement new models following the `BaseModel` and `BaseEntity` patterns.
-   Add validation logic to models.
-   Integrate with universal systems like tags and collections.
-   Design polymorphic relationships.
-   Write performance-optimized queries.

**Related Context**:

-   [src/core/database/GEMINI.md](src/core/database/GEMINI.md)
-   [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)

---

## src/core/viewmodels/GEMINI.md

**Purpose**: This file provides context on the MVVM patterns, business logic, and state management.

**AI Agent Usage**:

-   Implement business logic in ViewModels.
-   Use the `ObservableState` pattern for state management.
-   Parse natural language input.
-   Coordinate between Models and Views.
-   Implement error handling strategies.

**Related Context**:

-   [src/core/models/GEMINI.md](src/core/models/GEMINI.md)

---

## src/core/utils/GEMINI.md

**Purpose**: This file provides context on utility functions, helpers, and common algorithms.

**AI Agent Usage**:

-   Use date parsing algorithms.
-   Use string processing utilities.
-   Implement validation patterns.
-   Use the template engine.
-   Use performance utilities.

**Related Context**:

-   [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)

---

## tests/GEMINI.md

**Purpose**: This file provides context on testing strategies, patterns, and performance benchmarks.

**AI Agent Usage**:

-   Get guidance on the test structure.
-   Use performance testing patterns.
-   Validate cross-entity functionality.
-   Use mock data strategies.
-   Implement integration test patterns.

**Related Context**:

-   [src/core/models/GEMINI.md](src/core/models/GEMINI.md)
-   [src/core/viewmodels/GEMINI.md](src/core/viewmodels/GEMINI.md)

--- END OF FILE: docs/development/GEMINI.md ---


--- START OF FILE: src/core/database/schema.js ---

/**
 * Database Schema Definition
 *
 * This file defines the complete IndexedDB schema based on our PostgreSQL design.
 * It implements the core architectural principles:
 * - Events vs Items (Verbs vs Nouns)
 * - Polymorphic relationships for tags and links
 * - Schema-driven objects with custom fields
 * - Flat, searchable network over nested hierarchies
 */

const DB_SCHEMA = {
	version: 1,
	name: "ProductivityApp",

	stores: {
		// === FOUNDATIONAL LAYER ===

		users: {
			keyPath: "user_id",
			autoIncrement: true,
			indexes: {
				email: { unique: true },
				username: { unique: true },
			},
		},

		// Core Objects: The Verb/Noun Dichotomy
		events: {
			keyPath: "event_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				event_type_id: {},
				status: {},
				due_date: {},
				project_id: {},
				phase_id: {},
				assigned_to_id: {},
				created_at: {},
				updated_at: {},
				// Compound indexes for common queries
				"[user_id+status]": {},
				"[user_id+event_type_id]": {},
				"[user_id+due_date]": {},
			},
		},

		items: {
			keyPath: "item_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				item_type_id: {},
				name: {},
				created_at: {},
				updated_at: {},
				"[user_id+item_type_id]": {},
			},
		},

		// === TEMPLATING SYSTEM ===

		event_types: {
			keyPath: "event_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_system: {},
			},
		},

		item_types: {
			keyPath: "item_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_system: {},
			},
		},

		custom_fields: {
			keyPath: "field_id",
			autoIncrement: true,
			indexes: {
				object_type: {},
				object_id: {},
				field_name: {},
				"[object_type+object_id]": {},
			},
		},

		custom_field_values: {
			keyPath: "value_id",
			autoIncrement: true,
			indexes: {
				field_id: {},
				object_type: {},
				object_id: {},
				"[object_type+object_id]": {},
				"[field_id+object_id]": {},
			},
		},

		// === UNIVERSAL ORGANIZATION LAYER ===

		project_phases: {
			keyPath: "phase_id",
			autoIncrement: true,
			indexes: {
				project_event_id: {},
				sequence_order: {},
				"[project_event_id+sequence_order]": {},
			},
		},

		tags: {
			keyPath: "tag_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				tag_name: {},
				color: {},
				"[user_id+tag_name]": { unique: true },
			},
		},

		tag_assignments: {
			keyPath: "assignment_id",
			autoIncrement: true,
			indexes: {
				tag_id: {},
				taggable_type: {},
				taggable_id: {},
				"[taggable_type+taggable_id]": {},
				"[tag_id+taggable_type+taggable_id]": { unique: true },
			},
		},

		links: {
			keyPath: "link_id",
			autoIncrement: true,
			indexes: {
				from_type: {},
				from_id: {},
				to_type: {},
				to_id: {},
				relationship_type: {},
				"[from_type+from_id]": {},
				"[to_type+to_id]": {},
				"[from_type+from_id+to_type+to_id]": { unique: true },
			},
		},

		goals: {
			keyPath: "goal_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				target_date: {},
				is_active: {},
				"[user_id+is_active]": {},
			},
		},

		collections: {
			keyPath: "collection_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				is_active: {},
				"[user_id+is_active]": {},
			},
		},

		lists: {
			keyPath: "list_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				created_at: {},
				updated_at: {},
			},
		},

		// === AUDIT FRAMEWORK ===

		audit_logs: {
			keyPath: "log_id",
			autoIncrement: true,
			indexes: {
				actor_user_id: {},
				action_type: {},
				object_type: {},
				object_id: {},
				timestamp: {},
				"[actor_user_id+timestamp]": {},
				"[object_type+object_id]": {},
			},
		},

		operational_logs: {
			keyPath: "op_log_id",
			autoIncrement: true,
			indexes: {
				severity_level: {},
				timestamp: {},
				correlation_id: {},
			},
		},
	},
};

export { DB_SCHEMA };


--- END OF FILE: src/core/database/schema.js ---


--- START OF FILE: src/core/app.js ---

/**
 * Application Entry Point
 *
 * ONLY handles application initialization and coordination.
 * All UI logic has been moved to MainView following proper MVVM separation.
 */

import AppViewModel from "./viewmodels/app-vm.js";
import MainView from "../ui/views/main-view.js";
import CollectionViewModel from "./viewmodels/collection-vm.js"; // Import the new VM

class App {
	constructor() {
		this.appViewModel = null;
		this.mainView = null;
	}

	async initialize() {
		try {
			console.log("Initializing app...");

			// Create the main AppViewModel (which coordinates all child ViewModels)
			// We can instantiate all ViewModels here and pass them to the AppViewModel
			const eventViewModel = new AppViewModel().getEventViewModel(); // Keep existing logic for now
			const tagViewModel = new AppViewModel().getTagViewModel();
			const itemViewModel = new AppViewModel().getItemViewModel();
			this.appViewModel = new AppViewModel(
				eventViewModel,
				tagViewModel,
				itemViewModel,
				new CollectionViewModel()
			);

			// Initialize the app (database + all ViewModels)
			await this.appViewModel.initialize();

			console.log("Creating main view...");

			// Create the main view and bind it to the AppViewModel
			this.mainView = new MainView(this.appViewModel);

			// Initialize the view (UI bindings and listeners)
			this.mainView.initialize();

			console.log("App initialized successfully");
		} catch (error) {
			console.error("Failed to initialize app:", error);
			this.showError("Error: " + error.message);
		}
	}

	showError(message) {
		// Fallback error display if MainView isn't available
		const errorDiv = document.createElement("div");
		errorDiv.textContent = message;
		errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 20px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 1000;
            background: #f44336;
        `;
		document.body.appendChild(errorDiv);
	}

	// === GETTERS FOR DEBUGGING ===

	getAppViewModel() {
		return this.appViewModel;
	}

	getMainView() {
		return this.mainView;
	}

	// === CLEANUP ===

	destroy() {
		if (this.mainView) {
			this.mainView.destroy();
		}

		if (this.appViewModel) {
			// AppViewModel cleanup if needed
		}

		console.log("App destroyed");
	}
}

// Initialize the app when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
	const app = new App();
	app.initialize();

	// Make app globally available for debugging
	window.app = app;

	// Expose ViewModels for debugging (delegated to app)
	window.getAppVM = () => app.getAppViewModel();
	window.getEventVM = () => app.getAppViewModel()?.getEventViewModel();
	window.getTagVM = () => app.getAppViewModel()?.getTagViewModel();
	window.getItemVM = () => app.getAppViewModel()?.getItemViewModel();

	// Expose View for debugging
	window.getMainView = () => app.getMainView();
});


--- END OF FILE: src/core/app.js ---

