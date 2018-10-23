'use strict';

const config = require('config');
const MongoClient = require('./MongoClient');

MongoClient.connect((err) => {
	if (err) {
		console.log(err);
		process.exit(1);
	} else {
		const db = MongoClient.db(config.get('dbConfig.dbName'));
		const xlsx = require('xlsx');

		var workbook = xlsx.readFile('sample_transactions.xlsx');
		var worksheet = workbook.Sheets['BE_challenge_transactions'];

		var options = {
			'range': 3,
			'header': ['name', 'date', 'amount', 'trans_id', 'user_id', 'is_recurring']
		}


		var data = xlsx.utils.sheet_to_json(worksheet, options);

		const collection = db.collection('transactions');

		collection.insertMany(data, (err, res) => {
			MongoClient.close();
			if (err) {
				console.log(err);
				process.exit(1);
			} else {
				console.log('Inserted data successfully');
				process.exit();
			}
		})
	}
});
