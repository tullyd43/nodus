export const DateCore = {
	now() {
		return Date.now();
	},
	iso(ts = Date.now()) {
		return new Date(ts).toISOString();
	},
};
export default DateCore;
