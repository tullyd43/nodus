# Organizational Ecosystem API Documentation

**Version**: 4.0  
**Base URL**: `https://api.organizational-ecosystem.com/v1`  
**Protocol**: REST with JSON  
**Authentication**: JWT Bearer Tokens  

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Concepts](#core-concepts)
4. [Events API](#events-api)
5. [Items API](#items-api)
6. [Types & Templates](#types--templates)
7. [Universal Systems](#universal-systems)
8. [Collections & Lists](#collections--lists)
9. [Synchronization](#synchronization)
10. [File Management](#file-management)
11. [Search & Analytics](#search--analytics)
12. [Bulk Operations](#bulk-operations)
13. [Error Handling](#error-handling)
14. [Rate Limits & Performance](#rate-limits--performance)

---

## Overview

The Organizational Ecosystem API provides a comprehensive platform for managing events (verbs) and items (nouns) with unlimited customization through a universal field system. The API is built on PostgreSQL for enterprise scale with offline-first synchronization capabilities.

### Core Architecture Principles

- **Two-Type Purity**: Everything is either an Event (verb) or Item (noun)
- **Real Columns + JSONB**: Common fields as real columns for performance, custom fields in JSONB
- **Polymorphic Design**: Universal systems work across all entity types
- **Offline-First**: Complete functionality with bi-directional synchronization

### API Features

- ✅ Complete REST API with full CRUD operations
- ✅ Advanced queries with Collection Query Language (CQL)
- ✅ Batch operations for multi-entity create/update/delete
- ✅ File upload/download with attachment support
- ✅ JWT authentication with role-based permissions
- ✅ Rate limiting and performance monitoring
- ✅ Real-time synchronization with conflict resolution
- ✅ Auto-generated documentation with OpenAPI

---

## Authentication

### Overview

The API uses JWT (JSON Web Tokens) for authentication with role-based access control.

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "user_id": 1,
      "username": "johndoe",
      "email": "john@example.com",
      "subscription_tier": "free",
      "created_at": "2024-12-31T10:00:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2024-12-31T18:00:00Z"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

#### Refresh Token
```http
POST /api/auth/refresh
Authorization: Bearer {token}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

### Authorization Header

All protected endpoints require the JWT token in the Authorization header:

```http
Authorization: Bearer {your_jwt_token}
```

### User Profile

#### Get Current User Profile
```http
GET /api/auth/profile
Authorization: Bearer {token}
```

#### Update User Profile
```http
PUT /api/auth/profile
Authorization: Bearer {token}
Content-Type: application/json

{
  "workspace_config": {
    "theme": "dark",
    "default_view": "calendar"
  },
  "view_preferences": {
    "items_per_page": 25,
    "show_completed": false
  }
}
```

---

## Core Concepts

### Entity Types

The system recognizes two core entity types:

1. **Events** (Verbs): Actions, tasks, meetings, appointments, deadlines
2. **Items** (Nouns): People, places, things, documents, assets, inventory

### Field System

- **Real Columns**: Common fields (priority, due_date, budget, location) stored as real PostgreSQL columns for 10x query performance
- **Custom Fields**: Unlimited custom fields stored as JSONB with GIN indexing for fast queries
- **Field Definitions**: Reusable field schemas that can be assigned to entity types
- **Validation**: Type-safe validation with custom rules per field

### Universal Systems

- **Tags**: Polymorphic tagging system for all entities
- **Links**: Universal relationships between any entities
- **Collections**: Dynamic filtering with Collection Query Language (CQL)
- **Lists**: Hybrid text/linked entity lists

---

## Events API

### Overview

Events represent actions, tasks, meetings, and any time-bound activities. They support priorities, due dates, locations, budgets, and unlimited custom fields.

### List Events

```http
GET /api/events
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `status` (string): Filter by status (active, completed, cancelled, deferred)
- `priority` (integer): Filter by priority (1-5)
- `event_type_id` (integer): Filter by event type
- `due_date_from` (ISO date): Due date range start
- `due_date_to` (ISO date): Due date range end
- `sort` (string): Sort field (created_at, due_date, priority, title)
- `order` (string): Sort order (asc, desc)
- `search` (string): Full-text search across title and description
- `tags` (comma-separated): Filter by tag names
- `custom_fields` (JSON): Filter by custom field values

**Example:**
```http
GET /api/events?status=active&priority=5&sort=due_date&order=asc&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "event_id": 1,
        "user_id": 1,
        "event_type_id": 2,
        "title": "Complete API Documentation",
        "description": "Write comprehensive API docs for v4.0 release",
        "priority": 5,
        "budget": 500.00,
        "location": "Home Office",
        "due_date": "2024-12-31T17:00:00Z",
        "completed_date": null,
        "status": "active",
        "custom_fields": {
          "client": "Internal",
          "estimated_hours": 8,
          "complexity": "high"
        },
        "tags": [
          {
            "tag_id": 5,
            "tag_name": "documentation",
            "color": "#3498db"
          }
        ],
        "event_type": {
          "event_type_id": 2,
          "name": "Development Task",
          "icon": "code"
        },
        "created_at": "2024-12-30T10:00:00Z",
        "updated_at": "2024-12-31T08:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "per_page": 20,
      "total_items": 45,
      "total_pages": 3,
      "has_next": true,
      "has_prev": false
    }
  }
}
```

### Get Single Event

```http
GET /api/events/{event_id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "event": {
      "event_id": 1,
      "user_id": 1,
      "event_type_id": 2,
      "title": "Complete API Documentation",
      "description": "Write comprehensive API docs for v4.0 release",
      "priority": 5,
      "budget": 500.00,
      "location": "Home Office",
      "due_date": "2024-12-31T17:00:00Z",
      "completed_date": null,
      "status": "active",
      "custom_fields": {
        "client": "Internal",
        "estimated_hours": 8,
        "complexity": "high"
      },
      "tags": [...],
      "links": [...],
      "attachments": [...],
      "event_type": {...},
      "created_at": "2024-12-30T10:00:00Z",
      "updated_at": "2024-12-31T08:30:00Z"
    }
  }
}
```

### Create Event

```http
POST /api/events
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Team Meeting",
  "description": "Weekly team sync meeting",
  "event_type_id": 1,
  "priority": 3,
  "location": "Conference Room A",
  "due_date": "2024-12-31T14:00:00Z",
  "status": "active",
  "custom_fields": {
    "meeting_type": "sync",
    "attendees_count": 8,
    "agenda_items": ["Sprint review", "Next week planning"]
  },
  "tag_names": ["meeting", "team", "weekly"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "event": {
      "event_id": 123,
      "user_id": 1,
      "title": "Team Meeting",
      "description": "Weekly team sync meeting",
      // ... full event object
      "created_at": "2024-12-31T10:30:00Z",
      "updated_at": "2024-12-31T10:30:00Z"
    }
  }
}
```

### Update Event

```http
PUT /api/events/{event_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Updated Team Meeting",
  "priority": 4,
  "custom_fields": {
    "meeting_type": "sync",
    "attendees_count": 10,
    "agenda_items": ["Sprint review", "Next week planning", "Budget discussion"]
  }
}
```

### Complete Event

```http
PATCH /api/events/{event_id}/complete
Authorization: Bearer {token}
Content-Type: application/json

{
  "completed_date": "2024-12-31T15:30:00Z",
  "completion_notes": "Meeting went well, all topics covered"
}
```

### Delete Event (Soft Delete)

```http
DELETE /api/events/{event_id}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "message": "Event deleted successfully",
    "event_id": 123,
    "deleted_at": "2024-12-31T16:00:00Z"
  }
}
```

---

## Items API

### Overview

Items represent people, places, things, documents, assets, and inventory. They support quantities, values, locations, conditions, and unlimited custom fields.

### List Items

```http
GET /api/items
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `item_type_id` (integer): Filter by item type
- `name` (string): Filter by name (partial match)
- `location` (string): Filter by location
- `status` (string): Filter by status
- `quantity_min` (integer): Minimum quantity filter
- `quantity_max` (integer): Maximum quantity filter
- `value_min` (decimal): Minimum value filter
- `value_max` (decimal): Maximum value filter
- `condition` (string): Filter by condition
- `sort` (string): Sort field (name, created_at, value, quantity)
- `order` (string): Sort order (asc, desc)
- `search` (string): Full-text search
- `tags` (comma-separated): Filter by tag names

**Response Structure:** Similar to events API with item-specific fields

### Get Single Item

```http
GET /api/items/{item_id}
Authorization: Bearer {token}
```

### Create Item

```http
POST /api/items
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "MacBook Pro 16-inch",
  "description": "Primary development laptop",
  "item_type_id": 3,
  "quantity": 1,
  "value": 2499.00,
  "location": "Home Office",
  "condition": "excellent",
  "status": "active",
  "custom_fields": {
    "model": "M3 Max",
    "serial_number": "ABC123DEF456",
    "purchase_date": "2024-01-15",
    "warranty_expires": "2027-01-15",
    "specifications": {
      "ram": "32GB",
      "storage": "1TB SSD",
      "color": "Space Black"
    }
  },
  "tag_names": ["electronics", "computer", "work"]
}
```

### Update Item

```http
PUT /api/items/{item_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "location": "Office Desk",
  "condition": "good",
  "custom_fields": {
    "model": "M3 Max",
    "serial_number": "ABC123DEF456",
    "purchase_date": "2024-01-15",
    "warranty_expires": "2027-01-15",
    "last_maintenance": "2024-12-01",
    "specifications": {
      "ram": "32GB",
      "storage": "1TB SSD",
      "color": "Space Black"
    }
  }
}
```

### Delete Item (Soft Delete)

```http
DELETE /api/items/{item_id}
Authorization: Bearer {token}
```

---

## Types & Templates

### Overview

The type system provides templates and field definitions for both events and items, enabling consistent data structures and validation.

### Event Types

#### List Event Types

```http
GET /api/event-types
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "event_types": [
      {
        "event_type_id": 1,
        "name": "Meeting",
        "description": "Team meetings and appointments",
        "icon": "calendar",
        "color": "#3498db",
        "is_system": false,
        "template_fields": {
          "location": {
            "type": "string",
            "display_name": "Location",
            "required": true
          },
          "attendees": {
            "type": "array",
            "display_name": "Attendees",
            "required": false
          }
        },
        "default_values": {
          "priority": 3,
          "status": "active"
        },
        "validation_rules": {
          "title": {
            "required": true,
            "min_length": 3,
            "max_length": 255
          }
        },
        "created_at": "2024-12-01T10:00:00Z"
      }
    ]
  }
}
```

#### Create Event Type

```http
POST /api/event-types
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Project Milestone",
  "description": "Key project deliverables and checkpoints",
  "icon": "flag",
  "color": "#e74c3c",
  "template_fields": {
    "deliverables": {
      "type": "array",
      "display_name": "Deliverables",
      "required": true
    },
    "completion_criteria": {
      "type": "text",
      "display_name": "Completion Criteria",
      "required": true
    },
    "dependencies": {
      "type": "array",
      "display_name": "Dependencies",
      "required": false
    }
  },
  "default_values": {
    "priority": 5,
    "status": "active"
  },
  "validation_rules": {
    "title": {
      "required": true,
      "min_length": 5,
      "max_length": 100
    }
  }
}
```

### Item Types

#### List Item Types

```http
GET /api/item-types
Authorization: Bearer {token}
```

#### Create Item Type

```http
POST /api/item-types
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "Electronics",
  "description": "Electronic devices and equipment",
  "icon": "laptop",
  "color": "#9b59b6",
  "template_fields": {
    "brand": {
      "type": "string",
      "display_name": "Brand",
      "required": true
    },
    "model": {
      "type": "string",
      "display_name": "Model",
      "required": true
    },
    "serial_number": {
      "type": "string",
      "display_name": "Serial Number",
      "required": false
    },
    "purchase_date": {
      "type": "date",
      "display_name": "Purchase Date",
      "required": false
    },
    "warranty_expires": {
      "type": "date",
      "display_name": "Warranty Expiration",
      "required": false
    }
  },
  "default_values": {
    "condition": "new",
    "status": "active"
  },
  "validation_rules": {
    "name": {
      "required": true,
      "min_length": 2,
      "max_length": 255
    },
    "value": {
      "min": 0,
      "max": 999999.99
    }
  }
}
```

### Field Definitions

#### List Field Definitions

```http
GET /api/field-definitions
Authorization: Bearer {token}
```

**Query Parameters:**
- `entity_type` (string): Filter by entity type (event, item)
- `field_type` (string): Filter by field type (string, integer, decimal, date, boolean, array, object)
- `is_system` (boolean): Filter system vs custom fields

#### Create Field Definition

```http
POST /api/field-definitions
Authorization: Bearer {token}
Content-Type: application/json

{
  "field_name": "project_budget",
  "display_name": "Project Budget",
  "field_type": "decimal",
  "is_required": false,
  "default_value": 0.00,
  "validation_rules": {
    "min": 0,
    "max": 999999.99,
    "decimal_places": 2
  },
  "help_text": "Total budget allocated for this project",
  "placeholder": "Enter budget amount"
}
```

#### Assign Field to Type

```http
POST /api/entity-fields
Authorization: Bearer {token}
Content-Type: application/json

{
  "entity_type": "event",
  "entity_type_id": 5,
  "field_definition_id": 12,
  "is_required": true,
  "display_order": 3
}
```

---

## Universal Systems

### Tags

#### List Tags

```http
GET /api/tags
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "tag_id": 1,
        "tag_name": "urgent",
        "color": "#e74c3c",
        "description": "High priority items requiring immediate attention",
        "usage_count": 23,
        "created_at": "2024-12-01T10:00:00Z"
      }
    ]
  }
}
```

#### Create Tag

```http
POST /api/tags
Authorization: Bearer {token}
Content-Type: application/json

{
  "tag_name": "client-work",
  "color": "#3498db",
  "description": "Work related to client projects"
}
```

#### Assign Tag to Entity

```http
POST /api/tag-assignments
Authorization: Bearer {token}
Content-Type: application/json

{
  "tag_id": 5,
  "taggable_type": "event",
  "taggable_id": 123
}
```

#### Bulk Tag Assignment

```http
POST /api/tag-assignments/bulk
Authorization: Bearer {token}
Content-Type: application/json

{
  "tag_id": 5,
  "assignments": [
    {"taggable_type": "event", "taggable_id": 123},
    {"taggable_type": "event", "taggable_id": 124},
    {"taggable_type": "item", "taggable_id": 456}
  ]
}
```

### Links

#### List Links for Entity

```http
GET /api/links?source_type=event&source_id=123
Authorization: Bearer {token}
```

#### Create Link

```http
POST /api/links
Authorization: Bearer {token}
Content-Type: application/json

{
  "source_type": "event",
  "source_id": 123,
  "target_type": "item",
  "target_id": 456,
  "link_type": "uses",
  "description": "This event uses this equipment"
}
```

#### Update Link

```http
PUT /api/links/{link_id}
Authorization: Bearer {token}
Content-Type: application/json

{
  "link_type": "requires",
  "description": "This event requires this item to be completed"
}
```

#### Delete Link

```http
DELETE /api/links/{link_id}
Authorization: Bearer {token}
```

---

## Collections & Lists

### Collections

Collections provide dynamic filtering using Collection Query Language (CQL) for creating smart groups of entities.

#### List Collections

```http
GET /api/collections
Authorization: Bearer {token}
```

#### Create Collection

```http
POST /api/collections
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "High Priority Active Tasks",
  "description": "All active events with priority 4 or 5",
  "entity_type": "event",
  "filter_conditions": {
    "status": "active",
    "priority": {">=": 4}
  },
  "sort_order": [
    {"field": "due_date", "direction": "asc"},
    {"field": "priority", "direction": "desc"}
  ],
  "is_smart": true,
  "color": "#e74c3c"
}
```

#### Get Collection Items

```http
GET /api/collections/{collection_id}/items
Authorization: Bearer {token}
```

**Query Parameters:**
- `page` (integer): Page number
- `limit` (integer): Items per page
- `refresh` (boolean): Force refresh of smart collection

### Lists

Lists provide hybrid text/linked entity functionality for flexible organization.

#### List Lists

```http
GET /api/lists
Authorization: Bearer {token}
```

#### Create List

```http
POST /api/lists
Authorization: Bearer {token}
Content-Type: application/json

{
  "title": "Project Setup Checklist",
  "description": "Essential steps for new project initialization",
  "list_type": "checklist",
  "items": [
    {
      "content": "Create project repository",
      "is_checked": false,
      "sort_order": 1
    },
    {
      "content": "Set up development environment",
      "is_checked": false,
      "sort_order": 2,
      "linked_entity_type": "event",
      "linked_entity_id": 789
    }
  ]
}
```

#### Update List Items

```http
PUT /api/lists/{list_id}/items
Authorization: Bearer {token}
Content-Type: application/json

{
  "items": [
    {
      "list_item_id": 1,
      "content": "Create project repository",
      "is_checked": true,
      "sort_order": 1
    },
    {
      "content": "Configure CI/CD pipeline",
      "is_checked": false,
      "sort_order": 3
    }
  ]
}
```

---

## Synchronization

### Overview

The synchronization system enables offline-first functionality with bi-directional sync, conflict resolution, and operation queuing.

### Sync Status

```http
GET /api/sync/status
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "last_sync": "2024-12-31T10:30:00Z",
    "server_timestamp": "2024-12-31T11:00:00Z",
    "pending_operations": 5,
    "sync_conflicts": 1,
    "sync_enabled": true
  }
}
```

### Get Changes Since Last Sync

```http
GET /api/sync/changes
Authorization: Bearer {token}
```

**Query Parameters:**
- `since` (ISO timestamp): Get changes since this timestamp
- `entity_types` (comma-separated): Filter by entity types
- `limit` (integer): Maximum number of changes to return

**Response:**
```json
{
  "success": true,
  "data": {
    "changes": [
      {
        "operation_id": "srv_001",
        "operation_type": "UPDATE",
        "entity_type": "event",
        "entity_id": 123,
        "timestamp": "2024-12-31T10:45:00Z",
        "data": {
          "title": "Updated Event Title",
          "priority": 4
        },
        "version": 3
      }
    ],
    "sync_timestamp": "2024-12-31T11:00:00Z",
    "has_more": false
  }
}
```

### Apply Client Operations

```http
POST /api/sync/apply
Authorization: Bearer {token}
Content-Type: application/json

