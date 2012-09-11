/**
* Module dependencies.
*/

var express = require('express'),
    formidable = require('formidable'),
    awssum = require('awssum'),
    amazon = awssum.load('amazon/amazon'),
    S3 = awssum.load('amazon/s3').S3,
    fs = require('fs'),
    _ = require("underscore")._;

var s3 = new S3({
  'accessKeyId' : process.env.AWS_KEY,
  'secretAccessKey' : process.env.AWS_SECRET,
  'region' : process.env.AWS_REGION || amazon.US_EAST_1
});

var app = module.exports = express();

app.set('access-control', {
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
  allowMethods: 'OPTIONS, POST'
});

app.set('bucket', process.env.AWS_BUCKET);
app.set('policy', process.env.AWS_POLICY);
app.set('use-ssl', process.env.USE_SSL);
app.set('upload-path', '/uploads/');

app.set('port', process.env.PORT || 5000)

function log() {
  if (app.get('debug')) {
    console.log.apply(console, arguments);
  }
}

function FileInfo(file, host) {
  this.name = file.name;
  this.size = file.size;
  this.type = file.type;
  this.delete_type = 'DELETE';

  host = host || (app.get('bucket') + '.s3.amazonaws.com');

  baseUrl = (app.get('use-ssl') ? 'https:' : 'http:') + '//' + host + app.get('upload-path');
  this.url = this.delete_url = baseUrl + encodeURIComponent(this.name);
}

function setDefaultHeaders(response) {
  response.setHeader(
    'Access-Control-Allow-Origin',
    app.get('access-control').allowOrigin
  );

  response.setHeader(
    'Access-Control-Allow-Methods',
    app.get('access-control').allowMethods
  );
}

function handleResult(request, response, result, redirect) {
  var jsonResult = JSON.stringify(result)

  if (redirect) {
    var redirectURL = redirect.replace(/%s/, encodeURIComponent(jsonResult));
    log('Redirecting to ' + redirectURL)
    response.redirect(redirectURL)
  } else {
    var contentType = request.headers.accept.indexOf('application/json') !== -1 ? 'application/json' : 'text/plain';

    log('Returning content ' + jsonResult)
    setDefaultHeaders(response);

    response.set('Content-Type', contentType);
    response.send(jsonResult);
  }
}

// Configuration

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
  app.use(express.logger());

  app.set('debug', true);
});

app.configure('production', function(){
  app.use(express.errorHandler());
  app.set('debug', false);
});

// Routes

app.get('/', function(request, response) {
  response.send('Hello!')
});

app.options('/upload', function (request, response) {
  setDefaultHeaders(response);
  response.end();
});

app.post('/upload', function(request, response) {
  log('starting upload');

  // parse
  var form = new formidable.IncomingForm(), files = {};

  form.maxFieldsSize = 20 * 1024 * 1024; // 20mb
  form.keepExtensions = true;

  var errors = [];

  form.on('file', function(name, file) {
    log("%s uploaded successfully, sending it to to the %s bucket in s3", file.name, app.get('bucket'));

    var startTime = new Date(),
        options = {
          BucketName : app.get('bucket'),
          ObjectName : app.get('upload-path') + file.name,
          ContentLength : file.length,
          ContentType: file.type,
          Body : fs.createReadStream(file.path),
          Acl: app.get('policy')
        }

    log('Public file URL: %s', new FileInfo(file).url);

    s3.PutObject(options, function(errors, data) {
      var elapsed = (new Date() - startTime) / 1000;

      log('S3 upload complete in %s seconds.', elapsed);
      log('Errors: ', errors);
      log('Data: ', data);

      fs.unlink(file.path);
    });
  });

  form.on('error', function(err) {
    log('formidable error', err);
  });

  form.on('field', function(name, value) {
    log('field received: %s=%s', name, value);
  });

  form.on('end', function() {
    log('formidable end');
  });

  form.parse(request, function(err, fields, files) {
    var filesInfo = _(files).map(function (file) { return new FileInfo(file) });
    handleResult(request, response, filesInfo, fields.redirect)
  });
});

app.listen(app.get('port'));
console.log("Express server listening on port %d in %s mode", app.get('port'), app.settings.env);