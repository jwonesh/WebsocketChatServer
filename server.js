var ws = require("nodejs-websocket");
var MongoClient = require('mongodb').MongoClient
var assert = require('assert');
var app = require('express')();
var session = require('express-session');
var FileStore = require('session-file-store')(session);
var http = require('http');
var bodyParser = require('body-parser');
var fs = require('fs');

////////////////////////////////////////////////////////////////////////

var mongoUrl = 'mongodb://localhost:7999/chatapp';

var insertUsers = function(db, docs, callback) {
  // Get the documents collection
  var collection = db.collection('users');
  // Insert some documents
  collection.insertMany(docs, function(err, result) {
    assert.equal(err, null);
    assert.equal(docs.length, result.result.n);
    assert.equal(docs.length, result.ops.length);
    console.log("Inserted " + docs.length + " documents into the collection");
    callback(result);
  });
};

var findUsers = function(username, callback, db) {
  // Get the documents collection
  
  // Find some documents
  var argObj = {};
  if (!!username){
    argObj.username = username;
  }

  var cb = function(_db){
    var collection = _db.collection('users');
    collection.find(argObj).toArray(function(err, docs) {
        assert.equal(err, null);
        console.log("Found the following records");
        console.log(docs);
        callback(docs);
    });
  };

  if (!!db){
    cb(db);
  } else{
    connect(cb);
  }

};

var connect = function(cb){
    MongoClient.connect(mongoUrl, function(err, db) {
      assert.equal(null, err);
      console.log("Connected successfully to server");
      cb(db);
      db.close();
    });
};

////////////////////////////////////////////////////

