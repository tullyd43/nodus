/**
 * DateUtils-Nodus.test.js
 *
 * Integration tests for the Nodus-specific DateUtils classes using a Jest-like syntax.
 *
 * @jest-environment jsdom
 * To run: `npx jest`
 */

import { describe, expect, it } from "@jest/globals";

import { NodusDateIntegration } from "../DateUtils-Nodus.js";
import {
	DateCore,
	DateFormat,
	DateTesting,
	DateValidation,
} from "../DateUtils.js";

describe("Nodus DateUtils Integration", () => {
	// Mock security manager for testing
	const mockSecurityManager = {
		async canAccess(classification, compartments) {
			return classification !== "top_secret"; // Simulate limited access
		},
		getCurrentUserId() {
			return "test-user-123";
		},
	};

	const mockOrgContext = {
		organizationId: "test-org-456",
		policies: { compliance: true },
	};

	describe("Critical Fixes", () => {
		it("should format toDateTimeLocal with the correct local timezone", () => {
			const testDate = new Date("2024-03-15T15:30:00.000Z");
			const localDateTime = DateFormat.toDateTimeLocal(testDate);
			const utcDateTime = DateFormat.toDateTimeUTC(testDate);

			// This test assumes the execution environment is not in UTC.
			expect(localDateTime).not.toEqual(utcDateTime);
		});

		it("should reject invalid ISO dates with strict parsing", () => {
			const invalidDates = [
				"2025-02-30T12:00:00.000Z", // Feb 30th
				"2025-13-01T12:00:00.000Z", // 13th month
				"2025-01-01T24:00:00.000Z", // Hour 24
			];

			invalidDates.forEach((invalidDate) => {
				expect(DateValidation.isValidISO(invalidDate)).toBe(false);
			});
		});

		it("should respect cache bounds and evict LRU items", () => {
			DateValidation.clearCache();
			const initialStats = DateValidation.getCacheStats();
			const cacheSize = initialStats.maxSize;

			// Fill cache beyond its limit
			for (let i = 0; i < cacheSize + 50; i++) {
				DateValidation.isValidISO(
					`2024-01-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`
				);
			}

			const finalStats = DateValidation.getCacheStats();
			expect(finalStats.size).toBeLessThanOrEqual(cacheSize);
			expect(finalStats.evictions).toBeGreaterThan(0);
		});
	});

	describe("Enterprise Features", () => {
		it("should format timestamps with reduced precision for high classifications", () => {
			const testDate = new Date("2024-03-15T14:30:00.000Z");
			const publicFormat = DateFormat.formatForClassification(
				testDate,
				"public",
				{ includeTime: true }
			);
			const secretFormat = DateFormat.formatForClassification(
				testDate,
				"secret",
				{ includeTime: true }
			);

			// Secret format should be YYYY-MM, public should be YYYY-MM-DDTHH:mm
			expect(secretFormat).toBe("2024-03");
			expect(publicFormat).not.toBe("2024-03");
			expect(publicFormat.length).toBeGreaterThan(secretFormat.length);
		});

		it("should produce deterministic results when time is fixed", async () => {
			const fixedTime = "2024-03-15T12:00:00.000Z";
			let now1, now2;

			await DateTesting.withFixedNow(fixedTime, async () => {
				now1 = DateCore.now();
				now2 = DateCore.now();
			});

			expect(now1).toBe(fixedTime);
			expect(now1).toEqual(now2);
		});
	});

	describe("NodusDateIntegration", () => {
		const integration = new NodusDateIntegration(
			mockSecurityManager,
			mockOrgContext
		);

		it("should create a secure timestamp with correct context", () => {
			const secureTs = integration.createSecureTimestamp("confidential", [
				"noforn",
			]);

			expect(secureTs.uuid).toBeDefined();
			expect(secureTs.context.classification).toBe("confidential");
			expect(secureTs.context.compartments).toContain("noforn");
			expect(secureTs.context.userId).toBe("test-user-123");
		});

		it("should allow validation when user has clearance", async () => {
			const timestamp = DateCore.now();
			const result = await integration.validateWithSecurity(
				timestamp,
				"secret"
			);
			expect(result.valid).toBe(true);
		});

		it("should throw an error when user lacks clearance", async () => {
			const timestamp = DateCore.now();
			// We expect this promise to reject because our mock security manager denies 'top_secret'
			await expect(
				integration.validateWithSecurity(timestamp, "top_secret")
			).rejects.toThrow("Insufficient clearance for top_secret data");
		});
	});
});
