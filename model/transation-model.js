class TransactionModel {
    constructor(amount, type, description) {
        this.amount = amount;
        this.type = type;
        this.description = description;
        this.date = new Date();
        this.id = crypto.randomUUID();
    }
}