# UI/UX Specification
*Final Interface Design and User Experience Patterns*

## Core Navigation Structure

### Tabbed Architecture
```
┌─────────────────────────────────────────────┐
│ [Files & Data] [Views] [Config]             │ ← Horizontal tabs
├─────────────────────────────────────────────┤
│                                             │
│           Tab-specific content              │
│                                             │
└─────────────────────────────────────────────┘
```

**Default Tab:** Files & Data
- New users start here (data ownership principle)
- No forced abstractions until user creates collections
- Direct access to markdown files

**Tab Behavior:**
- Tabs do not interact with each other
- Each maintains independent context
- No forced tab switching
- **Tab visibility:** Views tab hidden until first collection created
- **Minimal tab design** with + button to add more available tabs

### Tab Management
**Progressive Tab Visibility:**
- **Files & Data:** Always visible (default)
- **Views:** Appears after first collection created
- **Config:** Always available
- **Additional tabs:** Can be added via + button (minimal design)

### Workspace/Staging Implementation

**Location:** Below tabs in navigation (persistent across all tabs)
```
┌─────────────────────────────┐
│ [Files & Data] [Views] [Config] │
├─────────────────────────────┤
│ 🔧 Workspace (3) ▼         │ ← Always visible
│   📌 project-notes.md      │ ← Pinned files
│   📌 Health collection     │ ← Pinned collections  
│   📝 New draft (pending)   │ ← Pending review
├─────────────────────────────┤
│ Files ▼                    │
│   notes/                   │
│   projects/                │
├─────────────────────────────┤
│ Quick Capture              │
└─────────────────────────────┘
```

**Workspace Features:**
- **Drag expandable interface**
- **Unlimited general items**, 5 pinned items maximum
- **Header with collapse button**
- **Two subsections:**
  - Global Pending (review items)
  - Workspace (pinned items)
- **Persistent across sessions**
- **Saved workspace support** (implemented as Collections)

**Adding to Workspace:**
- **Drag & drop** from any tab
- **Right-click** context menu "Pin to workspace"
- **Pin button** on files/collections

## Tab Specifications

### Files & Data Tab (Default)

**Sidebar:**
- Workspace section (persistent)
- Files tree (expandable, all markdown content)
- Quick capture (bottom, persistent)

**Main Area Default:** Split editor/preview OR editor/graph
- Left: Markdown editor
- Right: Rendered preview OR graph view
- **Graph view option:** Click nodes to view, option to navigate
- **Tabbed split editor:** Can switch between preview/graph in right pane
- **User preference options:**
  - Card view + editor
  - Graph view + editor  
  - Tabbed main area (editor/preview/graph)

**New User Experience:**
- Welcome note in editor
- Preview showing rendered result
- Guide/onboarding content in preview pane

### Views Tab
**Appears after:** User creates first collection
**Contains:**
- Today view
- Collections (Health, Work, Finance, etc.)
- Goals and routines
- Custom filters

**Collection Click Behavior:**
- Opens customizable dashboard/workspace for that collection
- Shows filtered list of Events/Items related to that collection
- Customizable layouts (future: define dashboard layout options)

**Collection Creation:**
- **In-context creation** in Views tab (not modal)
- **Filter creator component** appears below existing collections
- **Template-first approach** - Start with premade templates (Health, Work, Custom)
- **Filter hierarchy:** Event Types + Item Types (parallel, equal) → Custom Field filters
- **Live preview** shows what would be included as filters are defined
- **Logical progression:** Choose template → Refine types → Add field filters → Save & name

### Config Tab  
**Contains:**
- Event types and custom fields
- Tags management
- System settings
- Import/export tools

## Data Architecture Integration

### Core Data Model
**Parallel Data Types:** Events and Items are equal, parallel data types
- **Events:** Actions, occurrences, tasks, projects, notes
- **Items:** Physical/digital assets, inventory, resources
- **Equal status:** Neither sits above the other - both are first-class citizens
- **Universal linking:** Events and Items can link to each other freely

### File-to-Event Relationship
**Principle:** Every Event/Item has corresponding markdown file

**Implementation:**
- User creates Event in structured editor → markdown file auto-generated
- User edits markdown file → structured data extracted and stored
- Templates created in markdown → available in structured forms
- **Bidirectional sync** maintains both representations

**User Understanding:**
- Files & Data tab = raw data ownership
- Views tab = structured interface
- Both views represent same underlying data

