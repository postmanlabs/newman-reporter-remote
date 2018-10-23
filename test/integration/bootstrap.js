const nock = require('nock');

before(function () {
    this.run = function (options, done) {
        let err,
            summary;

        // set defaults for option: reporters & reporter
        options = Object.assign({
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, options);

        nock('http://localhost:3000')
            .post('/summary')
            .reply(200, function (uri, requestBody, callback) {
                callback(null, { success: true });

                return done(err, summary, requestBody);
            });

        newman.run(options, function (error, runSummary) {
            err = error;
            summary = runSummary;
        });
    };
});

after(function () {
    nock.cleanAll();
});
