'use strict';

const config   = require('config');
const async    = require('async');
const DateDiff = require('date-diff');
const MongoClient = require('../MongoClient');

/*************************************************************************
						HELPER METHODS
*************************************************************************/

/*
 *
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
 *
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
 *
 */
var isAmountRecurring = function (a1, a2) {
	return isInAmountBand(a1, a2);
}

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
 *
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
 *
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
 *
 */
var isDateRecurring = function (d1, d2) {
	return isInDateBand(d1, d2);
}

/*
 *
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
 *
 */
var union = function (setA, setB) {
    let _union = new Set(setA);
    for (let elem of setB) {
        _union.add(elem);
    }
    return _union;
}

/*
 *
 */
var findRecurringTransactionsHelper = function (transactions) {
	let dateBand = config.get('rt_rules.date');

	if (transactions.length < 3) return null;

	let amountRecurringTransactions = findAmountRecurringTransactions(transactions);

	let dateRecurringTransactions = findDateRecurringTransactions(transactions);

	return union(amountRecurringTransactions, dateRecurringTransactions);
}

/*
 *
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
 *
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
 *
 */
var addDays = function (date, days) {
	let result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/*
 *
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
 *
 */
var getNextAmountEstimate = function (transactions) {
	return transactions[0].amount;
}

/*
 *
 */
var getTransactionsList = function (transactions) {
	let array = new Array();

	transactions.forEach((t) => {
		array.push(t.amount);
	});
	return array;
}

/*
 *
 */
var getNextEstimate = function (transactions) {
	let o = {};
	o.next_amt = getNextAmountEstimate(transactions);
	o.next_date = getNextDateEstimate(transactions);
	o.transactions = getTransactionsList(transactions);
	return o;
}

/*
 *
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
 *
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
 *
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
 *
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
 *
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
 *
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
