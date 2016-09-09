var ws = require("nodejs-websocket");
var assert = require('assert');

//var session = require('express-session');
var http = require('http');

var fs = require('fs');
var unirest = require('unirest');

////////////////////////////////////////////////////////////////////////

var loggedInUsers = [];
var conversations = {};
var conversationIndex = 0;
var voiceChatRooms = null;

unirest.get('http://localhost:3000/voice/room/all')
  .end(function(res) {
    if (res.error) {
      console.log('GET error', res.error)
    } else {
      console.log('GET response', res.body)
      voiceChatRooms = {};

      voiceChatRooms["lobby"] = {name: "Lobby", owner: "Server", created_by: "Server", participants: []};
      for (var i = 0; i < res.body.length; i++){
        voiceChatRooms[res.body[i].name.toLowerCase()] = res.body[i];
        voiceChatRooms[res.body[i].name.toLowerCase()].participants = [];
      }      
    }
});


var server = ws.createServer(function (conn) {
    //populate voice chat rooms


   
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
        if (!!conn.loggedIn){
            var index = -1;
            for (var j = 0; j < loggedInUsers.length; j++){
                if (loggedInUsers[j].username === conn.username){
                    index = j;
                    break;
                }
            }

            for (var k in voiceChatRooms){
                var participants = voiceChatRooms[k].participants;
                for (var l = 0; l < participants.length; l++){
                    if (participants[l] === conn.username){
                        participants.splice(l, 1);
                        break;
                    }
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
        }
        console.log("Connection closed");
    });

    conn.on("binary", function (inStream) {
        var connGetter = function(conn){
            return function(){
                return conn;
            }
        }(conn);
        // Empty buffer for collecting binary data 
        var data = new Buffer(0);
        // Read chunks of binary data and add to the buffer 
        inStream.on("readable", function () {
            var newData = inStream.read();
            if (newData)
                data = Buffer.concat([data, newData], data.length+newData.length);
        })
        inStream.on("end", function () {
            console.log("Received " + data.length + " bytes of binary data");
            process_my_data(connGetter(), data);
        })
    });

    function process_my_data(conn, data){
        //broadcast to channel
        var chatRoom = voiceChatRooms[conn.currVoiceChatRoom];
        if (!conn.loggedIn){
            //sendError(conn, JSON.stringify({data: {username: conn.username}, type: "VOICE_CHAT_NOT_LOGGED_IN"}), {cbid: -2}, {});
            console.log("not lgoged in?");
            return;
        }

        //TODO: optimize this loop
        if (chatRoom !== undefined && chatRoom !== null){
            for (var i = 0; i < chatRoom.participants.length; i++){
                for (var j = 0; j < loggedInUsers.length; j++){
                    if (loggedInUsers[j].username === chatRoom.participants[i] && loggedInUsers[j].username !== conn.username){
                        conn.sendBinary(data, function(){});
                    }
                }
            }
        }
    };

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

                    var room = null;
                    for (var k in voiceChatRooms){
                        room = voiceChatRooms[k];

                        for (var l = 0; l < room.participants.length; l++){
                            if (room.participants[l] === event.body.username){
                                room.participants.splice(l, 1);
                                break;
                            }
                        }
                    }

                    voiceChatRooms["lobby"].participants.push(event.body.username);
                    connGetter().currVoiceChatRoom = "lobby";
                    var loggedInUserIndex = -1;             
                    for (var i = 0; i < loggedInUsers.length; i++){
                        var c = loggedInUsers[i].conn;
                        if (connGetter().username === loggedInUsers[i].username){
                            loggedInUserIndex = i;
                            c.loggedIn = false;
                            sendMessage(c, JSON.stringify({data: {}, type: "FORCE_LOGOUT"}), {cbid: -2}, {});
                        } else{
                            sendMessage(c, JSON.stringify({data: {username: event.body.username}, type: "USER_LOGGED_IN"}), {cbid: -2}, {});
                        }
                    }

                    if (loggedInUserIndex >= 0){
                        loggedInUsers.splice(loggedInUserIndex, 1);
                    }

                    sendMessage(connGetter(), "Login OK.", event, {});

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
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
            return;
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
            sendError(conn, "Not logged in.", event);
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
            sendError(conn, "Not logged in.", event);
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

    var createVoiceChatRoom = function(conn, event){
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
            return;
        }

        if (!!event.body.name && event.body.name.toLowerCase() === 'lobby'){
            sendError(conn, "Invalid request.", event);
            return;      
        }

        var connGetter = function(conn){
            return function(){
                return conn;
            }
        }(conn);

        //TODO: Validation of whether or not user can create chat room

        var post_data = JSON.stringify({
            'name': new String(event.body.name),
            'owner': new String(event.body.owner),
            'created_by': new String(conn.username)
        });

        var options = createRestOptions('localhost', '3000', '/voice/room', 'POST', {
            'Content-type': 'application/json',
            'Content-Length': Buffer.byteLength(post_data)
        });

        var req = sendHttpRequest(options, function(data, headers, status){
            var response = JSON.parse(data);
                    console.log("conn = " + connGetter());
            if (response.error === 0){
                voiceChatRooms[event.body.name.toLowerCase()] = event.body;
                voiceChatRooms[event.body.name.toLowerCase()].participants = [];
                var loggedInUserIndex = -1;             
                for (var i = 0; i < loggedInUsers.length; i++){
                    var c = loggedInUsers[i].conn;
                    //if (connGetter().username !== loggedInUsers[i].username){
                        //room names are implicitly unique
                        var to_send = JSON.parse(post_data);
                        to_send.participants = [];
                        sendMessage(c, JSON.stringify({data: to_send, type: "VOICE_CHAT_ROOM_CREATED"}), {cbid: -2}, {});
                    //}
                }

                sendMessage(connGetter(), "Chat room created", event, {});

                loggedInUsers.push({username: event.body.username, conn: connGetter()});
            } else{
                sendError(connGetter(), "Cannot create chat room.", event);
            }
        });

        console.log("writing: " + post_data);
        req.write(post_data);
        req.end();


    };

    var getVoiceChatRooms = function(conn, event){
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
            return;
        }

        sendMessage(conn, JSON.stringify(voiceChatRooms), event, {});
    };

    var connectToVoiceChatRoom = function(conn, event){
        if (!conn.loggedIn){
            sendError(conn, "Not logged in.", event);
            return;
        }

        var roomName = event.body.name;

        if (roomName === undefined || roomName === null){
            sendError(conn, "Room not specified", event);
            return;
        }

        roomName = roomName.toLowerCase();

        //TODO: Check if user can access room
        //TODO: add separate admin method for moving user; this method assumes user initiated move and pulls username from connection

        if (!voiceChatRooms[roomName]){
            sendError(conn, "Room does not exist.", event);
            return;
        }

        var participants = voiceChatRooms[roomName].participants;
        for (var i = 0; i < participants.length; i++){
            if (participants[i] === conn.username){
                sendError(conn, "Already in room.", event);                
                return;
            }
        }

        //remove from old conversations
        for (var k in voiceChatRooms){
            participants = voiceChatRooms[k].participants;
            for (var l = 0; l < participants.length; l++){
                if (participants[l] === conn.username){
                    participants.splice(l, 1);
                    break;
                }
            }
        }

        participants = voiceChatRooms[roomName].participants;

        participants.push(conn.username);
        for (var j = 0; j < loggedInUsers.length; j++){
            var c = loggedInUsers[j].conn;
            if (conn.username !== loggedInUsers[j].username){
                //room names are implicitly unique
                sendMessage(c, JSON.stringify({data: {username: conn.username, name: roomName}, type: "CONNECT_TO_VOICE_CHAT_ROOM"}), {cbid: -2}, {});
            }
        }

        sendMessage(conn, "Connected to chat room.", event, {});


    };

    actions["LOGIN"] = loginAction;
    actions["REGISTER"] = registerAction;
    actions["GET_LOGGED_IN_USERS"] = getLoggedInUsersAction;
    actions["SEND_MESSAGE"] = sendUserMessage;
    actions["CREATE_CONVERSATION"] = createConversation;
    actions["ADD_USER_TO_CONVERSATION"] = addUserToConversation;
    actions["CREATE_VOICE_CHAT_ROOM"] = createVoiceChatRoom;
    actions["GET_VOICE_CHAT_ROOMS"] = getVoiceChatRooms;
    actions["CONNECT_TO_VOICE_CHAT_ROOM"] = connectToVoiceChatRoom;

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


