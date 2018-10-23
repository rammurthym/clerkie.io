'use strict';

const express = require('express');
const router  = express.Router();

const transactions = require('./controllers/transactions');

router.post('/', transactions.post);
router.get('/', transactions.get);

module.exports = router;
