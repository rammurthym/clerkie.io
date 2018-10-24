'use strict';

const Joi = require('joi');
const transactions = require('../models/transactions');

/**************************************************************************
					TRANSACTIONS CONTROLLER
**************************************************************************/

/*
 * Export method for GET request available to Express Router.
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
 * Export method for POST request available to Express Router.
 */
exports.post = function (request, response) {
	let body = request.body;

	if (body && body.length) {

		const schema = Joi.object().keys({
			user_id: Joi.string().required(),
			trans_id: Joi.string().required(),
			name: Joi.string().required(),
			amount: Joi.number().required(),
			date: Joi.date().required()
		});

		let obj = {};

		body.forEach(function (t,c) {
			const result = Joi.validate(t, schema);

			if (result.error) {
				obj['transaction'+(c+1)] = result.error.details;
			}
		})

		if (Object.keys(obj) && Object.keys(obj).length) {
			response.status(400).send(obj);
		} else {
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
		}

	} else {
		response.status(400).send({msg: 'Bad Request Error'});
	}
}
