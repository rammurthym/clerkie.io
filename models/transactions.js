'use strict';

const config   = require('config');
const async    = require('async');
const DateDiff = require('date-diff');
const MongoClient = require('../MongoClient');

/*************************************************************************
						HELPER METHODS
*************************************************************************/

/*
 * Method to group transactions by company name.
 *
 * To-Do: Efficient regex/way to extract company name from transaction name.
 *
 * input: list of transactions.
 * output: JSON object with key being company name and value being list of 
 *         transactions related to that company.
 */
var mapRows = function (data) {
	let result = {};
	let regex = /\d+/;

	data.forEach(function (d) {
		let key = d.name.replace(regex, '').trim();
		if (result[key]) {
			result[key].push(d);
		} else {
			result[key] = new Array();
			result[key].push(d);
		}
	})
	return result;
}

/*
 * Method to verify whether an amount is in allowed band.
 *
 * input: two real numbers.
 * output:  boolean indicating whether the two amounts are recurring or not.
 */
var isInAmountBand = function (a1, a2) {

	if (a1 === a2 || Math.floor(a1) === Math.floor(a2)) return true;

	let amountBand = config.get('rt_rules.amount');
	let percentage = a1*amountBand/100;
	let a1ApproxCeil = a1+percentage;
	let a1ApproxFloor= a1-percentage;

	if (a1ApproxFloor <= a2 && a2 <= a1ApproxCeil) {
		return true;
	} else {
		return false;
	}
}

/*
 * Helper Method.
 */
var isAmountRecurring = function (a1, a2) {
	return isInAmountBand(a1, a2);
}

/*
 * Method to find recurring transactions based on amount.
 * 
 * input: list of transactions of a company.
 * output: set of recurrring transactions for a company.
 */
var findAmountRecurringTransactions = function (transactions) {
	let amountRecurringTransactions = new Set();

	for (let i = 0; i < transactions.length-1; i++) {
		for (let j = i+1; j < transactions.length; j++) {
			if (isAmountRecurring(transactions[i].amount, transactions[j].amount)) {
				amountRecurringTransactions.add(transactions[i]);
				amountRecurringTransactions.add(transactions[j]);
				i = j;
			}
		}
	}

	return amountRecurringTransactions;
}

/*
 * Method to get difference between consecutive transactions based on date.
 * 
 * input: list of transactions.
 * output: difference array of dates in number of days.
 */
var getDateDiffArray = function (transactions) {
	let diffArray = new Array();

	for (let i = 0; i < transactions.length-1; i++) {
		let date1 = new Date(transactions[i].date);
		let date2 = new Date(transactions[i+1].date);

		let diffDays = (new DateDiff(date1, date2)).days();
		diffArray.push(diffDays);
	}
	return diffArray;
}

/*
 * Method to verify whether two dates are in allowed band or nor.
 *
 * input: two dates.
 * output: boolean indicating whether the dates are recurring or not.
 */
var isInDateBand = function (d1, d2) {
	let dateBand = config.get('rt_rules.date');

	if (d1-dateBand <= d2 && d2 <= d1+dateBand) {
		return true;
	} else {
		return false;
	}
}

/*
 * Helper method.
 */
var isDateRecurring = function (d1, d2) {
	return isInDateBand(d1, d2);
}

/*
 * Method to find recurring transactions based on transaction date.
 *
 * input: list of transactions.
 * output: list of recurring transactions based on date.
 */
var findDateRecurringTransactions = function (transactions) {
	let dateRecurringTransactions = new Set();

	let diffArray = getDateDiffArray(transactions);

	for (let i = 0; i < diffArray.length-1; i++) {
		for (let j = i+1; j < diffArray.length; j++) {
			if (isDateRecurring(diffArray[i], diffArray[j])) {
				dateRecurringTransactions.add(transactions[i]);
				dateRecurringTransactions.add(transactions[j]);
				dateRecurringTransactions.add(transactions[j+1]);
				i = j;
			}
		}
	}

	return dateRecurringTransactions;
}

/*
 * Method to return union of two sets.
 * 
 * input: two sets.
 * output: set.
 */
var union = function (setA, setB) {
    let _union = new Set(setA);
    for (let elem of setB) {
        _union.add(elem);
    }
    return _union;
}

/*
 * Helper method to find all recurring transactions for a company.
 *
 * input: list of transactions.
 * output: set of recurring transactions.
 */
var findRecurringTransactionsHelper = function (transactions) {
	let dateBand = config.get('rt_rules.date');

	if (transactions.length < 3) return null;

	let amountRecurringTransactions = findAmountRecurringTransactions(transactions);

	let dateRecurringTransactions = findDateRecurringTransactions(transactions);

	return union(amountRecurringTransactions, dateRecurringTransactions);
}

/*
 * Helper method to find recurring transactions for all companies for a user.
 *
 * input: JSON mapped of all companies and transactions list for a user.
 * output: JSON mapped of all companies and recurring transactions list for a user.
 */
var findRecurringTransactions = function (mappedRows) {
	let result = {};

	Object.keys(mappedRows).sort().forEach(function(key) {
		let rt = findRecurringTransactionsHelper(mappedRows[key]);
		if (rt) result[key] = rt;
	})
	
	return result;
}

