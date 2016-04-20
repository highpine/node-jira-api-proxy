var url = require('url');
var querystring = require('querystring');
var request = require('request');
var proxyConfig = require('./config.json');

/**
 * Jira Api Proxy.
 *
 * @param {string} serviceUrl - Jira base URL.
 * @param {string} mountPath - Proxy mount path. Will be cut off from the request url.
 * @param {string} apiVersion - Api version. Optional. Default is 'latest'.
 * @param {string} authVersion - Auth version. Optional. Default is 'latest'.
 * @constructor
 */
var JiraApiProxy = function (serviceUrl, mountPath, apiVersion, authVersion) {

    this.apiVersion = apiVersion || 'latest';
    this.authVersion = authVersion || 'latest';
    this.mountPath = mountPath;
    this.urlOptions = url.parse(serviceUrl);

    this.strictSSL = proxyConfig.strictSSL;

    var userToken;

    this.setStrictSSL = function (strictSSL) {
        this.strictSSL = !!strictSSL;
    };

    this.setUserToken = function (token) {
        userToken = token;
    };

    this.getUserToken = function () {
        return userToken;
    }
};

(function () {
    /**
     * Get Headers Preset.
     * @returns {object}
     */
    this.getHeadersPreset = function () {
        return proxyConfig.headersPreset;
    };

    /**
     * Proxy headers matching starting with "X-Jira-Proxy-" from original request to Jira Api.
     * @param {object} originalHeaders
     * @returns {object}
     */
    this.proxyHeaders = function (originalHeaders) {
        return Object.keys(originalHeaders).reduce(function (previous, originalHeaderKey) {
            if (originalHeaderKey.indexOf(proxyConfig.proxyHeaderPrefix) === 0) {
                var headerKey = originalHeaderKey.substring(proxyConfig.proxyHeaderPrefix.length);
                previous[headerKey] = originalHeaders[originalHeaderKey];
            }
            return previous;
        }, this.getHeadersPreset());
    };

    this.proxyParams = function (originalParams) {
        return originalParams;
    };

    this.proxyMethod = function (originalMethod) {
        return originalMethod;
    };

    this.proxyUrl = function (originalUrl) {
        var relativeUrl = this.getRelativeUrl(originalUrl);
        var remotePath = isAuthRequest(relativeUrl) ?
        proxyConfig.remoteAuthPath + this.apiVersion :
        proxyConfig.remoteApiPath + this.authVersion;
        var uri = url.format({
            protocol: this.urlOptions.protocol,
            hostname: this.urlOptions.hostname,
            port: this.urlOptions.port,
            pathname: remotePath + relativeUrl
        });
        return decodeURIComponent(uri);
    };

    function isAuthRequest(requestUrl) {
        return proxyConfig.authResources.some(function (resource) {
            return requestUrl.indexOf(resource) === 0;
        });
    }

    this.getRelativeUrl = function (originalUrl) {
        return originalUrl.replace(this.mountPath, '');
    };

    this.authorizeRequest = function (options) {
        if (this.getUserToken()) {
            options.headers.cookie = this.getUserToken().name + '=' + this.getUserToken().value;
        }
    };

    this.relay = function (request, callback) {
        var options = {};
        options.url = this.proxyUrl(request.originalUrl || request.url);
        options.method = this.proxyMethod(request.method);

        request.headers = request.headers || {};
        options.headers = this.proxyHeaders(request.headers);

        if (request.is('json')) {
            options.json = true;
            options.body = this.proxyParams(request.body);
        } else {
            options.body = querystring.stringify(this.proxyParams(request.params));
        }

        this.request(options, callback);
    };

    this.request = function (options, callback) {
        options.rejectUnauthorized = this.strictSSL;
        this.authorizeRequest(options);

        console.log('Requesting:', options);
        request(options, function (error, response, body) {
            console.log(error, response && response.statusCode, body);
            callback(error, response, body);
        });
    };

}).call(JiraApiProxy.prototype);

/**
 * Jira Api Proxy Registry.
 *
 * @param {string} serviceUrl - Jira base URL.
 * @param {string} mountPath - Proxy mount path. Will be cut off from the request url.
 * @param {string} apiVersion - Api version. Optional. Default is 'latest'.
 * @param {string} authVersion - Auth version. Optional. Default is 'latest'.
 * @constructor
 */
var JiraApiProxyRegistry = function (serviceUrl, mountPath, apiVersion, authVersion) {

    var anonymous;
    var proxiesRegistry = {};

    function jiraProxyFactory() {
        return new JiraApiProxy(serviceUrl, mountPath, apiVersion, authVersion);
    }

    function authorizedJiraProxyFactory(token) {
        var jiraProxy = jiraProxyFactory();
        jiraProxy.setUserToken(token);
        return jiraProxy;
    }

    function getTokenHash(token) {
        return querystring.stringify(token);
    }

    this.anonymous = function () {
        if (!anonymous) {
            anonymous = jiraProxyFactory();
        }
        return anonymous;
    };

    this.withToken = function (token) {
        if (!token) {
            return this.anonymous();
        }
        this.registerToken(token);
        var tokenHash = getTokenHash(token);
        return proxiesRegistry[tokenHash];
    };

    this.registerToken = function (token) {
        var tokenHash = getTokenHash(token);
        if (!(tokenHash in proxiesRegistry)) {
            proxiesRegistry[tokenHash] = authorizedJiraProxyFactory(token);
        }
    };

    this.dropToken = function (token) {
        var tokenHash = getTokenHash(token);
        if (tokenHash in proxiesRegistry) {
            delete proxiesRegistry[tokenHash];
        }
    };
};

module.exports.JiraApiProxy = JiraApiProxy;
module.exports.JiraApiProxyConfig = proxyConfig;
module.exports.JiraApiProxyRegistry = JiraApiProxyRegistry;