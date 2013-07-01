# Cloud Uploader

An upload server that enables you to upload large files to Amazon S3. It should be used with the [jQuery File Upload](http://blueimp.github.com/jQuery-File-Upload/) plugin, and it is ready for deploying in Heroku.

## Installing and Running

After cloning the repository, you will need to install [Node.js](http://nodejs.org/), [NPM](https://npmjs.org/) and [Redis](http://redis.io). Then just run:

    npm install

You need to set your AWS key, bucket and secret using environment variables:

    export AWS_KEY=<YOUR_KEY_HERE>
    export AWS_SECRET=<YOUR_SECRET_HERE>
    export AWS_BUCKET=<YOUR_BUCKET_HERE>

And need your PUSHER app id, key and secret using environment variables:

  export PUSHER_APP_ID=<YOUR_APP_ID_HERE>
  export PUSHER_KEY=<YOUR_KEY_HERE>
  export PUSHER_SECRET=<YOUR_SECRET_HERE>

Finally start the server by:

    node app

## Configuration

Besides the AWS key and secret you may also configure other aspects of the server, like specifying the hosts allowed to upload files, the server port, whether to use SSL or not for files, etc. Here are the environment variable that can be used:

* `AWS_REGION`: The AWS region to be used (defaults to US_EAST_1)
* `AWS_POLICY`: The policy to be used for uploaded files (defaults to public-read)
* `ALLOW_ORIGIN`: A comman separated list of hosts that are allowed to upload files (Controls the Access-Control-Allow-Origin header. Defaults to '*')
* `UPLOAD_PATH`: The path within the bucket where files should be stored (defaults to `uploads`)
* `REDISTOGO_URL`: The URL of the redis server (defaults to localhost:6379)
* `USE_SSL`: Whether returned URLs should use HTTPS or HTTP
* `PORT`: The server port

When uploading a file you override the default bucket, policy, uploadPath and whether to use SSL by sending parameters with the uploaded form file. The parameters are the following ones:

* `bucket`: The bucket used to upload the file to S3. Note that you should have permission to PUT files in this bucket.
* `policy`: The policy to be used for uploaded files (public-read, authenticated-read, etc)
* `uploadPath`: The path within the bucket where files should be stored
* `useSSL`: Whether returned URLs should use HTTPS or HTTP

## Security

You should probably think about how to prevent malicious user from uploading files into your S3 account once you've deployed the Cloud Uploader into your server. Since we try to be compatible with jQuery File Upload, we created a simple security measure that will prevent unwanted file uploads, while still being able to support uploads in IE.

It works by verifying a hash generated with a secret that both the upload server and the application must know. The secret may be any value you want, only make sure it is well protected. It should be given to the application through environment variable `SECURITY_SECRET`. If it is not set, then the uploads will not be protected at all, and anyone that knows your server URL will be able to upload files to it.

The hash should be generated with the following logic: the first 10 characters should be the current timestamp in seconds, then the next 10 characters a random number, finally the next 40 characters should be the SHA1 hex of the timestamp, the random number and the secret, concatenated.

For example, suppose a timestamp of `12345667890`, and a random number of `9876543210`, with a secret of `aSecretPass`, the generated hash should be:

    1234566789098765432108d128da83b95dd484381a15059e726898c80c8d3

The timestamp will make sure that a malicious user can't use this hash over and over again, since it will only be valid by a small period of time. This can be configured using the `SECURITY_SECRET_EXPIRATION` environment variable. If it is not set, it will default to 600, which means that hashes will be expired in 5 minutes.
