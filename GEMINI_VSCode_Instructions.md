# Gemini Code Assist Agent - VSCode Instructions

## When Code Implementation is Needed

Use these instructions when the Gemini Code Assist Agent (or any AI code generation) needs to implement features for the Organizational Ecosystem project.

---

## 1. Pre-Implementation Context

### Load Project Context Files
Before starting ANY code generation, ensure Gemini has access to:

```bash
# Add these files to Gemini's context:
- GEMINI.md (root - project overview)
- src/core/database/GEMINI.md (database patterns)
- src/core/models/GEMINI.md (model patterns)
- src/core/viewmodels/GEMINI.md (business logic patterns)
- src/core/utils/GEMINI.md (utility patterns)
- docs/architecture/SYSTEM_ARCHITECTURE.md (full architecture)
- docs/development/UI_UX_SPECIFICATION.md (UI requirements)
- DEVELOPMENT_GUIDE.md (implementation patterns)
```

**Gemini VSCode Integration**: Copy these into the context window or use the `#file` command to reference them.

### Critical Context Points
Before implementing, ensure Gemini understands:

1. **Event/Item Paradigm**: Everything is either an Event (action) or Item (asset)
2. **Universal Systems**: Tags, Links, Collections, Fields work across all entities
3. **MVVM Pattern**: Models → ViewModels → Components (strict separation)
4. **Database Layer**: Dexie (IndexedDB) with performance-optimized schema
5. **No Libraries for Core**: Build core features, not UI library integrations

---

## 2. Implementation Workflow

### Phase Identification
First, identify which development phase the task belongs to:

- **Phase 1**: Database schema, Dexie setup, migrations
- **Phase 2**: Universal systems (Tags, Links, Collections, Fields)
- **Phase 3**: Event & Item models with validation
- **Phase 4**: Advanced features (Parser, Templates, Routines)
- **Phase 5**: UI components and views
- **Phase 6**: Multi-user, offline-sync, authentication

**Gemini Instruction**:
```
"Before implementing, tell me which phase this belongs to and 
what dependencies must already exist. If dependencies are missing, 
stop and list them clearly."
```

### Dependency Checking
**Always verify dependencies before coding**:

```javascript
// Example dependency check prompt:
"I'm implementing [Feature]. These are the dependencies:
1. [System X] - Required for [reason]
2. [System Y] - Required for [reason]

Are all these systems already implemented? If any are missing, 
stop and list exactly which systems need to be built first."
```

### File Structure Adherence
Gemini must place code in correct locations:

```
src/
  core/
    database/       → All database/Dexie code
    models/         → BaseModel, Entity classes, validation
    viewmodels/     → Business logic, state management
    utils/          → Helpers, parsing, algorithms
  views/
    components/     → Web Components, UI pieces
    pages/          → Full page layouts
  styles/          → CSS (minimal; use Web Components scoped styles)
tests/
  unit/            → Model & ViewModel tests
  integration/     → Cross-system tests
  performance/     → Query performance tests
```

---

## 3. Code Generation Prompts

### Template for Feature Implementation

```markdown
**Task**: Implement [Feature Name]

**Context**:
- Phase: [X]
- Depends on: [Systems]
- Part of: [Module]

**Specific Requirements**:
- [Requirement 1 from architecture]
- [Requirement 2 from UI spec]
- [Requirement 3 from MVVM pattern]

**What I need**:
1. [Specific file 1] with [specific functionality]
2. [Specific file 2] with [specific functionality]
3. Tests for [specific behavior]

**Constraints**:
- Must follow [pattern] from DEVELOPMENT_GUIDE.md
- Must use [specific API] from [system]
- Must NOT use [library/approach] because [reason]

**Questions before implementing**:
1. Does [dependency] exist?
2. Should [choice A] or [choice B]?
3. Performance target: [X records] in [Y milliseconds]?
```

### Database Implementation Prompt

```markdown
**Database Feature**: [Feature Name]

**Required Context Files**:
- src/core/database/GEMINI.md
- docs/DATABASE_SCHEMA.md (current schema reference)

**Implementation**:
1. Add schema changes to [table names]
   - New columns: [list with types]
   - Indexes needed: [list]
   - Migration required: [yes/no - what from what]

2. Create model class extending BaseModel
   - Validation rules: [list]
   - Custom getters: [list]
   - Query methods: [list with expected performance]

3. Performance targets:
   - Query [X] records: < 50ms
   - Batch insert [Y] records: < 200ms
   - Full-text search [Z] records: < 100ms

4. Test with [record count] records
```