{
  "operations": [
    {
      "client_operation_id": "client_001",
      "operation_type": "CREATE",
      "entity_type": "event",
      "temporary_id": "temp_123",
      "data": {
        "title": "New Event from Client",
        "priority": 3,
        "due_date": "2024-12-31T17:00:00Z"
      },
      "timestamp": "2024-12-31T10:30:00Z"
    },
    {
      "client_operation_id": "client_002",
      "operation_type": "UPDATE",
      "entity_type": "event",
      "entity_id": 456,
      "data": {
        "status": "completed",
        "completed_date": "2024-12-31T10:35:00Z"
      },
      "timestamp": "2024-12-31T10:35:00Z",
      "expected_version": 2
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "client_operation_id": "client_001",
        "success": true,
        "entity_id": 789,
        "temporary_id": "temp_123",
        "version": 1
      },
      {
        "client_operation_id": "client_002",
        "success": false,
        "conflict": {
          "type": "version_mismatch",
          "expected_version": 2,
          "current_version": 3,
          "server_data": {
            "title": "Server Updated Title",
            "status": "active",
            "updated_at": "2024-12-31T10:40:00Z"
          }
        }
      }
    ],
    "sync_timestamp": "2024-12-31T11:00:00Z"
  }
}
```

### Resolve Conflicts

```http
POST /api/sync/resolve-conflicts
Authorization: Bearer {token}
Content-Type: application/json

