const nock = require('nock'),
    Ajv = require('ajv');

describe('Newman Library', function () {
    before(function (done) {
        var ajv = new Ajv(),
            validate = ajv.compile(require('../../examples/schema.json'));

        nock('http://localhost:3000')
            .persist()
            .post('/summary')
            .reply(200, function (uri, body, callback) {
                expect(validate(body)).to.be.true;
                callback(null, { success: true });
            });

        return done();
    });

    after(function () {
        nock.cleanAll();
    });

    it('should correctly execute for a successful run', function (done) {
        newman.run({
            collection: 'test/fixtures/single-get-request.json',
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, function (err) {
            return done(err);
        });
    });

    it('should correctly execute for a failed run', function (done) {
        newman.run({
            collection: 'test/fixtures/single-request-failing.json',
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, function (err, summary) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 1 failure').to.have.lengthOf(1);

            return done();
        });
    });

    it('should correctly execute for a run with AssertionError/TypeError', function (done) {
        newman.run({
            collection: 'test/fixtures/newman-report-test.json',
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, function (err, summary) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 2 failures').to.have.lengthOf(2);

            return done();
        });
    });

    it('should correctly execute for a run with one or more failed requests', function (done) {
        newman.run({
            collection: 'test/fixtures/failed-request.json',
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, function (err, summary) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 1 failure').to.have.lengthOf(1);

            return done();
        });
    });

    it('should correctly execute sample collection', function (done) {
        newman.run({
            collection: 'test/fixtures/sample-collection.json',
            reporters: ['remote'],
            reporter: {
                remote: {
                    api: {
                        method: 'POST',
                        url: 'http://localhost:3000/summary'
                    }
                }
            }
        }, function (err) {
            expect(err).to.be.null;

            return done();
        });
    });
});
