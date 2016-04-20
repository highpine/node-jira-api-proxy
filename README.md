# node-jira-api-proxy
Node.js Jira API proxy library

Example usage with Express.js:

**server.js**
```
var app = express();
app.set('jira-proxy', new jiraProxy.JiraApiProxyRegistry(process.env.JIRA_URL, '/api/jira/proxy'));
app.use('/jira', require('./routes/jira'));
```

**routes/jira.js**
```
var express = require('express');
var router = express.Router();

var jira = require('jira-api-proxy');

var jiraApiProxy = new jira.JiraApiProxy('http://your-jira.com', '/api/jira/proxy');

router.post('/authorize', function (req, res, next) {
    var request = {__proto__: req};
    request.originalUrl = request.url = '/session';
    jiraApiProxy.relay(request, function(error, response, body) {
        if (error) {
            next(error);
            return;
        }
        if (body && body.session) {
            jiraApiProxy.setUserToken(body.session);
        }
        res.statusCode = response.statusCode;
        res.append('Content-Type', response.headers['content-type']);
        res.json(body);
    });
});

router.get(/\/proxy(\/.*)?/, function(req, res, next) {
    jiraApiProxy.relay(req, function(error, response, body) {
        if (error) {
            next(error);
            return;
        }
        res.statusCode = response.statusCode;
        res.append('Content-Type', response.headers['content-type']);
        res.end(body);
    });
});
```