{
  "resolutions": [
    {
      "client_operation_id": "client_002",
      "resolution": "use_server",
      "merged_data": {
        "title": "Server Updated Title",
        "status": "completed",
        "completed_date": "2024-12-31T10:35:00Z"
      }
    }
  ]
}
```

---

## File Management

### Overview

File management supports attachments to any entity, with sync capabilities for markdown files and document export/import.

### Upload File

```http
POST /api/files/upload
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- file: (file) The file to upload
- entity_type: (string) Entity type (event, item, etc.)
- entity_id: (integer) Entity ID
- description: (string) Optional description
```

**Response:**
```json
{
  "success": true,
  "data": {
    "attachment": {
      "attachment_id": 123,
      "filename": "project-requirements.pdf",
      "original_filename": "Project Requirements v2.pdf",
      "mime_type": "application/pdf",
      "file_size": 2457600,
      "entity_type": "event",
      "entity_id": 456,
      "description": "Project requirements document",
      "url": "https://api.organizational-ecosystem.com/v1/files/123/download",
      "created_at": "2024-12-31T11:00:00Z"
    }
  }
}
```

### Download File

```http
GET /api/files/{attachment_id}/download
Authorization: Bearer {token}
```

### List Attachments

```http
GET /api/files/attachments
Authorization: Bearer {token}
```

**Query Parameters:**
- `entity_type` (string): Filter by entity type
- `entity_id` (integer): Filter by entity ID
- `mime_type` (string): Filter by MIME type

### Delete Attachment

```http
DELETE /api/files/{attachment_id}
Authorization: Bearer {token}
```

### Export Entity to Markdown

```http
GET /api/files/export/{entity_type}/{entity_id}
Authorization: Bearer {token}
```

**Query Parameters:**
- `format` (string): Export format (markdown, json, csv)
- `include_attachments` (boolean): Include attachment links

### Import from Markdown

```http
POST /api/files/import
Authorization: Bearer {token}
Content-Type: multipart/form-data

