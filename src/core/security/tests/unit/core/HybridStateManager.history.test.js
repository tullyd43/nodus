// tests/unit/core/HybridStateManager.history.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { HybridStateManager } from "@core/HybridStateManager.js";
import { StorageLoader } from "@core/storage/StorageLoader.js";

// Mock the StorageLoader to control its behavior for tests
vi.mock("@core/storage/StorageLoader.js");

describe("HybridStateManager - Entity History", () => {
	let hsm;
	let mockStorageInstance;

	beforeEach(async () => {
		// Create a fresh mock storage instance for each test
		mockStorageInstance = {
			getHistory: vi.fn(),
			init: vi.fn().mockResolvedValue(true),
			// Stub other methods that might be called during initialization
			put: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
			getAll: vi.fn(),
		};

		// Configure the mocked StorageLoader to return our mock instance
		StorageLoader.prototype.createStorage = vi
			.fn()
			.mockResolvedValue(mockStorageInstance);
		StorageLoader.prototype.init = vi.fn().mockResolvedValue(true);

		// Instantiate HybridStateManager
		hsm = new HybridStateManager({ demoMode: true });

		// Initialize HSM, which will create and use our mocked storage
		await hsm.initialize({
			userId: "test-user",
			clearanceLevel: "secret",
		});
	});

	test("getEntityHistory should call storage.getHistory with correct parameters", async () => {
		const logicalId = "logical-uuid-123";
		const mockHistory = [
			{
				id: `${logicalId}-secret`,
				logical_id: logicalId,
				classification_level: "secret",
				updated_at: "2023-10-27T10:00:00Z",
				instance_data: { content: "Top secret version" },
			},
		];

		// Setup the mock return value
		mockStorageInstance.getHistory.mockResolvedValue(mockHistory);

		// Call the method we are testing
		await hsm.getEntityHistory(logicalId);

		// Assert that the underlying storage method was called correctly
		expect(mockStorageInstance.getHistory).toHaveBeenCalledOnce();
		expect(mockStorageInstance.getHistory).toHaveBeenCalledWith(
			"objects_polyinstantiated",
			logicalId
		);
	});

	test("getEntityHistory should return the history from the storage instance", async () => {
		const logicalId = "logical-uuid-456";
		const mockHistory = [
			{ id: `${logicalId}-secret`, instance_data: { a: 1 } },
			{ id: `${logicalId}-public`, instance_data: { b: 2 } },
		];
		mockStorageInstance.getHistory.mockResolvedValue(mockHistory);

		const history = await hsm.getEntityHistory(logicalId);

		// Assert that the method returns the data provided by the mock
		expect(history).toEqual(mockHistory);
		expect(history.length).toBe(2);
	});

	test("getEntityHistory should throw if storage is not ready", async () => {
		hsm.storage.ready = false; // Manually set storage to not ready
		const logicalId = "logical-uuid-789";

		await expect(hsm.getEntityHistory(logicalId)).rejects.toThrow(
			"Storage system not initialized"
		);
	});
});
