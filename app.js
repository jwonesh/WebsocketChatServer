var appjs = require('appjs');

// serve static files from a directory
appjs.serveFilesFrom(__dirname + '/');

// create a window
var window = appjs.createWindow({
  width: 640,
  height: 460,
  alpha: false,
});

// prepare the window when first created
window.on('create', function(){
  console.log("Window Created");
  // window.frame controls the desktop window
  window.frame.show().center();
});