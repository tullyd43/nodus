/**
 * @file ArbitraryCodeValidator.js
 * @description Utility to scan JavaScript code for forbidden, potentially unsafe patterns.
 * @see {@link d:\Development Files\repositories\nodus\DEVELOPER_MANDATES.md} - Mandate 2.1
 */

/**
 * A map of forbidden patterns, their severity, and a descriptive message.
 * @private
 * @type {Map<RegExp, {message: string, severity: 'critical'|'warning'}>}
 */
const FORBIDDEN_PATTERNS = new Map([
	[
		/eval\s*\(/,
		{ message: "Use of eval() is forbidden.", severity: "critical" },
	],
	[
		/new\s+Function\s*\(/,
		{
			message: "Use of new Function() is forbidden.",
			severity: "critical",
		},
	],
	[
		/setTimeout\s*\(\s*["'`]/,
		{
			message: "Use of setTimeout with a string argument is forbidden.",
			severity: "critical",
		},
	],
	[
		/\.innerHTML\s*=\s*[^"']/,
		{
			message:
				"Direct assignment to innerHTML with dynamic data is forbidden. Use textContent or a sanitization library.",
			severity: "warning",
		},
	],
]);

/**
 * Scans a string of code for forbidden patterns.
 * @param {string} codeString - The JavaScript code to scan.
 * @returns {Array<{message: string, severity: 'critical'|'warning'}>} An array of violation objects.
 */
export function scanForForbiddenPatterns(codeString) {
	const violations = [];
	for (const [pattern, details] of FORBIDDEN_PATTERNS.entries()) {
		if (pattern.test(codeString)) {
			violations.push(details);
		}
	}
	return violations;
}
