/**
 * Unit Tests for FieldDefinitionModel
 *
 * This test suite verifies the functionality of the FieldDefinitionModel, ensuring that
 * creating, assigning, and querying typed custom fields works as expected.
 */

import FieldDefinitionModel from '../../../src/core/models/field-definition.js';
import EventModel from '../../../src/core/models/event.js';
import appDb from '../../../src/core/database/db.js';

describe('FieldDefinitionModel', () => {
    let fieldDefModel;
    let eventModel;

    // Use a single instance for all tests in this suite
    beforeAll(() => {
        fieldDefModel = new FieldDefinitionModel();
        eventModel = new EventModel();
    });

    // Clean the database before each test to ensure isolation
    beforeEach(async () => {
        await appDb.custom_field_values.clear();
        await appDb.field_definitions.clear();
        await appDb.events.clear();
    });

    // Close the database connection after all tests are done
    afterAll(async () => {
        await appDb.close();
    });

    describe('create()', () => {
        it('should create a new field definition', async () => {
            const fieldData = {
                name: 'Priority',
                field_type: 'integer',
                validation_rules: { min: 1, max: 5 },
            };
            const fieldId = await fieldDefModel.create(fieldData);
            const field = await fieldDefModel.getById(fieldId);

            expect(field).toBeDefined();
            expect(field.field_id).toBe(fieldId);
            expect(field.name).toBe('Priority');
            expect(field.field_type).toBe('integer');
            expect(field.validation_rules).toEqual({ min: 1, max: 5 });
        });

        it('should throw an error for invalid field types', async () => {
            const fieldData = { name: 'Invalid', field_type: 'bad_type' };
            await expect(fieldDefModel.create(fieldData)).rejects.toThrow('Invalid field type: bad_type');
        });
    });

    describe('assignValue() and getFieldsForEntity()', () => {
        let testEvent;
        let priorityFieldId;
        let budgetFieldId;

        beforeEach(async () => {
            // Create a dummy event to assign fields to
            testEvent = await eventModel.create({ title: 'Test Event', content: '...' });

            // Create some field definitions
            priorityFieldId = await fieldDefModel.create({ name: 'Priority', field_type: 'integer', validation_rules: { min: 1, max: 5 } });
            budgetFieldId = await fieldDefModel.create({ name: 'Budget', field_type: 'decimal' });
        });

        it('should assign and retrieve a typed value for an entity', async () => {
            // Assign a value
            await fieldDefModel.assignValue('event', testEvent.event_id, priorityFieldId, 4);

            // Retrieve the fields for that entity
            const fields = await fieldDefModel.getFieldsForEntity('event', testEvent.event_id);

            expect(fields).toHaveLength(1);
            const priorityField = fields[0];

            expect(priorityField.name).toBe('Priority');
            expect(priorityField.field_type).toBe('integer');
            expect(priorityField.value).toBe(4); // Should be a number, not a string
        });

        it('should update an existing value (upsert)', async () => {
            // Assign initial value
            await fieldDefModel.assignValue('event', testEvent.event_id, budgetFieldId, 100.50);
            let fields = await fieldDefModel.getFieldsForEntity('event', testEvent.event_id);
            expect(fields[0].value).toBe(100.50);

            // Assign a new value to the same field
            await fieldDefModel.assignValue('event', testEvent.event_id, budgetFieldId, 250.75);
            fields = await fieldDefModel.getFieldsForEntity('event', testEvent.event_id);

            expect(fields).toHaveLength(1); // Should still be only one field
            expect(fields[0].value).toBe(250.75);
        });

        it('should handle multiple custom fields for one entity', async () => {
            await fieldDefModel.assignValue('event', testEvent.event_id, priorityFieldId, 5);
            await fieldDefModel.assignValue('event', testEvent.event_id, budgetFieldId, 5000);

            const fields = await fieldDefModel.getFieldsForEntity('event', testEvent.event_id);

            expect(fields).toHaveLength(2);
            const priority = fields.find(f => f.name === 'Priority');
            const budget = fields.find(f => f.name === 'Budget');

            expect(priority.value).toBe(5);
            expect(budget.value).toBe(5000);
        });
    });

    describe('castValueToType()', () => {
        it('should cast and validate integers correctly', () => {
            const rules = { min: 1, max: 10 };
            expect(fieldDefModel.castValueToType('5', 'integer', rules)).toBe(5);
            expect(() => fieldDefModel.castValueToType('11', 'integer', rules)).toThrow('exceeds maximum');
            expect(() => fieldDefModel.castValueToType('0', 'integer', rules)).toThrow('below minimum');
            expect(() => fieldDefModel.castValueToType('abc', 'integer', rules)).toThrow('not a valid integer');
        });

        it('should cast decimals correctly', () => {
            expect(fieldDefModel.castValueToType('123.45', 'decimal')).toBe(123.45);
        });

        it('should cast booleans correctly', () => {
            expect(fieldDefModel.castValueToType(true, 'boolean')).toBe(true);
            expect(fieldDefModel.castValueToType('true', 'boolean')).toBe(true);
            expect(fieldDefModel.castValueToType(1, 'boolean')).toBe(true);
            expect(fieldDefModel.castValueToType(false, 'boolean')).toBe(false);
            expect(fieldDefModel.castValueToType('false', 'boolean')).toBe(false);
        });

        it('should validate enums correctly', () => {
            const rules = { options: ['todo', 'in-progress', 'done'] };
            expect(fieldDefModel.castValueToType('done', 'enum', rules)).toBe('done');
            expect(() => fieldDefModel.castValueToType('invalid', 'enum', rules)).toThrow('not in the allowed options');
        });
    });

    describe('delete()', () => {
        it('should delete a field definition and all its associated values', async () => {
            // Arrange: Create a definition and assign it to two different events
            const fieldId = await fieldDefModel.create({ name: 'Status', field_type: 'enum', validation_rules: { options: ['A', 'B'] } });
            const event1 = await eventModel.create({ title: 'Event 1', content: '...' });
            const event2 = await eventModel.create({ title: 'Event 2', content: '...' });
            await fieldDefModel.assignValue('event', event1.event_id, fieldId, 'A');
            await fieldDefModel.assignValue('event', event2.event_id, fieldId, 'B');

            // Check that values exist
            let values = await appDb.custom_field_values.where({ field_id: fieldId }).toArray();
            expect(values).toHaveLength(2);

            // Act: Delete the field definition
            await fieldDefModel.delete(fieldId);

            // Assert: The definition and all its values should be gone
            const definition = await fieldDefModel.getById(fieldId);
            expect(definition).toBeUndefined();

            values = await appDb.custom_field_values.where({ field_id: fieldId }).toArray();
            expect(values).toHaveLength(0);
        });
    });
});
