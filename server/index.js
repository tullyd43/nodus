import express from "express";
import pg from "pg";

import { cdsRouter } from "./routes/cds.js";

const app = express();
app.use(express.json());

// Database pool (adjust credentials)
const pool = new pg.Pool({
	user: "postgres",
	database: "nodus",
	host: "localhost",
	password: "yourpassword",
	port: 5432,
});

// Middleware to attach db + fake user (for now)
app.use((req, res, next) => {
	req.db = pool;
	req.user = { id: "user_test_1" }; // replace with real auth later
	next();
});

// Mount routers
app.use("/api/cds", cdsRouter);

app.listen(8080, () =>
	console.log("✅ Nodus API running on http://localhost:8080")
);
