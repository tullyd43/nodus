// src/config/environment.config.js
// Central source of truth for environment flags.

export const AppConfig = {
	/**
	 * This is now the single place to change modes.
	 * true: Loads 'demo-crypto'
	 * false: Loads 'basic-crypto' (or enterprise/NATO crypto based on context)
	 */
	demoMode: true,

	// We can move other flags here for consistency
	offlineEnabled: true,
	enableSync: false,

	// You can add other flags here as your app grows
	// logLevel: 'debug',
};
