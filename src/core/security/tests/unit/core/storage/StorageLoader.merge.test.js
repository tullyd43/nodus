// tests/unit/core/storage/StorageLoader.merge.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { StorageLoader } from "@core/storage/StorageLoader.js";

describe("StorageLoader - _mergePolyRows", () => {
	let storageInstance;

	beforeEach(async () => {
		// We need an instance of the inner ModularOfflineStorage class to test its method.
		// We can get this by creating a StorageLoader and then creating a storage instance.
		const loader = new StorageLoader({ demoMode: true });
		storageInstance = await loader.createStorage();
	});

	test("should return null if rows array is empty or not an array", () => {
		expect(storageInstance._mergePolyRows([])).toBeNull();
		expect(storageInstance._mergePolyRows(null)).toBeNull();
		expect(storageInstance._mergePolyRows(undefined)).toBeNull();
	});

	test("should correctly merge two rows with distinct instance_data", () => {
		const rows = [
			{
				id: "logical-1-public",
				logical_id: "logical-1",
				classification_level: "unclassified",
				instance_data: { title: "Public Title", status: "active" },
			},
			{
				id: "logical-1-secret",
				logical_id: "logical-1",
				classification_level: "secret",
				instance_data: { content: "Secret content" },
			},
		];

		const merged = storageInstance._mergePolyRows(rows);

		// Base properties should come from the highest classification row ('secret')
		expect(merged.id).toBe("logical-1-secret");
		expect(merged.classification_level).toBe("secret");

		// instance_data should be a deep merge
		expect(merged.instance_data).toEqual({
			title: "Public Title",
			status: "active",
			content: "Secret content",
		});
	});

	test("should prioritize higher classification for overlapping instance_data keys", () => {
		const rows = [
			{
				id: "logical-2-unclassified",
				logical_id: "logical-2",
				classification_level: "unclassified",
				instance_data: {
					title: "Old Title",
					description: "Public description",
				},
			},
			{
				id: "logical-2-confidential",
				logical_id: "logical-2",
				classification_level: "confidential",
				instance_data: {
					title: "Confidential Title", // This should win
					details: { confidential: true },
				},
			},
		];

		const merged = storageInstance._mergePolyRows(rows);

		expect(merged.instance_data.title).toBe("Confidential Title");
		expect(merged.instance_data.description).toBe("Public description");
		expect(merged.instance_data.details).toEqual({ confidential: true });
	});

	test("should perform a deep merge on nested objects", () => {
		const rows = [
			{
				id: "logical-3-unclassified",
				logical_id: "logical-3",
				classification_level: "unclassified",
				instance_data: {
					meta: { author: "public-user", created: "2023-01-01" },
				},
			},
			{
				id: "logical-3-secret",
				logical_id: "logical-3",
				classification_level: "secret",
				instance_data: {
					meta: { reviewed_by: "secret-user" },
					content: "Secret content",
				},
			},
		];

		const merged = storageInstance._mergePolyRows(rows);

		expect(merged.instance_data.content).toBe("Secret content");
		expect(merged.instance_data.meta).toEqual({
			author: "public-user",
			created: "2023-01-01",
			reviewed_by: "secret-user",
		});
	});

	test("should handle rows with missing or empty instance_data", () => {
		const rows = [
			{
				id: "logical-4-unclassified",
				logical_id: "logical-4",
				classification_level: "unclassified",
				instance_data: { title: "Public Title" },
			},
			{
				id: "logical-4-secret",
				logical_id: "logical-4",
				classification_level: "secret",
				// No instance_data
			},
		];

		const merged = storageInstance._mergePolyRows(rows);

		expect(merged.id).toBe("logical-4-secret");
		expect(merged.instance_data).toEqual({
			title: "Public Title",
		});
	});
});