Form Data:
- file: (file) Markdown file to import
- entity_type: (string) Target entity type
- merge_strategy: (string) How to handle conflicts (replace, merge, skip)
```

---

## Search & Analytics

### Full-Text Search

#### Global Search

```http
POST /api/search
Authorization: Bearer {token}
Content-Type: application/json

{
  "query": "project management",
  "entity_types": ["event", "item"],
  "filters": {
    "priority": {">=": 3},
    "created_at": {">": "2024-12-01T00:00:00Z"}
  },
  "limit": 50,
  "offset": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "entity_type": "event",
        "entity_id": 123,
        "score": 0.95,
        "title": "Project Management Review",
        "description": "Monthly review of project management processes",
        "highlights": [
          "Monthly review of <em>project management</em> processes"
        ],
        "matched_fields": ["title", "description"]
      }
    ],
    "total_results": 45,
    "search_time_ms": 23,
    "facets": {
      "entity_type": {
        "event": 30,
        "item": 15
      },
      "priority": {
        "5": 12,
        "4": 18,
        "3": 15
      }
    }
  }
}
```

#### Search Suggestions

```http
GET /api/search/suggestions
Authorization: Bearer {token}
```

**Query Parameters:**
- `q` (string): Partial query for autocomplete
- `limit` (integer): Maximum suggestions to return

### Analytics

#### Dashboard Statistics

```http
GET /api/analytics/dashboard
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "total_events": 234,
      "active_events": 45,
      "completed_events": 189,
      "overdue_events": 5,
      "total_items": 567,
      "total_value": 45678.90
    },
    "trends": {
      "events_created_last_30_days": [
        {"date": "2024-12-01", "count": 5},
        {"date": "2024-12-02", "count": 3}
      ],
      "completion_rate_last_30_days": 0.85
    },
    "top_tags": [
      {"tag_name": "work", "usage_count": 89},
      {"tag_name": "personal", "usage_count": 67}
    ],
    "priority_distribution": {
      "1": 45,
      "2": 67,
      "3": 89,
      "4": 23,
      "5": 10
    }
  }
}
```

#### Custom Analytics Query

```http
POST /api/analytics/query
Authorization: Bearer {token}
Content-Type: application/json

