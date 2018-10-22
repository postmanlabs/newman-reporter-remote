const os = require('os'),
    SerialisedError = require('serialised-error'),
    uuid = require('uuid/v4'),
    request = require('request'),

    STRING = 'string',

    EXECUTION_TYPES = {
        script: 'script',
        assertion: 'assertion',
        console: 'console',
        request: 'request',
        iteration: 'iteration',
        item: 'item'
    },

    SELF_MODELS = {
        run: 'run',
        executions: 'executions',
        iterations: 'iterations',
        requests: 'requests',
        responses: 'responses',
        assertions: 'assertions',
        errors: 'errors',
        events: 'events',
        scripts: 'scripts',
        items: 'items',
        consoles: 'consoles'
    },

    /**
     * A function to flatten all items in the members array
     *
     * @param {Array} members - All members of an Item or ItemGroup
     * @param {String} [path] - Path leading to members
     */
    flattenItems = function (members = [], path = []) {
        let is = {};

        members.forEach((element) => {
            // This a folder
            if (element.items) {
                return Object.assign(is, flattenItems(element.items.members, [...path, element.id]));
            }

            is[element.id] = {
                $ref: ['request', element.id],
                path: path
            };
        });

        return is;
    },

    /**
     * A function to flatten all events in collection
     *
     * @param {Array} element - All members of an Item or ItemGroup
     * @param {String} [path] - Path leading to members
     */
    flattenEvents = function (element = {}, path = []) {
        let is = {};

        // Get the event and add it
        if (element.events && element.events.members) {
            element.events.members.forEach((event) => {
                is[event.script.id] = { path };
            });
        }

        // Traverse across all items and move through them
        if (element.items && element.items.members) {
            element.items.members.forEach((member) => {
                Object.assign(is, flattenEvents(member, [...path, member.id]));
            });
        }

        return is;
    },

    /**
     * A function that publish execution report to remote.
     *
     * @param {Object} newman - The collection run object, with a event handler setter,
     * used to enable event wise reporting.
     * @param {Object} options - The set of reporter run options.
     * @param {Object} options.api - Remote endpoint to publish the report.
     * @param {String} options.agentId - Remote agent identifier
     * @param {String} options.agentName - Remote agent name
     * @param {String} options.agentVersion - Remote agent version
     * @param {Object} cr - The set of all the collection run options.
     * @returns {*}
     */
    remoteReporter = function (newman, options, cr) {
        if (!options.api) {
            return console.error('newman-reporter-remote:\n  error: missing required option `api`');
        }


        if (typeof options.api === STRING) {
            try {
                options.api = JSON.parse(options.api);
            }
            catch (e) {
                return console.error('newman-reporter-remote:\n  error: ', e);
            }
        }

        const runId = uuid(),
            collectionInfo = cr.collection.toJSON().info,
            _events = flattenEvents(cr.collection),
            _items = flattenItems(cr.collection.items.members);

        let collection = {
                id: cr.collection.id,
                $ref: ['collection', cr.collection.id],
                info: {
                    name: collectionInfo.name,
                    schema: collectionInfo.schema
                }
            },
            environment = {
                id: cr.environment.id,
                $ref: ['environment', cr.environment.id],
                info: {
                    name: cr.environment.name
                }
            },
            run = {
                id: runId,
                type: 'waterfall',
                agent: {
                    id: options.agentId || uuid(),
                    name: options.agentName || 'newman',
                    version: options.agentVersion || cr.newmanVersion,
                    platform: os.platform()
                }
            },
            executions = [],
            requests = {},
            responses = {},
            assertions = {},
            errors = {},
            events = {},
            scripts = {},
            items = {},
            consoles = {},
            scriptStartTime,
            iterationStartTime,
            itemStartTime,
            requestStartTime;

        newman.on('beforeIteration', function () {
            iterationStartTime = Date.now(); // used on the completion of this iteration
        });

        newman.on('iteration', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const executionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.iteration,
                model: {
                    $self: [SELF_MODELS.iterations, null]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: err && { $self: [SELF_MODELS.errors, err.id] },
                timings: {
                    started: iterationStartTime,
                    completed: Date.now()
                }
            });
        });

        newman.on('beforeItem', function () {
            itemStartTime = Date.now(); // used on the completion of current item
        });

        newman.on('item', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const executionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.item,
                model: {
                    $self: [SELF_MODELS.items, data.item.id]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: err && { $self: [SELF_MODELS.errors, err.id] },
                timings: {
                    started: itemStartTime,
                    completed: Date.now()
                }
            });

            !items[data.item.id] && (items[data.item.id] = _items[data.item.id]);
        });

        newman.on('beforeScript', function () {
            scriptStartTime = Date.now(); // used on the completion of this script execution
        });

        newman.on('script', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const executionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.script,
                model: {
                    $self: [SELF_MODELS.scripts, data.execution.id]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: err && { $self: [SELF_MODELS.errors, err.id] },
                timings: {
                    started: scriptStartTime,
                    completed: Date.now()
                }
            });

            scripts[data.execution.id] = {
                id: data.execution.id,
                listen: data.event.listen,
                execution: {
                    $self: [SELF_MODELS.executions, executionId]
                },
                event: {
                    $self: [SELF_MODELS.events, data.script.id]
                }
            };

            // Add the event to known events list
            !events[data.script.id] && (events[data.script.id] = _events[data.script.id]);
        });

        newman.on('beforeRequest', function () {
            requestStartTime = Date.now(); // used on the completion of this request
        });

        newman.on('request', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const executionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.request,
                model: {
                    $self: [SELF_MODELS.requests, data.cursor.httpRequestId]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: err && { $self: [SELF_MODELS.errors, err.id] },
                timings: {
                    started: requestStartTime,
                    completed: Date.now()
                }
            });

            requests[data.cursor.httpRequestId] = {
                id: data.cursor.httpRequestId,
                execution: {
                    $self: [SELF_MODELS.executions, executionId]
                },
                response: {
                    $self: [SELF_MODELS.responses, data.response && data.response.id]
                },
                url: data.request.url.toString(),
                method: data.request.method
            };

            // If there was no response then do not add it
            if (!data.response) { return; }

            responses[data.response.id] = {
                request: {
                    $self: [SELF_MODELS.requests, data.cursor.httpRequestId]
                },
                id: data.response.id,
                status: data.response.status,
                code: data.response.code,
                responseTime: data.response.responseTime,
                responseSize: data.response.responseSize
            };
        });

        newman.on('assertion', function (err, data) {
            const executionId = uuid(),
                assertionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.assertion,
                model: {
                    $self: [SELF_MODELS.assertions, assertionId]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: null,
                timings: {
                    started: Date.now(),
                    completed: Date.now()
                }
            });

            assertions[assertionId] = {
                id: assertionId,
                name: data.assertion,
                script: {
                    $self: [SELF_MODELS.scripts, data.cursor.execution]
                },
                skipped: data.skipped,
                error: err
            };
        });

        newman.on('console', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const consoleId = uuid(),
                executionId = uuid();

            executions.push({
                id: executionId,
                index: executions.length,
                branch: 0,
                type: EXECUTION_TYPES.console,
                model: {
                    $self: [SELF_MODELS.consoles, consoleId]
                },
                cursor: data.cursor,
                context: {
                    ref: data.cursor.ref,
                    httpRequestId: data.cursor.httpRequestId,
                    scriptId: data.cursor.scriptId,
                    execution: data.cursor.execution
                },
                run: {
                    $self: [SELF_MODELS.run, runId]
                },
                error: err && { $self: [SELF_MODELS.errors, err.id] },
                timings: {
                    started: Date.now(),
                    completed: Date.now()
                }
            });

            consoles[consoleId] = {
                id: consoleId,
                script: {
                    $self: [SELF_MODELS.scripts, data.cursor.execution]
                },
                level: data.level,
                messages: data.messages
            };
        });

        newman.on('done', function () {
            request(Object.assign({}, options.api, {
                body: {
                    run,
                    collection,
                    environment,
                    items,
                    executions,
                    scripts,
                    events,
                    requests,
                    responses,
                    assertions,
                    errors,
                    consoles
                },
                json: true
            }), function (err, response, body) {
                if (err) {
                    return console.error('newman-reporter-remote:\n  error: ', err);
                }

                console.info('newman-reporter-remote:\n  responseStatus: ' + response.statusCode +
                    '\n  responseBody: ', body);
            });
        });
    };

module.exports = remoteReporter;
