= Cloud Uploader

An upload server that enables you to upload large files to Amazon S3. It should be used with the [jQuery File Upload](http://blueimp.github.com/jQuery-File-Upload/) plugin, and it is ready for deploying in Heroku.

== Installing and Running

After cloning the repository, you will need to install [Node.js](http://nodejs.org/), [NPM](https://npmjs.org/) and [Redis](http://redis.io). Then just run:

    npm install

You need to set your AWS key, bucket and secret using environment variables:

   export AWS_KEY=<YOUR_KEY_HERE>
   export AWS_SECRET=<YOUR_SECRET_HERE>
   export AWS_BUCKET=<YOUR_BUCKET_HERE>

Finally start the server by:

    node app

== Configuration

Besides the AWS key and secret you may also configure other aspects of the server, like specifying the hosts allowed to upload files, the server port, whether to use SSL or not for files, etc. Here are the environment variable that can be used:

* AWS_REGION: The AWS region to be used (defaults to US_EAST_1)
* AWS_POLICY: The policy to be used for uploaded files (defaults to public-read)
* ALLOW_ORIGIN: A comman separated list of hosts that are allowed to upload files (Controls the Access-Control-Allow-Origin header. Defaults to '*')
* REDISTOGO_URL: The URL of the redis server (Defaults to localhost:6379)
* USE_SSL: Whether returned URLs should use HTTPS or HTTP
* PORT: The server port