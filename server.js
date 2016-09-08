var ws = require("nodejs-websocket");
var assert = require('assert');

//var session = require('express-session');
var http = require('http');

var fs = require('fs');

////////////////////////////////////////////////////////////////////////

var loggedInUsers = [];
var conversations = {};
var conversationIndex = 0;



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
                    var loggedInUserIndex = -1;             
                    for (var i = 0; i < loggedInUsers.length; i++){
                        var c = loggedInUsers[i].conn;
                        if (connGetter().username === loggedInUsers[i].username){
                            loggedInUserIndex = i;
                            sendMessage(c, JSON.stringify({data: {}, type: "FORCE_LOGOUT"}), {cbid: -2}, {});
                        } else{
                            sendMessage(c, JSON.stringify({data: {username: event.body.username}, type: "USER_LOGGED_IN"}), {cbid: -2}, {});
                        }
                    }

                    if (loggedInUserIndex >= 0){
                        loggedInUsers.splice(loggedInUserIndex, 1);
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

    var registerAction = function(conn, event){
        var connGetter = function(conn){
            return function(){
                return conn;
            }
        }(conn);
        var post_data = JSON.stringify({
                'username': new String(event.body.username),
                'password': new String(event.body.password)
            });

            var options = createRestOptions('localhost', '3000', '/register', 'POST', {
                'Content-type': 'application/json',
                'Content-Length': Buffer.byteLength(post_data)
            });

            var req = sendHttpRequest(options, function(data, headers, status){
                var response = JSON.parse(data);
                        console.log("conn = " + connGetter());
                if (response.error === 0){
                    sendMessage(conn, "Register OK.", event, {});
                } else{
                    sendError(connGetter(), "Error registering.", event);
                }
            });

            console.log("writing: " + post_data);
            req.write(post_data);
            req.end();
    };

    var getLoggedInUsersAction = function(conn, event){
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
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
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
        }

        var conversation = conversations[event.body.cid];
        if (!conversation){
            sendError(conn, "Cannot find conversation.", event);
            return;
        } else{
            var userInConvo = true;

            for (var k = 0; k < conversation.participants.length; k++){
                if (conversation.participants[k] === conn.username){
                    userInConvo = true;
                }

            }

            if (!userInConvo){
                sendError(conn, "Not in conversation.", event);
                return;
            }
        }
       
        var receiveConn = null;
        for (var i = 0; i < conversation.participants.length; i++){
            if (conversation.participants[i] !== conn.username){
                for (var j = 0; j < loggedInUsers.length; j++){
                    if (loggedInUsers[j].username === conversation.participants[i]){
                        receiveConn = loggedInUsers[j].conn;
                        sendMessage(receiveConn, JSON.stringify({data: {message: event.body.message, from: conn.username, cid: event.body.cid, participants: conversation.participants, isGroupChat: conversation.participants.length > 2}, type: "RECEIVE_MESSAGE"}), {cbid: -2}, {});
                    }
                }
            }

            if (loggedInUsers[i].username === event.body.username){
                receiveConn = loggedInUsers[i].conn;
            }
        }

        sendMessage(conn, JSON.stringify({}), event, {});
    };

    var createConversation = function(conn, event){
        if (!conn.loggedIn){
            return;
        }
        //this could blow up memory
        var conversation = {};
        conversation.id = conversationIndex++;
        conversation.from = conn.username;
        conversation.participants = event.body.participants;
        conversations[conversation.id] = conversation;

        sendMessage(conn, JSON.stringify({id: conversation.id}), event, {});
    };

    var addUserToConversation = function(conn, event){
        if (!conn.loggedIn){
            return;
        }

        //not side-effect free
        if (!validateConversation(conn, event)){
            return;
        }

        var convo = conversations[event.body.cid];
        var participantList = [];
        for (var j = 0; j < convo.participants.length; j++){
            if (convo.participants[j] === event.body.username){
                sendError(conn, "User aleady in conversation.", event);
                return;
            }

            participantList.push(convo.participants[j]);
        }

        participantList.push(event.body.username);
        
        var c = null;
        var filteredConnections = [];
        for (var i = 0; i < loggedInUsers.length; i++){
            if (loggedInUsers[i].username === event.body.username){
                c = loggedInUsers[i].conn;
                filteredConnections.push(c);
            } else if (loggedInUsers[i].username !== conn.username){
                filteredConnections.push(loggedInUsers[i].conn);
            }
        }

        if (c === null){
            sendError(conn, "User not logged in.", event);
            return;
        }

        for (var k = 0; k < filteredConnections.length; k++){
            sendMessage(filteredConnections[k], JSON.stringify({data: {cid: event.body.cid, participants: participantList, addedBy: event.body.from, addedUser: event.body.username}, type: "ADD_USER_TO_CONVERSATION"}), {cbid: -2}, {});
        }
        
        sendMessage(conn, JSON.stringify({}), event, {});

        convo.participants.push(event.body.username);
    };

    var validateConversation = function(conn, event){
        var conversation = conversations[event.body.cid];
        var filteredUserList = [];
        if (!conversation){
            sendError(conn, "Cannot find conversation.", event);
            return false;
        } else{
            var userInConvo = false;

            for (var k = 0; k < conversation.participants.length; k++){
                if (conversation.participants[k] === conn.username){
                    userInConvo = true;
                    break;
                }
            }

            if (!userInConvo){
                sendError(conn, "Not in conversation.", event);
                return false;
            }
        }

        return true;
    };

    actions["LOGIN"] = loginAction;
    actions["REGISTER"] = registerAction;
    actions["GET_LOGGED_IN_USERS"] = getLoggedInUsersAction;
    actions["SEND_MESSAGE"] = sendUserMessage;
    actions["CREATE_CONVERSATION"] = createConversation;
    actions["ADD_USER_TO_CONVERSATION"] = addUserToConversation;

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


