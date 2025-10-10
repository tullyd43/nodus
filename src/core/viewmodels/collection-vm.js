import db from "../database/db.js";

class CollectionViewModel {
	constructor() {
		// For now, we'll use a static list of virtual folders.
		// Later, this will be fetched from the 'collections' table in the database.
		this.collections = [
			{
				id: 1,
				name: "Work Projects",
				icon: "💼",
				filter: { tags: ["work", "project"] },
			},
			{
				id: 2,
				name: "Health & Fitness",
				icon: "💪",
				filter: { tags: ["health", "fitness"] },
			},
			{
				id: 3,
				name: "Reading List",
				icon: "📚",
				filter: { item_types: ["book"] },
			},
		];
	}

	async getCollections() {
		// In the future, this will be: return await db.collections.toArray();
		return this.collections;
	}
}

export default CollectionViewModel;
