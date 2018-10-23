'use strict';

const cluster = require('cluster');

const routes = require('./routes.js');

if (cluster.isMaster) {  
    const cpus = require('os').cpus().length;
    for (let i = 0; i < cpus; i += 1) {
        cluster.fork();
    }    
} else {
	const express = require('express');
	const timeout = require('connect-timeout');
	const bodyParser = require('body-parser');

	const app = express();
	const port = process.env.PORT || 1984;

	app.use(timeout('10s'));
	app.use(bodyParser.json());
	app.use(bodyParser.urlencoded({
		extended: true
	}));
	app.use(haltOnTimedOut);

	app.use('/', routes);

	function haltOnTimedOut (req, res, next) {
		if (!req.timedout) next()
	}

	app.listen(port);
	console.log(`worker ${cluster.worker.id} is listening on port ${port}...`);
}
