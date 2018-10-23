#!/usr/bin/env node
require('colors');

const prettyms = require('pretty-ms'),
    shell = require('shelljs'),

    startedAt = Date.now();

require('async').series([
    require('./test-lint'),
    require('./test-system'),
    require('./test-integration')
], function (code) {
    console.info(`\nnewman-reporter-remote: duration ${prettyms(Date.now() - startedAt)}\n
        newman-reporter-remote: ${code ? 'not ok' : 'ok'}!`[code ? 'red' : 'green']);
    shell.exit(code && (typeof code === 'number' ? code : 1) || 0);
});