{
  "entity_type": "event",
  "metrics": ["count", "avg_priority"],
  "dimensions": ["status", "event_type_id"],
  "filters": {
    "created_at": {">": "2024-11-01T00:00:00Z"}
  },
  "group_by": ["status"],
  "order_by": [{"field": "count", "direction": "desc"}]
}
```

---

## Bulk Operations

### Bulk Create

```http
POST /api/bulk/create
Authorization: Bearer {token}
Content-Type: application/json

{
  "entity_type": "event",
  "entities": [
    {
      "title": "Event 1",
      "priority": 3,
      "due_date": "2024-12-31T17:00:00Z"
    },
    {
      "title": "Event 2",
      "priority": 4,
      "due_date": "2025-01-15T12:00:00Z"
    }
  ],
  "options": {
    "continue_on_error": true,
    "return_created": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "created_count": 2,
    "failed_count": 0,
    "results": [
      {
        "index": 0,
        "success": true,
        "entity_id": 789,
        "entity": {...}
      },
      {
        "index": 1,
        "success": true,
        "entity_id": 790,
        "entity": {...}
      }
    ]
  }
}
```

### Bulk Update

```http
PUT /api/bulk/update
Authorization: Bearer {token}
Content-Type: application/json

{
  "entity_type": "event",
  "updates": [
    {
      "entity_id": 123,
      "data": {"status": "completed"}
    },
    {
      "entity_id": 124,
      "data": {"priority": 5}
    }
  ],
  "options": {
    "continue_on_error": true
  }
}
```

### Bulk Delete

```http
DELETE /api/bulk/delete
Authorization: Bearer {token}
Content-Type: application/json

