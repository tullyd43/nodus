# AI Project Context

This file is auto-generated to provide context to AI assistants. Do not edit it manually, as your changes will be overwritten.

Last updated: 2025-10-19T20:11:03.474Z

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
		"dev": "vite",
		"build": "vite build",
		"preview": "vite preview",
		"test": "jest",
		"lint": "eslint src/",
		"lint:fix": "eslint src/ --fix",
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
		"date-fns": "^2.30.0",
		"dexie": "^3.2.4",
		"orderedmap": "^2.1.1",
		"prosemirror-commands": "^1.7.1",
		"prosemirror-history": "^1.4.1",
		"prosemirror-keymap": "^1.2.3",
		"prosemirror-markdown": "^1.13.2",
		"prosemirror-model": "^1.25.3",
		"prosemirror-schema-basic": "^1.2.4",
		"prosemirror-schema-list": "^1.5.1",
		"prosemirror-state": "^1.4.3",
		"prosemirror-view": "^1.41.3"
	},
	"devDependencies": {
		"@babel/core": "^7.28.4",
		"@babel/preset-env": "^7.28.3",
		"@types/jest": "^29.5.3",
		"babel-jest": "^30.2.0",
		"eslint": "^8.57.1",
		"eslint-plugin-jsdoc": "^61.1.4",
		"husky": "^8.0.3",
		"jest": "^29.6.1",
		"terser": "^5.44.0",
		"vite": "^7.1.10"
	}
}


--- END OF FILE: package.json ---


--- START OF FILE: src/core/database/schema.js ---

/**
 * Database Schema Definition (v2)
 *
 * This schema is updated to align with the 19-table structure defined in:
 * /docs/architecture/DATABASE_SCHEMA.md
 *
 * This version introduces new tables for routines, lists, file sync, and more,
 * and standardizes naming conventions.
 */

const DB_SCHEMA = {
	version: 2,
	name: "OrganizationalEcosystem",

	stores: {
		// === CORE ENTITIES ===
		users: {
			keyPath: "user_id",
			autoIncrement: true,
			indexes: {
				username: { unique: true },
				email: { unique: true },
			},
		},
		events: {
			keyPath: "event_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				event_type_id: {},
				title: {},
				priority: {},
				budget: {},
				location: {},
				due_date: {},
				status: {},
			},
		},
		items: {
			keyPath: "item_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				item_type_id: {},
				name: {},
				quantity: {},
				value: {},
				location: {},
				status: {},
			},
		},

		// === TYPE SYSTEM ===
		event_types: {
			keyPath: "event_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
			},
		},
		item_types: {
			keyPath: "item_type_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
				category: {},
			},
		},

		// === UNIVERSAL FIELD SYSTEM ===
		field_definitions: {
			keyPath: "field_id",
			autoIncrement: true,
			indexes: {
				field_name: {},
				field_type: {},
				category: {},
			},
		},
		entity_fields: {
			keyPath: ["entity_type", "entity_id", "field_id"],
			autoIncrement: false,
			indexes: {
				entity_type: {},
				entity_id: {},
				field_id: {},
				sequence_order: {},
			},
		},

		// === UNIVERSAL SYSTEMS ===
		tags: {
			keyPath: "tag_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				"[user_id+name]": { unique: true },
			},
		},
		tag_assignments: {
			keyPath: ["taggable_type", "taggable_id", "tag_id"],
			autoIncrement: false,
			indexes: {
				tag_id: {},
				taggable_type: {},
				taggable_id: {},
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
			},
		},

		// === ORGANIZATION ===
		collections: {
			keyPath: "collection_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				name: {},
			},
		},
		lists: {
			keyPath: "list_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
			},
		},
		list_items: {
			keyPath: "list_item_id",
			autoIncrement: true,
			indexes: {
				list_id: {},
				text_content: {},
				linked_type: {},
				linked_id: {},
				sequence_order: {},
			},
		},

		// === ADVANCED FEATURES ===
		routines: {
			keyPath: "routine_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				title: {},
				event_type_id: {},
			},
		},
		routine_event_instances: {
			keyPath: "instance_id",
			autoIncrement: true,
			indexes: {
				routine_id: {},
				event_id: {},
				scheduled_date: {},
			},
		},

		// === FILE SYNC ===
		entity_files: {
			keyPath: "id",
			autoIncrement: true,
			indexes: {
				entity_type: {},
				entity_id: {},
				file_path: {},
				sync_status: {},
			},
		},

		// === INFRASTRUCTURE ===
		operation_logs: {
			keyPath: "log_id",
			autoIncrement: true,
			indexes: {
				user_id: {},
				operation_type: {},
				entity_type: {},
				entity_id: {},
				timestamp: {},
			},
		},
		deleted_entities: {
			keyPath: "deletion_id",
			autoIncrement: true,
			indexes: {
				entity_type: {},
				entity_id: {},
				entity_data: {},
				deleted_at: {},
			},
		},

		// === SYNC MANAGEMENT ===
		sync_queue: {
			keyPath: "sync_id",
			autoIncrement: true,
			indexes: {
				operation: {},
				entity_type: {},
				entity_id: {},
				created_at: {},
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

