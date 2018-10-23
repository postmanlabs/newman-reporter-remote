const Ajv = require('ajv'),
    EXECUTION_SCHEMA = require('../../examples/schema.json');

describe('Newman Library', function () {
    const validate = new Ajv().compile(EXECUTION_SCHEMA);

    it('should correctly execute for a successful run', function (done) {
        this.run({
            collection: 'test/fixtures/single-get-request.json'
        },
        function (err, summary, requestBody) {
            expect(err).to.be.null;
            expect(validate(requestBody)).to.be.true;

            return done(err);
        });
    });

    it('should correctly execute for a failed run', function (done) {
        this.run({
            collection: 'test/fixtures/single-request-failing.json'
        },
        function (err, summary, requestBody) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 1 failure').to.have.lengthOf(1);
            expect(validate(requestBody)).to.be.true;

            return done();
        });
    });

    it('should correctly execute for a run with AssertionError/TypeError', function (done) {
        this.run({
            collection: 'test/fixtures/newman-report-test.json'
        }, function (err, summary, requestBody) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 2 failures').to.have.lengthOf(2);
            expect(validate(requestBody)).to.be.true;

            return done();
        });
    });

    it('should correctly execute for a run with one or more failed requests', function (done) {
        this.run({
            collection: 'test/fixtures/failed-request.json'
        }, function (err, summary, requestBody) {
            expect(err).to.be.null;
            expect(summary.run.failures, 'should have 1 failure').to.have.lengthOf(1);
            expect(validate(requestBody)).to.be.true;

            return done();
        });
    });

    it('should correctly execute sample collection', function (done) {
        this.run({
            collection: 'test/fixtures/sample-collection.json'
        }, function (err, summary, requestBody) {
            expect(err).to.be.null;
            expect(validate(requestBody)).to.be.true;

            return done();
        });
    });
});
