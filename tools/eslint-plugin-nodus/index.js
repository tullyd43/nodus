/**
 * @file Nodus architectural linting rules.
 * @copyright 2024 Nodus
 */

import requireAsyncOrchestration from "./require-async-orchestration.js";
import noManualForensics from "./no-manual-forensics.js";

const plugin = {
	rules: {
		"require-async-orchestration": requireAsyncOrchestration,
		"no-manual-forensics": noManualForensics,
	},
};

export default plugin;
