/**
* Module dependencies.
*/

var express    = require('express'),
    formidable = require('formidable'),
    awssum     = require('awssum'),
    amazon     = awssum.load('amazon/amazon'),
    S3         = awssum.load('amazon/s3').S3,
    fs         = require('fs'),
    redis      = require('redis-url'),
    crypto     = require('crypto'),
    XRegExp    = require('xregexp').XRegExp,
    _          = require("underscore")._,
    Pusher     = require('pusher'),
    AWS        = require('aws-sdk');

var s3 = new S3({
  'accessKeyId'     : process.env.AWS_KEY,
  'secretAccessKey' : process.env.AWS_SECRET,
  'region'          : process.env.AWS_REGION || amazon.US_EAST_1
});

var app = module.exports = express();

var db = redis.createClient(process.env.REDISTOGO_URL);
var pusher;
var AsciiOnlyRegexp = XRegExp("[^\\s\\_\\-\\.\\p{Ascii}]+", "g")

app.set('access-control', {
  allowOrigin: process.env.ALLOW_ORIGIN || '*',
  allowMethods: 'OPTIONS, GET, POST'
});

app.set('bucket', process.env.AWS_BUCKET);
app.set('policy', process.env.AWS_POLICY || 'public-read');
app.set('use-ssl', process.env.USE_SSL);
app.set('upload-path', process.env.UPLOAD_PATH || 'uploads');
app.set('signed-url-expiration', process.env.SIGNED_URL_EXPIRATION || 900)

app.set('secret', process.env.SECURITY_SECRET);
app.set('secret_expiration', process.env.SECURITY_SECRET_EXPIRATION || 600); // 5 minutes of expiration

app.set('port', process.env.PORT || 5000)
app.set('pusherChannelName', process.env.PUSHER_CHANNEL_NAME || 'cloud-uploader')

function log() {
  if (app.get('debug')) {
    console.log.apply(console, arguments);
  }
}

if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET) {
  pusher = new Pusher({
    appId:  process.env.PUSHER_APP_ID,
    key:    process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET
  });
} else {
  console.log('PUSHER_APP_ID, PUSHER_KEY and PUSHER_SECRET are not set, pusher feature will not be available');
}

function FileInfo(file, options) {
  this.name = XRegExp.replace(file.name, AsciiOnlyRegexp, '');
  this.size = file.size;
  this.type = file.type;
  this.delete_type = 'DELETE';

  host   = options.bucket + '.s3.amazonaws.com';
  useSSL = options.useSSL && options.useSSL != 'false'

  baseUrl = (useSSL ? 'https:' : 'http:') + '//' + host + '/' + options.uploadPath + '/';
  this.url = this.delete_url = baseUrl + encodeURIComponent(this.name);

  if (!_(['public-read', 'public-read-write']).include(options.policy)) {
    var key = options.uploadPath + '/' + encodeURIComponent(this.name);
    this.url = signedUrl(key, options)
  }
}

