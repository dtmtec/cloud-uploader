var app = require('./app');

app.listen(app.get('port'));
console.log("Express server listening on port %d in %s mode", app.get('port'), app.settings.env);
