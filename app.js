/* Import required modules */
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var webdav = require('webdav-server').v2;
var fs = require('fs');
const { config } = require('process');

// User manager (setup coder based on ENV PASSWORD)
const username = process.env.WEBDAV_USER || 'user';
const password = process.env.WEBDAV_PASS;
const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser(username, password, false);

/* Create the Express web server and the router to handle requests */
var app = express();
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Privilege manager (tells which users can access which files/folders)
const privilegeManager = new webdav.SimplePathPrivilegeManager();
privilegeManager.setRights(user, '/', [ 'all' ]);

// Mount the WebDAVServer instance
var webdav_server = new webdav.WebDAVServer({
    httpAuthentication: new webdav.HTTPDigestAuthentication(userManager, 'Default realm'),
    privilegeManager: privilegeManager,
    requireAuthentification: true,
    isVerbose: true
});

webdav_server.afterRequest((ctx, next) => {
    // Display the method, the URI, the returned status code and the returned message
    console.log(`WEBDAV ${ctx.request.method} ${ctx.request.url} ${ctx.response.statusCode} ${ctx.response.statusMessage}`);
    next();
});

const ROOT_WEBDAV_FOLDER = path.resolve(__dirname, 'files');
webdav_server.setFileSystem('/', new webdav.PhysicalFileSystem(ROOT_WEBDAV_FOLDER), (success) => {
    console.log(`Mounting ${ROOT_WEBDAV_FOLDER} as webdav resource`, success);
});

// hook get/head to the static handler so that it returns the last-modified header
var filesStatic = express.static(ROOT_WEBDAV_FOLDER);
app.use('/webdav', function (req, res, next) {
    if(req.method === 'GET' || req.method === 'HEAD') {
        filesStatic(req, res, next);
    } else {
        next();
    }
  });

app.use(webdav.extensions.express('/webdav', webdav_server));

/* create the configuration for the front end client */
var configuration = JSON.parse(fs.readFileSync(path.join(__dirname, 'kw-config.json')));
fs.readdir(ROOT_WEBDAV_FOLDER, (err, files) => {
    files.filter(fn => fn.endsWith('.kdbx')).forEach(file => {
        configuration.files.push({
            "storage": "webdav",
            "name": `${file}`,
            "path": `https://${process.env.WEBSITE_HOSTNAME}/webdav/${file}`,
            "options": { "user": "", "password": "" }
            });
    });
});
app.use('/kw-config.json', function(req, res, next) {
    res.json(configuration);
});

/** All else failed, return the 404 page */
app.use('/', function (req, res, next) {
    res.status(404).sendFile(__dirname + '/public/404.html');
});

module.exports = app;