### ViewModel Implementation Prompt

```markdown
**Business Logic Feature**: [Feature Name]

**Required Context Files**:
- src/core/viewmodels/GEMINI.md
- src/core/models/GEMINI.md

**ViewModel Responsibilities**:
1. State management for: [what state?]
2. User input parsing: [what input?]
3. Data validation: [what rules?]
4. Error handling: [what scenarios?]

**Observable State**:
```javascript
observableState = {
  loading: false,
  data: [],
  error: null,
  // ... add specific state fields
}
```

5. Implement methods:
   - [method 1]: Should [do what?]
   - [method 2]: Should [do what?]
   - Error scenarios: [list]

6. Tests should verify:
   - [behavior 1]
   - [behavior 2]
   - Error handling for [scenario]
```

### UI Component Implementation Prompt

```markdown
**UI Component**: [Component Name]

**Required Context Files**:
- docs/development/UI_UX_SPECIFICATION.md
- DEVELOPMENT_GUIDE.md (BaseComponent pattern)

**Component Purpose**: [What does this do?]

**Visual Requirements**:
- Appears in: [location in UI]
- States: [list states: loading, empty, filled, error]
- Responsive: [mobile/tablet/desktop requirements]

**Data Flow**:
- Receives from ViewModel: [what data?]
- Emits events: [what events?]
- User actions: [what interactions?]

**Accessibility**:
- Keyboard: [required shortcuts]
- Screen reader: [required labels]
- Mobile: [required interactions]

**Implementation**:
1. Extend BaseComponent
2. State structure: [define state]
3. ViewModel connection: [which ViewModel?]
4. Template: [structure HTML/slots]
5. Styles: [scoped CSS only, no global]
6. Event binding: [what listeners?]
```

---

## 4. Code Quality Standards

### Before Code Generation Complete

**Always request**:

```markdown
"Before you finish, confirm:
1. ✅ All GEMINI.md patterns followed
2. ✅ Dependencies documented at top of file
3. ✅ JSDoc comments on all public methods
4. ✅ Test file created with [X] test cases
5. ✅ No console.logs in production code
6. ✅ No magic numbers (all constants named)
7. ✅ Error handling for all async operations
8. ✅ Performance meets targets: [list targets]
9. ✅ Follows naming conventions: [describe]
10. ✅ Related documentation updated (GEMINI.md, JSDoc)"
```

### Documentation Requirements

Every code file must include:

```javascript
/**
 * @file [filename]
 * @description [What this file does]
 * @dependencies 
 *   - [System 1]: Used for [reason]
 *   - [System 2]: Used for [reason]
 * @pattern [MVVM/Model/Util - what pattern does this follow?]
 * @author Gemini Code Assist Agent
 * @date [YYYY-MM-DD]
 */
```

### Testing Requirements

**Minimum test coverage**:

- Models: 90% coverage (validation, mutations, queries)
- ViewModels: 85% coverage (state changes, user input)
- Utils: 95% coverage (edge cases, error paths)
- Components: 70% coverage (rendering, interactions, events)

**Request test template**:

```markdown
"Create tests with:
1. Happy path: [scenario]
2. Edge cases: [list cases]
3. Error scenarios: [list scenarios]
4. Performance validation: [what should be fast?]
5. Integration tests: [what systems interact?]

Use test framework: [Jest/Vitest]
Mock strategy: [what to mock?]
Test data: [use fixtures from tests/GEMINI.md]"
```

---

## 5. Post-Implementation

### Code Review Checklist for Gemini Output

Before committing, verify:

- [ ] Code matches GEMINI.md patterns exactly
- [ ] Dependencies are correct and documented
- [ ] No circular dependencies
- [ ] Performance validated against targets
- [ ] Tests all passing (> minimum coverage %)
- [ ] No breaking changes to existing APIs
- [ ] Database migrations (if applicable) are reversible
- [ ] Documentation updated (JSDoc, GEMINI.md references)
- [ ] Follows naming conventions consistently
- [ ] Error handling complete
- [ ] Linting passes (ESLint config in project)

### Git Commit Strategy

**Request specific commit format**:

