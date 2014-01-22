process.env.NODE_ENV   = 'test';
process.env.AWS_KEY    = "MY_AWS_KEY";
process.env.AWS_SECRET = "AWS_SECRET";

var app     = require('../../app'),
    redis   = require('redis-url'),
    request = require('supertest'),
    expect  = require('expect.js'),
    sinon   = require('sinon'),
    awssum  = require('awssum'),
    amazon  = awssum.load('amazon/amazon'),
    S3      = awssum.load('amazon/s3').S3
    db      = redis.createClient();

describe('CloudUploader', function () {
  var s3;

  beforeEach(function () {
    db.flushdb();
    s3 = sinon.createStubInstance(S3);
    app.set('s3', s3);
  });

  describe('GET /status', function () {
    describe('when no file parameter is given', function () {
      it('returns a 400 Bad Request', function (done) {
        request(app)
          .get('/status')
          .expect('Content-Type', /json/)
          .expect('Access-Control-Allow-Origin', '*')
          .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
          .expect(400, [{error: 'You must pass a file parameter.'}], done)
      });
    });

    describe('when a file parameter is given', function () {
      var filename, expireUpload = 1000

      beforeEach(function () {
        filename = 'some-file.pdf'
      });

      describe('and it exists on redis database', function () {
        describe('as an object', function () {
          beforeEach(function () {
            db.setex(filename, expireUpload, { some: 'key' });
          });

          it('returns a 200 Ok, with a json { finished_uploading: false }', function (done) {
            request(app)
              .get('/status?file=' + filename)
              .expect('Content-Type', /json/)
              .expect('Access-Control-Allow-Origin', '*')
              .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
              .expect(200, { finished_uploading: false }, done)
          });
        });

        describe('as a string "error"', function () {
          beforeEach(function () {
            db.setex(filename, expireUpload, 'error');
          });

          it('returns a 500 error, with a json { error: "upload-failed" }', function (done) {
            request(app)
              .get('/status?file=' + filename)
              .expect('Content-Type', /json/)
              .expect('Access-Control-Allow-Origin', '*')
              .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
              .expect(500, [{ error: 'upload-failed' }], done)
          });
        });
      });

      describe('and it does not exist on redis database', function () {
        it('returns a 200 Ok, with a json { finished_uploading: true }', function (done) {
          request(app)
            .get('/status?file=' + filename)
            .expect('Content-Type', /json/)
            .expect('Access-Control-Allow-Origin', '*')
            .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
            .expect(200, { finished_uploading: true }, done)
        });
      });
    });
  });

  describe('OPTIONS /upload', function () {
    it('returns a 200 Ok, and adds CORS headers', function (done) {
      request(app)
        .options('/upload')
        .expect('Access-Control-Allow-Origin', '*')
        .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
        .expect(200, done)
    });
  });

  describe('POST /upload', function () {
    var jsonResult;

    beforeEach(function () {
      jsonResult = '[{"name":"test-file.txt","size":37,"type":"text/plain","delete_type":"DELETE","delete_url":"http://undefined.s3.amazonaws.com/uploads/test-file.txt","url":"http://undefined.s3.amazonaws.com/uploads/test-file.txt"}]'
    });

    it('uploads file to S3 service', function (done) {
      // var stub = sinon.stub(s3, 'PutObject')

      request(app)
          .post('/upload')
          .set('Accept', 'application/json')
          .attach('file', 'test/fixtures/test-file.txt')
          .end(function () {
            sinon.assert.called(s3.PutObject)
            done()
          })
    });

    describe('when sending "application/json" on accept header', function () {
      it('returns file info as a json', function (done) {
        request(app)
          .post('/upload')
          .set('Accept', 'application/json')
          .attach('file', 'test/fixtures/test-file.txt')
          .expect('Content-Type', 'application/json')
          .expect('Access-Control-Allow-Origin', '*')
          .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
          .expect(200, jsonResult, done)
      });
    });

    describe('when not sending an accept header', function () {
      it('returns file info as a json', function (done) {
        request(app)
          .post('/upload')
          .attach('file', 'test/fixtures/test-file.txt')
          .expect('Content-Type', 'text/plain')
          .expect('Access-Control-Allow-Origin', '*')
          .expect('Access-Control-Allow-Methods', 'OPTIONS, GET, POST')
          .expect(200, jsonResult, done)
      });
    });

    describe('when a field redirect is sent', function () {
      it('returns a redirect, replacing "%s" in the URL with the json result', function (done) {
        request(app)
          .post('/upload')
          .field('redirect', "http://mydomain.com?value=%s")
          .attach('file', 'test/fixtures/test-file.txt')
          .end(function (err, res) {
            expect(res.redirect).to.be.ok()
            expect(res.header.location).to.be("http://mydomain.com?value=" + encodeURIComponent(jsonResult))
            done()
          })
      });
    });
  });
});
