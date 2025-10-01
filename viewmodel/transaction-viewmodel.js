class TransactionViewModel {
	constructor() {
		this.transactions = [];
	}
	addTransaction(amount, type, description) {
		if (type === "expense") {
			amount *= -1;
		}
		const transaction = new TransactionModel(amount, type, description);
		this.transactions.push(transaction);
	}
	calculateRunningBalance() {
		return this.transactions.reduce((balance, transaction) => {
			return balance + transaction.amount;
		}, 0);
	}
	deleteTransaction(id) {
		this.transactions = this.transactions.filter(
			(transaction) => transaction.id !== id
		);
	}
}
