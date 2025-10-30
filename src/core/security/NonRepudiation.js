export class NonRepudiation {
	async signAction({ userId, action, label }) {
		const payload = JSON.stringify({
			userId,
			action,
			label,
			ts: Date.now(),
		});
		const signature = btoa(payload); // replace with JWS later
		return {
			signature,
			algorithm: "demo-stub",
			timestamp: new Date().toISOString(),
		};
	}
}
