import { MACEngine } from "../../../MACEngine.js";

const make = (lvl, comps = []) => ({
	level: lvl,
	compartments: new Set(comps),
});

test("no read up", () => {
	const mac = new MACEngine({
		getUserClearance: () => make("confidential", ["BLUE"]),
		getObjectLabel: (e) => make(e.classification, e.compartments),
	});
	const secret = { classification: "secret", compartments: ["BLUE"] };
	expect(() => mac.enforceNoReadUp(mac.subject(), mac.label(secret))).toThrow(
		"MAC_DENY_READ"
	);
});

test("no write down", () => {
	const mac = new MACEngine({
		getUserClearance: () => make("secret", ["BLUE"]),
		getObjectLabel: (e) => make(e.classification, e.compartments),
	});
	const conf = { classification: "confidential", compartments: ["BLUE"] };
	expect(() =>
		mac.enforceNoWriteDown(mac.subject(), mac.label(conf))
	).toThrow("MAC_DENY_WRITE");
});
