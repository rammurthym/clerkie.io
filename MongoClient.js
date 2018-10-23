'use strict';

const config = require('config');

const MongoClient = require('mongodb').MongoClient;

const dbName = config.get('dbConfig.dbName');
const url = 'mongodb://' + config.get('dbConfig.host') + ':' + config.get('dbConfig.port');

module.exports = new MongoClient(url, {useNewUrlParser: true});