{
  "entity_type": "event",
  "entity_ids": [123, 124, 125],
  "options": {
    "soft_delete": true,
    "continue_on_error": false
  }
}
```

### Bulk Tag Operations

```http
POST /api/bulk/tag
Authorization: Bearer {token}
Content-Type: application/json

{
  "action": "add",
  "tag_id": 5,
  "entities": [
    {"entity_type": "event", "entity_id": 123},
    {"entity_type": "event", "entity_id": 124},
    {"entity_type": "item", "entity_id": 456}
  ]
}
```

---

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request data is invalid",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      },
      {
        "field": "priority",
        "message": "Priority must be between 1 and 5"
      }
    ],
    "request_id": "req_123456789"
  }
}
```

### HTTP Status Codes

- **200 OK**: Successful request
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Resource conflict (sync conflicts, duplicate data)
- **422 Unprocessable Entity**: Valid JSON but semantic errors
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error

### Error Codes

- `VALIDATION_ERROR`: Request validation failed
- `AUTHENTICATION_ERROR`: Invalid or expired token
- `PERMISSION_DENIED`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Requested resource not found
- `DUPLICATE_RESOURCE`: Resource already exists
- `SYNC_CONFLICT`: Synchronization conflict detected
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `FILE_SIZE_EXCEEDED`: File too large
- `INVALID_FILE_TYPE`: Unsupported file type
- `INTERNAL_ERROR`: Server error