```markdown
"After code is complete, create a git commit with:

Type: feat/fix/refactor
Scope: [which system/phase?]
Message: [specific change]
Body: [why this change, what patterns followed]
Footer: Relates to Phase [X]

Example:
feat(models): add Event model with validation
- Extends BaseModel with event-specific validation
- Implements polymorphic relationship with Items
- Includes tag and link integration
- Follows MVVM pattern from DEVELOPMENT_GUIDE
Relates to Phase 3"
```

### Documentation Sync

**After code is complete, Gemini should**:

1. Update related GEMINI.md files with new patterns/APIs
2. Add usage examples to relevant documentation
3. Update DEVELOPMENT_GUIDE.md if new patterns introduced
4. Generate JSDoc and verify it renders correctly

**Request documentation update**:

```markdown
"Update documentation:
1. src/core/[module]/GEMINI.md - Add [what?] to the AI Agent Usage section
2. DEVELOPMENT_GUIDE.md - Add usage example
3. Add JSDoc to new public methods
4. Update any related context files"
```

---

## 6. Common Gemini Pitfalls to Avoid

### ❌ Pitfall 1: Ignoring Phase Dependencies
**Wrong**: Implementing Event model before Universal Systems exist
**Right**: Check GEMINI.md → confirm Phase 2 complete before Phase 3

### ❌ Pitfall 2: Using Random Libraries
**Wrong**: "I'll use editor-js for the editor component"
**Right**: "I'll extend BaseComponent and implement custom markdown editor"

### ❌ Pitfall 3: Breaking MVVM Pattern
**Wrong**: Data mutations in Component code
**Right**: All state changes through ViewModel, Components just render

### ❌ Pitfall 4: Ignoring Database Schema
**Wrong**: Adding columns without migrations
**Right**: Update schema, create migration, update GEMINI.md

### ❌ Pitfall 5: Missing Error Handling
**Wrong**: Assuming all async operations succeed
**Right**: Try/catch all async, ViewModel state for error display

---

## 7. Integration with Your Workflow

### Manual Review Loop

**Recommended workflow**:

1. **You**: Describe feature to Gemini using templates above
2. **Gemini**: Proposes implementation, asks clarification questions
3. **You**: Review code structure (before detailed implementation)
4. **Gemini**: Implements with your feedback
5. **You**: Review final code against checklist
6. **System**: Runs tests, validates performance
7. **Git**: Commit with proper messaging

### Continuous Documentation Update

**Gemini should automatically**:

```bash
# After each implementation
npm run docs:generate-ai-context
npm run docs:update-gemini-context
git add docs/ **/GEMINI.md
git commit -m "docs: update AI context after [feature] implementation"
```

---

## 8. Performance Validation

### Before Gemini Completes Implementation

**Request performance tests**:

```markdown
"Create performance tests that validate:

1. Database queries:
   - Query [X] records: < [Yms]
   - Full-text search: < [Zms]
   
2. ViewModel operations:
   - State updates: < 16ms
   - Batch operations: < [Xms]
   
3. Component rendering:
   - Initial render: < 100ms
   - Re-render: < 16ms
   - List with 1000 items: < 200ms

Test with:
- [number] records in database
- Memory usage not exceeding [limit]
- No memory leaks detected"
```

---

## 9. Quick Reference: What to Ask Gemini

### ✅ Good Questions
- "Implement Event model following Phase 3 requirements from GEMINI.md"
- "Create EventViewModel that manages: [state], [mutations], [errors]"
- "Build EventList component that displays [data] and handles [interactions]"
- "Add database migration to add [column] to [table]"
- "Write tests for [feature] covering [scenarios]"

### ❌ Bad Questions
- "Build me an editor" (too vague, no context)
- "Add this library" (might break architecture)
- "Implement everything" (too large, hard to review)
- "Make it fast" (no specific targets)
- "Just fix the error" (missing context)

---

## Summary

**Before every Gemini implementation**:
1. ✅ Load GEMINI.md context files
2. ✅ Identify which phase and dependencies
3. ✅ Use template prompts for specificity
4. ✅ Verify code patterns against DEVELOPMENT_GUIDE
5. ✅ Run tests and performance checks
6. ✅ Update documentation
7. ✅ Review against code quality checklist
8. ✅ Commit with proper messaging

**Result**: Clean, consistent code that integrates seamlessly with your architecture.