function signedUrl(key, options) {
  var credentials = new AWS.Credentials(process.env.AWS_KEY, process.env.AWS_SECRET),
      awsS3 = new AWS.S3(credentials)

  return awsS3.getSignedUrl('getObject', {Bucket: options.bucket, Key: key, Expires: options.signedUrlExpiration})
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

function contentTypeFor(request) {
  return request.headers.accept && request.headers.accept.indexOf('application/json') !== -1 ? 'application/json' : 'text/plain';
}

function handleResult(request, response, result, redirect) {
  var jsonResult = JSON.stringify(result)

  if (redirect) {
    var redirectURL = redirect.replace(/%s/, encodeURIComponent(jsonResult));
    log('Redirecting to ' + redirectURL)
    response.redirect(redirectURL)
  } else {
    log('Returning content ' + jsonResult)
    setDefaultHeaders(response);

    response.set('Content-Type', contentTypeFor(request));
    response.send(jsonResult);
  }
}

function validToken(value) {
  var secret           = app.get('secret'),
      expiration       = app.get('secret_expiration'),
      currentTimestamp = Math.round(new Date().getTime()/1000),
      timestamp        = parseInt(value.substr(0,  10), 10),
      random           = value.substr(10, 10),
      hash             = value.substr(20),
      shasum           = crypto.createHash('sha1')

  shasum.update('' + timestamp + random + secret)
  digest = shasum.digest('hex')

  return timestamp + expiration > currentTimestamp && hash == digest
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

app.get('/status', function(request, response) {
  setDefaultHeaders(response);

  if (request.query.file) {
    db.get(request.query.file, function (error, redis_response) {
      error = redis_response == 'error' ? 'upload-failed' : error

      if (!error) {
        // key is deleted when upload is finished, so it should have an empty response
        response.jsonp({finished_uploading: _(redis_response).isEmpty()})
      } else {
        response.jsonp(500, [{error: error}])
      }
    })
  } else {
    response.jsonp(400, [{error: 'You must pass a file parameter.'}])
  }
});

app.options('/upload', function (request, response) {
  setDefaultHeaders(response);
  response.end();
});

app.post('/upload', function(request, response) {
  var form          = new formidable.IncomingForm(),
      secret        = app.get('secret'),
      valid         = _(secret).isUndefined(),
      expireUpload  = 10 * 24 * 60 * 60, // 10 days
      channelName   = app.get('pusherChannelName')
      uploadOptions = {
        bucket:              app.get('bucket'),
        uploadPath:          app.get('upload-path'),
        policy:              app.get('policy'),
        useSSL:              app.get('use-ssl'),
        signedUrlExpiration: app.get('signed-url-expiration')
      };

  log('starting upload');

  form.maxFieldsSize = 20 * 1024 * 1024; // 20mb
  form.keepExtensions = true;

  form.on('file', function(name, file) {
    if (!valid) {
      log('Invalid token given, not uploading file to amazon')
      return
    }

    var startTime = new Date(),
        filename  = XRegExp.replace(file.name, AsciiOnlyRegexp, ''),
        options = {
          BucketName : uploadOptions.bucket,
          ObjectName : uploadOptions.uploadPath + '/' + filename,
          ContentLength : file.size,
          ContentType: file.type,
          Body : fs.createReadStream(file.path),
          Acl: uploadOptions.policy
        },
        fileInfo = new FileInfo(file, uploadOptions)

    log("%s uploaded successfully, sending it to to the %s bucket in s3", filename, uploadOptions.bucket);

    log('Public file URL: %s', fileInfo.url);

    db.setex(filename, expireUpload, JSON.stringify(fileInfo));

    log('Sending file with options: ', options)
    s3.PutObject(options, function(errors, data) {
      var elapsed = (new Date() - startTime) / 1000;

      log('S3 upload complete in %s seconds.', elapsed);
      log('Errors: ', errors);
      log('Data: ', data);

      if (errors) {
        db.setex(filename, expireUpload, 'error');
      } else {
        db.del(filename);
      }

      fs.unlink(file.path);

      if (pusher) {
        if (errors) {
          log('amazon upload failed, triggering upload-failed on pusher for ' + filename);
          pusher.trigger(channelName, 'upload-failed', errors);
        } else {
          log('amazon upload completed, triggering upload-completed on pusher for ' + filename)
          pusher.trigger(channelName, 'upload-completed', JSON.stringify(file));
        }
      }
    });
  });

  form.on('error', function(err) {
    log('formidable error', err);
  });

  form.on('field', function(name, value) {
    log('field received: %s=%s', name, value);

    if (secret && name == 'token') {
      valid = validToken(value)
    } else if (name == 'channel') {
      channelName = value
    } else {
      uploadOptions[name] = value // allows upload parameter to be overridden on a per-upload basis
    }
  });

  form.on('end', function() {
    log('formidable end');
  });

  form.parse(request, function(err, fields, files) {
    if (valid) {
      var filesInfo = _(files).map(function (file) {
        return new FileInfo(file, uploadOptions)
      });

      handleResult(request, response, filesInfo, fields.redirect)
    } else {
      response.jsonp(403, [{error: 'Forbidden'}])
    }
  });
});

module.exports = app;
