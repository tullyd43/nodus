
import { randomUUID } from "node:crypto";

import { ForensicLogger } from "../../src/core/security/ForensicLogger.js";

function createRouter() {
	const routes = {};
	ForensicLogger.createEnvelope({
		actorId: "system",
		action: "CDS_ROUTER_CREATE",
		label: "unclassified",
	}).catch(() => {}); // Fire-and-forget
	const router = (req, res) => {
		const handler = routes[req.method]?.[req.url];
		if (handler) {
			return handler(req, res);
		}
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: false, error: "NOT_FOUND" }));
	};

	router.post = (path, handler) => {
		routes.POST = routes.POST || {};
		ForensicLogger.createEnvelope({
			actorId: "system",
			action: "CDS_ROUTE_REGISTER",
			target: path,
		}).catch(() => {}); // Fire-and-forget
		routes.POST[path] = handler;
	};

	return router;
}

export const cdsRouter = createRouter();

// 2-person integrity rule
const REQUIRED_APPROVALS = 2;

// Create request
cdsRouter.post("/request", async (req, res) => {
	ForensicLogger.createEnvelope({
		actorId: req.user?.id || "system",
		action: "CDS_REQUEST_CREATE",
		target: req.url,
		label: "unclassified",
	}).catch(() => {}); // Fire-and-forget

	const {
		logical_id,
		direction,
		from_level,
		to_level,
		from_compartments = [],
		to_compartments = [],
		justification,
		sanitization_profile,
	} = req.body;
	// TODO: validate fields; ensure caller has authority to raise CDS
	const id = randomUUID();
	await req.db.query(
		`INSERT INTO cds_requests (id, logical_id, direction, from_level, to_level, from_compartments, to_compartments, justification, sanitization_profile, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
		[
			id,
			logical_id,
			direction,
			from_level,
			to_level,
			from_compartments,
			to_compartments,
			justification,
			sanitization_profile,
			req.user.id,
		]
	);
	await req.db.query(
		`INSERT INTO cds_events (request_id, event, payload) VALUES ($1,'requested',$2)`,
		[id, JSON.stringify(req.body)]
	);
	res.json({ ok: true, id });
});

// Proxy endpoint: forward sanitized requests to arbitrary URLs via server-side fetch
// Body shape: { url: string, init: object }
cdsRouter.post("/proxy", async (req, res) => {
	try {
		ForensicLogger.createEnvelope({
			actorId: req.user?.id || "system",
			action: "CDS_PROXY",
			target: req.body?.url || req.url,
			label: "unclassified",
		}).catch(() => {}); // Fire-and-forget

		const { url, init } = req.body || {};
		if (!url)
			return res.status(400).json({ ok: false, error: "MISSING_URL" });

		// Basic URL validation
		let u;
		try {
			u = new URL(String(url));
		} catch {
			return res.status(400).json({ ok: false, error: "INVALID_URL" });
		}
		if (!["http:", "https:"].includes(u.protocol)) {
			return res
				.status(400)
				.json({ ok: false, error: "UNSUPPORTED_PROTOCOL" });
		}

		// Sanitize init: remove sensitive headers
		const safeInit = Object.assign({}, init || {});
		const incomingHeaders =
			safeInit.headers && typeof safeInit.headers === "object"
				? { ...safeInit.headers }
				: {};
		// Disallow Authorization and Cookie from clients
		delete incomingHeaders["Authorization"];
		delete incomingHeaders["authorization"];
		delete incomingHeaders["Cookie"];
		delete incomingHeaders["cookie"];

		// Forward via node's fetch (available in Node >=18+)
		const forwardInit = {
			method: safeInit.method || "GET",
			headers: {
				...incomingHeaders,
				"X-CDS-Forwarded-By": "nodus-cds-proxy",
			},
			body: safeInit.body,
			redirect: "manual",
		};

		// eslint-disable-next-line copilotGuard/no-insecure-api
		const response = await fetch(u.href, forwardInit);
		const text = await response.text();

		// Return a minimal response shape to the client
		res.json({
			ok: true,
			status: response.status,
			statusText: response.statusText,
			headers: Object.fromEntries(response.headers.entries()),
			body: text,
		});
	} catch (err) {
		console.error("[CDS Proxy] Error forwarding request:", err);
		res.status(500).json({
			ok: false,
			error: "PROXY_ERROR",
			message: err.message,
		});
	}
});

export default cdsRouter;

// Approve/reject with 2PI
cdsRouter.post("/:id/approve", async (req, res) => {
	const { decision, comment } = req.body; // approve|reject
	const { id } = req.params;

	await req.db.query(
		`INSERT INTO cds_approvals (request_id, approver_id, decision, comment) VALUES ($1,$2,$3,$4)`,
		[id, req.user.id, decision, comment || null]
	);

	const { rows: approvals } = await req.db.query(
		`SELECT decision FROM cds_approvals WHERE request_id = $1`,
		[id]
	);

	if (decision === "reject") {
		await req.db.query(
			`UPDATE cds_requests SET status='rejected', updated_at=now() WHERE id=$1`,
			[id]
		);
		await req.db.query(
			`INSERT INTO cds_events (request_id, event, payload) VALUES ($1,'rejected',$2)`,
			[id, JSON.stringify({ by: req.user.id, comment })]
		);
		return res.json({ ok: true, status: "rejected" });
	}

	const approvalsFor = approvals.filter(
		(a) => a.decision === "approve"
	).length;
	if (approvalsFor >= REQUIRED_APPROVALS) {
		await req.db.query(
			`UPDATE cds_requests SET status='approved', updated_at=now() WHERE id=$1`,
			[id]
		);
		await req.db.query(
			`INSERT INTO cds_events (request_id, event, payload) VALUES ($1,'approved',$2)`,
			[id, JSON.stringify({ count: approvalsFor })]
		);
	}
	res.json({
		ok: true,
		status: approvalsFor >= REQUIRED_APPROVALS ? "approved" : "pending",
	});
});

// Complete: run sanitization and write target instance
cdsRouter.post("/:id/complete", async (req, res) => {
	const { id } = req.params;
	const { sanitized_instance } = req.body; // json

	// Ensure already approved
	const {
		rows: [reqRow],
	} = await req.db.query(`SELECT * FROM cds_requests WHERE id=$1`, [id]);
	if (!reqRow || reqRow.status !== "approved")
		return res.status(400).json({ ok: false, error: "NOT_APPROVED" });

	// Write to polyinstantiation table
	await req.db.query(
		`INSERT INTO objects_poly (logical_id, classification, compartments, instance_data)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (logical_id, classification, compartments)
     DO UPDATE SET instance_data=EXCLUDED.instance_data, updated_at=now()`,
		[
			reqRow.logical_id,
			reqRow.to_level,
			reqRow.to_compartments,
			sanitized_instance,
		]
	);

	await req.db.query(
		`UPDATE cds_requests SET status='completed', updated_at=now() WHERE id=$1`,
		[id]
	);
	await req.db.query(
		`INSERT INTO cds_events (request_id, event, payload) VALUES ($1,'completed',$2)`,
		[id, JSON.stringify({ logical_id: reqRow.logical_id })]
	);

	res.json({ ok: true, status: "completed" });
});
