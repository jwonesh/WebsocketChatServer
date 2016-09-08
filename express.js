var app = require('express')();
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient
var assert = require('assert');

var mongoUrl = 'mongodb://localhost:7999/chatapp';

var insertUsers = function(docs, callback, error, db) {
  // Get the documents collection
    var cb = function(_db){
      var collection = _db.collection('users');
      // Insert some documents
      console.log("attempting to insert: " + JSON.stringify(docs));
      collection.insertMany(docs, function(err, result) {
            if (err !== null){
                error(err);
                console.log("Error inserting: " + JSON.stringify(err));
            } else{
                console.log("Inserted.");
                callback(result);
            }
        //assert.equal(err, null);
        //assert.equal(docs.length, result.result.n);
        //assert.equal(docs.length, result.ops.length);

      });
    };

    if (!!db){
        cb(db);
    } else{
        connect(cb);
    }
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

//app.use(require('morgan')('dev'));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var cookieName = 'chatapp-session';

//app.use(session({
//  name: cookieName,
//  secret: 'kmnrkhwe-r9y2134bvbsdflkfsdnzuighasdf6542368123409uhnsafdbjk12',
//  saveUninitialized: true,
//  resave: true,
//  store: new FileStore()
//}));

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

app.post('/register', function (req, res) {
    var user = req.body;
    var u = {username: user.username, password: user.password, _id: user.username};
    var callback = function(users){
        res.status(200);
        res.send(JSON.stringify({error: 0}));
    };

    var error = function(err){
        res.status(401);
        res.send(JSON.stringify({error: -1}));
    };

    console.log("u: " + JSON.stringify(u));
    insertUsers([u], callback, error, null);
});

var express = app.listen(3000, function () {
  var host = express.address().address;
  var port = express.address().port;
  console.log('Example app listening at http://%s:%s', host, port);
});