app.use(require('morgan')('dev'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var cookieName = 'chatapp-session';

app.use(session({
  name: cookieName,
  secret: 'kmnrkhwe-r9y2134bvbsdflkfsdnzuighasdf6542368123409uhnsafdbjk12',
  saveUninitialized: true,
  resave: true,
  store: new FileStore()
}));

app.post('/login', function (req, res) {
    var user = req.body;
    var callback = function(users){
        if (users.length !== 1){
            res.status(401);
            res.send(JSON.stringify({error: -1}));
        } else{
            if (users[0].password !== user.password){
                res.status(401);
                res.send(JSON.stringify({error: -1}));
            } else{
                res.status(200);
                res.send(JSON.stringify({error: 0}));
            }
        }
    };

    findUsers(user.username, callback, null);
});

app.get('/validateSession', function(req, res){
    console.log(JSON.stringify(req.headers));
    console.log(JSON.stringify(req.session));
    res.send(JSON.stringify({valid: true}))
});

var express = app.listen(3000, function () {
  var host = express.address().address;
  var port = express.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});





var loggedInUsers = [];



var server = ws.createServer(function (conn) {

   
    conn.on("text", function (str) {
        try{
            console.log("Received "+str);
            var headers = conn.headers;
            var event = parseMessage(str);
            console.log("username: " + conn.username);

            handleEvent(conn, event);
        } catch (e){
            console.log(e);
        }
    });

    conn.on("close", function (code, reason) {
        var index = -1;
        for (var j = 0; j < loggedInUsers.length; j++){
            if (loggedInUsers[j].username === conn.username){
                index = j;
            }
        }
        if (!!conn.loggedIn){
            loggedInUsers.splice(index, 1);
            for (var i = 0; i < loggedInUsers.length; i++){
                var c = loggedInUsers[i].conn;
                console.log("sending forced logout call to: " + c.username);
                sendMessage(c, JSON.stringify({data: {username: conn.username}, type: "USER_LOGGED_OUT"}), {cbid: -2}, {});
            }
            }
        console.log("Connection closed");
    });

    conn.on("error", function(errorObj){
    	console.log("Error!");
    });

    conn.on("open", function(data){
        conn.sendText(JSON.stringify({cbid: -1}))
    });

    var sendUsers = function(conn, event){
        sendMessage(conn, users, event)
    };


    var parseMessage = function(message){
        return JSON.parse(message);
    };

    var handleEvent = function(conn, event){
        var action = actions[event.type];
        if (!!action){
            action(conn, event);
        } else{
            conn.sendText(JSON.stringify({cbid: -1, message: "Cannot parse event."}));
        }
    };

    var sendMessage = function(conn, message, event, headers){
        var wrapper = {};
        wrapper.cbid = event.cbid;
        console.log("cbid: " + event.cbid);
        wrapper.message = message;
        wrapper.error = 0;
        wrapper.headers = headers;
        console.log("sent: " + JSON.stringify(wrapper));
        conn.sendText(JSON.stringify(wrapper));
    };

    var sendError = function(conn, message, event, headers){
        var wrapper = {};
        wrapper.cbid = event.cbid;
        console.log("cbid: " + event.cbid);
        wrapper.message = message;
        wrapper.error = 1;
        console.log("sent: " + JSON.stringify(wrapper));
        wrapper.headers = headers;
        conn.sendText(JSON.stringify(wrapper));
    };


    var actions = {};

    var loginAction = function(conn, event){
        console.log("conn = " + conn);

        var connGetter = function(conn){
            return function(){
                return conn;
            }
        }(conn);
        var post_data = JSON.stringify({
                'username': new String(event.body.username),
                'password': new String(event.body.password)
            });

            var options = createRestOptions('localhost', '3000', '/login', 'POST', {
                'Content-type': 'application/json',
                'Content-Length': Buffer.byteLength(post_data)
            });

            var req = sendHttpRequest(options, function(data, headers, status){
                var response = JSON.parse(data);
                        console.log("conn = " + connGetter());
                if (response.error === 0){
                    connGetter().username = event.body.username;
                    connGetter().loggedIn = true;             
                    for (var i = 0; i < loggedInUsers.length; i++){
                        var c = loggedInUsers[i].conn;
                        if (connGetter().username === loggedInUsers[i].username){
                            sendMessage(c, JSON.stringify({data: {}, type: "FORCE_LOGOUT"}), {cbid: -2}, {});
                        } else{
                            sendMessage(c, JSON.stringify({data: {username: event.body.username}, type: "USER_LOGGED_IN"}), {cbid: -2}, {});
                        }
                    }
                    sendMessage(conn, "Login OK.", event, headers['set-cookie']);

                    loggedInUsers.push({username: event.body.username, conn: connGetter()});
                } else{
                    sendError(connGetter(), "Invalid username or password.", event);
                }
            });

            console.log("writing: " + post_data);
            req.write(post_data);
            req.end();
    };

    var testAction = function(conn, event){
        var post_data = null;

        var options = createRestOptions('localhost', '3000', '/validateSession', 'GET', {

        });

        var req = sendHttpRequest(options, function(data, headers, status){
            var response = JSON.parse(data);

            if (response.error === 0){
                sendMessage(conn, "Login OK.", event, headers['set-cookie']);
            } else{
                sendError(conn, "Invalid username or password.", event);
            }
        });

        console.log("writing: " + post_data);
        req.write(post_data);
        req.end();
    };

    var getLoggedInUsersAction = function(conn, event){
        if (!conn.loggedIn){
            return;
        }
       
        var users = [];
        for (var i = 0; i < loggedInUsers.length; i++){
            if (conn.username !== loggedInUsers[i].username){
                users.push({username: loggedInUsers[i].username});
            }
        }
         console.log("sending user list: " + JSON.stringify(users));
         sendMessage(conn, JSON.stringify(users), event, {});
    };

    var sendUserMessage = function(conn, event){
        var receiveConn = null;
        for (var i = 0; i < loggedInUsers.length; i++){
            if (loggedInUsers[i].username === event.body.username){
                receiveConn = loggedInUsers[i].conn;
            }
        }
        sendMessage(receiveConn, JSON.stringify({data: {message: event.body.message, from: conn.username, isGroupChat: false, participants: [{username: conn.username}]}, type: "RECEIVE_MESSAGE"}), {cbid: -2}, {});
    };

    actions["LOGIN"] = loginAction;
    actions["TEST"] = testAction;
    actions["GET_LOGGED_IN_USERS"] = getLoggedInUsersAction;
    actions["SEND_MESSAGE"] = sendUserMessage;

});
server.listen(8001);

var createRestOptions = function(host, port, path, method, headers){
    var req = {
      host: host,
      port: port,
      path: path,
      method: method,
      headers: headers
    };

    return req;
  };

var sendHttpRequest = function(request_options, cb){
    return http.request(request_options, function(res) {
      res.setEncoding('utf8');
      var buffer = "";
      res.on('data', function (chunk) {
          buffer += chunk;
      });

      res.on('end', function(){
        console.log(JSON.stringify(res.headers));
        cb(buffer, res.headers, res.status);
      });
    });
};