/*
 * Method to give list of transactions given mapped object.
 *
 * input: JSON mapped of all companies and recurring transactions list for a user.
 * output: list of recurring transactions for a user.
 */
var unMap = function (data) {
	let result = new Array();

	Object.keys(data).forEach((k, c) => {
		data[k].forEach((r) => {
			result.push(r);
		})
	})
	return result;
}

/*
 * Method to add number of days to a date.
 *
 * input: date object, integer.
 * ouput: updated date object.
 */
var addDays = function (date, days) {
	let result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/*
 * Method to get estimate for next recurring transaction post date.
 *
 * input: list of recurring transactions for a company.
 * output: date object.
 */
var getNextDateEstimate = function (transactions) {
	let total = 0;

	for (let i = 0; i < transactions.length-1; i++) {
		let date1 = new Date(transactions[i].date);
		let date2 = new Date(transactions[i+1].date)
		total += (new DateDiff(date1, date2)).days();
	}

	let recent = new Date(transactions[0].date);

	return addDays(recent, Math.ceil(total/(transactions.length-1)));
}

/*
 * Helper method.
 */
var getNextAmountEstimate = function (transactions) {
	return transactions[0].amount;
}

/*
 * Method to get list of transaction amounts.
 *
 * input: list of transactions.
 * output: list of amounts of each transaction.
 */
var getTransactionsList = function (transactions) {
	let array = new Array();

	transactions.forEach((t) => {
		array.push(t.amount);
	});
	return array;
}

/*
 * Method to get next date and amount estimate for a recurring transaction.
 *
 * input: list of transactions.
 * output: JSON object with date and amount estimate.
 */
var getNextEstimate = function (transactions) {
	let o = {};
	o.next_amt = getNextAmountEstimate(transactions);
	o.next_date = getNextDateEstimate(transactions);
	o.transactions = transactions;
	// o.transactions = getTransactionsList(transactions);
	return o;
}

/*
 * Helper method to build response object.
 *
 * input: JSON mapped of all companies and recurring transactions list for a user.
 * ouput: list of recurring transactions as per problem statement.
 */
var buildResponse = function (data) {
	let result = new Array();

	Object.keys(data).forEach((k) => {
		let array = Array.from(data[k])
		let temp = getNextEstimate(array);
		temp.name = array[0].name;
		temp.user_id = array[0].user_id;
		result.push(temp);
	})
	return result;
}

/*************************************************************************
						DB METHODS
*************************************************************************/

/*
 * DB method to update transaction.
 */
var updateDB = function (record, cb) {
	const db = MongoClient.db(config.get('dbConfig.dbName'));
	const collection = db.collection('transactions');

	collection.updateOne({"_id": record["_id"]}, {"$set": {"is_recurring": true}}, function (err, res) {
		if (err) {
			cb(err, null);
		} else {
			cb(null, true);
		}
	})
}

/*
 * DB method to get all transactions for a user.
 */
var getRecurringTransactions = function (userId, cb) {

	MongoClient.connect((err) => {
		if (err) {
			cb(err, null);
		} else {
			const db = MongoClient.db(config.get('dbConfig.dbName'));
			const collection = db.collection('transactions');

			async.waterfall([
				function (icb) {
					collection.find({$query: {user_id: userId}, $orderby: {date:-1}}).toArray((err, docs) => {
						if (err) {
							icb(err, null);
						} else if (docs && docs.length) {
							icb(null, docs);
						} else {
							icb(null, null);
						}
					})
				},
				function(docs, icb) {
					let recurringTransactions = findRecurringTransactions(mapRows(docs));
					icb(null, recurringTransactions);
				}
			], function (err, result) {
				if (err) {
					cb(err, null);
				} else {
					let records = unMap(result);
					records.forEach((r, c) => {
						updateDB(r, function (err, res) {
							if (err) {
								cb(err, null);
								return;
							} else {
								if (c === records.length-1) {
									cb(null, result);
								}
							}
						})
					})
				}
			})
		}
	})
};

/*
 * DB method to insert new transactions into the db.
 */
var upsertTransactions = function (data, cb) {
	MongoClient.connect((err) => {
		if (err) {
			cb(err, null);
		} else {
			const db = MongoClient.db(config.get('dbConfig.dbName'));
			const collection = db.collection('transactions');

			collection.insertMany(data, (err, res) => {
				if (err) {
					cb(err, null);
				} else {
					cb(null, res);
				}
			})
		}
	})
}

/*************************************************************************
						EXPORT METHODS
*************************************************************************/

/*
 * Export method to get recurring transactions for a user.
 * Accessible from transactions controller.
 */
exports.get = function (userId, cb) {
	getRecurringTransactions(userId, function (err, res) {
		if (err) {
			cb(err, null);
		} else if (res && Object.keys(res).length) {
			cb(null, buildResponse(res));
		} else {
			cb(null, []);
		}
	})
}

/*
 * Export method to post new transactions to the db for a user.
 * Accessible from transactions controller.
 */
exports.post = function (data, cb) {
	upsertTransactions(data, function (err, res) {
		if (err) {
			cb(err, null);
		} else {
			cb(null, res);
		}
	})
};