---

## Rate Limits & Performance

### Rate Limits

- **Authentication Endpoints**: 5 requests per minute per IP
- **General API**: 1000 requests per hour per user
- **File Upload**: 10 requests per minute per user
- **Search**: 100 requests per minute per user
- **Bulk Operations**: 10 requests per minute per user

### Performance Headers

All responses include performance headers:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
X-Response-Time: 45ms
X-Server-ID: server-03
```

### Pagination

All list endpoints support pagination:

**Request:**
```http
GET /api/events?page=2&limit=50
```

**Response Headers:**
```http
X-Total-Count: 234
X-Page-Count: 5
Link: <https://api.example.com/v1/events?page=1&limit=50>; rel="first",
      <https://api.example.com/v1/events?page=3&limit=50>; rel="next",
      <https://api.example.com/v1/events?page=5&limit=50>; rel="last"
```

### Caching

- **Static Resources**: 1 year cache
- **Entity Data**: 5 minutes cache with ETag support
- **Search Results**: 1 minute cache
- **User Profile**: 15 minutes cache

### Performance Optimization Tips

1. Use sparse fieldsets: `?fields=event_id,title,due_date`
2. Batch operations when possible
3. Use collections for repeated queries
4. Leverage full-text search for complex filtering
5. Use pagination for large result sets
6. Cache frequently accessed data on client side

---

## Webhooks & Events

### Configure Webhook

```http
POST /api/webhooks
Authorization: Bearer {token}
Content-Type: application/json