**Key Point:** All markdown goes in Files & Data tab for data ownership. When users create Events in structured editor, system automatically creates markdown file AND captures structured data for database storage.

### Workspace Management

**Saved Workspaces:**
- Implemented as special Collections
- Can be tagged, filtered, shared
- Leverage existing architecture
- User can switch between: "Project Alpha", "Health Review", "Weekly Planning"

**Workspace Types:**
- **General items:** Unlimited
- **Pinned items:** Maximum 5
- **Workspace saving:** Optional feature for power users

**Adding to Workspace:**
- **Drag & drop** from any tab
- **Right-click** context menu "Pin to workspace"
- **Pin button** on files/collections

## Progressive Disclosure Pattern

**Level 1 (New Users):**
- Only Files & Data tab visible
- Direct file editing interface
- Workspace for pending review items

**Level 2 (Collections Created):**
- Views tab appears
- Can still default to Files & Data
- Workspace supports pinned collections

**Level 3 (Power Users):**
- All tabs available
- Can set Views as default
- Complex workspace management
- Multiple saved workspaces

## Design Principles

### Data Ownership First
- Files & Data tab prioritized over abstractions
- All content exportable as markdown
- User controls file organization
- Raw data always accessible

### Persistent Workspace
- Reduces navigation friction
- Maintains "mental desktop" concept
- Works across all tabs consistently
- Saves user's working context

### User Preference Support
- Customizable default tab
- Configurable main area layout
- Personal workspace organization
- Flexible interface adaptation

### Bidirectional Data Flow
- Markdown files ↔ Structured data
- Templates in markdown format
- Full account regeneration from files possible
- User can view/modify at any level

## Implementation Notes

### Quick Capture
- **Location:** Bottom of sidebar (persistent)
- **Behavior:** Always visible, never blocked
- **Expansion:** 1-5 line textarea, grows upward as needed
- **Context:** Draft text maintained across navigation
- **Future features:** NLP parsing, smart suggestions (not current priority)

### Search Strategy
- **Primary:** Global search across all content
- **Local prioritization:** Current tab/collection content appears first in results
- **Context awareness:** When in Health collection, health-related items rank higher
- **Universal access:** Search works from any tab or context

### Mobile Strategy
- **Navigation:** Hamburger menu contains tabs and workspace
- **Workspace adaptation:** Consider "Recent/Pinned" section optimized for mobile
- **Responsive design:** Desktop workspace may need mobile-specific treatment

### File Organization
- **Primary:** Tags + bidirectional links (flat structure)
- **Optional:** Manual folders (like Obsidian)
- **Display:** Tree shows both folder hierarchy AND tag filtering

### Default States
- **App open:** Files & Data tab
- **New user:** Welcome note in editor, preview on right
- **Empty selection:** Editor with guide content
- **Session persistence:** Remembers last active tab and workspace contents

### View Modes & Persistence
**Available Views:** List, Timeline, Kanban, Card (context-specific)
**View Controls:** Located wherever different view types are available
**View Persistence:** Each context remembers its preferred view mode
**Contextual Availability:** Some locations may have one view, others all views

### Performance & Scale Considerations
**Large datasets:** Pagination with preloaded next page
**List rendering:** Virtualized lists for 1000+ items
**Collection management:** Efficient handling of dozens of collections
**Search optimization:** Fast global search with local prioritization

### Accessibility & Power User Features
**Keyboard shortcuts:** Planned for tab switching, quick capture focus, workspace pinning
**Import/Migration:** Support for external data conversion to system syntax
**Template library:** Premade templates for collections, Event Types, Item Types, custom fields
**Field library:** Reusable custom field definitions

## Development Notes

### Implementation Priority
1. **Tab structure** (foundation for everything)
2. **Workspace positioning** (persistent navigation element)  
3. **Files & Data default behavior** (editor/preview/graph setup)
4. **Collection dashboard framework** (customizable layouts)
5. **Filter creator component** (template-first approach)
6. **Search implementation** (global with local prioritization)

### Future Implementation
- **Mobile responsive design** (hamburger navigation)
- **Keyboard shortcuts** (power user accessibility)
- **Performance optimizations** (virtualization, pagination)
- **Import/export tools** (data migration support)

---

*This specification captures all finalized UI/UX decisions made during design discussions. Updates should be made here as interface evolves.*