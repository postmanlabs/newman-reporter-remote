const os = require('os'),
    SerialisedError = require('serialised-error'),
    uuid = require('uuid/v4'),
    request = require('request'),

    STRING = 'string',

    FUNCTION = 'function',

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
     * @returns {Object} - Flatten items
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
     * @returns {Object} - Flatten events
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
     * Add a new execution
     *
     * @param {?Error} err - Error(if any) in this execution
     * @param {Object} data - Data received for this execution
     * @param {Object} data.cursor - Runtime cursor for this execution
     * @param {String} data.cursor.ref - cursor: ref identifier
     * @param {?String} data.cursor.httpRequestId - cursor: httpRequestId identifier
     * @param {?String} data.cursor.scriptId - cursor: scriptId identifier
     * @param {?String} data.cursor.execution - cursor: execution identifier
     * @param {Object[]} executions - List of all executions
     * @param {String} executionType - Type of this execution
     * @param {String} runId - Run identifer in which execution is part of
     * @param {String} selfId - Self reference identifier
     * @param {String} selfModelName - Self reference model name
     * @param {?Number} startTime - Start time(if not instantaneous) for this execution
     * @returns {String} New execution identifier
     */
    addExecution = function (err, data, executions, executionType, runId, selfId, selfModelName, startTime) {
        const executionId = uuid();

        executions.push({
            id: executionId,
            index: executions.length,
            branch: 0,
            type: executionType,
            model: {
                $self: [selfModelName, selfId]
            },
            cursor: data.cursor,
            args: data.cursor && {
                request: data.cursor.httpRequestId && {
                    $self: [SELF_MODELS.requests, data.cursor.httpRequestId]
                },
                script: data.cursor.execution && {
                    $self: [SELF_MODELS.scripts, data.cursor.execution]
                },
                event: data.cursor.scriptId && {
                    $self: [SELF_MODELS.events, data.cursor.scriptId]
                }
            },
            error: err && err.id && { // `err.id` check is required to avoid including assertion errors
                $self: [SELF_MODELS.errors, err.id]
            },
            timings: {
                started: startTime || Date.now(),
                completed: Date.now()
            }
        });

        return executionId;
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
        // bail out if no option is set
        if (!(options.api || options.export || options.callback)) {
            return console.error('newman-reporter-remote:\n  error: missing required reporter option');
        }

        if (typeof options.api === STRING) {
            try {
                options.api = JSON.parse(options.api);
            }
            catch (e) {
                return console.error('newman-reporter-remote:\n  error: ', e);
            }
        }

        const runId = options.runId || uuid(),
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

            addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.iteration,
                runId,
                null,
                SELF_MODELS.iterations,
                iterationStartTime);
        });

        newman.on('beforeItem', function () {
            itemStartTime = Date.now(); // used on the completion of current item
        });

        newman.on('item', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.item,
                runId,
                data.item.id,
                SELF_MODELS.items,
                itemStartTime);

            !items[data.item.id] && (items[data.item.id] = _items[data.item.id]);
        });

        newman.on('beforeScript', function () {
            scriptStartTime = Date.now(); // used on the completion of this script execution
        });

        newman.on('script', function (err, data) {
            if (err) {
                errors[err.id] = err instanceof SerialisedError ? err : new SerialisedError(err, true);
            }

            const executionId = addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.script,
                runId,
                data.execution.id,
                SELF_MODELS.scripts,
                scriptStartTime);

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

            const executionId = addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.request,
                runId,
                data.cursor.httpRequestId,
                SELF_MODELS.requests,
                requestStartTime);

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
            const assertionId = uuid();

            addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.assertion,
                runId,
                assertionId,
                SELF_MODELS.assertions);

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

            const consoleId = uuid();

            addExecution(err,
                data,
                executions,
                EXECUTION_TYPES.console,
                runId,
                consoleId,
                SELF_MODELS.consoles);

            consoles[consoleId] = {
                id: consoleId,
                script: {
                    $self: [SELF_MODELS.scripts, data.cursor.execution]
                },
                level: data.level,
                messages: data.messages
            };
        });

        newman.on('beforeDone', function () {
            const summary = {
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
            };

            // save execution summary to disk if `export` options is set
            if (options.export) {
                newman.exports.push({
                    name: 'remote-reporter',
                    default: 'newman-execution-summary.json',
                    path: options.export,
                    content: JSON.stringify(summary, 0, 2)
                });
            }

            // post execution summary to the remote endpoint
            if (options.api) {
                request(Object.assign({}, options.api, {
                    body: summary,
                    json: true
                }), function (err, response, body) {
                    if (err) {
                        return console.error('newman-reporter-remote:\n  error: ', err);
                    }

                    console.info('newman-reporter-remote:\n  responseStatus: ' + response.statusCode +
                        '\n  responseBody: ', body);
                });
            }

            // callback for custom handling of execution summary
            if (typeof options.callback === FUNCTION) {
                options.callback(null, summary);
            }
        });
    };

module.exports = remoteReporter;
