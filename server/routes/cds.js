import express from "express";
import { v4 as uuid } from "uuid";

export const cdsRouter = express.Router();

// 2-person integrity rule
const REQUIRED_APPROVALS = 2;

// Create request
cdsRouter.post("/request", async (req, res) => {
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
	const id = uuid();
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
