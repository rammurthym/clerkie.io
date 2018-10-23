'use strict';

const transactions = require('../models/transactions');

/**************************************************************************
					TRANSACTIONS CONTROLLER
**************************************************************************/

/*
 *
 */
exports.get = function (request, response) {
	transactions.get(1, (err, data) => {
		if (err) {
			response.status(500).send({msg: 'Internal Server Error'});
		} else {
			response.status(200).send(data);
		}
	})
};

/*
 *
 */
exports.post = function (request, response) {
	let body = request.body;

	if (body && body.length) {
		transactions.post(body, (err, res) => {
			if (err) {
				response.status(500).send({msg: 'Internal Server Error'});
			} else {
				transactions.get(1, (err, data) => {
					if (err) {
						response.status(500).send({msg: 'Internal Server Error'});
					} else {
						response.status(201).send(data);
					}
				})
			}
		})
	} else {
		response.status(400).send({msg: 'Bad Request Error'});
	}
}
