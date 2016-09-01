var ws = require("nodejs-websocket");

var conn = ws.connect("ws://localhost:8001", null, function(){console.log("connected to server.")});

var stdin = process.openStdin();

stdin.addListener("data", function(d) {
    // note:  d is an object, and when converted to a string it will
    // end with a linefeed.  so we (rather crudely) account for that  
    // with toString() and then trim() 
    conn.sendText(d);
  });