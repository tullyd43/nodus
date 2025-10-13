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