{
  "url": "https://your-app.com/webhooks/org-ecosystem",
  "events": ["event.created", "event.updated", "event.completed"],
  "secret": "your-webhook-secret",
  "active": true
}
```

### Webhook Events

- `event.created` - Event created
- `event.updated` - Event updated
- `event.completed` - Event marked as completed
- `event.deleted` - Event deleted
- `item.created` - Item created
- `item.updated` - Item updated
- `item.deleted` - Item deleted
- `sync.conflict` - Synchronization conflict detected

### Webhook Payload

```json
{
  "event": "event.created",
  "timestamp": "2024-12-31T11:00:00Z",
  "data": {
    "event_id": 123,
    "user_id": 1,
    "title": "New Event",
    "created_at": "2024-12-31T11:00:00Z"
  },
  "user": {
    "user_id": 1,
    "username": "johndoe"
  }
}
```

---

## OpenAPI Specification

The complete OpenAPI (Swagger) specification is available at:

```
GET /api/docs/openapi.json
GET /api/docs/swagger-ui
```

This provides interactive documentation with the ability to test endpoints directly in your browser.

---

## SDKs & Libraries

Official SDKs are available for:

- **JavaScript/TypeScript**: `@org-ecosystem/js-sdk`
- **Python**: `org-ecosystem-python`
- **PHP**: `org-ecosystem/php-sdk`
- **Go**: `github.com/org-ecosystem/go-sdk`

Community SDKs:

- **Ruby**: `org_ecosystem_ruby`
- **Java**: `org-ecosystem-java`

---

## Support & Resources

- **API Documentation**: https://docs.organizational-ecosystem.com
- **Developer Portal**: https://developers.organizational-ecosystem.com
- **Support**: support@organizational-ecosystem.com
- **Status Page**: https://status.organizational-ecosystem.com
- **GitHub**: https://github.com/organizational-ecosystem
- **Community**: https://community.organizational-ecosystem.com

---

*This documentation is for API version 4.0. For previous versions, see the [version history](https://docs.organizational-ecosystem.com/versions).*
